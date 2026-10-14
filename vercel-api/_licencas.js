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
  // Demonstração sem chave: uma por computador (pelo hash da máquina). Reinstalar não recomeça os 3 dias.
  await sql(`CREATE TABLE IF NOT EXISTS tango_testes (
    machine_hash TEXT PRIMARY KEY,
    inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fim TIMESTAMPTZ NOT NULL,
    nome_maquina TEXT,
    ultimo_contacto TIMESTAMPTZ,
    ip TEXT
  )`);
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

// --- Etapa 2: chave da licença e activação das máquinas ------------------------------------------------------

/** Validade do token entregue ao Desktop: funciona offline até 7 dias, nunca para lá da data de fim. */
export const TOKEN_VALIDITY_MS = 7 * 86_400_000;
/** Um token expirado ainda serve para pedir outro (heartbeat) durante este período; depois, só com a chave. */
export const HEARTBEAT_GRACE_MS = 90 * 86_400_000;

const REFUSAL_BY_STATE = {
  suspensa: { status: 403, code: 'LICENCA_SUSPENSA', message: 'A licença desta empresa está suspensa. Contacte o suporte Tango: +244 941 537 486.' },
  expirada: { status: 403, code: 'LICENCA_EXPIRADA', message: 'A licença desta empresa expirou. Contacte o suporte Tango para a renovar: +244 941 537 486.' },
  revogada: { status: 403, code: 'LICENCA_REVOGADA', message: 'Esta licença foi revogada. Contacte o suporte Tango: +244 941 537 486.' },
};

/**
 * Emite (ou substitui) a chave da licença da empresa e devolve-a em claro uma única vez; o servidor guarda só o hash.
 * Substituir a chave não desliga as máquinas já activadas: elas renovam o token pelo heartbeat.
 */
export const issueLicenseKey = async (sql, tenantId, { generate, parse, hash, prefix }, ip = null) => {
  await migrateTenantsToLicenses(sql);
  const [license] = await sql(`SELECT * FROM tango_licencas WHERE UPPER(empresa_id) = UPPER($1)`, [tenantId]);
  if (!license) return { ok: false, status: 404, message: 'A empresa não tem licença no servidor.' };
  if (license.estado === 'revogada') return { ok: false, status: 409, message: 'A licença desta empresa está revogada.' };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const key = generate();
    const chars = parse(key);
    try {
      await sql(`UPDATE tango_licencas SET chave_hash = $2, chave_prefixo = $3, atualizado_em = NOW() WHERE id = $1`,
        [license.id, hash(chars), prefix(chars)]);
    } catch (error) {
      if (/duplicate key|unique/i.test(String(error?.message))) continue;
      throw error;
    }
    await recordLicenseEvent(sql, { licenseId: license.id, tenantId: license.empresa_id, type: 'chave_emitida', ip,
      detail: { prefixo: prefix(chars), substituiuChaveAnterior: Boolean(license.chave_hash), prefixoAnterior: license.chave_prefixo || null } });
    return { ok: true, key, prefix: prefix(chars), licenseId: license.id, replaced: Boolean(license.chave_hash) };
  }
  throw new Error('Não foi possível gerar uma chave única.');
};

/** Marca como expirada uma licença activa cuja data de fim já passou e devolve o estado efectivo. */
const effectiveState = async (sql, license, now) => {
  if (license.estado === 'ativa' && license.data_fim && new Date(license.data_fim).getTime() <= now.getTime()) {
    await sql(`UPDATE tango_licencas SET estado = 'expirada', atualizado_em = NOW() WHERE id = $1 AND estado = 'ativa'`, [license.id]);
    await recordLicenseEvent(sql, { licenseId: license.id, tenantId: license.empresa_id, type: 'expirou', detail: { dataFim: license.data_fim } });
    return 'expirada';
  }
  return license.estado;
};

