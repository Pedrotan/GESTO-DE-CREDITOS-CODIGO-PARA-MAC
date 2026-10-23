import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularIRT, calcularRecibo, diasForaDoContrato, irtMinor, mesesServicoNoAno, type EntradaRecibo, type RubricaMotor } from '../src/bibliotecas/rh/motor-salarial.ts';
import { RH_IRT_2026, RH_RUBRICAS_INICIAIS } from '../src/bibliotecas/rh/esquema-rh.ts';

// Tabela e rubricas iniciais exactamente como são semeadas na base de dados.
const escaloesMinor = RH_IRT_2026.escaloes.map(([inf, sup, parcela, taxa], i) => ({ ordem: i + 1, limite_inferior_minor: inf, limite_superior_minor: sup, parcela_fixa_minor: parcela, taxa }));
const escaloes2026 = RH_IRT_2026.escaloes.map(([inf, sup, parcela, taxa]) => ({ limiteInferior: inf / 100, limiteSuperior: sup === null ? null : sup / 100, parcelaFixa: parcela / 100, taxa }));
const rub = Object.fromEntries(RH_RUBRICAS_INICIAIS.map(r => [r.codigo, {
    id: `rubrica-${r.codigo}`, codigo: r.codigo, nome: r.nome, tipo: r.tipo, forma: r.forma, percentagem: 0, incide_inss: r.inss, incide_irt: r.irt,
    limite_isento_irt_minor: r.isentoMinor || 0, limite_isento_irt_pct: r.isentoPct || 0, ordem_no_recibo: r.ordem,
} satisfies RubricaMotor])) as Record<string, RubricaMotor>;

const entrada = (extra: Partial<EntradaRecibo> = {}): EntradaRecibo => ({
    tipo: 'normal', salarioBaseMinor: 35_000_000, horasSemanais: 40, divisorDia: 30, faltasDescontaveis: 0, minutosAtraso: 0, horasExtra: 0, horasExtraFeriado: 0,
    acrescimoHorasExtra: 0.5, acrescimoHorasExtraFeriado: 1, rubricas: [], taxaInssTrabalhador: 0.03, taxaInssEmpresa: 0.08, escaloes: escaloesMinor,
    sistema: { SAL_BASE: rub.SAL_BASE, FALTAS: rub.FALTAS, ATRASOS: rub.ATRASOS, HORAS_EXTRA: rub.HORAS_EXTRA, SUB_FERIAS: rub.SUB_FERIAS, SUB_NATAL: rub.SUB_NATAL },
    ...extra,
});

test('exemplo do documento (Outubro de 2026): 350 000 Kz com 2 faltas dá líquido de 309 397,00 Kz', () => {
    const r = calcularRecibo(entrada({
        faltasDescontaveis: 2,
        rubricas: [{ rubrica: rub.SUB_TRANSP, valorMinor: 3_000_000 }, { rubrica: rub.SUB_ALIM, valorMinor: 2_000_000 }],
    }));
    const faltas = r.linhas.find(l => l.codigo === 'FALTAS');
    assert.equal(faltas?.valor_minor, 2_333_333, 'faltas: 350 000 ÷ 30 × 2 = 23 333,33');
    assert.equal(r.brutoMinor, 37_666_667, 'remuneração bruta 376 666,67');
    assert.equal(r.inssTrabalhadorMinor, 1_130_000, 'INSS do trabalhador 11 300,00');
    assert.equal(r.materiaColectavelMinor, 33_536_667, 'matéria colectável 335 366,67');
    assert.equal(r.escalaoIrt, 4);
    assert.equal(r.irtMinor, 5_596_967, 'IRT 55 969,67');
    assert.equal(r.liquidoMinor, 30_939_700, 'líquido 309 397,00');
    assert.equal(r.inssEmpresaMinor, 3_013_333, 'INSS da empresa 30 133,33');
    assert.equal(r.custoEmpresaMinor, 40_680_000, 'custo total 406 800,00');
});

