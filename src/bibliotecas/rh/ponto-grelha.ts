// Grelha do Livro de ponto: junta funcionários, horários, calendário, ausências e marcações e calcula cada célula
// com o motor (ponto-calculo). Tudo puro: a página, as exportações, o fecho do mês e o processamento salarial
// usam a mesma função, por isso os números são sempre iguais em todo o lado.
import { calcularDiaPonto, totaisDosDias, type AusenciaDoDia, type ConfigPonto, type DiaPonto, type Marcacao, type TotaisFuncionario } from './ponto-calculo.ts';
import { escalasPorChave, horarioNaData, type EscalaDia } from './ponto-escalas.ts';
import { datasDoMes, diaSemana, feriadoNaData, HORARIO_OMISSAO, somarDias, type Feriado, type Horario, type TipoAusencia } from './ponto.ts';

export const DIAS_SEMANA = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export type FuncionarioPonto = {
    id: string; nome: string; numero_mecanografico: string; departamento_id: string | null; cargo_id: string | null; horario_id: string | null;
    data_admissao: string; data_saida: string | null; estado: string; utilizador_id?: string | null;
    /** Horas extra vão para o banco de horas em vez de serem pagas. */
    banco_horas?: number | null;
};
export type AusenciaPonto = {
    id: string; funcionario_id: string; tipo_id: string; data_inicio: string; data_fim: string; horas: number;
    estado: 'pendente' | 'aprovada' | 'anulada'; meio_dia?: string | null; justificacao_estado?: string | null;
};
/** Registo de dia da versão anterior (uma entrada e uma saída). */
export type PontoLegado = { funcionario_id: string; data: string; entrada: string | null; saida: string | null; origem?: string; observacoes?: string | null };

export type DadosGrelha = {
    ano: number; mes: number; hoje: string; agora?: string;
    funcionarios: FuncionarioPonto[]; horarios: Horario[]; feriados: Feriado[]; tipos: TipoAusencia[];
    ausencias: AusenciaPonto[]; marcacoes: Marcacao[]; legados: PontoLegado[]; config: ConfigPonto;
    /** Turnos e folgas lançados no ecrã Escalas (opcional). */
    escalas?: EscalaDia[];
};

export type LinhaGrelha = { funcionario: FuncionarioPonto; horario: Horario; dias: DiaPonto[]; totais: TotaisFuncionario; editados: Set<string>; observacoes: Map<string, string> };
export type Grelha = {
    dias: Array<{ data: string; semana: string; fimDeSemana: boolean; feriado: string | null; hoje: boolean; futuro: boolean }>;
    linhas: LinhaGrelha[];
    totaisDia: Record<string, { presentes: number; activos: number }>;
    resumo: { funcionarios: number; taxa_presenca: number; faltas: number; minutos_atraso: number; minutos_extra: number; pendentes: number; incompletos: number };
};

export const horarioDoFuncionario = (f: Pick<FuncionarioPonto, 'horario_id'>, horarios: Horario[]) =>
    horarios.find(h => h.id === f.horario_id) || horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;

/** Marcações virtuais de um registo da versão anterior: uma entrada e uma saída (a saída depois da meia-noite passa para o dia seguinte). */
export function marcacoesDoLegado(p: PontoLegado): Marcacao[] {
    if (!p.entrada) return [];
    const origem = p.origem === 'importado' ? 'csv' : p.origem === 'app' ? 'app' : 'manual';
    const lista: Marcacao[] = [{ id: `legado:${p.funcionario_id}:${p.data}:e`, funcionario_id: p.funcionario_id, data: p.data, data_hora: `${p.data}T${p.entrada}`, tipo: 'entrada', origem }];
    if (p.saida) {
        const diaSaida = p.saida <= p.entrada ? somarDias(p.data, 1) : p.data;
        lista.push({ id: `legado:${p.funcionario_id}:${p.data}:s`, funcionario_id: p.funcionario_id, data: p.data, data_hora: `${diaSaida}T${p.saida}`, tipo: 'saida', origem });
    }
    return lista;
}

/** Ausência (não anulada) que cobre o dia, no formato do motor. */
export function ausenciaDoDia(ausencias: AusenciaPonto[], tipos: Map<string, TipoAusencia>, funcionarioId: string, data: string): AusenciaDoDia | null {
    const a = ausencias.find(x => x.funcionario_id === funcionarioId && x.estado !== 'anulada' && x.data_inicio <= data && x.data_fim >= data);
    if (!a) return null;
    return {
        id: a.id, tipo: tipos.get(a.tipo_id), estado: a.estado, horas: Number(a.horas) || 0,
        meio_dia: a.meio_dia === 'manha' || a.meio_dia === 'tarde' ? a.meio_dia : null,
        justificacao_pendente: a.justificacao_estado === 'pendente',
    };
}

/** Marcações a usar para cada funcionário e dia: as novas; sem elas, o registo da versão anterior. */
export function marcacoesPorDia(marcacoes: Marcacao[], legados: PontoLegado[]) {
    const mapa = new Map<string, Marcacao[]>();
    for (const m of marcacoes) {
        if (m.anulada) continue;
        const chave = `${m.funcionario_id}:${m.data}`;
        mapa.set(chave, [...(mapa.get(chave) || []), m]);
    }
    // Um dia só com marcações anuladas conta como tratado na versão nova: o registo antigo não volta.
    const tratados = new Set(marcacoes.map(m => `${m.funcionario_id}:${m.data}`));
    for (const p of legados) {
        const chave = `${p.funcionario_id}:${p.data}`;
        if (!tratados.has(chave)) mapa.set(chave, marcacoesDoLegado(p));
    }
    return mapa;
}

