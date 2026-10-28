import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(scriptsDir);
const outputDir = join(rootDir, 'vercel-web');
const viteCli = join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
const apiSourceDir = join(rootDir, 'vercel-api');
const vercelLinkPath = join(outputDir, '.vercel', 'project.json');
const savedVercelLink = existsSync(vercelLinkPath) ? readFileSync(vercelLinkPath, 'utf8') : null;

const build = spawnSync(
  process.execPath,
  [viteCli, 'build', '--outDir', outputDir, '--emptyOutDir'],
  {
    cwd: rootDir,
    stdio: 'inherit',
    // Build web pública: nenhuma chave é embutida no bundle, que qualquer visitante pode ler.
    env: {
      ...process.env,
      VITE_PUBLIC_WEB: 'true'
    }
  }
);

if (build.status !== 0) process.exit(build.status || 1);

mkdirSync(outputDir, { recursive: true });
if (savedVercelLink) {
  mkdirSync(join(outputDir, '.vercel'), { recursive: true });
  writeFileSync(vercelLinkPath, savedVercelLink, 'utf8');
}
// O plano Hobby da Vercel aceita no máximo 12 funções por publicação. Todas as rotas vão para api/_rotas/
// (pasta privada: a Vercel não a transforma em funções) e uma única função, api/encaminhar.js, chama a rota
// pedida. A VPS (server.mjs) continua a usar vercel-api/ directamente, rota a rota.
const routesDir = join(outputDir, 'api', '_rotas');
cpSync(apiSourceDir, routesDir, { recursive: true });
const routeNames = readdirSync(apiSourceDir).filter(file => file.endsWith('.js') && !file.startsWith('_') && file !== 'whatsapp-webhook.js').map(file => file.slice(0, -3)).sort();
// Webhooks exigem os bytes originais: não passam pelo encaminhador que recebe JSON já analisado.
writeFileSync(join(outputDir, 'api', 'whatsapp-webhook.js'), "import handler from './_rotas/whatsapp-webhook.js';\nexport const config = { api: { bodyParser: false } };\nexport default handler;\n", 'utf8');
if (!routeNames.length) throw new Error('vercel-api sem rotas: a publicação foi interrompida.');
writeFileSync(join(outputDir, 'api', 'encaminhar.js'), [
  '// Gerado por scripts/build-vercel.mjs: uma só função para todas as rotas da API (limite do plano Hobby).',
  ...routeNames.map((name, index) => `import rota${index} from './_rotas/${name}.js';`),
  '',
  `const ROTAS = new Map([${routeNames.map((name, index) => `['${name}', rota${index}]`).join(', ')}]);`,
  '',
  'export default async function handler(req, res) {',
  "  const nome = String(req.query?.rota || '').trim();",
  '  const rota = ROTAS.get(nome);',
  "  if (!rota) return res.status(404).json({ success: false, message: 'Rota da API não encontrada.' });",
  '  return rota(req, res);',
  '}',
  '',
].join('\n'), 'utf8');

// A mesma política de conteúdo do index.html, enviada também como cabeçalho HTTP, com a protecção que uma
// meta tag não consegue dar: a aplicação nunca pode ser incorporada noutro site (clickjacking).
const indexHtml = readFileSync(join(outputDir, 'index.html'), 'utf8');
const metaCsp = indexHtml.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
if (!metaCsp) throw new Error('index.html sem Content-Security-Policy: a publicação foi interrompida por segurança.');
const contentSecurityPolicy = `${metaCsp.replace(/;\s*$/, '')}; frame-ancestors 'none'`;

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
];

// Pentest A-03: a Vercel serve os ficheiros estáticos com "Access-Control-Allow-Origin: *". Só o domínio da
// própria aplicação os pode ler por CORS (a própria página carrega-os na mesma origem, sem precisar de CORS).
// As rotas /api/* ficam de fora: definem a origem permitida pedido a pedido (_security.js).
const webOrigin = String(process.env.TANGO_WEB_ORIGIN || 'https://tango-gestao-creditos.vercel.app').trim().replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9.-]+$/i.test(webOrigin)) throw new Error(`TANGO_WEB_ORIGIN inválida: ${webOrigin}`);

const vercelConfig = {
  version: 2,
  cleanUrls: true,
  functions: {
    'api/encaminhar.js': { maxDuration: 30 }
  },
  // Todos os caminhos da API vão para a função única; os mais específicos primeiro.
  rewrites: [
    { source: '/api/v1/companies/status/:id', destination: '/api/encaminhar?rota=company-status&id=:id' },
    { source: '/api/v1/companies/onboarding', destination: '/api/encaminhar?rota=onboarding' },
    { source: '/api/v1/auth/forgot-password', destination: '/api/encaminhar?rota=auth-forgot-password' },
    { source: '/api/v1/auth/reset-password', destination: '/api/encaminhar?rota=auth-reset-password' },
    { source: '/api/v1/auth/login', destination: '/api/encaminhar?rota=auth-login' },
    { source: '/api/licencas/:acao', destination: '/api/encaminhar?rota=licencas&acao=:acao' },
    ...routeNames.map(name => ({ source: `/api/${name}`, destination: `/api/encaminhar?rota=${name}` }))
  ],
  headers: [
    {
      // Cabeçalhos de segurança em todas as páginas e ficheiros servidos.
      source: '/(.*)',
      headers: securityHeaders
    },
    {
      source: '/((?!api/).*)',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: webOrigin },
        { key: 'Vary', value: 'Origin' }
      ]
    },
    {
      // A página inicial nunca fica em cache: depois de um deploy aponta sempre para os ficheiros novos.
      source: '/',
      headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }]
    },
    {
      source: '/index.html',
      headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }]
    },
    {
      // Versão da build: os separadores abertos lêem-na para avisar que há versão nova.
      source: '/version.json',
      headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }]
    },
    {
      source: '/sql-wasm.wasm',
      headers: [{ key: 'Content-Type', value: 'application/wasm' }]
    },
    {
      source: '/assets/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
    }
  ]
};

writeFileSync(
  join(outputDir, 'package.json'),
  `${JSON.stringify({
    name: 'tango-gestao-creditos-web',
    private: true,
    type: 'module',
    dependencies: { '@neondatabase/serverless': '^1.0.0' }
  }, null, 2)}\n`,
  'utf8'
);

writeFileSync(
  join(outputDir, 'vercel.json'),
  `${JSON.stringify(vercelConfig, null, 2)}\n`,
  'utf8'
);

writeFileSync(
  join(outputDir, 'LEIA-ME-VERCEL.txt'),
  [
    'TANGO GESTAO DE CREDITOS - VERSAO WEB',
    '',
    'Esta pasta ja contem apenas os ficheiros web compilados.',
    'Nao envie node_modules, electron, release, chaves privadas ou bases SQLite.',
    '',
    'Publicacao:',
    '1. Instale a CLI da Vercel, se necessario: npm install -g vercel',
    '2. Na pasta principal execute: vercel vercel-web --prod',
    '',
    'A aplicação continua a guardar os dados localmente (IndexedDB) e funciona offline.',
    'Para sincronizar, ligue uma base Neon ao projeto e configure TANGO_SYNC_SECRET na Vercel.',
    ''
  ].join('\n'),
  'utf8'
);

console.log(`Pacote web para Vercel criado em: ${outputDir}`);
