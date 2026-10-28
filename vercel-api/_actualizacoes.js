import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Actualizações do Tango ERP (desktop e web), separadas da sincronização de dados.
//
// Cada versão registada no Tango Master tem o interruptor «Disponibilizar para todos»:
//   - desligado: só a equipa de desenvolvimento (dispositivos ou empresas marcados como equipa) a recebe;
//   - ligado: chega a todas as empresas (dentro da percentagem de rollout, por omissão 100%).
// A mesma regra decide o aviso (/check), o feed do electron-updater (latest.yml) e o próprio download do
// instalador: um dispositivo fora da regra não consegue descarregar a versão, mesmo conhecendo o endereço.
//
// Os instaladores ficam na VPS em TANGO_UPDATES_DIR/<versão>/ (latest.yml + ficheiros gerados pelo
// electron-builder). Ao registar uma versão o servidor confere o tamanho e o SHA-512 de cada ficheiro.

export const PLATFORMS = Object.freeze({
  win: { feedFile: 'latest.yml' },
  mac: { feedFile: 'latest-mac.yml' },
});
export const ARCHES = new Set(['x64', 'arm64', 'ia32', 'universal']);
export const DEVICE_STATES = new Set(['up_to_date', 'available', 'downloading', 'downloaded', 'installing', 'verifying', 'succeeded', 'failed', 'deferred']);
export const DEVICE_KINDS = new Set(['desktop', 'web']);

const SEMVER = /^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})(?:-([0-9A-Za-z.-]{1,40}))?$/;
const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/;
const TENANT_ID = /^[A-Z0-9]{1,64}$/;
const MAX_NOTES = 8_000;

export const isSemver = (value) => SEMVER.test(String(value || ''));
export const isDeviceId = (value) => DEVICE_ID.test(String(value || ''));
export const isSafeFileName = (value) => FILE_NAME.test(String(value || '')) && !String(value).includes('..');
export const normalizeTenantId = (value) => {
  const id = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return TENANT_ID.test(id) ? id : null;
};

/** Compara duas versões semver (pré-versões ficam antes da versão final). */
export const compareVersions = (left, right) => {
  const a = SEMVER.exec(String(left || ''));
  const b = SEMVER.exec(String(right || ''));
  if (!a || !b) throw new Error('Versão inválida.');
  for (let index = 1; index <= 3; index++) {
    const diff = Number(a[index]) - Number(b[index]);
    if (diff) return Math.sign(diff);
  }
  if (a[4] === b[4]) return 0;
  if (!a[4]) return 1;
  if (!b[4]) return -1;
  return a[4] < b[4] ? -1 : 1;
};

/** Posição estável (0–99) do dispositivo numa versão: o mesmo dispositivo cai sempre no mesmo lado do rollout. */
export const rolloutBucket = (deviceId, releaseId) =>
  crypto.createHash('sha256').update(`tango-rollout:${releaseId}:${deviceId}`).digest().readUInt32BE(0) % 100;

/** A versão está disponível para este dispositivo? Equipa: sempre; restantes: só com o interruptor ligado. */
export const isEligible = (release, { deviceId, team }) => {
  if (!release || release.status !== 'active') return false;
  if (team) return true;
  if (!release.public) return false;
  const percent = Math.max(0, Math.min(100, Number(release.rolloutPercent ?? 100)));
  if (percent >= 100) return true;
  if (!isDeviceId(deviceId)) return false;
  return rolloutBucket(deviceId, release.id) < percent;
};

/** A versão mais alta que este dispositivo pode receber nesta plataforma (ou null). */
export const pickRelease = (releases, { deviceId, team, platform }) => {
  let best = null;
  for (const release of releases) {
    if (platform && !release.files?.[platform]) continue;
    if (!isEligible(release, { deviceId, team })) continue;
    if (!best || compareVersions(release.version, best.version) > 0) best = release;
  }
  return best;
};

// --- latest.yml -----------------------------------------------------------------------------------------

const unquote = (value) => {
  const text = String(value ?? '').trim();
  if (/^'.*'$/.test(text)) return text.slice(1, -1).replace(/''/g, "'");
  if (/^".*"$/.test(text)) return JSON.parse(text);
  return text;
};

/**
 * Lê o latest.yml / latest-mac.yml do electron-builder (formato fixo: version, files[url, sha512, size],
 * path, sha512, releaseDate). Não é um leitor de YAML genérico: tudo o que fuja ao formato é recusado.
 */
