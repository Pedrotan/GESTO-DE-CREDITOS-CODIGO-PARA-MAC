// Auditoria (Parte I): imutabilidade (pela aplicação e na base de dados), detecção de adulteração pela cadeia de
// integridade com alerta crítico, justificações válidas, logins falhados, horário antes/depois, pagamento
// registado e anulado com link e valores, cartões e hora com segundos em Angola. SQLite real com os triggers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const memory = new Map();
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.sessionStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };
globalThis.window = globalThis;

async function loadModules() {
    const outdir = mkdtempSync(path.join(tmpdir(), 'auditoria-'));
    const outfile = path.join(outdir, 'auditoria.mjs');
    await build({
        stdin: {
            contents: `
                export { ServicoAuditoriaAvancada } from '@/servicos/ServicoAuditoriaAvancada';
                export { ServicoAuditoria } from '@/servicos/ServicoAuditoria';
                export { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
                export { ServicoPagamentos } from '@/servicos/ServicoPagamentos';
                export { LEDGER_PROTECTION_SQL } from '@/bibliotecas/esquema-ledger';
                export { auditSqlHash } from '@/bibliotecas/cadeia-auditoria';
                export * as A from '@/bibliotecas/auditoria-analise';
                export * as J from '@/bibliotecas/justificacao';
            `,
            resolveDir: root, loader: 'ts',
        },
        bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
        define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', MODE: 'test', DEV: false, PROD: true }) },
        banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
        loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl' },
        plugins: [{
            name: 'test-db',
            setup(builder) {
                builder.onResolve({ filter: /^@\/bibliotecas\/bd$/ }, () => ({ path: 'test-db', namespace: 'test-db' }));
                builder.onLoad({ filter: /.*/, namespace: 'test-db' }, () => ({ contents: 'export const db = new Proxy({}, { get: (_, key) => globalThis.__testDb[key] });', loader: 'js' }));
                builder.onResolve({ filter: /^@\// }, async args => builder.resolve(path.join(root, 'src', args.path.slice(2)), { kind: args.kind, resolveDir: root }));
            }
        }]
    });
    const module = await import(pathToFileURL(outfile).href);
    rmSync(outdir, { recursive: true, force: true });
    return module;
}

async function createDatabase(M) {
    const { RENDERER_SQL_ALLOWLIST } = await import('../electron/renderer-sql-allowlist.ts');
    const database = new DatabaseSync(':memory:');
    database.function('tango_audit_hash', { varargs: true }, (...args) => M.auditSqlHash(...args));
    for (const sql of RENDERER_SQL_ALLOWLIST) if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) database.exec(sql);
    for (const sql of RENDERER_SQL_ALLOWLIST) if (/^ALTER TABLE \w+ ADD COLUMN/.test(sql)) { try { database.exec(sql); } catch { /* já existe */ } }
    const adapter = readFileSync(path.join(root, 'src/bibliotecas/adaptador-sqlite.ts'), 'utf8');
    for (const [, table, column, , definition] of adapter.matchAll(/safeAddColumn\(\s*["'](\w+)["']\s*,\s*["'](\w+)["']\s*,\s*(["'])(.+?)\3\s*\)/g)) {
        try { database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); } catch { /* tabela ausente ou coluna já existe */ }
    }
    // Protecções do arranque: triggers de imutabilidade e cadeia de integridade da auditoria.
    for (const sql of M.LEDGER_PROTECTION_SQL) { try { database.exec(sql); } catch { /* depende de tabelas não usadas no teste */ } }
    for (const sql of RENDERER_SQL_ALLOWLIST) if (sql.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS idx_payments')) database.exec(sql);
    const params = values => (values || []).map(value => value === undefined ? null : value);
    globalThis.__testDb = {
        all: async (sql, values) => database.prepare(sql).all(...params(values)),
        query: async (sql, values) => database.prepare(sql).all(...params(values)),
        get: async (sql, values) => database.prepare(sql).get(...params(values)),
        run: async (sql, values) => database.prepare(sql).run(...params(values)),
        transaction: async statements => {
            database.exec('BEGIN');
            try {
                for (const statement of statements) {
                    const result = database.prepare(statement.sql).run(...params(statement.params));
                    if (statement.expectChanges !== undefined && Number(result.changes) !== statement.expectChanges) throw new Error('Conflito de concorrência.');
                }
                database.exec('COMMIT');
            } catch (error) { database.exec('ROLLBACK'); throw error; }
        }
    };
    const now = new Date().toISOString();
    database.prepare(`INSERT INTO clients (id, name, createdAt) VALUES ('c1', 'Maria Silva', ?)`).run(now);
    database.prepare(`INSERT INTO users (id, name, email, password, role, createdAt) VALUES ('u1', 'Operador de Caixa', 'u1@example.invalid', 'x', 'cashier', ?)`).run(now);
    database.prepare(`INSERT INTO users (id, name, email, password, role, createdAt) VALUES ('u2', 'Director Geral', 'u2@example.invalid', 'x', 'super_admin', ?)`).run(now);
    database.prepare(`INSERT INTO shared_settings (key, value, updatedAt) VALUES ('accounting_config', '{"cashGuard":false}', ?)`).run(now);
    return database;
}

const director = { id: 'u2', name: 'Director Geral', role: 'super_admin' };
const operator = { id: 'u1', name: 'Operador de Caixa', role: 'cashier' };
const events = (M, rows) => M.A.assignSessions(rows.map(row => M.A.toAuditEvent(row)));

test('I1 · apagar ou editar um registo de auditoria é rejeitado pela aplicação e pela base de dados', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        await M.ServicoAuditoria.addLog('update', 'system', 'Registo de teste', 'u2', 'Director Geral');
        const row = database.prepare('SELECT id FROM audit_logs LIMIT 1').get();
        // Pela aplicação: não há operação de eliminação e o renderer do desktop só aceita SQL registado.
        await assert.rejects(M.ServicoAuditoria.clearAllLogs(), /imutáveis/);
        await assert.rejects(M.ServicoAuditoria.deleteLog(row.id), /imutáveis/);
        const { RENDERER_SQL_ALLOWLIST } = await import('../electron/renderer-sql-allowlist.ts');
        const writes = [...RENDERER_SQL_ALLOWLIST].filter(sql => /^(DELETE FROM|UPDATE) audit_logs\b/i.test(sql));
        assert.deepEqual(writes, [], 'nenhum UPDATE/DELETE de audit_logs pode ser enviado pelo renderer');
        // Directamente na base de dados, com o utilizador da aplicação: os triggers recusam.
        assert.throws(() => database.prepare('DELETE FROM audit_logs WHERE id = ?').run(row.id), /imutáveis/);
        assert.throws(() => database.prepare("UPDATE audit_logs SET details = 'alterado' WHERE id = ?").run(row.id), /imutáveis/);
        assert.throws(() => database.prepare('DELETE FROM audit_log_chain').run(), /imutável/);
        assert.equal(database.prepare('SELECT details FROM audit_logs WHERE id = ?').get(row.id).details, 'Registo de teste');
        console.log('    I1: DELETE e UPDATE recusados (triggers) · 0 comandos de escrita em audit_logs na allowlist · serviço recusa limpar');
    } finally { database.close(); }
});

test('I2 · adulteração directa com acesso de administrador da base é detectada e gera alerta crítico', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        for (let index = 1; index <= 5; index++) await M.ServicoAuditoria.addLog('update', 'client', `Editou o cliente n.º ${index}`, 'u1', 'Operador de Caixa');
        const ok = await M.ServicoAuditoriaAvancada.verifyIntegrity(director);
        assert.equal(ok.ok, true);
        const victim = database.prepare('SELECT a.id, c.seq FROM audit_logs a JOIN audit_log_chain c ON c.auditId = a.id ORDER BY c.seq LIMIT 1 OFFSET 2').get();
        // O administrador da base desliga a protecção e altera um registo antigo.
        database.exec('DROP TRIGGER trg_audit_logs_immutable_update');
        database.prepare("UPDATE audit_logs SET details = 'Registo adulterado' WHERE id = ?").run(victim.id);
        const broken = await M.ServicoAuditoriaAvancada.verifyIntegrity(director);
        assert.equal(broken.ok, false);
        assert.equal(broken.brokenSeq, Number(victim.seq), 'indica o n.º do primeiro registo quebrado');
        const alert = database.prepare("SELECT severity, ruleId, status FROM audit_alerts WHERE ruleId = 'integrity'").get();
        assert.deepEqual({ ...alert }, { severity: 'critical', ruleId: 'integrity', status: 'open' });
        const close = database.prepare('SELECT status, brokenSeq FROM audit_daily_closes ORDER BY day DESC LIMIT 1').get();
        assert.ok(close, 'fecho diário gravado');
        console.log(`    I2: registo n.º ${victim.seq} alterado → verificação «${broken.message}» · alerta crítico aberto`);
    } finally { database.close(); }
});

