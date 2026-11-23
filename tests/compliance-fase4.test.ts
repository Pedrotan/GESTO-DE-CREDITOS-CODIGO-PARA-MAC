import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularIndicadores, faltaParaEncerrar, numeroCaso, prazoCaso, prioridadeSugerida, transicaoCasoPermitida } from '../src/bibliotecas/compliance/casos.ts';
import { gerarRelatorio, tabelaParaCsv, type ClienteRel, type DadosRelatorio } from '../src/bibliotecas/compliance/relatorios.ts';
import { calcularRisco, CONFIGURACAO_RISCO_INICIAL, type EntradaRisco } from '../src/bibliotecas/compliance/motor-risco.ts';

test('casos: transições, número, prazo e prioridade sugerida', () => {
    assert.ok(transicaoCasoPermitida('aberto', 'em_investigacao'));
    assert.ok(!transicaoCasoPermitida('aberto', 'encerrado'), 'não se encerra sem investigar e decidir');
    assert.ok(transicaoCasoPermitida('aguarda_decisao', 'em_investigacao'), 'volta à investigação se faltar informação');
    assert.ok(!transicaoCasoPermitida('encerrado', 'em_investigacao'));
    assert.equal(numeroCaso('2026-11-24T10:00:00Z', 'a1b2c3d4-0000'), 'CS-20261124-A1B2');
    assert.equal(prazoCaso('2026-11-24T10:00:00Z', 'alta'), '2026-11-29');
    assert.equal(prazoCaso('2026-11-24', 'baixa'), '2026-12-24');
    assert.equal(prioridadeSugerida(['baixa', 'alta']), 'alta');
    assert.equal(prioridadeSugerida([]), 'baixa');
});

test('encerrar: conclusão sempre; suspeita fundamentada exige decisão sobre a UIF e uma medida', () => {
    assert.deepEqual(faltaParaEncerrar('em_investigacao', [{ tipo: 'conclusao', decisao: 'sem_fundamento' }]), ['O caso tem de estar em «Aguarda decisão».']);
    assert.equal(faltaParaEncerrar('aguarda_decisao', []).length, 1);
    assert.deepEqual(faltaParaEncerrar('aguarda_decisao', [{ tipo: 'conclusao', decisao: 'sem_fundamento' }]), []);
    const fundamentada = [{ tipo: 'conclusao' as const, decisao: 'suspeita_fundamentada' }];
    assert.equal(faltaParaEncerrar('aguarda_decisao', fundamentada).length, 2);
    assert.deepEqual(faltaParaEncerrar('aguarda_decisao', [...fundamentada, { tipo: 'uif', decisao: 'nao_comunicar' }, { tipo: 'medida', decisao: 'diligencia_reforcada' }]), []);
});

test('indicadores da secção 10', () => {
    const i = calcularIndicadores({
        hoje: '2026-11-24',
        clientes: [{ kycCompleto: true, nivel: 'baixo' }, { kycCompleto: false, nivel: 'elevado' }, { kycCompleto: false, nivel: null }, { kycCompleto: true, nivel: 'baixo' }],
        alertas: [
            { estado: 'NEW', resultado: null, detectado_em: '2026-11-01T00:00:00Z', concluido_em: null },
            { estado: 'CLOSED', resultado: 'NOT_SUBSTANTIATED', detectado_em: '2026-11-01T00:00:00Z', concluido_em: '2026-11-03T00:00:00Z' },
            { estado: 'SUBSTANTIATED', resultado: 'SUBSTANTIATED', detectado_em: '2026-11-10T00:00:00Z', concluido_em: '2026-11-14T00:00:00Z' },
        ],
        casos: [
            { estado: 'em_investigacao', aberto_em: '2026-11-01T00:00:00Z', prazo: '2026-11-06', encerrado_em: null },
            { estado: 'encerrado', aberto_em: '2026-11-01T00:00:00Z', prazo: '2026-11-16', encerrado_em: '2026-11-11T00:00:00Z' },
        ],
        decisoesScreening: [{ decisao: 'falso_positivo' }, { decisao: 'falso_positivo' }, { decisao: 'confirmada' }, { decisao: 'falso_positivo' }],
        decisoesCasos: [{ tipo: 'conclusao', decisao: 'suspeita_fundamentada' }, { tipo: 'uif', decisao: 'comunicar' }],
    });
    assert.equal(i.kycCompletoPct, 50);
    assert.deepEqual(i.clientesPorNivel, { baixo: 2, medio: 0, elevado: 1, sem: 1 });
    assert.deepEqual([i.alertasPendentes, i.alertasPendentesMais7Dias, i.tempoMedioAlertaDias, i.alertasFalsosPositivosPct], [1, 1, 3, 50]);
    assert.equal(i.screeningFalsosPositivosPct, 75);
    assert.deepEqual([i.casosAbertos, i.casosForaDoPrazo, i.tempoMedioCasoDias, i.comunicacoesUif, i.suspeitasFundamentadas], [1, 1, 10, 1, 1]);
});

