import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

// Etapa 2 das licenças: chave TANGO-XXXX-XXXX-XXXX-XXXX, activação por máquina e token Ed25519, de ponta a ponta
// num PostgreSQL verdadeiro (PGlite) através das rotas reais /api/tenants e /api/licencas.

const ROOT = path.join(import.meta.dirname, '..');
const MASTER_SECRET = 'segredo-de-teste-master';
const signing = crypto.generateKeyPairSync('ed25519');
process.env.DATABASE_URL = 'postgres://pglite-ativacao';
process.env.TANGO_MASTER_SECRET = MASTER_SECRET;
process.env.TANGO_LICENSE_SIGNING_KEY = signing.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const db = new PGlite();
const sql = async (text, params = []) => (await db.query(text, params)).rows;
globalThis.__neonQuery = sql;

const K = await import(pathToFileURL(path.join(ROOT, 'vercel-api/_chave-licenca.js')).href);
const T = await import(pathToFileURL(path.join(ROOT, 'vercel-api/_token-licenca.js')).href);

const bundleHandler = async entry => {
    const outfile = path.join(mkdtempSync(path.join(tmpdir(), 'licencas-ativacao-')), 'bundle.mjs');
    await build({
        entryPoints: [path.join(ROOT, entry)], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
        plugins: [{
            name: 'neon',
            setup(builder) {
                builder.onResolve({ filter: /^@neondatabase\/serverless$/ }, () => ({ path: 'neon', namespace: 'stub' }));
                builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                    contents: 'export const neon = () => ({ query: (text, params) => globalThis.__neonQuery(text, params) });', loader: 'js',
                }));
            },
        }],
    });
    return (await import(`${pathToFileURL(outfile).href}?v=${Math.random()}`)).default;
};

const invoke = async (handler, { method = 'POST', url, body, ip = '10.1.1.1' }) => {
    const response = { statusCode: 200, headers: {}, body: null };
    const res = {
        status(code) { response.statusCode = code; return res; },
        setHeader(name, value) { response.headers[name] = value; return res; },
        json(data) { response.body = data; return res; },
    };
    await handler({ method, url, headers: { 'x-forwarded-for': ip }, body, query: {}, socket: {} }, res);
    return response;
};

const tenants = await bundleHandler('vercel-api/tenants.js');
const licencas = await bundleHandler('vercel-api/licencas.js');
const admin = body => invoke(tenants, { url: '/api/tenants', body: { ...body, masterSecret: MASTER_SECRET } });
const activate = (body, ip) => invoke(licencas, { url: '/api/licencas/ativar', body, ip });
const heartbeat = (body, ip) => invoke(licencas, { url: '/api/licencas/heartbeat', body, ip });
const machine = name => crypto.createHash('sha256').update(name).digest('hex');
const publicKeys = () => [T.publicKeyInfo(T.loadSigningKey())];

test('formato da chave: TANGO-XXXX-XXXX-XXXX-XXXX com dígito de controlo', () => {
    const keys = new Set(Array.from({ length: 200 }, () => K.generateLicenseKey()));
    assert.equal(keys.size, 200);
    for (const key of keys) {
        assert.match(key, /^TANGO-[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){3}$/);
        assert.ok(K.parseLicenseKey(key));
        assert.equal(K.parseLicenseKey(key.toLowerCase().replace(/-/g, ' ')), K.parseLicenseKey(key), 'aceita minúsculas e espaços');
        assert.equal(K.parseLicenseKey(key.replace('TANGO-', '')), K.parseLicenseKey(key), 'aceita sem o prefixo');
    }
    // Qualquer carácter trocado é apanhado pelo dígito de controlo.
    const key = [...keys][0];
    const chars = K.parseLicenseKey(key);
    for (let i = 0; i < chars.length; i += 1) {
        for (const other of K.KEY_ALPHABET) {
            if (other === chars[i]) continue;
            assert.equal(K.parseLicenseKey(chars.slice(0, i) + other + chars.slice(i + 1)), null);
        }
    }
    assert.equal(K.parseLicenseKey('TANGO-0000-1111-OOOO-IIII'), null);
    assert.equal(K.parseLicenseKey(''), null);
    assert.equal(K.licenseKeyPrefix(chars), `TANGO-${chars.slice(0, 4)}`);
});

