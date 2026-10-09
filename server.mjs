import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Tango Gestão e Créditos ERP - Servidor de Produção VPS (Hostinger / Linux)
// Suporta execução contínua com Node.js nativo, Docker e PM2.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

        const fields = (result.fields || []).map(f => ({
          name: f.name,
          dataTypeID: f.dataTypeID
        }));

        return new Response(JSON.stringify({
          fields,
          rows: result.rows || []
        }), {
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
      `);

      const seedCompanies = [
        {
          id: '5417002673',
          tHash: 'fb14d0c3542ee0136f183c1ffd300102eeda2a76e32990bdcc9b63c5d9918de3',
          name: 'DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, (SU), LDA',
          kHash: '99eb32203237b3c361d1caa31cb82630d3a24194387900ae7ba27b3ee3f3840a',
          code: 'TG-AG9E-VTBY'
        },
        {
          id: '5417001439',
          tHash: '511787b16436e18bf21f42ca118854a49d77e3a5b844f58db680460d1bffe06f',
          name: 'Erecabde Comércio e Serviços LDA',
          kHash: 'dddb9f0511251eb895877e8c40a16ac3a56c426a6fee18cd10ac0a827c909b5a',
          code: 'TG-1357-4F6V'
        }
      ];

      for (const sc of seedCompanies) {
        await pgPool.query(`
          INSERT INTO tango_tenants (tenant_id, tenant_hash, name, key_hash, access_code, status)
          VALUES ($1, $2, $3, $4, $5, 'active')
          ON CONFLICT (tenant_id) DO UPDATE SET
            name = EXCLUDED.name,
            key_hash = EXCLUDED.key_hash,
            access_code = EXCLUDED.access_code,
            status = 'active'
        `, [sc.id, sc.tHash, sc.name, sc.kHash, sc.code]);
      }
      console.log('[VPS Database] Empresas autorizadas do Tango Master verificadas e ativas na base de dados.');
    } catch (seedErr) {
      console.warn('[VPS Database] Aviso ao semear empresas iniciais:', seedErr.message);
    }
  } catch (err) {
    console.warn('[VPS Database] Aviso ao configurar ponte PostgreSQL local:', err.message);
  }
};

await initDatabaseBridge();

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
await loadHandler('sync', path.join(apiBaseDir, 'sync.js'));
await loadHandler('tenants', path.join(apiBaseDir, 'tenants.js'));
await loadHandler('usage-report', path.join(apiBaseDir, 'usage-report.js'));
await loadHandler('lookup-document', path.join(apiBaseDir, 'lookup-document.js'));

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
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'X-Accel-Buffering': 'no'
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

  // 2. Encaminhamento de Rotas da API com CORS Universal
  if (pathname.startsWith('/api/')) {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-sync-passkey, x-master-secret, x-tenant-id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
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
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString('utf8');
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
      }

      fs.createReadStream(filePath).pipe(res);
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
