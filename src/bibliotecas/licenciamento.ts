import { differenceInDays, parseISO, isValid, isBefore, format } from 'date-fns';
import { verifySignature, importPublicKey } from './crypto_layer';
import { decodeLicensePayload, licenseAppliesToDevice, normalizeLicenseKey, validateSignedLicensePayload } from './payload-licenca';
import { cloudStatusToLicenseInfo, getCloudLicenseStatus, isCloudLicenseKey } from './licenca-nuvem-cliente';
export { cloudStatusToLicenseInfo };

// Chave Pública do Tango Master: definida em chave-publica-licencas.ts (usada também pelo processo principal).
import { MASTER_PUBLIC_KEY, MASTER_PUBLIC_KEYS } from './chave-publica-licencas';
export { MASTER_PUBLIC_KEY, MASTER_PUBLIC_KEYS };

/**
 * Chaves públicas aceites para validar licenças: a do Tango Master deste computador (quando existe) e as
 * embutidas na aplicação (actual e anteriores), para que as licenças emitidas com uma chave antiga continuem válidas.
 */
let cachedPublicKeys: string[] | null = null;

export const getPublicLicenseKeys = async (): Promise<string[]> => {
    if (cachedPublicKeys) return cachedPublicKeys;
    const keys: string[] = [];
    if ((window as any).electronAPI?.readLicenseKeys) {
        try {
            const response = await (window as any).electronAPI.readLicenseKeys();
            if (response?.success && response.publicKey) keys.push(response.publicKey);
        } catch {
            // Só o Tango Master lê a chave do disco; o ERP usa as embutidas.
        }
    }
    cachedPublicKeys = [...keys, ...MASTER_PUBLIC_KEYS];
    return cachedPublicKeys;
};

export const getPublicLicenseKey = async (): Promise<string> => (await getPublicLicenseKeys())[0] || MASTER_PUBLIC_KEY;

const invalidLicense = (message: string): LicenseInfo => ({
    isValid: false,
    type: 'trial',
    tier: 'singular',
    expirationDate: new Date(),
    status: 'invalid',
    daysRemaining: 0,
    message
});

/** Explica porque é que o texto colado não é uma chave de licença assinada. */
const unreadableKeyMessage = (key: string) => {
    if (/^TG-?[A-Z0-9]{4}-?[A-Z0-9]{4}$/iu.test(key)) {
        return 'Isto é o Código de Acesso à nuvem da empresa (TG-…), não a chave de licença. Use-o em "Ligar à versão web" e cole aqui a chave de licença (começa por "eyJ").';
    }
    if (!key.startsWith('ey') && !key.startsWith('{')) {
        return `A chave de licença começa por "eyJ" e tem mais de 1000 caracteres; o texto colado começa por "${key.slice(0, 6)}". Copie a chave inteira no Tango Master (botão Copiar) ou o bloco completo do certificado.`;
    }
    return `A chave de licença está incompleta ou foi alterada (${key.length} caracteres colados). Copie-a de novo no Tango Master, com o botão Copiar.`;
};

const GLOBAL_LICENSE_STORAGE_KEY = 'tango_global_license_key_v1';

// NIF da empresa activa: uma licença emitida para este NIF vale em todos os dispositivos da empresa.
let activeCompanyNif = '';
export const setActiveLicenseCompanyNif = (nif?: string | null) => { activeCompanyNif = String(nif || ''); };

export const getGlobalLicenseKey = (): string => {
    if (typeof localStorage === 'undefined') return '';
    return (localStorage.getItem(GLOBAL_LICENSE_STORAGE_KEY) || '').trim();
};

export const setGlobalLicenseKey = (key: string | null | undefined) => {
    if (typeof localStorage === 'undefined') return;
    const cleanKey = String(key || '').trim();
    if (cleanKey) {
        localStorage.setItem(GLOBAL_LICENSE_STORAGE_KEY, cleanKey);
    } else {
        localStorage.removeItem(GLOBAL_LICENSE_STORAGE_KEY);
    }
};

const getLicenseTypeFromRawKey = (key: string): string | null => {
    const cleanKey = String(key || '').trim();
    if (!cleanKey) return null;

    try {
        let licenseObject: any = null;
        if (cleanKey.startsWith('{')) {
            licenseObject = JSON.parse(cleanKey);
        } else if (cleanKey.startsWith('ey')) {
            const decoded = atob(cleanKey);
            if (decoded.startsWith('{')) licenseObject = JSON.parse(decoded);
        }

        if (licenseObject?.payload) {
            const payload = JSON.parse(atob(licenseObject.payload));
            return payload?.type || null;
        }
    } catch {
        // continue with legacy parsing
    }

    try {
        const decoded = atob(cleanKey);
        const parts = decoded.split('|');
        return parts[1] || null;
    } catch {
        return null;
    }
};

