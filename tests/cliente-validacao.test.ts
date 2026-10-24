import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateClients, missingClientFields } from '../src/bibliotecas/cliente-validacao.ts';

const clients = [
    { id: 'a', name: 'Isaac Daniel António', nif: '001412796BA039' },
    { id: 'b', name: 'JOANA SEGUNDA DA COSTA PAULINO', nif: 'SEM-AB12CD' },
];

test('bilhete já registado: encontra mesmo com espaços e minúsculas; não conta o próprio cliente nem «SEM-…»', () => {
    assert.equal(findDuplicateClients({ nif: '001412796 ba039', clients }).byDocument.length, 1);
    assert.equal(findDuplicateClients({ nif: '001412796BA039', currentId: 'a', clients }).byDocument.length, 0);
    assert.equal(findDuplicateClients({ nif: 'SEM-AB12CD', clients }).byDocument.length, 0);
    const lixeira = findDuplicateClients({ nif: '009999999LA011', clients, deletedClients: [{ id: 'z', name: 'Stanislau', nif: '009999999LA011' }] });
    assert.equal(lixeira.byDocument[0].deleted, true, 'avisa também quando o cliente está na lixeira');
});

test('nome igual: sem acentos nem maiúsculas', () => {
    assert.equal(findDuplicateClients({ name: 'isaac daniel antonio', clients }).byName.length, 1);
    assert.equal(findDuplicateClients({ name: 'Joana Segunda da Costa Paulino ', clients }).byName.length, 1);
    assert.equal(findDuplicateClients({ name: 'Maria', clients }).byName.length, 0);
});

test('campos obrigatórios: particular com BI exige todos; empresa não pede idade nem datas do bilhete', () => {
    const vazio = missingClientFields({}, { particular: true, passport: false, bankCoordinates: 0 }).map(item => item.field);
    assert.deepEqual(vazio, ['name', 'nif', 'phone', 'age', 'maritalStatus', 'issueDate', 'expiryDate', 'bankCoordinates', 'monthlyIncome']);
    const completo = { name: 'Isaac Daniel', nif: '001412796BA039', phone: '923000000', age: 30, maritalStatus: 'Solteiro', issueDate: '2020-01-01', expiryDate: '2030-01-01', monthlyIncome: 150000 };
    assert.deepEqual(missingClientFields(completo, { particular: true, passport: false, bankCoordinates: 1 }), []);
    assert.deepEqual(missingClientFields({ ...completo, nif: 'SEM-AB12' }, { particular: true, passport: false, bankCoordinates: 1 }).map(item => item.field), ['nif'], '«Sem BI» já não é aceite');
    assert.deepEqual(missingClientFields({ name: 'Empresa Lda', nif: '5001032771', phone: '923000000', monthlyIncome: 1 }, { particular: false, passport: false, bankCoordinates: 1 }), []);
});
