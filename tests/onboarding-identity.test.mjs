import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Testes automatizados do Fluxo de Onboarding e Validação de Identidade
// Tango Gestão e Créditos ERP

process.env.DATABASE_URL = 'postgres://test';

const createMockResponse = () => ({
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
});

const req = (opts = {}) => ({
    headers: {},
    method: 'GET',
    ...opts
});

const SECURITY_ONLY_NEON = `export const neon = () => ({ query: async (text) => {
    if (/^\\s*CREATE/i.test(text)) return [];
    if (/api_rate_limits/.test(text)) return [{ request_count: 1, reset_epoch: Math.floor(Date.now() / 1000) + 60 }];
    if (/security_lockouts|security_events/.test(text)) return [];
    if (/tango_tenants/.test(text)) return [];
    if (/tango_registration_requests/.test(text)) return [];
    if (/tango_password_reset_tokens/.test(text)) return [];
    return [];
} });`;

async function loadHandler(file) {
    const outdir = mkdtempSync(path.join(tmpdir(), 'api-identity-'));
    const outfile = path.join(outdir, 'handler.mjs');
    await build({
        entryPoints: [path.join(import.meta.dirname, '..', 'vercel-api', file)],
        bundle: true,
        format: 'esm',
        platform: 'node',
        outfile,
        logLevel: 'silent',
        plugins: [{
            name: 'neon-stub',
            setup(builder) {
                builder.onResolve({ filter: /^@neondatabase\/serverless$/ }, () => ({ path: 'neon', namespace: 'neon-stub' }));
                builder.onLoad({ filter: /.*/, namespace: 'neon-stub' }, () => ({
                    contents: SECURITY_ONLY_NEON,
                    loader: 'js'
                }));
            }
        }]
    });
    const module = await import(pathToFileURL(outfile).href);
    rmSync(outdir, { recursive: true, force: true });
    return module.default;
}

test('1. Endpoint de status da empresa protege dados sensíveis e devolve apenas configurações não-sensíveis', async () => {
    const companyStatusHandler = await loadHandler('company-status.js');
    
    // Validação: recusa identificador vazio ou muito curto
    const badRes = createMockResponse();
    await companyStatusHandler(req({ method: 'GET', query: { id: '' } }), badRes);
    assert.equal(badRes.statusCode, 400);

    const badNifRes = createMockResponse();
    await companyStatusHandler(req({ method: 'POST', body: { nif: '12' } }), badNifRes);
    assert.equal(badNifRes.statusCode, 400);

    // Consulta de status para identificador não encontrado devolve status NOT_FOUND sem expor senhas/chaves
    process.env.DATABASE_URL = 'postgres://test';
    const notFoundRes = createMockResponse();
    await companyStatusHandler(req({ method: 'GET', query: { id: 'TG-NOVO-EMPRESA' } }), notFoundRes);
    assert.equal(notFoundRes.statusCode, 200);
    assert.equal(notFoundRes.body.status, 'NOT_FOUND');
    assert.equal(notFoundRes.body.syncPasskey, undefined);
    assert.equal(notFoundRes.body.key_hash, undefined);
});

test('2. Endpoint de Onboarding valida dados e rejeita métodos não permitidos', async () => {
    const onboardingHandler = await loadHandler('onboarding.js');

    // Teste de rejeição quando método não for POST
    const methodRes = createMockResponse();
    await onboardingHandler(req({ method: 'GET' }), methodRes);
    assert.equal(methodRes.statusCode, 405);

    // Validação de campos obrigatórios
    const missingRes = createMockResponse();
    await onboardingHandler(req({ method: 'POST', body: {} }), missingRes);
    assert.equal(missingRes.statusCode, 400);
});

test('3. Recuperação de Senha: POST /api/v1/auth/forgot-password gera token criptográfico seguro com expiração de 15 min', async () => {
    const forgotHandler = await loadHandler('auth-forgot-password.js');

    // Validação de email inválido
    const badEmailRes = createMockResponse();
    await forgotHandler(req({ method: 'POST', body: { email: 'invalido' } }), badEmailRes);
    assert.equal(badEmailRes.statusCode, 400);

    // Método não permitido
    const getRes = createMockResponse();
    await forgotHandler(req({ method: 'GET' }), getRes);
    assert.equal(getRes.statusCode, 405);

    // Resposta padrão segura
    process.env.DATABASE_URL = 'postgres://test';
    const validRes = createMockResponse();
    await forgotHandler(req({ method: 'POST', body: { email: 'admin@tango.ao' } }), validRes);
    assert.equal(validRes.statusCode, 200);
    assert.equal(validRes.body.success, true);
    assert.match(validRes.body.message, /15 minutos/i);
    // CRÍTICO: Nunca deve conter senha temporária em texto limpo!
    assert.equal(validRes.body.tempPassword, undefined);
    assert.equal(validRes.body.password, undefined);
});

test('4. Redefinição de Senha: POST /api/v1/auth/reset-password valida token e força de senha', async () => {
    const resetHandler = await loadHandler('auth-reset-password.js');

    // Token ausente ou curto
    const badTokenRes = createMockResponse();
    await resetHandler(req({ method: 'POST', body: { token: 'curto', newPassword: 'SenhaForte123' } }), badTokenRes);
    assert.equal(badTokenRes.statusCode, 400);

    // Senha fraca (sem maiúscula / minúscula / número ou curta)
    const token = crypto.randomBytes(32).toString('hex');
    const weakPassRes1 = createMockResponse();
    await resetHandler(req({ method: 'POST', body: { token, newPassword: 'fraca' } }), weakPassRes1);
    assert.equal(weakPassRes1.statusCode, 400);

    const weakPassRes2 = createMockResponse();
    await resetHandler(req({ method: 'POST', body: { token, newPassword: 'apenasminusculas123' } }), weakPassRes2);
    assert.equal(weakPassRes2.statusCode, 400);
});

test('5. Login Central: POST /api/v1/auth/login gera token de sessão e autoriza sincronização offline', async () => {
    const loginHandler = await loadHandler('auth-login.js');

    // Campos obrigatórios
    const emptyRes = createMockResponse();
    await loginHandler(req({ method: 'POST', body: {} }), emptyRes);
    assert.equal(emptyRes.statusCode, 400);

    // Login com sucesso
    const successRes = createMockResponse();
    await loginHandler(req({
        method: 'POST',
        body: {
            email: 'admin@tango.ao',
            password: 'MinhaSenhaSegura123',
            tenantId: 'TG-TEST-0001'
        }
    }), successRes);
    assert.equal(successRes.statusCode, 200);
    assert.equal(successRes.body.success, true);
    assert.ok(successRes.body.token);
    assert.equal(successRes.body.syncCredentials.tenantId, 'TG-TEST-0001');
});
