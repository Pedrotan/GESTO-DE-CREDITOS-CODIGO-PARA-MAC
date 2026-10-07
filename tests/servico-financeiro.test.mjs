// Integração do ServicoFinanceiro com SQLite real: os saldos têm de vir da base de dados,
// nunca de valores enviados pela interface.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');

async function loadService(serviceName = 'ServicoFinanceiro') {
    const outdir = mkdtempSync(path.join(tmpdir(), 'servico-financeiro-'));
    const outfile = path.join(outdir, 'servico.mjs');
    await build({
        entryPoints: [path.join(root, 'src/servicos/' + serviceName + '.ts')],
        bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
        plugins: [{
            name: 'test-db',
            setup(builder) {
                builder.onResolve({ filter: /^@\/bibliotecas\/bd$/ }, () => ({ path: 'test-db', namespace: 'test-db' }));
                builder.onLoad({ filter: /.*/, namespace: 'test-db' }, () => ({
                    contents: 'export const db = new Proxy({}, { get: (_, key) => globalThis.__testDb[key] });', loader: 'js'
                }));
                builder.onResolve({ filter: /^@\// }, async args => builder.resolve(
                    path.join(root, 'src', args.path.slice(2)), { kind: args.kind, resolveDir: root }));
            }
        }]
    });
    const module = await import(pathToFileURL(outfile).href);
    rmSync(outdir, { recursive: true, force: true });
    return module[serviceName];
}

async function createDatabase() {
    const { RENDERER_SQL_ALLOWLIST } = await import('../electron/renderer-sql-allowlist.ts');
    const database = new DatabaseSync(':memory:');
    for (const sql of RENDERER_SQL_ALLOWLIST) {
        if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) database.exec(sql);
    }
    for (const sql of RENDERER_SQL_ALLOWLIST) {
        if (/^ALTER TABLE \w+ ADD COLUMN/.test(sql)) { try { database.exec(sql); } catch { /* coluna já existe */ } }
    }
    // Aplica as mesmas migrações de colunas que o adaptador SQLite executa no arranque.
    const adapter = readFileSync(path.join(root, 'src/bibliotecas/adaptador-sqlite.ts'), 'utf8');
    for (const [, table, column, , definition] of adapter.matchAll(/safeAddColumn\(\s*["'](\w+)["']\s*,\s*["'](\w+)["']\s*,\s*(["'])(.+?)\3\s*\)/g)) {
        try { database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); } catch { /* tabela ausente ou coluna já existe */ }
    }
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
                    if (statement.expectChanges !== undefined && Number(result.changes) !== statement.expectChanges) {
                        throw new Error(`Conflito de concorrência: esperadas ${statement.expectChanges} alterações.`);
                    }
                }
                database.exec('COMMIT');
            } catch (error) {
                database.exec('ROLLBACK');
                throw error;
            }
        }
    };
    database.prepare(`INSERT INTO clients (id, name, createdAt) VALUES ('c1', 'Cliente', ?)`).run(new Date().toISOString());
    // Estes testes cobrem saldos e pagamentos; o bloqueio de desembolso sem saldo é testado à parte.
    database.prepare(`INSERT INTO shared_settings (key, value, updatedAt) VALUES ('accounting_config', '{"cashGuard":false}', ?)`).run(new Date().toISOString());
    return database;
}

const credit = {
    id: 'cr1', clientId: 'c1', clientName: 'Cliente', principalAmount: 1200, interestRate: 10, lateInterestRate: 0,
    installments: 3, paidInstallments: 0, currentBalance: 1200, accruedInterest: 300, lateInterest: 0, totalDue: 1500,
    startDate: new Date('2026-01-01'), dueDate: new Date('2026-04-01'), createdAt: new Date('2026-01-01'),
    status: 'active', amortizationMethod: 'FLAT', daysOverdue: 0, creditNumber: 1, requestedBy: 'u1'
};

const payment = (id, amount, extra = {}) => ({
    id, creditId: 'cr1', clientName: 'Cliente', amount, paymentDate: new Date('2026-02-01'), method: 'cash',
    reference: id, allocatedToPrincipal: 0, allocatedToInterest: 0, allocatedToLateInterest: 0,
    processedBy: 'Operador', status: 'confirmed', usuario_id: 'u1', ...extra
});

