// Regras do motor de auditoria contabilística com dados sintéticos (sem base de dados).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const outdir = mkdtempSync(path.join(tmpdir(), 'auditoria-contabil-'));
const outfile = path.join(outdir, 'auditoria.mjs');
await build({
    stdin: {
        contents: `
            export * from './src/bibliotecas/auditoria-contabil';
            export { angolaHolidays, checkWorkingTime, easterSunday } from './src/bibliotecas/feriados-angola';
        `,
        resolveDir: root, loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
});
const { runAccountingAudit, groupFindings, auditStatus, angolaHolidays, checkWorkingTime, easterSunday } = await import(pathToFileURL(outfile).href);
rmSync(outdir, { recursive: true, force: true });

const OPEN = { workDays: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 24, extraHolidays: [], useNationalHolidays: false };

/** Monta um razão sintético: cada lançamento com as suas linhas (hash antigo, sem verificação SHA). */
function ledger(items) {
    let previousHash = '0'.repeat(64);
    const entries = [], transactions = [], lines = [];
    items.forEach((item, index) => {
        const integrityHash = String(index + 1).padStart(64, 'a');
        const total = item.lines.filter(line => line.side === 'debit').reduce((sum, line) => sum + line.amountMinor, 0);
        entries.push({ id: item.id, timestamp: item.timestamp || '2026-03-02T10:00:00', type: item.type, debit: item.lines[0].account, credit: item.lines[1].account,
            creditId: item.creditId || null, paymentId: item.paymentId || null, amountTotalMinor: total, integrityHash, previousHash, hashVersion: 1, processedBy: 'Operador' });
        transactions.push({ id: item.id, type: item.type, sourceType: item.sourceType || 'manual', sourceId: item.id, totalDebitMinor: total, totalCreditMinor: total, timestamp: item.timestamp || '2026-03-02T10:00:00' });
        item.lines.forEach((line, lineIndex) => lines.push({ id: `${item.id}:line:${lineIndex + 1}`, transactionId: item.id, component: 'test', ...line }));
        previousHash = integrityHash;
    });
    return { entries, transactions, lines };
}

const capital = { id: 'journal:capital', type: 'capital_entry', lines: [{ account: 'cash', side: 'debit', amountMinor: 100_000_000 }, { account: 'capital', side: 'credit', amountMinor: 100_000_000 }] };
const disbursement = { id: 'origination:cr-1', type: 'disbursement', creditId: 'cr-1', sourceType: 'credit_origination', lines: [{ account: 'portfolio', side: 'debit', amountMinor: 10_000_000 }, { account: 'cash', side: 'credit', amountMinor: 10_000_000 }] };
const paymentEntry = (paymentId, timestamp, principal, interest) => ({
    id: `payment:${paymentId}`, type: 'payment', creditId: 'cr-1', paymentId, sourceType: 'payment', timestamp,
    lines: [{ account: 'cash', side: 'debit', amountMinor: principal + interest }, { account: 'portfolio', side: 'credit', amountMinor: principal }, { account: 'revenue_interest', side: 'credit', amountMinor: interest }].filter(line => line.amountMinor > 0),
});
const credit = (balanceMinor, status = 'active') => ({ id: 'cr-1', clientId: 'c1', clientName: 'Maria da Silva', status, principalAmountMinor: 10_000_000, currentBalanceMinor: balanceMinor });
const payment = (id, amountMinor, principal, interest, paymentDate = '2026-03-02') => ({ id, creditId: 'cr-1', clientName: 'Maria da Silva', amountMinor, allocatedToPrincipalMinor: principal, allocatedToInterestMinor: interest, allocatedToLateInterestMinor: 0, paymentDate, status: 'confirmed' });

const dataset = (items, extra = {}) => ({
    ...ledger(items), payments: [], credits: [], installments: [], writtenOffCreditIds: [], cashSessions: [], userFindings: [], workingTime: OPEN, ...extra,
});
const rules = result => result.findings.filter(finding => finding.rule !== 'legacy_hash').map(finding => finding.rule).sort();

test('o recebimento de capital e juros não é confundido com fuga monetária', async () => {
    const result = await runAccountingAudit(dataset([capital, disbursement, paymentEntry('p1', '2026-03-02T10:00:00', 10_000_000, 3_500_000)], {
        credits: [credit(0, 'paid')], installments: [{ creditId: 'cr-1', principalMinor: 10_000_000 }],
        payments: [payment('p1', 13_500_000, 10_000_000, 3_500_000)],
    }));
    assert.deepEqual(rules(result), []);
    assert.equal(result.summary.liquidMinor, 103_500_000);
    assert.equal(result.summary.portfolioMinor, 0);
    assert.equal(result.summary.revenueMinor, 3_500_000);
    assert.equal(auditStatus(result.findings), 'ok');
});

test('fuga monetária: pagamento registado sem a entrada correspondente em Caixa/Bancos', async () => {
    const result = await runAccountingAudit(dataset([capital, disbursement, paymentEntry('p1', '2026-03-02T10:00:00', 5_000_000, 0)], {
        credits: [credit(5_000_000)], installments: [{ creditId: 'cr-1', principalMinor: 10_000_000 }],
        payments: [payment('p1', 5_000_000, 5_000_000, 0), payment('p2', 1_000_000, 1_000_000, 0)],
    }));
    const leak = result.findings.find(finding => finding.rule === 'cash_leak');
    assert.equal(leak?.severity, 'critical');
    assert.equal(leak?.amountMinor, 1_000_000);
    assert.ok(result.findings.some(finding => finding.rule === 'payment_without_entry' && finding.references.some(ref => ref.id === 'p2')));
    assert.equal(auditStatus(result.findings), 'critical');
});

test('divergência no saldo contratual calculado traz a referência completa do crédito', async () => {
    const longId = 'credito-2026-000123-abcdef-ghijkl';
    const items = [capital, { ...disbursement, id: `origination:${longId}`, creditId: longId }];
    const result = await runAccountingAudit(dataset(items, {
        credits: [{ ...credit(9_000_000), id: longId }], installments: [{ creditId: longId, principalMinor: 10_000_000 }],
    }));
    const divergence = result.findings.filter(finding => finding.rule === 'contract_balance');
    assert.equal(divergence.length, 2, 'diferente do plano e diferente do razão');
    assert.ok(divergence.every(finding => finding.title === 'Divergência no saldo contratual calculado'));
    assert.ok(divergence.every(finding => finding.references.some(ref => ref.id === longId)), 'ID completo, sem cortes');
    assert.ok(result.findings.some(finding => finding.rule === 'portfolio_mismatch'));
});

test('desembolso sem saldo e Caixa com saldo credor são assinalados', async () => {
    const result = await runAccountingAudit(dataset([disbursement], {
        credits: [credit(10_000_000)], installments: [{ creditId: 'cr-1', principalMinor: 10_000_000 }],
    }));
    assert.ok(result.findings.some(finding => finding.rule === 'disbursement_without_funds' && finding.severity === 'high'));
    const asset = result.findings.find(finding => finding.rule === 'asset_credit_balance');
    assert.equal(asset?.references[0].id, 'cash');
    assert.equal(asset?.amountMinor, 10_000_000);
});

test('lançamento desequilibrado, linha órfã e cadeia quebrada são críticos', async () => {
    const data = dataset([capital, disbursement]);
    data.lines[0].amountMinor -= 1;
    data.lines.push({ id: 'solta:line:1', transactionId: 'nao-existe', account: 'cash', side: 'debit', component: 'test', amountMinor: 500 });
    data.entries[1].previousHash = 'f'.repeat(64);
    const result = await runAccountingAudit(data, 'integrity');
    assert.ok(result.findings.some(finding => finding.rule === 'unbalanced_entry' && finding.severity === 'critical'));
    assert.ok(result.findings.some(finding => finding.rule === 'orphan_line'));
    assert.ok(result.findings.some(finding => finding.rule === 'integrity_chain' && finding.references[0].id === 'origination:cr-1'));
    assert.ok(result.findings.every(finding => finding.group === 'integrity'), 'a auditoria de integridade só corre as suas regras');
});

test('pagamentos em feriado, ao domingo ou fora do horário são assinalados e podem ser justificados', async () => {
    const workingTime = { workDays: [1, 2, 3, 4, 5], startHour: 8, endHour: 17, extraHolidays: [], useNationalHolidays: true };
    const items = [capital, disbursement,
        paymentEntry('p-feriado', '2026-11-11T10:00:00', 1_000_000, 0),
        paymentEntry('p-domingo', '2026-03-01T10:00:00', 1_000_000, 0),
        paymentEntry('p-noite', '2026-03-03T21:30:00', 1_000_000, 0),
        paymentEntry('p-normal', '2026-03-04T10:00:00', 1_000_000, 0)];
    const result = await runAccountingAudit(dataset(items, {
        workingTime, credits: [credit(6_000_000)], installments: [{ creditId: 'cr-1', principalMinor: 10_000_000 }],
        payments: ['p-feriado', 'p-domingo', 'p-noite', 'p-normal'].map(id => payment(id, 1_000_000, 1_000_000, 0)),
    }), 'payments');
    const offHours = result.findings.filter(finding => finding.rule === 'off_hours_payment');
    assert.deepEqual(offHours.map(finding => finding.id).sort(), ['off_hours_payment:p-domingo', 'off_hours_payment:p-feriado', 'off_hours_payment:p-noite']);
    assert.match(offHours.find(finding => finding.id.endsWith('p-feriado')).message, /Independência Nacional/);
    assert.equal(auditStatus(offHours), 'warning');
    const justified = offHours.map(finding => ({ ...finding, justification: { state: 'justified', reason: 'Cobrança autorizada pela direcção', actorName: 'Admin', createdAt: '2026-03-05' } }));
    assert.equal(auditStatus(justified), 'ok', 'justificados não contam para o estado');
    const groups = groupFindings(offHours);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].items.length, 3);
    assert.equal(groups[0].amountMinor, 3_000_000);
});

