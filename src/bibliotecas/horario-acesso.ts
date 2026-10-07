// Horário de acesso ao sistema, definido pelo super administrador e partilhado por todos os dispositivos
// (computadores e versão web). O super administrador nunca fica bloqueado, para poder sempre corrigir as regras.

export type DayRule = { allowed: boolean; start: string; end: string };
/** schedule: segue o horário; always: acesso a qualquer hora; blocked: sem acesso. */
export type UserAccessMode = 'schedule' | 'always' | 'blocked';

export type AccessSchedule = {
    enabled: boolean;
    /** Índice 0 = domingo ... 6 = sábado. */
    days: DayRule[];
    /** Meses (0 = janeiro) em que o acesso é permitido. */
    allowedMonths: number[];
    /** Datas sem acesso (feriados, encerramentos), no formato AAAA-MM-DD. */
    blockedDates: string[];
    /** Minutos de aviso antes de terminar a sessão. */
    warnMinutes: number;
    userModes: Record<string, UserAccessMode>;
};

/** allowed: pode usar agora (até endsAt; null = sem fim). Sem acesso: reason e nextAccessAt (null = só o administrador). */
export type AccessDecision = { allowed: boolean; exempt: boolean; endsAt: Date | null; reason: string; nextAccessAt: Date | null };

const granted = (exempt: boolean, endsAt: Date | null): AccessDecision => ({ allowed: true, exempt, endsAt, reason: '', nextAccessAt: null });
const denied = (reason: string, nextAccessAt: Date | null): AccessDecision => ({ allowed: false, exempt: false, endsAt: null, reason, nextAccessAt });

export const WEEKDAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const ALL_MONTHS = Array.from({ length: 12 }, (_, month) => month);
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_ACCESS_SCHEDULE: AccessSchedule = {
    enabled: false,
    days: WEEKDAY_NAMES.map((_, day) => ({ allowed: day >= 1 && day <= 5, start: '08:00', end: '15:00' })),
    allowedMonths: ALL_MONTHS,
    blockedDates: [],
    warnMinutes: 10,
    userModes: {},
};

