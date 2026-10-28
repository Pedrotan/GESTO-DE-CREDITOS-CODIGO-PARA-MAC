import { CLIENT_STATUS_LABELS, clientDisplayStatus, type ClientDisplayStatus } from './estado-cliente.ts';
import { clienteComBI, estadoBI, ROTULO_ESTADO_BI, type EstadoBI } from './rh/bi-validade.ts';
import type { Cell, ReportDef, Section } from './relatorios-pagamentos.ts';

// Relatórios da página de Clientes: lista completa (todos os dados, PDF em paisagem ou Excel) e relatório com
// filtros (estado, risco, tipo, morada, validade do BI, crédito, rendimento, data de cadastro).

type ClientLike = {
    id: string; name?: string; nif?: string; phone?: string; email?: string; address?: string; status?: string;
    clientType?: string; clientCategory?: string; documentType?: string; nationality?: string; gender?: string; maritalStatus?: string;
    birthDate?: string; age?: number; expiryDate?: string; birthPlace?: string; province?: string; municipality?: string;
    neighborhood?: string; zone?: string; monthlyIncome?: number; creditLimit?: number; usedCredit?: number; availableCredit?: number;
    defaultInterestRate?: number; riskLevel?: string; createdAt?: unknown; workInstitution?: string;
    spouseName?: string; spouseBi?: string; spouseNif?: string; spousePhone?: string; spouseOccupation?: string; spouseIncome?: number;
};
type CreditLike = { clientId: string; status: string; deletedAt?: unknown; currentBalance?: number };

export type CreditFilter = 'all' | 'em_curso' | 'em_atraso' | 'sem_credito';
export type ClientReportFilters = {
    search: string;
    status: 'all' | ClientDisplayStatus;
    risk: 'all' | 'low' | 'medium' | 'high';
    clientType: 'all' | 'PARTICULAR' | 'EMPRESA';
    gender: string;
    province: string;
    municipality: string;
    bi: 'all' | 'contactar' | EstadoBI;
    credit: CreditFilter;
    createdFrom: string;
    createdTo: string;
    incomeMin: string;
    incomeMax: string;
};
export const EMPTY_CLIENT_FILTERS: ClientReportFilters = {
    search: '', status: 'all', risk: 'all', clientType: 'all', gender: 'all', province: 'all', municipality: 'all', bi: 'all',
    credit: 'all', createdFrom: '', createdTo: '', incomeMin: '', incomeMax: '',
};

export const RISK_LABELS: Record<string, string> = { low: 'Baixo', medium: 'Médio', high: 'Alto' };
export const CREDIT_FILTER_LABELS: Record<CreditFilter, string> = {
    all: 'Todos', em_curso: 'Com crédito em curso', em_atraso: 'Com crédito em atraso', sem_credito: 'Sem crédito em curso',
};
const CREDIT_IN_PROGRESS = new Set(['active', 'overdue', 'defaulted', 'renegotiated']);
const CREDIT_LATE = new Set(['overdue', 'defaulted']);

