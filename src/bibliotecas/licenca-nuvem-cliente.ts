import { differenceInDays } from 'date-fns';
import type { LicenseInfo, LicenseType } from './licenciamento';

// Licença da empresa no Desktop, vista do lado da interface: o processo principal guarda e verifica o token
// assinado pelo servidor; aqui só se pede o estado, se activa a chave TANGO-… e se acompanham as mudanças.

export type CloudLicenseState = 'none' | 'active' | 'readonly' | 'clock' | 'trial_ended';

/** Contactos do suporte Tango mostrados nos avisos de licença. */
export const SUPPORT_CONTACTS = {
    phone: '+244 941 537 486',
    whatsapp: 'https://wa.me/244941537486',
    email: 'suporte@tangogestao.ao',
};

export type CloudLicenseStatus = {
    state: CloudLicenseState;
    licenca?: {
        empresaId: string;
        plano: string;
        planoNome: string;
        escalao: string;
        dataInicio?: string | null;
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

// --- Versão web: não pede chave; herda a licença da empresa, que o servidor envia ao validar o acesso. ---
const WEB_LICENSE_KEY = 'tango_web_company_license';

export type WebCompanyLicense = {
    plan: string;
    planName: string;
    tier: string;
    status: 'ativa' | 'suspensa' | 'expirada' | 'revogada';
    endsAt: string | null;
    daysRemaining: number | null;
    maxMachines: number;
    machines: number;
};

export const webLicenseToStatus = (license: WebCompanyLicense | null): CloudLicenseStatus => {
    if (!license) return { state: 'none' };
    return {
        state: license.status === 'ativa' ? 'active' : 'readonly',
        licenca: {
            empresaId: '', plano: license.plan, planoNome: license.planName, escalao: license.tier,
            dataFim: license.endsAt, validoAte: license.endsAt || '', maxMaquinas: license.maxMachines,
        },
        message: license.status === 'ativa' ? undefined : `A licença da empresa está ${license.status}. Contacte o suporte Tango: +244 941 537 486.`,
    };
};

export const getWebCompanyLicense = (): WebCompanyLicense | null => {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(WEB_LICENSE_KEY) : null;
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

/** Guarda a licença da empresa recebida do servidor (null apaga) e avisa quem mostra o estado. */
export const storeWebCompanyLicense = (license: WebCompanyLicense | null | undefined) => {
    try {
        if (license) localStorage.setItem(WEB_LICENSE_KEY, JSON.stringify(license));
        else localStorage.removeItem(WEB_LICENSE_KEY);
    } catch { /* armazenamento indisponível */ }
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CLOUD_LICENSE_EVENT, { detail: webLicenseToStatus(license || null) }));
};

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
    if (!api()) return webLicenseToStatus(getWebCompanyLicense());
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

/** Pede ao servidor a demonstração de 3 dias deste computador (só quando não há licença nenhuma). */
export const startCloudTrial = async (): Promise<{ success: boolean; status: CloudLicenseStatus; message?: string }> => {
    if (!api()?.cloudLicenseStartTrial) return { success: false, status: { state: 'none' } };
    listen();
    const result = await api().cloudLicenseStartTrial();
    if (result?.status) remember(result.status);
    return result;
};

/**
 * Aviso de fim de licença: demonstração no 2.º dia (falta 1 dia ou menos) e licenças pagas nos últimos 7 dias.
 * null quando não há nada a avisar.
 */
export const licenseExpiryNotice = (status: CloudLicenseStatus | null | undefined, now = Date.now()) => {
    if (status?.state !== 'active' || !status.licenca?.dataFim) return null;
    const msLeft = Date.parse(status.licenca.dataFim) - now;
    if (!Number.isFinite(msLeft) || msLeft <= 0) return null;
    const trial = status.licenca.plano === 'trial';
    if (msLeft > (trial ? 2 : 7) * 86_400_000) return null;
    const days = Math.floor(msLeft / 86_400_000);
    const hours = Math.ceil(msLeft / 3_600_000);
    const when = msLeft < 86_400_000 ? (hours <= 1 ? 'daqui a menos de 1 hora' : `daqui a ${hours} horas`) : `daqui a ${days} ${days === 1 ? 'dia' : 'dias'}`;
    return {
        trial,
        msLeft,
        message: trial
            ? `A sua licença de teste expira ${when}. Contacte o suporte para mais detalhes.`
            : `A licença ${status.licenca.planoNome || ''} da empresa expira ${when}. Contacte o suporte para a renovar.`.replace('  ', ' '),
    };
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
    status?.state === 'readonly' || status?.state === 'clock' || status?.state === 'trial_ended';

const CLOUD_PLAN_TYPES: LicenseType[] = ['monthly', 'quarterly', 'biannual', 'annual', 'lifetime', 'trial'];

/** Converte o estado da licença da empresa (token do servidor) no formato usado pelo resto da aplicação. */
export const cloudStatusToLicenseInfo = (status: CloudLicenseStatus, now = new Date()): LicenseInfo | null => {
    if (status.state === 'none' || !status.licenca) return null;
    const { licenca } = status;
    const end = licenca.dataFim ? new Date(licenca.dataFim) : new Date(now.getFullYear() + 99, 11, 31);
    const type = CLOUD_PLAN_TYPES.includes(licenca.plano as LicenseType) ? licenca.plano as LicenseType : 'annual';
    // Demonstração terminada: não é válida (o LicenseGuard mostra só o ecrã de activação).
    if (status.state === 'trial_ended') {
        return { isValid: false, isCloud: true, readOnly: true, type, tier: 'singular', expirationDate: end, maxDevices: licenca.maxMaquinas,
            status: 'expired', daysRemaining: 0, message: status.message };
    }
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
