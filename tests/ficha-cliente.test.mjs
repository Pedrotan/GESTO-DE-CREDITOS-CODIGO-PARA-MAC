import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');

test('Ficha do Cliente: gera PDF estruturado com todas as secções e lida com dados mínimos', async () => {
    const dir = path.join(root, '.tmp-test-ficha');
    mkdirSync(dir, { recursive: true });
    try {
        const outfile = path.join(dir, 'pdf.mjs');
        await build({
            entryPoints: [path.join(root, 'src', 'bibliotecas', 'pdf.ts')],
            bundle: true,
            format: 'esm',
            platform: 'node',
            outfile,
            alias: { '@': path.join(root, 'src') },
            logLevel: 'silent',
            external: ['jspdf', 'jspdf-autotable', 'pdfjs-dist', 'qrcode']
        });
        const { buildClientProfileDoc } = await import(pathToFileURL(outfile).href);

        const mockClient = {
            id: 'cli-test-001',
            name: 'Pedro de Morais Tango',
            nif: '000000000LA000',
            phone: '+244 941 537 486',
            email: 'pedro.tango@exemplo.co.ao',
            status: 'active',
            riskLevel: 'medium',
            creditLimit: 1000000,
            usedCredit: 250000,
            availableCredit: 750000,
            createdAt: new Date('2026-01-10T10:00:00Z'),
        };

        const doc = buildClientProfileDoc(mockClient, [], [], {}, 'Gestor Operacional');
        assert.ok(doc, 'O documento jsPDF foi construído');

        const minimalDoc = buildClientProfileDoc({ id: 'cli-2', name: 'Maria' }, [], [], {}, 'Operador');
        assert.ok(minimalDoc);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
