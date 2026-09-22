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