test('I3 · sobrepor o risco com "gggggggg" é rejeitado; com justificação válida fica Alta e gera alerta', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        assert.match(await M.ServicoAuditoriaAvancada.checkJustification('gggggggg', 'u2'), /20 caracteres/);
        assert.match(M.J.validateJustification('gggggggggggggggggggggggggggggg'), /palavras|repetidos/);
        assert.match(M.J.validateJustification('ok ok ok ok ok ok ok ok'), /palavras|significado|repete/);
        const valid = 'Cliente apresentou garantia hipotecária registada na conservatória em 02/10';
        assert.equal(await M.ServicoAuditoriaAvancada.checkJustification(valid, 'u2'), null);
        await M.ServicoAuditoria.addLog('update', 'system', `Simulador: nível de risco de Maria Silva alterado de Elevado para Baixo. Justificação: ${valid}`,
            'u2', 'Director Geral', { level: 'Elevado' }, { level: 'Baixo' }, { justification: valid, override: true });
        assert.match(await M.ServicoAuditoriaAvancada.checkJustification(valid, 'u2'), /igual a uma que já usou/, 'não pode repetir a mesma justificação');
        const [event] = events(M, await M.ServicoAuditoriaAvancada.loadRows(null));
        assert.deepEqual([event.action, event.severity, event.module], ['override', 'high', 'simulador']);
        assert.deepEqual(event.changes.map(change => `${change.label}: ${change.before} → ${change.after}`), ['Nível de risco: Elevado → Baixo']);
        const alerts = M.A.detectAlerts([event]);
        assert.ok(alerts.some(alert => alert.ruleId === 'risk_lowered'), 'alerta de redução de risco');
        await M.ServicoAuditoriaAvancada.raiseAlerts(alerts);
        assert.equal(database.prepare("SELECT COUNT(*) AS n FROM audit_alerts WHERE ruleId = 'risk_lowered'").get().n, 1);
        console.log('    I3: «gggggggg» rejeitada · justificação válida aceite · gravidade Alta · alerta «Nível de risco reduzido manualmente»');
    } finally { database.close(); }
});