test('token Ed25519: a assinatura não aceita alterações nem outra chave', () => {
    const key = T.loadSigningKey();
    const token = T.signLicenseToken(key, { licenca_id: 'x', data_fim: '2027-01-01T00:00:00.000Z', exp: 1 });
    assert.equal(T.verifyLicenseToken(token, publicKeys()).licenca_id, 'x');
    const [header, payload, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ licenca_id: 'x', data_fim: '2099-01-01T00:00:00.000Z', exp: 1 })).toString('base64url');
    assert.equal(T.verifyLicenseToken(`${header}.${forged}.${signature}`, publicKeys()), null);
    const other = crypto.generateKeyPairSync('ed25519').privateKey;
    assert.equal(T.verifyLicenseToken(T.signLicenseToken(other, { a: 1 }), publicKeys()), null);
    assert.equal(T.loadSigningKey('nao-e-uma-chave'), null);
    assert.equal(T.loadSigningKey(crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'pem', type: 'pkcs8' })), null);
    assert.equal(T.loadSigningKey(signing.privateKey.export({ format: 'pem', type: 'pkcs8' })) !== null, true, 'aceita PEM');
});

let licenseKey;
const PC1 = machine('pc-1');
const PC2 = machine('pc-2');

test('cadastrar a empresa emite a chave de licença uma única vez (só o hash fica no servidor)', async () => {
    const created = await admin({ action: 'create', tenantId: '5003207439', name: 'Digital Norte', expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() });
    assert.equal(created.statusCode, 200, JSON.stringify(created.body));
    licenseKey = created.body.licenseKey;
    assert.ok(K.parseLicenseKey(licenseKey));
    const [row] = await sql(`SELECT chave_hash, chave_prefixo FROM tango_licencas WHERE empresa_id = '5003207439'`);
    assert.equal(row.chave_hash, K.licenseKeyHash(K.parseLicenseKey(licenseKey)));
    assert.equal(row.chave_prefixo, licenseKey.slice(0, 10));
    const stored = JSON.stringify(await sql(`SELECT * FROM tango_licencas`)) + JSON.stringify(await sql(`SELECT * FROM tango_licenca_eventos`));
    assert.ok(!stored.includes(K.parseLicenseKey(licenseKey)), 'a chave em claro não fica em lado nenhum');
});

test('activação: primeira máquina regista-se, a mesma pode voltar, a segunda excede o máximo', async () => {
    const first = await activate({ chave: licenseKey, machine_hash: PC1, nome_maquina: 'Caixa 1' });
    assert.equal(first.statusCode, 200, JSON.stringify(first.body));
    const claims = T.verifyLicenseToken(first.body.token, publicKeys());
    assert.equal(claims.empresa_id, '5003207439');
    assert.equal(claims.machine_hash, PC1);
    assert.ok(claims.exp * 1000 - Date.now() <= 7 * 86_400_000 + 5000, 'token vale no máximo 7 dias');
    assert.ok(Math.abs(new Date(claims.hora_servidor).getTime() - Date.now()) < 5000);

    const again = await activate({ chave: licenseKey.toLowerCase(), machine_hash: PC1 });
    assert.equal(again.statusCode, 200);

    const second = await activate({ chave: licenseKey, machine_hash: PC2 });
    assert.equal(second.statusCode, 409);
    assert.equal(second.body.code, 'LIMITE_MAQUINAS');

    await sql(`UPDATE tango_licencas SET max_maquinas = 2 WHERE empresa_id = '5003207439'`);
    assert.equal((await activate({ chave: licenseKey, machine_hash: PC2 })).statusCode, 200);
    const [{ total }] = await sql(`SELECT COUNT(*)::int AS total FROM tango_licenca_ativacoes WHERE estado = 'ativa'`);
    assert.equal(total, 2);
});

test('heartbeat: renova o token da mesma máquina e recusa outra máquina ou um token alterado', async () => {
    const first = await activate({ chave: licenseKey, machine_hash: PC1 });
    const renewed = await heartbeat({ token: first.body.token, machine_hash: PC1 });
    assert.equal(renewed.statusCode, 200);
    assert.notEqual(renewed.body.token, first.body.token);
    assert.equal((await heartbeat({ token: first.body.token, machine_hash: PC2 })).body.code, 'MAQUINA_DIFERENTE');
    assert.equal((await heartbeat({ token: `${first.body.token}x`, machine_hash: PC1 })).body.code, 'TOKEN_INVALIDO');
    const [activation] = await sql(`SELECT ultimo_heartbeat FROM tango_licenca_ativacoes WHERE machine_hash = $1`, [PC1]);
    assert.ok(activation.ultimo_heartbeat);
});

