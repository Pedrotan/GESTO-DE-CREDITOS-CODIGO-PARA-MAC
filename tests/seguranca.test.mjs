// Protecções contra intrusão: classificação dos pedidos rejeitados, alertas (agrupamento e escalada),
// bloqueio de quem tenta adivinhar chaves, licenças forjadas, origens da API e bloqueio por falhas.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { allowedOrigins, applyCors } from '../vercel-api/_security.js';
import { clientIp, nextLockoutState, registerAuthFailure, lockoutRemaining, LOCKOUT_POLICIES } from '../vercel-api/_alertas.js';

const root = path.resolve(import.meta.dirname, '..');
const outdir = mkdtempSync(path.join(tmpdir(), 'seguranca-'));
const outfile = path.join(outdir, 'protecao.mjs');
await build({ entryPoints: [path.join(root, 'electron/protecao-seguranca.ts')], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
const P = await import(pathToFileURL(outfile).href);
rmSync(outdir, { recursive: true, force: true });

test('classifica pedidos IPC rejeitados como tentativas de intrusão', () => {
    assert.equal(P.classifyIpcError('db-query', 'Pedido IPC rejeitado: origem nao autorizada.').severity, 'critical');
    assert.equal(P.classifyIpcError('db-execute', 'Comando de dados não registado. Use uma operação de domínio autorizada.').type, 'sql_injection_attempt');
    assert.equal(P.classifyIpcError('db-query', 'A leitura de credenciais pelo renderer nao e permitida.').type, 'sql_injection_attempt');
    assert.equal(P.classifyIpcError('db-export', 'Sem permissao para exportar a base de dados.').type, 'privilege_escalation_attempt');
    assert.equal(P.classifyIpcError('master-auth-login', 'Credenciais invalidas.').type, 'master_login_failed');
    assert.equal(P.classifyIpcError('db-query', 'Sessão inexistente ou expirada.'), null, 'sessão expirada é normal, não é ataque');
});

test('alertas: repetições agrupadas e gravidade escalada quando o ataque insiste', () => {
    let time = 1_000_000;
    const persisted = [];
    const notified = [];
    const monitor = P.createSecurityMonitor({ persist: event => persisted.push(event), notify: event => notified.push(event), now: () => time });
    const attack = { type: 'lan_bruteforce', severity: 'medium', title: 'Chave errada', details: 'x', source: 'lan', ip: '10.0.0.9' };
    assert.ok(monitor.report(attack));
    time += 1_000;
    assert.equal(monitor.report(attack), null, 'a 2.ª ocorrência dentro de 1 minuto é agrupada');
    time += 1_000; monitor.report(attack);
    time += 1_000; monitor.report(attack);
    time += 1_000;
    const fifth = monitor.report(attack);
    assert.equal(fifth.severity, 'high', 'à 5.ª ocorrência a gravidade sobe');
    assert.match(fifth.title, /repetido 5 vezes/);
    assert.equal(persisted.length, 2);
    assert.equal(notified.length, 2);
    const other = monitor.report({ ...attack, ip: '10.0.0.10' });
    assert.ok(other, 'outro endereço é um alerta novo');
});

test('bloqueio temporário após falhas repetidas e libertação ao fim do prazo', () => {
    let time = 0;
    const tracker = P.createFailureTracker({ maxFailures: 5, windowMs: 15 * 60_000, blockMs: 30 * 60_000 }, () => time);
    for (let i = 1; i <= 4; i++) assert.equal(tracker.fail('10.0.0.9').blocked, false);
    const fifth = tracker.fail('10.0.0.9');
    assert.equal(fifth.justBlocked, true);
    assert.equal(tracker.isBlocked('10.0.0.9'), true);
    assert.equal(tracker.isBlocked('10.0.0.8'), false);
    time += 31 * 60_000;
    assert.equal(tracker.isBlocked('10.0.0.9'), false);
});

test('só https, email e telefone podem ser abertos fora da aplicação', () => {
    assert.equal(P.isSafeExternalUrl('https://wa.me/244900000000'), true);
    assert.equal(P.isSafeExternalUrl('mailto:geral@exemplo.ao'), true);
    for (const url of ['file:///C:/Windows/System32/calc.exe', 'smb://servidor/partilha', 'ms-msdt:/id', 'javascript:alert(1)', 'http://exemplo.ao']) {
        assert.equal(P.isSafeExternalUrl(url), false, url);
    }
});

test('licença: só é aceite se estiver assinada pelo Tango Master', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const payload = Buffer.from(JSON.stringify({ mid: 'GLOBAL', type: 'annual' })).toString('base64');
    const signature = crypto.sign('sha256', Buffer.from(payload, 'utf8'), { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }).toString('base64');
    const key = Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
    assert.equal(P.verifyLicenseActivation(key, 'PC-123', [pem]).ok, true);
    const spkiBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    assert.equal(P.verifyLicenseActivation(key, 'PC-123', [spkiBase64]).ok, true, 'aceita a chave em base64 (formato do licenciamento)');
    const forged = Buffer.from(JSON.stringify({ payload: Buffer.from('{"mid":"GLOBAL","type":"lifetime"}').toString('base64'), signature })).toString('base64');
    assert.equal(P.verifyLicenseActivation(forged, 'PC-123', [pem]).ok, false, 'conteúdo alterado é recusado');
    assert.equal(P.verifyLicenseActivation(key, 'PC 123; rm -rf', [pem]).ok, false, 'identificador de máquina com caracteres inválidos');
    assert.equal(P.verifyLicenseActivation('x'.repeat(20_000), 'PC-123', [pem]).ok, false, 'chave gigante recusada');
    assert.equal(P.maskIdentifier('administrador@empresa.ao'), 'ad***@empresa.ao');
});

test('API: origens permitidas por omissão e cabeçalhos de segurança', () => {
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; } };
    const req = (origin) => ({ headers: { origin, host: 'tango-gestao-creditos.vercel.app' } });
    assert.equal(applyCors(req('https://tango-gestao-creditos.vercel.app'), res), true);
    assert.equal(applyCors(req('null'), res), true, 'aplicação desktop (file://)');
    assert.equal(applyCors(req('https://site-malicioso.com'), res), false);
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.match(headers['Strict-Transport-Security'], /max-age=63072000/);
    assert.ok(allowedOrigins({ headers: {} }).has('http://localhost:8081'));
});

