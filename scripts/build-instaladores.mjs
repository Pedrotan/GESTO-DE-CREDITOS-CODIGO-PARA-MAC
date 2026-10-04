// Gera os dois instaladores Windows de uma só vez: Tango ERP (release/) e Tango Master (release-admin/).
// Uso: npm run instaladores
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const started = Date.now();

// Apaga os instaladores antigos para que no fim só se listem os acabados de gerar.
for (const dir of ['release', 'release-admin']) {
    const full = path.join(root, dir);
    if (!existsSync(full)) continue;
    for (const name of readdirSync(full).filter((entry) => entry.toLowerCase().endsWith('.exe'))) {
        rmSync(path.join(full, name), { force: true });
    }
}

const steps = [
    ['Fechar aplicações abertas', 'npm run stop-apps'],
    ['Limpar builds anteriores', 'npm run clean:win'],
    ['Instalador Tango ERP', 'npm run build:erp'],
    ['Instalador Tango Master', 'npm run build:master'],
];

const minutes = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`; };

for (const [index, [label, command]] of steps.entries()) {
    const stepStart = Date.now();
    console.log(`\n=== [${index + 1}/${steps.length}] ${label} ===\n`);
    const result = spawnSync(command, { stdio: 'inherit', shell: true, cwd: root });
    if (result.status !== 0) {
        console.error(`\n✖ Falhou em "${label}" (código ${result.status ?? result.signal}). Os passos seguintes não foram executados.`);
        process.exit(result.status || 1);
    }
    console.log(`\n✔ ${label} concluído em ${minutes(Date.now() - stepStart)}`);
}

const installers = ['release', 'release-admin'].flatMap((dir) => {
    const full = path.join(root, dir);
    if (!existsSync(full)) return [];
    return readdirSync(full)
        .filter((name) => name.toLowerCase().endsWith('.exe'))
        .map((name) => path.join(full, name));
});

console.log(`\n=== Instaladores gerados em ${minutes(Date.now() - started)} ===`);
if (!installers.length) {
    console.error('✖ Nenhum instalador .exe encontrado em release/ ou release-admin/.');
    process.exit(1);
}
for (const file of installers) {
    console.log(`  ${path.relative(root, file)}  (${(statSync(file).size / 1024 / 1024).toFixed(0)} MB)`);
}