const tokenClaims = (license, plan, activation, now) => {
  const ends = license.data_fim ? new Date(license.data_fim).getTime() : Infinity;
  const validUntil = Math.min(now.getTime() + TOKEN_VALIDITY_MS, ends);
  return {
    iss: 'tango-master',
    sub: license.id,
    jti: crypto.randomUUID(),
    empresa_id: license.empresa_id,
    licenca_id: license.id,
    plano: license.plano_id,
    plano_nome: plan?.nome || license.plano_id,
    escalao: license.escalao,
    funcionalidades: plan?.funcionalidades || {},
    max_maquinas: Number(license.max_maquinas),
    machine_hash: activation.machine_hash,
    data_fim: license.data_fim ? new Date(license.data_fim).toISOString() : null,
    valido_ate: new Date(validUntil).toISOString(),
    hora_servidor: now.toISOString(),
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(validUntil / 1000),
  };
};

/** JSON lido como texto: o mesmo resultado com o driver da Neon e com a ponte pg da VPS. */
const parseJsonText = (value, fallback) => {
  if (value && typeof value === 'object') return value;
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};

const issueToken = async (sql, license, activation, sign, now) => {
  const [row] = await sql(`SELECT nome, funcionalidades::text AS funcionalidades FROM tango_planos WHERE id = $1`, [license.plano_id]);
  const plan = row ? { nome: row.nome, funcionalidades: parseJsonText(row.funcionalidades, {}) } : null;
  const claims = tokenClaims(license, plan, activation, now);
  return { token: sign(claims), claims };
};

const refuse = async (sql, license, outcome, detail, ip) => {
  await recordLicenseEvent(sql, { licenseId: license?.id || null, tenantId: license?.empresa_id || null, type: 'ativacao_recusada', ip,
    detail: { motivo: outcome.code, ...detail } });
  return { ok: false, ...outcome };
};

/**
 * POST /api/licencas/ativar: valida a chave e a máquina, regista a máquina (até ao máximo da licença) e devolve
 * um token assinado. `sign(claims)` assina o token (injectado para permitir testes).
 */
export const activateLicense = async (sql, { key, machineHash: machine, legacyMachineHash = null, machineName, ip = null }, { parse, hash, sign }, now = new Date()) => {
  const chars = parse(key);
  if (!chars) return { ok: false, failure: true, status: 400, code: 'CHAVE_MAL_ESCRITA', message: 'A chave de licença está mal escrita. Confira os caracteres (formato TANGO-XXXX-XXXX-XXXX-XXXX).' };
  if (!/^[0-9a-f]{64}$/u.test(String(machine || ''))) return { ok: false, status: 400, code: 'MAQUINA_INVALIDA', message: 'Identificação da máquina inválida.' };
  const [license] = await sql(`SELECT * FROM tango_licencas WHERE chave_hash = $1`, [hash(chars)]);
  if (!license) return { ok: false, failure: true, status: 404, code: 'CHAVE_DESCONHECIDA', message: 'Esta chave de licença não existe ou foi substituída por uma nova.' };

  const state = await effectiveState(sql, license, now);
  if (state !== 'ativa') return refuse(sql, license, REFUSAL_BY_STATE[state], { maquina: machine.slice(0, 12) }, ip);

  const name = String(machineName || '').trim().slice(0, 120) || null;
  let [existing] = await sql(`SELECT * FROM tango_licenca_ativacoes WHERE licenca_id = $1 AND machine_hash = $2`, [license.id, machine]);
  // Computador registado a partir de uma chave antiga (pelo identificador antigo): passa a usar a impressão digital
  // nova em vez de ocupar outro lugar da licença.
  const legacy = /^[0-9a-f]{64}$/u.test(String(legacyMachineHash || '')) && legacyMachineHash !== machine ? legacyMachineHash : null;
  if (!existing && legacy) {
    const [migrated] = await sql(`UPDATE tango_licenca_ativacoes SET machine_hash = $3, ultimo_heartbeat = $4,
        nome_maquina = COALESCE($5, nome_maquina), estado = 'ativa'
      WHERE licenca_id = $1 AND machine_hash = $2 AND estado = 'ativa' RETURNING *`, [license.id, legacy, machine, now.toISOString(), String(machineName || '').trim().slice(0, 120) || null]);
    if (migrated) {
      existing = migrated;
      await recordLicenseEvent(sql, { licenseId: license.id, tenantId: license.empresa_id, type: 'maquina_migrada', ip,
        detail: { de: legacy.slice(0, 12), para: machine.slice(0, 12) } });
    }
  }
  let activation = existing;
  if (existing?.estado === 'ativa') {
    [activation] = await sql(`UPDATE tango_licenca_ativacoes SET ultimo_heartbeat = $3, nome_maquina = COALESCE($2, nome_maquina)
      WHERE id = $1 RETURNING *`, [existing.id, name, now.toISOString()]);
  } else {
    const [{ total }] = await sql(`SELECT COUNT(*)::int AS total FROM tango_licenca_ativacoes WHERE licenca_id = $1 AND estado = 'ativa'`, [license.id]);
    if (total >= Number(license.max_maquinas)) {
      return refuse(sql, license, { status: 409, code: 'LIMITE_MAQUINAS',
        message: `Esta licença já está activa em ${total} de ${license.max_maquinas} computador(es). Peça ao suporte Tango para libertar um computador ou aumentar o plano.` },
        { maquina: machine.slice(0, 12), activas: total }, ip);
    }
    [activation] = await sql(`INSERT INTO tango_licenca_ativacoes (id, licenca_id, machine_hash, nome_maquina, primeira_ativacao, ultimo_heartbeat, estado)
      VALUES ($1, $2, $3, $4, $5, $5, 'ativa')
      ON CONFLICT (licenca_id, machine_hash) DO UPDATE SET estado = 'ativa', ultimo_heartbeat = EXCLUDED.ultimo_heartbeat,
        nome_maquina = COALESCE(EXCLUDED.nome_maquina, tango_licenca_ativacoes.nome_maquina)
      RETURNING *`, [crypto.randomUUID(), license.id, machine, name, now.toISOString()]);
    await recordLicenseEvent(sql, { licenseId: license.id, tenantId: license.empresa_id, type: existing ? 'maquina_reativada' : 'maquina_ativada', ip,
      detail: { maquina: machine.slice(0, 12), nome: name, activas: total + 1, maximo: Number(license.max_maquinas) } });
  }
  const { token, claims } = await issueToken(sql, license, activation, sign, now);
  return { ok: true, token, claims };
};

