export type Role = 'super_admin' | 'admin' | 'manager';

export interface User {
    id: string;
    name: string;
    email: string;
    username?: string;
    role: Role;
    avatar?: string;
    password?: string;
    lastLogin?: string;
    createdAt?: string;
    permissions?: string[];
    status?: 'active' | 'blocked' | 'offline';
    lastSeen?: string;
    ip?: string;
    signature?: string;
    failedAttempts?: number;
    twoFactorEnabled?: boolean;
    twoFactorSecret?: string;
}

export const ROLES: Record<Role, { label: string; description: string }> = {
    super_admin: {
        label: 'Super Administrador',
        description: 'Acesso total ao sistema',
    },
    admin: {
        label: 'Administrador',
        description: 'Gestão financeira e marketing',
    },
    manager: {
        label: 'Gestor de Crédito',
        description: 'Operações de crédito e cobrança',
    },
};

export const AVAILABLE_PERMISSIONS = [
    { id: 'manage_users', label: 'Gerir Usuários', description: 'Permite criar, editar e desativar contas de colaboradores no sistema' },
    { id: 'manage_clients', label: 'Gerir Clientes', description: 'Capacidade de registar novos clientes e atualizar informações cadastrais' },
    { id: 'view_credits', label: 'Visualizar Créditos', description: 'Acesso total à lista de créditos e detalhes de propostas' },
    { id: 'approve_loans', label: 'Aprovar Créditos', description: 'Poder de decisão para aprovar ou rejeitar solicitações de crédito' },
    { id: 'manage_payments', label: 'Gerir Pagamentos', description: 'Registar recebimentos, amortizações e validar comprovativos' },
    { id: 'view_reports', label: 'Relatórios Financeiros', description: 'Acesso a relatórios de faturação, lucros e métricas de sistema' },
    { id: 'view_user_reports', label: 'Relatórios de Atividade', description: 'Monitorizar a performance e logs de produtividade da equipa' },
    { id: 'manage_settings', label: 'Configurações de Sistema', description: 'Alterar dados da empresa, taxas de juro e regras de negócio' },
    { id: 'view_audit_logs', label: 'Auditoria e Logs', description: 'Consultar o histórico de todas as ações críticas realizadas no sistema' },
    { id: 'manage_limits', label: 'Gestão de Limites', description: 'Definir limites máximos de crédito que cada usuário pode gerir' },
    { id: 'manage_gateways', label: 'Métodos de Pagamento', description: 'Configurar APIs de gateways externos (Reference, Multicaixa, etc)' },
    { id: 'manage_fiscal', label: 'Documentos Fiscais', description: 'Gerar ficheiros SAF-T (AO) e Facturas Electrónicas conforme AGT' },
    { id: 'generate_fiscal_docs', label: 'Gerar Ficheiros Fiscais', description: 'Capacidade de gerar e baixar arquivos PDF e XML (SAF-T e Facturas)' },
    { id: 'manage_warranties', label: 'Gestão de Garantias', description: 'Gerir colaterais, avaliações e documentos de garantias reais' },
    { id: 'manage_legal', label: 'Contencioso Jurídico', description: 'Gerir processos de cobrança judicial e interpelações' },
];




