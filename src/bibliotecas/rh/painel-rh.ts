// Painel de RH: períodos do filtro, séries dos gráficos (assiduidade diária, mapa de presença, ausências por tipo e
// por dia da semana), indicadores com variação face ao período anterior, fichas incompletas, etapa dos salários do
// mês e próximos eventos. Funções puras sobre os dias calculados pelo livro de ponto (o mesmo motor do processamento).
import type { DiaPonto } from './ponto-calculo.ts';
import { diaSemana, somarDias } from './ponto.ts';

export type Periodo = 'hoje' | 'semana' | 'este_mes' | 'mes_passado' | 'este_ano' | 'personalizado';
export const ROTULO_PERIODO: Record<Periodo, string> = {
    hoje: 'Hoje', semana: 'Esta semana', este_mes: 'Este mês', mes_passado: 'Mês passado', este_ano: 'Este ano', personalizado: 'Personalizado',
};
export type Intervalo = { de: string; ate: string };

const pad = (n: number) => String(n).padStart(2, '0');
const ultimoDiaMes = (ano: number, mes: number) => `${ano}-${pad(mes)}-${pad(new Date(Date.UTC(ano, mes, 0)).getUTCDate())}`;
const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000) + 1;

/** Intervalo do período escolhido e o período anterior com a mesma duração (para a variação ▲/▼). */
export function intervaloDoPeriodo(periodo: Periodo, hoje: string, personalizado?: Partial<Intervalo>): Intervalo & { anterior: Intervalo } {
    const [ano, mes] = hoje.split('-').map(Number);
    let de = hoje;
    let ate = hoje;
    if (periodo === 'semana') de = somarDias(hoje, -(diaSemana(hoje) - 1));
    else if (periodo === 'este_mes') de = `${ano}-${pad(mes)}-01`;
    else if (periodo === 'mes_passado') {
        const a = mes === 1 ? ano - 1 : ano, m = mes === 1 ? 12 : mes - 1;
        de = `${a}-${pad(m)}-01`; ate = ultimoDiaMes(a, m);
    } else if (periodo === 'este_ano') de = `${ano}-01-01`;
    else if (periodo === 'personalizado' && personalizado?.de && personalizado?.ate) {
        de = personalizado.de <= personalizado.ate ? personalizado.de : personalizado.ate;
        ate = personalizado.de <= personalizado.ate ? personalizado.ate : personalizado.de;
    }
    // Mês anterior completo para «este mês» e «mês passado»; nos outros, a mesma duração imediatamente antes.
    if (periodo === 'este_mes' || periodo === 'mes_passado') {
        const [a0, m0] = de.split('-').map(Number);
        const a = m0 === 1 ? a0 - 1 : a0, m = m0 === 1 ? 12 : m0 - 1;
        const fimAnterior = periodo === 'este_mes' ? `${a}-${pad(m)}-${pad(Math.min(Number(hoje.slice(8, 10)), Number(ultimoDiaMes(a, m).slice(8))))}` : ultimoDiaMes(a, m);
        return { de, ate, anterior: { de: `${a}-${pad(m)}-01`, ate: fimAnterior } };
    }
    const n = dias(de, ate);
    return { de, ate, anterior: { de: somarDias(de, -n), ate: somarDias(de, -1) } };
}

/** Meses (ano, mês) que um intervalo toca, por ordem. */
export function mesesDoIntervalo(i: Intervalo): Array<{ ano: number; mes: number }> {
    const lista: Array<{ ano: number; mes: number }> = [];
    let [a, m] = i.de.split('-').map(Number);
    const [af, mf] = i.ate.split('-').map(Number);
    while (a * 12 + m <= af * 12 + mf) { lista.push({ ano: a, mes: m }); m += 1; if (m > 12) { m = 1; a += 1; } }
    return lista;
}

export type LinhaPainel = { funcionarioId: string; nome: string; departamentoId: string | null; dias: DiaPonto[] };
/** Estado de um quadrado do mapa: presente, atraso, falta, férias/licença, sem registo; null = dia sem trabalho para ele. */
export type EstadoMapa = 'P' | 'A' | 'F' | 'L' | 'S' | 'futuro' | null;

const AUSENCIA = new Set(['Fe', 'L', 'D']);
const NAO_CONTA = new Set(['Fe', 'L', 'D', 'FORA', 'FUTURO', 'FR', 'FS']);

/** Estado do dia para o mapa de presença. */
export function estadoMapa(d: DiaPonto | undefined, hoje: string): EstadoMapa {
    if (!d) return null;
    if (d.estado === 'FUTURO' || d.data > hoje) return 'futuro';
    if (d.estado === 'P') return d.minutos_atraso > 0 ? 'A' : 'P';
    if (d.estado === 'F' || d.estado === 'FJ') return 'F';
    if (AUSENCIA.has(d.estado)) return 'L';
    if (d.estado === 'SEM_REGISTO') return 'S';
    return null;
}

/** O dia conta para a assiduidade: dia útil do funcionário, já passado (hoje só se já marcou), sem férias nem licença. */
const contaAssiduidade = (d: DiaPonto, hoje: string) => d.util && !NAO_CONTA.has(d.estado) && (d.data < hoje || (d.data === hoje && d.estado === 'P'));

/** Taxa de assiduidade num intervalo: dias presentes ÷ dias úteis esperados (null sem dias esperados). */
export function assiduidade(linhas: LinhaPainel[], i: Intervalo, hoje: string) {
    let esperados = 0;
    let presentes = 0;
    for (const l of linhas) for (const d of l.dias) {
        if (d.data < i.de || d.data > i.ate || !contaAssiduidade(d, hoje)) continue;
        esperados += 1;
        if (d.estado === 'P') presentes += 1;
    }
    return { esperados, presentes, taxa: esperados ? Math.round((presentes / esperados) * 1000) / 10 : null };
}

