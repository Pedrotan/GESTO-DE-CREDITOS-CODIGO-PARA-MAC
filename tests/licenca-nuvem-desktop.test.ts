import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    CLOCK_TOLERANCE_MS, evaluateCloudLicense, heartbeatDue, isCloudLicenseKey, legacyMachineHash, machineFingerprint,
    recordFromToken, verifyCloudToken, type CloudLicenseRecord,
} from '../electron/licenca-nuvem.ts';
import { cloudStatusToLicenseInfo, webLicenseToStatus } from '../src/bibliotecas/licenca-nuvem-cliente.ts';

// Etapa 4: o Desktop verifica o token do servidor offline, entra em só leitura sem token válido e detecta o
// relógio a andar para trás. O token é assinado pelo mesmo código do servidor (vercel-api/_token-licenca.js).

const ROOT = path.join(import.meta.dirname, '..');
const T = await import(pathToFileURL(path.join(ROOT, 'vercel-api/_token-licenca.js')).href);
const S = await import(pathToFileURL(path.join(ROOT, 'vercel-api/_licencas.js')).href);
const { privateKey } = crypto.generateKeyPairSync('ed25519');
const KEYS = [T.publicKeyInfo(privateKey)];
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-12T12:00:00.000Z');
const MACHINE = machineFingerprint('3f2504e0-4f89-11d3-9a0c-0305e82c3301');

const token = (overrides: Record<string, unknown> = {}, now = NOW) => T.signLicenseToken(privateKey, {
    empresa_id: '5003207439', licenca_id: 'lic-1', plano: 'annual', plano_nome: 'Anual', escalao: 'empresarial', max_maquinas: 2,
    machine_hash: MACHINE, data_fim: new Date(now + 300 * DAY).toISOString(), valido_ate: new Date(now + 7 * DAY).toISOString(),
    hora_servidor: new Date(now).toISOString(), iat: Math.floor(now / 1000), exp: Math.floor((now + 7 * DAY) / 1000), ...overrides,
});
const record = (tokenValue: string, extra: Partial<CloudLicenseRecord> = {}): CloudLicenseRecord => ({
    token: tokenValue, serverUrl: 'https://tangogestaoecreditos.tech', lastServerTime: new Date(NOW).toISOString(),
    lastLocalTime: new Date(NOW).toISOString(), lastCheckAt: new Date(NOW).toISOString(), refusal: null, ...extra,
});

test('o token assinado pelo servidor é verificado no Desktop com a chave pública', () => {
    const claims = verifyCloudToken(token(), KEYS);
    assert.equal(claims?.empresa_id, '5003207439');
    const [header, , signature] = token().split('.');
    const forged = Buffer.from(JSON.stringify({ machine_hash: MACHINE, exp: 9_999_999_999 })).toString('base64url');
    assert.equal(verifyCloudToken(`${header}.${forged}.${signature}`, KEYS), null, 'alterar a data de fim invalida a assinatura');
    assert.equal(verifyCloudToken(T.signLicenseToken(crypto.generateKeyPairSync('ed25519').privateKey, {}), KEYS), null);
});

test('estados: activo, offline mais de 7 dias, licença terminada, outra máquina e sem activação', () => {
    assert.equal(evaluateCloudLicense(null, MACHINE, KEYS, NOW).state, 'none');
    const active = evaluateCloudLicense(record(token()), MACHINE, KEYS, NOW + 6 * DAY);
    assert.equal(active.state, 'active');
    assert.equal(active.licenca?.planoNome, 'Anual');

    const offline = evaluateCloudLicense(record(token()), MACHINE, KEYS, NOW + 8 * DAY);
    assert.equal(offline.state, 'readonly');
    assert.match(offline.message!, /7 dias/);

    const ended = token({ data_fim: new Date(NOW + 2 * DAY).toISOString(), exp: Math.floor((NOW + 2 * DAY) / 1000) });
    const endedStatus = evaluateCloudLicense(record(ended), MACHINE, KEYS, NOW + 3 * DAY);
    assert.equal(endedStatus.state, 'readonly');
    assert.match(endedStatus.message!, /terminou/);

    assert.equal(evaluateCloudLicense(record(token()), machineFingerprint('outra-maquina'), KEYS, NOW).state, 'none', 'token copiado de outro PC');
    assert.equal(evaluateCloudLicense(record(`${token()}x`), MACHINE, KEYS, NOW).state, 'none');
});

