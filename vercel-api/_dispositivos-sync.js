// Diagnóstico da sincronização por dispositivo (tabela tango_sync_devices): versão real da app, última sincronização,
// cursor, o que está por enviar ou retido, ilegíveis, conflitos, recusas 413, último erro e a diferença do relógio do
// computador para o servidor. Só números e textos de estado: nunca dados da empresa (esses continuam cifrados).

const PLATFORMS = new Set(['desktop', 'web']);
const count = value => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? Math.min(number, 1_000_000_000) : null;
};
const text = (value, max) => {
  const clean = String(value ?? '').replace(/[\u0000-\u001f]/gu, ' ').trim();
  return clean ? clean.slice(0, max) : null;
};

export const ensureSyncDevicesTable = async (sql) => {
  await sql(`
    CREATE TABLE IF NOT EXISTS tango_sync_devices (
      tenant_hash TEXT NOT NULL,
      device_id TEXT NOT NULL,
      platform TEXT,
      app_version TEXT,
      user_agent TEXT,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_sync_at TIMESTAMPTZ,
      last_cursor BIGINT,
      pending INTEGER,
      oversized INTEGER,
      waiting INTEGER,
      unreadable INTEGER,
      conflicts INTEGER,
      other_version INTEGER,
      rejected_413 INTEGER NOT NULL DEFAULT 0,
      last_413_at TIMESTAMPTZ,
      last_error TEXT,
      last_error_at TIMESTAMPTZ,
      clock_skew_ms BIGINT,
      PRIMARY KEY (tenant_hash, device_id)
    )
  `);
};

/** Valores do diagnóstico enviados pelo dispositivo, validados e limitados. */
export const normalizeDiagnostics = (input, serverNow = Date.now()) => {
  const diagnostics = input && typeof input === 'object' ? input : {};
  const clientTime = Number(diagnostics.clientTime);
  return {
    platform: PLATFORMS.has(diagnostics.platform) ? diagnostics.platform : null,
    appVersion: text(diagnostics.appVersion, 40),
    pending: count(diagnostics.pending),
    oversized: count(diagnostics.oversized),
    waiting: count(diagnostics.waiting),
    unreadable: count(diagnostics.unreadable),
    conflicts: count(diagnostics.conflicts),
    otherVersion: count(diagnostics.otherVersion),
    // Recusas por tamanho que o dispositivo recebeu desde o último diagnóstico (inclui as de um proxy).
    rejected413: count(diagnostics.rejected413) ?? 0,
    lastError: text(diagnostics.lastError, 300),
    // Positivo: o relógio do computador está adiantado em relação ao servidor.
    clockSkewMs: Number.isFinite(clientTime) && clientTime > 0 ? Math.round(clientTime - serverNow) : null,
  };
};

/**
 * Regista o estado do dispositivo. `outcome.synced` marca uma sincronização concluída (com o cursor entregue);
 * `outcome.rejected413` soma uma recusa por tamanho feita pelo servidor; `outcome.error` guarda o motivo.
 * Nunca deixa a sincronização falhar por causa do diagnóstico.
 */
export const recordSyncDevice = async (sql, { tenantHash, deviceId, userAgent, diagnostics, outcome = {} }) => {
  try {
    const d = normalizeDiagnostics(diagnostics);
    const rejected = d.rejected413 + (outcome.rejected413 ? 1 : 0);
    const error = text(outcome.error, 300) || d.lastError;
    await ensureSyncDevicesTable(sql);
    await sql(
      `INSERT INTO tango_sync_devices AS d (tenant_hash, device_id, platform, app_version, user_agent, last_seen_at, last_sync_at, last_cursor,
          pending, oversized, waiting, unreadable, conflicts, other_version, rejected_413, last_413_at, last_error, last_error_at, clock_skew_ms)
       VALUES ($1, $2, $3, $4, $5, NOW(), CASE WHEN $6::boolean THEN NOW() END, $7, $8, $9, $10, $11, $12, $13, $14,
          CASE WHEN $14 > 0 THEN NOW() END, $15, CASE WHEN $15::text IS NOT NULL THEN NOW() END, $16)
       ON CONFLICT (tenant_hash, device_id) DO UPDATE SET
          platform = COALESCE(EXCLUDED.platform, d.platform),
          app_version = COALESCE(EXCLUDED.app_version, d.app_version),
          user_agent = COALESCE(EXCLUDED.user_agent, d.user_agent),
          last_seen_at = NOW(),
          last_sync_at = COALESCE(EXCLUDED.last_sync_at, d.last_sync_at),
          last_cursor = COALESCE(EXCLUDED.last_cursor, d.last_cursor),
          pending = COALESCE(EXCLUDED.pending, d.pending),
          oversized = COALESCE(EXCLUDED.oversized, d.oversized),
          waiting = COALESCE(EXCLUDED.waiting, d.waiting),
          unreadable = COALESCE(EXCLUDED.unreadable, d.unreadable),
          conflicts = COALESCE(EXCLUDED.conflicts, d.conflicts),
          other_version = COALESCE(EXCLUDED.other_version, d.other_version),
          rejected_413 = d.rejected_413 + EXCLUDED.rejected_413,
          last_413_at = COALESCE(EXCLUDED.last_413_at, d.last_413_at),
          last_error = CASE WHEN EXCLUDED.last_sync_at IS NOT NULL AND EXCLUDED.last_error IS NULL THEN NULL ELSE COALESCE(EXCLUDED.last_error, d.last_error) END,
          last_error_at = CASE WHEN EXCLUDED.last_sync_at IS NOT NULL AND EXCLUDED.last_error IS NULL THEN d.last_error_at ELSE COALESCE(EXCLUDED.last_error_at, d.last_error_at) END,
          clock_skew_ms = COALESCE(EXCLUDED.clock_skew_ms, d.clock_skew_ms)`,
      [tenantHash, String(deviceId).slice(0, 100), d.platform, d.appVersion, text(userAgent, 200), Boolean(outcome.synced),
        outcome.cursor ?? null, d.pending, d.oversized, d.waiting, d.unreadable, d.conflicts, d.otherVersion, rejected, error, d.clockSkewMs]
    );
  } catch (cause) {
    console.warn('[sync][dispositivos] Diagnóstico não registado:', cause?.message || cause);
  }
};

/** Dispositivos de uma empresa (para o Tango Master), do mais recente para o mais antigo. */
export const listSyncDevices = async (sql, tenantHash) => {
  await ensureSyncDevicesTable(sql);
  const rows = await sql(`SELECT * FROM tango_sync_devices WHERE tenant_hash = $1 ORDER BY last_seen_at DESC LIMIT 200`, [tenantHash]);
  return rows.map(row => ({
    deviceId: row.device_id, platform: row.platform, appVersion: row.app_version, userAgent: row.user_agent,
    firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, lastSyncAt: row.last_sync_at, lastCursor: row.last_cursor === null ? null : Number(row.last_cursor),
    pending: row.pending, oversized: row.oversized, waiting: row.waiting, unreadable: row.unreadable, conflicts: row.conflicts, otherVersion: row.other_version,
    rejected413: Number(row.rejected_413 || 0), last413At: row.last_413_at, lastError: row.last_error, lastErrorAt: row.last_error_at,
    clockSkewMs: row.clock_skew_ms === null ? null : Number(row.clock_skew_ms),
  }));
};
