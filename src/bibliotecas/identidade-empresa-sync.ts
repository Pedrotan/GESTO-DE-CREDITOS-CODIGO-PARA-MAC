// Identidade empresarial e definições de empresa partilhadas. Licenças, permissões, SMTP, chaves e caminhos locais nunca entram aqui.
export const IDENTITY_PREFIX = 'company_identity_v1:';
export const IDENTITY_FIELDS = ['name', 'nif', 'address', 'phone', 'email', 'whatsapp', 'website', 'location',
    'segment', 'slogan', 'currency', 'primaryColor', 'secondaryColor', 'logo', 'reportLogo', 'watermarkLogo'] as const;
export type IdentityField = typeof IDENTITY_FIELDS[number];
type Row = { key: string; value: string; updatedAt: string };
type Store = { all: <T>(sql: string, params?: unknown[]) => Promise<T[]>; run: (sql: string, params?: unknown[]) => Promise<unknown> };
const IMAGES = new Set<string>(['logo', 'reportLogo', 'watermarkLogo']);
const normalizeTenant = (value: unknown) => String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
const UPSERT_IDENTITY = `INSERT INTO shared_settings (key, value, updatedAt, updatedBy) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy
    WHERE excluded.updatedAt >= shared_settings.updatedAt`;
const validImage = (value: string) => /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value) && value.length <= 1_000_000;

function normalizeValue(field: IdentityField, value: unknown, tenant: string): string | null | undefined {
    if (value === null || value === '') return field === 'name' || field === 'nif' ? undefined : null;
    if (value === undefined) return undefined;
    if (field === 'primaryColor' || field === 'secondaryColor') {
        try {
            const color = typeof value === 'string' ? JSON.parse(value) : value;
            return Array.isArray(color) && color.length === 3 && color.every(v => Number.isFinite(v) && v >= 0 && v <= 255) ? JSON.stringify(color) : undefined;
        } catch { return undefined; }
    }
    if (typeof value !== 'string') return undefined;
    if (IMAGES.has(field)) return validImage(value) ? value : undefined;
    if (value.length > 8_000) return undefined;
    if (field === 'nif' && normalizeTenant(value) !== normalizeTenant(tenant)) return undefined;
    return value;
}

/** Valores persistidos de cada campo; uma remoção explícita (null) também sincroniza. */
export async function readCompanyIdentity(store: Store, tenant: string): Promise<Record<string, string | null>> {
    const result: Record<string, string | null> = {};
    if (!normalizeTenant(tenant)) return result;
    const rows = await store.all<Row>('SELECT key, value, updatedAt FROM shared_settings WHERE key LIKE ?', [`${IDENTITY_PREFIX}%`]);
    for (const row of rows) {
        const field = row.key.slice(IDENTITY_PREFIX.length) as IdentityField;
        if (!IDENTITY_FIELDS.includes(field)) continue;
        try {
            const envelope = JSON.parse(row.value);
            if (normalizeTenant(envelope.tenantId) !== normalizeTenant(tenant)) continue;
            const value = normalizeValue(field, envelope.value, tenant);
            if (value !== undefined) result[field] = value;
        } catch { /* Carga incompatível não substitui a identidade local. */ }
    }
    return result;
}