/** Calcula um funcionário num conjunto de datas (o mês, ou um só dia). */
export function calcularFuncionario(f: FuncionarioPonto, datas: string[], d: Omit<DadosGrelha, 'ano' | 'mes' | 'funcionarios'>, porDia = marcacoesPorDia(d.marcacoes, d.legados)) {
    const base = horarioDoFuncionario(f, d.horarios);
    const tipos = new Map(d.tipos.map(t => [t.id, t]));
    const escalas = escalasPorChave(d.escalas || []);
    return datas.map(data => calcularDiaPonto({
        data, hoje: d.hoje, agora: d.agora, horario: horarioNaData(base, data, d.horarios, escalas.get(`${f.id}:${data}`)).horario, feriados: d.feriados, config: d.config,
        marcacoes: porDia.get(`${f.id}:${data}`) || [], ausencia: ausenciaDoDia(d.ausencias, tipos, f.id, data),
        admissao: f.data_admissao, saida: f.data_saida,
    }));
}

/** Funcionários com contrato em algum dia do mês (os suspensos ficam de fora). */
export const funcionariosDoMes = (funcionarios: FuncionarioPonto[], ano: number, mes: number) => {
    const datas = datasDoMes(ano, mes);
    return funcionarios.filter(f => f.data_admissao <= datas[datas.length - 1] && (!f.data_saida || f.data_saida >= datas[0]) && f.estado !== 'suspenso');
};

export function construirGrelha(d: DadosGrelha): Grelha {
    const datas = datasDoMes(d.ano, d.mes);
    const porDia = marcacoesPorDia(d.marcacoes, d.legados);
    const editados = new Set(d.marcacoes.filter(m => m.origem === 'manual').map(m => `${m.funcionario_id}:${m.data}`));
    const observacoes = new Map(d.legados.filter(p => p.observacoes).map(p => [`${p.funcionario_id}:${p.data}`, String(p.observacoes)]));
    const linhas: LinhaGrelha[] = funcionariosDoMes(d.funcionarios, d.ano, d.mes).map(f => {
        const dias = calcularFuncionario(f, datas, d, porDia);
        return {
            funcionario: f, horario: horarioDoFuncionario(f, d.horarios), dias, totais: totaisDosDias(dias, d.hoje),
            editados: new Set([...editados].filter(k => k.startsWith(`${f.id}:`)).map(k => k.slice(f.id.length + 1))),
            observacoes: new Map([...observacoes].filter(([k]) => k.startsWith(`${f.id}:`)).map(([k, v]) => [k.slice(f.id.length + 1), v])),
        };
    });
    const totaisDia: Grelha['totaisDia'] = {};
    for (const data of datas) {
        const contam = linhas.map(l => l.dias.find(x => x.data === data)!).filter(x => x.util && x.estado !== 'FORA');
        totaisDia[data] = { presentes: contam.filter(x => x.estado === 'P').length, activos: contam.length };
    }
    const soma = (campo: keyof TotaisFuncionario) => linhas.reduce((s, l) => s + Number(l.totais[campo]), 0);
    const passados = linhas.flatMap(l => l.dias.filter(x => x.util && x.data <= d.hoje && x.estado !== 'FORA' && !['Fe', 'L', 'D'].includes(x.estado)));
    return {
        dias: datas.map(data => ({
            data, semana: DIAS_SEMANA[diaSemana(data)], fimDeSemana: diaSemana(data) >= 6, feriado: feriadoNaData(d.feriados, data)?.nome || null,
            hoje: data === d.hoje, futuro: data > d.hoje,
        })),
        linhas, totaisDia,
        resumo: {
            funcionarios: linhas.length,
            taxa_presenca: passados.length ? passados.filter(x => x.estado === 'P').length / passados.length : 0,
            faltas: Math.round(soma('faltas') * 100) / 100, minutos_atraso: soma('minutos_atraso'), minutos_extra: soma('minutos_extra'),
            pendentes: soma('pendentes'), incompletos: soma('incompletos'),
        },
    };
}

/** Valores enviados ao processamento salarial no fecho (secção 10.3). */
export type TotaisSalario = {
    funcionario_id: string; faltas_injustificadas: number; faltas_descontaveis: number; minutos_atraso: number;
    minutos_extra_util: number; minutos_extra_descanso: number; minutos_extra_feriado: number; minutos_noturnos: number;
    dias_trabalho_efectivo: number; pendentes: number; ausencias_pendentes: number;
    /** Minutos extra que foram para o banco de horas (não se pagam). */
    minutos_banco?: number;
};
export const totaisParaSalario = (linha: LinhaGrelha): TotaisSalario => ({
    funcionario_id: linha.funcionario.id, faltas_injustificadas: linha.totais.faltas, faltas_descontaveis: linha.totais.faltas_descontaveis,
    minutos_atraso: linha.totais.minutos_atraso, minutos_extra_util: linha.totais.minutos_extra_util, minutos_extra_descanso: linha.totais.minutos_extra_descanso,
    minutos_extra_feriado: linha.totais.minutos_extra_feriado, minutos_noturnos: linha.totais.minutos_noturnos,
    dias_trabalho_efectivo: linha.totais.dias_trabalho_efectivo, pendentes: linha.totais.pendentes, ausencias_pendentes: linha.totais.ausencias_pendentes,
});

/** Células onde uma acção em massa não se aplica: feriado, descanso, férias, licença, futuro e fora do contrato. */
export const celulaElegivel = (dia: DiaPonto, acao: 'presente' | 'falta' | 'falta_justificada' | 'dispensa' | 'limpar') => {
    if (dia.estado === 'FORA' || ['FR', 'FS', 'Fe', 'L'].includes(dia.estado)) return false;
    if (dia.estado === 'FUTURO') return acao === 'dispensa';
    return true;
};
