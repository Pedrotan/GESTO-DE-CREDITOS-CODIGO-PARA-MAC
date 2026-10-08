import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
cpSync(apiSourceDir, join(outputDir, 'api'), { recursive: true });

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
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
];

const vercelConfig = {
  version: 2,
  cleanUrls: true,
  functions: {
    'api/*.js': { maxDuration: 30 }
  },
  rewrites: [
    { source: '/api/v1/companies/status/:id', destination: '/api/company-status?id=:id' },
    { source: '/api/v1/companies/onboarding', destination: '/api/onboarding' },
    { source: '/api/v1/auth/forgot-password', destination: '/api/auth-forgot-password' },
    { source: '/api/v1/auth/reset-password', destination: '/api/auth-reset-password' },
    { source: '/api/v1/auth/login', destination: '/api/auth-login' }
  ],
  headers: [
    {
      // Cabeçalhos de segurança em todas as páginas e ficheiros servidos.
      source: '/(.*)',
      headers: securityHeaders
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
