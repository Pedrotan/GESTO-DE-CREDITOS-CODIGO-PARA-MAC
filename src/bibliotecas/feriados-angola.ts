// Feriados nacionais de Angola (Lei n.º 11/18) e regras de dias/horas úteis configuráveis, usadas pela
// auditoria para assinalar pagamentos registados fora do expediente.

export type WorkingTimeConfig = {
    /** Dias úteis (0 = domingo … 6 = sábado). */
    workDays: number[];
    /** Hora de abertura (inclusive) e de fecho (exclusive), 0–24. */
    startHour: number;
    endHour: number;
    /** Datas adicionais sem expediente (AAAA-MM-DD): pontes, tolerâncias, feriados municipais. */
    extraHolidays: string[];
    /** Considerar os feriados nacionais de Angola. */
    useNationalHolidays: boolean;
};

export const DEFAULT_WORKING_TIME: WorkingTimeConfig = {
    workDays: [1, 2, 3, 4, 5],
    startHour: 8,
    endHour: 17,
    extraHolidays: [],
    useNationalHolidays: true,
};

const pad = (value: number) => String(value).padStart(2, '0');
export const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easterSunday(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Feriados nacionais de um ano: data (AAAA-MM-DD) → nome. */
export function angolaHolidays(year: number): Map<string, string> {
    const easter = easterSunday(year);
    const fixed: Array<[number, number, string]> = [
        [1, 1, 'Dia do Ano Novo'],
        [2, 4, 'Dia do Início da Luta Armada de Libertação Nacional'],
        [3, 8, 'Dia Internacional da Mulher'],
        [3, 23, 'Dia da Libertação da África Austral'],
        [4, 4, 'Dia da Paz e da Reconciliação Nacional'],
        [5, 1, 'Dia Internacional do Trabalhador'],
        [9, 17, 'Dia do Fundador da Nação e do Herói Nacional'],
        [11, 2, 'Dia dos Finados'],
        [11, 11, 'Dia da Independência Nacional'],
        [12, 25, 'Dia de Natal e da Família'],
    ];
    const holidays = new Map<string, string>(fixed.map(([month, day, name]) => [`${year}-${pad(month)}-${pad(day)}`, name]));
    holidays.set(dateKey(addDays(easter, -47)), 'Carnaval');
    holidays.set(dateKey(addDays(easter, -2)), 'Sexta-Feira Santa');
    return holidays;
}

export type WorkingTimeCheck = { working: boolean; reason?: string };

/** Indica se um instante está dentro do expediente configurado (hora local do dispositivo). */
export function checkWorkingTime(value: Date | string, config: WorkingTimeConfig = DEFAULT_WORKING_TIME): WorkingTimeCheck {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return { working: true };
    const key = dateKey(date);
    if (config.useNationalHolidays) {
        const holiday = angolaHolidays(date.getFullYear()).get(key);
        if (holiday) return { working: false, reason: `Feriado nacional (${holiday})` };
    }
    if (config.extraHolidays.includes(key)) return { working: false, reason: 'Dia sem expediente configurado' };
    const weekday = date.getDay();
    if (!config.workDays.includes(weekday)) {
        return { working: false, reason: weekday === 0 ? 'Domingo' : weekday === 6 ? 'Sábado' : 'Dia não útil configurado' };
    }
    const hour = date.getHours() + date.getMinutes() / 60;
    if (hour < config.startHour || hour >= config.endHour) {
        return { working: false, reason: `Fora do horário (${pad(config.startHour)}h–${pad(config.endHour)}h)` };
    }
    return { working: true };
}

export function normalizeWorkingTime(raw: unknown): WorkingTimeConfig {
    const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<WorkingTimeConfig>;
    const hour = (input: unknown, fallback: number) => {
        const number = Number(input);
        return Number.isFinite(number) && number >= 0 && number <= 24 ? number : fallback;
    };
    const workDays = Array.isArray(value.workDays)
        ? [...new Set(value.workDays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
        : DEFAULT_WORKING_TIME.workDays;
    const startHour = hour(value.startHour, DEFAULT_WORKING_TIME.startHour);
    const endHour = hour(value.endHour, DEFAULT_WORKING_TIME.endHour);
    return {
        workDays,
        startHour: Math.min(startHour, endHour),
        endHour: Math.max(startHour, endHour),
        extraHolidays: Array.isArray(value.extraHolidays) ? value.extraHolidays.filter(item => /^\d{4}-\d{2}-\d{2}$/.test(String(item))).map(String) : [],
        useNationalHolidays: value.useNationalHolidays !== false,
    };
}
