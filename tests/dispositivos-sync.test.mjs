import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDiagnostics, recordSyncDevice } from '../vercel-api/_dispositivos-sync.js';

test('diagnóstico do dispositivo: só números e textos curtos, relógio medido contra o servidor', () => {
    const now = 1_800_000_000_000;
    const d = normalizeDiagnostics({ platform: 'desktop', appVersion: '3.0.4', pending: 3.7, conflicts: -2, unreadable: 'x',
        rejected413: 2, lastError: 'Falhou\u0000a meio', clientTime: now + 125_000, extra: { dados: 'da empresa' } }, now);
    assert.deepEqual(d, { platform: 'desktop', appVersion: '3.0.4', pending: 3, oversized: null, waiting: null, unreadable: null, conflicts: null,
        otherVersion: null, rejected413: 2, lastError: 'Falhou a meio', clockSkewMs: 125_000 });
    assert.equal(normalizeDiagnostics({ platform: 'telemovel' }).platform, null, 'só computador ou navegador');
    assert.equal(normalizeDiagnostics(undefined).rejected413, 0);
});

test('registar o dispositivo nunca faz falhar a sincronização', async () => {
    const failing = async () => { throw new Error('base ocupada'); };
    await assert.doesNotReject(() => recordSyncDevice(failing, { tenantHash: 'h', deviceId: 'pc', diagnostics: {}, outcome: { synced: true } }));
});
