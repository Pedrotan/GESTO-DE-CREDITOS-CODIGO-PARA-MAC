import test from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import { applyRemoteGroups } from '../src/bibliotecas/sync-operacoes.ts';
import { withCompanyIdentity } from '../src/bibliotecas/identidade-empresa-sync.ts';

// Utilizadores do computador da empresa até ao login da versão web, de ponta a ponta:
// computador (lista cifrada) → /api/sync (guarda a última lista) → navegador (decifra, grava) → bcrypt.

process.env.DATABASE_URL = 'postgres://test';
const ROOT = path.join(import.meta.dirname, '..');
const TENANT = '5003207439';
const SERVER_CODE = 'TG-ABCD-EFGH';
const sha256 = value => nodeCrypto.createHash('sha256').update(String(value)).digest('hex');

// ---------- Servidor: /api/sync com uma base em memória ----------
const server = { seq: 0, ops: [], rosters: new Map() };
globalThis.__neonQuery = async (text, params = []) => {
    if (/^\s*(CREATE|ALTER)/i.test(text)) return [];
    if (/api_rate_limits/.test(text)) return [{ request_count: 1, reset_epoch: Math.floor(Date.now() / 1000) + 60 }];
    if (/security_lockouts|security_events/.test(text)) return [];
    if (/SELECT key_hash, status, expires_at, access_code FROM tango_tenants/.test(text)) {
        return String(params[0]).toUpperCase() === TENANT
            ? [{ key_hash: sha256('TGABCDEFGH'), status: 'active', expires_at: null, access_code: SERVER_CODE }]
            : [];
    }
    if (/^\s*UPDATE tango_tenants/i.test(text)) return [];
    if (/INSERT INTO tango_sync_operations/.test(text)) {
        for (const item of JSON.parse(params[1])) {
            if (!server.ops.some(op => op.tenant_hash === params[0] && op.operation_id === item.operation_id)) {
                server.ops.push({ seq: ++server.seq, tenant_hash: params[0], ...item });
            }
        }
        return [];
    }
    if (/INSERT INTO tango_sync_rosters/.test(text)) {
        server.rosters.set(params[0], { operation_id: params[1], device_id: params[2], payload: params[3], updated_at: new Date() });
        return [];
    }
    if (/FROM tango_sync_rosters/.test(text)) {
        const saved = server.rosters.get(params[0]);
        return saved ? [saved] : [];
    }
    if (/WITH page AS/.test(text)) {
        const [hash, cursor, limit, maxBytes] = params;
        const page = server.ops.filter(op => op.tenant_hash === hash && op.seq > cursor).sort((a, b) => a.seq - b.seq).slice(0, limit);
        let running = 0;
        const rows = [];
        for (const op of page) {
            const size = Buffer.byteLength(op.payload);
            running += size;
            if (running - size < maxBytes) rows.push({ ...op, fetched: String(page.length) });
        }
        return rows;
    }
    if (/^\s*DELETE/i.test(text)) return [];
    throw new Error(`SQL não previsto no teste: ${text.slice(0, 80)}`);
};

const bundle = async (entry, stubs) => {
    const outdir = mkdtempSync(path.join(tmpdir(), 'sync-users-'));
    const outfile = path.join(outdir, 'bundle.mjs');
    await build({
        entryPoints: [path.join(ROOT, entry)],
        bundle: true,
        format: 'esm',
        platform: 'node',
        outfile,
        logLevel: 'silent',
        plugins: [{
            name: 'stubs',
            setup(builder) {
                builder.onResolve({ filter: /^@\// }, args => stubs[args.path]
                    ? { path: args.path, namespace: 'stub' }
                    : { path: path.join(ROOT, 'src', `${args.path.slice(2)}.ts`) });
                builder.onResolve({ filter: /^@neondatabase\/serverless$/ }, () => ({ path: 'neon', namespace: 'stub' }));
                builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({
                    contents: args.path === 'neon'
                        ? 'export const neon = () => ({ query: (text, params) => globalThis.__neonQuery(text, params) });'
                        : stubs[args.path],
                    loader: 'js',
                }));
            },
        }],
    });
    return import(`${pathToFileURL(outfile).href}?v=${Math.random()}`);
};