test('relógio atrasado (para prolongar a licença) exige validação online', () => {
    const later = record(token(), { lastServerTime: new Date(NOW + 3 * DAY).toISOString() });
    const status = evaluateCloudLicense(later, MACHINE, KEYS, NOW + DAY);
    assert.equal(status.state, 'clock');
    assert.equal(evaluateCloudLicense(later, MACHINE, KEYS, NOW + 3 * DAY - CLOCK_TOLERANCE_MS / 2).state, 'active', 'pequenos acertos são tolerados');
    const localSeen = record(token(), { lastLocalTime: new Date(NOW + 2 * DAY).toISOString() });
    assert.equal(evaluateCloudLicense(localSeen, MACHINE, KEYS, NOW).state, 'clock');
});

test('recusa do servidor dentro dos 7 dias: continua activo mas explica; depois fica só leitura com o motivo', () => {
    const refusal = { code: 'LICENCA_SUSPENSA', message: 'A licença desta empresa está suspensa.', at: new Date(NOW).toISOString() };
    assert.deepEqual(evaluateCloudLicense(record(token(), { refusal }), MACHINE, KEYS, NOW + DAY).refusal, refusal);
    const later = evaluateCloudLicense(record(token(), { refusal }), MACHINE, KEYS, NOW + 8 * DAY);
    assert.equal(later.state, 'readonly');
    assert.match(later.message!, /suspensa/);
});

test('renovação: ao abrir depois de 24 h ou a 2 dias de expirar; o registo guarda a hora mais recente', () => {
    const claims = verifyCloudToken(token(), KEYS)!;
    assert.equal(heartbeatDue(record(token()), claims, NOW + 3_600_000), false);
    assert.equal(heartbeatDue(record(token()), claims, NOW + DAY + 1), true);
    assert.equal(heartbeatDue(record(token(), { lastCheckAt: new Date(NOW + 5.5 * DAY).toISOString() }), claims, NOW + 5.5 * DAY), true);
    const previous = record(token(), { lastServerTime: new Date(NOW + 10 * DAY).toISOString() });
    const next = recordFromToken(token(), 'https://x', claims, previous, NOW);
    assert.equal(next.lastServerTime, new Date(NOW + 10 * DAY).toISOString(), 'a hora do servidor nunca anda para trás');
    assert.equal(next.refusal, null);
});

test('formato da chave e identificador antigo iguais aos do servidor', () => {
    assert.equal(isCloudLicenseKey('TANGO-7KQ2-ABCD-EFGH-JK23'), true);
    assert.equal(isCloudLicenseKey('tango 7kq2 abcd efgh jk23'), true);
    assert.equal(isCloudLicenseKey('eyJwYXlsb2FkIjoi'), false);
    assert.equal(legacyMachineHash('TANGO-16EDE273'), S.machineHash('tango-16ede273'));
    assert.match(MACHINE, /^[0-9a-f]{64}$/);
});

test('o resto da aplicação vê a licença da nuvem como válida (ou só leitura)', () => {
    const now = new Date(NOW);
    const active = cloudStatusToLicenseInfo(evaluateCloudLicense(record(token()), MACHINE, KEYS, NOW) as any, now)!;
    assert.equal(active.isValid, true);
    assert.equal(active.type, 'annual');
    assert.equal(active.daysRemaining, 300);
    const readonly = cloudStatusToLicenseInfo(evaluateCloudLicense(record(token()), MACHINE, KEYS, NOW + 8 * DAY) as any, now)!;
    assert.equal(readonly.readOnly, true);
    assert.equal(cloudStatusToLicenseInfo({ state: 'none' }), null);
});

test('versão web: a licença da empresa recebida do servidor conta como licença válida', () => {
    const summary = { plan: 'annual', planName: 'Anual', tier: 'empresarial', status: 'ativa' as const,
        endsAt: new Date(NOW + 90 * DAY).toISOString(), daysRemaining: 90, maxMachines: 2, machines: 1 };
    const info = cloudStatusToLicenseInfo(webLicenseToStatus(summary), new Date(NOW))!;
    assert.equal(info.isValid, true);
    assert.equal(info.readOnly, false);
    assert.equal(info.daysRemaining, 90);
    const expired = cloudStatusToLicenseInfo(webLicenseToStatus({ ...summary, status: 'expirada' }), new Date(NOW))!;
    assert.equal(expired.readOnly, true);
    assert.equal(webLicenseToStatus(null).state, 'none');
});
