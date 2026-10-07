// Importação de créditos (Parte J): validação linha a linha antes de gravar, com deteção de duplicados (no
// ficheiro e nos créditos existentes) e da regra de um crédito de cada vez por cliente. As colunas são as do
// modelo já existente, para os ficheiros antigos continuarem a funcionar.
import { clientCreditStanding, newCreditBlockReason, type CreditForRules } from '@/bibliotecas/regras-credito';

export const CREDIT_IMPORT_COLUMNS = ['NIF Cliente', 'Montante', 'Data Início (AAAA-MM-DD)', 'Prazo (Meses)', 'Taxa Juro (%)'] as const;

export type CreditImportRow = {
    line: number;
    status: 'ok' | 'error' | 'duplicate';
    errors: string[];
    clientId: string | null;
    clientName: string;
    nif: string;
    amount: number;
    months: number;
    rate: number;
    startKey: string;
};

const text = (value: unknown) => String(value ?? '').trim();
const amountOf = (value: unknown) => {
    if (typeof value === 'number') return value;
    const raw = text(value).replace(/\s|kz/gi, '');
    const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
    return Number(normalized);
};
const dateKeyOf = (value: unknown) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && value > 20000 && value < 80000) return new Date(Math.round((value - 25569) * 86_400_000)).toISOString().slice(0, 10);
    const raw = text(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
};

export function validateCreditImport(rows: Array<Record<string, unknown>>, context: {
    clients: Array<{ id: string; name: string; nif?: string | null; defaultInterestRate?: number }>;
    credits: Array<CreditForRules & { id: string }>;
}): CreditImportRow[] {
    const byNif = new Map(context.clients.filter(client => client.nif).map(client => [text(client.nif).toUpperCase(), client]));
    const seen = new Set<string>();
    const clientsInFile = new Set<string>();
    return rows.map((raw, index) => {
        const errors: string[] = [];
        const nif = text(raw['NIF Cliente']).toUpperCase();
        const client = byNif.get(nif);
        const amount = amountOf(raw['Montante']);
        const months = Number(raw['Prazo (Meses)'] || 1);
        const rateRaw = raw['Taxa Juro (%)'];
        const rate = rateRaw === undefined || rateRaw === '' ? Number(client?.defaultInterestRate || 0) : amountOf(rateRaw);
        const startKey = dateKeyOf(raw['Data Início (AAAA-MM-DD)']) || new Date().toISOString().slice(0, 10);
        if (!nif) errors.push('Falta o NIF do cliente.');
        else if (!client) errors.push(`Não existe nenhum cliente com o NIF ${nif}.`);
        if (!(amount > 0)) errors.push('O montante tem de ser maior que zero.');
        if (!Number.isInteger(months) || months < 1 || months > 600) errors.push('O prazo tem de ser um número inteiro de meses entre 1 e 600.');
        if (!(rate >= 0) || rate > 100) errors.push('A taxa de juro tem de estar entre 0 e 100%.');
        if (raw['Data Início (AAAA-MM-DD)'] !== undefined && raw['Data Início (AAAA-MM-DD)'] !== '' && !dateKeyOf(raw['Data Início (AAAA-MM-DD)'])) errors.push('Data de início inválida (use AAAA-MM-DD).');
        let status: CreditImportRow['status'] = errors.length ? 'error' : 'ok';
        if (client && status === 'ok') {
            const key = `${client.id}|${Math.round(amount * 100)}|${startKey}`;
            const existing = context.credits.some(credit => credit.clientId === client.id && !credit.deletedAt && !['rejected', 'cancelled'].includes(credit.status)
                && Math.round(Number(credit.principalAmount) * 100) === Math.round(amount * 100) && String(credit.startDate ? new Date(credit.startDate).toISOString().slice(0, 10) : '') === startKey);
            if (existing || seen.has(key)) { status = 'duplicate'; errors.push(existing ? 'Já existe um crédito igual (cliente, montante e data).' : 'Linha repetida no ficheiro.'); }
            seen.add(key);
            if (status === 'ok') {
                const blocked = newCreditBlockReason(clientCreditStanding(client.id, context.credits), value => `${value.toLocaleString('pt-AO')} Kz`);
                if (blocked) { status = 'error'; errors.push(blocked); }
                else if (clientsInFile.has(client.id)) { status = 'error'; errors.push('O ficheiro tem mais do que um crédito para este cliente: só é permitido um de cada vez.'); }
                clientsInFile.add(client.id);
            }
        }
        return { line: index + 2, status, errors, clientId: client?.id || null, clientName: client?.name || '—', nif, amount, months, rate, startKey };
    });
}
