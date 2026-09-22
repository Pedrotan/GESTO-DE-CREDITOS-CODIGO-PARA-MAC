import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

type Protection = {
    isEncryptionAvailable(): boolean;
    encryptString(value: string): Buffer;
    decryptString(value: Buffer): string;
};

const PORTABLE_MAGIC = 'TANGO_BACKUP_V2';

const encryptAesGcm = (bytes: Buffer, key: Buffer) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') };
};

const decryptAesGcm = (payload: { iv: string; tag: string; data: string }, key: Buffer) => {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
};

const deriveRecoveryKey = (recoveryKey: string, salt: Buffer) => crypto.scryptSync(recoveryKey, salt, 32, {
    N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024
});

export function decodeVerifiedBackup(stored: Buffer, protection: Protection, recoveryKey?: string) {
    try {
        const container = JSON.parse(stored.toString('utf8'));
        if (container?.magic !== PORTABLE_MAGIC || container?.version !== 2) throw new Error('Formato desconhecido.');
        if (!recoveryKey) throw new Error('Este backup requer a chave de recuperacao portatil.');
        const wrapKey = deriveRecoveryKey(recoveryKey, Buffer.from(container.kdf.salt, 'base64'));
        const dataKey = decryptAesGcm(container.wrappedKey, wrapKey);
        const recovered = decryptAesGcm(container.payload, dataKey);
        const checksum = crypto.createHash('sha256').update(recovered).digest('hex');
        if (checksum !== container.checksum) throw new Error('Checksum do backup invalido.');
        return { bytes: recovered, checksum, formatVersion: 2 };
    } catch (error) {
        if (error instanceof SyntaxError || (error instanceof Error && error.message === 'Formato desconhecido.')) {
            if (!protection.isEncryptionAvailable()) throw new Error('O armazenamento seguro do sistema operativo nao esta disponivel.');
            const recovered = Buffer.from(protection.decryptString(stored), 'base64');
            return { bytes: recovered, checksum: crypto.createHash('sha256').update(recovered).digest('hex'), formatVersion: 1 };
        }
        throw error;
    }
}

export async function writeVerifiedBackup(
    destination: string,
    snapshot: (temporaryPath: string) => Promise<unknown>,
    protection: Protection,
    recoveryKey?: string
) {
    if (!protection.isEncryptionAvailable()) throw new Error('O armazenamento seguro do sistema operativo nao esta disponivel.');
    const snapshotPath = `${destination}.${crypto.randomUUID()}.snapshot`;
    const encryptedPath = `${destination}.${crypto.randomUUID()}.partial`;
    try {
        await snapshot(snapshotPath);
        const bytes = fs.readFileSync(snapshotPath);
        if (bytes.length === 0) throw new Error('O backup gerado esta vazio.');
        const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
        let formatVersion = 1;
        let storedBytes: Buffer;
        if (recoveryKey) {
            const dataKey = crypto.randomBytes(32);
            const salt = crypto.randomBytes(16);
            const wrapKey = deriveRecoveryKey(recoveryKey, salt);
            storedBytes = Buffer.from(JSON.stringify({
                magic: PORTABLE_MAGIC,
                version: 2,
                createdAt: new Date().toISOString(),
                checksum,
                cipher: 'AES-256-GCM',
                kdf: { algorithm: 'scrypt', salt: salt.toString('base64'), N: 1 << 15, r: 8, p: 1 },
                wrappedKey: encryptAesGcm(dataKey, wrapKey),
                payload: encryptAesGcm(bytes, dataKey)
            }));
            formatVersion = 2;
        } else storedBytes = protection.encryptString(bytes.toString('base64'));
        fs.writeFileSync(encryptedPath, storedBytes, { mode: 0o600, flag: 'wx' });
        const stored = fs.readFileSync(encryptedPath);
        const recovered = decodeVerifiedBackup(stored, protection, recoveryKey).bytes;
        if (!bytes.equals(recovered)) throw new Error('A verificacao de recuperacao do backup falhou.');
        // A hard link publishes the complete file atomically without overwriting a prior backup.
        fs.linkSync(encryptedPath, destination);
        return { success: true as const, filePath: destination, size: stored.length, checksum, formatVersion, createdAt: new Date().toISOString() };
    } finally {
        for (const temporaryPath of [snapshotPath, encryptedPath]) {
            try { fs.unlinkSync(temporaryPath); }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[Backup] Falha ao limpar ficheiro temporario:', temporaryPath);
            }
        }
    }
}
