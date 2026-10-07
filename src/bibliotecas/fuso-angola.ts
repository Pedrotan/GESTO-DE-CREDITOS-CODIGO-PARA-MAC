// Datas no fuso de Angola (Africa/Luanda, UTC+1, sem hora de verão). As datas e horas são guardadas em UTC
// (ISO 8601) e apresentadas, filtradas e agrupadas sempre na hora de Luanda, seja qual for o fuso do computador.

export const LUANDA_TIME_ZONE = 'Africa/Luanda';
const OFFSET_MS = 60 * 60 * 1000;
const pad = (value: number) => String(value).padStart(2, '0');

const toTime = (value: Date | string | number | null | undefined): number => {
    if (value === null || value === undefined || value === '') return NaN;
    return value instanceof Date ? value.getTime() : new Date(value).getTime();
};

/** Componentes da data/hora em Luanda (mês 0 = janeiro). */
export function luandaParts(value: Date | string | number) {
    const time = toTime(value);
    if (Number.isNaN(time)) return null;
    const shifted = new Date(time + OFFSET_MS);
    return {
        year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes(), weekday: shifted.getUTCDay(),
    };
}

/** Dia em Luanda no formato AAAA-MM-DD (chave para filtros e agrupamentos). */
export function luandaDateKey(value: Date | string | number | null | undefined): string {
    const parts = value === null || value === undefined ? null : luandaParts(value);
    return parts ? `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)}` : '';
}

/** Mês em Luanda no formato AAAA-MM (o mesmo identificador da tabela closed_months). */
export const luandaMonthKey = (value: Date | string | number | null | undefined) => luandaDateKey(value).slice(0, 7);

export const luandaTodayKey = (now: Date = new Date()) => luandaDateKey(now);

/** Instante UTC correspondente a uma hora de Luanda. */
export function luandaToUtc(dateKey: string, hour = 0, minute = 0, second = 0, ms = 0): Date {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(year, (month || 1) - 1, day || 1, hour, minute, second, ms) - OFFSET_MS);
}

/**
 * Data-valor escolhida pelo operador (AAAA-MM-DD) → instante a guardar. No próprio dia usa a hora actual;
 * nos dias anteriores usa o meio-dia de Luanda, para a data nunca mudar de dia em nenhum fuso.
 */
export function valueDateToIso(dateKey: string, now: Date = new Date()): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('Data-valor inválida.');
    if (dateKey === luandaDateKey(now)) return now.toISOString();
    return luandaToUtc(dateKey, 12).toISOString();
}

export function formatLuandaDate(value: Date | string | number | null | undefined): string {
    const parts = value === null || value === undefined ? null : luandaParts(value);
    return parts ? `${pad(parts.day)}/${pad(parts.month + 1)}/${parts.year}` : '—';
}

export function formatLuandaDateTime(value: Date | string | number | null | undefined): string {
    const parts = value === null || value === undefined ? null : luandaParts(value);
    return parts ? `${pad(parts.day)}/${pad(parts.month + 1)}/${parts.year} ${pad(parts.hour)}:${pad(parts.minute)}` : '—';
}

/**
 * Data/hora de registo. Os registos anteriores a esta versão só guardavam o dia (meia-noite UTC, que em
 * Luanda aparecia como 01:00): nesses casos mostra-se apenas a data.
 */
export function formatRegistration(value: Date | string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const iso = value instanceof Date ? value.toISOString() : typeof value === 'number' ? new Date(value).toISOString() : String(value);
    return /T00:00:00(\.000)?Z$/.test(iso) ? formatLuandaDate(value) : formatLuandaDateTime(value);
}

/** Soma dias a uma chave AAAA-MM-DD. */
export function addDaysToKey(dateKey: string, days: number): string {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Dias entre duas chaves AAAA-MM-DD (to − from). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
    const [y1, m1, d1] = fromKey.split('-').map(Number);
    const [y2, m2, d2] = toKey.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
