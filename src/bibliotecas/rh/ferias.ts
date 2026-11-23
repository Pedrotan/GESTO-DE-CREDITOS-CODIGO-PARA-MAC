// Regras do plano de férias: estados pelas datas, saldo de dias úteis, regresso e conflitos por departamento.
import { diasUteis, ehDiaUtil, feriadoNaData, somarDias, type Feriado, type Horario } from './ponto.ts';

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

// ── Cálculo das férias por dias úteis (início + N dias → último dia e regresso) ──

export type ResultadoFerias = {
    /** Primeiro dia de férias (o dia útil seguinte, se o escolhido não for útil). */
    inicio: string; ultimoDia: string; regresso: string;
    diasUteis: number; diasCalendario: number;
    /** Feriados, pontes e tolerâncias dentro do período (não contam como férias). */
    feriadosNoPeriodo: Array<{ data: string; nome: string }>;
    /** O dia escolhido não era útil e o início passou para o seguinte. */
    ajustado: boolean;
    saldoDepois: number | null;
    /** Cada dia do período: «u» dia útil de férias, «n» fim-de-semana ou feriado dentro do período. */
    dias: Record<string, 'u' | 'n'>;
};

const LIMITE_DIAS = 800;

/**
 * Férias de N dias úteis a começar num dia (Lei Geral do Trabalho: as férias contam-se em dias úteis; fins-de-semana
 * do horário, feriados, pontes e tolerâncias não contam). Função pura: o serviço passa o horário do funcionário e as
 * folgas do calendário laboral (do ano do início e do seguinte, para períodos que atravessam o ano).
 */
export function simularFerias(p: { inicio: string; dias: number; horario: Horario; feriados: Feriado[]; saldo?: number | null }): ResultadoFerias {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(p.inicio)) throw new Error('Indique o início das férias.');
    const n = Math.floor(Number(p.dias));
    if (!Number.isFinite(n) || n < 1) throw new Error('As férias têm de ter pelo menos 1 dia útil.');
    const util = (d: string) => ehDiaUtil(d, p.horario, p.feriados);
    let inicio = p.inicio;
    let ajustado = false;
    for (let g = 0; !util(inicio); g++) {
        if (g > 60) throw new Error('O horário do funcionário não tem dias de trabalho.');
        inicio = somarDias(inicio, 1);
        ajustado = true;
    }
    const dias: Record<string, 'u' | 'n'> = {};
    const feriadosNoPeriodo: Array<{ data: string; nome: string }> = [];
    let contador = 0;
    let ultimoDia = inicio;
    for (let d = inicio, g = 0; contador < n; d = somarDias(d, 1), g++) {
        if (g > LIMITE_DIAS) throw new Error('Período de férias demasiado longo.');
        if (util(d)) { contador += 1; ultimoDia = d; dias[d] = 'u'; continue; }
        dias[d] = 'n';
        const feriado = feriadoNaData(p.feriados, d);
        if (feriado) feriadosNoPeriodo.push({ data: d, nome: feriado.nome });
    }
    // Os dias não úteis depois do último dia não fazem parte do período.
    for (const d of Object.keys(dias)) if (d > ultimoDia) delete dias[d];
    for (let i = feriadosNoPeriodo.length - 1; i >= 0; i--) if (feriadosNoPeriodo[i].data > ultimoDia) feriadosNoPeriodo.splice(i, 1);
    let regresso = somarDias(ultimoDia, 1);
    for (let g = 0; !util(regresso) && g < 60; g++) regresso = somarDias(regresso, 1);
    const diasCalendario = Math.round((Date.parse(`${ultimoDia}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000) + 1;
    return { inicio, ultimoDia, regresso, diasUteis: n, diasCalendario, feriadosNoPeriodo, ajustado, saldoDepois: p.saldo == null ? null : p.saldo - n, dias };
}

export type AvisoFerias = { nivel: 'erro' | 'aviso' | 'info'; codigo: string; texto: string };

/**
 * Validações do plano (secção 5.3): excede o saldo (bloqueia a aprovação), sobreposição com outras férias do
 * funcionário (bloqueia), com ausências já lançadas (aviso), início no passado (só o RH), colegas do departamento
 * de férias ao mesmo tempo (aviso) e divisão em períodos (um com pelo menos `periodoMinimo` dias úteis).
 */
export function avisosFerias(p: {
    resultado: ResultadoFerias; funcionarioId: string; planoId?: string | null; saldo: number; hoje: string;
    planos: PlanoFerias[]; ausencias?: Array<{ funcionario_id: string; data_inicio: string; data_fim: string; estado: string; tipo_id?: string }>;
    conflito?: { pct: number; dia: string } | null; limitePct?: number; periodoMinimo?: number; direito?: number;
}): AvisoFerias[] {
    const r = p.resultado;
    const avisos: AvisoFerias[] = [];
    if (r.ajustado) avisos.push({ nivel: 'info', codigo: 'ajustado', texto: `O dia escolhido não é dia útil: o início passou para ${r.inicio.split('-').reverse().join('/')}.` });
    if (r.diasUteis > p.saldo) avisos.push({ nivel: 'aviso', codigo: 'excede', texto: `Excede o saldo disponível (${p.saldo} dias). Pode guardar como previsto, mas não aprovar.` });
    if (r.inicio < p.hoje) avisos.push({ nivel: 'aviso', codigo: 'passado', texto: 'O início é no passado: só o RH o pode registar, indicando o motivo nas observações.' });
    const meus = p.planos.filter(x => x.funcionario_id === p.funcionarioId && x.id !== p.planoId && x.estado !== 'anulado' && x.data_inicio && x.data_fim);
    const sobreposto = meus.find(x => x.data_inicio! <= r.ultimoDia && x.data_fim! >= r.inicio);
    if (sobreposto) avisos.push({ nivel: 'erro', codigo: 'sobreposicao', texto: `Sobrepõe-se a outras férias deste funcionário (${sobreposto.data_inicio!.split('-').reverse().join('/')} a ${sobreposto.data_fim!.split('-').reverse().join('/')}).` });
    const ausencia = (p.ausencias || []).find(a => a.funcionario_id === p.funcionarioId && a.estado !== 'anulada' && a.tipo_id !== 'ausencia-FE' && a.data_inicio <= r.ultimoDia && a.data_fim >= r.inicio);
    if (ausencia) avisos.push({ nivel: 'aviso', codigo: 'ausencia', texto: `Já há uma licença, dispensa ou falta lançada no período (${ausencia.data_inicio.split('-').reverse().join('/')}). O RH decide.` });
    if (p.conflito) avisos.push({ nivel: 'aviso', codigo: 'departamento', texto: `A ${p.conflito.dia.split('-').reverse().join('/')} ficariam ${p.conflito.pct}% do departamento de férias (limite ${p.limitePct ?? 30}%).` });
    const minimo = p.periodoMinimo ?? 0;
    if (minimo > 0 && r.diasUteis < minimo && (p.direito ?? minimo) >= minimo) {
        const ano = Number(r.inicio.slice(0, 4));
        const temLongo = meus.some(x => x.ano === ano && Number(x.dias) >= minimo);
        if (!temLongo) avisos.push({ nivel: 'info', codigo: 'divisao', texto: `Férias divididas: um dos períodos do ano deve ter pelo menos ${minimo} dias úteis.` });
    }
    return avisos;
}
