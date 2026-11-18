// Cores, rótulos e textos partilhados pelo Livro de ponto (especificação, secção 3).
import type { DiaPonto, EstadoDia } from '@/bibliotecas/rh/ponto-calculo';
import { formatarMinutos, horaDe } from '@/bibliotecas/rh/ponto-calculo';
import { codigoCelula } from '@/bibliotecas/rh/ponto-relatorios';

export const ESTADOS: Array<{ codigo: string; estado: EstadoDia; nome: string; cor: string }> = [
    { codigo: 'P', estado: 'P', nome: 'Presente', cor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' },
    { codigo: 'F', estado: 'F', nome: 'Falta injustificada', cor: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200' },
    { codigo: 'FJ', estado: 'FJ', nome: 'Falta justificada', cor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
    { codigo: 'Fe', estado: 'Fe', nome: 'Férias', cor: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200' },
    { codigo: 'D', estado: 'D', nome: 'Dispensa', cor: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200' },
    { codigo: 'L', estado: 'L', nome: 'Licença', cor: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-200' },
    { codigo: 'FR', estado: 'FR', nome: 'Feriado', cor: 'bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-slate-100' },
    { codigo: 'FS', estado: 'FS', nome: 'Fim de semana / folga', cor: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500' },
    { codigo: '?', estado: 'SEM_REGISTO', nome: 'Sem registo', cor: 'bg-white text-orange-600 ring-1 ring-inset ring-orange-400 dark:bg-slate-900' },
];
export const COR_ESTADO: Record<string, string> = Object.fromEntries(ESTADOS.map(e => [e.estado, e.cor]));
export const NOME_ESTADO: Record<string, string> = { ...Object.fromEntries(ESTADOS.map(e => [e.estado, e.nome])), FUTURO: 'Dia futuro', FORA: 'Fora do contrato' };

export const ORIGEM: Record<string, string> = { manual: 'Registo manual', csv: 'Importado do relógio', relogio: 'Relógio biométrico', app: 'Portal do funcionário', quiosque: 'Quiosque' };
export const TIPO_MARCACAO: Record<string, string> = { entrada: 'Entrada', saida: 'Saída', inicio_pausa: 'Início de pausa', fim_pausa: 'Fim de pausa' };

const dataLonga = (data: string) => {
    const [a, m, d] = data.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString('pt-PT', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
};

/** Texto do tooltip da célula (F1.6). */
export function textoTooltip(d: DiaPonto, tolerancia: number, observacao?: string) {
    const titulo = `${dataLonga(d.data).replace(/^./u, c => c.toUpperCase())}, ${d.data.split('-').reverse().join('/')}: ${NOME_ESTADO[d.estado] || d.estado}`;
    const linhas = [titulo];
    if (d.feriado) linhas.push(d.feriado);
    if (d.primeira_entrada) linhas.push(`Entrada ${horaDe(d.primeira_entrada)} · Saída ${horaDe(d.ultima_saida) || '—'}`);
    const pausas = d.segmentos.filter(s => s.tipo === 'pausa' && s.fim);
    if (pausas.length) linhas.push(`Pausa ${pausas.map(p => `${horaDe(p.inicio)}–${horaDe(p.fim)}`).join(', ')}`);
    else if (d.minutos_pausa) linhas.push(`Pausa ${formatarMinutos(d.minutos_pausa)} (automática)`);
    if (d.minutos_trabalhados) linhas.push(`Trabalhado: ${formatarMinutos(d.minutos_trabalhados).replace(':', 'h')}${d.minutos_atraso ? ` · Atraso: ${d.minutos_atraso} min (tolerância ${tolerancia})` : ''}`);
    if (d.minutos_saida_antecipada) linhas.push(`Saída antecipada: ${d.minutos_saida_antecipada} min`);
    if (d.minutos_extra) linhas.push(`Extra: ${formatarMinutos(d.minutos_extra)}${d.tipo_extra === 'util' ? '' : ` (${d.tipo_extra})`}`);
    if (d.falta_tipo && d.falta_fraccao < 1) linhas.push(`${d.falta_tipo === 'F' ? 'Falta' : 'Falta justificada'}: ${d.falta_fraccao} dia`);
    if (d.incompleto) linhas.push('⚠ Marcação incompleta (entrada sem saída)');
    if (d.ausencia_pendente) linhas.push('Justificação ou aprovação pendente');
    if (d.aviso) linhas.push(`⚠ ${d.aviso}`);
    if (observacao) linhas.push(`Obs.: ${observacao}`);
    return linhas.join('\n');
}

export { codigoCelula };

export const FILTROS_ESTADO = [
    { id: 'todos', nome: 'Todos' }, { id: 'faltas', nome: 'Com faltas' }, { id: 'atrasos', nome: 'Com atrasos' },
    { id: 'pendentes', nome: 'Com pendentes' }, { id: 'extra', nome: 'Com horas extra' }, { id: 'incompletos', nome: 'Incompletos' },
] as const;
export type FiltroEstado = typeof FILTROS_ESTADO[number]['id'];
export const ORDENACOES = [
    { id: 'nome', nome: 'Nome' }, { id: 'departamento', nome: 'Departamento' }, { id: 'faltas', nome: 'N.º de faltas' }, { id: 'atraso', nome: 'Minutos de atraso' },
] as const;
export type Ordenacao = typeof ORDENACOES[number]['id'];
