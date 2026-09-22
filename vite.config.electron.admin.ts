import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

export default defineConfig({
    define: {
        'process.env.IS_TANGO_MASTER': '"true"'
    },
    plugins: [
        {
            name: 'copy-indexes',
            closeBundle() {
                const src = path.resolve(__dirname, 'electron/database-indexes.sql');
                const dest = path.resolve(__dirname, 'dist-electron-admin/database-indexes.sql');
                fs.copyFileSync(src, dest);
            }
        }
    ],
    build: {
        ssr: true,
        outDir: 'dist-electron-admin',
        emptyOutDir: true,
        lib: {
            entry: {
                main: path.resolve(__dirname, 'electron/main.ts'),
                preload: path.resolve(__dirname, 'electron/preload.ts'),
                'db-worker': path.resolve(__dirname, 'electron/db-worker.ts'),
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
});
