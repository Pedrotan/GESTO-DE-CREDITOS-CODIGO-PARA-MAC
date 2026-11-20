// Verificação de integridade entre os dispositivos de uma empresa (sem ver dados: só os resumos por tabela e grupo que
// cada dispositivo calcula). Quando os IDs de um grupo diferem, pede ao dispositivo que tem mais registos nesse grupo
// que reenvie a cópia completa dos registos do grupo; quem os não tem recebe-os pela sincronização normal (a cópia de
// autocura cria o que falta e não sobrescreve o que já existe). Conteúdo diferente com os mesmos IDs só é contado.

import { ensureSyncDevicesTable } from './_dispositivos-sync.js';

const FRESH_MS = 30 * 60_000;
const BUCKETS = 16;
// O mesmo pedido de reparação (empresa, dispositivo, tabela, grupo) no máximo a cada 6 h: uma diferença que não se
// resolve (ex.: registo a mais, que a cópia não apaga) não pode pôr um dispositivo a reenviar sem parar.
const REPEAT_MS = 6 * 60 * 60_000;
const recentRequests = new Map();

const TABLE = /^[a-z_][a-z0-9_]{0,63}$/u;
const SHORT = /^[0-9a-f]{1,32}$/u;

/** Valida o resumo enviado pelo dispositivo (só contagens e hashes curtos). */
export const normalizeIntegrity = (value) => {
  if (!value || typeof value !== 'object' || !value.tables || typeof value.tables !== 'object') return null;
  const at = Date.parse(String(value.at || ''));
  const tables = {};
  for (const [name, digest] of Object.entries(value.tables).slice(0, 200)) {
    if (!TABLE.test(name) || !digest || !Array.isArray(digest.buckets) || digest.buckets.length !== BUCKETS) continue;
    const buckets = digest.buckets.map(bucket => ({
      count: Math.max(0, Math.min(10_000_000, Math.floor(Number(bucket?.count) || 0))),
      ids: SHORT.test(String(bucket?.ids)) ? String(bucket.ids) : '',
      content: SHORT.test(String(bucket?.content)) ? String(bucket.content) : '',
    }));
    tables[name] = { count: buckets.reduce((total, bucket) => total + bucket.count, 0), buckets };
  }
  return { at: Number.isFinite(at) ? new Date(at).toISOString() : new Date().toISOString(), tables };
};

/**
 * Plano para um dispositivo: grupos com IDs diferentes dos outros dispositivos recentes (registos em falta ou a mais),
 * tabelas com conteúdo diferente, e que dispositivo deve reenviar cada grupo (o que tem mais registos nele; empate:
 * o computador e, depois, o mais recente).
 */
export const integrityPlan = (devices, deviceId, now = Date.now()) => {
  const fresh = devices.filter(device => device.integrity && now - Date.parse(device.integrity.at) < FRESH_MS);
  const me = fresh.find(device => device.deviceId === deviceId);
  const result = { compared: Math.max(0, fresh.length - 1), missing: [], content: [], requests: [] };
  if (!me) return result;
  const others = fresh.filter(device => device.deviceId !== deviceId);
  const tables = new Set([...Object.keys(me.integrity.tables), ...others.flatMap(device => Object.keys(device.integrity.tables))]);
  for (const table of tables) {
    const mine = me.integrity.tables[table];
    const differing = [];
    let contentDiffers = false;
    for (let bucket = 0; bucket < BUCKETS; bucket++) {
      const holders = others.map(device => ({ device, digest: device.integrity.tables[table]?.buckets[bucket] })).filter(item => item.digest);
      if (!holders.length) continue;
      const myBucket = mine?.buckets[bucket];
      const different = holders.filter(item => item.digest.ids !== myBucket?.ids);
      if (!different.length) {
        if (myBucket && holders.some(item => item.digest.content !== myBucket.content)) contentDiffers = true;
        continue;
      }
      differing.push(bucket);
      const source = different.sort((a, b) => (b.digest.count - a.digest.count)
        || ((b.device.platform === 'desktop') - (a.device.platform === 'desktop'))
        || (Date.parse(b.device.integrity.at) - Date.parse(a.device.integrity.at)))[0];
      // Só a quem tem pelo menos tantos registos no grupo; se cada lado tiver um que falta ao outro, acerta-se em duas
      // voltas (o mais pequeno recebe, fica maior e depois envia o seu).
      if (source.digest.count > 0 && source.digest.count >= (myBucket?.count || 0)) result.requests.push({ sourceDeviceId: source.device.deviceId, table, bucket });
    }
    if (differing.length) result.missing.push({ table, buckets: differing });
    if (contentDiffers) result.content.push(table);
  }
  return result;
};