const cliente = (extra: Partial<ClienteRel> = {}): ClienteRel => ({
    nome: 'Cliente Teste', numero: '00261101', documento: '000000001LA001', estadoKyc: 'Verificado', completude: 100, documentoEstado: 'Válido', documentoValidade: '2030-01-01',
    diligencia: 'Normal', verificadoPor: 'Bruno', verificadoEm: '2026-11-20', nivel: 'Baixo', pontuacao: 10, proximaRevisao: '2028-11-20', pepDeclarado: false, pepFuncao: null,
    pepConfirmado: false, screeningEstado: 'Sem correspondências', screeningEm: '2026-11-20', screeningPendentes: 0, documentoCodigo: 'valido', ...extra,
});
const dados: DadosRelatorio = {
    clientes: [cliente(), cliente({ nome: 'PEP Teste', pepDeclarado: true, pepFuncao: 'Administrador', documentoCodigo: 'expirado', documentoEstado: 'Expirado', documentoValidade: '2026-01-01' })],
    avaliacoes: [{ cliente: 'Cliente Teste', data: '2026-11-20T10:00:00Z', versao: 1, pontuacao: 10, nivel: 'Baixo', decisao: 'Diligência normal', por: 'Ana', revistoPor: null, nivelFinal: null },
        { cliente: 'Cliente Teste', data: '2026-09-01T10:00:00Z', versao: 1, pontuacao: 40, nivel: 'Médio', decisao: 'Verificação complementar', por: 'Ana', revistoPor: 'Bruno', nivelFinal: 'Médio' }],
    alertas: [], casos: [{ numero: 'CS-1', cliente: 'PEP Teste', tipo: 'Fraude', prioridade: 'Alta', estado: 'Encerrado', abertoEm: '2026-11-02T00:00:00Z', prazo: '2026-11-07', conclusao: 'Sem fundamento', uif: null, encerradoEm: '2026-11-05T00:00:00Z' }],
    auditoria: [{ data: '2026-11-20T10:30:00Z', utilizador: 'Ana', accao: 'create', detalhes: 'Abriu o caso "CS-1"; ok' }],
};
const o = { de: '2026-11-01', ate: '2026-11-30', mostrarDocumento: false };

