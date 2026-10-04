import { differenceInDays, parseISO, isValid, isBefore, format } from 'date-fns';
import { verifySignature, importPublicKey } from './crypto_layer';
import { licenseAppliesToDevice, validateSignedLicensePayload } from './payload-licenca';

// Chave Pública do Tango Master (Sincronizada com public_key.json)
export const MASTER_PUBLIC_KEY = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvd9xIaqvoTNpZXyx7zOT7Oqa8dIoTQL8pNA8+n+KbRNS6KcwhCjMa2Ve6iWLjE0D2wSKThWjbKR6MDKGls83QmN5EsYADjjyXcaV54+HrwY3n/hHUWnwv4rq3Whuxk+Emvm48EE8OJLgfAd1Gr6ACm62kAg9XFsYHTWPWoNts67KNjdPPnjHid0S97CEe6l3KahOKXLf52gwThec1iOxPIqK7+c9eu+rK/7NyHtlTZ8vR+p9YmitXy7HVhUw3YsfAt0WJ3hZYBm0R8JmC0QRelAaemXtNXgun1tbqLFdBgSSKw+samsdlbswGwyY+CshsO/DZzvU+gXWsRhrNpYhLQIDAQAB`;

/**
 * Obtém a chave pública para validação de licença.
 * Tenta ler do sistema de ficheiros via Electron IPC, ou usa a chave hardcoded como fallback.
 */
let cachedPublicKey: string | null = null;

export const getPublicLicenseKey = async (): Promise<string> => {
    if (cachedPublicKey) return cachedPublicKey;

    if ((window as any).electronAPI && (window as any).electronAPI.readLicenseKeys) {
        try {
            const response = await (window as any).electronAPI.readLicenseKeys();
            if (response && response.success && response.publicKey) {
                console.log("✅ [Licenciamento] Chave pública carregada do sistema de ficheiros.");
                cachedPublicKey = response.publicKey;
                return response.publicKey;
            }
        } catch (e) {
            console.error("❌ [Licenciamento] Falha ao ler chave pública do disco:", e);
        }
    }

    console.log("ℹ️ [Licenciamento] Usando chave pública hardcoded.");
    return MASTER_PUBLIC_KEY;
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
    let baseId = 'GLOBAL';
    if ((window as any).electronAPI) {
        try {
            baseId = await (window as any).electronAPI.getMachineId();
        } catch (e) {}
    }

    const currentMID = await getMachineId();

    const effectiveKey = String(key || '').trim() || getGlobalLicenseKey();

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

            // --- NOVO: Carregamento Dinâmico da Chave Pública ---
            const currentPublicKey = await getPublicLicenseKey();
            const sourceInfo = (window as any).electronAPI ? " (Disk/IPC)" : " (Hardcoded/Web)";
            const keyPreview = currentPublicKey.substring(0, 15) + "...";

            const publicKey = await importPublicKey(currentPublicKey);

            const isValidSig = await verifySignature(payload, signature, publicKey);

            if (!isValidSig) {
                return {
                    isValid: false,
                    type: 'trial',
                    tier: 'singular',
                    expirationDate: new Date(),
                    status: 'invalid',
                    daysRemaining: 0,
                    message: `Erro na assinatura digital: A chave pública no sistema não corresponde. \nUsando: ${keyPreview}${sourceInfo}. \nVerifique se o Master e o ERP estão sincronizados (gerar nova chave no Master).`
                };
            }

            const decodedPayload = atob(payload);
            let data: LicensePayload;
            try {
                data = JSON.parse(decodedPayload);
            } catch (e) {
                // Se falhar, pode ser que o payload já fosse JSON puro (dependendo de como foi btoa-ado)
                data = JSON.parse(atob(payload));
            }
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
        }
    }
    return {
        isValid: false,
        type: 'trial',
        tier: 'singular',
        expirationDate: new Date(),
        status: 'invalid',
        daysRemaining: 0,
        message: 'Chave de licença assinada inválida ou obsoleta.'
    };
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