/** Assiduidade diária (% presentes) nos dias com trabalho esperado, os mais recentes primeiro cortados a `maximo`. */
export function assiduidadeDiaria(linhas: LinhaPainel[], i: Intervalo, hoje: string, maximo = 20) {
    const porDia = new Map<string, { esperados: number; presentes: number }>();
    for (const l of linhas) for (const d of l.dias) {
        if (d.data < i.de || d.data > i.ate || !contaAssiduidade(d, hoje)) continue;
        const x = porDia.get(d.data) || { esperados: 0, presentes: 0 };
        x.esperados += 1;
        if (d.estado === 'P') x.presentes += 1;
        porDia.set(d.data, x);
    }
    return [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-maximo)
        .map(([data, x]) => ({ data, taxa: Math.round((x.presentes / x.esperados) * 1000) / 10, presentes: x.presentes, esperados: x.esperados }));
}

export type TiposAusencia = { ferias: number; faltas_justificadas: number; faltas_injustificadas: number; licencas: number; dispensas: number };
/** Dias de ausência por tipo e as ausências (sem férias) por dia da semana, seg–sex. */
export function ausencias(linhas: LinhaPainel[], i: Intervalo, hoje: string) {
    const tipos: TiposAusencia = { ferias: 0, faltas_justificadas: 0, faltas_injustificadas: 0, licencas: 0, dispensas: 0 };
    const semana = [0, 0, 0, 0, 0];
    for (const l of linhas) for (const d of l.dias) {
        if (d.data < i.de || d.data > i.ate || d.data > hoje) continue;
        const chave = ({ Fe: 'ferias', FJ: 'faltas_justificadas', F: 'faltas_injustificadas', L: 'licencas', D: 'dispensas' } as const)[d.estado as 'Fe'];
        if (!chave) continue;
        tipos[chave] += 1;
        const dia = diaSemana(d.data);
        if (chave !== 'ferias' && dia <= 5) semana[dia - 1] += 1;
    }
    return { tipos, semana };
}

/** Minutos de horas extra e dias de falta injustificada no intervalo, por funcionário. */
export function extrasEFaltas(linhas: LinhaPainel[], i: Intervalo, hoje: string) {
    const porFuncionario = new Map<string, { minutosExtra: number; faltas: number }>();
    for (const l of linhas) {
        const x = { minutosExtra: 0, faltas: 0 };
        for (const d of l.dias) {
            if (d.data < i.de || d.data > i.ate || d.data > hoje) continue;
            x.minutosExtra += Number(d.minutos_extra) || 0;
            if (d.estado === 'F') x.faltas += 1;
        }
        porFuncionario.set(l.funcionarioId, x);
    }
    return porFuncionario;
}

/** Variação percentual face ao período anterior (null quando não há base). */
export function variacao(actual: number | null, anterior: number | null) {
    if (actual === null || anterior === null || anterior === 0) return null;
    return Math.round(((actual - anterior) / anterior) * 1000) / 10;
}

/** Dados que faltam na ficha (NIF, INSS, IBAN, BI, data de nascimento). */
export function camposEmFalta(f: { nif?: string | null; numero_inss?: string | null; iban?: string | null; bi_numero?: string | null; data_nascimento?: string | null }) {
    const faltam: string[] = [];
    if (!f.nif?.trim()) faltam.push('NIF');
    if (!f.numero_inss?.trim()) faltam.push('INSS');
    if (!f.iban?.trim()) faltam.push('IBAN');
    if (!f.bi_numero?.trim()) faltam.push('BI');
    if (!f.data_nascimento) faltam.push('data de nascimento');
    return faltam;
}

export type EtapaSalarios = 'ponto' | 'processar' | 'aprovar' | 'pagar' | 'recibos';
export const ETAPAS_SALARIOS: Array<{ id: EtapaSalarios; rotulo: string }> = [
    { id: 'ponto', rotulo: 'Ponto' }, { id: 'processar', rotulo: 'Processar' }, { id: 'aprovar', rotulo: 'Aprovar' }, { id: 'pagar', rotulo: 'Pagar' }, { id: 'recibos', rotulo: 'Recibos' },
];
/**
 * Etapa actual dos salários do mês: ponto por fechar → processar (aberto ou sem processamento) → aprovar (calculado)
 * → pagar (aprovado) → recibos (pago ou fechado).
 */
export function etapaSalarios(estadoProcessamento: string | null, pontoFechado: boolean): EtapaSalarios {
    if (estadoProcessamento === 'pago' || estadoProcessamento === 'fechado') return 'recibos';
    if (estadoProcessamento === 'aprovado') return 'pagar';
    if (estadoProcessamento === 'calculado') return 'aprovar';
    return pontoFechado || estadoProcessamento === 'aberto' ? 'processar' : 'ponto';
}

/** Cor fixa de cada departamento (paleta categórica pela ordem dos departamentos; mais de 8 → «Outros»). */
export const PALETA = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const COR_OUTROS = '#98A2B3';
export const corDepartamento = (ids: string[], id: string | null) => {
    const i = id ? ids.indexOf(id) : -1;
    return i >= 0 && i < PALETA.length ? PALETA[i] : COR_OUTROS;
};
export const COR_ESTADO: Record<Exclude<EstadoMapa, null>, string> = { P: '#12B76A', A: '#F79009', F: '#D92D20', L: '#2a78d6', S: '#D0D5DD', futuro: '#FFFFFF' };
export const ROTULO_ESTADO: Record<Exclude<EstadoMapa, null>, string> = { P: 'Presente', A: 'Atraso', F: 'Falta', L: 'Férias/licença', S: 'Sem registo', futuro: 'Dia futuro' };
