const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { once } = require('node:events');

// Run with the project's Electron runtime in ELECTRON_RUN_AS_NODE mode (native SQLite ABI).
async function main() {
    const { LEDGER_GENESIS_HASH, LEDGER_PROTECTION_SQL } = require('../dist-electron/ledger-schema.cjs');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tango-db-integration-'));
    const workers = [];
    let requestId = 0;
    function start(dbPath, encryptionKey) {
        const worker = new Worker(path.resolve('dist-electron/db-worker.cjs'), {
            workerData: { dbPath, encryptionKey, logPath: path.join(directory, 'worker.log') }
        });
        workers.push(worker);
        return worker;
    }
    function request(worker, payload) {
        return new Promise((resolve, reject) => {
            const id = ++requestId;
            const timer = setTimeout(() => finish(new Error('Worker timeout')), 15000);
            const onExit = code => finish(new Error(`Worker exited: ${code}`));
            const onMessage = message => {
                if (message.id === id) finish(message.success ? null : new Error(message.error), message.result);
            };
            function finish(error, result) {
                clearTimeout(timer);
                worker.off('exit', onExit);
                worker.off('error', onError);
                worker.off('message', onMessage);
                error ? reject(error) : resolve(result);
            }
            const onError = error => finish(error);
            worker.on('exit', onExit);
            worker.on('error', onError);
            worker.on('message', onMessage);
            worker.postMessage({ id, ...payload });
        });
    }
    try {
        const live = path.join(directory, 'live.sqlite');
        const backup = path.join(directory, 'backup.sqlite');
        const worker = start(live, 'integration-only-key');
        await request(worker, { type: 'exec', sql: 'CREATE TABLE sample (id INTEGER PRIMARY KEY, amount INTEGER NOT NULL)' });
        await request(worker, { type: 'execute', sql: 'INSERT INTO sample (id, amount) VALUES (?, ?)', params: [1, 12345] });
        const result = await request(worker, { type: 'backup', destination: backup });
        assert.equal(result.success, true);
        const restored = start(backup, 'integration-only-key');
        assert.deepEqual(await request(restored, { type: 'get', sql: 'SELECT amount FROM sample WHERE id = 1' }), { amount: 12345 });
        await restored.terminate();

        const ledgerPath = path.join(directory, 'ledger.sqlite');
        const ledger = start(ledgerPath, 'integration-ledger-key');
        await request(ledger, { type: 'exec', sql: `
            CREATE TABLE credits (id TEXT PRIMARY KEY, currentBalance INTEGER NOT NULL);
            CREATE TABLE payments (id TEXT PRIMARY KEY, creditId TEXT NOT NULL, amount INTEGER NOT NULL);
            CREATE TABLE accounting_entries (
                id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, type TEXT NOT NULL, paymentId TEXT,
                previousHash TEXT NOT NULL, integrityHash TEXT NOT NULL
            );
            CREATE TABLE ledger_transactions (
                id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, type TEXT NOT NULL,
                sourceType TEXT NOT NULL, sourceId TEXT NOT NULL, description TEXT,
                totalDebitMinor INTEGER NOT NULL CHECK(totalDebitMinor > 0),
                totalCreditMinor INTEGER NOT NULL CHECK(totalCreditMinor > 0),
                integrityHash TEXT NOT NULL, previousHash TEXT NOT NULL,
                hashVersion INTEGER NOT NULL, usuario_id TEXT,
                CHECK(totalDebitMinor = totalCreditMinor)
            );
            CREATE TABLE ledger_lines (
                id TEXT PRIMARY KEY, transactionId TEXT NOT NULL, account TEXT NOT NULL,
                side TEXT NOT NULL CHECK(side IN ('debit','credit')), component TEXT NOT NULL,
                amountMinor INTEGER NOT NULL CHECK(amountMinor > 0),
                FOREIGN KEY(transactionId) REFERENCES ledger_transactions(id) ON DELETE RESTRICT
            )` });
        for (const sql of LEDGER_PROTECTION_SQL) await request(ledger, { type: 'exec', sql });
        const paymentTransaction = [
            { sql: 'INSERT INTO payments (id, creditId, amount) VALUES (?, ?, ?)', params: ['p1', 'c1', 2500] },
            { sql: 'UPDATE credits SET currentBalance = currentBalance - ? WHERE id = ?', params: [2500, 'c1'] },
            { sql: `INSERT INTO accounting_entries (id, timestamp, type, paymentId, previousHash, integrityHash)
                    VALUES (?, ?, ?, ?, ?, ?)`,
              params: ['payment:p1', new Date().toISOString(), 'payment', 'p1', LEDGER_GENESIS_HASH, 'a'.repeat(64)] }
        ];
        await request(ledger, { type: 'execute', sql: 'INSERT INTO credits (id, currentBalance) VALUES (?, ?)', params: ['c1', 10000] });
        await request(ledger, { type: 'transaction', statements: paymentTransaction });
        assert.deepEqual(await request(ledger, { type: 'get', sql: 'SELECT currentBalance FROM credits WHERE id = ?', params: ['c1'] }),
            { currentBalance: 7500 });
        await assert.rejects(request(ledger, { type: 'transaction', statements: [
            { sql: 'INSERT INTO payments (id, creditId, amount) VALUES (?, ?, ?)', params: ['p-concurrent', 'missing', 100] },
            { sql: 'UPDATE credits SET currentBalance = currentBalance - ? WHERE id = ?', params: [100, 'missing'], expectChanges: 1 }
        ] }), /Conflito de concorrencia/);
        assert.equal(await request(ledger, { type: 'get', sql: 'SELECT id FROM payments WHERE id = ?', params: ['p-concurrent'] }), undefined,
            'Optimistic concurrency failure must roll back the whole transaction');
        await assert.rejects(request(ledger, { type: 'transaction', statements: [
            { sql: 'UPDATE credits SET currentBalance = 1 WHERE id = ?', params: ['c1'] },
            { sql: `INSERT INTO accounting_entries (id, timestamp, type, paymentId, previousHash, integrityHash)
                    VALUES (?, ?, ?, ?, ?, ?)`,
              params: ['payment:p1-duplicate', new Date().toISOString(), 'payment', 'p1', 'a'.repeat(64), 'b'.repeat(64)] }
        ] }), /Pagamento já registado/);
        assert.deepEqual(await request(ledger, { type: 'get', sql: 'SELECT currentBalance FROM credits WHERE id = ?', params: ['c1'] }),
            { currentBalance: 7500 }, 'Ledger failure must roll back credit mutation');
        await assert.rejects(request(ledger, { type: 'execute', sql: 'UPDATE accounting_entries SET integrityHash = ? WHERE id = ?',
            params: ['c'.repeat(64), 'payment:p1'] }), /imutáveis/);
        await assert.rejects(request(ledger, { type: 'execute', sql: `INSERT INTO accounting_entries
            (id, timestamp, type, paymentId, previousHash, integrityHash) VALUES (?, ?, ?, ?, ?, ?)`,
            params: ['reversal:p1', new Date().toISOString(), 'reversal', 'p1', 'f'.repeat(64), 'c'.repeat(64)] }), /Cadeia/);
        await request(ledger, { type: 'execute', sql: `INSERT INTO accounting_entries
            (id, timestamp, type, paymentId, previousHash, integrityHash) VALUES (?, ?, ?, ?, ?, ?)`,
            params: ['reversal:p1', new Date().toISOString(), 'reversal', 'p1', 'a'.repeat(64), 'c'.repeat(64)] });
        await assert.rejects(request(ledger, { type: 'execute', sql: `INSERT INTO ledger_transactions
            (id,timestamp,type,sourceType,sourceId,totalDebitMinor,totalCreditMinor,integrityHash,previousHash,hashVersion)
            VALUES (?,?,?,?,?,?,?,?,?,?)`, params: ['bad', new Date().toISOString(), 'payment', 'payment', 'p2',
                100, 99, 'd'.repeat(64), 'c'.repeat(64), 2] }), /CHECK constraint/);
        await request(ledger, { type: 'transaction', statements: [
            { sql: `INSERT INTO ledger_transactions
                (id,timestamp,type,sourceType,sourceId,totalDebitMinor,totalCreditMinor,integrityHash,previousHash,hashVersion)
                VALUES (?,?,?,?,?,?,?,?,?,?)`, params: ['ledger:p1', new Date().toISOString(), 'payment', 'payment', 'p1',
                    2500, 2500, 'd'.repeat(64), 'c'.repeat(64), 2] },
            { sql: 'INSERT INTO ledger_lines (id,transactionId,account,side,component,amountMinor) VALUES (?,?,?,?,?,?)',
              params: ['ledger:p1:1', 'ledger:p1', 'cash', 'debit', 'settlement', 2500] },
            { sql: 'INSERT INTO ledger_lines (id,transactionId,account,side,component,amountMinor) VALUES (?,?,?,?,?,?)',
              params: ['ledger:p1:2', 'ledger:p1', 'portfolio', 'credit', 'principal', 2000] },
            { sql: 'INSERT INTO ledger_lines (id,transactionId,account,side,component,amountMinor) VALUES (?,?,?,?,?,?)',
              params: ['ledger:p1:3', 'ledger:p1', 'revenue_interest', 'credit', 'interest', 500] }
        ] });
        const balance = await request(ledger, { type: 'get', sql: `SELECT
            SUM(CASE WHEN side='debit' THEN amountMinor ELSE 0 END) AS debit,
            SUM(CASE WHEN side='credit' THEN amountMinor ELSE 0 END) AS credit
            FROM ledger_lines WHERE transactionId = ?`, params: ['ledger:p1'] });
        assert.deepEqual(balance, { debit: 2500, credit: 2500 });
        await assert.rejects(request(ledger, { type: 'execute', sql: 'DELETE FROM ledger_lines WHERE transactionId = ?',
            params: ['ledger:p1'] }), /imutáveis/);
        await ledger.terminate();
        const before = fs.readFileSync(backup);
        const wrongKey = start(backup, 'wrong-key');
        const [code] = await once(wrongKey, 'exit');
        assert.equal(code, 1);
        assert.deepEqual(fs.readFileSync(backup), before, 'Wrong key must preserve database bytes');
        const corrupt = path.join(directory, 'corrupt.sqlite');
        const corruptBytes = Buffer.alloc(4096, 0x7f);
        fs.writeFileSync(corrupt, corruptBytes);
        const unreadable = start(corrupt, 'integration-only-key');
        const [unreadableCode] = await once(unreadable, 'exit');
        assert.equal(unreadableCode, 1);
        assert.deepEqual(fs.readFileSync(corrupt), corruptBytes, 'Unreadable database must not be reset');
        console.log('PASS: encrypted backup/restore and immutable transactional ledger invariants.');
    } finally {
        await Promise.all(workers.map(worker => worker.terminate()));
        fs.rmSync(directory, { recursive: true, force: true });
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
