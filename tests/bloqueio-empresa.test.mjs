import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { tenantLockCte } from '../vercel-api/_bloqueio-empresa.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const files = [
    ...readdirSync(path.join(ROOT, 'vercel-api')).filter(name => /\.(m?js)$/.test(name)).map(name => path.join('vercel-api', name)),
    'server.mjs',
];
const WRITE = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|COPY)\s+"?tango_sync_operations\b/gi;
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;

test('todas as gravações em tango_sync_operations passam pelo bloqueio por empresa', () => {
    const writes = [];
    for (const file of files) {
        const text = readFileSync(path.join(ROOT, file), 'utf8');
        // Cada gravação no código (fora dos comentários) tem de começar pelo bloqueio, no mesmo comando.
        for (const match of text.matchAll(WRITE)) {
            const lineStart = text.lastIndexOf('\n', match.index) + 1;
            const lineEnd = text.indexOf('\n', match.index);
            if (COMMENT_LINE.test(text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd))) continue;
            const before = text.slice(Math.max(0, match.index - 200), match.index);
            writes.push({ where: `${file}:${text.slice(0, match.index).split('\n').length}`, locked: before.includes('${tenantLockCte(') });
        }
    }
    assert.ok(writes.length >= 3, `encontradas ${writes.length} gravações (esperadas pelo menos as 3 conhecidas)`);
    const unlocked = writes.filter(write => !write.locked).map(write => write.where);
    assert.deepEqual(unlocked, [], `gravações sem o bloqueio por empresa: ${unlocked.join(', ')}`);
});

test('o bloqueio é o mesmo em todo o lado (mesma chave, por empresa)', () => {
    assert.equal(tenantLockCte('$1'), 'WITH tenant_lock AS (SELECT pg_advisory_xact_lock(hashtextextended($1, 7041)) AS locked)');
});
