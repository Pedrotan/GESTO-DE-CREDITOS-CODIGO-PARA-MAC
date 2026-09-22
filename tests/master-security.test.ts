import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MasterAuthService, generateMasterTotpForTest, validateMasterPassword } from '../electron/master-security.ts';

const recoveryByAuth = new WeakMap<MasterAuthService, string[]>();

const configure = async (auth: MasterAuthService, senderId: number, password: string) => {
    await auth.setup(senderId, password);
    const enrollment = auth.beginMfaEnrollment(senderId);
    const token = generateMasterTotpForTest(enrollment.secret, Math.floor(Date.now() / 30_000));
    const result = auth.confirmMfaEnrollment(senderId, token);
    recoveryByAuth.set(auth, [...(result.recoveryCodes || [])]);
    return result;
};

const login = async (auth: MasterAuthService, senderId: number, password: string) => {
    const passwordResult = await auth.login(senderId, password);
    assert.equal(passwordResult.requiresMfa, true);
    const recoveryCode = recoveryByAuth.get(auth)?.shift();
    assert.ok(recoveryCode);
    return auth.verifyMfa(senderId, recoveryCode);
};

test('credencial mestra usa hash e sessão por remetente', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tango-master-auth-'));
    try {
        const auth = new MasterAuthService(directory);
        assert.equal(auth.status(10).configured, false);
        const enrollment = await configure(auth, 10, 'Senha-Mestra-2026!');
        assert.equal(enrollment.recoveryCodes?.length, 10);
        assert.equal(auth.status(10).authenticated, true);
        assert.equal(auth.status(11).authenticated, false);
        const stored = fs.readFileSync(path.join(directory, 'master-credentials.json'), 'utf8');
        assert.equal(stored.includes('Senha-Mestra-2026!'), false);
        auth.logout(10);
        await assert.rejects(auth.login(10, 'incorreta'), /Credenciais invalidas/);
        assert.equal((await login(auth, 10, 'Senha-Mestra-2026!')).authenticated, true);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('política recusa palavras-passe fracas', () => {
    assert.throws(() => validateMasterPassword('curta'), /12/);
    assert.throws(() => validateMasterPassword('somenteletrasminusculas'), /grupos/);
    assert.equal(validateMasterPassword('Forte-Password-2026'), 'Forte-Password-2026');
});

test('bloqueio persiste entre remetentes e após fechar a janela', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tango-master-auth-'));
    try {
        const auth = new MasterAuthService(directory);
        await configure(auth, 1, 'Senha-Mestra-2026!');
        for (const sender of [1, 2, 3]) {
            await assert.rejects(auth.login(sender, 'incorreta'), /Credenciais invalidas/);
            auth.revokeSender(sender);
        }
        await assert.rejects(auth.login(4, 'Senha-Mestra-2026!'), /Demasiadas tentativas/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('sessões expiram por inatividade e pelo limite absoluto', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tango-master-auth-'));
    let now = Date.now();
    t.mock.method(Date, 'now', () => now);
    try {
        const auth = new MasterAuthService(directory);
        await configure(auth, 1, 'Senha-Mestra-2026!');
        now += 30 * 60 * 1000;
        assert.equal(auth.status(1).authenticated, false);
        await login(auth, 1, 'Senha-Mestra-2026!');
        for (let step = 0; step < 47; step++) {
            now += 10 * 60 * 1000;
            auth.assertAuthenticated(1);
        }
        now += 10 * 60 * 1000;
        assert.throws(() => auth.assertAuthenticated(1), /expirada/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('alteração de senha revoga outras sessões e invalida a senha anterior', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tango-master-auth-'));
    try {
        const auth = new MasterAuthService(directory);
        await configure(auth, 1, 'Senha-Mestra-2026!');
        await login(auth, 2, 'Senha-Mestra-2026!');
        await auth.changePassword(1, 'Senha-Mestra-2026!', 'Nova-Senha-Mestra-2026!');
        assert.equal(auth.status(2).authenticated, false);
        await assert.rejects(auth.login(2, 'Senha-Mestra-2026!'), /Credenciais invalidas/);
        assert.equal((await login(auth, 2, 'Nova-Senha-Mestra-2026!')).authenticated, true);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('logout durante login não recria sessão e pedidos concorrentes são limitados', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tango-master-auth-'));
    try {
        const auth = new MasterAuthService(directory);
        await configure(auth, 1, 'Senha-Mestra-2026!');
        const pending = auth.login(1, 'Senha-Mestra-2026!');
        await assert.rejects(auth.login(2, 'Senha-Mestra-2026!'), /em curso/);
        auth.logout(1);
        assert.equal((await pending).authenticated, false);
        await assert.rejects(auth.setup(3, 'Outra-Senha-Mestra!'), /ja foi configurada/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
