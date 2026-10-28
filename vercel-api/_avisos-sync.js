// Aviso em tempo real da sincronização (Server-Sent Events). Quando um dispositivo envia alterações, os outros
// dispositivos ligados da mesma empresa recebem só «há novidades» e vão buscá-las logo (os dados vêm sempre pelo
// /api/sync, cifrados). Se um aviso se perder, a sincronização periódica apanha.

const MAX_PER_TENANT = 100;
const MAX_TOTAL = 3000;
const KEEPALIVE_MS = 25_000;

/** Empresa (hash) → ligações abertas, cada uma com o dispositivo a que pertence. */
const channels = new Map();
let total = 0;

export const syncChannelStats = () => ({ tenants: channels.size, connections: total });

export const openSyncEvents = (req, res, tenantHash, deviceId) => {
  const channel = channels.get(tenantHash) || new Set();
  if (channel.size >= MAX_PER_TENANT || total >= MAX_TOTAL) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Retry-After', '60');
    return res.end(JSON.stringify({ success: false, message: 'Canal de avisos cheio; a sincronização periódica continua.' }));
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // O nginx entrega cada aviso logo, sem o guardar em buffer.
    'X-Accel-Buffering': 'no',
  });
  res.write(`retry: 5000\ndata: ${JSON.stringify({ type: 'connected', at: new Date().toISOString() })}\n\n`);
  const client = { res, deviceId: String(deviceId || '') };
  channel.add(client);
  channels.set(tenantHash, channel);
  total += 1;
  const keepAlive = setInterval(() => { if (!res.writableEnded) res.write(': keepalive\n\n'); }, KEEPALIVE_MS);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(keepAlive);
    channel.delete(client);
    total -= 1;
    if (!channel.size) channels.delete(tenantHash);
  };
  req.on('close', close);
  res.on('close', close);
};

/** Avisa os outros dispositivos ligados da empresa de que há alterações novas no servidor. */
export const notifySyncChange = (tenantHash, fromDeviceId) => {
  const channel = channels.get(tenantHash);
  if (!channel) return 0;
  const line = `data: ${JSON.stringify({ type: 'sync.changed', at: new Date().toISOString() })}\n\n`;
  let sent = 0;
  for (const client of channel) {
    if (client.deviceId && client.deviceId === String(fromDeviceId || '')) continue;
    try { client.res.write(line); sent += 1; } catch { channel.delete(client); total -= 1; }
  }
  return sent;
};