const minutesOf = (time: string) => {
    const match = TIME_PATTERN.exec(time);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const atTime = (date: Date, time: string) => {
    const minutes = minutesOf(time) ?? 0;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
};

export const dateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Lê regras gravadas (texto JSON ou objecto), corrigindo valores em falta ou inválidos. */
export function normalizeAccessSchedule(raw: unknown): AccessSchedule {
    let value: unknown = raw;
    if (typeof raw === 'string') {
        try { value = JSON.parse(raw); } catch { value = null; }
    }
    const input = (value && typeof value === 'object' ? value : {}) as Partial<AccessSchedule>;
    const days = DEFAULT_ACCESS_SCHEDULE.days.map((fallback, index) => {
        const day = Array.isArray(input.days) ? input.days[index] : undefined;
        return {
            allowed: typeof day?.allowed === 'boolean' ? day.allowed : fallback.allowed,
            start: typeof day?.start === 'string' && TIME_PATTERN.test(day.start) ? day.start : fallback.start,
            end: typeof day?.end === 'string' && TIME_PATTERN.test(day.end) ? day.end : fallback.end,
        };
    });
    const months = Array.isArray(input.allowedMonths)
        ? [...new Set(input.allowedMonths.filter(month => Number.isInteger(month) && month >= 0 && month <= 11))].sort((a, b) => a - b)
        : ALL_MONTHS;
    const userModes: Record<string, UserAccessMode> = {};
    if (input.userModes && typeof input.userModes === 'object') {
        for (const [userId, mode] of Object.entries(input.userModes)) {
            if (mode === 'always' || mode === 'blocked') userModes[userId] = mode;
        }
    }
    const warn = Number(input.warnMinutes);
    return {
        enabled: input.enabled === true,
        days,
        allowedMonths: months,
        blockedDates: Array.isArray(input.blockedDates)
            ? [...new Set(input.blockedDates.filter(date => typeof date === 'string' && DATE_PATTERN.test(date)))].sort()
            : [],
        warnMinutes: Number.isFinite(warn) ? Math.min(120, Math.max(1, Math.round(warn))) : DEFAULT_ACCESS_SCHEDULE.warnMinutes,
        userModes,
    };
}

/** Mensagem de erro, ou null se as regras forem válidas. */
export function validateAccessSchedule(schedule: AccessSchedule): string | null {
    for (const [index, day] of schedule.days.entries()) {
        if (!day.allowed) continue;
        const start = minutesOf(day.start);
        const end = minutesOf(day.end);
        if (start === null || end === null) return `${WEEKDAY_NAMES[index]}: indique as horas no formato HH:MM.`;
        if (end <= start) return `${WEEKDAY_NAMES[index]}: a hora de fim tem de ser depois da hora de início.`;
    }
    if (schedule.enabled && !schedule.days.some(day => day.allowed)) return 'Escolha pelo menos um dia da semana com acesso.';
    if (schedule.enabled && schedule.allowedMonths.length === 0) return 'Escolha pelo menos um mês com acesso.';
    return null;
}

const isOpenDay = (schedule: AccessSchedule, date: Date) =>
    schedule.days[date.getDay()].allowed
    && schedule.allowedMonths.includes(date.getMonth())
    && !schedule.blockedDates.includes(dateKey(date));

/** Próximo momento em que o acesso abre (ou `from`, se já estiver aberto). Procura até um ano. */
export function nextOpening(schedule: AccessSchedule, from: Date): Date | null {
    for (let offset = 0; offset <= 370; offset++) {
        const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
        if (!isOpenDay(schedule, day)) continue;
        const rule = schedule.days[day.getDay()];
        const start = atTime(day, rule.start);
        const end = atTime(day, rule.end);
        if (offset === 0) {
            if (from < start) return start;
            if (from < end) return from;
            continue;
        }
        return start;
    }
    return null;
}

/** Decide se o utilizador pode usar o sistema neste momento e, se pode, até quando. */
export function evaluateAccess(schedule: AccessSchedule, user: { id: string; role?: string }, now: Date = new Date()): AccessDecision {
    if (!schedule.enabled || user.role === 'super_admin') return granted(true, null);
    const mode = schedule.userModes[user.id] || 'schedule';
    if (mode === 'always') return granted(true, null);
    if (mode === 'blocked') return denied('O seu acesso ao sistema foi bloqueado pelo administrador.', null);

    const rule = schedule.days[now.getDay()];
    const start = atTime(now, rule.start);
    const end = atTime(now, rule.end);
    if (isOpenDay(schedule, now) && now >= start && now < end) return granted(false, end);

    let reason: string;
    if (schedule.blockedDates.includes(dateKey(now))) reason = `Hoje (${now.toLocaleDateString('pt-AO')}) é um dia sem acesso ao sistema.`;
    else if (!schedule.allowedMonths.includes(now.getMonth())) reason = `O acesso ao sistema está fechado em ${MONTH_NAMES[now.getMonth()]}.`;
    else if (!rule.allowed) reason = `Não há acesso ao sistema à ${WEEKDAY_NAMES[now.getDay()].toLowerCase()}.`.replace('à domingo', 'ao domingo').replace('à sábado', 'ao sábado');
    else if (now < start) reason = `O acesso hoje só começa às ${rule.start}.`;
    else reason = `O horário de acesso de hoje terminou às ${rule.end}.`;
    return denied(reason, nextOpening(schedule, now));
}

/** "hoje às 08:00", "amanhã às 08:00" ou "segunda-feira, 06/10 às 08:00". */
export function formatAccessMoment(date: Date, now: Date = new Date()): string {
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const days = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
        - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
    if (days === 0) return `hoje às ${time}`;
    if (days === 1) return `amanhã às ${time}`;
    const day = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    return `${WEEKDAY_NAMES[date.getDay()].toLowerCase()}, ${day} às ${time}`;
}

/** Texto completo para o utilizador sem acesso: motivo e quando pode voltar. */
export function describeDenial(decision: { reason: string; nextAccessAt: Date | null }, now: Date = new Date()): string {
    return decision.nextAccessAt
        ? `${decision.reason} Pode voltar a entrar ${formatAccessMoment(decision.nextAccessAt, now)}.`
        : `${decision.reason} Contacte o administrador.`;
}
