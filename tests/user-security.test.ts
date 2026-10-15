import assert from 'node:assert/strict';
import test from 'node:test';
import { assertFinancialReadPermission, assertFinancialWritePermission, financialReadTargets, financialStatementTarget, generateTotpForTest, userReadExposesSecrets, userStatementKind, userUpdateTouchesPrivileges, UserSessionService } from '../electron/user-security.ts';

const user = { id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'admin', permissions: '["payments.create"]' };

test('códigos TOTP seguem o vetor público RFC 6238', () => {
    assert.equal(generateTotpForTest('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1), '287082');
});

test('sessão de utilizador é mantida no processo e não expõe segredo MFA', () => {
    const service = new UserSessionService();
    const result = service.begin(10, user);
    assert.equal(result.authenticated, true);
    assert.equal(service.status(10).authenticated, true);
    assert.deepEqual(service.assertAuthenticated(10).permissions, ['payments.create']);
    service.revokeSender(10);
    assert.equal(service.status(10).authenticated, false);
});

test('leitura e escrita financeiras exigem permissões distintas', () => {
    assert.equal(financialStatementTarget('SELECT * FROM payments'), null);
    assert.equal(financialStatementTarget('INSERT INTO payments (id) VALUES (?)'), 'payments');
    assert.equal(financialStatementTarget('UPDATE credits SET status = ? WHERE id = ?'), 'credits');
    assert.deepEqual(financialReadTargets('WITH recent AS (SELECT * FROM credits) SELECT * FROM recent JOIN payments ON payments.creditId = recent.id'), ['credits', 'payments']);
    assert.equal(financialStatementTarget('INSERT INTO payments (id) SELECT id FROM payments_old'), 'payments');
    assert.equal(financialStatementTarget('INSERT INTO payments (id) SELECT id FROM payments_old', true), null);
    assert.equal(financialStatementTarget('ALTER TABLE payments ADD COLUMN legacy TEXT'), 'payments');
    assert.equal(financialStatementTarget('ALTER TABLE payments ADD COLUMN legacy TEXT', true), null);
    assert.equal(financialStatementTarget('ALTER TABLE payments RENAME TO payments_old'), 'payments');
    assert.equal(financialStatementTarget('DROP TABLE payments_old'), 'payments');
    assert.equal(financialStatementTarget('CREATE TABLE IF NOT EXISTS ledger_lines (id TEXT)'), 'ledger_lines');
    const viewer = { role: 'viewer', permissions: [] };
    const creditManager = { role: 'manager', permissions: ['manage_credits', 'view_credits'] };
    const cashier = { role: 'manager', permissions: ['manage_payments'] };
    const paymentBatch = [
        { sql: 'INSERT INTO payments (id) VALUES (?)' },
        { sql: 'UPDATE credits SET currentBalance = ? WHERE id = ?' },
        { sql: 'INSERT INTO accounting_entries (id) VALUES (?)' },
        { sql: 'INSERT INTO ledger_transactions (id) VALUES (?)' },
        { sql: 'INSERT INTO ledger_lines (id) VALUES (?)' },
        { sql: 'INSERT INTO audit_logs (id) VALUES (?)' },
    ];
    assert.throws(() => assertFinancialWritePermission(null, 'payments'), /Sessão/);
    assert.throws(() => assertFinancialWritePermission(viewer, 'payments'), /permissão/);
    assert.throws(() => assertFinancialWritePermission(viewer, 'credits'), /permissão/);
    assert.throws(() => assertFinancialWritePermission(viewer, 'credit_installments'), /permissão/);
    assert.throws(() => assertFinancialWritePermission({ role: 'manager', permissions: ['unknown'] }, 'credits'), /permissão/);
    assert.doesNotThrow(() => assertFinancialWritePermission(creditManager, 'credits'));
    assert.doesNotThrow(() => assertFinancialWritePermission(creditManager, 'credit_installments'));
    assert.throws(() => assertFinancialWritePermission(creditManager, 'payments'), /permissão/);
    assert.doesNotThrow(() => assertFinancialWritePermission(cashier, 'payments'));
    assert.throws(() => assertFinancialWritePermission(cashier, 'credits'), /permissão/);
    assert.throws(() => assertFinancialWritePermission(cashier, 'credits', paymentBatch.slice(0, 2)), /permissão/);
    assert.doesNotThrow(() => assertFinancialWritePermission(cashier, 'credits', paymentBatch));
    assert.throws(() => assertFinancialReadPermission(null, 'credits'), /Sessão/);
    assert.throws(() => assertFinancialReadPermission(viewer, 'credits'), /permissão/);
    assert.doesNotThrow(() => assertFinancialReadPermission({ role: 'viewer', permissions: ['view_credits'] }, 'credits'));
    assert.doesNotThrow(() => assertFinancialReadPermission({ role: 'viewer', permissions: ['view_reports'] }, 'payments'));
    assert.throws(() => assertFinancialReadPermission(viewer, 'unknown'), /permissão/);
    assert.doesNotThrow(() => assertFinancialWritePermission({ role: 'admin', permissions: [] }, 'credits'));
});

test('consultas do renderer não podem extrair hashes ou segredos MFA', () => {
    assert.equal(userReadExposesSecrets('SELECT id, name, role FROM users'), false);
    assert.equal(userReadExposesSecrets('SELECT COUNT(*) AS total FROM users'), false);
    assert.equal(userReadExposesSecrets('SELECT * FROM users WHERE id = ?'), true);
    assert.equal(userReadExposesSecrets('SELECT u.* FROM users u'), true);
    assert.equal(userReadExposesSecrets('SELECT id, password FROM users'), true);
    assert.equal(userReadExposesSecrets('SELECT twoFactorSecret FROM users WHERE id = ?'), true);
    assert.equal(userReadExposesSecrets('SELECT mfaRecoveryCodes FROM users WHERE id = ?'), true);
});

test('alterações de utilizadores distinguem perfil próprio de privilégios', () => {
    assert.equal(userStatementKind('INSERT INTO users (id) VALUES (?)'), 'insert');
    assert.equal(userStatementKind('UPDATE users SET name = ? WHERE id = ?'), 'update');
    assert.equal(userStatementKind('DELETE FROM users WHERE id = ?'), 'delete');
    assert.equal(userStatementKind('ALTER TABLE users ADD COLUMN lastSeen TEXT'), 'schema');
    assert.equal(userUpdateTouchesPrivileges('UPDATE users SET name = ?, avatar = ? WHERE id = ?'), false);
    assert.equal(userUpdateTouchesPrivileges('UPDATE users SET role = ?, permissions = ? WHERE id = ?'), true);
    assert.equal(userUpdateTouchesPrivileges('UPDATE users SET twoFactorSecret = ? WHERE id = ?'), true);
});

test('MFA cria sessão apenas após código válido e impede repetição', (t) => {
    const service = new UserSessionService();
    let now = 1_800_000_000_000;
    t.mock.method(Date, 'now', () => now);
    const secret = 'JBSWY3DPEHPK3PXP';
    const begin = service.begin(20, { ...user, twoFactorEnabled: true, twoFactorSecret: secret });
    assert.equal(begin.requires2FA, true);
    assert.equal(service.status(20).authenticated, false);
    const token = generateTotpForTest(secret, Math.floor(now / 30_000));
    const verified = service.verifyTotp(20, user.id, token);
    assert.equal(verified.authenticated, true);
    assert.equal('twoFactorSecret' in (verified.user || {}), false);
    service.revokeSender(20);
    service.begin(20, { ...user, twoFactorEnabled: true, twoFactorSecret: secret });
    assert.equal(service.verifyTotp(20, user.id, token).reason, 'replayed_code');
    now += 5 * 60 * 1000 + 1;
    assert.equal(service.verifyTotp(20, user.id, token).reason, 'challenge_expired');
});

test('ativa e desativa MFA dentro da sessão sem expor o segredo no utilizador', (t) => {
    const service = new UserSessionService();
    let now = 1_800_000_000_000;
    t.mock.method(Date, 'now', () => now);
    service.begin(30, user);
    const enrollment = service.beginMfaEnrollment(30);
    assert.match(enrollment.secret, /^[A-Z2-7]{32}$/);
    assert.match(enrollment.qrCode, /^otpauth:\/\/totp\//);
    assert.equal(service.confirmMfaEnrollment(30, '000000').confirmed, false);
    const enableToken = generateTotpForTest(enrollment.secret, Math.floor(now / 30_000));
    const confirmation = service.confirmMfaEnrollment(30, enableToken);
    assert.equal(confirmation.confirmed, true);
    const publicUser = service.updateMfaState(30, true);
    assert.equal(publicUser.twoFactorEnabled, true);
    assert.equal('twoFactorSecret' in publicUser, false);
    assert.equal(service.verifyMfaForSession(30, enrollment.secret, enableToken), false);
    now += 30_000;
    const disableToken = generateTotpForTest(enrollment.secret, Math.floor(now / 30_000));
    assert.equal(service.verifyMfaForSession(30, enrollment.secret, disableToken), true);
});

test('distingue código incorreto de QR expirado na ativação MFA', (t) => {
    const service = new UserSessionService();
    let now = 1_800_000_000_000;
    t.mock.method(Date, 'now', () => now);
    service.begin(31, user, true);
    const enrollment = service.beginMfaEnrollment(31);
    assert.equal(service.confirmMfaEnrollment(31, '000000').reason, 'invalid_code');
    now += 15 * 60 * 1000 + 1;
    const expiredToken = generateTotpForTest(enrollment.secret, Math.floor(now / 30_000));
    assert.equal(service.confirmMfaEnrollment(31, expiredToken).reason, 'qr_expired');
});

test('sessão MFA pode ser concluída uma única vez por recuperação autorizada', () => {
    const service = new UserSessionService();
    service.begin(40, { ...user, twoFactorEnabled: true, twoFactorSecret: 'JBSWY3DPEHPK3PXP' });
    assert.equal(service.hasPendingMfa(40, user.id), true);
    const recovered = service.completeMfaRecovery(40, user.id);
    assert.equal(recovered.authenticated, true);
    assert.equal(recovered.recovered, true);
    assert.equal(service.completeMfaRecovery(40, user.id).authenticated, false);
});

test('super administrador sem MFA recebe apenas sessão restrita até concluir o enrolamento', (t) => {
    const service = new UserSessionService();
    const now = 1_800_000_000_000;
    t.mock.method(Date, 'now', () => now);
    const result = service.begin(50, { ...user, role: 'super_admin' }, true);
    assert.equal(result.authenticated, false);
    assert.equal(result.requiresMfaEnrollment, true);
    assert.equal(service.status(50).authenticated, false);
    assert.throws(() => service.assertAuthenticated(50), /Sessão/);
    const enrollment = service.beginMfaEnrollment(50);
    const token = generateTotpForTest(enrollment.secret, Math.floor(now / 30_000));
    assert.equal(service.confirmMfaEnrollment(50, token).confirmed, true);
    service.updateMfaState(50, true);
    assert.equal(service.status(50).authenticated, true);
});
