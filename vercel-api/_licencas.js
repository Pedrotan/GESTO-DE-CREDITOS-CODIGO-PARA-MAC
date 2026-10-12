import crypto from 'node:crypto';

// Licenças: uma por empresa, guardada no servidor (fonte única de verdade para o Desktop e a Web).
//
// Etapa 1 do plano de licenças: esquema, migração das empresas da nuvem e importação das chaves assinadas
// antigas emitidas pelo Tango Master. Nada aqui bloqueia acessos: a verificação nos pedidos chega na etapa 3.
//
// - tango_licencas: 1 empresa = 1 licença (UNIQUE em empresa_id, imposto pela base de dados).
// - tango_licenca_ativacoes: máquinas ligadas à licença (só o hash do identificador da máquina).
// - tango_licenca_eventos: auditoria de tudo o que acontece a uma licença.
// - tango_licencas_legado: chaves assinadas antigas (RS256) importadas do Master; uma fica "mantida" e as
//   restantes da mesma empresa ficam "revogada".

export const LICENSE_STATES = ['ativa', 'suspensa', 'expirada', 'revogada'];
export const LICENSE_TIERS = ['singular', 'empresarial'];

/** Planos conhecidos: os tipos de licença emitidos pelo Master e o das empresas migradas sem plano. */
export const DEFAULT_PLANS = [
  { id: 'trial', nome: 'Demonstração (3 dias)', meses: null, dias: 3 },
  { id: 'monthly', nome: 'Mensal', meses: 1, dias: null },
  { id: 'quarterly', nome: 'Trimestral', meses: 3, dias: null },
  { id: 'biannual', nome: 'Semestral', meses: 6, dias: null },
  { id: 'annual', nome: 'Anual', meses: 12, dias: null },
  { id: 'lifetime', nome: 'Vitalícia', meses: null, dias: null },
  { id: 'por_definir', nome: 'Por definir (empresa migrada da nuvem)', meses: null, dias: null },
];

