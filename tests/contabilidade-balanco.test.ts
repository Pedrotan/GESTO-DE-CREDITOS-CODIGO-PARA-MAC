import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceAnomalies, balanceSheet, entriesWithoutLines, receivablesForecast, type JournalEntry } from '../src/bibliotecas/relatorios-contabeis.ts';

let seq = 0;
const entry = (lines: Array<[string, 'debit' | 'credit', number]>, timestamp = '2026-10-10T10:00:00Z'): JournalEntry => ({
    id: `e${++seq}`, sequence: seq, timestamp, type: 'manual', sourceType: 'manual', sourceId: 'x', description: 'teste',
    lines: lines.map(([account, side, amountMinor], index) => ({ id: `l${seq}-${index}`, account, side, component: 'x', amountMinor })),
    totalMinor: lines.filter(line => line[1] === 'debit').reduce((sum, line) => sum + line[2], 0), hasLines: lines.length > 0,
});

const journal = [
    entry([['bank', 'debit', 800_000_00], ['capital', 'credit', 800_000_00]]),
    entry([['portfolio', 'debit', 100_000_00], ['bank', 'credit', 100_000_00]]),
    entry([['bank', 'debit', 30_000_00], ['portfolio', 'credit', 20_000_00], ['revenue_interest', 'credit', 10_000_00]]),
    entry([['expenses', 'debit', 5_000_00], ['bank', 'credit', 5_000_00]]),
];

test('balanço: Activo = Passivo + Capital Próprio com o resultado do exercício', () => {
    const sheet = balanceSheet(journal, null);
    assert.equal(sheet.assetsMinor, 805_000_00);
    assert.equal(sheet.resultMinor, 5_000_00);
    assert.equal(sheet.equityMinor, 805_000_00);
    assert.ok(sheet.balanced);
});

test('saldos impossíveis: caixa credora é assinalada; contas normais não', () => {
    assert.deepEqual(balanceAnomalies(journal, null), []);
    const comFalha = [...journal, entry([['portfolio', 'debit', 550_000_00], ['cash', 'credit', 550_000_00]])];
    const anomalies = balanceAnomalies(comFalha, null);
    assert.equal(anomalies[0].account, 'cash');
    assert.equal(anomalies[0].severity, 'high');
});

test('lançamentos sem partidas são contados; prestações anuladas não entram na previsão', () => {
    assert.equal(entriesWithoutLines([...journal, entry([])], { start: null, end: null }).count, 1);
    const now = new Date('2026-10-20T12:00:00');
    const row = (status: string) => ({ creditId: 'c1', dueDate: '2026-10-25T12:00:00', principalMinor: 1000, interestMinor: 100, status });
    const forecast = receivablesForecast([row('pending'), row('cancelled')], new Set(['c1']), now);
    assert.equal(forecast.horizons[0].amountMinor, 1100);
});
