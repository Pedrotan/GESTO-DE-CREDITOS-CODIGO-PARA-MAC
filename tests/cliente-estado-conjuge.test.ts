import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticStatusChangeText, clientDisplayStatus } from '../src/bibliotecas/estado-cliente.ts';
import { needsSpouse, spouseDataStatus, spouseFieldsToSave } from '../src/bibliotecas/conjuge.ts';

test('estado do cliente: Inactivo ao registar, Activo com crédito, Sem crédito activo depois de liquidar', () => {
    const client = { id: 'c1', status: 'inactive' };
    assert.equal(clientDisplayStatus(client, []), 'inactive');
    assert.equal(clientDisplayStatus(client, [{ clientId: 'c1', status: 'pending_approval' }]), 'inactive', 'pedido pendente ainda não activa');
    assert.equal(clientDisplayStatus({ id: 'c1', status: 'active' }, [{ clientId: 'c1', status: 'active' }]), 'active');
    assert.equal(clientDisplayStatus(client, [{ clientId: 'c1', status: 'paid' }]), 'no_active_credit');
    assert.equal(clientDisplayStatus({ id: 'c1', status: 'blocked' }, [{ clientId: 'c1', status: 'paid' }]), 'blocked');
    assert.match(automaticStatusChangeText('Ana', 'inactive', 'active')!, /Activo: crédito concedido/);
    assert.match(automaticStatusChangeText('Ana', 'active', 'inactive')!, /Sem crédito activo/);
    assert.equal(automaticStatusChangeText('Ana', 'active', 'active'), null);
    assert.equal(automaticStatusChangeText('Ana', 'blocked', 'inactive'), null, 'o bloqueio é manual, não automático');
});

test('cônjuge: só para casados/união de facto; «Ignorar» regista a recusa com data e utilizador', () => {
    assert.equal(needsSpouse('CASADO'), true);
    assert.equal(needsSpouse('UNIAO_DE_FACTO'), true);
    assert.equal(needsSpouse('SOLTEIRO'), false);
    const now = new Date('2026-10-14T09:00:00Z');

    const refused = spouseFieldsToSave({ maritalStatus: 'CASADO', spouseDataRefused: true, spouseName: 'resto' }, null, 'Maria', now);
    assert.equal(refused.spouseDataRefused, true);
    assert.equal(refused.spouseDataRefusedAt, now.toISOString());
    assert.equal(refused.spouseDataRefusedBy, 'Maria');
    assert.equal(refused.spouseName, '', 'na recusa não se guardam dados do cônjuge');
    assert.equal(spouseDataStatus({ maritalStatus: 'CASADO', ...refused }), 'refused');

    // Gravar de novo mantém a primeira recusa.
    const again = spouseFieldsToSave({ maritalStatus: 'CASADO', spouseDataRefused: true }, refused, 'João', new Date('2026-10-20T09:00:00Z'));
    assert.equal(again.spouseDataRefusedAt, now.toISOString());
    assert.equal(again.spouseDataRefusedBy, 'Maria');

    // Preencher mais tarde: anula a recusa e regista o consentimento.
    const filled = spouseFieldsToSave({ maritalStatus: 'CASADO', spouseName: 'Pedro', spouseBi: '000000000LA000', spouseIncome: 150_000 }, refused, 'João', now);
    assert.equal(filled.spouseDataRefused, false);
    assert.equal(filled.spouseName, 'Pedro');
    assert.equal(filled.spouseConsentBy, 'João');
    assert.equal(spouseDataStatus({ maritalStatus: 'CASADO', ...filled }), 'provided');

    // Mudar para solteiro: a secção recolhe e nada do cônjuge fica gravado.
    const single = spouseFieldsToSave({ maritalStatus: 'SOLTEIRO', spouseName: 'Pedro' }, filled, 'João', now);
    assert.equal(single.spouseName, '');
    assert.equal(single.spouseIncome, 0);
    assert.equal(single.spouseConsentAt, '');
    assert.equal(spouseDataStatus({ maritalStatus: 'SOLTEIRO', ...single }), 'not_applicable');
    assert.equal(spouseDataStatus({ maritalStatus: 'CASADO' }), 'missing');
});
