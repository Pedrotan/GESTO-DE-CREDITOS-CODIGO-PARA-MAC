import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertApprovalLimit, parseApprovalLimits } from '../src/bibliotecas/limites-aprovacao.ts';

test('limites respeitam perfil, capital e fronteira exata', () => {
    const config = parseApprovalLimits('{"enabled":true,"adminMinor":10000,"managerMinor":5000,"superAdminMinor":20000}');
    assert.doesNotThrow(() => assertApprovalLimit(config, 'manager', 5000));
    assert.throws(() => assertApprovalLimit(config, 'manager', 5001));
    assert.throws(() => assertApprovalLimit(config, 'operator', 100));
    assert.throws(() => assertApprovalLimit(config, 'admin', 1.5));
    assert.doesNotThrow(() => assertApprovalLimit(parseApprovalLimits(null), 'admin', 500000));
});
test('configuração incorreta falha sem desativar os limites', () => {
    for (const value of ['{}', '{"enabled":false,"adminMinor":-1,"managerMinor":0,"superAdminMinor":0}', 'invalid']) assert.throws(() => parseApprovalLimits(value));
});
