import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  canSendEmail,
  sendVerificationEmail,
  verifyCompanyEmailToken,
} from '../vercel-api/_email-verification.js';

const oldEnv = { ...process.env };

const setMailEnv = (overrides = {}) => {
  process.env = {
    ...oldEnv,
    MAIL_ENABLED: 'true',
    MAIL_HOST: 'smtp.tangogestaoecreditos.tech',
    MAIL_PORT: '587',
    MAIL_USERNAME: 'noreply@tangogestaoecreditos.tech',
    MAIL_PASSWORD: 'secret',
    MAIL_FROM_ADDRESS: 'noreply@tangogestaoecreditos.tech',
    MAIL_ENCRYPTION: 'tls',
    ...overrides,
  };
};

test.afterEach(() => {
  process.env = { ...oldEnv };
});

test('canSendEmail bloqueia quando MAIL_ENABLED=false', () => {
  process.env.MAIL_ENABLED = 'false';
  const result = canSendEmail();

  assert.equal(result.enabled, false);
  assert.equal(result.reason, 'smtp_disabled');
});

test('canSendEmail bloqueia quando faltam credenciais SMTP', () => {
  setMailEnv({
    MAIL_ENABLED: 'true',
    MAIL_USERNAME: '',
    MAIL_PASSWORD: '',
    MAIL_FROM_ADDRESS: '',
  });

  const result = canSendEmail();
  assert.equal(result.enabled, false);
  assert.equal(result.reason, 'smtp_unconfigured');
});

test('sendVerificationEmail devolve falha explícita quando o SMTP falha', async () => {
  setMailEnv();

  const original = globalThis.__TANGO_TEST_TRANSPORT__;
  globalThis.__TANGO_TEST_TRANSPORT__ = {
    sendMail: async () => {
      throw new Error('smtp rejected');
    },
  };

  try {
    const result = await sendVerificationEmail({
      email: 'empresa@teste.pt',
      token: 'abc123',
      requestId: 'req-1',
      nif: '123456789',
      appUrl: 'https://tangogestaoecreditos.tech',
    });

    assert.equal(result.sent, false);
    assert.equal(result.status, 'smtp_failed');
    assert.match(result.message, /Falha|SMTP|e-mail/i);
  } finally {
    if (original === undefined) {
      delete globalThis.__TANGO_TEST_TRANSPORT__;
    } else {
      globalThis.__TANGO_TEST_TRANSPORT__ = original;
    }
  }
});

test('sendVerificationEmail devolve sucesso quando o transporte responde corretamente', async () => {
  setMailEnv();

  const original = globalThis.__TANGO_TEST_TRANSPORT__;
  globalThis.__TANGO_TEST_TRANSPORT__ = {
    sendMail: async () => ({ messageId: '<msg-1>' }),
  };

  try {
    const result = await sendVerificationEmail({
      email: 'empresa@teste.pt',
      token: 'abc123',
      requestId: 'req-1',
      nif: '123456789',
      appUrl: 'https://tangogestaoecreditos.tech',
    });

    assert.equal(result.sent, true);
    assert.equal(result.status, 'sent');
    assert.equal(result.messageId, '<msg-1>');
  } finally {
    if (original === undefined) {
      delete globalThis.__TANGO_TEST_TRANSPORT__;
    } else {
      globalThis.__TANGO_TEST_TRANSPORT__ = original;
    }
  }
});

test('verifyCompanyEmailToken realiza rollback quando a atualização do pedido falha após marcar o token como usado', async () => {
  const calls = [];
  const token = 'token-plain';
  const rows = [{
    id: 'ver-1',
    request_id: 'req-1',
    nif: '123456789',
    email: 'empresa@teste.pt',
    token_hash: crypto.createHash('sha256').update(token).digest('hex'),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used: false,
    created_at: new Date().toISOString(),
  }];

  const sql = {
    async transaction(fn) {
      const original = { ...rows[0] };
      try {
        return await fn({
          async query(text, params) {
            calls.push({ text, params });
            if (/SELECT[\s\S]*FROM tango_company_email_verifications[\s\S]*FOR UPDATE/i.test(String(text))) {
              return { rows: rows.slice() };
            }
            if (/UPDATE tango_company_email_verifications/i.test(String(text))) {
              rows[0].used = true;
              return { rows: [{ ...rows[0] }] };
            }
            if (/UPDATE tango_registration_requests/i.test(String(text))) {
              throw new Error('registration update failed');
            }
            return { rows: [] };
          },
        });
      } catch (error) {
        rows[0] = original;
        throw error;
      }
    },
  };

  await assert.rejects(
    () => verifyCompanyEmailToken({
      sql,
      token,
      requestId: 'req-1',
      nif: '123456789',
    }),
    /registration update failed|não foi possível|pedido/i
  );

  assert.equal(rows[0].used, false);
  assert.ok(calls.some(call => /UPDATE tango_company_email_verifications/i.test(String(call.text))));
  assert.ok(calls.some(call => /UPDATE tango_registration_requests/i.test(String(call.text))));
});