const { default: syncHandler } = await bundle('vercel-api/sync.js', {});
const cloud = await bundle('src/servicos/ServicoSincronizacaoCloud.ts', {
    '@/bibliotecas/contas': `
        export const scopedStorageKey = key => key + ':default';
        export const getScopedLocalStorageItem = key => localStorage.getItem(key + ':default');`,
    '@/bibliotecas/ligacao-financeira': 'export const setFinancialConnectionProbe = () => {};',
    '@/bibliotecas/adaptador-sqlite': `export const REPLICA_BACKUP_AT_KEY = 'tango_replica_backup_at_v1';
    export const RESTORE_REPLICA_FLAG = 'tango_restore_replica_v1';
    export const sqlite = {
        all: (sql, params) => globalThis.__sqlite.all(sql, params),
        run: (sql, params) => globalThis.__sqlite.run(sql, params),
        transaction: statements => globalThis.__sqlite.transaction(statements),
    };`,
    '@/servicos/ServicoRelatorioUso': 'export const reportUsageIfDue = async () => {};',
    // Cofre já aberto: neste teste os segredos da empresa ligada ficam no localStorage simulado.
    '@/bibliotecas/cofre-segredos': `
        export const SEGREDO_CODIGO_EMPRESA = 'tango_active_tenant_code';
        export const SEGREDO_CHAVE_SINCRONIZACAO = 'tango_active_tenant_sync_key';
        export const lerSegredo = nome => localStorage.getItem(nome);
        export const lerChavesSincronizacao = () => null;`,
});

// ---------- Ambiente de um dispositivo (computador ou navegador) ----------
const SQL = await initSqlJs();
// Esquema da versão web (createdAt e name obrigatórios, username único).
const USERS_SCHEMA = `
    CREATE TABLE shared_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL, updatedBy TEXT);
    CREATE TABLE company_settings (id INTEGER PRIMARY KEY, nif TEXT, name TEXT, address TEXT, logo TEXT, reportLogo TEXT, watermarkLogo TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE,
        password TEXT NOT NULL, role TEXT NOT NULL, avatar TEXT, createdAt TEXT NOT NULL, lastLogin TEXT, lastSeen TEXT,
        permissions TEXT, status TEXT DEFAULT 'active', ip TEXT, signature TEXT, failedAttempts INTEGER DEFAULT 0,
        twoFactorEnabled BOOLEAN DEFAULT 0, twoFactorSecret TEXT, blockedAt TEXT, mfaRecoveryCodes TEXT);
    CREATE TABLE sync_conflicts (id TEXT PRIMARY KEY, operation TEXT, entityType TEXT, entityId TEXT, status TEXT, createdAt TEXT, resolutionNote TEXT, resolvedAt TEXT);`;

const sqliteFor = database => ({
    run: async (sql, params = []) => database.run(sql, params),
    all: async (sql, params = []) => {
        const statement = database.prepare(sql);
        statement.bind(params.map(value => value ?? null));
        const rows = [];
        while (statement.step()) rows.push(statement.getAsObject());
        statement.free();
        return rows;
    },
    transaction: async statements => {
        database.run('BEGIN');
        try {
            for (const statement of statements) database.run(statement.sql, (statement.params || []).map(value => value ?? null));
            database.run('COMMIT');
        } catch (error) {
            database.run('ROLLBACK');
            throw error;
        }
    },
});

const memoryIndexedDB = () => {
    const stores = new Map();
    return {
        open() {
            const request = {};
            setTimeout(() => {
                request.result = {
                    objectStoreNames: { contains: name => stores.has(name) },
                    createObjectStore: name => stores.set(name, new Map()),
                    transaction(name) {
                        const store = stores.get(name);
                        const tx = {
                            objectStore: () => ({
                                put: value => store.set(value.id, structuredClone(value)),
                                delete: id => store.delete(id),
                                getAll: () => {
                                    const read = {};
                                    setTimeout(() => { read.result = [...store.values()].map(value => structuredClone(value)); read.onsuccess?.(); });
                                    return read;
                                },
                            }),
                        };
                        setTimeout(() => tx.oncomplete?.());
                        return tx;
                    },
                    close() {},
                };
                request.onupgradeneeded?.();
                request.onsuccess?.();
            });
            return request;
        },
    };
};

