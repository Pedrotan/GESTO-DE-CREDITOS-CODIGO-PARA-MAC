// Plano de contas do sistema: código, nome em português, classe e natureza de cada conta técnica usada
// no razão (ledger_lines.account). A natureza define o lado em que o saldo é normal: as contas de
// natureza devedora aumentam a débito (activo e custos) e as de natureza credora a crédito (passivo,
// capital próprio, proveitos e contas regularizadoras do activo, como as provisões).

export type AccountClass = 'activo' | 'passivo' | 'capital_proprio' | 'proveitos' | 'custos' | 'extrapatrimonial';
export type AccountNature = 'debit' | 'credit';

export type AccountDefinition = {
    account: string;
    code: string;
    name: string;
    accountClass: AccountClass;
    nature: AccountNature;
    description: string;
    /** Conta de disponibilidades (caixa e bancos). */
    liquid?: boolean;
};

export const ACCOUNT_CLASS_LABELS: Record<AccountClass, string> = {
    activo: 'Activo',
    passivo: 'Passivo',
    capital_proprio: 'Capital Próprio',
    proveitos: 'Proveitos',
    custos: 'Custos',
    extrapatrimonial: 'Contas Extrapatrimoniais',
};

export const CHART_OF_ACCOUNTS: AccountDefinition[] = [
    { account: 'cash', code: '11', name: 'Caixa', accountClass: 'activo', nature: 'debit', liquid: true, description: 'Numerário em caixa.' },
    { account: 'bank', code: '12', name: 'Bancos — Depósitos à Ordem', accountClass: 'activo', nature: 'debit', liquid: true, description: 'Saldos em contas bancárias (transferências e referências).' },
    { account: 'portfolio', code: '13', name: 'Carteira de Crédito (Capital em Dívida)', accountClass: 'activo', nature: 'debit', description: 'Capital concedido aos clientes e ainda por amortizar.' },
    { account: 'receivable_interest', code: '14.1', name: 'Juros a Receber', accountClass: 'activo', nature: 'debit', description: 'Juros reconhecidos e ainda não recebidos.' },
    { account: 'receivable_late_interest', code: '14.2', name: 'Juros de Mora a Receber', accountClass: 'activo', nature: 'debit', description: 'Juros de mora reconhecidos e ainda não recebidos.' },
    { account: 'provision', code: '19', name: 'Provisões para Crédito de Cobrança Duvidosa (PDD)', accountClass: 'activo', nature: 'credit', description: 'Conta regularizadora da carteira: perdas esperadas com crédito.' },
    { account: 'customer_advances', code: '21', name: 'Adiantamentos de Clientes', accountClass: 'passivo', nature: 'credit', description: 'Valores recebidos de clientes acima da dívida, a devolver ou imputar.' },
    { account: 'loans_payable', code: '23', name: 'Financiamentos Obtidos', accountClass: 'passivo', nature: 'credit', description: 'Empréstimos recebidos de bancos, sócios ou terceiros.' },
    { account: 'stamp_tax_payable', code: '24.1', name: 'Imposto do Selo a Pagar', accountClass: 'passivo', nature: 'credit', description: 'Imposto do Selo liquidado nas operações e ainda não entregue ao Estado.' },
    { account: 'capital', code: '51', name: 'Capital Social', accountClass: 'capital_proprio', nature: 'credit', description: 'Capital realizado pelos sócios.' },
    { account: 'equity', code: '52', name: 'Prestações Suplementares / Outros Capitais', accountClass: 'capital_proprio', nature: 'credit', description: 'Outras entradas de capital dos sócios.' },
    { account: 'legal_reserve', code: '55', name: 'Reserva Legal', accountClass: 'capital_proprio', nature: 'credit', description: 'Reserva constituída a partir dos resultados, nos termos da lei.' },
    { account: 'retained_earnings', code: '59', name: 'Resultados Transitados', accountClass: 'capital_proprio', nature: 'credit', description: 'Resultados de exercícios anteriores.' },
    { account: 'revenue_interest', code: '71', name: 'Receita de Juros', accountClass: 'proveitos', nature: 'credit', description: 'Juros remuneratórios recebidos ou reconhecidos.' },
    { account: 'revenue_late_interest', code: '72', name: 'Receita de Juros de Mora', accountClass: 'proveitos', nature: 'credit', description: 'Juros cobrados por atraso no pagamento.' },
    { account: 'revenue_commissions', code: '73', name: 'Comissões', accountClass: 'proveitos', nature: 'credit', description: 'Comissões de abertura, gestão e outras.' },
    { account: 'revenue_recoveries', code: '74', name: 'Recuperação de Créditos Abatidos', accountClass: 'proveitos', nature: 'credit', description: 'Valores recebidos de créditos já abatidos ao activo.' },
    { account: 'expenses', code: '62', name: 'Despesas Gerais e Administrativas', accountClass: 'custos', nature: 'debit', description: 'Custos operacionais pagos pela empresa.' },
    { account: 'pdd', code: '66', name: 'Custos com Provisões para Crédito', accountClass: 'custos', nature: 'debit', description: 'Reforço das provisões para crédito de cobrança duvidosa.' },
    { account: 'writeoff_loss', code: '67', name: 'Perdas com Créditos Abatidos', accountClass: 'custos', nature: 'debit', description: 'Parte do crédito abatido não coberta por provisões.' },
    { account: 'written_off_memo', code: '09', name: 'Créditos Abatidos ao Activo (memorando)', accountClass: 'extrapatrimonial', nature: 'debit', description: 'Controlo dos créditos abatidos que continuam em cobrança.' },
    { account: 'written_off_memo_contra', code: '09.9', name: 'Contrapartida de Créditos Abatidos', accountClass: 'extrapatrimonial', nature: 'credit', description: 'Contrapartida da conta de memorando.' },
];

