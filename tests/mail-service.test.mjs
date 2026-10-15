import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { loadMailConfig, MailConfigurationError, smtpTransportOptions } from '../server/mail-config.mjs';
import { createMailService } from '../server/mail-service.mjs';
import { createMailTemplates } from '../server/mail-templates.mjs';

const configuredEnv = overrides => ({
    NODE_ENV: 'production',
    MAIL_ENABLED: 'true',
    MAIL_QUEUE_ENABLED: 'false',
    MAIL_HOST: 'mail.example.test',
    MAIL_PORT: '587',
    MAIL_ENCRYPTION: 'starttls',
    MAIL_USERNAME: 'smtp-user-to-be-configured',
    MAIL_PASSWORD: randomBytes(24).toString('base64url'),
    MAIL_FROM_ADDRESS: 'noreply@example.test',
    MAIL_FROM_NAME: 'Tango Gestão de Créditos',
    MAIL_SUPPORT_ADDRESS: 'support@example.test',
    MAIL_SUPPORT_NAME: 'Tango Support',
    MAIL_CONNECT_TIMEOUT: '10',
    MAIL_SEND_TIMEOUT: '30',
    APP_URL: 'https://tango.example.test',
    ...overrides,
});

test('mail stays disabled by default and does not initialize a transport', async () => {
    let transportCreated = false;
    const service = createMailService({ createTransport: () => { transportCreated = true; } });
    assert.equal(service.status, 'disabled');
    assert.deepEqual(await service.send({ to: 'user@example.test', subject: 'Test', text: 'Test' }), {
        status: 'disabled', code: 'mail_disabled',
    });
    assert.equal(transportCreated, false);
});

test('enabled configuration distinguishes missing, invalid and unsupported queue configuration', () => {
    assert.throws(() => loadMailConfig({ MAIL_ENABLED: 'true' }), error => error.code === 'MAIL_CONFIGURATION_MISSING');
    assert.throws(() => loadMailConfig(configuredEnv({ MAIL_ENABLED: 'yes' })), error => error.code === 'MAIL_CONFIGURATION_INVALID');
    assert.throws(() => loadMailConfig(configuredEnv({ MAIL_MAILER: 'sendmail' })), error => error.code === 'MAIL_CONFIGURATION_INVALID');
    assert.throws(() => loadMailConfig(configuredEnv({ MAIL_QUEUE_ENABLED: 'true' })), error => error.code === 'MAIL_QUEUE_UNAVAILABLE');
    assert.throws(() => loadMailConfig(configuredEnv({ MAIL_PORT: '587', MAIL_ENCRYPTION: 'tls' })), error => error.code === 'MAIL_TLS_CONFIGURATION_INVALID');
    assert.throws(() => loadMailConfig(configuredEnv({ MAIL_PORT: '587', MAIL_ENCRYPTION: 'ssl' })), error => error.code === 'MAIL_TLS_CONFIGURATION_INVALID');
    assert.throws(() => loadMailConfig(configuredEnv({ APP_URL: 'http://tango.example.test' })), error => error.code === 'MAIL_APP_URL_INVALID');
});

test('port 587 uses STARTTLS and validates the SMTP certificate', () => {
    const options = smtpTransportOptions(loadMailConfig(configuredEnv()));
    assert.equal(options.port, 587);
    assert.equal(options.secure, false);
    assert.equal(options.requireTLS, true);
    assert.equal(options.tls.rejectUnauthorized, true);
    assert.equal(options.tls.minVersion, 'TLSv1.2');
});

test('fake transport sends an allowlisted message and emits metadata without recipient or body', async () => {
    let transportOptions;
    let sentMessage;
    const events = [];
    const service = createMailService({
        env: configuredEnv(),
        createTransport: options => {
            transportOptions = options;
            return { sendMail: async message => { sentMessage = message; return { messageId: 'mock-id' }; } };
        },
        onEvent: event => events.push(event),
    });
    const result = await service.send({ kind: 'password_reset', to: 'user@example.test', subject: 'Reset', text: 'Plain text' });
    assert.deepEqual(result, { status: 'sent', messageId: 'mock-id' });
    assert.equal(transportOptions.auth.user, 'smtp-user-to-be-configured');
    assert.equal(sentMessage.from.address, 'noreply@example.test');
    assert.equal(sentMessage.replyTo.address, 'support@example.test');
    assert.deepEqual(Object.keys(events[0]).sort(), ['kind', 'occurredAt', 'status']);
    assert.equal(events[0].status, 'sent');
});

test('header injection and unsupported message kinds are rejected before transport', async () => {
    let sendCount = 0;
    const service = createMailService({
        env: configuredEnv(),
        createTransport: () => ({ sendMail: async () => { sendCount += 1; } }),
    });
    assert.equal((await service.send({ kind: 'unknown', to: 'user@example.test', subject: 'x', text: 'x' })).status, 'rejected');
    assert.equal((await service.send({ kind: 'transactional', to: 'user@example.test', subject: 'x\r\nBcc:attacker@example.test', text: 'x' })).status, 'rejected');
    assert.equal(sendCount, 0);
});

test('SMTP failure returns a safe code and never exposes the transport error', async () => {
    const events = [];
    const service = createMailService({
        env: configuredEnv(),
        createTransport: () => ({ sendMail: async () => { throw Object.assign(new Error('sensitive transport detail'), { code: 'EAUTH' }); } }),
        onEvent: event => events.push(event),
    });
    const result = await service.send({ kind: 'login_notification', to: 'user@example.test', subject: 'Login', text: 'Login notice' });
    assert.deepEqual(result, { status: 'failed', code: 'smtp_rejected' });
    assert.equal(JSON.stringify(events).includes('sensitive transport detail'), false);
});

test('templates escape dynamic data, provide text alternatives and reject foreign links', () => {
    const templates = createMailTemplates({ appUrl: 'https://tango.example.test', production: true });
    const verification = templates.verification({ name: '<script>alert(1)</script>', link: 'https://tango.example.test/#/verify?token=opaque' });
    assert.equal(verification.kind, 'email_verification');
    assert.equal(verification.html.includes('<script>'), false);
    assert.match(verification.text, /https:\/\/tango\.example\.test/);
    assert.throws(() => templates.passwordReset({ link: 'https://other.example/reset' }), /MAIL_LINK_INVALID/);
    assert.equal(templates.loginNotification({ occurredAt: '2026-10-09 12:00', device: 'Desktop', browser: 'Tango' }).kind, 'login_notification');
    assert.equal(templates.passwordChanged({ occurredAt: '2026-10-09 12:00' }).kind, 'password_changed');
    assert.equal(templates.suspiciousActivity({ occurredAt: '2026-10-09 12:00', summary: 'Novo dispositivo' }).kind, 'security_alert');
    assert.equal(templates.emailChanged({ newEmail: 'new@example.test', occurredAt: '2026-10-09 12:00' }).kind, 'email_changed');
    assert.equal(templates.adminNotification({ title: 'Pedido', summary: 'A aguardar aprovação' }).kind, 'admin_notification');
});