export const resolveLicenseKey = (accountLicenseKey?: string | null): string => {
    const globalKey = getGlobalLicenseKey();
    const accountKey = String(accountLicenseKey || '').trim();

    if (!globalKey && accountKey) {
        setGlobalLicenseKey(accountKey);
        return accountKey;
    }

    if (!globalKey) return '';
    if (!accountKey || accountKey === globalKey) return globalKey;

    const globalType = getLicenseTypeFromRawKey(globalKey);
    const accountType = getLicenseTypeFromRawKey(accountKey);

    if (accountType && accountType !== 'trial') {
        setGlobalLicenseKey(accountKey);
        return accountKey;
    }

    if (globalType && globalType !== 'trial') return globalKey;

    if (globalType === 'trial' && accountKey) {
        setGlobalLicenseKey(accountKey);
        return accountKey;
    }

    return globalKey;
};

export type LicenseType = 'monthly' | 'quarterly' | 'biannual' | 'annual' | 'lifetime' | 'trial';
export type LicenseTier = 'singular' | 'empresarial';

/**
 * Generates a legacy format license key (Base64 encoded string).
 * Used for trial keys and legacy support.
 */
export const generateLicenseKey = (
    type: LicenseType,
    expirationDate: Date,
    machineId: string,
    tier: LicenseTier = 'singular',
    maxDevices: number = 1
): string => {
    void type; void expirationDate; void machineId; void tier; void maxDevices;
    throw new Error('Todas as licenças, incluindo demonstrações, devem ser emitidas e assinadas pelo Tango Master.');
};

// Payload structure for new RSA licenses
export interface LicensePayload {
    alg: 'RS256';
    kid: string;
    licenseVersion: 2;
    jti: string;
    mid: string;          // Machine ID
    type: LicenseType;
    tier: LicenseTier;
    exp: string;          // Expiration ISO Date
    iat: string;          // Issue Date ISO
    devices?: number;
    client?: string;
    nif?: string;
}

export interface LicenseInfo {
    isValid: boolean;
    type: LicenseType;
    tier: LicenseTier;
    expirationDate: Date;
    activationDate?: Date;
    maxDevices?: number;
    status: 'active' | 'expired' | 'invalid' | 'trial';
    daysRemaining: number;
    machineId?: string;
    message?: string;
    isLegacy?: boolean;
    /** Licença da empresa no servidor (chave TANGO-…), validada por token assinado. */
    isCloud?: boolean;
    /** Sem token válido (mais de 7 dias sem ligação, licença terminada ou relógio atrasado): só leitura. */
    readOnly?: boolean;
}

/**
 * Gets the secure Machine ID via Electron IPC
 */
export const getMachineId = async (): Promise<string> => {
    let baseId = 'GLOBAL';
    if ((window as any).electronAPI) {
        try {
            baseId = await (window as any).electronAPI.getMachineId();
        } catch (e) {
            console.error("Failed to get HWID from Electron:", e);
        }
    }

    // Fingerprint extra para aumentar a unicidade e dificultar fraudes
    // Combina HWID nativo com resolucao de ecra e salt da app
    const fingerprint = [
        baseId,
        window.screen.width,
        window.screen.height,
        (window as any).electronAPI ? 'ELECTRON_NATIVE' : 'WEB_BROWSER',
        "TANGO_GEST_CREDITO_V1_FINGERPRINT_SALT_2024"
    ].join('###');

    // Simple hash (Murmur/fnv-like) for final hardware ID
    let h1 = 0xdeadbeef;
    for (let i = 0, ch; i < fingerprint.length; i++) {
        ch = fingerprint.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);

    // Retorna ID unico com prefixo da marca
    return "TANGO-" + (h1 >>> 0).toString(16).toUpperCase();
};

/**
 * Validates a license key (Legacy or RSA).
 * Now Async!
 */
export const validateLicense = async (key: string, companyNif: string = activeCompanyNif): Promise<LicenseInfo> => {
    // Computador activado com a chave da empresa (TANGO-…): o token do servidor manda sobre as chaves antigas.
    const cloud = cloudStatusToLicenseInfo(await getCloudLicenseStatus());
    if (cloud && cloud.type !== 'trial') return cloud;
    // Demonstração do servidor: uma chave antiga válida neste computador vale mais do que o teste.
    if (cloud) {
        if (!normalizeLicenseKey(key) || isCloudLicenseKey(key)) return cloud;
        const legacy = await validateLegacyLicense(key, companyNif);
        return legacy.isValid ? legacy : cloud;
    }
    return validateLegacyLicense(key, companyNif);
};

