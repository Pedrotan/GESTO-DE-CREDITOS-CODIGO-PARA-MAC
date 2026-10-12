import { decodeLicensePayload, normalizeLicenseKey } from './payload-licenca.ts';

// Chaves assinadas emitidas pelo Tango Master (guardadas só neste computador) convertidas nos metadados que o
// servidor precisa para as fundir na licença única de cada empresa. A chave em claro nunca é enviada: só o hash.

export type LegacyKeyRecord = { key: string; status?: 'active' | 'migrated' };

export type LegacyKeyForImport = {
    jti: string;
    nif: string;
    mid: string;
    type: string;
    tier: string;
    exp: string;
    iat?: string;
    devices: number;
    keyHash: string;
    status: 'active' | 'migrated';
};

const sha256Hex = async (text: string) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

/** Lê as chaves dos registos do Master; as ilegíveis (formato antigo) são contadas à parte. */
export const legacyKeysForImport = async (records: LegacyKeyRecord[]) => {
    const keys: LegacyKeyForImport[] = [];
    let unreadable = 0;
    const seen = new Set<string>();
    for (const record of records) {
        try {
            const key = normalizeLicenseKey(record.key);
            const wrapper = JSON.parse(atob(key));
            const data = JSON.parse(decodeLicensePayload(wrapper.payload));
            if (!data?.jti || seen.has(data.jti)) continue;
            seen.add(data.jti);
            keys.push({
                jti: String(data.jti),
                nif: String(data.nif || ''),
                mid: String(data.mid || ''),
                type: String(data.type || ''),
                tier: String(data.tier || ''),
                exp: String(data.exp || ''),
                iat: data.iat ? String(data.iat) : undefined,
                devices: Number(data.devices || 1),
                keyHash: await sha256Hex(key),
                status: record.status === 'migrated' ? 'migrated' : 'active',
            });
        } catch {
            unreadable += 1;
        }
    }
    return { keys, unreadable };
};