const events = new EventTarget();
globalThis.window = globalThis;
globalThis.addEventListener = events.addEventListener.bind(events);
globalThis.removeEventListener = events.removeEventListener.bind(events);
globalThis.dispatchEvent = events.dispatchEvent.bind(events);
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.location = { origin: 'https://tangogestaoecreditos.tech' };
globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/api\/sync$/);
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([name, value]) => [name.toLowerCase(), value]));
    const res = {
        statusCode: 200, headers: {},
        status(code) { this.statusCode = code; return this; },
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
        json(body) { this.body = body; return this; },
    };
    await syncHandler({ method: init.method, headers, body: JSON.parse(init.body), socket: { remoteAddress: '127.0.0.1' } }, res);
    return { ok: res.statusCode < 400, status: res.statusCode, json: async () => res.body };
};

const useDevice = ({ electronAPI } = {}) => {
    const database = new SQL.Database();
    database.run(USERS_SCHEMA);
    const values = new Map();
    globalThis.localStorage = {
        getItem: key => (values.has(key) ? values.get(key) : null),
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
    };
    globalThis.indexedDB = memoryIndexedDB();
    globalThis.__sqlite = sqliteFor(database);
    if (electronAPI) globalThis.electronAPI = electronAPI(database);
    else delete globalThis.electronAPI;
    cloud.stopCloudSync();
    return database;
};

// Mesmo algoritmo do processo principal (electron/main.ts, "sync-users-payload").
const LOCAL_ONLY = new Set(['twoFactorEnabled', 'twoFactorSecret', 'mfaRecoveryCodes', 'failedAttempts', 'blockedAt', 'lastLogin', 'lastSeen', 'ip', 'avatar']);
const desktopApi = database => ({
    syncUsersPayload: async input => {
        const columns = sqliteFor(database);
        const info = await columns.all('PRAGMA table_info("users")');
        const shared = info.map(row => String(row.name)).filter(name => !LOCAL_ONLY.has(name));
        const rows = (await columns.all(`SELECT ${shared.map(name => `"${name}"`).join(', ')} FROM users ORDER BY id`))
            .map(row => shared.map(name => row[name] ?? null));
        const ids = rows.map(row => String(row[shared.indexOf('id')]));
        const deleted = (input.knownIds || []).filter(id => !ids.includes(id));
        const digest = sha256(JSON.stringify([shared, rows, deleted]));
        if (input.knownDigest === digest) return { digest, id: null, payload: null, ids };
        const operation = {
            id: nodeCrypto.randomUUID(), deviceId: input.deviceId, kind: 'users', commandVersion: 1, tenantId: input.tenantId,
            entityId: 'users', createdAt: new Date().toISOString(), columns: shared, rows, deleted,
        };
        const subtle = nodeCrypto.webcrypto.subtle;
        const encoder = new TextEncoder();
        const material = await subtle.importKey('raw', encoder.encode(input.apiKey), 'PBKDF2', false, ['deriveKey']);
        const key = await subtle.deriveKey(
            { name: 'PBKDF2', salt: encoder.encode(`tango-sync:${input.tenantId}`), iterations: 120_000, hash: 'SHA-256' },
            material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
        const iv = nodeCrypto.webcrypto.getRandomValues(new Uint8Array(12));
        const encrypted = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(operation))));
        return { digest, id: operation.id, payload: `${Buffer.from(iv).toString('base64')}.${Buffer.from(encrypted).toString('base64')}`, ids };
    },
    syncUsersApply: async () => ({ applied: 0, deleted: 0 }),
    syncApplyRemote: async () => ({ applied: 0, conflicts: 0 }),
});

const PASSWORD = 'Senha-Forte-2026';