test('API: IP real da plataforma, não o cabeçalho enviado pelo atacante', () => {
    assert.equal(clientIp({ headers: { 'x-vercel-forwarded-for': '41.63.1.2', 'x-forwarded-for': '1.1.1.1' } }), '41.63.1.2');
    assert.equal(clientIp({ headers: { 'x-forwarded-for': '41.63.1.2, 10.0.0.1' } }), '41.63.1.2');
});

test('API: contador de falhas e bloqueio', () => {
    const policy = LOCKOUT_POLICIES.master;
    let state = null;
    for (let i = 1; i < policy.maxFailures; i++) {
        const next = nextLockoutState(state, 1_000 + i, policy);
        assert.equal(next.justLocked, false);
        state = { failures: next.failures, window_start: new Date(next.windowStart).toISOString(), locked_until: null };
    }
    const locked = nextLockoutState(state, 2_000, policy);
    assert.equal(locked.justLocked, true);
    assert.equal(locked.lockedUntil, 2_000 + policy.blockMs);
    const later = nextLockoutState({ failures: 9, window_start: new Date(0).toISOString(), locked_until: null }, policy.windowMs + 10, policy);
    assert.equal(later.failures, 1, 'fora da janela o contador recomeça');
});

test('API: chave mestra errada 5 vezes bloqueia o IP e gera alerta crítico', async () => {
    const lockouts = new Map();
    const events = [];
    const sql = async (text, params = []) => {
        if (/^\s*CREATE/i.test(text)) return [];
        if (/SELECT failures, window_start, locked_until FROM security_lockouts/.test(text)) return lockouts.has(params[0]) ? [lockouts.get(params[0])] : [];
        if (/INSERT INTO security_lockouts/.test(text)) { lockouts.set(params[0], { failures: params[1], window_start: params[2], locked_until: params[3] }); return []; }
        if (/SELECT EXTRACT\(EPOCH FROM \(locked_until - NOW\(\)\)\)/.test(text)) {
            return params[0].map(key => lockouts.get(key)).filter(row => row?.locked_until && new Date(row.locked_until).getTime() > Date.now())
                .map(row => ({ remaining: Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 1000) }));
        }
        if (/^\s*UPDATE security_events SET count/.test(text)) return [];
        if (/INSERT INTO security_events/.test(text)) { events.push({ type: params[1], severity: params[2] }); return []; }
        return [];
    };
    const req = { headers: { 'x-vercel-forwarded-for': '102.1.2.3', 'user-agent': 'ataque' }, url: '/api/tenants' };
    const warn = console.warn; console.warn = () => {};
    try {
        for (let i = 0; i < 5; i++) {
            await registerAuthFailure(sql, req, { scope: 'master', type: 'master_secret_failed', title: 'Chave mestra errada', details: 'teste', ipPolicy: LOCKOUT_POLICIES.master });
        }
    } finally { console.warn = warn; }
    assert.ok(await lockoutRemaining(sql, req, { scope: 'master' }) > 3_000, 'IP bloqueado cerca de 1 hora');
    assert.equal(await lockoutRemaining(sql, { headers: { 'x-vercel-forwarded-for': '102.9.9.9' } }, { scope: 'master' }), 0, 'outro IP não fica bloqueado');
    assert.equal(events.at(-1).type, 'master_secret_failed_locked');
    assert.equal(events.at(-1).severity, 'critical');
});