export async function publishCompanyIdentity(store: Store, tenant: string, settings: Record<string, unknown>, options: {
    fields?: readonly string[]; seed?: boolean; now?: string; image?: (value: string) => Promise<string>;
} = {}): Promise<number> {
    if (options.fields && !options.fields.some(field => IDENTITY_FIELDS.includes(field as IdentityField))) return 0;
    if (!normalizeTenant(tenant) || normalizeTenant(settings.nif) !== normalizeTenant(tenant)) throw new Error('A identidade da empresa não corresponde à conta de sincronização.');
    const previous = await readCompanyIdentity(store, tenant);
    let written = 0;
    for (const field of IDENTITY_FIELDS) {
        if (options.fields && !options.fields.includes(field)) continue;
        if (options.seed && field in previous) continue;
        let raw = settings[field];
        if (options.seed && (raw === null || raw === undefined || raw === '')) continue;
        if (options.seed && field === 'name' && /^(Empresa|Provisório|A Carregar\.\.\.|Tango Gestão de Créditos)$/i.test(String(raw))) continue;
        if (IMAGES.has(field) && typeof raw === 'string' && raw && options.image) raw = await options.image(raw);
        const value = normalizeValue(field, raw, tenant);
        if (value === undefined || (field in previous && previous[field] === value)) continue;
        await store.run(UPSERT_IDENTITY, [`${IDENTITY_PREFIX}${field}`, JSON.stringify({ tenantId: tenant, value }), options.now || new Date().toISOString(), 'company-identity']);
        written += 1;
    }
    return written;
}

// Definições de empresa partilhadas (coordenadas bancárias, contratos, signatários, módulos e simulador), no formato
// da linha de company_settings. Nunca segredos: SMTP, chave de resgate, chaves de sincronização e licença ficam de fora.
export const SETTINGS_PREFIX = 'company_settings_v1:';
const JSON_SETTINGS = new Set<string>(['bankingInfo', 'contractTemplates', 'authorizedSigners']);
// Valor por omissão de cada campo: uma instalação nova não semeia a nuvem com valores que nunca foram configurados.
const SETTING_DEFAULTS: Record<string, string | number> = {
    bankingInfo: '[]', contractTemplates: '[]', authorizedSigners: '[]', customClauses: '', digitalSignatureEnabled: 1,
    enableGatewaysModule: 1, enableGatewaysModuleAdminOnly: 0, enableProfileActivity: 1, enableProfileActivityAdminOnly: 0,
    enableWarrantiesModule: 1, enableWarrantiesModuleAdminOnly: 0, enableLegalModule: 1, enableLegalModuleAdminOnly: 0,
    enableScoringModule: 1, enableScoringModuleAdminOnly: 0, enableSuppliersModule: 0, enableSuppliersModuleAdminOnly: 0,
    defaultSimulationInterestRate: 3.5, defaultSimulationAdminFee: 2.0, defaultSimulationIof: 0.38,
    // Último backup feito em qualquer computador: o lembrete desaparece em todos (a data mais recente ganha).
    lastBackupDate: '',
};
export const SETTINGS_FIELDS = Object.keys(SETTING_DEFAULTS);
type SettingValue = string | number;

function normalizeSetting(field: string, value: unknown): SettingValue | undefined {
    if (field === 'lastBackupDate') {
        const time = typeof value === 'string' && value ? Date.parse(value) : NaN;
        return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
    }
    if (value === undefined || value === null) return field === 'customClauses' ? '' : undefined;
    if (JSON_SETTINGS.has(field)) {
        try {
            const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
            const json = JSON.stringify(parsed);
            return Array.isArray(parsed) && json.length <= 900_000 ? json : undefined;
        } catch { return undefined; }
    }
    if (field === 'customClauses') return typeof value === 'string' && value.length <= 200_000 ? value : undefined;
    if (field.startsWith('default')) {
        const number = typeof value === 'string' && value.trim() ? Number(value) : value;
        return typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 1000 ? number : undefined;
    }
    if (value === true || value === 1 || value === '1' || value === 'true') return 1;
    if (value === false || value === 0 || value === '0' || value === 'false') return 0;
    return undefined;
}

export async function readCompanySettings(store: Store, tenant: string): Promise<Record<string, SettingValue>> {
    const result: Record<string, SettingValue> = {};
    if (!normalizeTenant(tenant)) return result;
    const rows = await store.all<Row>('SELECT key, value, updatedAt FROM shared_settings WHERE key LIKE ?', [`${SETTINGS_PREFIX}%`]);
    for (const row of rows) {
        const field = row.key.slice(SETTINGS_PREFIX.length);
        if (!SETTINGS_FIELDS.includes(field)) continue;
        try {
            const envelope = JSON.parse(row.value);
            if (normalizeTenant(envelope.tenantId) !== normalizeTenant(tenant)) continue;
            const value = normalizeSetting(field, envelope.value);
            if (value !== undefined) result[field] = value;
        } catch { /* Carga incompatível não substitui a definição local. */ }
    }
    return result;
}