test('calcularIRT da especificação e limites de cada escalão da tabela 2026', () => {
    assert.equal(calcularIRT(335366.67, escaloes2026), 55969.67);
    assert.equal(calcularIRT(150000, escaloes2026), 0, 'até 150 000 isento');
    assert.equal(calcularIRT(150000.01, escaloes2026), 12500);
    assert.equal(calcularIRT(200000, escaloes2026), 20500);
    assert.equal(calcularIRT(200000.01, escaloes2026), 31250);
    assert.equal(calcularIRT(300000, escaloes2026), 49250);
    assert.equal(calcularIRT(500000, escaloes2026), 87250);
    assert.equal(calcularIRT(1000000, escaloes2026), 187250);
    assert.equal(calcularIRT(1500000, escaloes2026), 292250);
    assert.equal(calcularIRT(2000000, escaloes2026), 402250);
    assert.equal(calcularIRT(2500000, escaloes2026), 517250);
    assert.equal(calcularIRT(5000000, escaloes2026), 1117250);
    assert.equal(calcularIRT(10000000, escaloes2026), 2342250);
    assert.equal(calcularIRT(10000100, escaloes2026), 2342275, '11.º escalão: 25% sobre o excesso');
    // A versão em cêntimos usada pelo motor dá o mesmo resultado.
    for (const kz of [150000.01, 200000, 335366.67, 2499999.99, 12345678.9]) {
        assert.equal(irtMinor(Math.round(kz * 100), escaloesMinor).irt / 100, calcularIRT(kz, escaloes2026), String(kz));
    }
});

test('isenções: transporte até 30 000 e abono de família até 5% do salário base', () => {
    const r = calcularRecibo(entrada({ salarioBaseMinor: 20_000_000, rubricas: [
        { rubrica: rub.SUB_TRANSP, valorMinor: 4_000_000 },
        { rubrica: rub.ABONO_FAM, valorMinor: 1_500_000 },
    ] }));
    assert.equal(r.isentoIrtMinor, 3_000_000 + 1_000_000);
    assert.equal(r.baseInssMinor, 24_000_000, 'o abono de família não incide INSS');
    assert.equal(r.materiaColectavelMinor, 25_500_000 - 4_000_000 - 720_000);
});

test('horas extra, atrasos e outros descontos depois dos impostos', () => {
    const r = calcularRecibo(entrada({ minutosAtraso: 90, horasExtra: 4, horasExtraFeriado: 2,
        rubricas: [{ rubrica: rub.ADIANTAMENTO, valorMinor: 5_000_000 }, { rubrica: rub.PREMIO, valorMinor: 1_000_000 }] }));
    const valorHora = 35_000_000 * 12 / (52 * 40);
    assert.equal(r.valorHoraMinor, Math.round(valorHora));
    assert.equal(r.linhas.find(l => l.codigo === 'ATRASOS')?.valor_minor, Math.round(valorHora * 1.5));
    const extras = r.linhas.filter(l => l.codigo === 'HORAS_EXTRA').map(l => l.valor_minor);
    assert.deepEqual(extras, [Math.round(valorHora * 4 * 1.5), Math.round(valorHora * 2 * 2)]);
    assert.equal(r.outrosDescontosMinor, 5_000_000);
    assert.equal(r.liquidoMinor, r.brutoMinor - r.inssTrabalhadorMinor - r.irtMinor - 5_000_000);
});

test('subsídios de férias e de Natal: 50% do salário base, proporcional no ano de admissão', () => {
    const ferias = calcularRecibo(entrada({ tipo: 'ferias', subsidioPct: 0.5, mesesServico: 12 }));
    assert.equal(ferias.brutoMinor, 17_500_000);
    assert.equal(ferias.linhas.length, 1);
    const natal = calcularRecibo(entrada({ tipo: 'natal', subsidioPct: 0.5, mesesServico: mesesServicoNoAno(2026, '2026-04-10') }));
    assert.equal(mesesServicoNoAno(2026, '2026-04-10'), 9);
    assert.equal(natal.brutoMinor, Math.round(35_000_000 * 0.5 * 9 / 12));
    assert.equal(mesesServicoNoAno(2026, '2020-01-01'), 12);
    assert.equal(mesesServicoNoAno(2026, '2026-04-20'), 8, 'admitido depois do dia 15: o mês não conta');
});

test('admissão a meio do mês: desconta os dias fora do contrato', () => {
    assert.equal(diasForaDoContrato(2026, 10, '2026-10-16', null, 30), Math.round(15 / 31 * 30 * 100) / 100);
    assert.equal(diasForaDoContrato(2026, 10, '2026-01-01', '2026-10-31', 30), 0);
    const r = calcularRecibo(entrada({ diasForaContrato: 15 }));
    assert.equal(r.brutoMinor, 17_500_000);
    assert.equal(r.diasTrabalhados, 15);
});

test('reformado: taxas especiais passam pelos parâmetros, não pelo código', () => {
    const r = calcularRecibo(entrada({ taxaInssTrabalhador: 0, taxaInssEmpresa: 0.08 }));
    assert.equal(r.inssTrabalhadorMinor, 0);
    assert.equal(r.inssEmpresaMinor, 2_800_000);
});