// --- Demonstração de 3 dias sem chave ---------------------------------------------------------------------

export const TRIAL_DAYS = 3;
/** Identificador da «licença» de demonstração de um computador (vai no token; não existe em tango_licencas). */
export const trialLicenseId = (machine) => `teste:${machine}`;

/**
 * POST /api/licencas/teste: começa (ou retoma) a demonstração deste computador e devolve um token assinado com
 * plano «trial» e o fim calculado no servidor (início + 3 dias). Depois do fim o token continua a ser entregue,
 * já expirado, para o Desktop mostrar o ecrã de activação mesmo que apaguem os ficheiros locais.
 */
export const startTrial = async (sql, { machineHash: machine, machineName, ip = null }, { sign }, now = new Date()) => {
  if (!/^[0-9a-f]{64}$/u.test(String(machine || ''))) return { ok: false, status: 400, code: 'MAQUINA_INVALIDA', message: 'Identificação da máquina inválida.' };
  const name = String(machineName || '').trim().slice(0, 120) || null;
  const ends = new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString();
  const [created] = await sql(`INSERT INTO tango_testes (machine_hash, inicio, fim, nome_maquina, ultimo_contacto, ip)
    VALUES ($1, $2, $3, $4, $2, $5) ON CONFLICT (machine_hash) DO NOTHING RETURNING machine_hash`, [machine, now.toISOString(), ends, name, ip]);
  const [trial] = await sql(`UPDATE tango_testes SET ultimo_contacto = $2, nome_maquina = COALESCE($3, nome_maquina)
    WHERE machine_hash = $1 RETURNING inicio::text AS inicio, fim::text AS fim`, [machine, now.toISOString(), name]);
  if (created) await recordLicenseEvent(sql, { licenseId: trialLicenseId(machine).slice(0, 18), type: 'teste_iniciado', ip, detail: { maquina: machine.slice(0, 12), nome: name, fim: ends } });
  const end = new Date(trial.fim).getTime();
  const validUntil = Math.min(now.getTime() + TOKEN_VALIDITY_MS, end);
  const claims = {
    iss: 'tango-master',
    sub: trialLicenseId(machine),
    jti: crypto.randomUUID(),
    empresa_id: '',
    licenca_id: trialLicenseId(machine),
    plano: 'trial',
    plano_nome: `Demonstração (${TRIAL_DAYS} dias)`,
    escalao: 'singular',
    funcionalidades: {},
    max_maquinas: 1,
    machine_hash: machine,
    data_inicio: new Date(trial.inicio).toISOString(),
    data_fim: new Date(end).toISOString(),
    valido_ate: new Date(validUntil).toISOString(),
    hora_servidor: now.toISOString(),
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(validUntil / 1000),
  };
  return { ok: true, token: sign(claims), claims };
};

