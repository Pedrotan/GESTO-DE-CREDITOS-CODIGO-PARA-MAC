import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
    consultarLista, consultarResumo, contar, erroPeriodoPersonalizado, filtrosDaExportacao, formatarTelefone, intervaloPeriodo,
    linhasExportacao, mascararNif, numeroWhatsApp, podeAgenda, recusaExportacao, type ExecutorSql, type PedidoExportacao,
} from '../src/bibliotecas/contactos/agenda-contactos.ts';
import { gerarCsv, gerarVcard, nomeFicheiro } from '../src/bibliotecas/contactos/formatos-contactos.ts';

const AGORA = new Date('2026-11-22T12:00:00Z'); // domingo, 13:00 em Luanda

function base(): ExecutorSql {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT, nif TEXT, phone TEXT, alternativePhone TEXT, email TEXT, address TEXT, province TEXT,
            municipality TEXT, clientCategory TEXT, createdAt TEXT, usuario_id TEXT, notes TEXT, deletedAt TEXT);
        INSERT INTO users VALUES ('u1', 'Paulo');`);
    const ins = db.prepare('INSERT INTO clients (id, name, nif, phone, email, address, province, clientCategory, createdAt, usuario_id, deletedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    ins.run('a', 'Pascoal Sepalanga', '005812345HA043', '923 431 696', 'pascoal@exemplo.ao', 'Luanda - Samba', 'Luanda', 'COMUM', '2026-11-03T09:00:00.000Z', 'u1', null);
    ins.run('b', 'João Makovi', '002312345BA033', '+244 934773129', '', 'Lobito', 'Benguela', 'APOSENTADO', '2026-10-15T10:00:00.000Z', null, null);
    ins.run('c', 'Ângela Kahangala', '004812345BA041', '941864119', '', '', 'Benguela', null, '2026-01-10T10:00:00.000Z', 'u1', null);
    ins.run('d', 'Eliminado', '1', '900000000', '', '', '', 'COMUM', '2026-11-01T10:00:00.000Z', null, '2026-11-02');
    ins.run('e', 'Sem Data', '', '222 000 000', 'x@y.ao', 'Benguela', 'Benguela', 'ESTRANGEIRO', 'lixo', null, null);
    // Cadastrado às 23:30 de 31/10 em UTC = 00:30 de 01/11 em Luanda: conta como Novembro.
    ins.run('f', 'Meia Noite', '', '930000000', '', 'Benguela', 'Benguela', 'COMUM', '2026-10-31T23:30:00.000Z', null, null);
    return {
        all: async (sql, params = []) => db.prepare(sql).all(...(params as any[])) as any[],
        get: async (sql, params = []) => db.prepare(sql).get(...(params as any[])) as any,
    };
}

test('períodos no fuso de Angola, com a semana a começar à segunda-feira', () => {
    assert.deepEqual(intervaloPeriodo('este_mes', undefined, undefined, AGORA), { inicio: '2026-10-31T23:00:00.000Z', fim: '2026-11-30T23:00:00.000Z' });
    assert.equal(intervaloPeriodo('esta_semana', undefined, undefined, AGORA).inicio, '2026-11-15T23:00:00.000Z');
    assert.deepEqual(intervaloPeriodo('personalizado', '2026-01-01', '2026-06-30', AGORA), { inicio: '2025-12-31T23:00:00.000Z', fim: '2026-06-30T23:00:00.000Z' });
    assert.equal(erroPeriodoPersonalizado('2026-06-30', '2026-01-01', AGORA), 'A data «De» tem de ser anterior ou igual a «Até».');
    assert.match(erroPeriodoPersonalizado('', '2026-12-01', AGORA) || '', /futura/u);
});

test('a pesquisa ignora acentos, maiúsculas, espaços e o +244 do telefone', async () => {
    const exec = base();
    assert.deepEqual((await consultarLista(exec, { q: 'angela' }, 1, 25, AGORA)).linhas.map(l => l.id), ['c']);
    assert.deepEqual((await consultarLista(exec, { q: '+244 923431696' }, 1, 25, AGORA)).linhas.map(l => l.id), ['a']);
    assert.deepEqual((await consultarLista(exec, { q: '934 773' }, 1, 25, AGORA)).linhas.map(l => l.id), ['b']);
    assert.deepEqual((await consultarLista(exec, { q: '0058' }, 1, 25, AGORA)).linhas.map(l => l.id), ['a']);
    assert.equal((await consultarLista(exec, { q: 'eliminado' }, 1, 25, AGORA)).total, 0);
});

test('lista, contagem e indicadores batem e o NIF sai mascarado', async () => {
    const exec = base();
    const lista = await consultarLista(exec, { periodo: 'este_mes' }, 1, 25, AGORA);
    assert.deepEqual(lista.linhas.map(l => l.id), ['a', 'f']);
    assert.equal(lista.linhas[0].nifMascarado, '0058•••••HA043');
    assert.equal(lista.linhas[0].cadastradoPor, 'Paulo');
    assert.equal(await contar(exec, { periodo: 'este_mes' }, AGORA), 2);
    const resumo = await consultarResumo(exec, { tipo: 'COMUM', q: 'nada' }, AGORA);
    assert.equal(resumo.total, 3); // comuns (categoria vazia = comum), sem contar a pesquisa
    assert.equal(resumo.novosMes, 2);
    assert.equal(resumo.comEmail, 1);
    assert.deepEqual(resumo.segmentos, { TODOS: 0, COMUM: 0, APOSENTADO: 0, ESTRANGEIRO: 0 });
    assert.deepEqual(resumo.provincias, ['Benguela', 'Luanda']);
    assert.equal((await consultarLista(exec, { dados: 'sem_morada' }, 1, 25, AGORA)).linhas[0].id, 'c');
    assert.equal((await consultarLista(exec, { ordenar: 'cadastro_desc' }, 1, 25, AGORA)).linhas.at(-1)!.id, 'e'); // sem data no fim
});

test('a exportação usa os mesmos filtros da contagem', async () => {
    const exec = base();
    const pedido: PedidoExportacao = { ambito: 'filtro', filtrosPagina: { tipo: 'COMUM' }, periodo: 'mes_passado', campos: ['nome', 'telefone', 'nif'], formato: 'csv' };
    const f = filtrosDaExportacao(pedido);
    const linhas = await linhasExportacao(exec, pedido, false, AGORA);
    assert.equal(linhas.length, await contar(exec, f, AGORA));
    assert.equal(linhas.length, 0);
    const um = await linhasExportacao(exec, { ambito: 'um', clienteId: 'b', campos: ['nome'], formato: 'vcf' }, true, AGORA);
    assert.equal(um[0].nif, '002312345BA033');
    const sel = await linhasExportacao(exec, { ambito: 'seleccionados', ids: ['a', 'c'], campos: ['nome'], formato: 'pdf' }, false, AGORA);
    assert.deepEqual(sel.map(l => l.nome), ['Ângela Kahangala', 'Pascoal Sepalanga']);
    assert.equal(sel[0].nif, null);
});

test('permissões: operador exporta um cliente, gestor listas, só o administrador inclui o NIF', () => {
    const operador = { role: 'cashier', permissions: ['manage_clients'] };
    const gestor = { role: 'manager', permissions: '["manage_clients"]' };
    const admin = { role: 'admin', permissions: [] };
    const lista: PedidoExportacao = { ambito: 'todos', campos: ['nome'], formato: 'pdf' };
    assert.equal(recusaExportacao(operador, { ...lista, ambito: 'um', clienteId: 'a' }), null);
    assert.match(recusaExportacao(operador, lista) || '', /listas/u);
    assert.equal(podeAgenda(operador, 'revelar_nif'), false);
    assert.equal(recusaExportacao(gestor, lista), null);
    assert.equal(podeAgenda(gestor, 'revelar_nif'), true);
    assert.match(recusaExportacao(gestor, { ...lista, campos: ['nif'] }) || '', /NIF/u);
    assert.equal(recusaExportacao(admin, { ...lista, campos: ['nif'] }), null);
    assert.equal(podeAgenda({ role: 'cashier', permissions: ['manage_clients', 'clients_reveal_id'] }, 'revelar_nif'), true);
    assert.equal(podeAgenda(null, 'ver'), false);
});

test('formatos: telefone, WhatsApp, máscara, CSV com BOM e vCard 3.0', () => {
    assert.equal(formatarTelefone('923431696'), '+244 923 431 696');
    assert.equal(numeroWhatsApp('+244 923 431 696'), '244923431696');
    assert.equal(numeroWhatsApp('222 000 000'), null);
    assert.equal(numeroWhatsApp('92343'), null);
    assert.equal(mascararNif('5001032771'), '50•••••71');
    const linha = { id: 'a', nome: 'Pascoal Sepalanga Chimbiabiulo', tipo: 'COMUM' as const, telefone: '923431696', email: 'p@x.ao', morada: 'Rua 31 de Janeiro; Samba',
        provincia: 'Luanda', municipio: 'Samba', nif: '0012', cadastradoEm: '2026-11-03T09:00:00.000Z', observacoes: null };
    const csv = gerarCsv([linha], ['nome', 'telefone', 'nif', 'data_cadastro']);
    assert.ok(csv.startsWith('﻿"Nome";"NIF / BI";"Telefone";"Data de cadastro"'));
    assert.ok(csv.includes('"0012"') && csv.includes('"03/11/2026"'));
    const vcf = gerarVcard([linha], 'EMPRESA');
    assert.ok(vcf.includes('N:Chimbiabiulo;Pascoal Sepalanga;;;'));
    assert.ok(vcf.includes('TEL;TYPE=CELL:+244923431696'));
    assert.ok(vcf.includes('ADR;TYPE=HOME:;;Rua 31 de Janeiro\\; Samba;Samba;Luanda;;Angola'));
    assert.ok(vcf.includes('NOTE:Cliente comum'));
    assert.equal(nomeFicheiro('filtro', { periodo: 'este_mes' }, 'pdf', '2026-11-22'), 'contactos-clientes_este-mes_2026-11-22.pdf');
    assert.equal(nomeFicheiro('um', {}, 'vcf', '2026-11-22', 'Ângela K.'), 'contacto_angela-k.vcf');
});
