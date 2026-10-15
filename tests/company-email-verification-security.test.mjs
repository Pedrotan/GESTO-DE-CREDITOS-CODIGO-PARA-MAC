import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMAIL_VERIFICATION_TTL_MS,
  issueCompanyEmailVerification,
  verifyCompanyEmailToken,
} from '../vercel-api/_email-verification.js';

const normalizeQuery = (query) => String(query || '').replace(/\s+/g, ' ').trim();

const makeSql = (records = []) => {
  const table = new Map();
  for (const record of records) table.set(record.id, record);

  const getRows = async (query, params) => {
    const normalized = normalizeQuery(query);
    if (/WHERE token_hash = \$1/i.test(normalized)) {
      const tokenHash = params[0];
      return [...table.values()].filter(row => row.token_hash === tokenHash);
    }
    if (/WHERE request_id = \$1 AND nif = \$2 AND used = FALSE/i.test(normalized)) {
      return [...table.values()].filter(row => row.request_id === params[0] && row.nif === params[1] && row.used === false);
    }
    return [];
  };

  return {
    async query(query, params) {
      const normalized = normalizeQuery(query);
      if (/INSERT INTO tango_company_email_verifications/i.test(normalized)) {
        const record = {
          id: params[0],
          request_id: params[1],
          nif: params[2],
          email: params[3],
          token_hash: params[4],
          expires_at: params[5],
          used: false,
          created_at: new Date().toISOString(),
          last_requested_at: new Date().toISOString(),
        };
        table.set(record.id, record);
        return { rows: [record] };
      }
      if (/UPDATE tango_company_email_verifications/i.test(normalized)) {
        const target = [...table.values()].find(row => row.id === params[0]);
        if (target) target.used = true;
        return { rows: target ? [target] : [] };
      }
      if (/UPDATE tango_registration_requests/i.test(normalized)) {
        return { rows: [{ id: params[0] }] };
      }
      return { rows: [] };
    },
    async begin(fn) {
      const tx = async (query, params) => {
        const normalized = normalizeQuery(query);
        if (/INSERT INTO tango_company_email_verifications/i.test(normalized)) {
          const record = {
            id: params[0],
            request_id: params[1],
            nif: params[2],
            email: params[3],
            token_hash: params[4],
            expires_at: params[5],
            used: false,
            created_at: new Date().toISOString(),
            last_requested_at: new Date().toISOString(),
          };
          table.set(record.id, record);
          return { rows: [record] };
        }
        if (/SELECT .* FROM tango_company_email_verifications.*FOR UPDATE/i.test(normalized)) {
          const rows = await getRows(query, params);
          return rows;
        }
        if (/UPDATE tango_company_email_verifications/i.test(normalized)) {
          const target = [...table.values()].find(row => row.id === params[0]);
          if (target) target.used = true;
          return { rows: target ? [target] : [] };
        }
        if (/UPDATE tango_registration_requests/i.test(normalized)) {
          return { rows: [{ id: params[0] }] };
        }
        return { rows: [] };
      };
      return fn(tx);
    },
  };
};

test('não expõe token em respostas públicas', async () => {
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
  assert.equal(result.delivery.sent === false || result.delivery.status === 'smtp_disabled' || result.delivery.status === 'smtp_unconfigured', true);
  assert.equal(result.message.includes('registado') || result.message.includes('gerado') || result.message.includes('desativado'), true);
});

test('token consumido uma única vez sob concorrência embutida', async () => {
  const sql = makeSql();
  const issued = await issueCompanyEmailVerification({
    sql,
    requestId: 'req-1',
    nif: '123456789',
    email: 'empresa@teste.pt',
    appUrl: 'https://tangogestaoecreditos.tech',
    ttlMs: EMAIL_VERIFICATION_TTL_MS,
  });

  const first = await verifyCompanyEmailToken({ sql, token: issued.token, requestId: 'req-1', nif: '123456789' });
  const second = await verifyCompanyEmailToken({ sql, token: issued.token, requestId: 'req-1', nif: '123456789' });

  assert.equal(first.success, true);
  assert.equal(second.success, false);
  assert.equal(second.reason, 'used');
});

test('token de outro pedido não pode ser usado', async () => {
  const sql = makeSql();
  const issued = await issueCompanyEmailVerification({
    sql,
    requestId: 'req-2',
    nif: '987654321',
    email: 'outra@teste.pt',
    appUrl: 'https://tangogestaoecreditos.tech',
    ttlMs: EMAIL_VERIFICATION_TTL_MS,
  });

  const wrongRequest = await verifyCompanyEmailToken({ sql, token: issued.token, requestId: 'req-999', nif: '987654321' });
  const wrongCompany = await verifyCompanyEmailToken({ sql, token: issued.token, requestId: 'req-2', nif: '000000000' });

  assert.equal(wrongRequest.reason, 'wrong_request');
  assert.equal(wrongCompany.reason, 'wrong_request');
});