const dateKey = (value: unknown) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
};
const showDate = (value: unknown) => {
    const key = dateKey(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}` : '';
};
const text = (value: unknown) => (value === undefined || value === null ? '' : String(value).trim());
const amount = (value: unknown) => Number(value) || 0;

/** Valores distintos de um campo, ordenados (para as listas de escolha do filtro). */
export const distinctValues = (clients: ClientLike[], field: 'province' | 'municipality' | 'gender', province?: string) =>
    [...new Set(clients.filter(client => field !== 'municipality' || !province || province === 'all' || client.province === province)
        .map(client => text(client[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));

export type ClientReportRow = {
    client: ClientLike; status: ClientDisplayStatus; bi: EstadoBI | null; inProgress: number; late: number; outstanding: number;
};

export const buildClientRows = (clients: ClientLike[], credits: CreditLike[], today: string, biWarningDays: number): ClientReportRow[] =>
    clients.map(client => {
        const own = credits.filter(credit => credit.clientId === client.id && !credit.deletedAt);
        const running = own.filter(credit => CREDIT_IN_PROGRESS.has(credit.status));
        return {
            client,
            status: clientDisplayStatus(client, credits),
            bi: clienteComBI(client) ? estadoBI(client.expiryDate, today, biWarningDays).estado : null,
            inProgress: running.length,
            late: own.filter(credit => CREDIT_LATE.has(credit.status)).length,
            outstanding: running.reduce((total, credit) => total + amount(credit.currentBalance), 0),
        };
    });

export const filterClientRows = (rows: ClientReportRow[], filters: ClientReportFilters) => {
    const needle = filters.search.trim().toLocaleLowerCase('pt');
    const min = filters.incomeMin.trim() ? Number(filters.incomeMin) : null;
    const max = filters.incomeMax.trim() ? Number(filters.incomeMax) : null;
    return rows.filter(({ client, status, bi, inProgress, late }) => {
        if (needle && ![client.name, client.nif, client.phone, client.email].some(value => text(value).toLocaleLowerCase('pt').includes(needle))) return false;
        if (filters.status !== 'all' && status !== filters.status) return false;
        if (filters.risk !== 'all' && client.riskLevel !== filters.risk) return false;
        if (filters.clientType !== 'all' && (client.clientType || 'PARTICULAR') !== filters.clientType) return false;
        if (filters.gender !== 'all' && text(client.gender) !== filters.gender) return false;
        if (filters.province !== 'all' && text(client.province) !== filters.province) return false;
        if (filters.municipality !== 'all' && text(client.municipality) !== filters.municipality) return false;
        if (filters.bi === 'contactar' && bi !== 'expirado' && bi !== 'a_expirar') return false;
        if (filters.bi !== 'all' && filters.bi !== 'contactar' && bi !== filters.bi) return false;
        if (filters.credit === 'em_curso' && inProgress === 0) return false;
        if (filters.credit === 'em_atraso' && late === 0) return false;
        if (filters.credit === 'sem_credito' && inProgress > 0) return false;
        const created = dateKey(client.createdAt);
        if (filters.createdFrom && (!created || created < filters.createdFrom)) return false;
        if (filters.createdTo && (!created || created > filters.createdTo)) return false;
        if (min !== null && Number.isFinite(min) && amount(client.monthlyIncome) < min) return false;
        if (max !== null && Number.isFinite(max) && amount(client.monthlyIncome) > max) return false;
        return true;
    });
};

/** Filtros escolhidos, em texto, para o subtítulo do relatório. */
export const describeFilters = (filters: ClientReportFilters) => {
    const parts: string[] = [];
    if (filters.search.trim()) parts.push(`pesquisa «${filters.search.trim()}»`);
    if (filters.status !== 'all') parts.push(`estado ${CLIENT_STATUS_LABELS[filters.status]}`);
    if (filters.risk !== 'all') parts.push(`risco ${RISK_LABELS[filters.risk]}`);
    if (filters.clientType !== 'all') parts.push(filters.clientType === 'EMPRESA' ? 'empresas' : 'particulares');
    if (filters.gender !== 'all') parts.push(`género ${filters.gender}`);
    if (filters.province !== 'all') parts.push(`província ${filters.province}`);
    if (filters.municipality !== 'all') parts.push(`município ${filters.municipality}`);
    if (filters.bi === 'contactar') parts.push('BI expirado ou a expirar');
    else if (filters.bi !== 'all') parts.push(`BI ${ROTULO_ESTADO_BI[filters.bi].toLowerCase()}`);
    if (filters.credit !== 'all') parts.push(CREDIT_FILTER_LABELS[filters.credit].toLowerCase());
    if (filters.createdFrom || filters.createdTo) parts.push(`cadastro ${filters.createdFrom ? `de ${showDate(filters.createdFrom)}` : ''}${filters.createdTo ? ` até ${showDate(filters.createdTo)}` : ''}`.trim());
    if (filters.incomeMin.trim() || filters.incomeMax.trim()) parts.push(`rendimento ${filters.incomeMin.trim() ? `≥ ${filters.incomeMin.trim()}` : ''}${filters.incomeMax.trim() ? ` ≤ ${filters.incomeMax.trim()}` : ''} Kz`.trim());
    return parts.length ? parts.join(' · ') : 'sem filtros (todos os clientes)';
};

/** Relatório em paisagem com todos os dados de cada cliente, em secções legíveis. */
export const buildClientsReport = (rows: ClientReportRow[], options: { title: string; categoryLabel: string; filters?: ClientReportFilters }): ReportDef => {
    const ordered = [...rows].sort((a, b) => text(a.client.name).localeCompare(text(b.client.name), 'pt'));
    const n = (index: number) => index + 1;
    const identification: Section = {
        heading: 'Identificação e contactos',
        head: ['N.º', 'Nome', 'Tipo', 'BI/NIF', 'Validade BI', 'Situação BI', 'Género', 'Nascimento', 'Idade', 'Estado civil', 'Telefone', 'Email', 'Estado'],
        rows: ordered.map(({ client, status, bi }, index): Cell[] => [
            n(index), text(client.name), client.clientType === 'EMPRESA' ? 'Empresa' : 'Particular', text(client.nif), showDate(client.expiryDate),
            bi ? ROTULO_ESTADO_BI[bi] : '—', text(client.gender), showDate(client.birthDate), client.age ?? '', text(client.maritalStatus),
            text(client.phone), text(client.email), CLIENT_STATUS_LABELS[status],
        ]),
        widths: { 0: 8, 1: 38 },
        emptyText: 'Nenhum cliente corresponde aos filtros.',
    };
    const address: Section = {
        heading: 'Naturalidade e morada',
        head: ['N.º', 'Nome', 'Naturalidade', 'Nacionalidade', 'Província', 'Município', 'Bairro', 'Zona', 'Morada'],
        rows: ordered.map(({ client }, index): Cell[] => [
            n(index), text(client.name), text(client.birthPlace), text(client.nationality), text(client.province), text(client.municipality),
            text(client.neighborhood), text(client.zone), text(client.address),
        ]),
        widths: { 0: 8, 1: 40, 8: 60 },
    };
    const financial: Section = {
        heading: 'Situação financeira',
        head: ['N.º', 'Nome', 'Instituição / emprego', 'Rendimento', 'Limite', 'Usado', 'Disponível', 'Taxa (%)', 'Risco', 'Créditos em curso', 'Em atraso', 'Em dívida', 'Cadastro'],
        rows: ordered.map(({ client, inProgress, late, outstanding }, index): Cell[] => [
            n(index), text(client.name), text(client.workInstitution), amount(client.monthlyIncome), amount(client.creditLimit), amount(client.usedCredit),
            amount(client.availableCredit), amount(client.defaultInterestRate), RISK_LABELS[text(client.riskLevel)] || '—', inProgress, late, outstanding, showDate(client.createdAt),
        ]),
        money: [3, 4, 5, 6, 11],
        numeric: [7, 9, 10],
        widths: { 0: 8, 1: 36 },
        foot: [['', 'Total', '', ordered.reduce((t, r) => t + amount(r.client.monthlyIncome), 0), ordered.reduce((t, r) => t + amount(r.client.creditLimit), 0),
            ordered.reduce((t, r) => t + amount(r.client.usedCredit), 0), ordered.reduce((t, r) => t + amount(r.client.availableCredit), 0), '', '',
            ordered.reduce((t, r) => t + r.inProgress, 0), ordered.reduce((t, r) => t + r.late, 0), ordered.reduce((t, r) => t + r.outstanding, 0), '']],
    };
    const withSpouse = ordered.map((row, index) => ({ row, index })).filter(({ row }) => text(row.client.spouseName));
    const spouse: Section = {
        heading: 'Cônjuges',
        head: ['N.º', 'Cliente', 'Cônjuge', 'BI', 'NIF', 'Telefone', 'Profissão', 'Rendimento'],
        rows: withSpouse.map(({ row: { client }, index }): Cell[] => [
            n(index), text(client.name), text(client.spouseName), text(client.spouseBi), text(client.spouseNif), text(client.spousePhone),
            text(client.spouseOccupation), amount(client.spouseIncome),
        ]),
        money: [7],
        widths: { 0: 8 },
    };
    const count = (status: ClientDisplayStatus) => ordered.filter(row => row.status === status).length;
    return {
        key: 'clientes',
        title: options.title,
        subtitle: `${options.categoryLabel} · ${options.filters ? `Filtros: ${describeFilters(options.filters)}` : 'Lista completa'} · ${ordered.length} cliente(s)`,
        orientation: 'landscape',
        fileBase: options.filters ? 'clientes-filtrados' : 'clientes-lista-completa',
        tagline: 'RELATÓRIOS DE CLIENTES',
        summary: [
            ['Clientes', String(ordered.length)],
            ['Activos', String(count('active'))],
            ['Inactivos', String(count('inactive'))],
            ['Sem crédito activo', String(count('no_active_credit'))],
            ['Bloqueados', String(count('blocked'))],
            ['Com crédito em atraso', String(ordered.filter(row => row.late > 0).length)],
        ],
        sections: withSpouse.length ? [identification, address, financial, spouse] : [identification, address, financial],
    };
};
