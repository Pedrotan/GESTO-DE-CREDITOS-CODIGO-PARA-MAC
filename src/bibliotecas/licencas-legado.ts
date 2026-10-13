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

// Início de todas as chaves assinadas: base64 de '{"payload'.
const KEY_START = 'eyJwYXlsb2Fk';

const decodesToKey = (candidate: string) => {
    try {
        const wrapper = JSON.parse(atob(candidate));
        return typeof wrapper?.payload === 'string' && typeof wrapper?.signature === 'string';
    } catch {
        return false;
    }
};

/**
 * Chaves de licença coladas num texto (do certificado PDF, das Definições do ERP, de um e-mail ou de uma cópia de
 * segurança do Master): ignora espaços e quebras de linha e separa várias chaves seguidas.
 */
export const extractLicenseKeysFromText = (text: string): string[] => {
    const compact = String(text || '').replace(/\s+/g, '');
    const found: string[] = [];
    let start = compact.indexOf(KEY_START);
    while (start !== -1) {
        const next = compact.indexOf(KEY_START, start + KEY_START.length);
        let segment = compact.slice(start, next === -1 ? undefined : next);
        const end = segment.search(/[^A-Za-z0-9+/=]/);
        if (end !== -1) segment = segment.slice(0, end);
        // O texto a seguir à chave pode ter letras: procura o maior começo que seja uma chave completa.
        for (let length = segment.length - (segment.length % 4); length >= 100; length -= 4) {
            const candidate = segment.slice(0, length);
            if (decodesToKey(candidate)) { found.push(candidate); break; }
        }
        start = next;
    }
    return [...new Set(found)];
};

/** Identificador e NIF de uma chave antiga, lidos da própria chave (sem verificar a assinatura). */
export const readLegacyKeyFacts = (key: string): { jti: string; nif: string } | null => {
    try {
        const wrapper = JSON.parse(atob(normalizeLicenseKey(key)));
        const data = JSON.parse(decodeLicensePayload(wrapper.payload));
        return data?.jti ? { jti: String(data.jti).toLowerCase(), nif: String(data.nif || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase() } : null;
    } catch {
        return null;
    }
};
