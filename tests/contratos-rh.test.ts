import test from 'node:test';
import assert from 'node:assert/strict';
import { duracaoTexto, MODELOS_CONTRATO_INICIAIS, prazoContrato, variaveisDesconhecidasContrato } from '../src/bibliotecas/rh/contratos-rh.ts';
import { aplicarModelo } from '../src/bibliotecas/rh/modelos-rh.ts';
import { gerarAlertas } from '../src/bibliotecas/rh/alertas-rh.ts';

const contrato = (extra: Record<string, unknown> = {}) => ({ tipo: 'determinado', inicio: '2026-11-03', fim: '2027-11-02', estado: 'activo', ...extra });

test('duração do contrato em anos, meses e dias', () => {
    assert.equal(duracaoTexto('2026-11-03', '2027-11-02'), '1 ano');
    assert.equal(duracaoTexto('2026-01-01', '2026-06-30'), '6 meses');
    assert.equal(duracaoTexto('2026-01-01', '2027-07-15'), '1 ano, 6 meses e 15 dias');
    assert.equal(duracaoTexto('2026-03-01', '2026-03-01'), '1 dia');
});

test('prazo: indeterminado, em vigor, a terminar, expirado e terminado', () => {
    assert.equal(prazoContrato({ tipo: 'indeterminado', inicio: '2022-09-01', fim: null, estado: 'activo' }, '2026-11-23').duracao, 'Indeterminado');
    assert.equal(prazoContrato({ tipo: 'indeterminado', inicio: '2022-09-01', fim: null, estado: 'activo' }, '2026-11-23').situacao, 'indeterminado');
    const vigor = prazoContrato(contrato(), '2026-11-23');
    assert.deepEqual([vigor.situacao, vigor.totalDias, vigor.decorridos, vigor.restantes], ['em_vigor', 365, 21, 344]);
    assert.equal(vigor.pct, 6);
    const aTerminar = prazoContrato(contrato(), '2027-10-03');
    assert.deepEqual([aTerminar.situacao, aTerminar.rotulo], ['a_terminar', 'Termina em 30 dia(s)']);
    assert.equal(prazoContrato(contrato(), '2027-11-02').rotulo, 'Termina hoje');
    assert.deepEqual([prazoContrato(contrato(), '2027-11-10').situacao, prazoContrato(contrato(), '2027-11-10').rotulo], ['expirado', 'Terminou há 8 dia(s)']);
    assert.equal(prazoContrato(contrato({ estado: 'terminado' }), '2027-11-10').situacao, 'terminado');
    assert.equal(prazoContrato(contrato({ inicio: '2026-12-01' }), '2026-11-23').situacao, 'por_iniciar');
    assert.equal(prazoContrato(contrato(), '2027-08-01', 120).situacao, 'a_terminar', 'o limite do alerta é configurável');
});

test('modelos iniciais só usam variáveis conhecidas e preenchem o contrato', () => {
    for (const m of MODELOS_CONTRATO_INICIAIS) assert.deepEqual(variaveisDesconhecidasContrato(m.conteudo), [], m.nome);
    assert.deepEqual(variaveisDesconhecidasContrato('{{nome}} {{inventada}}'), ['inventada']);
    const texto = aplicarModelo(MODELOS_CONTRATO_INICIAIS[1].conteudo, { nome: 'Maria Neto', duracao: '1 ano', data_inicio: '03/11/2026', data_fim: '02/11/2027', empresa: 'Empresa Exemplo' });
    assert.match(texto, /Maria Neto/u);
    assert.match(texto, /com a duração de 1 ano, com início a 03\/11\/2026 e fim a 02\/11\/2027/u);
    assert.doesNotMatch(texto, /período experimental/u, 'sem período experimental o bloco não aparece');
});

test('alertas de fim de contrato: 60, 30 e 7 dias e prazo ultrapassado, com ligação à página Contratos', () => {
    const base = (hoje: string) => gerarAlertas({
        hoje, funcionarios: [{ id: 'f1', nome: 'Maria Neto', data_nascimento: null, estado: 'activo' }],
        contratos: [{ id: 'c1', funcionario_id: 'f1', tipo: 'determinado', inicio: '2026-11-03', fim: '2027-11-02', estado: 'activo', periodo_experiencia_fim: null }],
        documentos: [], planos: [], processamentos: [], ausenciasPendentes: 0,
        parametros: { alertaFeriasDias: 5, mesNatal: 11, prazoEntregaDia: 10, alertaPrazosDias: 5, biDiasAviso: 90 },
    } as never).filter((a: { tipo: string }) => a.tipo === 'contrato');
    assert.deepEqual(base('2027-09-10').map(a => a.id), ['contrato-60:c1']);
    assert.deepEqual(base('2027-10-10').map(a => a.id), ['contrato-30:c1']);
    assert.deepEqual(base('2027-10-30').map(a => a.id), ['contrato-7:c1']);
    assert.deepEqual(base('2027-11-05').map(a => a.id), ['contrato-expirado:c1']);
    assert.equal(base('2027-10-30')[0].accao, '/rh/contratos?contrato=c1');
    assert.deepEqual(base('2027-06-01'), []);
});