const BY_ACCOUNT = new Map(CHART_OF_ACCOUNTS.map(item => [item.account, item]));

/** Contas históricas ou técnicas que não fazem parte do plano principal mas podem existir no razão. */
const LEGACY_ACCOUNTS: Record<string, Omit<AccountDefinition, 'account'>> = {
    accrued_interest: { code: '71.9', name: 'Juros Reconhecidos (histórico)', accountClass: 'proveitos', nature: 'credit', description: 'Conta histórica de juros reconhecidos.' },
    interest_receivable: { code: '14.9', name: 'Juros a Receber (histórico)', accountClass: 'activo', nature: 'debit', description: 'Conta histórica de juros a receber.' },
    commissions: { code: '73.9', name: 'Comissões (histórico)', accountClass: 'proveitos', nature: 'credit', description: 'Conta histórica de comissões.' },
    fines: { code: '72.9', name: 'Multas (histórico)', accountClass: 'proveitos', nature: 'credit', description: 'Conta histórica de multas.' },
};

export function accountDefinition(account: string): AccountDefinition {
    const known = BY_ACCOUNT.get(account);
    if (known) return known;
    const legacy = LEGACY_ACCOUNTS[account];
    if (legacy) return { account, ...legacy };
    return { account, code: '—', name: account.replace(/_/g, ' '), accountClass: 'activo', nature: 'debit', description: 'Conta não classificada.' };
}

/** Nome em português; um nome personalizado (plano de contas configurado pela empresa) tem prioridade. */
export function accountName(account: string, custom?: Record<string, { code?: string; name?: string }>) {
    return custom?.[account]?.name?.trim() || accountDefinition(account).name;
}

export function accountCode(account: string, custom?: Record<string, { code?: string; name?: string }>) {
    return custom?.[account]?.code?.trim() || accountDefinition(account).code;
}

export const LIQUID_ACCOUNTS = new Set(CHART_OF_ACCOUNTS.filter(item => item.liquid).map(item => item.account));
export const ASSET_ACCOUNTS_DEBIT_ONLY = new Set(['cash', 'bank', 'portfolio', 'receivable_interest', 'receivable_late_interest']);
export const REVENUE_ACCOUNTS = new Set(['revenue_interest', 'revenue_late_interest', 'revenue_commissions', 'revenue_recoveries', 'accrued_interest', 'commissions', 'fines']);
export const EXPENSE_ACCOUNTS = new Set(['expenses', 'pdd', 'writeoff_loss']);

/**
 * Saldo apresentado na natureza da conta (positivo = saldo normal). `balanceMinor` é débitos − créditos.
 */
export function naturalBalance(account: string, debitMinusCreditMinor: number) {
    return accountDefinition(account).nature === 'debit' ? debitMinusCreditMinor : -debitMinusCreditMinor;
}

/** Tipos de lançamento em português (os identificadores técnicos nunca aparecem ao utilizador). */
export const ENTRY_TYPE_LABELS: Record<string, string> = {
    payment: 'Recebimento',
    disbursement: 'Desembolso',
    origination: 'Concessão de crédito',
    reversal: 'Estorno',
    adjustment: 'Reposição / Ajuste',
    restoration: 'Reposição',
    interest_accrual: 'Juros reconhecidos',
    late_interest: 'Juros de mora',
    capital_entry: 'Entrada de capital',
    loan_received: 'Financiamento obtido',
    expense: 'Despesa',
    transfer: 'Transferência interna',
    provision: 'Constituição de provisão',
    provision_release: 'Reversão de provisão',
    writeoff: 'Abate de crédito',
    journal_reversal: 'Estorno de lançamento',
    payment_reversal: 'Estorno de pagamento',
};

export const SOURCE_TYPE_LABELS: Record<string, string> = {
    payment: 'Pagamento',
    credit_origination: 'Concessão',
    credit_reinforcement: 'Reforço de capital',
    credit_adjustment: 'Ajuste de encargos',
    expense: 'Despesa',
    manual: 'Lançamento manual',
    historical: 'Histórico migrado',
    writeoff: 'Abate',
    provision: 'Provisão',
    journal_reversal: 'Estorno',
};

export const COMPONENT_LABELS: Record<string, string> = {
    principal: 'Capital',
    interest: 'Juros',
    interest_receivable: 'Juros a receber',
    late_interest: 'Juros de mora',
    late_receivable: 'Mora a receber',
    settlement: 'Liquidação',
    expense: 'Despesa',
    historical: 'Histórico',
    capital: 'Capital',
    recovery: 'Recuperação',
    provision: 'Provisão',
    writeoff: 'Abate',
    transfer: 'Transferência',
    manual: 'Manual',
};

export const entryTypeLabel = (type: string) => ENTRY_TYPE_LABELS[type] || type.replace(/_/g, ' ');