test('I4 · 5 logins falhados seguidos aparecem como "Login falhado" e geram alerta', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        for (let index = 1; index <= 5; index++) await M.ServicoAuditoria.addLog('login_failure', 'user', `Tentativa de login falhada (${index}) para utilizador: Operador de Caixa`, 'u1', 'Operador de Caixa', null, null, { ip: '10.0.0.7' });
        const list = events(M, await M.ServicoAuditoriaAvancada.loadRows(null));
        assert.equal(list.length, 5);
        assert.ok(list.every(event => M.A.ACTION_LABELS[event.action] === 'Login falhado' && event.result === 'failed'));
        const alerts = M.A.detectAlerts(list);
        const failed = alerts.find(alert => alert.ruleId === 'failed_logins');
        assert.ok(failed);
        assert.equal(failed.eventIds.length, 5);
        assert.equal(M.A.auditKpis(list).loginFailed, 5);
        console.log(`    I4: 5 × «Login falhado» · alerta «${failed.title}» (${failed.severity})`);
    } finally { database.close(); }
});

test('I5 · alterar o horário de acesso: o detalhe mostra o horário anterior e o novo', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        const week = (start, end) => [0, 1, 2, 3, 4, 5, 6].map(day => ({ allowed: day >= 1 && day <= 5, start, end }));
        await M.ServicoAuditoria.addLog('update', 'system', 'Atualizou o horário de acesso ao sistema', 'u2', 'Director Geral',
            { enabled: true, days: week('07:00', '19:00') }, { enabled: true, days: week('06:00', '22:00') }, { area: 'horario_acesso' });
        const [event] = events(M, await M.ServicoAuditoriaAvancada.loadRows(null));
        assert.equal(event.module, 'configuracoes');
        assert.equal(event.action, 'settings_change');
        const change = event.changes.find(item => item.field === 'days');
        assert.equal(change.label, 'Horário de acesso');
        assert.equal(change.before, 'Seg–Sex 07:00–19:00; Sáb–Dom sem acesso');
        assert.equal(change.after, 'Seg–Sex 06:00–22:00; Sáb–Dom sem acesso');
        console.log(`    I5: Horário de acesso: ${change.before} → ${change.after}`);
    } finally { database.close(); }
});

