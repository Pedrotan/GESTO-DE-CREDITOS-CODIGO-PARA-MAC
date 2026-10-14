import * as crypto from 'crypto';
import type { LicenseTokenPublicKey } from '../src/bibliotecas/chave-publica-tokens';

// Licença da empresa no Desktop (etapa 4): o servidor decide e devolve um token Ed25519; o Desktop guarda-o
// cifrado (cofre do Windows), verifica a assinatura com a chave pública embutida e trabalha offline até o token
// expirar (7 dias, nunca depois da data de fim). Sem token válido, o computador fica em modo só leitura.
//
// Só se aplica a computadores activados com uma chave TANGO-XXXX-…; os restantes seguem as licenças antigas.

export type CloudLicenseClaims = {
    empresa_id: string;
    licenca_id: string;
    plano: string;
    plano_nome?: string;
    escalao: string;
    max_maquinas: number;
    machine_hash: string;
    /** Demonstração: início registado no servidor. */
    data_inicio?: string;
    data_fim: string | null;
    valido_ate: string;
    hora_servidor: string;
    exp: number;
    iat: number;
};

/** O que fica guardado (cifrado) no computador. */
export type CloudLicenseRecord = {
    token: string;
    serverUrl: string;
    /** Hora do servidor mais recente que este computador já viu. */
    lastServerTime: string;
    /** Maior hora local já vista (um relógio que anda para trás é manipulação). */
    lastLocalTime: string;
    lastCheckAt: string;
    /** Última recusa do servidor (licença suspensa/expirada, máquina libertada...). */
    refusal?: { code: string; message: string; at: string } | null;
};

export type CloudLicenseState =
    | 'none'        // computador não activado com uma chave TANGO
    | 'active'      // token válido
    | 'readonly'    // token expirado: mais de 7 dias sem ligação, ou licença sem renovação
    | 'clock'       // relógio do computador atrasado em relação ao já visto: exige validação online
    | 'trial_ended'; // a demonstração de 3 dias terminou: só o ecrã de activação (os dados ficam guardados)

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
    refusal?: CloudLicenseRecord['refusal'];
    message?: string;
};

/** Tolerância para pequenos acertos do relógio (sincronização NTP, fusos). */
export const CLOCK_TOLERANCE_MS = 10 * 60_000;
/** Renovar o token ao abrir e depois de 24 horas, ou quando faltam menos de 2 dias para expirar. */
export const HEARTBEAT_INTERVAL_MS = 24 * 3_600_000;
const RENEW_BEFORE_EXPIRY_MS = 2 * 86_400_000;

export const DEFAULT_LICENSE_SERVER = 'https://tangogestaoecreditos.tech';

/** Impressão digital da máquina enviada ao servidor: só o hash, nunca os identificadores em claro. */
export const machineFingerprint = (machineGuid: string) =>
    crypto.createHash('sha256').update(`tango-fingerprint-v1:${String(machineGuid).trim().toLowerCase()}`).digest('hex');

/** Hash do identificador antigo (o mesmo cálculo que o servidor usou ao importar as chaves antigas). */
export const legacyMachineHash = (legacyMachineId: string) =>
    crypto.createHash('sha256').update(`tango-machine:${String(legacyMachineId || '').trim().toUpperCase()}`).digest('hex');

export const isCloudLicenseKey = (value: unknown) => /^(TANGO)?[2-9A-HJ-NP-Z]{16}$/u.test(String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''));

/** Verifica um token Ed25519 (JWS compacto) com as chaves públicas embutidas; null se não for autêntico. */
export const verifyCloudToken = (token: string, publicKeys: readonly LicenseTokenPublicKey[]): CloudLicenseClaims | null => {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    try {
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (header?.alg !== 'EdDSA') return null;
        for (const entry of publicKeys) {
            if (header.kid && entry.kid !== header.kid) continue;
            const key = crypto.createPublicKey({ key: Buffer.from(entry.publicKey, 'base64'), format: 'der', type: 'spki' });
            if (crypto.verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'))) {
                return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            }
        }
    } catch {
        return null;
    }
    return null;
};