test('licença suspensa ou expirada: o servidor recusa activação e heartbeat', async () => {
    const { body } = await activate({ chave: licenseKey, machine_hash: PC1 });
    await admin({ action: 'update', tenantId: '5003207439', status: 'blocked' });
    assert.equal((await activate({ chave: licenseKey, machine_hash: PC1 })).body.code, 'LICENCA_SUSPENSA');
    assert.equal((await heartbeat({ token: body.token, machine_hash: PC1 })).body.code, 'LICENCA_SUSPENSA');

    await admin({ action: 'update', tenantId: '5003207439', status: 'active' });
    assert.equal((await activate({ chave: licenseKey, machine_hash: PC1 })).statusCode, 200);

    await sql(`UPDATE tango_licencas SET data_fim = NOW() - INTERVAL '1 hour' WHERE empresa_id = '5003207439'`);
    assert.equal((await activate({ chave: licenseKey, machine_hash: PC1 })).body.code, 'LICENCA_EXPIRADA');
    const [row] = await sql(`SELECT estado FROM tango_licencas WHERE empresa_id = '5003207439'`);
    assert.equal(row.estado, 'expirada');

    const renewTo = new Date(Date.now() + 60 * 86_400_000).toISOString();
    await admin({ action: 'update', tenantId: '5003207439', status: 'active', expiresAt: renewTo });
    const back = await activate({ chave: licenseKey, machine_hash: PC1 });
    assert.equal(back.statusCode, 200, 'renovar no painel reactiva a licença');
    const refusals = await sql(`SELECT COUNT(*)::int AS total FROM tango_licenca_eventos WHERE tipo = 'ativacao_recusada'`);
    assert.ok(refusals[0].total >= 3);
});

test('emitir uma chave nova invalida a antiga, mas as máquinas activadas continuam a renovar', async () => {
    const { body } = await activate({ chave: licenseKey, machine_hash: PC1 });
    const issued = await admin({ action: 'license-issue-key', tenantId: '5003207439' });
    assert.equal(issued.statusCode, 200);
    assert.equal(issued.body.replaced, true);
    assert.notEqual(issued.body.licenseKey, licenseKey);
    assert.equal((await activate({ chave: licenseKey, machine_hash: PC1 }, '10.9.9.9')).body.code, 'CHAVE_DESCONHECIDA');
    assert.equal((await heartbeat({ token: body.token, machine_hash: PC1 })).statusCode, 200);
    assert.equal((await activate({ chave: issued.body.licenseKey, machine_hash: PC1 })).statusCode, 200);
    licenseKey = issued.body.licenseKey;
});

test('chaves erradas: ao fim de 5 tentativas o IP fica bloqueado', async () => {
    const ip = '10.6.6.6';
    for (let i = 0; i < 5; i += 1) {
        const wrong = await activate({ chave: K.generateLicenseKey(), machine_hash: PC1 }, ip);
        assert.equal(wrong.body.code, 'CHAVE_DESCONHECIDA');
    }
    const blocked = await activate({ chave: licenseKey, machine_hash: PC1 }, ip);
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.body.code, 'BLOQUEADO');
    assert.equal((await activate({ chave: licenseKey, machine_hash: PC1 }, '10.7.7.7')).statusCode, 200, 'outros IPs não são afectados');
    assert.equal((await activate({ chave: 'TANGO-ABCD', machine_hash: PC1 }, '10.8.8.8')).body.code, 'CHAVE_MAL_ESCRITA');
});

test('computador de uma licença antiga passa para a impressão digital nova sem gastar outro lugar', async () => {
    const L = await import(pathToFileURL(path.join(ROOT, 'vercel-api/_licencas.js')).href);
    const [license] = await sql(`SELECT id FROM tango_licencas WHERE empresa_id = '5003207439'`);
    await sql(`UPDATE tango_licenca_ativacoes SET estado = 'libertada' WHERE licenca_id = $1`, [license.id]);
    await sql(`UPDATE tango_licencas SET max_maquinas = 1 WHERE id = $1`, [license.id]);
    const oldHash = L.machineHash('TANGO-16EDE273');
    await sql(`INSERT INTO tango_licenca_ativacoes (id, licenca_id, machine_hash, estado) VALUES ($1, $2, $3, 'ativa')`,
        [crypto.randomUUID(), license.id, oldHash]);
    const PC3 = machine('pc-3');
    const moved = await activate({ chave: licenseKey, machine_hash: PC3, legacy_machine_hash: oldHash });
    assert.equal(moved.statusCode, 200, JSON.stringify(moved.body));
    const rows = await sql(`SELECT machine_hash FROM tango_licenca_ativacoes WHERE licenca_id = $1 AND estado = 'ativa'`, [license.id]);
    assert.deepEqual(rows.map(row => row.machine_hash), [PC3]);
    const events = await sql(`SELECT COUNT(*)::int AS total FROM tango_licenca_eventos WHERE tipo = 'maquina_migrada'`);
    assert.equal(events[0].total, 1);
    // Outro computador sem ligação a uma licença antiga continua limitado pelo máximo.
    assert.equal((await activate({ chave: licenseKey, machine_hash: machine('pc-4'), legacy_machine_hash: oldHash })).body.code, 'LIMITE_MAQUINAS');
});

