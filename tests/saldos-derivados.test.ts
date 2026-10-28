import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { balanceMismatches, CREDIT_BALANCE_CHECK_SQL, derivedBalances } from '../src/bibliotecas/saldos-derivados.ts';

const db = () => {
    const database = new DatabaseSync(':memory:');
    database.exec(`CREATE TABLE credits (id TEXT PRIMARY KEY, clientName TEXT, status TEXT, deletedAt TEXT,
        currentBalance REAL, currentBalanceMinor INTEGER, accruedInterest REAL, accruedInterestMinor INTEGER,
        lateInterest REAL, lateInterestMinor INTEGER, totalDue REAL, totalDueMinor INTEGER);
      CREATE TABLE credit_installments (id TEXT PRIMARY KEY, creditId TEXT, installmentNumber INTEGER, principalMinor INTEGER, interestMinor INTEGER,
        lateInterestMinor INTEGER, paidPrincipalMinor INTEGER, paidInterestMinor INTEGER, paidLateInterestMinor INTEGER, status TEXT);`);
    return database;
};
const parcela = (database: DatabaseSync, creditId: string, n: number, p: number, i: number, l: number, pp: number, pi: number, pl: number, status: string) =>
    database.prepare('INSERT INTO credit_installments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`${creditId}-${n}`, creditId, n, p, i, l, pp, pi, pl, status);

test('totais do crédito a partir das prestações (as canceladas não contam)', () => {
    const database = db();
    // Crédito certo: 2 prestações de 50 000 + 5 000 de juros; a 1.ª paga.
    database.exec(`INSERT INTO credits VALUES ('cr-certo', 'Paulo', 'active', NULL, 500, 50000, 50, 5000, 0, 0, 550, 55000)`);
    parcela(database, 'cr-certo', 1, 50000, 5000, 0, 50000, 5000, 0, 'paid');
    parcela(database, 'cr-certo', 2, 50000, 5000, 0, 0, 0, 0, 'pending');
    parcela(database, 'cr-certo', 3, 99999, 9999, 0, 0, 0, 0, 'cancelled');
    // Crédito com o total de outro computador: o pagamento da 2.ª prestação chegou ao crédito mas não à prestação.
    database.exec(`INSERT INTO credits VALUES ('cr-partido', 'Sukeina', 'paid', NULL, 0, 0, 0, 0, 0, 0, 0, 0)`);
    parcela(database, 'cr-partido', 1, 50000, 5000, 1200, 50000, 5000, 0, 'partial');
    // Crédito antigo sem colunas *Minor (só em Kz).
    database.exec(`INSERT INTO credits VALUES ('cr-antigo', 'Ana', 'active', NULL, 100.5, NULL, 0, NULL, 0, NULL, 100.5, NULL)`);
    parcela(database, 'cr-antigo', 1, 10050, 0, 0, 0, 0, 0, 'pending');
    // Eliminado: não conta.
    database.exec(`INSERT INTO credits VALUES ('cr-eliminado', 'X', 'active', '2026-10-01', 1, 100, 0, 0, 0, 0, 1, 100)`);
    parcela(database, 'cr-eliminado', 1, 999, 0, 0, 0, 0, 0, 'pending');

    const rows = database.prepare(CREDIT_BALANCE_CHECK_SQL).all() as never[];
    assert.equal(rows.length, 3);
    const mismatches = balanceMismatches(rows);
    assert.deepEqual(mismatches.map(item => [item.creditId, item.field, item.storedMinor, item.derivedMinor]), [
        ['cr-partido', 'lateInterest', 0, 1200],
        ['cr-partido', 'totalDue', 0, 1200],
    ]);
    assert.deepEqual(derivedBalances({ id: 'x', duePrincipalMinor: 100, dueInterestMinor: -5, dueLateInterestMinor: 7 }), { balance: 100, interest: 0, lateInterest: 7, totalDue: 107 });
});
