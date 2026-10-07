import { formatCurrency } from '@/bibliotecas/formatters';

export const money = (minor: number) => formatCurrency((Number(minor) || 0) / 100);
export const isAdminRole = (role?: string | null) => ['admin', 'super_admin'].includes(String(role || ''));

export type JournalKind = 'capital_entry' | 'loan_received' | 'expense' | 'transfer' | 'provision' | 'provision_release' | 'custom';

export const JOURNAL_KIND_INFO: Record<JournalKind, { label: string; description: string }> = {
    capital_entry: { label: 'Entrada de capital', description: 'Realização do capital social pelos sócios: Débito Caixa/Bancos, Crédito Capital Social.' },
    loan_received: { label: 'Financiamento obtido', description: 'Empréstimo recebido de banco, sócio ou terceiro: Débito Caixa/Bancos, Crédito Financiamentos Obtidos.' },
    expense: { label: 'Despesa paga', description: 'Custo operacional pago: Débito Despesas Gerais, Crédito Caixa/Bancos. Para despesas com comprovativo use a página Despesas.' },
    transfer: { label: 'Transferência Caixa ↔ Bancos', description: 'Depósito da caixa no banco ou levantamento do banco para a caixa (não altera o resultado).' },
    provision: { label: 'Constituição de provisão', description: 'Reforço das provisões para crédito de cobrança duvidosa: Débito Custos com Provisões, Crédito Provisões.' },
    provision_release: { label: 'Reversão de provisão', description: 'Provisão em excesso: Débito Provisões, Crédito Custos com Provisões.' },
    custom: { label: 'Lançamento livre (administrador)', description: 'Débito e crédito escolhidos no plano de contas. A carteira e os juros a receber só se movem pelas operações de crédito.' },
};
