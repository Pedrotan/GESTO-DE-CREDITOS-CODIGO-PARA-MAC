// Verificação antes de gerar os executáveis para macOS (npm run check:mac). Não altera nada: só indica o que falta.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failures = 0;
const ok = message => console.log(`  ✓ ${message}`);
const warn = message => console.log(`  ! ${message}`);
const fail = message => { failures += 1; console.log(`  ✗ ${message}`); };
const run = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };

console.log('Verificação do ambiente macOS para o Tango ERP\n');

if (process.platform !== 'darwin') fail(`Este comando corre no Mac (sistema actual: ${process.platform}).`);
else ok(`macOS ${run('sw_vers', ['-productVersion']) || ''} · ${process.arch === 'arm64' ? 'Apple Silicon (arm64)' : `Intel (${process.arch})`}`);

const major = Number(process.versions.node.split('.')[0]);
if (major >= 20) ok(`Node.js ${process.version}`);
else fail(`Node.js ${process.version}: instale a versão 20 LTS ou mais recente (https://nodejs.org).`);

if (process.platform === 'darwin') {
    if (run('xcode-select', ['-p'])) ok('Ferramentas de linha de comandos do Xcode instaladas');
    else fail('Faltam as ferramentas do Xcode (necessárias para compilar o SQLite cifrado): xcode-select --install');
    if (run('git', ['--version'])) ok('git disponível');
    else fail('git em falta (uma dependência vem do GitHub): instale-o com xcode-select --install');
}

const publicKey = path.join(root, 'public_key.json');
try {
    const key = JSON.parse(fs.readFileSync(publicKey, 'utf8')).key;
    if (typeof key === 'string' && key.length > 20) ok('public_key.json presente (chave pública das licenças)');
    else fail('public_key.json não tem a chave "key".');
} catch {
    fail('public_key.json em falta na raiz do projecto: copie-o do pacote do Windows (não gere um par novo).');
}

for (const file of ['build/icon.png', 'build/entitlements.mac.plist', 'electron-builder-admin.json']) {
    if (fs.existsSync(path.join(root, file))) ok(file);
    else fail(`${file} em falta`);
}

if (!fs.existsSync(path.join(root, 'node_modules'))) {
    fail('node_modules em falta: corra npm install (no Mac; não copie a pasta node_modules do Windows).');
} else {
    const nativeDir = path.join(root, 'node_modules', 'better-sqlite3-multiple-ciphers', 'build', 'Release');
    const binary = fs.existsSync(nativeDir) ? fs.readdirSync(nativeDir).find(name => name.endsWith('.node')) : null;
    if (!binary) fail('Módulo nativo do SQLite por compilar: corra npm run rebuild.');
    else {
        const info = process.platform === 'darwin' ? run('file', [path.join(nativeDir, binary)]) || '' : '';
        if (process.platform === 'darwin' && !/Mach-O/.test(info)) fail('O módulo nativo do SQLite não é do macOS (foi copiado do Windows?): apague node_modules e corra npm install.');
        else ok(`Módulo nativo do SQLite compilado (${/arm64/.test(info) ? 'arm64' : /x86_64/.test(info) ? 'x86_64' : 'arquitectura actual'})`);
    }
}

if (process.platform === 'darwin') {
    const identities = run('security', ['find-identity', '-v', '-p', 'codesigning']) || '';
    if (/Developer ID Application/.test(identities)) ok('Certificado "Developer ID Application" encontrado: npm run build:mac assina com ele.');
    else warn('Sem certificado Developer ID: use npm run build:mac:adhoc (assinatura local; no primeiro arranque abrir com botão direito → Abrir).');
}

console.log(failures ? `\n${failures} problema(s) por resolver antes do build.` : '\nTudo pronto. Gere os executáveis com npm run build:mac (ou build:mac:adhoc).');
process.exit(failures ? 1 : 0);
