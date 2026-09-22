import assert from 'node:assert/strict';
import test from 'node:test';
import { assertFinancialPermission, financialStatementTarget, generateTotpForTest, userReadExposesSecrets, userStatementKind, userUpdateTouchesPrivileges, UserSessionService } from '../electron/user-security.ts';

const user = { id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'admin', permissions: '["payments.create"]' };

test('sessão de utilizador é mantida no processo e não expõe segredo MFA', () => {
    const service = new UserSessionService();
    const result = service.begin(10, user);
    assert.equal(result.authenticated, true);
    assert.equal(service.status(10).authenticated, true);
    assert.deepEqual(service.assertAuthenticated(10).permissions, ['payments.create']);
    service.revokeSender(10);
    assert.equal(service.status(10).authenticated, false);
});

test('operações financeiras exigem sessão e permissão de pagamentos', () => {
    assert.equal(financialStatementTarget('SELECT * FROM payments'), null);
    assert.equal(financialStatementTarget('INSERT INTO payments (id) VALUES (?)'), 'payments');
    assert.equal(financialStatementTarget('UPDATE credits SET status = ? WHERE id = ?'), 'credits');
    assert.equal(financialStatementTarget('INSERT INTO payments (id) SELECT id FROM payments_old'), 'payments');
    assert.equal(financialStatementTarget('INSERT INTO payments (id) SELECT id FROM payments_old', true), null);
    assert.equal(financialStatementTarget('ALTER TABLE payments ADD COLUMN legacy TEXT'), 'payments');
    assert.equal(financialStatementTarget('ALTER TABLE payments ADD COLUMN legacy TEXT', true), null);
    assert.equal(financialStatementTarget('ALTER TABLE payments RENAME TO payments_old'), 'payments');
    assert.equal(financialStatementTarget('DROP TABLE payments_old'), 'payments');
    assert.equal(financialStatementTarget('CREATE TABLE IF NOT EXISTS ledger_lines (id TEXT)'), 'ledger_lines');
    assert.throws(() => assertFinancialPermission(null, 'payments'), /Sessão/);
    assert.throws(() => assertFinancialPermission({ role: 'viewer', permissions: [] }, 'payments'), /permissão/);
    assert.doesNotThrow(() => assertFinancialPermission({ role: 'manager', permissions: ['manage_payments'] }, 'payments'));
    assert.doesNotThrow(() => assertFinancialPermission({ role: 'viewer', permissions: [] }, 'credits'));
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
    const now = 1_800_000_000_000;
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
    assert.equal(service.verifyTotp(20, user.id, token).authenticated, false);
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
