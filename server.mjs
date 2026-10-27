import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { toNeonResult } from './vercel-api/_ponte-pg.js';
import { applyCors } from './vercel-api/_security.js';
import { startCollectionWorker } from './vercel-api/_cobranca-cloud.js';

// Tango Gestão e Créditos ERP - Servidor de Produção VPS (Hostinger / Linux)
// Suporta execução contínua com Node.js nativo, Docker e PM2.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_URL = String(process.env.TANGO_PUBLIC_URL || 'https://tangogestaoecreditos.tech').replace(/\/+$/, '');

// Carregar variáveis de ambiente do ficheiro .env se existir
const envFiles = [path.join(__dirname, '.env'), path.join(__dirname, '.env.production')];
for (const envPath of envFiles) {
  if (fs.existsSync(envPath)) {
    try {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(envPath);
      } else {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq > 0) {
            const key = trimmed.slice(0, eq).trim();
            const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) process.env[key] = val;
          }
        }
      }
      console.log(`[VPS Config] Variáveis carregadas de: ${path.basename(envPath)}`);
      break;
    } catch (err) {
      console.warn(`[VPS Config] Aviso ao ler ${envPath}:`, err.message);
    }
  }
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Detectar pasta de build estático do frontend
const staticCandidates = [
  path.join(__dirname, 'vercel-web'),
  path.join(__dirname, 'dist')
];
let STATIC_DIR = staticCandidates.find(dir => fs.existsSync(path.join(dir, 'index.html')));

if (!STATIC_DIR) {
  STATIC_DIR = path.join(__dirname, 'vercel-web');
  console.warn(`[VPS Servidor] Pasta de build não encontrada. Execute 'npm run build:vps' para gerar o frontend.`);
} else {
  console.log(`[VPS Servidor] A servir ficheiros estáticos de: ${STATIC_DIR}`);
}

