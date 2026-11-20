// Juros de mora segundo a prática bancária: juro diário sobre o valor em atraso de cada prestação, desde o
// primeiro dia de atraso (o dia seguinte ao vencimento) até ao dia do pagamento efectivo. Pagamentos parciais
// reduzem a base a partir do dia em que entram; com a prestação paga, a mora deixa de contar.
// Todos os montantes em unidades mínimas (cêntimos).

export type MoraInstallment = {
    id: string;
    number: number;
    dueDate: string;
    principalMinor: number;
    interestMinor: number;
};

export type MoraPayment = {
    date: string | Date;
    /** Parte do pagamento aplicada a capital e juros (a que reduz o valor em atraso das prestações). */
    principalMinor: number;
    interestMinor: number;
    /** Parte do pagamento aplicada a juros de mora. */
    lateMinor?: number;
};

export type InstallmentLateInterest = {
    id: string;
    number: number;
    dueDate: string;
    /** Dias de atraso até à data de referência (ou até ao pagamento total, se já paga). */
    daysLate: number;
    /** Valor da prestação (capital + juros) ainda em dívida na data de referência. */
    outstandingMinor: number;
    /** Mora acumulada desde o primeiro dia de atraso até à data de referência, sem a perdoada ou renegociada. */
    accruedMinor: number;
    /** Mora que esta prestação gera por cada dia adicional de atraso. */
    dailyMinor: number;
    /** Parte da mora já paga pelo cliente. */
    paidLateMinor: number;
    /** Mora retirada por perdão ou renegociação. */
    waivedMinor: number;
    /** Mora ainda por pagar. */
    owedMinor: number;
};

export type LateInterestSummary = {
    asOf: string;
    dailyRatePercent: number;
    installments: InstallmentLateInterest[];
    accruedMinor: number;
    paidLateMinor: number;
    waivedMinor: number;
    owedMinor: number;
    dailyMinor: number;
    overdueMinor: number;
};

/** Mora retirada (perdão ou renegociação) numa data. A prestação em atraso continua a gerar mora a partir daí. */
export type MoraWaiver = { date: string | Date; amountMinor: number };

const DAY_MS = 86_400_000;

/** Número do dia civil (data local), para contar dias sem efeitos de hora ou fuso horário. */
export const dayNumber = (value: string | Date): number => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('Data inválida no cálculo de juros de mora.');
    return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
};

const safe = (value: number) => (Number.isFinite(value) && value > 0 ? Math.round(value) : 0);

/**
 * Calcula a mora de cada prestação até `asOf`. Os pagamentos são aplicados às prestações por ordem de
 * vencimento (a mais antiga primeiro), tal como na conciliação das prestações.
 */
