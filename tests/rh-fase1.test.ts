import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoBI, validadeSugerida, validarDatasBI, diferencaCalendario } from '../src/bibliotecas/rh/bi-validade.ts';
import { parametroEmVigor, tabelaIrtEmVigor, valorNumerico, validarEscaloes, type ParametroRH } from '../src/bibliotecas/rh/parametros-rh.ts';
import { RH_IRT_2026, RH_PARAMETROS_INICIAIS, RH_RUBRICAS_INICIAIS, rhSeedStatements } from '../src/bibliotecas/rh/esquema-rh.ts';

test('BI: expirado no dia seguinte à validade, a expirar dentro do aviso, válido fora dele', () => {
    assert.equal(estadoBI('2026-10-23', '2026-10-23').estado, 'a_expirar');
    assert.equal(estadoBI('2026-10-23', '2026-10-23').texto, 'BI expira hoje');
    assert.equal(estadoBI('2026-10-22', '2026-10-23').estado, 'expirado');
    assert.equal(estadoBI('2026-09-08', '2026-10-23').texto, 'BI expirado há 45 dias');
    assert.equal(estadoBI('2027-01-21', '2026-10-23', 90).estado, 'a_expirar');
    assert.equal(estadoBI('2027-01-22', '2026-10-23', 90).estado, 'valido');
    assert.equal(estadoBI(null, '2026-10-23').estado, 'sem_data');
});

test('BI: tempo em falta contado no calendário', () => {
    assert.equal(estadoBI('2030-01-02', '2026-10-23').texto, 'BI válido — faltam 3 anos, 2 meses e 10 dias');
    assert.deepEqual(diferencaCalendario('2026-01-31', '2026-03-01'), { anos: 0, meses: 1, dias: 1 });
    assert.equal(estadoBI('2026-11-02', '2026-10-23').texto, 'BI a expirar — faltam 10 dias');
});

test('BI: validade sugerida e regras das datas', () => {
    assert.equal(validadeSugerida('2020-05-10', 10), '2030-05-10');
    assert.equal(validadeSugerida('2024-02-29', 1), '2025-02-28');
    assert.equal(validadeSugerida('', 10), null);
    assert.deepEqual(validarDatasBI('2020-01-01', '2030-01-01', '2026-10-23'), []);
    assert.match(validarDatasBI('2027-01-01', '2030-01-01', '2026-10-23').join(' '), /não pode ser futura/);
    assert.match(validarDatasBI('2020-01-01', '2019-12-31', '2026-10-23').join(' '), /posterior à data de emissão/);
});

test('parâmetros: usa o valor em vigor na data do processamento', () => {
    const lista: ParametroRH[] = [
        { id: '1', chave: 'inss_trabalhador', valor: '0.03', vigencia_inicio: '2026-01-01', vigencia_fim: '2026-12-31' },
        { id: '2', chave: 'inss_trabalhador', valor: '0.05', vigencia_inicio: '2027-01-01', vigencia_fim: null },
    ];
    assert.equal(parametroEmVigor(lista, 'inss_trabalhador', '2026-10-31')?.valor, '0.03');
    assert.equal(valorNumerico(lista, 'inss_trabalhador', '2027-03-31', 0), 0.05);
    assert.equal(valorNumerico(lista, 'inexistente', '2027-03-31', 7), 7);
    assert.equal(tabelaIrtEmVigor([{ id: 'a', ano: 2026, lei_referencia: 'x', vigencia_inicio: '2026-01-01' }], '2026-10-01')?.id, 'a');
});

test('valores iniciais: INSS 3% + 8%, IRT 2026 com 11 escalões contínuos e rubricas do motor', () => {
    const p = (chave: string) => RH_PARAMETROS_INICIAIS.find(x => x.chave === chave)?.valor;
    assert.equal(p('inss_trabalhador'), '0.03');
    assert.equal(p('inss_empresa'), '0.08');
    assert.equal(RH_IRT_2026.escaloes.length, 11);
    const escaloes = RH_IRT_2026.escaloes.map(([inferior, superior, parcela, taxa], i) => ({ ordem: i + 1, limite_inferior_minor: inferior, limite_superior_minor: superior, parcela_fixa_minor: parcela, taxa }));
    assert.deepEqual(validarEscaloes(escaloes), []);
    assert.deepEqual(RH_IRT_2026.escaloes[3], [30_000_000, 50_000_000, 4_925_000, 0.19]);
    for (const codigo of ['SAL_BASE', 'SUB_TRANSP', 'SUB_ALIM', 'FALTAS', 'ATRASOS', 'HORAS_EXTRA', 'SUB_FERIAS', 'SUB_NATAL']) {
        assert.ok(RH_RUBRICAS_INICIAIS.some(r => r.codigo === codigo), codigo);
    }
    // Ids fixos: o mesmo valor inicial em dois computadores não duplica na sincronização.
    const a = rhSeedStatements('2026-10-23T00:00:00Z').map(s => s.params[0]);
    const b = rhSeedStatements('2026-10-24T00:00:00Z').map(s => s.params[0]);
    assert.deepEqual(a, b);
    assert.equal(new Set(a).size, a.length);
});

test('escalões: rejeita buracos e limites invertidos', () => {
    const erros = validarEscaloes([
        { ordem: 1, limite_inferior_minor: 0, limite_superior_minor: 100, parcela_fixa_minor: 0, taxa: 0 },
        { ordem: 2, limite_inferior_minor: 150, limite_superior_minor: 120, parcela_fixa_minor: 0, taxa: 0.1 },
    ]);
    assert.ok(erros.some(e => /começar onde acaba/.test(e)));
    assert.ok(erros.some(e => /maior do que o inferior/.test(e)));
});