/** Chaves assinadas antigas (eyJ…/JSON) e a chave global, verificadas neste computador. */
const validateLegacyLicense = async (key: string, companyNif: string): Promise<LicenseInfo> => {
    if (isCloudLicenseKey(key)) {
        return {
            isValid: false, type: 'trial', tier: 'singular', expirationDate: new Date(), status: 'invalid', daysRemaining: 0,
            message: 'Esta chave de licença ainda não foi activada neste computador. Carregue em "Validar e Salvar Licença" com a Internet ligada.'
        };
    }
    let baseId = 'GLOBAL';
    if ((window as any).electronAPI) {
        try {
            baseId = await (window as any).electronAPI.getMachineId();
        } catch (e) {}
    }

    const currentMID = await getMachineId();

    const effectiveKey = normalizeLicenseKey(key) || normalizeLicenseKey(getGlobalLicenseKey());

    if (!effectiveKey) {
        return {
            isValid: false,
            type: 'trial',
            tier: 'singular',
            expirationDate: new Date(),
            status: 'invalid',
            daysRemaining: 0,
            message: 'Nenhuma licença encontrada.'
        };
    }

    // Try RSA Verification (JSON format or Base64 JSON)
    let licenseObject: any = null;
    const trimmedKey = effectiveKey.trim();

    if (trimmedKey.startsWith('{')) {
        try {
            licenseObject = JSON.parse(trimmedKey);
        } catch (e) { }
    } else if (trimmedKey.startsWith('ey')) {
        // Likely Base64 of a JSON string starting with {"
        try {
            const decoded = atob(trimmedKey);
            if (decoded.startsWith('{')) {
                licenseObject = JSON.parse(decoded);
            }
        } catch (e) { }
    }

    if (licenseObject && licenseObject.payload && licenseObject.signature) {
        try {
            const { payload, signature } = licenseObject;

            let isValidSig = false;
            for (const candidate of await getPublicLicenseKeys()) {
                try {
                    if (await verifySignature(payload, signature, await importPublicKey(candidate))) { isValidSig = true; break; }
                } catch {
                    // Assinatura de outro tamanho de chave: experimenta a seguinte.
                }
            }

            if (!isValidSig) {
                return invalidLicense('A assinatura da licença não corresponde a nenhuma chave do Tango Master conhecida por esta aplicação. A licença foi emitida com outra chave de assinatura ou foi alterada.');
            }

            const data: LicensePayload = JSON.parse(decodeLicensePayload(payload));
            const { issuedAt } = validateSignedLicensePayload(data);
            const currentMID = await getMachineId();

            if (!licenseAppliesToDevice(data, currentMID, companyNif)) {
                return {
                    isValid: false,
                    type: data.type,
                    tier: data.tier,
                    expirationDate: parseISO(data.exp),
                    status: 'invalid',
                    daysRemaining: 0,
                    message: `Licença válida apenas para a máquina ${data.mid} (ou para a empresa com o NIF ${data.nif || '-'}). Detetada: ${currentMID}`
                };
            }

            const now = new Date();
            const expirationDate = parseISO(data.exp);

            expirationDate.setHours(23, 59, 59, 999); // Garantir validade até ao fim do dia

            const isExpired = isBefore(expirationDate, now);
            const daysRem = isValid(expirationDate) ? differenceInDays(expirationDate, now) : 0;

            return {
                isValid: !isExpired,
                type: data.type,
                tier: data.tier,
                expirationDate: expirationDate,
                activationDate: issuedAt,
                maxDevices: data.devices,
                status: isExpired ? 'expired' : 'active',
                daysRemaining: daysRem,
                machineId: data.mid,
                message: isExpired ? `Sua licença expirou em ${isValid(expirationDate) ? format(expirationDate, 'dd/MM/yyyy') : '---'}` : undefined
            };

        } catch (e) {
            console.warn("RSA license validation failed", e);
            return invalidLicense(`A chave de licença tem dados inválidos (${e instanceof Error ? e.message : 'formato desconhecido'}). Gere-a de novo no Tango Master.`);
        }
    }
    return invalidLicense(unreadableKeyMessage(trimmedKey));
};

/**
 * Returns a friendly name for the license type
 */
export const getLicenseTypeName = (type: LicenseType, tier: LicenseTier = 'singular', maxDevices?: number): string => {
    const tierLabel = tier === 'empresarial' ? 'Licença Empresarial' : 'Licença Pessoal';
    const devices = maxDevices ? `${maxDevices} Dispositivos` : (tier === 'empresarial' ? 'Multi-Dispositivo' : 'Dispositivo Único');
    const deviceLabel = ` (${devices})`;

    switch (type) {
        case 'monthly': return `${tierLabel} - Mensal${deviceLabel}`;
        case 'quarterly': return `${tierLabel} - Trimestral${deviceLabel}`;
        case 'biannual': return `${tierLabel} - Semestral${deviceLabel}`;
        case 'annual': return `${tierLabel} - Anual${deviceLabel}`;
        case 'lifetime': return `${tierLabel} - Vitalícia${deviceLabel}`;
        case 'trial': return 'Período de Demonstração (3 Dias)';
        default: return `${type} - ${tierLabel}`;
    }
};

