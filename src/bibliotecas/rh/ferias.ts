// Regras do plano de férias: estados pelas datas, saldo de dias úteis, regresso e conflitos por departamento.
import { diasUteis, ehDiaUtil, somarDias, type Feriado, type Horario } from './ponto.ts';

export type EstadoFerias = 'planeado' | 'aprovado' | 'em_gozo' | 'gozado' | 'anulado';
export type PlanoFerias = {
    id: string; funcionario_id: string; ano: number; mes_previsto: number | null; data_inicio: string | null; data_fim: string | null; dias: number;
    estado: EstadoFerias; subsidio_processado: number; processamento_id: string | null; ausencia_id: string | null; guia_id: string | null;
};

/** Estado efectivo: um plano aprovado passa a «em gozo» no início e a «gozado» depois do fim (automático pelas datas). */
export function estadoEfectivo(p: Pick<PlanoFerias, 'estado' | 'data_inicio' | 'data_fim'>, hoje: string): EstadoFerias {
    if (!['aprovado', 'em_gozo', 'gozado'].includes(p.estado) || !p.data_inicio || !p.data_fim) return p.estado;
    if (p.data_fim < hoje) return 'gozado';
    if (p.data_inicio <= hoje) return 'em_gozo';
    return 'aprovado';
}

/** Primeiro dia útil depois do fim das férias. */
export function dataRegresso(fim: string, horario: Horario, feriados: Feriado[]) {
    let d = somarDias(fim, 1);
    for (let i = 0; i < 31 && !ehDiaUtil(d, horario, feriados); i++) d = somarDias(d, 1);
    return d;
}

export type SaldoFerias = { direito: number; transitados: number; marcados: number; gozados: number; saldo: number };

/**
 * Saldo do ano: direito (dias úteis do contrato) + dias transitados do ano anterior (o que ficou por gozar)
 * − dias aprovados/em gozo/gozados. Os planos só previstos («planeado») não descontam.
 */
export function saldoFerias(planos: PlanoFerias[], funcionarioId: string, ano: number, direito: number, hoje: string, direitoAnterior = direito, admissao?: string): SaldoFerias {
    const conta = (a: number, estados: EstadoFerias[]) => planos
        .filter(p => p.funcionario_id === funcionarioId && p.ano === a && estados.includes(estadoEfectivo(p, hoje)))
        .reduce((s, p) => s + (Number(p.dias) || 0), 0);
    const usadosAnterior = conta(ano - 1, ['aprovado', 'em_gozo', 'gozado']);
    // Só transita quem já estava na empresa no ano anterior.
    const transitados = !admissao || admissao <= `${ano - 1}-12-31` ? Math.max(0, direitoAnterior - usadosAnterior) : 0;
    const marcados = conta(ano, ['aprovado', 'em_gozo']);
    const gozados = conta(ano, ['gozado']);
    return { direito, transitados, marcados, gozados, saldo: direito + transitados - marcados - gozados };
}

export function diasDoPlano(inicio: string, fim: string, horario: Horario, feriados: Feriado[]) {
    return inicio && fim && fim >= inicio ? diasUteis(inicio, fim, horario, feriados) : 0;
}

/**
 * Conflitos: dias em que mais de `limitePct`% de um departamento estaria de férias ao mesmo tempo, contando
 * o plano novo com os aprovados/em gozo dos colegas. Devolve a pior percentagem e o primeiro dia em que acontece.
 */
export function conflitoDepartamento(p: { inicio: string; fim: string; funcionarioId: string; departamentoId: string | null; planos: PlanoFerias[];
    funcionarios: Array<{ id: string; departamento_id: string | null; estado: string }>; limitePct: number; hoje: string }) {
    if (!p.departamentoId) return null;
    const equipa = p.funcionarios.filter(f => f.departamento_id === p.departamentoId && f.estado === 'activo').map(f => f.id);
    if (equipa.length < 2) return null;
    let pior = { pct: 0, dia: '' };
    for (let d = p.inicio; d <= p.fim; d = somarDias(d, 1)) {
        const fora = new Set([p.funcionarioId]);
        for (const pl of p.planos) {
            if (pl.funcionario_id === p.funcionarioId || !equipa.includes(pl.funcionario_id) || !pl.data_inicio || !pl.data_fim) continue;
            if (['aprovado', 'em_gozo'].includes(estadoEfectivo(pl, p.hoje)) && pl.data_inicio <= d && pl.data_fim >= d) fora.add(pl.funcionario_id);
        }
        const pct = Math.round((fora.size / equipa.length) * 100);
        if (pct > pior.pct) pior = { pct, dia: d };
    }
    return pior.pct > p.limitePct ? pior : null;
}