/** Guarda os pedidos de reparação nos dispositivos que devem reenviar (sem repetir o mesmo pedido em 6 h). */
const queueRepairs = async (sql, tenantHash, deviceId, requests, now) => {
  const bySource = new Map();
  for (const request of requests) {
    const key = `${tenantHash}:${deviceId}:${request.sourceDeviceId}:${request.table}:${request.bucket}`;
    if (now - (recentRequests.get(key) || 0) < REPEAT_MS) continue;
    recentRequests.set(key, now);
    const tables = bySource.get(request.sourceDeviceId) || {};
    tables[request.table] = [...new Set([...(tables[request.table] || []), request.bucket])];
    bySource.set(request.sourceDeviceId, tables);
  }
  for (const [sourceDeviceId, tables] of bySource) {
    await sql(
      `UPDATE tango_sync_devices SET repair_requests = COALESCE(repair_requests, '{}'::jsonb) || $3::jsonb WHERE tenant_hash = $1 AND device_id = $2`,
      [tenantHash, sourceDeviceId, JSON.stringify(tables)]
    );
  }
  if (recentRequests.size > 50_000) recentRequests.clear();
};

/**
 * Depois de registar o dispositivo: guarda o resumo novo (se veio), calcula o plano, pede as reparações e devolve ao
 * dispositivo o que ele próprio deve reenviar (pedidos de outros) e o estado da sua integridade. Nunca falha a
 * sincronização.
 */
export const syncIntegrity = async (sql, tenantHash, deviceId, rawIntegrity, now = Date.now()) => {
  try {
    await ensureSyncDevicesTable(sql);
    const integrity = normalizeIntegrity(rawIntegrity);
    if (integrity) {
      await sql(`UPDATE tango_sync_devices SET integrity = $3::jsonb WHERE tenant_hash = $1 AND device_id = $2`,
        [tenantHash, deviceId, JSON.stringify(integrity)]);
    }
    const rows = await sql(`SELECT device_id, platform, integrity FROM tango_sync_devices WHERE tenant_hash = $1 AND integrity IS NOT NULL`, [tenantHash]);
    const devices = rows.map(row => ({
      deviceId: row.device_id, platform: row.platform,
      integrity: typeof row.integrity === 'string' ? JSON.parse(row.integrity) : row.integrity,
    }));
    const plan = integrityPlan(devices, deviceId, now);
    if (integrity && plan.requests.length) await queueRepairs(sql, tenantHash, deviceId, plan.requests, now);
    // Pedidos de reparação feitos a ESTE dispositivo: entrega-os e limpa-os.
    // RETURNING devolve a linha já alterada: o valor anterior vem da subconsulta, bloqueada até ao fim do UPDATE.
    const [own] = await sql(
      `UPDATE tango_sync_devices AS d SET repair_requests = NULL
       FROM (SELECT tenant_hash, device_id, repair_requests FROM tango_sync_devices
             WHERE tenant_hash = $1 AND device_id = $2 AND repair_requests IS NOT NULL FOR UPDATE) AS previous
       WHERE d.tenant_hash = previous.tenant_hash AND d.device_id = previous.device_id
       RETURNING previous.repair_requests AS requests`, [tenantHash, deviceId]);
    const requested = own?.requests ? (typeof own.requests === 'string' ? JSON.parse(own.requests) : own.requests) : {};
    return {
      compared: plan.compared,
      missingTables: plan.missing.length,
      contentTables: plan.content.length,
      missing: plan.missing.slice(0, 50),
      content: plan.content.slice(0, 50),
      repairRequests: Object.entries(requested).slice(0, 100).map(([table, buckets]) => ({ table, buckets: Array.isArray(buckets) ? buckets.slice(0, BUCKETS) : [] })),
    };
  } catch (cause) {
    console.warn('[sync][integridade] Verificação não feita:', cause?.message || cause);
    return undefined;
  }
};
