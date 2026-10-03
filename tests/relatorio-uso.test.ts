import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { buildUsageReport, previousPeriod } from '../src/servicos/ServicoRelatorioUso.ts';

test('o resumo mensal conta créditos, pagamentos e carteira em cêntimos, sem dados pessoais', async () => {
    const database = new DatabaseSync(':memory:');
    database.exec(`
        CREATE TABLE clients (id TEXT, name TEXT, createdAt TEXT, deletedAt TEXT);
        CREATE TABLE users (id TEXT);
        CREATE TABLE credits (id TEXT, status TEXT, startDate TEXT, createdAt TEXT, deletedAt TEXT,
            principalAmount REAL, principalAmountMinor INTEGER, totalDue REAL, totalDueMinor INTEGER,
            currentBalance REAL, currentBalanceMinor INTEGER);
        CREATE TABLE payments (id TEXT, status TEXT, paymentDate TEXT, deletedAt TEXT, amount REAL, amountMinor INTEGER,
            allocatedToInterest REAL, allocatedToInterestMinor INTEGER, allocatedToLateInterest REAL, allocatedToLateInterestMinor INTEGER);
        INSERT INTO clients VALUES ('k1', 'Ana', '2026-10-02', NULL), ('k2', 'Rui', '2026-09-10', NULL), ('k3', 'Apagado', '2026-10-03', '2026-10-04');
        INSERT INTO users VALUES ('u1'), ('u2');
        INSERT INTO credits VALUES
            ('c1', 'active',  '2026-10-01', '2026-10-01', NULL, 1000, 100000, 1500, 150000, 1500, 150000),
            ('c2', 'overdue', '2026-09-15', '2026-09-15', NULL, 500, NULL, 650, NULL, 300, NULL),
            ('c3', 'rejected','2026-10-05', '2026-10-05', NULL, 9999, 999900, 9999, 999900, 0, 0);
        INSERT INTO payments VALUES
            ('p1', 'confirmed', '2026-10-03', NULL, 200, 20000, 50, 5000, 10, 1000),
            ('p2', 'cancelled', '2026-10-04', NULL, 999, 99900, 0, 0, 0, 0),
            ('p3', 'confirmed', '2026-09-20', NULL, 100, NULL, 30, NULL, 0, NULL);
    `);
    const query = async <T,>(sql: string, params: unknown[] = []) => database.prepare(sql).all(...(params as never[])) as T[];

    const october = await buildUsageReport(query, '2026-10');
    assert.deepEqual(october.metrics, {
        creditsCount: 1, creditsVolumeMinor: 100000, expectedInterestMinor: 50000,
        paymentsCount: 1, paymentsVolumeMinor: 20000, interestReceivedMinor: 6000,
        newClients: 1, totalClients: 2, activeCredits: 2, portfolioMinor: 180000,
        overdueCredits: 1, overdueMinor: 30000, users: 2,
    });
    const september = await buildUsageReport(query, '2026-09');
    assert.equal(september.metrics.creditsVolumeMinor, 50000, 'valores legados (REAL) são convertidos para cêntimos');
    assert.equal(september.metrics.interestReceivedMinor, 3000);
    assert.equal(previousPeriod('2026-01'), '2025-12');
    assert.equal(JSON.stringify(october).includes('Ana'), false);
});