// NIF de consumidor final usado pelo Master quando a licença não é de uma empresa.
const GENERIC_NIF = '999999999';
const cleanNif = (value) => String(value ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/** Hash do identificador de máquina: o identificador em claro nunca fica guardado. */
export const machineHash = (machineId) => sha256(`tango-machine:${String(machineId || '').trim().toUpperCase()}`);

const prepared = new Map();

/** Cria as tabelas (idempotente). Cada instrução vai num pedido: o cliente HTTP da Neon não aceita várias. */
export const ensureLicenseTables = async (sql) => {
  await sql(`CREATE TABLE IF NOT EXISTS tango_planos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    duracao_meses INT,
    duracao_dias INT,
    max_maquinas INT NOT NULL DEFAULT 1,
    funcionalidades JSONB NOT NULL DEFAULT '{}'::jsonb
  )`);
  await sql(`CREATE TABLE IF NOT EXISTS tango_licencas (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL UNIQUE REFERENCES tango_tenants(tenant_id) ON UPDATE CASCADE ON DELETE CASCADE,
    chave_hash TEXT UNIQUE,
    chave_prefixo TEXT,
    plano_id TEXT NOT NULL REFERENCES tango_planos(id),
    escalao TEXT NOT NULL DEFAULT 'empresarial' CHECK (escalao IN ('singular', 'empresarial')),
    estado TEXT NOT NULL CHECK (estado IN ('ativa', 'suspensa', 'expirada', 'revogada')),
    data_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_fim TIMESTAMPTZ,
    max_maquinas INT NOT NULL DEFAULT 1 CHECK (max_maquinas BETWEEN 1 AND 10000),
    origem TEXT NOT NULL DEFAULT 'nuvem',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await sql(`CREATE TABLE IF NOT EXISTS tango_licenca_ativacoes (
    id TEXT PRIMARY KEY,
    licenca_id TEXT NOT NULL REFERENCES tango_licencas(id) ON DELETE CASCADE,
    machine_hash TEXT NOT NULL,
    nome_maquina TEXT,
    primeira_ativacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ultimo_heartbeat TIMESTAMPTZ,
    estado TEXT NOT NULL DEFAULT 'ativa' CHECK (estado IN ('ativa', 'libertada')),
    UNIQUE (licenca_id, machine_hash)
  )`);
  await sql(`CREATE TABLE IF NOT EXISTS tango_licenca_eventos (
    id BIGSERIAL PRIMARY KEY,
    licenca_id TEXT,
    empresa_id TEXT,
    tipo TEXT NOT NULL,
    detalhe JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await sql(`CREATE INDEX IF NOT EXISTS tango_licenca_eventos_licenca_idx ON tango_licenca_eventos (licenca_id, criado_em DESC)`);
  await sql(`CREATE TABLE IF NOT EXISTS tango_licencas_legado (
    jti TEXT PRIMARY KEY,
    licenca_id TEXT REFERENCES tango_licencas(id) ON DELETE CASCADE,
    empresa_id TEXT NOT NULL,
    chave_hash TEXT,
    machine_hash TEXT,
    tipo TEXT,
    escalao TEXT,
    max_maquinas INT,
    data_fim TIMESTAMPTZ,
    emitida_em TIMESTAMPTZ,
    estado TEXT NOT NULL CHECK (estado IN ('mantida', 'revogada')),
    importada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  for (const plan of DEFAULT_PLANS) {
    await sql(`INSERT INTO tango_planos (id, nome, duracao_meses, duracao_dias) VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO NOTHING`, [plan.id, plan.nome, plan.meses, plan.dias]);
  }
};

export const recordLicenseEvent = (sql, { licenseId = null, tenantId = null, type, detail = {}, ip = null }) =>
  sql(`INSERT INTO tango_licenca_eventos (licenca_id, empresa_id, tipo, detalhe, ip) VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [licenseId, tenantId, type, JSON.stringify(detail), ip]);

const stateFromTenant = (tenant, now = Date.now()) => {
  if (tenant.status === 'blocked') return 'suspensa';
  if (tenant.expires_at && new Date(tenant.expires_at).getTime() < now) return 'expirada';
  return 'ativa';
};

/**
 * Cria a licença de cada empresa da nuvem que ainda não tem uma (idempotente) e marca como expiradas as
 * licenças activas cuja data de fim já passou. Devolve quantas licenças foram criadas.
 */
export const migrateTenantsToLicenses = async (sql) => {
  const missing = await sql(`SELECT t.tenant_id, t.status, t.expires_at, t.created_at FROM tango_tenants t
    LEFT JOIN tango_licencas l ON l.empresa_id = t.tenant_id WHERE l.id IS NULL`);
  let created = 0;
  for (const tenant of missing) {
    const id = crypto.randomUUID();
    const inserted = await sql(`INSERT INTO tango_licencas (id, empresa_id, plano_id, estado, data_inicio, data_fim, origem)
      VALUES ($1, $2, 'por_definir', $3, COALESCE($4, NOW()), $5, 'nuvem')
      ON CONFLICT (empresa_id) DO NOTHING RETURNING id`,
      [id, tenant.tenant_id, stateFromTenant(tenant), tenant.created_at, tenant.expires_at]);
    if (!inserted.length) continue;
    created += 1;
    await recordLicenseEvent(sql, { licenseId: id, tenantId: tenant.tenant_id, type: 'criada_por_migracao',
      detail: { estadoNuvem: tenant.status, expiraNuvem: tenant.expires_at } });
  }
  await sql(`UPDATE tango_licencas SET estado = 'expirada', atualizado_em = NOW()
    WHERE estado = 'ativa' AND data_fim IS NOT NULL AND data_fim < NOW()`);
  return created;
};

/** Prepara as tabelas e migra as empresas uma vez por processo e base de dados (`key`: o URL da base de dados). */
export const prepareLicenses = async (sql, key = sql) => {
  if (!prepared.has(key)) {
    prepared.set(key, (async () => {
      await ensureLicenseTables(sql);
      return migrateTenantsToLicenses(sql);
    })().catch(error => { prepared.delete(key); throw error; }));
  }
  return prepared.get(key);
};

/**
 * Mantém a licença alinhada com as alterações feitas à empresa no painel (criar, bloquear, renovar).
 * `changes.expiresAt` só é aplicado quando foi enviado (undefined = não mexer).
 */
export const syncLicenseFromTenant = async (sql, tenantId, changes = {}, ip = null) => {
  await migrateTenantsToLicenses(sql);
  const [license] = await sql(`SELECT l.*, t.status AS tenant_status, t.expires_at AS tenant_expires_at FROM tango_licencas l
    JOIN tango_tenants t ON t.tenant_id = l.empresa_id WHERE UPPER(l.empresa_id) = UPPER($1)`, [tenantId]);
  if (!license || license.estado === 'revogada') return license || null;
  const dataFim = changes.expiresAt !== undefined ? changes.expiresAt : license.data_fim;
  const estado = stateFromTenant({ status: license.tenant_status, expires_at: dataFim });
  if (estado === license.estado && String(dataFim) === String(license.data_fim)) return license;
  const [updated] = await sql(`UPDATE tango_licencas SET estado = $2, data_fim = $3, atualizado_em = NOW() WHERE id = $1 RETURNING *`,
    [license.id, estado, dataFim]);
  await recordLicenseEvent(sql, { licenseId: license.id, tenantId: license.empresa_id, type: 'alterada_no_painel', ip,
    detail: { estadoAnterior: license.estado, estado, dataFimAnterior: license.data_fim, dataFim } });
  return updated;
};

const validDate = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

/** Valida uma chave antiga enviada pelo Master (só metadados lidos da própria chave; nunca a chave em claro). */
export const parseLegacyKey = (raw) => {
  const jti = String(raw?.jti || '').toLowerCase();
  const type = String(raw?.type || '');
  const tier = String(raw?.tier || '');
  const exp = validDate(raw?.exp);
  const iat = validDate(raw?.iat) || null;
  const devices = Number(raw?.devices ?? 1);
  const mid = String(raw?.mid || '').trim();
  const keyHash = String(raw?.keyHash || '').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(jti)) return null;
  if (!DEFAULT_PLANS.some(plan => plan.id === type && plan.id !== 'por_definir') || !LICENSE_TIERS.includes(tier) || !exp) return null;
  if (!Number.isSafeInteger(devices) || devices < 1 || devices > 10_000 || mid.length > 200) return null;
  if (keyHash && !/^[0-9a-f]{64}$/u.test(keyHash)) return null;
  return { jti, nif: cleanNif(raw?.nif), mid, type, tier, exp, iat, devices, keyHash: keyHash || null, migrated: raw?.status === 'migrated' };
};

/** A chave que fica: a não migrada com a data de fim mais distante (empate: a emitida mais tarde). */
export const pickKeptKey = (keys) => {
  const candidates = keys.filter(key => !key.migrated);
  const pool = candidates.length ? candidates : keys;
  return [...pool].sort((a, b) => (b.exp - a.exp) || ((b.iat?.getTime() || 0) - (a.iat?.getTime() || 0)))[0] || null;
};

/**
 * Funde as chaves assinadas antigas na licença única de cada empresa: a chave escolhida define o plano, o
 * escalão, as máquinas e a data de fim; as máquinas de todas as chaves passam a activações; as outras chaves
 * ficam revogadas. Idempotente: importar de novo as mesmas chaves dá o mesmo resultado.
 */
export const importLegacyKeys = async (sql, rawKeys, ip = null) => {
  await prepareLicenses(sql);
  const report = { mantidas: 0, revogadas: 0, ativacoes: 0, ignoradas: [], empresas: [] };
  const byNif = new Map();
  for (const raw of Array.isArray(rawKeys) ? rawKeys.slice(0, 5000) : []) {
    const key = parseLegacyKey(raw);
    if (!key) { report.ignoradas.push({ jti: String(raw?.jti || '').slice(0, 40), motivo: 'Dados da chave inválidos.' }); continue; }
    if (key.nif.length < 9 || key.nif === GENERIC_NIF) {
      report.ignoradas.push({ jti: key.jti, motivo: 'Licença sem NIF de empresa (consumidor final).' });
      continue;
    }
    if (!byNif.has(key.nif)) byNif.set(key.nif, []);
    byNif.get(key.nif).push(key);
  }

  for (const [nif, keys] of byNif) {
    const [license] = await sql(`SELECT * FROM tango_licencas WHERE UPPER(empresa_id) = UPPER($1)`, [nif]);
    if (!license) {
      for (const key of keys) report.ignoradas.push({ jti: key.jti, motivo: `A empresa com o NIF ${nif} não está registada na nuvem.` });
      continue;
    }
    const kept = pickKeptKey(keys);
    const before = { plano: license.plano_id, escalao: license.escalao, maxMaquinas: license.max_maquinas, dataFim: license.data_fim };
    const state = license.estado === 'revogada' || license.estado === 'suspensa'
      ? license.estado
      : (kept.exp.getTime() < Date.now() ? 'expirada' : 'ativa');
    await sql(`UPDATE tango_licencas SET plano_id = $2, escalao = $3, max_maquinas = $4, data_fim = $5, estado = $6,
        origem = 'chave_assinada', atualizado_em = NOW() WHERE id = $1`,
      [license.id, kept.type, kept.tier, kept.devices, kept.exp.toISOString(), state]);

    for (const key of keys) {
      const keptKey = key.jti === kept.jti;
      const hash = key.mid && key.mid !== 'GLOBAL' ? machineHash(key.mid) : null;
      await sql(`INSERT INTO tango_licencas_legado (jti, licenca_id, empresa_id, chave_hash, machine_hash, tipo, escalao, max_maquinas, data_fim, emitida_em, estado)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (jti) DO UPDATE SET licenca_id = EXCLUDED.licenca_id, estado = EXCLUDED.estado, importada_em = NOW()`,
        [key.jti, license.id, license.empresa_id, key.keyHash, hash, key.type, key.tier, key.devices, key.exp.toISOString(),
          key.iat ? key.iat.toISOString() : null, keptKey ? 'mantida' : 'revogada']);
      if (keptKey) report.mantidas += 1; else report.revogadas += 1;
      if (hash) {
        const activation = await sql(`INSERT INTO tango_licenca_ativacoes (id, licenca_id, machine_hash, nome_maquina, primeira_ativacao)
            VALUES ($1, $2, $3, $4, COALESCE($5, NOW())) ON CONFLICT (licenca_id, machine_hash) DO NOTHING RETURNING id`,
          [crypto.randomUUID(), license.id, hash, 'Máquina da licença antiga', key.iat ? key.iat.toISOString() : null]);
        report.ativacoes += activation.length;
      }
    }

    const activeMachines = await sql(`SELECT COUNT(*)::int AS total FROM tango_licenca_ativacoes WHERE licenca_id = $1 AND estado = 'ativa'`, [license.id]);
    await recordLicenseEvent(sql, { licenseId: license.id, tenantId: license.empresa_id, type: 'chaves_antigas_importadas', ip, detail: {
      antes: before, chaveMantida: kept.jti, chavesRevogadas: keys.filter(key => key.jti !== kept.jti).map(key => key.jti),
    } });
    report.empresas.push({
      empresaId: license.empresa_id,
      chaveMantida: kept.jti,
      revogadas: keys.length - 1,
      plano: kept.type,
      dataFim: kept.exp.toISOString(),
      maquinas: activeMachines[0]?.total || 0,
      maxMaquinas: kept.devices,
      // A data de fim da nuvem (tango_tenants) não é alterada nesta etapa: a diferença fica à vista do administrador.
      dataFimNuvemDiferente: Boolean(before.dataFim) && new Date(before.dataFim).toISOString().slice(0, 10) !== kept.exp.toISOString().slice(0, 10),
      dataFimNuvem: before.dataFim,
    });
  }
  return report;
};

/** Lista para o painel do Master: dias restantes e máquinas calculados no servidor. */
export const listLicenses = (sql) => sql(`
  SELECT t.tenant_id AS empresa_id, t.name AS empresa, l.id, l.chave_prefixo, l.plano_id, p.nome AS plano, l.escalao,
    l.estado, l.data_inicio, l.data_fim, l.max_maquinas, l.origem,
    CASE WHEN l.data_fim IS NULL THEN NULL
      ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (l.data_fim - NOW())) / 86400))::int END AS dias_restantes,
    (SELECT COUNT(*)::int FROM tango_licenca_ativacoes a WHERE a.licenca_id = l.id AND a.estado = 'ativa') AS maquinas,
    (SELECT MAX(a.ultimo_heartbeat) FROM tango_licenca_ativacoes a WHERE a.licenca_id = l.id) AS ultimo_contacto,
    (SELECT COUNT(*)::int FROM tango_licencas_legado g WHERE g.licenca_id = l.id AND g.estado = 'revogada') AS chaves_revogadas
  FROM tango_licencas l
  JOIN tango_tenants t ON t.tenant_id = l.empresa_id
  JOIN tango_planos p ON p.id = l.plano_id
  ORDER BY (l.data_fim IS NULL), l.data_fim ASC, t.name ASC`);

export const toPublicLicense = (row) => ({
  id: row.id,
  tenantId: row.empresa_id,
  companyName: row.empresa,
  keyPrefix: row.chave_prefixo || null,
  plan: row.plano_id,
  planName: row.plano,
  tier: row.escalao,
  status: row.estado,
  startsAt: row.data_inicio,
  endsAt: row.data_fim,
  daysRemaining: row.dias_restantes === null || row.dias_restantes === undefined ? null : Number(row.dias_restantes),
  maxMachines: Number(row.max_maquinas),
  machines: Number(row.maquinas || 0),
  lastContactAt: row.ultimo_contacto || null,
  revokedLegacyKeys: Number(row.chaves_revogadas || 0),
  source: row.origem,
});
