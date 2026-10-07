import type { ExcecaoPermissao, ConfiguracaoAlcada, AmbitoDados } from './controlo-acesso.ts';
import { PERFIS_PREDEFINIDOS } from './controlo-acesso.ts';

export type Role =
    | 'super_admin'
    | 'admin'
    | 'manager'
    | 'system_admin'
    | 'credit_director'
    | 'commercial_manager'
    | 'risk_analyst'
    | 'cashier'
    | 'collection_officer'
    | 'accountant'
    | 'legal'
    | 'internal_auditor'
    | string;

export interface User {
    id: string;
    name: string;
    email: string;
    username?: string;
    role: Role;
    avatar?: string;
    password?: string;
    lastLogin?: string;
    createdAt?: string | Date;
    permissions?: string[];
    permissionExceptions?: ExcecaoPermissao[];
    status?: 'active' | 'blocked' | 'offline' | 'pending_activation';
    lastSeen?: string;
    ip?: string;
    signature?: string;
    failedAttempts?: number;
    twoFactorEnabled?: boolean;
    twoFactorSecret?: string;
    // Âmbito dos dados e alçadas bancárias
    dataScope?: AmbitoDados;
    branch?: string;
    branchId?: string;
    branchName?: string;
    approvalLimits?: Partial<ConfiguracaoAlcada>;
    temporaryRoleExpiry?: string;
    temporaryPermissionsExpiry?: string;
    canViewSensitiveData?: boolean;
    canExportData?: boolean;
    mustChangePassword?: boolean;
}

export const ROLES: Record<string, { label: string; description: string; badgeColor?: string }> = {
    super_admin: {
        label: 'Super Administrador',
        description: 'Acesso total e irrestrito ao sistema',
        badgeColor: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200'
    },
    system_admin: {
        label: 'Administrador de Sistema',
        description: 'Utilizadores, perfis, integrações e configurações gerais',
        badgeColor: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200'
    },
    credit_director: {
        label: 'Diretor de Crédito',
        description: 'Aprovações financeiras até à alçada mais alta e relatórios estratégicos',
        badgeColor: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200'
    },
    manager: {
        label: 'Gestor de Crédito',
        description: 'Operações de crédito, análise e aprovação até 500 000 Kz',
        badgeColor: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200'
    },
    commercial_manager: {
        label: 'Gestor Comercial',
        description: 'Angariação de clientes, simulações e submissão de pedidos',
        badgeColor: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200'
    },
    risk_analyst: {
        label: 'Analista de Risco',
        description: 'Avaliação de solvabilidade, scoring e parecer técnico',
        badgeColor: 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-200'
    },
    cashier: {
        label: 'Operador de Caixa',
        description: 'Registo de pagamentos, amortizações e fecho de caixa',
        badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200'
    },
    collection_officer: {
        label: 'Técnico de Cobrança',
        description: 'Hub de Cobrança e negociação de clientes em atraso',
        badgeColor: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200'
    },
    accountant: {
        label: 'Contabilista',
        description: 'Contabilidade geral, plano de contas, despesas e fecho de período',
        badgeColor: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200'
    },
    legal: {
        label: 'Jurídico',
        description: 'Contencioso judicial e execução de garantias',
        badgeColor: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200'
    },
    internal_auditor: {
        label: 'Auditor Interno',
        description: 'Acesso estritamente de leitura a todo o sistema e logs',
        badgeColor: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-200'
    },
    admin: {
        label: 'Administrador',
        description: 'Gestão administrativa e supervisão geral',
        badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200'
    }
};

export const AVAILABLE_PERMISSIONS = [
    { id: 'manage_users', label: 'Gerir Utilizadores', description: 'Permite criar, editar e desativar contas de colaboradores no sistema' },
    { id: 'manage_clients', label: 'Gerir Clientes', description: 'Capacidade de registar novos clientes e atualizar informações cadastrais' },
    { id: 'view_credits', label: 'Visualizar Créditos', description: 'Acesso total à lista de créditos e detalhes de propostas' },
    { id: 'approve_loans', label: 'Aprovar Créditos', description: 'Poder de decisão para aprovar ou rejeitar solicitações de crédito' },
    { id: 'manage_payments', label: 'Gerir Pagamentos', description: 'Registar recebimentos, amortizações e validar comprovativos' },
    { id: 'view_reports', label: 'Relatórios Financeiros', description: 'Acesso a relatórios de faturação, lucros e métricas de sistema' },
    { id: 'view_user_reports', label: 'Relatórios de Atividade', description: 'Monitorizar a performance e logs de produtividade da equipa' },
    { id: 'manage_settings', label: 'Configurações de Sistema', description: 'Alterar dados da empresa, taxas de juro e regras de negócio' },
    { id: 'view_audit_logs', label: 'Auditoria e Logs', description: 'Consultar o histórico de todas as ações críticas realizadas no sistema' },
    { id: 'manage_limits', label: 'Gestão de Limites', description: 'Definir limites máximos de crédito que cada utilizador pode gerir' },
    { id: 'manage_gateways', label: 'Métodos de Pagamento', description: 'Configurar APIs de gateways externos (Reference, Multicaixa, etc)' },
    { id: 'manage_fiscal', label: 'Documentos Fiscais', description: 'Gerar ficheiros SAF-T (AO) e Facturas Electrónicas conforme AGT' },
    { id: 'generate_fiscal_docs', label: 'Gerar Ficheiros Fiscais', description: 'Capacidade de gerar e baixar ficheiros PDF e XML (SAF-T e Facturas)' },
    { id: 'manage_warranties', label: 'Gestão de Garantias', description: 'Gerir colaterais, avaliações e documentos de garantias reais' },
    { id: 'manage_legal', label: 'Contencioso Jurídico', description: 'Gerir processos de cobrança judicial e interpelações' },
];