const stored = database => database.prepare(`SELECT currentBalanceMinor, accruedInterestMinor, lateInterestMinor,
    totalDueMinor, status, version, paidInstallments FROM credits WHERE id = 'cr1'`).get();

test('pagamento ignora saldos enviados pela interface e grava os calculados da base de dados', async () => {
    const ServicoFinanceiro = await loadService();
    const database = await createDatabase();
    await ServicoFinanceiro.addCredit(credit);

    // A interface tenta impor alocações e saldos falsos; o serviço recalcula tudo.
    const result = await ServicoFinanceiro.addPaymentAndUpdateCredit(
        payment('p1', 400, { allocatedToPrincipal: 400, currentBalance: 0 }), 0, 'c1');
    assert.deepEqual([result.payment.allocatedToInterest, result.payment.allocatedToPrincipal], [100, 300]);
    assert.deepEqual({ ...stored(database) }, {
        currentBalanceMinor: 90_000, accruedInterestMinor: 20_000, lateInterestMinor: 0,
        totalDueMinor: 110_000, status: 'active', version: 1, paidInstallments: 0
    });
    assert.equal(result.creditState.currentBalance, 900);
    assert.equal(result.creditState.version, 1);

    // Segundo pagamento livre: o juro já liquidado não é descontado outra vez.
    const second = await ServicoFinanceiro.addPaymentAndUpdateCredit(payment('p2', 100), 1, 'c1');
    assert.deepEqual([second.payment.allocatedToInterest, second.payment.allocatedToPrincipal], [0, 100]);
    assert.equal(stored(database).currentBalanceMinor, 80_000);
});

test('versão desatualizada e pagamento acima da dívida são recusados sem alterar a base', async () => {
    const ServicoFinanceiro = await loadService();
    const database = await createDatabase();
    await ServicoFinanceiro.addCredit(credit);
    await ServicoFinanceiro.addPaymentAndUpdateCredit(payment('p1', 100), 0, 'c1');

    await assert.rejects(ServicoFinanceiro.addPaymentAndUpdateCredit(payment('p2', 100), 0, 'c1'), /alterado por outra operação/);
    await assert.rejects(ServicoFinanceiro.addPaymentAndUpdateCredit(payment('p3', 1400.01), 1, 'c1'), /excede o total em dívida/);
    assert.equal(stored(database).totalDueMinor, 140_000);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM payments').get().n, 1);
});

test('liquidação total e anulação mantêm saldo, estado e contrato coerentes; o anulado não é apagado', async () => {
    const ServicoFinanceiro = await loadService();
    const database = await createDatabase();
    await ServicoFinanceiro.addCredit(credit);
    const paid = await ServicoFinanceiro.addPaymentAndUpdateCredit(payment('p1', 1500), 0, 'c1');
    assert.equal(paid.creditState.status, 'paid');
    assert.equal(stored(database).paidInstallments, 3);
    assert.equal(database.prepare(`SELECT status FROM contracts WHERE id = 'cr1'`).get().status, 'paid');

    const current = { ...credit, version: 1, status: 'paid' };
    const reversed = await ServicoFinanceiro.reversePaymentAndUpdateCredit(paid.payment, current, 'u2', 'Pagamento duplicado');
    assert.deepEqual([reversed.creditState.totalDue, reversed.creditState.status], [1500, 'active']);
    assert.equal(database.prepare(`SELECT status FROM contracts WHERE id = 'cr1'`).get().status, 'active');

    // Nada é apagado: o pagamento fica "Anulado", com o mesmo número de recibo e o motivo.
    const row = database.prepare(`SELECT status, deletedAt, receiptYear, receiptSeq, cancelReason, cancelledBy FROM payments WHERE id = 'p1'`).get();
    assert.deepEqual([row.status, row.deletedAt, row.receiptSeq, row.cancelReason], ['cancelled', null, 1, 'Pagamento duplicado']);
    assert.ok(row.receiptYear >= 2026);
    // Um pagamento anulado não volta: a reposição só existe para registos antigos enviados para a lixeira.
    await assert.rejects(ServicoFinanceiro.restorePaymentAndUpdateCredit(paid.payment, { ...current, version: 2, status: 'active' }, 'u2'));
    assert.deepEqual({ ...stored(database) }, {
        currentBalanceMinor: 120_000, accruedInterestMinor: 30_000, lateInterestMinor: 0,
        totalDueMinor: 150_000, status: 'active', version: 2, paidInstallments: 0
    });
});

