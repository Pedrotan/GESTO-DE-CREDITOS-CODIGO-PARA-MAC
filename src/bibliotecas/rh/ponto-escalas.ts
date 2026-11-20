// Turnos e escalas (F3.9/F3.10): qual o horário de um funcionário num dia. Prioridade: escala lançada para esse dia
// (turno ou folga) → ciclo do horário rotativo → horário fixo do funcionário. Puro: usado pela grelha e pelo ecrã Escalas.
import { diaSemana, type Horario } from './ponto.ts';

/** Turno atribuído a um funcionário num dia; horario_id null = folga. */
export type EscalaDia = { funcionario_id: string; data: string; horario_id: string | null };

const diaUtc = (data: string) => Date.parse(`${data}T00:00:00Z`);

/** Dias do ciclo de um horário rotativo: id do turno de cada dia ("" = folga). */
export function cicloDoHorario(h: Pick<Horario, 'tipo' | 'ciclo'>): string[] {
    if (h.tipo !== 'rotativo' || !h.ciclo) return [];
    try {
        const ciclo = JSON.parse(h.ciclo);
        return Array.isArray(ciclo) ? ciclo.map(x => String(x ?? '')) : [];
    } catch {
        return [];
    }
}

/** Mesmo horário, a trabalhar nesse dia (o turno da escala manda, seja qual for o dia da semana). */
const aTrabalhar = (h: Horario, data: string): Horario => ({ ...h, dias_semana: String(diaSemana(data)) });
/** Folga: nenhum dia de trabalho. */
const deFolga = (h: Horario): Horario => ({ ...h, dias_semana: '' });

/** Posição do dia no ciclo (0..N-1), também para datas anteriores ao início. */
export const posicaoNoCiclo = (data: string, inicio: string, tamanho: number) => {
    const dias = Math.round((diaUtc(data) - diaUtc(inicio)) / 86_400_000);
    return ((dias % tamanho) + tamanho) % tamanho;
};

/** Horário aplicável ao funcionário nesse dia e de onde veio. */
export function horarioNaData(base: Horario, data: string, horarios: Horario[], escala?: EscalaDia | null): { horario: Horario; origem: 'escala' | 'ciclo' | 'fixo'; folga: boolean } {
    const porId = (id: string) => horarios.find(h => h.id === id);
    if (escala) {
        if (!escala.horario_id) return { horario: deFolga(base), origem: 'escala', folga: true };
        const turno = porId(escala.horario_id);
        if (turno) return { horario: aTrabalhar(turno.tipo === 'rotativo' ? { ...turno, tipo: 'fixo' } : turno, data), origem: 'escala', folga: false };
    }
    const ciclo = cicloDoHorario(base);
    if (ciclo.length && base.ciclo_inicio) {
        const id = ciclo[posicaoNoCiclo(data, base.ciclo_inicio, ciclo.length)];
        if (!id) return { horario: deFolga(base), origem: 'ciclo', folga: true };
        const turno = id === base.id ? { ...base, tipo: 'fixo' as const } : porId(id);
        if (turno) return { horario: aTrabalhar(turno, data), origem: 'ciclo', folga: false };
        return { horario: aTrabalhar(base, data), origem: 'ciclo', folga: false };
    }
    return { horario: base, origem: 'fixo', folga: false };
}

/** Índice das escalas por «funcionário:data». */
export const escalasPorChave = (escalas: EscalaDia[]) => new Map(escalas.map(e => [`${e.funcionario_id}:${e.data}`, e]));

/** Segunda-feira da semana de uma data. */
export const segundaDaSemana = (data: string) => {
    const d = new Date(diaUtc(data));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
};
