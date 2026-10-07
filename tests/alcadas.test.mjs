// Alçadas (Parte J): concorrência com guarda na base de dados, dupla aprovação acima do nível máximo,
// coerência dos limites, desativação com segundo administrador e auditoria, exceções temporárias que
// terminam sozinhas, reinício dos contadores às 00:00 de Angola e cliente de risco Alto para o Diretor.
// SQLite real com o esquema, os triggers e os serviços da aplicação.
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

let modules;
async function loadModules() {
    if (modules) return modules;
    const outdir = mkdtempSync(path.join(tmpdir(), 'alcadas-'));
    const outfile = path.join(outdir, 'alcadas.mjs');
    await build({
        stdin: {
            contents: `
                export { ServicoAlcadas } from '@/servicos/ServicoAlcadas';
                export { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
                export { LEDGER_PROTECTION_SQL } from '@/bibliotecas/esquema-ledger';
                export { auditSqlHash } from '@/bibliotecas/cadeia-auditoria';
                export * as L from '@/bibliotecas/alcadas';
                export * as A from '@/bibliotecas/auditoria-analise';
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
    modules = await import(pathToFileURL(outfile).href);
    rmSync(outdir, { recursive: true, force: true });
    return modules;
}

const USERS = {
    gestor: { id: 'u-gestor', name: 'Ana Gestora', role: 'manager' },
    admin: { id: 'u-admin', name: 'Bruno Administrador', role: 'admin' },
    admin2: { id: 'u-admin2', name: 'Carla Administradora', role: 'admin' },
    diretor: { id: 'u-diretor', name: 'Diogo Diretor', role: 'credit_director' },
    superAdmin: { id: 'u-super', name: 'Eva Super Administradora', role: 'super_admin' },
};

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
    for (const sql of M.LEDGER_PROTECTION_SQL) { try { database.exec(sql); } catch { /* depende de tabelas não usadas no teste */ } }
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
    for (const user of Object.values(USERS)) {
        database.prepare(`INSERT INTO users (id, name, email, password, role, createdAt) VALUES (?, ?, ?, 'x', ?, ?)`).run(user.id, user.name, `${user.id}@example.invalid`, user.role, now);
    }
    database.prepare(`INSERT INTO clients (id, name, riskLevel, status, createdAt) VALUES ('c-baixo', 'Cliente Risco Baixo', 'low', 'active', ?)`).run(now);
    database.prepare(`INSERT INTO clients (id, name, riskLevel, status, createdAt) VALUES ('c-alto', 'Cliente Risco Alto', 'high', 'active', ?)`).run(now);
    database.prepare(`INSERT INTO shared_settings (key, value, updatedAt) VALUES ('accounting_config', '{"cashGuard":false}', ?)`).run(now);
    return database;
}

const credit = (id, clientId, amount, status = 'active') => {
    const start = new Date();
    const due = new Date(start.getTime() + 30 * 86_400_000);
    return {
        id, clientId, clientName: clientId === 'c-alto' ? 'Cliente Risco Alto' : 'Cliente Risco Baixo', principalAmount: amount, currentBalance: amount,
        interestRate: 10, lateInterestRate: 1, installments: 1, paidInstallments: 0, startDate: start, dueDate: due, status,
        daysOverdue: 0, accruedInterest: amount * 0.1, lateInterest: 0, totalDue: amount * 1.1, createdAt: start, creditNumber: 1, requestedBy: 'Teste', requestedAt: start,
    };
};
const JUSTIFICATION = 'Ajuste aprovado pela comissão executiva na reunião mensal de risco';

test('J1 · Gestor com 500 000 Kz restantes submete dois créditos de 300 000 Kz ao mesmo tempo: só um passa, o outro é escalado', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        const { day, month } = M.L.periodKeys();
        // Consumo já registado hoje: 1 500 000 Kz de 2 000 000 Kz (restam 500 000 Kz).
        for (const type of ['credit_approval', 'disbursement']) {
            database.prepare(`INSERT INTO limit_ledger (id, operationType, userId, userName, profileId, branchId, amountMinor, count, dayKey, monthKey, entityType, entityId, createdAt)
                VALUES (?, ?, ?, ?, 'manager', '', ?, 1, ?, ?, 'credit', 'anterior', ?)`).run(`seed-${type}`, type, USERS.gestor.id, USERS.gestor.name, 150_000_000, day, month, new Date().toISOString());
        }
        const before = M.L.evaluateOperation({ policy: (await M.ServicoAlcadas.current()).policy, actor: USERS.gestor, operationType: 'credit_approval', amountMinor: 30_000_000,
            usage: await M.ServicoAlcadas.usageFor((await M.ServicoAlcadas.current()).policy, USERS.gestor, 'credit_approval', []) });
        assert.equal(before.decision, 'allow', 'cada crédito isolado cabe nos 500 000 Kz restantes');
        assert.equal(before.remaining.dailyMinor, 50_000_000);
        const [first, second] = await Promise.all([
            M.ServicoFinanceiro.addCredit(credit('CR-J1-A', 'c-baixo', 300_000), USERS.gestor),
            M.ServicoFinanceiro.addCredit(credit('CR-J1-B', 'c-baixo', 300_000), USERS.gestor),
        ]);
        const statuses = [first.status, second.status].sort();
        assert.deepEqual(statuses, ['active', 'pending_approval'], 'um passa e o outro sobe na cadeia');
        const escalated = first.status === 'pending_approval' ? first : second;
        const escalation = database.prepare(`SELECT * FROM limit_escalations WHERE entityId = ?`).get(escalated.id);
        assert.ok(escalation, 'o pedido escalado fica na fila');
        assert.match(escalation.reason, /^Acima da alçada de Ana Gestora \(Gestor\) — requer Administrador$/);
        const used = database.prepare(`SELECT SUM(amountMinor) AS total FROM limit_ledger WHERE userId = ? AND operationType = 'credit_approval' AND dayKey = ?`).get(USERS.gestor.id, day).total;
        assert.equal(used, 180_000_000, 'consumo do dia: 1 800 000 Kz (nunca acima de 2 000 000 Kz)');
        console.log(`    J1: ${first.id} → ${first.status} · ${second.id} → ${second.status} · motivo: "${escalation.reason}" · consumo do dia 1 800 000,00 Kz de 2 000 000,00 Kz`);
    } finally { database.close(); }
});

test('J2 · Crédito de 8 000 000 Kz exige dupla aprovação do nível máximo', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        const saved = await M.ServicoFinanceiro.addCredit(credit('CR-J2', 'c-baixo', 8_000_000), USERS.admin);
        assert.equal(saved.status, 'pending_approval');
        const escalation = database.prepare(`SELECT * FROM limit_escalations WHERE entityId = 'CR-J2'`).get();
        assert.equal(escalation.dual, 1);
        assert.equal(escalation.requiredLevelName, 'Dupla aprovação (Diretor)');
        const load = async () => (await M.ServicoFinanceiro.getAllCredits()).find(item => item.id === 'CR-J2');
        const decide = async (user) => M.ServicoFinanceiro.decideCredit({ credit: await load(), decision: 'approved', actorId: user.id, actorName: user.name, notes: 'Aprovado em comité', notificationId: crypto.randomUUID(), auditId: crypto.randomUUID() });
        await assert.rejects(decide(USERS.admin2), /alçada .*não chega.*requer Dupla aprovação/);
        const firstApproval = await decide(USERS.diretor);
        assert.equal(firstApproval.final, false, 'a primeira aprovação não basta');
        assert.equal((await load()).status, 'pending_approval');
        await assert.rejects(decide(USERS.diretor), /Já aprovou/);
        const secondApproval = await decide(USERS.superAdmin);
        assert.equal(secondApproval.final, true);
        assert.equal((await load()).status, 'active');
        const approvals = database.prepare(`SELECT approverName FROM limit_escalation_approvals WHERE escalationId = ? ORDER BY decidedAt`).all(escalation.id).map(row => row.approverName);
        assert.deepEqual(approvals, ['Diogo Diretor', 'Eva Super Administradora']);
        // A base de dados impede quem pediu de aprovar.
        assert.throws(() => database.prepare(`INSERT INTO limit_escalation_approvals (id, escalationId, approverId, approverName, decision, decidedAt) VALUES ('x', ?, ?, 'x', 'approved', ?)`).run(escalation.id, USERS.admin.id, new Date().toISOString()), /Quem pediu/);
        console.log(`    J2: 8 000 000 Kz → ${escalation.requiredLevelName} · Administradora recusada · 1.ª aprovação (Diretor) → pendente · 2.ª (Super Administradora) → activo`);
    } finally { database.close(); }
});

test('J3 · Gravar um limite por operação maior do que o diário é bloqueado com mensagem clara', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        const { policy } = await M.ServicoAlcadas.current();
        const changed = M.L.clonePolicy(policy);
        changed.profiles.manager.ops.credit_approval.perOperationMinor = 300_000_000;
        const issues = M.L.validatePolicy(changed, id => ({ manager: 'Gestor de Crédito' }[id] || id));
        assert.ok(issues.length > 0);
        assert.match(issues[0].message, /Gestor de Crédito — Aprovação de crédito: o limite por operação \(3 000 000,00 Kz\) não pode ser maior do que o volume diário \(2 000 000,00 Kz\)\./);
        await assert.rejects(M.ServicoAlcadas.propose({ policy: changed, reason: JUSTIFICATION, actor: USERS.admin, profileName: id => ({ manager: 'Gestor de Crédito' }[id] || id) }),
            /o limite por operação \(3 000 000,00 Kz\) não pode ser maior do que o volume diário/);
        assert.equal(database.prepare('SELECT COUNT(*) AS n FROM limit_policy_versions').get().n, 0, 'nada foi gravado');
        // Um nível inferior não pode ter limites maiores do que o nível superior.
        const inverted = M.L.clonePolicy(policy);
        inverted.profiles.manager.ops.credit_approval = { ...inverted.profiles.manager.ops.credit_approval, perOperationMinor: 150_000_000, dailyMinor: 600_000_000, monthlyMinor: 1_000_000_000 };
        assert.ok(M.L.validatePolicy(inverted).some(issue => /maior do que em admin/.test(issue.message)));
        console.log(`    J3: "${issues[0].message}"`);
    } finally { database.close(); }
});

test('J4 · Desativar o limite dos Administradores fica pendente até um segundo administrador aprovar e aparece na Auditoria', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        const { policy } = await M.ServicoAlcadas.current();
        const changed = M.L.clonePolicy(policy);
        changed.profiles.admin.enabled = false;
        const proposal = await M.ServicoAlcadas.propose({ policy: changed, reason: JUSTIFICATION, actor: USERS.admin });
        assert.equal(proposal.status, 'pending');
        assert.ok(proposal.second.reasons.some(reason => /desativação/.test(reason)));
        assert.equal((await M.ServicoAlcadas.current()).policy.profiles.admin.enabled, true, 'continua activo enquanto pendente');
        const audit = database.prepare(`SELECT * FROM audit_logs WHERE details LIKE 'Limites de transação:%'`).get();
        assert.ok(audit, 'a proposta aparece na auditoria');
        assert.equal(M.A.toAuditEvent(audit).severity, 'high', 'com gravidade Alta');
        await assert.rejects(M.ServicoAlcadas.decideVersion(proposal.id, true, JUSTIFICATION + ' confirmada', USERS.admin), /segundo administrador/);
        assert.throws(() => database.prepare(`UPDATE limit_policy_versions SET status = 'approved', decidedBy = createdBy WHERE id = ?`).run(proposal.id), /segundo administrador/);
        await M.ServicoAlcadas.decideVersion(proposal.id, true, 'Desativação temporária confirmada pela administração', USERS.admin2);
        assert.equal((await M.ServicoAlcadas.current()).policy.profiles.admin.enabled, false);
        const decision = database.prepare(`SELECT * FROM audit_logs WHERE details LIKE '%aprovada pelo segundo administrador%'`).get();
        assert.equal(M.A.toAuditEvent(decision).severity, 'high');
        assert.throws(() => database.prepare(`DELETE FROM limit_policy_versions`).run(), /não podem ser apagadas/);
        console.log(`    J4: proposta → pendente · auto-aprovação recusada (serviço e trigger) · aprovada por ${USERS.admin2.name} · 2 registos de gravidade Alta na Auditoria`);
    } finally { database.close(); }
});

test('J5 · Uma exceção temporária termina na data definida e o limite normal volta a aplicar-se', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        const now = Date.now();
        const endsAt = new Date(now + 3_600_000).toISOString();
        const id = await M.ServicoAlcadas.requestException({ userId: USERS.gestor.id, userName: USERS.gestor.name, operationType: 'credit_approval',
            perOperationMinor: 90_000_000, dailyMinor: null, monthlyMinor: null, dailyCount: null, startsAt: new Date(now - 60_000).toISOString(), endsAt,
            reason: 'Substituição da colega de férias durante a campanha de outubro' }, USERS.admin);
        await assert.rejects(M.ServicoAlcadas.decideException(id, true, 'Aprovada pela administração para a campanha', USERS.admin), /outro administrador/);
        await M.ServicoAlcadas.decideException(id, true, 'Aprovada pela administração para a campanha', USERS.admin2);
        const { policy } = await M.ServicoAlcadas.current();
        const exceptions = await M.ServicoAlcadas.exceptions();
        const usage = { scope: M.L.EMPTY_USAGE, company: M.L.EMPTY_USAGE };
        const during = M.L.evaluateOperation({ policy, actor: USERS.gestor, operationType: 'credit_approval', amountMinor: 70_000_000, usage, exceptions, now: new Date(now) });
        assert.equal(during.limit.source, 'temporaria');
        assert.equal(during.limit.perOperationMinor, 90_000_000);
        assert.equal(during.decision, 'allow', '700 000 Kz cabe na exceção');
        const after = new Date(new Date(endsAt).getTime() + 1000);
        const later = M.L.evaluateOperation({ policy, actor: USERS.gestor, operationType: 'credit_approval', amountMinor: 70_000_000, usage, exceptions, now: after });
        assert.equal(later.limit.source, 'perfil');
        assert.equal(later.limit.perOperationMinor, 50_000_000);
        assert.equal(later.decision, 'escalate', 'depois do fim volta o limite normal de 500 000 Kz');
        await M.ServicoAlcadas.processTimers(after);
        const notices = database.prepare(`SELECT userId, title FROM notifications WHERE id LIKE 'limit-exception-expired:%' ORDER BY userId`).all();
        assert.deepEqual(notices.map(row => row.userId).sort(), [USERS.admin.id, USERS.admin2.id, USERS.gestor.id].sort());
        console.log(`    J5: exceção de ${M.L.formatKz(90_000_000)} por operação até ${new Date(endsAt).toISOString()} · durante → ${during.decision} · depois → ${later.decision} (limite ${M.L.formatKz(later.limit.perOperationMinor)}) · ${notices.length} notificações de fim`);
    } finally { database.close(); }
});

test('J6 · O contador diário reinicia às 00:00 de Angola (não à 01:00 nem às 23:00)', async () => {
    const M = await loadModules();
    const keys = iso => M.L.periodKeys(new Date(iso));
    assert.equal(keys('2026-10-06T21:59:59.999Z').day, '2026-10-06', '22:59 em Luanda: ainda é dia 6 (não reinicia às 23:00)');
    assert.equal(keys('2026-10-06T22:59:59.999Z').day, '2026-10-06', '23:59:59 em Luanda: ainda é dia 6');
    assert.equal(keys('2026-10-06T23:00:00.000Z').day, '2026-10-07', '00:00 em Luanda: novo dia');
    assert.equal(keys('2026-10-06T23:59:59.000Z').day, '2026-10-07', '00:59 em Luanda já é dia 7 (não espera pela 01:00)');
    assert.equal(keys('2026-10-31T23:00:00.000Z').month, '2026-11', 'o mensal reinicia no dia 1 às 00:00 de Angola');
    assert.equal(keys('2026-10-31T22:59:59.000Z').month, '2026-10');
    assert.equal(M.L.nextResets(new Date('2026-10-06T12:00:00Z')).daily.toISOString(), '2026-10-06T23:00:00.000Z');
    assert.equal(M.L.nextResets(new Date('2026-10-06T12:00:00Z')).monthly.toISOString(), '2026-10-31T23:00:00.000Z');
    const rows = [{ operationType: 'credit_approval', userId: 'u', profileId: 'manager', branchId: '', amountMinor: 100, count: 1, dayKey: '2026-10-06', monthKey: '2026-10' }];
    assert.equal(M.L.sumUsage(rows, 'credit_approval', 'user', 'u', new Date('2026-10-06T22:59:59Z')).dayMinor, 100);
    assert.equal(M.L.sumUsage(rows, 'credit_approval', 'user', 'u', new Date('2026-10-06T23:00:00Z')).dayMinor, 0);
    assert.equal(M.L.sumUsage(rows, 'credit_approval', 'user', 'u', new Date('2026-10-06T23:00:00Z')).monthMinor, 100, 'o mensal mantém-se');
    console.log('    J6: 22:59:59 (Luanda) → dia 06 · 23:59:59 → dia 06 · 00:00:00 → dia 07 · próximo reinício 06/10 23:00 UTC = 00:00 de Angola');
});

test('J7 · Cliente de risco Alto com crédito de 100 000 Kz vai para o Diretor apesar do valor baixo', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        const saved = await M.ServicoFinanceiro.addCredit(credit('CR-J7', 'c-alto', 100_000), USERS.gestor);
        assert.equal(saved.status, 'pending_approval');
        const escalation = database.prepare(`SELECT * FROM limit_escalations WHERE entityId = 'CR-J7'`).get();
        assert.equal(escalation.requiredLevelName, 'Diretor');
        assert.match(escalation.reason, /requer Diretor/);
        assert.ok(JSON.parse(escalation.details).some(reason => /risco Alto/.test(reason)));
        const load = async () => (await M.ServicoFinanceiro.getAllCredits()).find(item => item.id === 'CR-J7');
        const decide = async (user) => M.ServicoFinanceiro.decideCredit({ credit: await load(), decision: 'approved', actorId: user.id, actorName: user.name, notificationId: crypto.randomUUID(), auditId: crypto.randomUUID() });
        await assert.rejects(decide(USERS.admin), /requer Diretor/);
        const decision = await decide(USERS.diretor);
        assert.equal(decision.final, true);
        assert.equal((await load()).status, 'active');
        // O mesmo valor num cliente de risco Baixo fica na alçada da Gestora.
        const low = await M.ServicoFinanceiro.addCredit(credit('CR-J7-B', 'c-baixo', 100_000), USERS.gestor);
        assert.equal(low.status, 'active');
        console.log(`    J7: 100 000 Kz, risco Alto → "${escalation.reason}" · Administrador recusado · Diretor aprovou · mesmo valor, risco Baixo → ${low.status}`);
    } finally { database.close(); }
});