/**
 * POST /api/licencas/heartbeat: com o token anterior (mesmo expirado há menos de 90 dias) e a mesma máquina,
 * confirma que a licença continua activa e devolve um token renovado. `verify(token)` devolve as reivindicações.
 */
export const licenseHeartbeat = async (sql, { token, machineHash: machine, ip = null }, { verify, sign }, now = new Date()) => {
  const claims = verify(token);
  if (!claims) return { ok: false, status: 401, code: 'TOKEN_INVALIDO', message: 'O token de licença é inválido. Active de novo com a chave de licença.' };
  if (!/^[0-9a-f]{64}$/u.test(String(machine || '')) || claims.machine_hash !== machine) {
    return { ok: false, status: 401, code: 'MAQUINA_DIFERENTE', message: 'O token pertence a outro computador. Active este computador com a chave de licença.' };
  }
  if (Number(claims.exp) * 1000 + HEARTBEAT_GRACE_MS < now.getTime()) {
    return { ok: false, status: 401, code: 'TOKEN_ANTIGO', message: 'Este computador esteve muito tempo sem ligação. Active-o de novo com a chave de licença.' };
  }
  // Demonstração: renova a partir do registo do servidor (o fim nunca muda).
  if (String(claims.licenca_id || '').startsWith('teste:')) return startTrial(sql, { machineHash: machine, ip }, { sign }, now);
  const [license] = await sql(`SELECT * FROM tango_licencas WHERE id = $1`, [claims.licenca_id]);
  if (!license) return { ok: false, status: 404, code: 'LICENCA_DESCONHECIDA', message: 'A licença deste computador já não existe.' };
  const state = await effectiveState(sql, license, now);
  if (state !== 'ativa') return refuse(sql, license, REFUSAL_BY_STATE[state], { origem: 'heartbeat', maquina: machine.slice(0, 12) }, ip);
  const [activation] = await sql(`UPDATE tango_licenca_ativacoes SET ultimo_heartbeat = $3
    WHERE licenca_id = $1 AND machine_hash = $2 AND estado = 'ativa' RETURNING *`, [license.id, machine, now.toISOString()]);
  if (!activation) {
    return refuse(sql, license, { status: 403, code: 'MAQUINA_LIBERTADA', message: 'Este computador foi desligado da licença. Active-o de novo com a chave de licença.' },
      { origem: 'heartbeat', maquina: machine.slice(0, 12) }, ip);
  }
  const renewed = await issueToken(sql, license, activation, sign, now);
  return { ok: true, token: renewed.token, claims: renewed.claims };
};

// --- Etapa 3: verificação da licença em cada pedido da empresa ----------------------------------------------

/** Códigos antigos usados pelos clientes (versão web e Desktop) para mostrar o bloqueio. */
const LEGACY_CODE_BY_STATE = { suspensa: 'BLOCKED', revogada: 'BLOCKED', expirada: 'EXPIRED' };

/**
 * A licença da empresa permite usar a nuvem agora? Uma empresa sem linha de licença (registada antes das
 * licenças ou pela chave global) segue só as regras da própria empresa.
 */
export const checkTenantLicense = async (sql, tenantId, now = new Date()) => {
  const [license] = await sql(`SELECT id, empresa_id, estado, data_fim FROM tango_licencas WHERE UPPER(empresa_id) = UPPER($1)`, [tenantId]);
  if (!license) return { ok: true, license: null };
  const state = await effectiveState(sql, license, now);
  if (state === 'ativa') return { ok: true, license };
  return { ok: false, state, legacyCode: LEGACY_CODE_BY_STATE[state], ...REFUSAL_BY_STATE[state] };
};

