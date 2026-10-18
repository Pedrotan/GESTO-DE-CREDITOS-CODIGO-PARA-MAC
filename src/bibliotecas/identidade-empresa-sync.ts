// Só identidade empresarial. Licenças, permissões, SMTP, chaves e caminhos locais nunca entram aqui.
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

/** A apresentação usa a identidade partilhada; a configuração privada continua nesta máquina. */
export async function withCompanyIdentity<T extends Record<string, unknown>>(store: Store, settings: T | null, tenant?: string): Promise<T | null> {
    if (!settings) return settings;
    const id = tenant || companyIdentityTenant(settings);
    const identity = await readCompanyIdentity(store, id);
    return { ...settings, ...identity, _identityClearedImages: Object.keys(identity).filter(field => IMAGES.has(field) && identity[field] === null) };
}

export const companyIdentityTenant = (settings: Record<string, unknown>) =>
    (typeof window !== 'undefined' && !window.electronAPI ? localStorage.getItem('tango_active_tenant_id') : null) || String(settings.nif || '');
