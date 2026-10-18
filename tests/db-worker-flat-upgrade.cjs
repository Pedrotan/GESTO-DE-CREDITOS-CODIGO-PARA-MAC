// Executar com o Electron do projeto em ELECTRON_RUN_AS_NODE=1 (mesmo ABI do instalador).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

async function main() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tango-flat-upgrade-'));
    const dbPath = path.join(directory, 'existing.sqlite');
    const backupPath = `${dbPath}.before-flat-3.0.3.bak`;
    const workers = [];
    let nextId = 0;
    const start = () => {
        const worker = new Worker(path.resolve('dist-electron/db-worker.cjs'), { workerData: {
            dbPath, encryptionKey: 'test-only-flat-upgrade-key', logPath: path.join(directory, 'worker.log'),
        } });
        workers.push(worker); return worker;
    };
    const request = (worker, payload) => new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => finish(new Error('Worker timeout')), 30_000);
        const onExit = code => finish(new Error(`Worker exited: ${code}`));
        const onError = error => finish(error);
        const onMessage = message => { if (message.id === id) finish(message.success ? null : new Error(message.error), message.result); };
        function finish(error, result) {
            clearTimeout(timer); worker.off('exit', onExit); worker.off('error', onError); worker.off('message', onMessage);
            error ? reject(error) : resolve(result);
        }
        worker.on('exit', onExit); worker.on('error', onError); worker.on('message', onMessage);
        worker.postMessage({ id, ...payload });
    });
    try {
        const old = start();
        await request(old, {type:'exec',sql:`
            CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT);
            CREATE TABLE simulations (id TEXT PRIMARY KEY, reference TEXT, date TEXT NOT NULL, clientName TEXT,
                clientIncome REAL DEFAULT 0, amount REAL DEFAULT 0, term INTEGER DEFAULT 0,
                interestRate REAL DEFAULT 0, method TEXT CHECK(method IN ('price','sac')),
                riskProfile TEXT CHECK(riskProfile IN ('low','medium','high')), totalPayment REAL DEFAULT 0,
                monthlyPayment REAL DEFAULT 0, aiAnalysis TEXT, usuario_id TEXT, createdAt TEXT NOT NULL,
                customColumn TEXT DEFAULT 'preservado');
            CREATE INDEX idx_simulations_amount ON simulations(amount);`});
        await request(old, {type:'execute',sql:"INSERT INTO users VALUES ('u1','Teste')"});
        await request(old, {type:'execute',sql:"INSERT INTO simulations(id,date,createdAt,method,amount) VALUES ('old','2026-10-01','2026-10-01','price',100)"});
        const insert = "INSERT INTO simulations(id,date,createdAt,method) VALUES ('before','2026-10-18','2026-10-18','flat')";
        await assert.rejects(request(old,{type:'execute',sql:insert}),/CHECK/);
        await old.terminate();

        // Simula instalar por cima e abrir uma conta já existente. Não chama nenhum bootstrap do renderer.
        const upgraded = start();
        assert.deepEqual(await request(upgraded,{type:'get',sql:'SELECT COUNT(*) AS total FROM users'}),{total:1});
        const previous = await request(upgraded,{type:'get',sql:"SELECT amount,customColumn FROM simulations WHERE id='old'"});
        assert.deepEqual(previous,{amount:100,customColumn:'preservado'});
        await request(upgraded,{type:'execute',sql:`INSERT INTO simulations (
            id, reference, date, clientName, clientIncome, amount, term, interestRate, method, riskProfile,
            totalPayment, monthlyPayment, aiAnalysis, usuario_id, createdAt, status, clientId, productId,
            verificationCode, expiresAt, details, convertedCreditId, updatedAt
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,params:[
            'new','SIM-TEST','2026-10-18','Teste',1000,200,2,10,'flat','low',220,110,null,'u1',
            '2026-10-18','simulated','c1','product','TEST','2026-11-18','{}',null,'2026-10-18',
        ]});
        assert.deepEqual(await request(upgraded,{type:'get',sql:"SELECT method,amount,customColumn FROM simulations WHERE id='new'"}),{method:'flat',amount:200,customColumn:'preservado'});
        assert.ok(fs.existsSync(backupPath));
        assert.ok(fs.statSync(backupPath).size > 0);
        const backupBytes = fs.readFileSync(backupPath);
        await assert.rejects(request(upgraded,{type:'exec',sql:'DROP TABLE simulations'}),/permitida|bloqueada|permitido/i);
        await upgraded.terminate();
        const again = start();
        assert.deepEqual(await request(again,{type:'get',sql:'SELECT COUNT(*) AS total FROM simulations'}),{total:2});
        assert.deepEqual(fs.readFileSync(backupPath),backupBytes,'Reabrir a conta não substitui a cópia anterior à migração');
        console.log('PASS: base nativa cifrada existente migra no arranque, preserva histórico e aceita o INSERT completo FLAT.');
    } catch(error) {
        if (fs.existsSync(path.join(directory,'worker.log'))) console.error(fs.readFileSync(path.join(directory,'worker.log'),'utf8'));
        throw error;
    } finally {
        await Promise.all(workers.map(worker => worker.terminate()));
        fs.rmSync(directory,{recursive:true,force:true});
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