/**
 * Middleware de licença para as rotas da empresa (sincronização, versão web, relatórios, consultas).
 * Se as tabelas de licenças não estiverem disponíveis, deixa passar: o estado e a validade da empresa já foram
 * verificados por quem chama, e uma falha da base não deve parar todas as empresas.
 */
export const licenseGate = async (sql, tenantId) => {
  try {
    await prepareLicenses(sql, process.env.DATABASE_URL || 'default');
    return await checkTenantLicense(sql, tenantId);
  } catch (error) {
    console.error('[licencas][verificacao]', error?.message || error);
    return { ok: true, license: null, unavailable: true };
  }
};

// --- Etapa 5: gestão da licença no painel do Master ---------------------------------------------------------

const findLicense = async (sql, tenantId) => {
  await migrateTenantsToLicenses(sql);
  const [license] = await sql(`SELECT * FROM tango_licencas WHERE UPPER(empresa_id) = UPPER($1)`, [tenantId]);
  return license || null;
};

export const listPlans = (sql) => sql(`SELECT id, nome, duracao_meses, duracao_dias, max_maquinas FROM tango_planos ORDER BY
  CASE id WHEN 'trial' THEN 0 WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 2 WHEN 'biannual' THEN 3 WHEN 'annual' THEN 4
    WHEN 'lifetime' THEN 5 ELSE 6 END`);

/** Muda o plano, o escalão e o número de computadores. Os computadores já activados mantêm-se. */
export const changeLicensePlan = async (sql, tenantId, { plan, tier, maxMachines }, ip = null) => {
  const license = await findLicense(sql, tenantId);
  if (!license) return { ok: false, status: 404, message: 'A empresa não tem licença no servidor.' };
  if (license.estado === 'revogada') return { ok: false, status: 409, message: 'A licença desta empresa está revogada.' };
  const [planRow] = await sql(`SELECT id FROM tango_planos WHERE id = $1`, [String(plan || '')]);
  if (!planRow) return { ok: false, status: 400, message: 'Plano desconhecido.' };
  if (!LICENSE_TIERS.includes(tier)) return { ok: false, status: 400, message: 'Escalão inválido (singular ou empresarial).' };
  const machines = Number(maxMachines);
  if (!Number.isSafeInteger(machines) || machines < 1 || machines > 10_000) return { ok: false, status: 400, message: 'Número de computadores inválido (1 a 10 000).' };
  await sql(`UPDATE tango_licencas SET plano_id = $2, escalao = $3, max_maquinas = $4, atualizado_em = NOW() WHERE id = $1`,
    [license.id, planRow.id, tier, machines]);
  const [{ total }] = await sql(`SELECT COUNT(*)::int AS total FROM tango_licenca_ativacoes WHERE licenca_id = $1 AND estado = 'ativa'`, [license.id]);
  await recordLicenseEvent(sql, { licenseId: license.id, tenantId: license.empresa_id, type: 'plano_alterado', ip, detail: {
    antes: { plano: license.plano_id, escalao: license.escalao, maxMaquinas: license.max_maquinas },
    depois: { plano: planRow.id, escalao: tier, maxMaquinas: machines },
  } });
  return { ok: true, activeMachines: total, overLimit: total > machines };
};

/** Liberta um computador (troca de computador): deixa de renovar o token e o lugar fica livre. */
export const releaseMachine = async (sql, tenantId, activationId, ip = null) => {
  const license = await findLicense(sql, tenantId);
  if (!license) return { ok: false, status: 404, message: 'A empresa não tem licença no servidor.' };
  const [released] = await sql(`UPDATE tango_licenca_ativacoes SET estado = 'libertada'
    WHERE id = $1 AND licenca_id = $2 AND estado = 'ativa' RETURNING id, nome_maquina, machine_hash`, [String(activationId || ''), license.id]);
  if (!released) return { ok: false, status: 404, message: 'Computador não encontrado ou já libertado.' };
  await recordLicenseEvent(sql, { licenseId: license.id, tenantId: license.empresa_id, type: 'maquina_libertada', ip,
    detail: { maquina: released.machine_hash.slice(0, 12), nome: released.nome_maquina } });
  return { ok: true };
};

