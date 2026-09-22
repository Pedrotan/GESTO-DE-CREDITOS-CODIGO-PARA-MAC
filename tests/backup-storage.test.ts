import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { decodeVerifiedBackup, writeVerifiedBackup } from '../electron/backup-storage.ts';

// Exercise the filesystem pipeline with authenticated encryption; Electron supplies safeStorage in production.
function protection() {
    const key = crypto.randomBytes(32);
    return {
        isEncryptionAvailable: () => true,
        encryptString(value: string) {
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
            return Buffer.concat([iv, cipher.getAuthTag(), data]);
        },
        decryptString(value: Buffer) {
            const cipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
            cipher.setAuthTag(value.subarray(12, 28));
            return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString('utf8');
        }
    };
}

test('backup é recuperável, verificado e publicado sem temporários', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tango-backup-'));
    try {
        const bytes = crypto.randomBytes(4096);
        const destination = path.join(directory, 'backup.encrypted');
        const codec = protection();
        const result = await writeVerifiedBackup(destination, async file => fs.writeFileSync(file, bytes), codec);
        assert.deepEqual(Buffer.from(codec.decryptString(fs.readFileSync(destination)), 'base64'), bytes);
        assert.equal(result.checksum, crypto.createHash('sha256').update(bytes).digest('hex'));
        assert.equal(result.size, fs.statSync(destination).size);
        assert.deepEqual(fs.readdirSync(directory), ['backup.encrypted']);
        await assert.rejects(writeVerifiedBackup(destination, async file => fs.writeFileSync(file, 'new'), codec));
        assert.deepEqual(Buffer.from(codec.decryptString(fs.readFileSync(destination)), 'base64'), bytes);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('falhas de proteção, snapshot e recuperação não publicam backups nem deixam temporários', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tango-backup-'));
    try {
        const destination = path.join(directory, 'backup.encrypted');
        const codec = protection();
        let requested = false;
        await assert.rejects(writeVerifiedBackup(destination, async () => { requested = true; },
            { ...codec, isEncryptionAvailable: () => false }), /nao esta disponivel/);
        assert.equal(requested, false);
        await assert.rejects(writeVerifiedBackup(destination, async file => {
            fs.writeFileSync(file, 'incomplete');
            throw new Error('Snapshot falhou');
        }, codec), /Snapshot falhou/);
        await assert.rejects(writeVerifiedBackup(destination, async file => fs.writeFileSync(file, ''), codec), /vazio/);
        await assert.rejects(writeVerifiedBackup(destination, async file => fs.writeFileSync(file, 'data'),
            { ...codec, decryptString: () => Buffer.from('corrupted').toString('base64') }), /recuperacao/);
        assert.deepEqual(fs.readdirSync(directory), []);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('backup portátil restaura com chave de recuperação noutro dispositivo', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tango-portable-backup-'));
    try {
        const bytes = crypto.randomBytes(8192);
        const destination = path.join(directory, 'portable.encrypted');
        const recoveryKey = 'TGRK-' + crypto.randomBytes(32).toString('base64url');
        const result = await writeVerifiedBackup(destination, async file => fs.writeFileSync(file, bytes), protection(), recoveryKey);
        assert.equal(result.formatVersion, 2);
        const otherDeviceProtection = protection();
        assert.deepEqual(decodeVerifiedBackup(fs.readFileSync(destination), otherDeviceProtection, recoveryKey).bytes, bytes);
        assert.throws(() => decodeVerifiedBackup(fs.readFileSync(destination), otherDeviceProtection, 'TGRK-chave-incorreta'));
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