test('reforço soma ao saldo persistido e não ao enviado pela interface', async () => {
    const ServicoFinanceiro = await loadService();
    const database = await createDatabase();
    await ServicoFinanceiro.addCredit(credit);
    await ServicoFinanceiro.reinforceCredit({
        idempotencyKey: 'reforco-0001', credit: { ...credit, currentBalance: 1, totalDue: 1, version: 0 },
        amount: 300, interestAmount: 30, processedBy: 'Operador', userId: 'u1'
    });
    const row = database.prepare(`SELECT principalAmountMinor, currentBalanceMinor, accruedInterestMinor, totalDueMinor,
        reinforcedAmount FROM credits WHERE id = 'cr1'`).get();
    assert.deepEqual({ ...row }, {
        principalAmountMinor: 150_000, currentBalanceMinor: 150_000, accruedInterestMinor: 33_000,
        totalDueMinor: 183_000, reinforcedAmount: 300
    });
});

test('juros já reconhecidos são liquidados sem reconhecer receita duas vezes e o estorno repõe as contas originais', async () => {
    const service = await loadService();
    const database = await createDatabase();
    await service.addCredit(credit);
    await service.adjustCreditCharges({ credit: {...credit,version:0}, accruedInterest:400, lateInterest:0,
        reason:'Ajuste de juros validado',actorId:'u1',actorName:'Operador',idempotencyKey:'test-accrual-001' });
    const result = await service.addPaymentAndUpdateCredit(payment('p-accrual',1600,{method:'transfer'}),1,'c1');
    const lines = database.prepare("SELECT account, side, amountMinor FROM ledger_lines WHERE transactionId = 'payment:p-accrual'").all();
    assert.equal(lines.find(l=>l.account==='bank')?.amountMinor,160000);
    assert.equal(lines.find(l=>l.account==='receivable_interest')?.amountMinor,10000);
    assert.equal(lines.find(l=>l.account==='revenue_interest')?.amountMinor,30000);
    const revenue=()=>database.prepare("SELECT SUM(CASE WHEN side='credit' THEN amountMinor ELSE -amountMinor END) AS total FROM ledger_lines WHERE account='revenue_interest'").get().total;
    assert.equal(revenue(),40000);
    await service.reversePaymentAndUpdateCredit(result.payment,{...credit,...result.creditState},'u1','Estorno autorizado para teste');
    assert.equal(revenue(),10000);
});
test('abate e aprovação são atómicos, mantêm dívida para cobrança e recuperação não reduz carteira', async () => {
    const service = await loadService();
    const database = await createDatabase();
    try {
        await service.addCredit({...credit,status:'overdue'});
        database.prepare(`INSERT INTO accounting_requests(id,kind,targetId,reason,requestedBy,requestedById,requestedAt,status)
            VALUES ('wr','writeoff','cr1','Incobrável documentado','Solicitante','u1',?,'pending')`).run(new Date().toISOString());
        const input={creditId:'cr1',reason:'Incobrável documentado',requestedBy:'Solicitante',requestedById:'u1',approvedBy:'Administrador',approvedById:'u2',requestId:'wr'};
        await assert.rejects(service.writeOffCredit({...input,approvedById:'u1'}),/diferente/);
        database.exec(`CREATE TRIGGER fail_writeoff_request BEFORE UPDATE ON accounting_requests BEGIN SELECT RAISE(ABORT,'falha decisão'); END`);
        await assert.rejects(service.writeOffCredit(input),/falha decisão/);
        assert.equal(database.prepare('SELECT COUNT(*) AS n FROM credit_writeoffs').get().n,0);
        assert.equal(database.prepare("SELECT COUNT(*) AS n FROM accounting_entries WHERE type='writeoff'").get().n,0);
        database.exec('DROP TRIGGER fail_writeoff_request');
        await service.writeOffCredit(input);
        assert.equal(database.prepare("SELECT status FROM accounting_requests WHERE id='wr'").get().status,'approved');
        assert.equal(stored(database).currentBalanceMinor,120000);
        const version=stored(database).version;
        const received=await service.addPaymentAndUpdateCredit(payment('recover1',400),version,'c1');
        const recovery=database.prepare("SELECT COALESCE(SUM(amountMinor),0) AS amount FROM ledger_lines WHERE transactionId='payment:recover1' AND account='revenue_recoveries' AND side='credit'").get();
        assert.ok(recovery.amount>0);
        assert.equal(database.prepare("SELECT COUNT(*) AS n FROM ledger_lines WHERE transactionId='payment:recover1' AND account='portfolio'").get().n,0);
        assert.ok(received.creditState.currentBalance<1200);
        await assert.rejects(service.writeOffCredit(input),/pendente/);
    }finally{database.close();}
});
test('despesa guarda comprovativo na mesma transação e falha posterior reverte tudo',async()=>{
    const service=await loadService('ServicoContabilidade'),database=await createDatabase();
    const input={type:'adjustment',description:'Comunicações — Internet',debit:'expenses',credit:'bank',amountPrincipal:0,amountInterest:0,amountLateInterest:0,amountTotal:100,processedBy:'Administrador',usuario_id:'u2',receipt:{name:'recibo.pdf',mime:'application/pdf',data:'JVBERi0='},category:'Comunicações'};
    try{
        const entry=await service.createEntry(input);
        assert.equal(database.prepare('SELECT COUNT(*) AS n FROM accounting_receipts WHERE entryId=?').get(entry.id).n,1);
        const audit=database.prepare('SELECT metadata FROM audit_logs WHERE entity=?').get('accounting_entry');
        assert.ok(JSON.parse(audit.metadata).receiptDigest);
        database.exec("CREATE TRIGGER fail_expense BEFORE INSERT ON ledger_transactions BEGIN SELECT RAISE(ABORT,'falha despesa'); END");
        await assert.rejects(service.createEntry(input),/falha despesa/);
        assert.equal(database.prepare('SELECT COUNT(*) AS n FROM accounting_receipts').get().n,1);
        assert.equal(database.prepare('SELECT COUNT(*) AS n FROM accounting_entries').get().n,1);
        await assert.rejects(service.createEntry({...input,receipt:{...input.receipt,mime:'text/html'}}),/Comprovativo inválido/);
    }finally{database.close();}
});