test('relatórios: período, filtros próprios e documento mascarado', () => {
    const kyc = gerarRelatorio('kyc', dados, o);
    assert.equal(kyc.linhas.length, 2);
    assert.equal(kyc.linhas[0][2], '0000•••••001', 'BI mascarado por omissão');
    assert.equal(gerarRelatorio('kyc', dados, { ...o, mostrarDocumento: true }).linhas[0][2], '000000001LA001');
    assert.equal(gerarRelatorio('risco', dados, o).linhas.length, 1, 'só as avaliações do período');
    assert.equal(gerarRelatorio('pep', dados, o).linhas.length, 1);
    assert.equal(gerarRelatorio('documentos', dados, o).linhas.length, 1);
    const casos = gerarRelatorio('casos', dados, o);
    assert.ok(casos.nota?.includes('CONFIDENCIAL'));
    assert.equal(casos.subtitulo, 'Período de 01/11/2026 a 30/11/2026');
    assert.equal(gerarRelatorio('kyc', dados, o).subtitulo, 'Situação em 30/11/2026');
});

test('CSV: BOM, separador «;» e aspas escapadas', () => {
    const csv = tabelaParaCsv(gerarRelatorio('auditoria', dados, o));
    assert.ok(csv.startsWith('﻿"Data";"Utilizador"'));
    assert.ok(csv.includes('"Abriu o caso ""CS-1""; ok"'));
});

test('risco: suspeita fundamentada numa investigação impõe nível elevado', () => {
    const e: EntradaRisco = {
        particular: true, documento: 'valido', kycEmFalta: [], kycEstado: 'verificado', duplicadosPorRever: [], estrangeiro: false, pais: 'AO',
        rendimentoMensal: 300_000, origemFundos: 'Salário', profissao: 'Professora', sector: null, pep: false, exposicao: 0, creditosActivos: 0,
        maiorCredito: 0, maiorAtrasoDias: 0, creditoIncumprido: false, clienteBloqueado: false, antiguidadeMeses: 34, screening: 'sem_correspondencia', pepLista: false,
        suspeitaFundamentada: true,
    };
    const r = calcularRisco(e, CONFIGURACAO_RISCO_INICIAL);
    assert.deepEqual([r.nivel, r.requerRevisao, r.regras.some(x => x.id === 'suspeita_fundamentada')], ['elevado', true, true]);
});

test('processo principal: permissão e autor dos comandos das investigações', async () => {
    const P = await import('../src/bibliotecas/compliance/permissoes-compliance.ts');
    const colunaDoAutor = (sql: string, autor: number) => {
        const insert = sql.match(/\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/u);
        const colunas = insert
            ? insert[1].split(',').map(c => c.trim()).filter((_, i) => insert[2].split(',')[i].trim() === '?')
            : sql.match(/SET (.*) WHERE/u)![1].split(',').filter(c => c.includes('?')).map(c => c.split('=')[0].trim());
        return colunas[autor];
    };
    const casos: Array<[string, string, string | null]> = [
        [P.SQL_CASO_ABRIR, 'compliance_manage', 'aberto_por'],
        [P.SQL_CASO_INVESTIGAR, 'compliance_manage', 'actualizado_por'],
        [P.SQL_CASO_PARA_DECISAO, 'compliance_manage', 'actualizado_por'],
        [P.SQL_CASO_ATRIBUIR, 'compliance_manage', 'actualizado_por'],
        [P.SQL_CASO_ENCERRAR, 'compliance_approve', 'encerrado_por'],
        [P.SQL_CASO_LIGAR, 'compliance_manage', 'criado_por'],
        [P.SQL_CASO_NOTA, 'compliance_manage', 'por'],
        [P.SQL_EVIDENCIA_REGISTAR, 'compliance_manage', 'criado_por'],
        [P.SQL_EVIDENCIA_FICHEIRO, 'compliance_manage', null],
        [P.SQL_DECISAO_REGISTAR, 'compliance_approve', 'decidido_por'],
    ];
    for (const [sql, permissao, coluna] of casos) {
        const regra = P.regraEscritaCompliance(sql)!;
        assert.equal(regra.permissao, permissao, sql.slice(0, 50));
        assert.equal(regra.autor === null ? null : colunaDoAutor(sql, regra.autor), coluna, sql.slice(0, 50));
    }
    assert.ok(P.PERMISSOES_COMPLIANCE.includes('compliance_reports'));
});
