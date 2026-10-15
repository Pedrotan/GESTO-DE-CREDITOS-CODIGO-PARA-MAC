import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMAIL_VERIFICATION_TTL_MS,
  issueCompanyEmailVerification,
  verifyCompanyEmailToken,
  createSafelistedAuditCard,
} from '../vercel-api/_email-verification.js';

const normalizeQuery = (query) => String(query || '').replace(/\s+/g, ' ').trim();

const makeSql = (records = []) => {
  const table = new Map();
  for (const record of records) table.set(record.id, record);
  return {
    async query(query, params) {
      const normalized = normalizeQuery(query);
      if (/CREATE TABLE IF NOT EXISTS tango_company_email_verifications/i.test(normalized)) return { rows: [] };
      if (/INSERT INTO tango_company_email_verifications/i.test(normalized)) {
        const row = {
          id: params[0],
          request_id: params[1],
          nif: params[2],
          email: params[3],
          token_hash: params[4],
          expires_at: params[5],
          used: params[6] ?? false,
          created_at: new Date().toISOString(),
          last_requested_at: new Date().toISOString(),
        };
        table.set(row.id, row);
        return { rows: [row] };
      }
      if (/SELECT .* WHERE token_hash = \$1/i.test(normalized)) {
        const tokenHash = params?.[0];
        const rows = [...table.values()].filter(row => row.token_hash === tokenHash);
        return { rows };
      }
      if (/SELECT id, created_at, last_requested_at FROM tango_company_email_verifications WHERE request_id = \$1 AND nif = \$2 AND used = FALSE/i.test(normalized)) {
        const rows = [...table.values()].filter(row => row.request_id === params[0] && row.nif === params[1] && row.used === false);
        return { rows: rows.slice(0, 1) };
      }
      if (/UPDATE tango_company_email_verifications SET used = TRUE/i.test(normalized)) {
        const target = [...table.values()].find(row => row.id === params[0]);
        if (target) target.used = true;
        return { rows: target ? [target] : [] };
      }
      if (/UPDATE tango_registration_requests\s+SET email_verified = TRUE/i.test(normalized)) {
        return { rows: [{ id: params[0] }] };
      }
      return { rows: [] };
    },
  };
};

test('emissão de token válido para pedido pendente', async () => {
  const sql = makeSql();
  const result = await issueCompanyEmailVerification({
    sql,
    requestId: 'req-1',
    nif: '123456789',
    email: 'empresa@teste.pt',
    appUrl: 'https://tangogestaoecreditos.tech',
    ttlMs: EMAIL_VERIFICATION_TTL_MS,
  });

  assert.equal(result.success, true);
  assert.equal(typeof result.token, 'string');
  assert.ok(result.token.length >= 32);
  assert.equal(typeof result.expiresAt, 'string');
  assert.equal(Boolean(result.delivery), true);
});

test('verificação bem-sucedida marca pedido e invalida o token', async () => {
  const sql = makeSql();
  const issued = await issueCompanyEmailVerification({
    sql,
    requestId: 'req-1',
    nif: '123456789',
    email: 'empresa@teste.pt',
    appUrl: 'https://tangogestaoecreditos.tech',
    ttlMs: EMAIL_VERIFICATION_TTL_MS,
  });

  const verified = await verifyCompanyEmailToken({
    sql,
    token: issued.token,
    requestId: 'req-1',
    nif: '123456789',
  });

  assert.equal(verified.success, true);
  assert.equal(verified.verified, true);
  assert.equal(verified.emailVerified, true);
});

test('token expirado, inválido e reutilizado são rejeitados', async () => {
  const sql = makeSql();
  const first = await issueCompanyEmailVerification({
    sql,
    requestId: 'req-1',
    nif: '123456789',
    email: 'empresa@teste.pt',
    appUrl: 'https://tangogestaoecreditos.tech',
    ttlMs: 1_000,
  });

  const expiredResult = await verifyCompanyEmailToken({
    sql,
    token: first.token,
    requestId: 'req-1',
    nif: '123456789',
    now: Date.now() + 10_000,
  });
  assert.equal(expiredResult.success, false);
  assert.equal(expiredResult.reason, 'expired');

  const second = await issueCompanyEmailVerification({
    sql,
    requestId: 'req-2',
    nif: '987654321',
    email: 'outra@teste.pt',
    appUrl: 'https://tangogestaoecreditos.tech',
    ttlMs: EMAIL_VERIFICATION_TTL_MS,
  });
  const invalid = await verifyCompanyEmailToken({
    sql,
    token: 'abc123',
    requestId: 'req-2',
    nif: '987654321',
  });
  assert.equal(invalid.success, false);
  assert.equal(invalid.reason, 'invalid');

  const reused = await verifyCompanyEmailToken({
    sql,
    token: second.token,
    requestId: 'req-2',
    nif: '987654321',
  });
  assert.equal(reused.success, true);
  const repeated = await verifyCompanyEmailToken({
    sql,
    token: second.token,
    requestId: 'req-2',
    nif: '987654321',
  });
  assert.equal(repeated.success, false);
  assert.equal(repeated.reason, 'used');
});

test('reenvio limitado e proteção contra token de outra empresa', async () => {
  const sql = makeSql();
  const first = await issueCompanyEmailVerification({
    sql,
    requestId: 'req-1',
    nif: '123456789',
    email: 'empresa@teste.pt',
    appUrl: 'https://tangogestaoecreditos.tech',
    ttlMs: EMAIL_VERIFICATION_TTL_MS,
    resendLimitMs: 60_000,
  });

  const rateLimited = await issueCompanyEmailVerification({
    sql,
    requestId: 'req-1',
    nif: '123456789',
    email: 'empresa@teste.pt',
    appUrl: 'https://tangogestaoecreditos.tech',
    ttlMs: EMAIL_VERIFICATION_TTL_MS,
    resendLimitMs: 60_000,
    now: Date.now() + 10_000,
  });
  assert.equal(rateLimited.success, false);
  assert.equal(rateLimited.reason, 'rate_limited');

  const otherCompany = await verifyCompanyEmailToken({
    sql,
    token: first.token,
    requestId: 'req-1',
    nif: '999999999',
  });
  assert.equal(otherCompany.success, false);
  assert.equal(otherCompany.reason, 'wrong_request');
});

test('logs e auditoria não expõem token nem link completo', () => {
  const log = createSafelistedAuditCard({
    tokenHash: 'hash-123',
    requestId: 'req-1',
    companyNif: '123456789',
    email: 'empresa@teste.pt',
    result: 'verified',
  });

  assert.equal(log.tokenHash.includes('hash-123'), true);
  assert.equal(log.message.includes('token'), true);
  assert.equal(log.message.includes('empresa@teste.pt'), true);
  assert.equal(log.message.includes('hash-123'), true);
  assert.equal(log.message.includes('req-1'), true);
});