const describe = (claims: CloudLicenseClaims): NonNullable<CloudLicenseStatus['licenca']> => ({
    empresaId: claims.empresa_id,
    plano: claims.plano,
    planoNome: claims.plano_nome || claims.plano,
    escalao: claims.escalao,
    dataInicio: claims.data_inicio || null,
    dataFim: claims.data_fim,
    validoAte: claims.valido_ate,
    maxMaquinas: Number(claims.max_maquinas),
});

/** Estado da licença deste computador a partir do registo guardado (puro, para testes). */
export const evaluateCloudLicense = (
    record: CloudLicenseRecord | null,
    machineHash: string,
    publicKeys: readonly LicenseTokenPublicKey[],
    now = Date.now(),
): CloudLicenseStatus => {
    if (!record?.token) return { state: 'none' };
    const claims = verifyCloudToken(record.token, publicKeys);
    // Token adulterado ou de outro computador: conta como não activado (o ficheiro é cifrado para este utilizador).
    if (!claims || claims.machine_hash !== machineHash) return { state: 'none' };
    const base = { licenca: describe(claims), lastCheckAt: record.lastCheckAt, refusal: record.refusal || null };
    const lastSeen = Math.max(Date.parse(record.lastServerTime) || 0, Date.parse(record.lastLocalTime) || 0);
    if (now + CLOCK_TOLERANCE_MS < lastSeen) {
        return { ...base, state: 'clock', message: 'O relógio deste computador está atrasado. Acerte a data e a hora e ligue o computador à Internet para validar a licença.' };
    }
    // Demonstração: o fim vem do servidor; conta a hora mais adiantada já vista (atrasar o relógio não a prolonga).
    if (claims.plano === 'trial' && claims.data_fim && Math.max(now, lastSeen) >= Date.parse(claims.data_fim)) {
        return {
            ...base,
            state: 'trial_ended',
            message: 'O período de demonstração de 3 dias terminou. Introduza a chave de licença para continuar: os dados registados ficam guardados.',
        };
    }
    if (now >= claims.exp * 1000) {
        const ended = claims.data_fim && Date.parse(claims.data_fim) <= now;
        return {
            ...base,
            state: 'readonly',
            message: ended
                ? 'A licença desta empresa terminou. O sistema está em modo só de leitura até a licença ser renovada. Suporte Tango: +244 941 537 486.'
                : record.refusal?.message
                    ? `${record.refusal.message} O sistema está em modo só de leitura.`
                    : 'Este computador está há mais de 7 dias sem validar a licença. Ligue-o à Internet: até lá, o sistema fica em modo só de leitura.',
        };
    }
    return { ...base, state: 'active' };
};

/** Precisa de pedir um token novo ao servidor? */
export const heartbeatDue = (record: CloudLicenseRecord | null, claims: CloudLicenseClaims | null, now = Date.now()) => {
    if (!record || !claims) return false;
    const lastCheck = Date.parse(record.lastCheckAt) || 0;
    return now - lastCheck >= HEARTBEAT_INTERVAL_MS || claims.exp * 1000 - now <= RENEW_BEFORE_EXPIRY_MS;
};

/** Registo actualizado depois de uma resposta do servidor com um token novo. */
export const recordFromToken = (token: string, serverUrl: string, claims: CloudLicenseClaims, previous: CloudLicenseRecord | null, now = Date.now()): CloudLicenseRecord => ({
    token,
    serverUrl,
    lastServerTime: new Date(Math.max(Date.parse(claims.hora_servidor) || 0, Date.parse(previous?.lastServerTime || '') || 0)).toISOString(),
    lastLocalTime: new Date(Math.max(now, Date.parse(previous?.lastLocalTime || '') || 0)).toISOString(),
    lastCheckAt: new Date(now).toISOString(),
    refusal: null,
});

/** Recusas definitivas: guardar para explicar ao utilizador (as falhas de rede não contam). */
export const isLicenseRefusal = (code: unknown) =>
    /^(LICENCA_|MAQUINA_LIBERTADA|MAQUINA_DIFERENTE|TOKEN_)/.test(String(code || ''));