export const parseFeedYaml = (text) => {
  const result = { version: null, files: [], path: null, sha512: null, releaseDate: null };
  let current = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const item = /^\s+-\s+(\w+):\s*(.*)$/.exec(raw);
    const nested = /^\s{4}(\w+):\s*(.*)$/.exec(raw);
    const top = /^(\w+):\s*(.*)$/.exec(raw);
    if (item) {
      current = { [item[1]]: unquote(item[2]) };
      result.files.push(current);
    } else if (nested && current) {
      current[nested[1]] = unquote(nested[2]);
    } else if (top) {
      current = null;
      if (top[1] === 'files') continue;
      if (['version', 'path', 'sha512', 'releaseDate'].includes(top[1])) result[top[1]] = unquote(top[2]);
    } else {
      throw new Error('latest.yml com formato desconhecido.');
    }
  }
  if (!isSemver(result.version)) throw new Error('latest.yml sem versão válida.');
  const files = result.files.map(file => ({ url: String(file.url || ''), sha512: String(file.sha512 || ''), size: Number(file.size) }));
  if (!files.length) throw new Error('latest.yml sem ficheiros.');
  for (const file of files) {
    if (!isSafeFileName(file.url)) throw new Error(`Nome de ficheiro recusado no latest.yml: ${file.url}`);
    if (!/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)) throw new Error(`SHA-512 inválido para ${file.url}.`);
    if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error(`Tamanho inválido para ${file.url}.`);
  }
  return { version: result.version, files, path: result.path || files[0].url, releaseDate: result.releaseDate || null };
};

const yamlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

/**
 * Feed para o electron-updater (provider "generic"), só com a versão que este dispositivo pode receber.
 * Os endereços são relativos ao feed do dispositivo: files/<versão>/<ficheiro> (o download volta a
 * verificar a regra).
 */
export const buildFeedYaml = (release, platform) => {
  const entry = release.files[platform];
  const url = (name) => `files/${release.version}/${name}`;
  const lines = [`version: ${release.version}`, 'files:'];
  for (const file of entry.files) {
    lines.push(`  - url: ${url(file.url)}`, `    sha512: ${file.sha512}`, `    size: ${file.size}`);
  }
  const main = entry.files.find(file => file.url === entry.path) || entry.files[0];
  lines.push(`path: ${url(main.url)}`, `sha512: ${main.sha512}`, `releaseDate: ${yamlString(release.publishedAt || release.createdAt || new Date().toISOString())}`);
  return `${lines.join('\n')}\n`;
};

// --- Ficheiros na VPS -----------------------------------------------------------------------------------

export const updatesDir = () => path.resolve(process.env.TANGO_UPDATES_DIR || path.join(process.cwd(), 'dados-actualizacoes'));

/** Caminho de um ficheiro de uma versão, sem nunca sair da pasta das actualizações. */
export const releaseFilePath = (version, fileName, baseDir = updatesDir()) => {
  if (!isSemver(version) || !isSafeFileName(fileName)) return null;
  const resolved = path.resolve(baseDir, version, fileName);
  return resolved.startsWith(path.resolve(baseDir) + path.sep) ? resolved : null;
};

const sha512File = (filePath) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha512');
  fs.createReadStream(filePath).on('error', reject).on('data', chunk => hash.update(chunk)).on('end', () => resolve(hash.digest('base64')));
});

/**
 * Lê os feeds de uma versão na pasta da VPS e confere cada ficheiro (existe, tamanho e SHA-512 iguais ao
 * feed). Devolve { win?, mac? } ou lança um erro em português com o que falhou.
 */
export const inspectReleaseFiles = async (version, baseDir = updatesDir()) => {
  if (!isSemver(version)) throw new Error('Versão inválida.');
  const found = {};
  for (const [platform, { feedFile }] of Object.entries(PLATFORMS)) {
    const feedPath = releaseFilePath(version, feedFile, baseDir);
    if (!feedPath || !fs.existsSync(feedPath)) continue;
    const feed = parseFeedYaml(fs.readFileSync(feedPath, 'utf8'));
    if (feed.version !== version) throw new Error(`${feedFile} é da versão ${feed.version}, não da ${version}.`);
    for (const file of feed.files) {
      const filePath = releaseFilePath(version, file.url, baseDir);
      if (!filePath || !fs.existsSync(filePath)) throw new Error(`Falta o ficheiro ${file.url} na pasta ${version}.`);
      const stats = fs.statSync(filePath);
      if (stats.size !== file.size) throw new Error(`${file.url}: tamanho ${stats.size} diferente do indicado (${file.size}).`);
      if (await sha512File(filePath) !== file.sha512) throw new Error(`${file.url}: SHA-512 diferente do indicado no ${feedFile}.`);
    }
    found[platform] = { files: feed.files, path: feed.path };
  }
  if (!Object.keys(found).length) throw new Error(`Nenhum latest.yml ou latest-mac.yml encontrado em ${path.join(baseDir, version)}.`);
  return found;
};

// --- Base de dados --------------------------------------------------------------------------------------