test('a web recebe os utilizadores do computador e o login aceita a palavra-passe', async () => {
    // Computador: dois utilizadores, um de uma base antiga sem data de criação; código no formato do servidor.
    const desktop = useDevice({ electronAPI: desktopApi });
    desktop.run('DROP TABLE users');
    desktop.run(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, username TEXT, password TEXT, role TEXT,
        createdAt TEXT, permissions TEXT, status TEXT, twoFactorSecret TEXT, lastLogin TEXT)`);
    const hash = bcrypt.hashSync(PASSWORD, 10);
    desktop.run('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['u-admin', 'Administrador', 'admin@empresa.ao', 'admin', hash, 'super_admin', '2026-01-01T00:00:00.000Z', '[]', 'active', 'segredo-local', null]);
    desktop.run('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['u-caixa', 'Caixa', 'caixa@empresa.ao', null, hash, 'cashier', null, '[]', 'active', null, null]);
    globalThis.localStorage.setItem('sync_enabled:default', 'true');
    cloud.startCloudSync({ url: 'https://tangogestaoecreditos.tech', apiKey: SERVER_CODE, tenantId: TENANT });
    const sent = await cloud.syncCloudNow();
    cloud.stopCloudSync();
    assert.equal(sent.success, true, sent.message);
    assert.equal(server.rosters.size, 1, 'o servidor guarda a última lista de utilizadores');

    // Navegador ligado com o código escrito sem hífens (o servidor aceita; a chave de cifra é outra).
    const web = useDevice();
    globalThis.localStorage.setItem('tango_active_tenant_id', TENANT);
    globalThis.localStorage.setItem('tango_active_tenant_code', 'TGABCDEFGH');
    const outcome = await cloud.receiveUsersFromCloud();
    assert.equal(outcome.state, 'applied', outcome.message);
    const rows = await sqliteFor(web).all('SELECT id, email, password, createdAt, twoFactorSecret FROM users ORDER BY id');
    assert.deepEqual(rows.map(row => row.email), ['admin@empresa.ao', 'caixa@empresa.ao']);
    assert.ok(rows.every(row => row.createdAt), 'data de criação preenchida para bases antigas');
    assert.ok(rows.every(row => row.twoFactorSecret === null), 'segredos de 2FA ficam no computador');
    assert.ok(bcrypt.compareSync(PASSWORD, rows[0].password), 'a palavra-passe do computador funciona na web');

    // A sincronização normal não volta a descarregar a lista que não mudou.
    cloud.startCloudSync({ url: 'https://tangogestaoecreditos.tech', apiKey: 'TGABCDEFGH', tenantId: TENANT });
    const again = await cloud.syncCloudNow();
    cloud.stopCloudSync();
    assert.equal(again.success, true, again.message);
    assert.equal(again.usersRoster?.state, 'current');
});

test('empresa cujo computador ainda não enviou utilizadores: a web explica em vez de falhar', async () => {
    useDevice();
    server.rosters.clear();
    globalThis.localStorage.setItem('tango_active_tenant_id', TENANT);
    globalThis.localStorage.setItem('tango_active_tenant_code', SERVER_CODE);
    const outcome = await cloud.receiveUsersFromCloud();
    assert.equal(outcome.state, 'none');
});

test('lista cifrada com outro Código de Acesso é identificada como ilegível', async () => {
    const desktop = useDevice({ electronAPI: desktopApi });
    desktop.run(`INSERT INTO users (id, name, email, password, role, createdAt) VALUES ('u1', 'A', 'a@b.ao', ?, 'admin', '2026-01-01')`,
        [bcrypt.hashSync(PASSWORD, 4)]);
    const other = await desktopApi(desktop).syncUsersPayload({ apiKey: 'TG-ZZZZ-YYYY', tenantId: TENANT, deviceId: 'pc', knownIds: [] });
    server.rosters.set(sha256(TENANT), { operation_id: other.id, device_id: 'pc', payload: other.payload, updated_at: new Date() });

    useDevice();
    globalThis.localStorage.setItem('tango_active_tenant_id', TENANT);
    globalThis.localStorage.setItem('tango_active_tenant_code', SERVER_CODE);
    const outcome = await cloud.receiveUsersFromCloud();
    assert.equal(outcome.state, 'unreadable');
});

test('web reenvia dados existentes e o desktop recebe clientes, créditos e pagamentos', async () => {
    server.ops = [];
    server.rosters.clear();
    const schema = `CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE credits (id TEXT PRIMARY KEY, clientId TEXT REFERENCES clients(id), amount INTEGER);
        CREATE TABLE payments (id TEXT PRIMARY KEY, creditId TEXT REFERENCES credits(id), amount INTEGER);`;
    const web = useDevice();
    web.run(schema);
    web.run("INSERT INTO clients VALUES ('c1', 'Cliente web')");
    web.run("INSERT INTO credits VALUES ('cr1', 'c1', 250000)");
    web.run("INSERT INTO payments VALUES ('p1', 'cr1', 23519)");
    // Uma versão anterior já tinha marcado o bootstrap, mesmo sem estes dados na nuvem.
    localStorage.setItem('cloud_sync_bootstrap_v3:default', 'true');
    cloud.startCloudSync({ url: location.origin, apiKey: SERVER_CODE, tenantId: TENANT });
    const sent = await cloud.syncCloudNow();
    cloud.stopCloudSync();
    assert.equal(sent.success, true, sent.message);
    assert.ok(sent.pushed >= 3);

    const desktop = useDevice({ electronAPI: database => ({
        syncApplyRemote: groups => applyRemoteGroups(groups, {
            sqlById: new Map(),
            tableColumns: async table => new Set((await sqliteFor(database).all(`PRAGMA table_info("${table}")`)).map(row => row.name)),
            transaction: statements => sqliteFor(database).transaction(statements),
        }),
    }) });
    desktop.run(schema);
    cloud.startCloudSync({ url: location.origin, apiKey: SERVER_CODE, tenantId: TENANT });
    const received = await cloud.syncCloudNow();
    assert.equal(received.success, true, received.message);
    assert.equal(cloud.getLastCloudSyncStatus().state, 'synced');
    cloud.stopCloudSync();
    assert.equal((await sqliteFor(desktop).all('SELECT name FROM clients'))[0]?.name, 'Cliente web');
    assert.equal((await sqliteFor(desktop).all('SELECT amount FROM credits'))[0]?.amount, 250000);
    assert.equal((await sqliteFor(desktop).all('SELECT amount FROM payments'))[0]?.amount, 23519);
});

test('identidade do desktop entra na fila cifrada e chega ao cabeçalho e relatórios da web', async () => {
    server.ops = []; server.rosters.clear();
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7WQAAAAASUVORK5CYII=';
    const desktop = useDevice({electronAPI: () => ({syncApplyRemote: async () => ({applied:0,conflicts:0})})});
    desktop.run('INSERT INTO company_settings (id,nif,name,address,logo,reportLogo) VALUES (1,?,?,?,?,?)', [TENANT,'Empresa de teste','Morada da empresa',png,png]);
    cloud.startCloudSync({url:location.origin,apiKey:SERVER_CODE,tenantId:TENANT});
    const seeded = await cloud.syncCloudNow();
    assert.equal(seeded.success,true,seeded.message);
    assert.ok(await cloud.getPendingSyncCount() >= 5, 'o bootstrap da identidade tem de entrar na fila real');
    const sent = await cloud.syncCloudNow();
    assert.equal(sent.success,true,sent.message);
    assert.ok(sent.pushed >= 5);
    assert.ok(server.ops.length >= 5);
    cloud.stopCloudSync();
    const web = useDevice();
    cloud.startCloudSync({url:location.origin,apiKey:SERVER_CODE,tenantId:TENANT});
    const received = await cloud.syncCloudNow();
    cloud.stopCloudSync();
    assert.equal(received.success,true,received.message);
    const settings = await withCompanyIdentity(sqliteFor(web),{nif:TENANT,name:'Empresa',address:''},TENANT);
    assert.equal(settings.name,'Empresa de teste');
    assert.equal(settings.address,'Morada da empresa');
    assert.equal(settings.logo,png);
    assert.equal(settings.reportLogo,png);
});

test('HTTP 200 sem confirmação da API mantém a fila e não apresenta sincronizado', async () => {
    const database = useDevice();
    database.run('CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT)');
    database.run("INSERT INTO clients VALUES ('offline', 'Por enviar')");
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
    try {
        cloud.startCloudSync({ url: location.origin, apiKey: SERVER_CODE, tenantId: TENANT });
        const result = await cloud.syncCloudNow();
        assert.equal(result.success, false);
        assert.equal(cloud.getLastCloudSyncStatus().state, 'error');
        assert.ok(await cloud.getPendingSyncCount() > 0);
    } finally {
        cloud.stopCloudSync();
        globalThis.fetch = previousFetch;
    }
});

test('carga ilegível fica retida após avançar o cursor e recupera com a chave correcta', async () => {
    server.ops = [];
    server.rosters.clear();
    const source = useDevice({ electronAPI: desktopApi });
    source.run(`INSERT INTO users (id, name, email, password, role, createdAt)
        VALUES ('retido', 'Retido', 'retido@empresa.ao', 'hash', 'admin', '2026-01-01')`);
    const encrypted = await desktopApi(source).syncUsersPayload({ apiKey: 'TG-ZZZZ-YYYY', tenantId: TENANT, deviceId: 'outro', knownIds: [] });
    server.ops.push({ seq: ++server.seq, tenant_hash: sha256(TENANT), operation_id: encrypted.id, device_id: 'outro', payload: encrypted.payload });
    useDevice({ electronAPI: desktopApi });
    cloud.startCloudSync({ url: location.origin, apiKey: SERVER_CODE, tenantId: TENANT });
    try {
        const first = await cloud.syncCloudNow();
        assert.equal(first.skipped, 1);
        // Guardada para recuperação, mas não deixa o estado pendente para sempre (o cabeçalho mostra "Sincronizado").
        assert.equal(cloud.getLastCloudSyncStatus().state, 'synced');
        assert.equal(cloud.getLastCloudSyncStatus().skipped, 1);
        assert.match(cloud.getLastCloudSyncStatus().message, /guardadas para recuperação/);
        const again = await cloud.syncCloudNow();
        assert.equal(again.skipped, 1, 'a operação não desaparece quando o servidor já não a devolve');
        cloud.stopCloudSync();
        cloud.startCloudSync({ url: location.origin, apiKey: SERVER_CODE, tenantId: TENANT, extraKeys: ['TG-ZZZZ-YYYY'] });
        const recovered = await cloud.syncCloudNow();
        assert.equal(recovered.skipped, 0);
    } finally {
        cloud.stopCloudSync();
    }
});

test('servidor aceita um lote grande (100 alterações + utilizadores + resto da transacção) em vez de bloquear o dispositivo', async () => {
    server.ops = [];
    const operations = Array.from({ length: 150 }, (_, index) => ({ id: nodeCrypto.randomUUID(), deviceId: 'pc-lote', payload: `cifrado-${index}` }));
    const res = {
        statusCode: 200, headers: {},
        status(code) { this.statusCode = code; return this; },
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
        json(body) { this.body = body; return this; },
    };
    await syncHandler({ method: 'POST', headers: { 'x-sync-passkey': SERVER_CODE }, socket: { remoteAddress: '127.0.0.1' },
        body: { tenantId: TENANT, deviceId: 'pc-lote', cursor: 0, operations } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.equal(server.ops.length, 150);
});

// ── Ponto 0: envios recusados por tamanho nunca se perdem nem bloqueiam a fila ──────────────────────────────────
const fakeRes = () => ({
    statusCode: 200, headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    json(body) { this.body = body; return this; },
});

test('servidor: alteração acima do limite é recusada com o identificador e nada é gravado', async () => {
    server.ops = [];
    const grande = { id: nodeCrypto.randomUUID(), deviceId: 'pc-grande', payload: 'x'.repeat(12_000_001) };
    const normal = { id: nodeCrypto.randomUUID(), deviceId: 'pc-grande', payload: 'cifrado' };
    const res = fakeRes();
    await syncHandler({ method: 'POST', headers: { 'x-sync-passkey': SERVER_CODE }, socket: { remoteAddress: '127.0.0.1' },
        body: { tenantId: TENANT, deviceId: 'pc-grande', cursor: 0, operations: [normal, grande] } }, res);
    assert.equal(res.statusCode, 413);
    assert.equal(res.body.code, 'OPERATION_TOO_LARGE');
    assert.deepEqual(res.body.operationIds, [grande.id]);
    assert.equal(server.ops.length, 0, 'o pedido não é gravado a meio');
    // Uma alteração com 11 MB (cliente com documentos) já é aceite.
    const media = { id: nodeCrypto.randomUUID(), deviceId: 'pc-grande', payload: 'y'.repeat(11_000_000) };
    const aceite = fakeRes();
    await syncHandler({ method: 'POST', headers: { 'x-sync-passkey': SERVER_CODE }, socket: { remoteAddress: '127.0.0.1' },
        body: { tenantId: TENANT, deviceId: 'pc-grande', cursor: 0, operations: [media] } }, aceite);
    assert.equal(aceite.statusCode, 200, JSON.stringify(aceite.body));
});

const withFetch = async (wrapper, run) => {
    const previous = globalThis.fetch;
    globalThis.fetch = wrapper(previous);
    try { return await run(); } finally { globalThis.fetch = previous; }
};

test('PC: lote recusado por tamanho volta a seguir em lotes menores, sem perder nada', async () => {
    server.ops = [];
    const database = useDevice();
    database.run('CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT)');
    for (let index = 0; index < 12; index++) database.run(`INSERT INTO clients VALUES ('c${index}', 'Cliente ${index}')`);
    let refused = 0;
    const result = await withFetch(previous => async (url, init) => {
        const body = JSON.parse(init.body);
        // Proxy com limite apertado: recusa qualquer pedido com mais de 3 alterações (sem dizer quais).
        if (body.operations.length > 3) { refused += 1; return { ok: false, status: 413, json: async () => ({ success: false, code: 'BODY_TOO_LARGE' }) }; }
        return previous(url, init);
    }, async () => {
        cloud.startCloudSync({ url: location.origin, apiKey: SERVER_CODE, tenantId: TENANT });
        try { return await cloud.syncCloudNow(); } finally { cloud.stopCloudSync(); }
    });
    assert.equal(result.success, true, result.message);
    assert.ok(refused > 0, 'houve recusas');
    assert.equal(server.ops.length, 12, 'todos os registos chegaram ao servidor');
    assert.equal(await cloud.getPendingSyncCount(), 0);
});

test('PC: alteração que o servidor não aceita fica de parte, guardada, e as outras seguem', async () => {
    server.ops = [];
    const database = useDevice();
    database.run('CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT)');
    for (let index = 0; index < 4; index++) database.run(`INSERT INTO clients VALUES ('c${index}', 'Cliente ${index}')`);
    let rejectedId = null;
    const result = await withFetch(previous => async (url, init) => {
        const body = JSON.parse(init.body);
        if (!rejectedId && body.operations.length) rejectedId = body.operations[0].id;
        if (body.operations.some(operation => operation.id === rejectedId)) {
            return { ok: false, status: 413, json: async () => ({ success: false, code: 'OPERATION_TOO_LARGE', operationIds: [rejectedId] }) };
        }
        return previous(url, init);
    }, async () => {
        cloud.startCloudSync({ url: location.origin, apiKey: SERVER_CODE, tenantId: TENANT });
        try { return await cloud.syncCloudNow(); } finally { cloud.stopCloudSync(); }
    });
    assert.equal(result.success, true, result.message);
    assert.equal(server.ops.length, 3, 'as outras três chegaram');
    assert.equal(await cloud.getPendingSyncCount(), 1, 'a recusada continua guardada neste dispositivo');
    assert.equal(await cloud.getOversizedCount(), 1);
});
