export type AmortizationMethod = 'PRICE' | 'SAC' | 'FLAT';

export type InstallmentScheduleItem = {
    number: number;
    dueDate: string;
    principalMinor: number;
    interestMinor: number;
    totalMinor: number;
};

type ScheduleInput = {
    principalMinor: number;
    installments: number;
    startDate: Date | string;
    method: AmortizationMethod;
    annualRatePercent?: number;
    flatInterestMinor?: number;
    /** Datas de vencimento já calculadas (as da simulação: dia escolhido, dias úteis, 1.ª prestação adiada). */
    dueDates?: string[];
};

const assertIntegerMoney = (value: number, label: string) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} deve ser um inteiro não negativo.`);
};

const addUtcMonths = (date: Date, months: number) => {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + months;
    const day = date.getUTCDate();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
};

const distribute = (total: number, count: number) => {
    const base = Math.floor(total / count);
    const remainder = total - base * count;
    return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
};

export function buildInstallmentSchedule(input: ScheduleInput): InstallmentScheduleItem[] {
    assertIntegerMoney(input.principalMinor, 'Capital');
    if (!Number.isSafeInteger(input.installments) || input.installments <= 0 || input.installments > 600) {
        throw new Error('Número de prestações inválido.');
    }
    const startDate = new Date(input.startDate);
    if (Number.isNaN(startDate.getTime())) throw new Error('Data inicial inválida.');
    const dueDates = input.dueDates?.length ? input.dueDates.map(value => new Date(value)) : null;
    if (dueDates && (dueDates.length !== input.installments || dueDates.some(date => Number.isNaN(date.getTime()))
        || dueDates.some((date, index) => date.getTime() <= (index ? dueDates[index - 1] : startDate).getTime()))) {
        throw new Error('As datas de vencimento das prestações não são válidas.');
    }

    let principalParts: number[] = [];
    let interestParts: number[] = [];
    if (input.method === 'FLAT') {
        const interest = input.flatInterestMinor || 0;
        assertIntegerMoney(interest, 'Juro total');
        principalParts = distribute(input.principalMinor, input.installments);
        interestParts = distribute(interest, input.installments);
    } else if (input.method === 'SAC') {
        const monthlyRate = Math.max(0, Number(input.annualRatePercent || 0)) / 1200;
        principalParts = distribute(input.principalMinor, input.installments);
        let outstanding = input.principalMinor;
        interestParts = principalParts.map(principal => {
            const interest = Math.round(outstanding * monthlyRate);
            outstanding -= principal;
            return interest;
        });
    } else {
        const monthlyRate = Math.max(0, Number(input.annualRatePercent || 0)) / 1200;
        if (monthlyRate === 0) {
            principalParts = distribute(input.principalMinor, input.installments);
            interestParts = Array(input.installments).fill(0);
        } else {
            const payment = Math.round(input.principalMinor * monthlyRate / (1 - Math.pow(1 + monthlyRate, -input.installments)));
            let outstanding = input.principalMinor;
            for (let index = 0; index < input.installments; index++) {
                const interest = Math.round(outstanding * monthlyRate);
                const principal = index === input.installments - 1 ? outstanding : Math.min(outstanding, payment - interest);
                principalParts.push(principal);
                interestParts.push(interest);
                outstanding -= principal;
            }
        }
    }

    return principalParts.map((principalMinor, index) => {
        const interestMinor = interestParts[index];
        return {
            number: index + 1,
            dueDate: (dueDates ? dueDates[index] : addUtcMonths(startDate, index + 1)).toISOString(),
            principalMinor,
            interestMinor,
            totalMinor: principalMinor + interestMinor
        };
    });
}