/**
 * `base` é o estado antes da gravação: um campo que o utilizador não alterou (formulário inteiro gravado, talvez
 * carregado antes de chegar a versão da nuvem) é tratado como semente e nunca substitui o valor já partilhado.
 */
export async function publishCompanySettings(store: Store, tenant: string, settings: Record<string, unknown>, options: {
    fields?: readonly string[]; seed?: boolean; now?: string; base?: object;
} = {}): Promise<number> {
    if (options.fields && !options.fields.some(field => SETTINGS_FIELDS.includes(field))) return 0;
    if (!normalizeTenant(tenant) || normalizeTenant(settings.nif) !== normalizeTenant(tenant)) throw new Error('As definições da empresa não correspondem à conta de sincronização.');
    const previous = await readCompanySettings(store, tenant);
    let written = 0;
    for (const field of SETTINGS_FIELDS) {
        if (options.fields && !options.fields.includes(field)) continue;
        const value = normalizeSetting(field, settings[field]);
        if (value === undefined || (field in previous && previous[field] === value)) continue;
        if (field === 'lastBackupDate') {
            if (field in previous && String(previous[field]) >= String(value)) continue;
        } else {
            const seed = options.seed || (options.base && normalizeSetting(field, (options.base as Record<string, unknown>)[field]) === value);
            if (seed && (field in previous || value === SETTING_DEFAULTS[field])) continue;
        }
        await store.run(UPSERT_IDENTITY, [`${SETTINGS_PREFIX}${field}`, JSON.stringify({ tenantId: tenant, value }), options.now || new Date().toISOString(), 'company-settings']);
        written += 1;
    }
    return written;
}

/** Identidade e definições partilhadas, publicadas juntas (gravação das Definições e semente da sincronização). */
export async function publishCompanyProfile(store: Store, tenant: string, settings: Record<string, unknown>, options: {
    fields?: readonly string[]; seed?: boolean; now?: string; image?: (value: string) => Promise<string>; base?: object;
} = {}): Promise<number> {
    const { base: _base, ...identityOptions } = options;
    const identity = await publishCompanyIdentity(store, tenant, settings, identityOptions);
    return identity + await publishCompanySettings(store, tenant, settings, options);
}

/** Tudo o que é partilhado pela nuvem, para detectar alterações recebidas. */
export async function readCompanyProfile(store: Store, tenant: string) {
    return { ...await readCompanyIdentity(store, tenant), ...await readCompanySettings(store, tenant) };
}

/** A apresentação usa a identidade e as definições partilhadas; a configuração privada continua nesta máquina. */
export async function withCompanyIdentity<T extends Record<string, unknown>>(store: Store, settings: T | null, tenant?: string): Promise<T | null> {
    if (!settings) return settings;
    const id = tenant || companyIdentityTenant(settings);
    const identity = await readCompanyIdentity(store, id);
    const shared = await readCompanySettings(store, id);
    const localBackup = normalizeSetting('lastBackupDate', settings.lastBackupDate);
    if (localBackup && (!shared.lastBackupDate || String(shared.lastBackupDate) < localBackup)) shared.lastBackupDate = localBackup;
    return { ...settings, ...shared, ...identity, _identityClearedImages: Object.keys(identity).filter(field => IMAGES.has(field) && identity[field] === null) };
}

export const companyIdentityTenant = (settings: Record<string, unknown>) =>
    (typeof window !== 'undefined' && !window.electronAPI ? localStorage.getItem('tango_active_tenant_id') : null) || String(settings.nif || '');