/** Computadores e histórico da licença (mais recente primeiro). */
export const licenseDetails = async (sql, tenantId) => {
  const license = await findLicense(sql, tenantId);
  if (!license) return { ok: false, status: 404, message: 'A empresa não tem licença no servidor.' };
  const machines = await sql(`SELECT id, nome_maquina, machine_hash, primeira_ativacao, ultimo_heartbeat, estado
    FROM tango_licenca_ativacoes WHERE licenca_id = $1 ORDER BY (estado = 'ativa') DESC, ultimo_heartbeat DESC NULLS LAST, primeira_ativacao DESC`, [license.id]);
  const events = await sql(`SELECT id, tipo, detalhe::text AS detalhe, ip, criado_em FROM tango_licenca_eventos
    WHERE licenca_id = $1 OR (licenca_id IS NULL AND UPPER(empresa_id) = UPPER($2)) ORDER BY criado_em DESC, id DESC LIMIT 200`, [license.id, license.empresa_id]);
  return {
    ok: true,
    machines: machines.map(row => ({
      id: row.id,
      name: row.nome_maquina || null,
      fingerprint: String(row.machine_hash).slice(0, 12),
      firstActivatedAt: row.primeira_ativacao,
      lastHeartbeatAt: row.ultimo_heartbeat,
      status: row.estado,
    })),
    events: events.map(row => ({ id: String(row.id), type: row.tipo, detail: parseJsonText(row.detalhe, {}), ip: row.ip || null, at: row.criado_em })),
  };
};

/**
 * A licença da empresa inclui o módulo? O plano pode dizê-lo (funcionalidades.<módulo> = true/false); sem isso,
 * os módulos de rede e Multi-Empresas vêm com o escalão empresarial. Empresas sem licença no servidor (antigas)
 * mantêm o que tinham.
 */
export const tenantAllowsFeature = async (sql, tenantId, feature) => {
  const [row] = await sql(`SELECT l.escalao, p.funcionalidades::text AS funcionalidades FROM tango_licencas l
    JOIN tango_planos p ON p.id = l.plano_id WHERE UPPER(l.empresa_id) = UPPER($1)`, [tenantId]);
  if (!row) return true;
  const explicit = parseJsonText(row.funcionalidades, {})[feature];
  return typeof explicit === 'boolean' ? explicit : row.escalao === 'empresarial';
};

/** Resumo da licença para a versão web (que não pede chave: herda a licença da empresa). */
export const licenseSummary = async (sql, tenantId) => {
  const rows = await listLicenses(sql);
  const row = rows.find(item => String(item.empresa_id).toUpperCase() === String(tenantId).toUpperCase());
  if (!row) return null;
  const license = toPublicLicense(row);
  const [plan] = await sql(`SELECT funcionalidades::text AS funcionalidades FROM tango_planos WHERE id = $1`, [license.plan]);
  return {
    plan: license.plan, planName: license.planName, tier: license.tier, status: license.status, endsAt: license.endsAt,
    daysRemaining: license.daysRemaining, maxMachines: license.maxMachines, machines: license.machines,
    // Módulos do plano (ex.: multi_empresa): a versão web mostra-os só quando a licença os inclui.
    features: parseJsonText(plan?.funcionalidades, {}),
  };
};

/** Estado no servidor das chaves antigas (eyJ…) emitidas pelo Master: mantida na licença da empresa ou revogada. */
export const legacyKeyStatuses = async (sql, jtis) => {
  const list = (Array.isArray(jtis) ? jtis : []).map(value => String(value || '').toLowerCase()).filter(value => /^[0-9a-f-]{36}$/u.test(value)).slice(0, 5000);
  if (!list.length) return [];
  const rows = await sql(`SELECT jti, estado, empresa_id FROM tango_licencas_legado WHERE jti = ANY($1)`, [list]);
  return rows.map(row => ({ jti: row.jti, state: row.estado, tenantId: row.empresa_id }));
};
