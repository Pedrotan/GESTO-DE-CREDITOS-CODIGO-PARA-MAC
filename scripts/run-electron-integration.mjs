import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const binary = process.platform === 'win32'
    ? path.resolve('node_modules/electron/dist/electron.exe')
    : process.platform === 'darwin'
        ? path.resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
        : path.resolve('node_modules/electron/dist/electron');

if (!fs.existsSync(binary)) throw new Error(`Runtime Electron não encontrado: ${binary}`);
const result = spawnSync(binary, [path.resolve('tests/db-worker.integration.cjs')], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
});
process.exit(result.status ?? 1);
