// Períodos de filtro partilhados pelas páginas (dia, semana, mês, trimestre, semestre, ano, intervalo ou tudo).

export type PeriodKind = 'day' | 'week' | 'month' | 'quarter' | 'semester' | 'year' | 'custom' | 'all';

export type PeriodSelection = {
    kind: PeriodKind;
    year: number;
    /** 0 = janeiro. */
    month: number;
    semester: 1 | 2;
    /** Trimestre (1 a 4); ausente = trimestre do mês seleccionado. */
    quarter?: 1 | 2 | 3 | 4;
    /** Dia de referência (AAAA-MM-DD) para "dia" e "semana". */
    day: string;
    /** Intervalo personalizado (AAAA-MM-DD). */
    start: string;
    end: string;
};

export type PeriodRange = { start: Date | null; end: Date | null; label: string };

export const PERIOD_KIND_LABELS: Record<PeriodKind, string> = {
    day: 'Diário', week: 'Semanal', month: 'Mensal', quarter: 'Trimestral', semester: 'Semestral', year: 'Anual', custom: 'Personalizado', all: 'Todo o período',
};
export const MONTH_LONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const pad = (value: number) => String(value).padStart(2, '0');
export const toDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDateKey = (key: string) => {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
};
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
const formatShort = (date: Date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;

export function defaultPeriod(now: Date = new Date(), kind: PeriodKind = 'month'): PeriodSelection {
    const today = toDateKey(now);
    return {
        kind, year: now.getFullYear(), month: now.getMonth(), semester: now.getMonth() < 6 ? 1 : 2,
        quarter: (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4,
        day: today, start: toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)), end: today,
    };
}

/** Início, fim e descrição do período (semana de segunda a domingo). */
export function periodRange(selection: PeriodSelection): PeriodRange {
    switch (selection.kind) {
        case 'day': {
            const day = parseDateKey(selection.day);
            return { start: day, end: endOfDay(day), label: formatShort(day) };
        }
        case 'week': {
            const day = parseDateKey(selection.day);
            const monday = new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7));
            const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
            return { start: monday, end: endOfDay(sunday), label: `Semana de ${formatShort(monday)} a ${formatShort(sunday)}` };
        }
        case 'month': {
            const start = new Date(selection.year, selection.month, 1);
            return { start, end: endOfDay(new Date(selection.year, selection.month + 1, 0)), label: `${MONTH_LONG[selection.month]} de ${selection.year}` };
        }
        case 'quarter': {
            const quarter = selection.quarter ?? (Math.floor(selection.month / 3) + 1);
            const firstMonth = (quarter - 1) * 3;
            return {
                start: new Date(selection.year, firstMonth, 1),
                end: endOfDay(new Date(selection.year, firstMonth + 3, 0)),
                label: `${quarter}.º trimestre de ${selection.year}`,
            };
        }
        case 'semester': {
            const firstMonth = selection.semester === 1 ? 0 : 6;
            return {
                start: new Date(selection.year, firstMonth, 1),
                end: endOfDay(new Date(selection.year, firstMonth + 6, 0)),
                label: `${selection.semester}.º semestre de ${selection.year}`,
            };
        }
        case 'year':
            return { start: new Date(selection.year, 0, 1), end: endOfDay(new Date(selection.year, 11, 31)), label: `Ano de ${selection.year}` };
        case 'custom': {
            const start = parseDateKey(selection.start);
            const end = parseDateKey(selection.end || selection.start);
            const [from, to] = start <= end ? [start, end] : [end, start];
            return { start: from, end: endOfDay(to), label: `${formatShort(from)} a ${formatShort(to)}` };
        }
        default:
            return { start: null, end: null, label: 'Todo o período' };
    }
}

export function isInPeriod(value: Date | string | null | undefined, range: PeriodRange): boolean {
    if (!value) return range.start === null && range.end === null;
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return false;
    if (range.start && time < range.start.getTime()) return false;
    if (range.end && time > range.end.getTime()) return false;
    return true;
}