test('selos HMAC: adulteração, lançamento apagado e lançamento sem selo', async () => {
    const result = await runAccountingAudit(dataset([capital], {
        seals: { available: true, sealedCount: 3, tampered: ['payment:p1'], broken: [], missing: ['payment:p2'], unsealed: ['journal:x'], checkedAt: '2026-03-05' },
    }), 'integrity');
    assert.equal(result.summary.sealStatus, 'invalid');
    assert.equal(result.findings.filter(finding => finding.rule === 'integrity_seal' && finding.severity === 'critical').length, 2);
    assert.ok(result.findings.some(finding => finding.rule === 'unsealed_entry' && finding.severity === 'high'));
});

test('feriados nacionais de Angola, incluindo Carnaval e Sexta-Feira Santa móveis', () => {
    assert.equal(easterSunday(2026).toDateString(), new Date(2026, 3, 5).toDateString());
    const holidays = angolaHolidays(2026);
    assert.equal(holidays.get('2026-02-17'), 'Carnaval');
    assert.equal(holidays.get('2026-04-03'), 'Sexta-Feira Santa');
    assert.equal(holidays.get('2026-03-23'), 'Dia da Libertação da África Austral');
    assert.equal(holidays.get('2026-11-11'), 'Dia da Independência Nacional');
    assert.equal(holidays.size, 12);
    assert.equal(checkWorkingTime(new Date(2026, 1, 17, 10), { workDays: [1, 2, 3, 4, 5], startHour: 8, endHour: 17, extraHolidays: [], useNationalHolidays: true }).working, false);
    assert.equal(checkWorkingTime(new Date(2026, 2, 4, 10), { workDays: [1, 2, 3, 4, 5], startHour: 8, endHour: 17, extraHolidays: ['2026-03-04'], useNationalHolidays: true }).reason, 'Dia sem expediente configurado');
});
