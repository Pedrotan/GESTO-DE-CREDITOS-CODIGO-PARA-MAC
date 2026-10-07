// Alertas de segurança recebidos do processo principal (desktop) e quem os pode ver.

export type SecurityAlert = {
    id: string;
    timestamp: string;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    details: string;
    source?: string;
    ip?: string | null;
    count?: number;
};

export const canViewSecurity = (user: { role?: string; permissions?: string[] } | null | undefined) =>
    !!user && (['admin', 'super_admin'].includes(String(user.role)) || (user.permissions || []).includes('view_audit_logs'));
