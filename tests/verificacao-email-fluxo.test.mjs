import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

// Verificação do e-mail da empresa, de ponta a ponta num PostgreSQL verdadeiro (PGlite) pelas rotas reais:
// pedido de cadastro → link enviado → confirmação → o Master vê «E-mail confirmado».

const ROOT = path.join(import.meta.dirname, '..');
const MASTER_SECRET = 'segredo-de-teste-master';
process.env.DATABASE_URL = 'postgres://pglite-email';
process.env.TANGO_MASTER_SECRET = MASTER_SECRET;
process.env.APP_URL = 'https://tangogestaoecreditos.tech';
Object.assign(process.env, { MAIL_ENABLED: 'true', MAIL_HOST: 'smtp.exemplo.test', MAIL_USERNAME: 'tango', MAIL_PASSWORD: 'x', MAIL_FROM_ADDRESS: 'nao-responder@exemplo.test' });

const db = new PGlite();
const sql = async (text, params = []) => (await db.query(text, params)).rows;
globalThis.__neonQuery = sql;
const sent = [];
globalThis.__TANGO_TEST_TRANSPORT__ = { sendMail: async message => { sent.push(message); return { messageId: `m${sent.length}` }; } };

const bundleHandler = async entry => {
    // Dentro do projecto, para o nodemailer (externo, CommonJS) ser encontrado em node_modules.
    const cache = path.join(ROOT, 'node_modules', '.cache');
    mkdirSync(cache, { recursive: true });
    const outfile = path.join(mkdtempSync(path.join(cache, 'email-fluxo-')), 'bundle.mjs');
    await build({
        entryPoints: [path.join(ROOT, entry)], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
        external: ['nodemailer'],
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

const invoke = async (handler, { method = 'POST', url, body, query = {}, ip = '10.2.2.2' }) => {
    const response = { statusCode: 200, headers: {}, body: null };
    const res = {
        status(code) { response.statusCode = code; return res; },
        setHeader(name, value) { response.headers[name] = value; return res; },
        json(data) { response.body = data; return res; },
    };
    await handler({ method, url, headers: { 'x-forwarded-for': ip }, body, query, socket: {} }, res);
    return response;
};

const registration = await bundleHandler('vercel-api/registration-request.js');
const verification = await bundleHandler('vercel-api/company-email-verification.js');
const tenants = await bundleHandler('vercel-api/tenants.js');
const listRequests = async () => (await invoke(tenants, { url: '/api/tenants', body: { action: 'list-requests', masterSecret: MASTER_SECRET } })).body.requests;
const linkParams = message => {
    const link = /https:\/\/[^\s"<]+/.exec(message.text)[0];
    return Object.fromEntries(new URLSearchParams(link.split('?')[1]));
};
const NIF = '5417123456';
const request = { nif: NIF, companyName: 'Empresa Exemplo, Lda', contactName: 'Ana Exemplo', phone: '+244 923 456 789', email: 'geral@empresa-exemplo.ao', message: '' };

test('pedido de cadastro envia o link; confirmar marca o e-mail e o Master vê o estado', async () => {
    const created = await invoke(registration, { url: '/api/registration-request', body: request });
    assert.equal(created.statusCode, 200, JSON.stringify(created.body));
    assert.ok(created.body.requestId, 'o pedido devolve o seu id');
    assert.equal(created.body.emailVerification.status, 'sent');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, request.email);
    const params = linkParams(sent[0]);
    assert.equal(params.request, created.body.requestId);
    assert.equal(params.nif, NIF);
    assert.ok(!JSON.stringify(created.body).includes(params.token), 'o token nunca vem na resposta');

    let [pending] = await listRequests();
    assert.equal(pending.emailVerified, false);

    const confirmed = await invoke(verification, { url: '/api/company-email-verification', body: { token: params.token, requestId: params.request, nif: params.nif } });
    assert.equal(confirmed.statusCode, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.emailVerified, true);
    [pending] = await listRequests();
    assert.equal(pending.emailVerified, true);
    assert.ok(pending.emailVerifiedAt);

    const again = await invoke(verification, { url: '/api/company-email-verification', body: { token: params.token, requestId: params.request, nif: params.nif } });
    assert.equal(again.statusCode, 400);
    assert.equal(again.body.code, 'used', 'o link só serve uma vez');
});

test('reenviar o pedido com o mesmo e-mail não pede nova confirmação; mudar o e-mail volta a pedir', async () => {
    const same = await invoke(registration, { url: '/api/registration-request', body: request });
    assert.equal(same.body.emailVerification.status, 'verified');
    assert.equal(sent.length, 1, 'não envia outro link');

    const changed = await invoke(registration, { url: '/api/registration-request', body: { ...request, email: 'financeiro@empresa-exemplo.ao' } });
    assert.equal(changed.body.requestId, same.body.requestId, 'continua a ser o mesmo pedido');
    assert.equal(changed.body.emailVerification.status, 'sent');
    assert.equal(sent.length, 2);
    const [pending] = await listRequests();
    assert.equal(pending.email, 'financeiro@empresa-exemplo.ao');
    assert.equal(pending.emailVerified, false, 'o novo endereço tem de ser confirmado');

    // Pedir outro link logo a seguir é recusado (1 minuto entre envios).
    const resend = await invoke(verification, { url: '/api/company-email-verification', body: { requestId: changed.body.requestId, nif: NIF, email: 'financeiro@empresa-exemplo.ao' } });
    assert.equal(resend.statusCode, 429);
    // Token de outro pedido/empresa não serve.
    const params = linkParams(sent[1]);
    const wrong = await invoke(verification, { url: '/api/company-email-verification', body: { token: params.token, requestId: params.request, nif: '5000000000' } });
    assert.equal(wrong.statusCode, 400);
    assert.equal(wrong.body.code, 'wrong_request');
});

test('com o envio desligado, o pedido fica registado e o link não é divulgado', async () => {
    process.env.MAIL_ENABLED = 'false';
    try {
        const other = await invoke(registration, { url: '/api/registration-request', body: { ...request, nif: '5417999999', email: 'outra@empresa.ao' }, ip: '10.3.3.3' });
        assert.equal(other.statusCode, 200);
        assert.equal(other.body.emailVerification.status, 'pending');
        assert.equal(sent.length, 2, 'nada enviado');
        assert.ok(!JSON.stringify(other.body).includes('token'), 'sem token na resposta');
    } finally {
        process.env.MAIL_ENABLED = 'true';
    }
});
