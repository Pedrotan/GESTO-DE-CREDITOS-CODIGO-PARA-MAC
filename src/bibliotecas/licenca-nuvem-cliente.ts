import { differenceInDays } from 'date-fns';
import type { LicenseInfo, LicenseType } from './licenciamento';

// Licença da empresa no Desktop, vista do lado da interface: o processo principal guarda e verifica o token
// assinado pelo servidor; aqui só se pede o estado, se activa a chave TANGO-… e se acompanham as mudanças.

export type CloudLicenseState = 'none' | 'active' | 'readonly' | 'clock';

export type CloudLicenseStatus = {
    state: CloudLicenseState;
    licenca?: {
        empresaId: string;
        plano: string;
        planoNome: string;
        escalao: string;
        dataFim: string | null;
        validoAte: string;
        maxMaquinas: number;
    };
    lastCheckAt?: string;
    refusal?: { code: string; message: string; at: string } | null;
    message?: string;
};

export const CLOUD_LICENSE_EVENT = 'tango-cloud-license-changed';

/** Chave nova (TANGO-XXXX-XXXX-XXXX-XXXX), ao contrário das chaves assinadas antigas (eyJ…). */
export const isCloudLicenseKey = (value: unknown) =>
    /^(TANGO)?[2-9A-HJ-NP-Z]{16}$/u.test(String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''));

/** Escreve a chave no formato oficial, para mostrar e guardar. */
export const formatCloudLicenseKey = (value: string) => {
    let chars = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (chars.startsWith('TANGO')) chars = chars.slice(5);
    return chars.length === 16 ? `TANGO-${chars.match(/.{4}/g)!.join('-')}` : String(value || '').trim();
};

const api = () => (typeof window !== 'undefined' ? (window as any).electronAPI : null);

let cached: { at: number; status: CloudLicenseStatus } | null = null;
let listening = false;

const remember = (status: CloudLicenseStatus) => {
    cached = { at: Date.now(), status };
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CLOUD_LICENSE_EVENT, { detail: status }));
    return status;
};

const listen = () => {
    if (listening || !api()?.onCloudLicenseChanged) return;
    listening = true;
    api().onCloudLicenseChanged((status: CloudLicenseStatus) => remember(status));
};

/** Estado da licença deste computador (fora do Desktop, ou sem activação, é "none"). */
export const getCloudLicenseStatus = async (maxAgeMs = 30_000): Promise<CloudLicenseStatus> => {
    if (!api()?.cloudLicenseStatus) return { state: 'none' };
    listen();
    if (cached && Date.now() - cached.at < maxAgeMs) return cached.status;
    try {
        return remember(await api().cloudLicenseStatus());
    } catch {
        return { state: 'none' };
    }
};

/** Pede já ao servidor um token novo (botão "Validar agora"). */
export const refreshCloudLicense = async (): Promise<CloudLicenseStatus> => {
    if (!api()?.cloudLicenseRefresh) return { state: 'none' };
    listen();
    return remember(await api().cloudLicenseRefresh());
};

/** Activa este computador com a chave TANGO-…; `legacyMachineId` liga-o à máquina de uma licença antiga. */
export const activateCloudLicense = async (key: string, options: { serverUrl?: string; legacyMachineId?: string } = {}) => {
    if (!api()?.cloudLicenseActivate) {
        return { success: false as const, code: 'SO_DESKTOP', message: 'A activação com a chave TANGO-… é feita no Tango ERP instalado no computador.' };
    }
    listen();
    const result = await api().cloudLicenseActivate({ key: formatCloudLicenseKey(key), ...options });
    if (result?.success) remember(result.status);
    return result as { success: true; status: CloudLicenseStatus } | { success: false; code: string; message: string };
};

/** O sistema deve recusar alterações (o processo principal também as recusa)? */
export const isCloudLicenseReadOnly = (status: CloudLicenseStatus | null | undefined) =>
    status?.state === 'readonly' || status?.state === 'clock';

const CLOUD_PLAN_TYPES: LicenseType[] = ['monthly', 'quarterly', 'biannual', 'annual', 'lifetime', 'trial'];

/** Converte o estado da licença da empresa (token do servidor) no formato usado pelo resto da aplicação. */
export const cloudStatusToLicenseInfo = (status: CloudLicenseStatus, now = new Date()): LicenseInfo | null => {
    if (status.state === 'none' || !status.licenca) return null;
    const { licenca } = status;
    const end = licenca.dataFim ? new Date(licenca.dataFim) : new Date(now.getFullYear() + 99, 11, 31);
    const type = CLOUD_PLAN_TYPES.includes(licenca.plano as LicenseType) ? licenca.plano as LicenseType : 'annual';
    const readOnly = status.state === 'readonly' || status.state === 'clock';
    return {
        isValid: true,
        isCloud: true,
        readOnly,
        type,
        tier: licenca.escalao === 'singular' ? 'singular' : 'empresarial',
        expirationDate: end,
        maxDevices: licenca.maxMaquinas,
        status: readOnly ? 'expired' : 'active',
        daysRemaining: Math.max(0, differenceInDays(end, now)),
        message: readOnly ? status.message : undefined,
    };
};
