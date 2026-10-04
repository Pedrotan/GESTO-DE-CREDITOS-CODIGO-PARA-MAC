// Empacota o instalador Windows com o electron-builder e repete automaticamente quando o .exe acabado de
// extrair está bloqueado (EBUSY/EPERM). Isto acontece quando o antivírus (Norton, Defender...) analisa o
// executável novo no mesmo instante em que o electron-builder o tenta modificar.
//
// Uso: node scripts/package-win.mjs [argumentos extra do electron-builder]
//      ex.: node scripts/package-win.mjs --config electron-builder-admin.json
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

const MAX_ATTEMPTS = 4;
const extraArgs = process.argv.slice(2);
const isAdmin = extraArgs.some(arg => arg.includes('electron-builder-admin'));
const unpackedDir = path.resolve(isAdmin ? 'release-admin' : 'release', 'win-unpacked');
const LOCK_ERROR = /\b(EBUSY|EPERM)\b|resource busy or locked/i;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const runBuilder = () => new Promise(resolve => {
    let output = '';
    const child = spawn('npx', ['electron-builder', '--win', 'nsis', ...extraArgs], { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
    const tee = (stream, target) => stream.on('data', chunk => { output += chunk; target.write(chunk); });
    tee(child.stdout, process.stdout);
    tee(child.stderr, process.stderr);
    child.on('close', code => resolve({ code: code ?? 1, output }));
});

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { code, output } = await runBuilder();
    if (code === 0) process.exit(0);
    if (!LOCK_ERROR.test(output) || attempt === MAX_ATTEMPTS) {
        if (LOCK_ERROR.test(output)) {
            console.error(`\n[package-win] O executável continua bloqueado após ${MAX_ATTEMPTS} tentativas.`);
            console.error('[package-win] Adicione a pasta do projecto às exclusões do antivírus (Norton/Defender) e volte a correr o build.');
        }
        process.exit(code);
    }
    const waitMs = attempt * 5000;
    console.warn(`\n[package-win] Ficheiro bloqueado (provavelmente pelo antivírus). Nova tentativa ${attempt + 1}/${MAX_ATTEMPTS} dentro de ${waitMs / 1000}s...`);
    await sleep(waitMs);
    // Recomeçar com a pasta limpa evita reaproveitar o .exe que ficou bloqueado.
    try { rmSync(unpackedDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 }); } catch { /* removida na próxima tentativa */ }
}
