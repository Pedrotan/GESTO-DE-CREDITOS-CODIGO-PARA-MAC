export function reinforcementInterest(amount: number, rate: number, method: string = 'FLAT'): number {
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate < 0) throw new Error('Valor ou taxa do reforço inválidos.');
    // FLAT: taxa total contratada; PRICE/SAC: TAN convertida para um mês.
    return Math.round(amount * 100 * rate / 100 / (method === 'FLAT' ? 1 : 12)) / 100;
}
export function selectReinforcementInstallment<T extends { id: string; dueDate: string; status: string }>(schedule: T[], id: string) {
    const item = schedule.find(row => row.id === id && row.status !== 'paid');
    if (!item) throw new Error('Selecione uma prestação aberta e o mês em que será cobrado o reforço.');
    return item;
}