export function calculateLateInterest(input: {
    installments: MoraInstallment[];
    payments: MoraPayment[];
    dailyRatePercent: number;
    asOf?: string | Date;
    /** Perdões e renegociações já decididos: o recálculo nunca volta a lançar esta mora. */
    waivers?: MoraWaiver[];
}): LateInterestSummary {
    const rate = Number.isFinite(input.dailyRatePercent) && input.dailyRatePercent > 0 ? input.dailyRatePercent / 100 : 0;
    const asOfDate = input.asOf ? new Date(input.asOf) : new Date();
    const asOfDay = dayNumber(asOfDate);
    const schedule = [...input.installments].sort((a, b) => dayNumber(a.dueDate) - dayNumber(b.dueDate) || a.number - b.number);
    const remaining = schedule.map(item => safe(item.principalMinor) + safe(item.interestMinor));
    const accrued = schedule.map(() => 0);
    const cursor = schedule.map(item => dayNumber(item.dueDate));
    const paidOffDay: Array<number | null> = schedule.map(() => null);

    // Acumula a mora de cada prestação até ao dia `day`, com o valor em dívida antes desse dia.
    const accrueUntil = (index: number, day: number) => {
        if (day <= cursor[index]) return;
        if (remaining[index] > 0) accrued[index] += remaining[index] * rate * (day - cursor[index]);
        cursor[index] = day;
    };

    const payments = input.payments
        .map(payment => ({ day: dayNumber(payment.date), amount: safe(payment.principalMinor) + safe(payment.interestMinor) }))
        .filter(payment => payment.day <= asOfDay)
        .sort((a, b) => a.day - b.day);

    for (const payment of payments) {
        let amount = payment.amount;
        for (let index = 0; index < schedule.length && amount > 0; index++) {
            if (remaining[index] <= 0) continue;
            // O dia do pagamento ainda conta como dia de atraso com o valor anterior (pago a 27, vencida a 26: 1 dia).
            accrueUntil(index, payment.day);
            const applied = Math.min(amount, remaining[index]);
            remaining[index] -= applied;
            amount -= applied;
            if (remaining[index] === 0) paidOffDay[index] = payment.day;
        }
    }
    schedule.forEach((_, index) => accrueUntil(index, asOfDay));

    // Mora já paga: distribuída pelas prestações mais antigas primeiro.
    let paidLate = input.payments.reduce((sum, payment) => sum + (dayNumber(payment.date) <= asOfDay ? safe(payment.lateMinor || 0) : 0), 0);
    // Mora perdoada ou renegociada: sai do que ainda não foi pago, também das prestações mais antigas primeiro.
    let waived = (input.waivers || []).reduce((sum, waiver) => sum + (dayNumber(waiver.date) <= asOfDay ? safe(waiver.amountMinor) : 0), 0);
    const installments = schedule.map((item, index) => {
        const grossMinor = Math.round(accrued[index]);
        const paidLateMinor = Math.min(paidLate, grossMinor);
        paidLate -= paidLateMinor;
        const waivedMinor = Math.min(waived, grossMinor - paidLateMinor);
        waived -= waivedMinor;
        const accruedMinor = grossMinor - waivedMinor;
        const due = dayNumber(item.dueDate);
        const endDay = remaining[index] > 0 ? asOfDay : (paidOffDay[index] ?? due);
        return {
            id: item.id,
            number: item.number,
            dueDate: item.dueDate,
            daysLate: Math.max(0, endDay - due),
            outstandingMinor: remaining[index],
            accruedMinor,
            dailyMinor: asOfDay >= due ? Math.round(remaining[index] * rate) : 0,
            paidLateMinor,
            waivedMinor,
            owedMinor: accruedMinor - paidLateMinor,
        };
    });

    const total = (key: keyof Pick<InstallmentLateInterest, 'accruedMinor' | 'paidLateMinor' | 'waivedMinor' | 'owedMinor' | 'dailyMinor'>) =>
        installments.reduce((sum, item) => sum + item[key], 0);
    return {
        asOf: asOfDate.toISOString(),
        dailyRatePercent: rate * 100,
        installments,
        accruedMinor: total('accruedMinor'),
        paidLateMinor: total('paidLateMinor'),
        waivedMinor: total('waivedMinor'),
        owedMinor: total('owedMinor'),
        dailyMinor: total('dailyMinor'),
        overdueMinor: installments.filter(item => dayNumber(item.dueDate) < asOfDay).reduce((sum, item) => sum + item.outstandingMinor, 0),
    };
}

/**
 * Renegociação da mora: divide o valor acordado em prestações mensais iguais (a última leva o resto dos arredondamentos),
 * no mesmo dia de cada mês; num mês mais curto, no último dia.
 */
export function buildMoraPlan(agreedMinor: number, count: number, firstDueKey: string): Array<{ dueDateKey: string; amountMinor: number }> {
    if (!Number.isSafeInteger(agreedMinor) || agreedMinor <= 0) throw new Error('Indique o valor acordado da mora.');
    if (!Number.isInteger(count) || count < 1 || count > 24) throw new Error('A renegociação da mora vai de 1 a 24 prestações.');
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(firstDueKey);
    if (!match) throw new Error('Indique a data da primeira prestação.');
    const [year, month, day] = match.slice(1).map(Number);
    const share = Math.floor(agreedMinor / count);
    return Array.from({ length: count }, (_, index) => {
        const lastDay = new Date(Date.UTC(year, month - 1 + index + 1, 0)).getUTCDate();
        const date = new Date(Date.UTC(year, month - 1 + index, Math.min(day, lastDay)));
        return { dueDateKey: date.toISOString().slice(0, 10), amountMinor: index === count - 1 ? agreedMinor - share * (count - 1) : share };
    });
}

/** Projecção da mora se o atraso continuar mais `days` dias sem pagamentos. */
export function projectLateInterest(summary: LateInterestSummary, days: number) {
    const extraDays = Math.max(0, Math.floor(days));
    const asOfDay = dayNumber(summary.asOf);
    const installments = summary.installments.map(item => {
        // Prestações ainda não vencidas só começam a gerar mora no dia seguinte ao vencimento.
        const daysOverdueInWindow = Math.max(0, Math.min(extraDays, asOfDay + extraDays - Math.max(asOfDay, dayNumber(item.dueDate))));
        const rate = summary.dailyRatePercent / 100;
        const additionalMinor = Math.round(item.outstandingMinor * rate * daysOverdueInWindow);
        return { id: item.id, number: item.number, additionalMinor, projectedOwedMinor: item.owedMinor + additionalMinor };
    });
    const additionalMinor = installments.reduce((sum, item) => sum + item.additionalMinor, 0);
    return { days: extraDays, installments, additionalMinor, projectedOwedMinor: summary.owedMinor + additionalMinor };
}
