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
    /** Mora acumulada desde o primeiro dia de atraso até à data de referência. */
    accruedMinor: number;
    /** Mora que esta prestação gera por cada dia adicional de atraso. */
    dailyMinor: number;
    /** Parte da mora já paga pelo cliente. */
    paidLateMinor: number;
    /** Mora ainda por pagar. */
    owedMinor: number;
};

export type LateInterestSummary = {
    asOf: string;
    dailyRatePercent: number;
    installments: InstallmentLateInterest[];
    accruedMinor: number;
    paidLateMinor: number;
    owedMinor: number;
    dailyMinor: number;
    overdueMinor: number;
};

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
    const installments = schedule.map((item, index) => {
        const accruedMinor = Math.round(accrued[index]);
        const paidLateMinor = Math.min(paidLate, accruedMinor);
        paidLate -= paidLateMinor;
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
            owedMinor: accruedMinor - paidLateMinor,
        };
    });

    const total = (key: keyof Pick<InstallmentLateInterest, 'accruedMinor' | 'paidLateMinor' | 'owedMinor' | 'dailyMinor'>) =>
        installments.reduce((sum, item) => sum + item[key], 0);
    return {
        asOf: asOfDate.toISOString(),
        dailyRatePercent: rate * 100,
        installments,
        accruedMinor: total('accruedMinor'),
        paidLateMinor: total('paidLateMinor'),
        owedMinor: total('owedMinor'),
        dailyMinor: total('dailyMinor'),
        overdueMinor: installments.filter(item => dayNumber(item.dueDate) < asOfDay).reduce((sum, item) => sum + item.outstandingMinor, 0),
    };
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