test('I6 · registar e anular um pagamento: ambos aparecem, com link para o pagamento e valores antes/depois', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        const credit = { id: 'cr-a', clientId: 'c1', clientName: 'Maria Silva', principalAmount: 100_000, interestRate: 10, lateInterestRate: 0, installments: 1,
            paidInstallments: 0, currentBalance: 100_000, accruedInterest: 10_000, lateInterest: 0, totalDue: 110_000, startDate: new Date('2026-09-01T12:00:00Z'),
            dueDate: new Date('2026-10-01T12:00:00Z'), createdAt: new Date('2026-09-01T12:00:00Z'), status: 'active', amortizationMethod: 'FLAT', daysOverdue: 0, creditNumber: 1 };
        await M.ServicoFinanceiro.addCredit(credit);
        const payment = M.ServicoPagamentos.buildPayment({ creditId: 'cr-a', valueDateKey: '2026-10-05', amount: 30_000, method: 'cash' },
            { id: 'pag-audit', idempotencyKey: 'key-pag-audit', clientName: 'Maria Silva', actor: operator });
        await M.ServicoFinanceiro.addPaymentAndUpdateCredit(payment, 0, 'c1');
        await M.ServicoPagamentos.cancel('pag-audit', 'Pagamento lançado no contrato errado pelo operador', director);
        const list = events(M, await M.ServicoAuditoriaAvancada.loadRows(null)).filter(event => event.module === 'pagamentos');
        const created = list.find(event => event.action === 'create');
        const cancelled = list.find(event => event.action === 'cancel');
        assert.ok(created && cancelled, 'registo e anulação na auditoria');
        for (const event of [created, cancelled]) {
            assert.equal(event.entity.type, 'payment');
            assert.match(event.entity.link, /^\/pagamentos\?search=RC%202026%2F000001$/);
        }
        const value = (event, label) => event.changes.find(change => change.label === label);
        assert.equal(value(created, 'Estado').after, 'Confirmado');
        assert.match(value(created, 'Valor').after, /^30\D000,00 Kz$/);
        assert.equal(value(cancelled, 'Estado').before, 'Confirmado');
        assert.equal(value(cancelled, 'Estado').after, 'Anulado');
        assert.ok(value(cancelled, 'Saldo em dívida'), 'o saldo antes e depois da anulação aparece');
        assert.deepEqual([cancelled.severity, cancelled.justification], ['high', 'Pagamento lançado no contrato errado pelo operador']);
        console.log(`    I6: «${created.summary}» e «${cancelled.summary}» · link ${created.entity.link} · Estado ${value(cancelled, 'Estado').before} → ${value(cancelled, 'Estado').after} · Saldo ${value(cancelled, 'Saldo em dívida').before} → ${value(cancelled, 'Saldo em dívida').after}`);
    } finally { database.close(); }
});

test('I7 · os cartões somam corretamente e a hora aparece com segundos em hora de Angola', async () => {
    const M = await loadModules();
    assert.equal(M.A.formatAuditTimestamp('2026-10-06T19:19:14.000Z'), '06/10/2026 20:19:14');
    assert.equal(M.A.formatAuditTimestamp('2026-10-31T23:30:05.000Z'), '01/11/2026 00:30:05');
    const row = (id, action, details, extra = {}) => ({ id, timestamp: '2026-10-06T10:00:00.000Z', userId: extra.userId || 'u1', userName: extra.userName || 'Operador', action, entity: extra.entity || 'system', details, metadata: JSON.stringify(extra.meta || {}) });
    const list = events(M, [
        row('1', 'login', 'Login efetuado'), row('2', 'login_failure', 'Tentativa falhada'), row('3', 'security_alert', 'Acesso negado ao módulo', { meta: { result: 'denied' } }),
        row('4', 'update', 'Reabertura do período 2026-09. Justificação: fecho com erro de lançamento', { meta: { periodId: '2026-09', reason: 'fecho com erro' } }),
        row('5', 'delete', 'Anulação e estorno do pagamento RC 2026/000001', { entity: 'payment', meta: { paymentId: 'p1' } }),
        row('6', 'create', 'Criou o cliente', { entity: 'client', userId: 'u2', userName: 'Gestor' }),
    ]);
    const kpis = M.A.auditKpis(list, '2026-10-06');
    assert.deepEqual(kpis, { total: 6, criticalHigh: 2, loginFailed: 1, accessDenied: 1, activeUsersToday: 2 });
    const bySeverity = M.A.SEVERITY_ORDER.map(level => list.filter(event => event.severity === level).length);
    assert.equal(bySeverity.reduce((a, b) => a + b, 0), kpis.total, 'a soma por gravidade é igual ao total');
    const modules = M.A.byModuleAndSeverity(list);
    assert.equal(modules.reduce((sum, item) => sum + item.total, 0), kpis.total, 'a soma por módulo é igual ao total');
    assert.ok(list.every(event => event.module !== 'sistema'), 'sem a entidade genérica "Sistema"');
    console.log(`    I7: ${JSON.stringify(kpis)} · 06/10/2026 20:19:14 (Luanda)`);
});
