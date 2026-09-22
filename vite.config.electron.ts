import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import obfuscator from 'vite-plugin-javascript-obfuscator';

export default defineConfig(({ mode }) => ({
    plugins: [
        {
            name: 'copy-indexes',
            closeBundle() {
                const src = path.resolve(__dirname, 'electron/database-indexes.sql');
                const dest = path.resolve(__dirname, 'dist-electron/database-indexes.sql');
                fs.copyFileSync(src, dest);
            }
        }
        // mode === 'production' && obfuscator({})
    ].filter(Boolean),
    build: {
        ssr: true,
        outDir: 'dist-electron',
        emptyOutDir: false,
        lib: {
            entry: {
                main: path.resolve(__dirname, 'electron/main.ts'),
                preload: path.resolve(__dirname, 'electron/preload.ts'),
                'db-worker': path.resolve(__dirname, 'electron/db-worker.ts'),
                'ledger-schema': path.resolve(__dirname, 'src/bibliotecas/esquema-ledger.ts'),
            },
            formats: ['cjs'],
        },
        rollupOptions: {
            external: ['electron', 'path', 'fs', 'url', 'events', 'better-sqlite3-multiple-ciphers'],
            output: {
                entryFileNames: '[name].cjs',
                format: 'cjs',
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
}));