// Configuração da base de dados (Ponte Universal para PostgreSQL Local / Docker / Neon)
let pgPool = null;
const initDatabaseBridge = async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn('[VPS Database] AVISO: DATABASE_URL não definida. Endpoints da API que requerem base de dados responderão com 503.');
    return;
  }

  const isNeonCloud = /\.neon\.tech/i.test(dbUrl);
  if (isNeonCloud) {
    console.log('[VPS Database] Ligação direta a Neon Cloud configurada.');
    return;
  }

  try {
    const { neonConfig } = await import('@neondatabase/serverless');
    const { default: pg } = await import('pg');

    pgPool = new pg.Pool({
      connectionString: dbUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false
    });

    // Intercetar pedidos do driver neon() e encaminhar para pg.Pool no formato esperado
    neonConfig.fetchFunction = async (fetchUrl, options) => {
      try {
        const body = JSON.parse(options.body || '{}');
        const queryText = body.query || '';
        const params = body.params || [];

        const result = await pgPool.query({
          text: queryText,
          values: params,
          rowMode: 'array'
        });

        // Tipos convertidos para o formato que o driver neon espera (datas como texto, JSON como texto JSON).
        return new Response(JSON.stringify(toNeonResult(result)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        console.error('[VPS Database][Query Error]', err.message);
        return new Response(JSON.stringify({
          message: err.message,
          code: err.code || 'XX000'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    };

    console.log('[VPS Database] Ponte PostgreSQL ativa (pg.Pool -> Suporta PostgreSQL local e Docker no VPS).');

    // Inicializar tabelas e semear empresas do Tango Master na base de dados
    try {
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS tango_tenants (
          tenant_id TEXT PRIMARY KEY,
          tenant_hash TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          key_hash TEXT NOT NULL,
          access_code TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          expires_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_sync_at TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS tango_registration_requests (
          id TEXT PRIMARY KEY,
          nif TEXT NOT NULL,
          company_name TEXT NOT NULL,
          contact_name TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT,
          message TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          handled_at TIMESTAMPTZ
        );

        ALTER TABLE tango_registration_requests ADD COLUMN IF NOT EXISTS contact_name TEXT;
        ALTER TABLE tango_registration_requests ADD COLUMN IF NOT EXISTS message TEXT;
        ALTER TABLE tango_registration_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE tango_registration_requests ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ;
        ALTER TABLE tango_registration_requests ALTER COLUMN email DROP NOT NULL;
        ALTER TABLE tango_registration_requests ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE tango_registration_requests ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
      `);

      // As empresas só existem quando cadastradas no Tango Master (sem empresas nem códigos fixos no código).
      console.log('[VPS Database] Tabelas do Tango Master verificadas.');

      // Licenças (uma por empresa): tabelas e migração das empresas já registadas.
      try {
        const { prepareLicenses } = await import(pathToFileURL(path.join(__dirname, 'vercel-api', '_licencas.js')).href);
        const created = await prepareLicenses(async (text, params) => (await pgPool.query(text, params)).rows, process.env.DATABASE_URL);
        console.log(`[VPS Database] Licenças verificadas (${created} criada(s) por migração).`);
      } catch (licenseErr) {
        console.warn('[VPS Database] Aviso ao preparar as licenças:', licenseErr.message);
      }
    } catch (seedErr) {
      console.warn('[VPS Database] Aviso ao preparar as tabelas do Tango Master:', seedErr.message);
    }
  } catch (err) {
    console.warn('[VPS Database] Aviso ao configurar ponte PostgreSQL local:', err.message);
  }
};

await initDatabaseBridge();
if (process.env.DATABASE_URL) {
  const { neon } = await import('@neondatabase/serverless');
  const hubClient = neon(process.env.DATABASE_URL);
  startCollectionWorker((q, p = []) => hubClient.query(q, p));
}

// Importar os handlers de API
const handlers = {};
const loadHandler = async (route, filePath) => {
  try {
    const fileUrl = pathToFileURL(filePath).href;
    const mod = await import(fileUrl);
    handlers[route] = mod.default;
  } catch (err) {
    console.error(`[VPS API] Falha ao carregar handler ${route} (${filePath}):`, err.message);
  }
};

const apiBaseDir = path.join(__dirname, 'vercel-api');
await loadHandler('company-status', path.join(apiBaseDir, 'company-status.js'));
await loadHandler('onboarding', path.join(apiBaseDir, 'onboarding.js'));
await loadHandler('auth-forgot-password', path.join(apiBaseDir, 'auth-forgot-password.js'));
await loadHandler('auth-reset-password', path.join(apiBaseDir, 'auth-reset-password.js'));
await loadHandler('auth-login', path.join(apiBaseDir, 'auth-login.js'));
await loadHandler('verify-company', path.join(apiBaseDir, 'verify-company.js'));
await loadHandler('registration-request', path.join(apiBaseDir, 'registration-request.js'));
await loadHandler('company-email-verification', path.join(apiBaseDir, 'company-email-verification.js'));
await loadHandler('sync', path.join(apiBaseDir, 'sync.js'));
await loadHandler('presence', path.join(apiBaseDir, 'presence.js'));
await loadHandler('tenants', path.join(apiBaseDir, 'tenants.js'));
await loadHandler('usage-report', path.join(apiBaseDir, 'usage-report.js'));
await loadHandler('lookup-document', path.join(apiBaseDir, 'lookup-document.js'));
await loadHandler('licencas', path.join(apiBaseDir, 'licencas.js'));
await loadHandler('agt', path.join(apiBaseDir, 'agt.js'));
await loadHandler('cobranca', path.join(apiBaseDir, 'cobranca.js'));
await loadHandler('whatsapp-webhook', path.join(apiBaseDir, 'whatsapp-webhook.js'));
// Centro de actualizações (desktop e web): separado da sincronização de dados.
await loadHandler('updates', path.join(apiBaseDir, 'updates.js'));

console.log(`[VPS API] ${Object.keys(handlers).length} rotas centrais carregadas com sucesso.`);

// Tipos MIME para ficheiros estáticos
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
};

const applySecurityHeaders = (res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss: blob: data:; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
};

// Servidor HTTP
const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);

  // Auxiliares do objeto de resposta
  res.status = function (code) {
    this.statusCode = code;
    return this;
  };

  res.json = function (data) {
    if (!this.headersSent) {
      this.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    this.end(JSON.stringify(data));
  };

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // HTTPS obrigatório fora da própria máquina: o nginx termina o TLS e indica o protocolo original. Páginas em
  // HTTP são redireccionadas; pedidos à API em HTTP são recusados (códigos e chaves não viajam sem cifra).
  const requestHost = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  const isLocalRequest = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(requestHost) || process.env.TANGO_ALLOW_HTTP === 'true';
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (!isLocalRequest && forwardedProto !== 'https') {
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.writeHead(308, { Location: `${PUBLIC_URL}${req.url}` });
      return res.end();
    }
    return res.status(426).json({ success: false, message: `Ligação sem cifra recusada. Use ${PUBLIC_URL}.` });
  }

  // 1. Healthcheck do Servidor
  if (pathname === '/api/health') {
    let dbStatus = 'unconfigured';
    if (process.env.DATABASE_URL) {
      dbStatus = pgPool ? 'connected_local_pg' : 'connected_neon';
    }
    return res.status(200).json({
      status: 'healthy',
      app: 'Tango Gestão e Créditos ERP',
      environment: process.env.NODE_ENV || 'production',
      database: dbStatus,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  }

  // 1.1 Endpoint SSE para eventos e notificações em tempo real (/events)
  if (pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      // Só as origens autorizadas (as mesmas da API) recebem cabeçalhos CORS.
      ...(req.headers.origin && applyCors(req, { setHeader() {} }) ? { 'Access-Control-Allow-Origin': req.headers.origin, Vary: 'Origin' } : {})
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', time: new Date().toISOString() })}\n\n`);
    const sseKeepAlive = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keepalive\n\n');
      }
    }, 20000);
    req.on('close', () => {
      clearInterval(sseKeepAlive);
    });
    return;
  }

  // 2. Encaminhamento de Rotas da API: CORS só para as origens autorizadas (lista única em _security.js).
  // Antes refletia qualquer origem, o que deixava qualquer site passar o preflight.
  if (pathname.startsWith('/api/')) {
    const originAllowed = applyCors(req, res);
    if (req.method === 'OPTIONS') {
      return res.status(originAllowed ? 200 : 403).end();
    }
  }

  let apiMatch = null;
  const queryParams = Object.fromEntries(parsedUrl.searchParams.entries());

  if (pathname.startsWith('/api/v1/companies/status/')) {
    const id = decodeURIComponent(pathname.replace('/api/v1/companies/status/', ''));
    queryParams.id = id;
    apiMatch = handlers['company-status'];
  } else if (pathname === '/api/v1/companies/onboarding') {
    apiMatch = handlers['onboarding'];
  } else if (pathname === '/api/v1/auth/forgot-password') {
    apiMatch = handlers['auth-forgot-password'];
  } else if (pathname === '/api/v1/auth/reset-password') {
    apiMatch = handlers['auth-reset-password'];
  } else if (pathname === '/api/v1/auth/login') {
    apiMatch = handlers['auth-login'];
  } else if (pathname.startsWith('/api/')) {
    const endpointName = pathname.replace('/api/', '').split('/')[0];
    apiMatch = handlers[endpointName];
  }

  if (apiMatch) {
    // Ler corpo do pedido (JSON)
    let body = {};
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      try {
        const chunks = [];
        let bodySize = 0;
        // A sincronização leva lotes cifrados (com documentos anexados); o PC envia até ~4 MB por pedido e uma só
        // transacção grande pode passar disso. O nginx aceita até 50 MB.
        const maxBody = (req.url || '').startsWith('/api/sync') ? 32 * 1024 * 1024 : 8 * 1024 * 1024;
        for await (const chunk of req) {
          bodySize += chunk.length;
          if (bodySize > maxBody) {
            console.warn(`[VPS Servidor] Pedido recusado por tamanho (${bodySize}+ bytes) em ${req.url}.`);
            return res.status(413).json({ success: false, code: 'BODY_TOO_LARGE', message: 'Pedido demasiado grande.' });
          }
          chunks.push(chunk);
        }
        req.rawBody = Buffer.concat(chunks);
        const raw = req.rawBody.toString('utf8');
        if (raw) body = JSON.parse(raw);
      } catch (err) {
        return res.status(400).json({ success: false, message: 'Corpo da requisição JSON inválido.' });
      }
    }

    req.query = queryParams;
    req.body = body;

    try {
      await apiMatch(req, res);
    } catch (err) {
      console.error(`[VPS API Error] [${req.method}] ${pathname}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Erro interno do servidor central.' });
      }
    }
    return;
  }

  // 3. Ficheiros Estáticos e Fallback SPA
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  let filePath = path.join(STATIC_DIR, safePath);

  // Verificar se o ficheiro existe
  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);

      // Regras de cache
      if (ext === '.wasm') {
        res.setHeader('Content-Type', 'application/wasm');
      }
      if (safePath.startsWith('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (safePath === '/index.html' || safePath === '/') {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      } else if (safePath === '/version.json') {
        // Versão da build web: lida pelos separadores abertos para avisar que há versão nova.
        res.setHeader('Cache-Control', 'no-store, max-age=0');
      }

      // Tamanho conhecido (o navegador sabe quando o ficheiro chegou completo) e erros de leitura tratados.
      res.setHeader('Content-Length', stats.size);
      const stream = fs.createReadStream(filePath);
      stream.on('error', error => {
        console.error(`[VPS Servidor] Falha ao enviar ${safePath}:`, error.message);
        res.destroy(error);
      });
      res.on('close', () => stream.destroy());
      stream.pipe(res);
      return;
    }

    // Se não for um ficheiro existente e não for /api, fallback SPA para index.html
    const indexPath = path.join(STATIC_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      fs.createReadStream(indexPath).pipe(res);
      return;
    }

    res.status(404).setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('404 Não Encontrado - A aplicação web ainda não foi compilada. Execute: npm run build:vps');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(`  TANGO GESTÃO E CRÉDITOS ERP - SERVIDOR VPS ATIVO  `);
  console.log(`====================================================`);
  console.log(`  Endereço: http://${HOST}:${PORT}`);
  console.log(`  Healthcheck: http://${HOST}:${PORT}/api/health`);
  console.log(`  Ambiente: ${process.env.NODE_ENV || 'production'}`);
  console.log(`====================================================`);
});

// Encerramento Gracioso
const gracefulShutdown = async (signal) => {
  console.log(`\n[VPS Servidor] Sinal ${signal} recebido. A encerrar graciosamente...`);
  server.close(async () => {
    if (pgPool) {
      await pgPool.end();
      console.log('[VPS Database] Pool de ligações PostgreSQL fechada.');
    }
    console.log('[VPS Servidor] Servidor encerrado.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