test('chave pública e servidor sem chave de assinatura', async () => {
    const info = await invoke(licencas, { method: 'GET', url: '/api/licencas/chave-publica' });
    assert.equal(info.statusCode, 200);
    assert.deepEqual({ alg: info.body.alg, kid: info.body.kid, publicKey: info.body.publicKey }, publicKeys()[0]);
    const saved = process.env.TANGO_LICENSE_SIGNING_KEY;
    delete process.env.TANGO_LICENSE_SIGNING_KEY;
    try {
        const off = await activate({ chave: licenseKey, machine_hash: PC1 });
        assert.equal(off.statusCode, 503);
        assert.equal(off.body.code, 'ASSINATURA_NAO_CONFIGURADA');
    } finally {
        process.env.TANGO_LICENSE_SIGNING_KEY = saved;
    }
});

test('demonstração de 3 dias: decidida no servidor, uma por computador, e não recomeça', async () => {
    const pc = machine('pc-demonstracao');
    const first = await invoke(licencas, { url: '/api/licencas/teste', body: { machine_hash: pc, nome_maquina: 'PC Demo' } });
    assert.equal(first.statusCode, 200, JSON.stringify(first.body));
    const claims = T.verifyLicenseToken(first.body.token, publicKeys());
    assert.equal(claims.plano, 'trial');
    assert.equal(claims.machine_hash, pc);
    assert.ok(claims.licenca_id.startsWith('teste:'));
    const days = (Date.parse(claims.data_fim) - Date.parse(claims.data_inicio)) / 86_400_000;
    assert.equal(Math.round(days), 3);
    // Reinstalar / pedir de novo devolve o mesmo fim (o servidor lembra-se da máquina).
    await sql(`UPDATE tango_testes SET inicio = NOW() - INTERVAL '4 days', fim = NOW() - INTERVAL '1 day' WHERE machine_hash = $1`, [pc]);
    const again = await invoke(licencas, { url: '/api/licencas/teste', body: { machine_hash: pc } });
    const ended = T.verifyLicenseToken(again.body.token, publicKeys());
    assert.ok(Date.parse(ended.data_fim) < Date.now(), 'o fim continua no passado');
    assert.ok(ended.exp * 1000 <= Date.now(), 'token já expirado: o Desktop mostra a activação');
    // O heartbeat de um token de demonstração renova a partir do registo do servidor.
    const beat = await heartbeat({ token: first.body.token, machine_hash: pc });
    assert.equal(beat.statusCode, 200);
    assert.equal(T.verifyLicenseToken(beat.body.token, publicKeys()).data_fim, ended.data_fim);
    const bad = await invoke(licencas, { url: '/api/licencas/teste', body: { machine_hash: 'xyz' } });
    assert.equal(bad.statusCode, 400);
});

test('Multi-Empresas e intranet: o servidor decide pelo plano (funcionalidades) ou pelo escalão', async () => {
    const L = await import(pathToFileURL(path.join(ROOT, 'vercel-api/_licencas.js')).href);
    const [row] = await sql(`SELECT empresa_id, plano_id FROM tango_licencas LIMIT 1`);
    assert.ok(row, 'há uma licença criada nos testes anteriores');
    await sql(`UPDATE tango_licencas SET escalao = 'singular' WHERE empresa_id = $1`, [row.empresa_id]);
    await sql(`UPDATE tango_planos SET funcionalidades = '{}'::jsonb WHERE id = $1`, [row.plano_id]);
    assert.equal(await L.tenantAllowsFeature(sql, row.empresa_id, 'multi_empresa'), false, 'singular sem o módulo no plano');
    await sql(`UPDATE tango_licencas SET escalao = 'empresarial' WHERE empresa_id = $1`, [row.empresa_id]);
    assert.equal(await L.tenantAllowsFeature(sql, row.empresa_id, 'multi_empresa'), true, 'empresarial inclui');
    await sql(`UPDATE tango_planos SET funcionalidades = '{"multi_empresa": false}'::jsonb WHERE id = $1`, [row.plano_id]);
    assert.equal(await L.tenantAllowsFeature(sql, row.empresa_id, 'multi_empresa'), false, 'o plano pode retirar o módulo');
    assert.equal(await L.tenantAllowsFeature(sql, 'EMPRESA-SEM-LICENCA', 'multi_empresa'), true, 'empresas antigas mantêm o que tinham');
    await sql(`UPDATE tango_planos SET funcionalidades = '{}'::jsonb WHERE id = $1`, [row.plano_id]);
});
