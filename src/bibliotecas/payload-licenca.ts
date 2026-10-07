export const LICENSE_KID = 'tango-license-2026-01';
export const LICENSE_TYPES = ['monthly', 'quarterly', 'biannual', 'annual', 'lifetime', 'trial'] as const;
export const LICENSE_TIERS = ['singular', 'empresarial'] as const;

export function validateSignedLicensePayload(data: any, now = Date.now()) {
    const issuedAt = new Date(data?.iat);
    const expiration = new Date(data?.exp);
    if (data?.alg !== 'RS256' || data?.licenseVersion !== 2 || data?.kid !== LICENSE_KID ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(String(data?.jti || '')) ||
        !LICENSE_TYPES.includes(data?.type) || !LICENSE_TIERS.includes(data?.tier) ||
        !Number.isFinite(issuedAt.getTime()) || !Number.isFinite(expiration.getTime()) ||
        issuedAt.getTime() > now + 5 * 60_000 || expiration.getTime() <= issuedAt.getTime() ||
        (data.devices !== undefined && (!Number.isSafeInteger(data.devices) || data.devices < 1 || data.devices > 10_000)) ||
        typeof data.mid !== 'string' || data.mid.length < 3 || data.mid.length > 200) {
        throw new Error('Campos assinados da licença são inválidos.');
    }
    return { issuedAt, expiration };
}

export function canonicalizeLicensePayload(data: Record<string, unknown>) {
    validateSignedLicensePayload(data);
    return JSON.stringify(Object.fromEntries(Object.keys(data).sort().map(key => [key, data[key]])));
}

const cleanNif = (value: unknown) => String(value ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
// NIF de consumidor final usado pelo Tango Master quando a licença não é emitida para uma empresa.
const GENERIC_NIF = '999999999';

/**
 * Uma licença assinada vale neste dispositivo quando é global, quando foi emitida para esta máquina,
 * ou quando foi emitida para o NIF desta empresa — neste caso vale em todos os dispositivos da empresa
 * (computadores e versão web), para que basta activá-la num deles.
 */
export function licenseAppliesToDevice(data: { mid?: unknown; nif?: unknown }, currentMachineId: string, companyNif?: string | null) {
    if (data.mid === 'GLOBAL' || data.mid === currentMachineId) return true;
    const licenseNif = cleanNif(data.nif);
    return licenseNif.length >= 9 && licenseNif !== GENERIC_NIF && licenseNif === cleanNif(companyNif);
}

/** Base64 de texto UTF-8 (btoa sozinho trata o texto como Latin-1 e estraga os acentos). */
export function encodeLicensePayload(json: string): string {
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
}

/** Lê o conteúdo base64 da licença como UTF-8 (o processo principal assina sempre em UTF-8). */
export function decodeLicensePayload(base64: string): string {
    const binary = atob(base64.replace(/\s+/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

/** Chave colada de um PDF ou email: remove espaços e quebras de linha (não existem numa chave base64). */
export const normalizeLicenseKey = (key: unknown) => String(key ?? '').replace(/\s+/g, '');

/** Servidor Master da rede local (http, não a nuvem), o único que regista a activação de cada licença. */
export const isLanLicenseServer = (url?: string | null) => /^http:\/\//i.test(String(url || '').trim());