test('decisão de estorno e reversão do pagamento revertem juntas quando a aprovação falha', async () => {
    const service = await loadService(), database = await createDatabase();
    try {
        database.prepare("INSERT INTO users(id,name,email,password,role,createdAt) VALUES ('u2','Administrador','test@example.invalid','dummy','admin',?)").run(new Date().toISOString());
        await service.addCredit(credit);
        const paid = await service.addPaymentAndUpdateCredit(payment('p-approval',400),0,'c1');
        database.prepare("INSERT INTO accounting_requests(id,kind,targetId,reason,requestedBy,requestedById,requestedAt,status) VALUES ('rr','reversal','payment:p-approval','Pagamento duplicado','Operador','u1',?,'pending')").run(new Date().toISOString());
        await assert.rejects(service.reversePaymentAndUpdateCredit(paid.payment,{...credit,...paid.creditState},'u1','Pagamento duplicado','rr'),/outro administrador/);
        database.exec("CREATE TRIGGER fail_reversal_decision BEFORE UPDATE ON accounting_requests BEGIN SELECT RAISE(ABORT,'decisão falhou'); END");
        await assert.rejects(service.reversePaymentAndUpdateCredit(paid.payment,{...credit,...paid.creditState},'u2','Pagamento duplicado','rr'),/decisão falhou/);
        assert.equal(stored(database).totalDueMinor,110000);
        assert.equal(database.prepare("SELECT deletedAt FROM payments WHERE id='p-approval'").get().deletedAt,null);
        assert.equal(database.prepare("SELECT COUNT(*) AS n FROM accounting_entries WHERE type='reversal'").get().n,0);
        database.exec('DROP TRIGGER fail_reversal_decision');
        await service.reversePaymentAndUpdateCredit(paid.payment,{...credit,...paid.creditState},'u2','Pagamento duplicado','rr');
        assert.equal(database.prepare("SELECT status FROM accounting_requests WHERE id='rr'").get().status,'approved');
        assert.equal(stored(database).totalDueMinor,150000);
    } finally { database.close(); }
});
