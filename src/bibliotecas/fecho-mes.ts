// Regras do fecho do mês obrigatório. O identificador do mês segue a tabela closed_months: "AAAA-MM".

export type MonthClosureState =
    | { kind: 'none' }
    /** Último dia do mês: lembrar de fechar antes de terminar o dia. */
    | { kind: 'due-today'; monthId: string }
    /** Mês(es) anteriores por fechar: o fecho é obrigatório. */
    | { kind: 'overdue'; monthId: string; pendingMonthIds: string[] };

export const monthIdOf = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const parseMonthId = (monthId: string) => {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthId);
    if (!match) return null;
    return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 };
};

export const isLastDayOfMonth = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getDate() === 1;

const previousMonthId = (monthId: string) => {
    const parsed = parseMonthId(monthId)!;
    return monthIdOf(new Date(parsed.year, parsed.monthIndex - 1, 1));
};

export const monthLabel = (monthId: string) => {
    const parsed = parseMonthId(monthId);
    if (!parsed) return monthId;
    const text = new Date(parsed.year, parsed.monthIndex, 1).toLocaleDateString('pt-AO', { month: 'long', year: 'numeric' });
    return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Estado do fecho do mês para a data indicada.
 * `enforcedSince` é o primeiro mês em que o fecho passou a ser obrigatório (meses anteriores não são exigidos).
 */
export const monthClosureState = (today: Date, closedMonthIds: Iterable<string>, enforcedSince: string): MonthClosureState => {
    const closed = new Set(closedMonthIds);
    const current = monthIdOf(today);
    const pending: string[] = [];
    if (parseMonthId(enforcedSince)) {
        // Do mês anterior para trás, até ao mês em que a regra começou.
        for (let month = previousMonthId(current); month >= enforcedSince && pending.length < 24; month = previousMonthId(month)) {
            if (!closed.has(month)) pending.unshift(month);
        }
    }
    if (pending.length) return { kind: 'overdue', monthId: pending[0], pendingMonthIds: pending };
    if (isLastDayOfMonth(today) && !closed.has(current)) return { kind: 'due-today', monthId: current };
    return { kind: 'none' };
};

/** Página que abre o fecho do mês indicado. */
export const closeMonthPath = (monthId: string) => `/creditos?fecharMes=${monthId}`;