export const ensureUpdateTables = async (sql) => {
  await sql(`CREATE TABLE IF NOT EXISTS tango_update_releases (
    id TEXT PRIMARY KEY,
    version TEXT NOT NULL UNIQUE,
    notes TEXT NOT NULL DEFAULT '',
    mandatory BOOLEAN NOT NULL DEFAULT FALSE,
    public BOOLEAN NOT NULL DEFAULT FALSE,
    rollout_percent INTEGER NOT NULL DEFAULT 100,
    status TEXT NOT NULL DEFAULT 'active',
    files JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await sql(`CREATE TABLE IF NOT EXISTS tango_update_devices (
    device_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    platform TEXT,
    arch TEXT,
    app_version TEXT,
    tenant_id TEXT,
    team BOOLEAN NOT NULL DEFAULT FALSE,
    label TEXT,
    state TEXT,
    state_reason TEXT,
    target_version TEXT,
    acked_version TEXT,
    acked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await sql(`CREATE TABLE IF NOT EXISTS tango_update_team_tenants (
    tenant_id TEXT PRIMARY KEY,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await sql(`CREATE TABLE IF NOT EXISTS tango_update_audit (
    id BIGSERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action TEXT NOT NULL,
    version TEXT,
    details TEXT NOT NULL DEFAULT '',
    ip TEXT
  )`);
};

const toRelease = (row) => ({
  id: row.id,
  version: row.version,
  notes: row.notes || '',
  mandatory: !!row.mandatory,
  public: !!row.public,
  rolloutPercent: Number(row.rollout_percent ?? 100),
  status: row.status,
  files: typeof row.files === 'string' ? JSON.parse(row.files) : row.files,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  publishedAt: row.published_at instanceof Date ? row.published_at.toISOString() : row.published_at,
});

export const listReleases = async (sql) => (await sql('SELECT * FROM tango_update_releases ORDER BY created_at DESC')).map(toRelease);

export const findRelease = async (sql, version) => {
  const rows = await sql('SELECT * FROM tango_update_releases WHERE version = $1', [version]);
  return rows[0] ? toRelease(rows[0]) : null;
};

export const writeAudit = (sql, { action, version = null, details = '', ip = null }) =>
  sql('INSERT INTO tango_update_audit (action, version, details, ip) VALUES ($1, $2, $3, $4)',
    [action, version, String(details).slice(0, 2000), ip]);

/** O dispositivo é da equipa de desenvolvimento (marcado directamente ou pela empresa)? */
export const isTeamDevice = async (sql, deviceId) => {
  if (!isDeviceId(deviceId)) return false;
  const rows = await sql(`SELECT d.team OR EXISTS (SELECT 1 FROM tango_update_team_tenants t WHERE t.tenant_id = d.tenant_id) AS team
    FROM tango_update_devices d WHERE d.device_id = $1`, [deviceId]);
  return !!rows[0]?.team;
};

export const registerDevice = async (sql, { deviceId, kind, platform, arch, version, tenantId }) => {
  await sql(`INSERT INTO tango_update_devices (device_id, kind, platform, arch, app_version, tenant_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (device_id) DO UPDATE SET kind = EXCLUDED.kind, platform = EXCLUDED.platform, arch = EXCLUDED.arch,
      app_version = EXCLUDED.app_version, tenant_id = COALESCE(EXCLUDED.tenant_id, tango_update_devices.tenant_id), last_seen = NOW()`,
  [deviceId, kind, platform, arch, version, tenantId]);
};

/** Estado da instalação comunicado pelo dispositivo; o ACK só conta quando a versão já arrancou. */
export const recordDeviceStatus = async (sql, { deviceId, state, reason, targetVersion }) => {
  const rows = await sql(`UPDATE tango_update_devices SET state = $2, state_reason = $3, target_version = COALESCE($4, target_version), last_seen = NOW()
    WHERE device_id = $1 RETURNING device_id`, [deviceId, state, reason ? String(reason).slice(0, 500) : null, targetVersion]);
  return rows.length > 0;
};

/** ACK idempotente: repetir o mesmo ACK não muda a data do primeiro. */
export const recordAck = async (sql, { deviceId, version }) => {
  const rows = await sql(`UPDATE tango_update_devices SET
      acked_at = CASE WHEN acked_version = $2 THEN acked_at ELSE NOW() END,
      acked_version = $2, app_version = $2, state = 'succeeded', state_reason = NULL, last_seen = NOW()
    WHERE device_id = $1 RETURNING acked_at`, [deviceId, version]);
  return rows[0] || null;
};

export const sanitizeNotes = (value) => String(value ?? '').replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, MAX_NOTES).trim();

/** Informação de uma versão que o cliente pode ver (sem endereços: o download passa sempre pelo feed). */
export const publicReleaseInfo = (release, platform) => {
  const entry = platform ? release.files?.[platform] : null;
  const main = entry ? (entry.files.find(file => file.url === entry.path) || entry.files[0]) : null;
  return {
    releaseId: release.id,
    version: release.version,
    notes: release.notes,
    mandatory: release.mandatory,
    size: main?.size ?? null,
    publishedAt: release.publishedAt || release.createdAt,
  };
};
