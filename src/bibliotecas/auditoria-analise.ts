// Auditoria sem interface: cada registo bruto passa a um evento com módulo, acção, resultado, gravidade,
// entidade (com link), alterações campo a campo e justificação; regras de detecção de alertas; indicadores,
// gráficos, filtros, sessões e linha do tempo. Datas sempre na hora de Angola.
import { addDaysToKey, daysBetweenKeys, luandaDateKey, luandaParts, luandaToUtc, luandaTodayKey } from './fuso-angola';
import { angolaHolidays } from './feriados-angola';

export type AuditRow = {
    id: string; timestamp: string; userId?: string | null; userName?: string | null; action?: string | null; entity?: string | null;
    details?: string | null; previousState?: string | null; newState?: string | null; metadata?: string | null;
    seq?: number | null; integrityHash?: string | null; previousHash?: string | null;
};

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type AuditResult = 'success' | 'denied' | 'failed';
export type AuditModule = 'clientes' | 'simulador' | 'creditos' | 'aprovacoes' | 'pagamentos' | 'contabilidade' | 'utilizadores' | 'configuracoes'
    | 'seguranca' | 'relatorios' | 'garantias' | 'contencioso' | 'cobranca' | 'despesas' | 'autenticacao' | 'auditoria';
export type AuditAction = 'create' | 'update' | 'delete' | 'view_sensitive' | 'export' | 'login' | 'login_failed' | 'logout' | 'approve' | 'reject'
    | 'cancel' | 'reversal' | 'permission_change' | 'settings_change' | 'override' | 'access_denied' | 'security' | 'view' | 'import' | 'restore' | 'disburse';

export const SEVERITY_LABELS: Record<Severity, string> = { info: 'Informativo', low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };
export const SEVERITY_ORDER: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];
export const RESULT_LABELS: Record<AuditResult, string> = { success: 'Sucesso', denied: 'Negado', failed: 'Falhado' };
export const MODULE_LABELS: Record<AuditModule, string> = {
    clientes: 'Clientes', simulador: 'Simulador', creditos: 'Créditos', aprovacoes: 'Aprovações', pagamentos: 'Pagamentos', contabilidade: 'Contabilidade',
    utilizadores: 'Utilizadores', configuracoes: 'Configurações', seguranca: 'Segurança', relatorios: 'Relatórios', garantias: 'Garantias',
    contencioso: 'Contencioso', cobranca: 'Cobrança', despesas: 'Despesas', autenticacao: 'Autenticação', auditoria: 'Auditoria',
};
export const ACTION_LABELS: Record<AuditAction, string> = {
    create: 'Criação', update: 'Edição', delete: 'Eliminação', view_sensitive: 'Consulta de dados sensíveis', export: 'Exportação', login: 'Login',
    login_failed: 'Login falhado', logout: 'Logout', approve: 'Aprovação', reject: 'Rejeição', cancel: 'Anulação', reversal: 'Estorno',
    permission_change: 'Alteração de permissões', settings_change: 'Alteração de configurações', override: 'Sobreposição manual',
    access_denied: 'Acesso negado', security: 'Evento de segurança', view: 'Consulta', import: 'Importação', restore: 'Reposição', disburse: 'Desembolso',
};

export type FieldChange = { field: string; label: string; before: string; after: string };
export type EntityRef = { type: string; id: string; label: string; link: string };

export type AuditEvent = {
    id: string;
    seq: number | null;
    timestamp: string;
    dateKey: string;
    hour: number;
    weekday: number;
    userId: string;
    userName: string;
    role: string;
    sessionId: string;
    ip: string;
    device: string;
    location: string;
    module: AuditModule;
    action: AuditAction;
    result: AuditResult;
    severity: Severity;
    entity: EntityRef | null;
    summary: string;
    changes: FieldChange[];
    justification: string;
    hash: string;
    metadata: Record<string, any>;
    raw: AuditRow;
};

export type AuditContext = {
    roles?: Map<string, string>;
    numbers?: Map<string, string>;
    /** Gravidade por acção configurada pela empresa (sobrepõe o catálogo). */
    severityOverrides?: Partial<Record<AuditAction, Severity>>;
};

// ── Terminologia ─────────────────────────────────────────────────────────────────────
export function normalizeTerminology(text: string): string {
    return String(text || '')
        .replace(/\bActualiz/g, 'Atualiz').replace(/\bactualiz/g, 'atualiz')
        .replace(/\bDesactiv/g, 'Desativ').replace(/\bdesactiv/g, 'desativ')
        .replace(/\bUsuários?\b/g, match => match.endsWith('s') ? 'Utilizadores' : 'Utilizador')
        .replace(/\busuários?\b/g, match => match.endsWith('s') ? 'utilizadores' : 'utilizador')
        .replace(/\bRegistros\b/g, 'Registos').replace(/\bregistros\b/g, 'registos').replace(/\bRegistro\b/g, 'Registo').replace(/\bregistro\b/g, 'registo')
        .replace(/\bExclusão\b/g, 'Eliminação');
}

// ── Dados sensíveis ──────────────────────────────────────────────────────────────────
const SECRET_KEYS = /password|passe|secret|token|mfa|recovery|rescuekey|passkey|apikey|smtppassword|otp|codigo2fa/i;
const MASK_KEYS = /^(nif|bi|iban|documentnumber|spousebi|spousenif|clientnif|clientiban)$/i;
export const maskValue = (value: string) => value.length <= 6 ? '***' : `${value.slice(0, 4)}${'*'.repeat(Math.max(3, value.length - 7))}${value.slice(-3)}`;
/** Mascara NIF, BI e IBAN dentro de um texto livre. */
export const maskText = (text: string) => String(text || '')
    .replace(/\bAO\d{2}(?:\s?\d{4}){5}\s?\d\b/g, match => maskValue(match.replace(/\s/g, '')))
    .replace(/\b\d{9}[A-Z]{2}\d{3}\b/g, match => maskValue(match));

const FIELD_LABELS: Record<string, string> = {
    name: 'Nome', email: 'Email', phone: 'Telefone', address: 'Morada', status: 'Estado', role: 'Perfil', permissions: 'Permissões',
    permissionExceptions: 'Exceções de permissões', approvalLimits: 'Alçadas', dataScope: 'Âmbito dos dados', branchName: 'Agência',
    interestRate: 'Taxa de juro mensal', lateInterestRate: 'Taxa de mora diária', defaultInterestRate: 'Taxa de juro por omissão', creditLimit: 'Limite de crédito',
    principalAmount: 'Capital', currentBalance: 'Saldo em dívida', accruedInterest: 'Juros', lateInterest: 'Juros de mora', totalDue: 'Total em dívida',
    riskLevel: 'Nível de risco', enabled: 'Activo', days: 'Horário de acesso', allowedMonths: 'Meses permitidos', blockedDates: 'Datas sem acesso',
    warnMinutes: 'Aviso antes do fim (min)', userModes: 'Regras por utilizador', sessionTimeout: 'Tempo de sessão (min)', currency: 'Moeda',
    nif: 'NIF', primaryColor: 'Cor principal', secondaryColor: 'Cor secundária', website: 'Website', location: 'Localização',
    maintenanceMode: 'Modo de manutenção', financialLock: 'Bloqueio financeiro', cancelApprovalThreshold: 'Limite de anulação sem aprovação',
    canViewSensitiveData: 'Ver dados sensíveis', canExportData: 'Pode exportar', temporaryRoleExpiry: 'Expiração temporária',
    amount: 'Valor', receipt: 'Recibo', level: 'Nível de risco', taxas: 'Tabela de taxas', maxTransaction: 'Máximo por operação',
    dailyLimit: 'Limite diário', monthlyLimit: 'Limite mensal', restrictionsEnabled: 'Restrições activas',
    defaultSimulationInterestRate: 'Taxa de juro por omissão do simulador', defaultSimulationAdminFee: 'Comissão de abertura por omissão',
    defaultSimulationIof: 'Imposto do Selo por omissão', logo: 'Logótipo', reportLogo: 'Logótipo dos relatórios', watermarkLogo: 'Marca de água',
    smtpHost: 'Servidor de email', smtpPort: 'Porta do email', smtpUser: 'Utilizador do email', smtpPassword: 'Palavra-passe do email',
    syncEnabled: 'Sincronização', syncUrl: 'Endereço de sincronização', licenseKey: 'Licença', whatsapp: 'WhatsApp',
    customClauses: 'Cláusulas do contrato', contractTemplates: 'Modelos de contrato', bankingInfo: 'Dados bancários', authorizedSigners: 'Assinantes autorizados',
};
const STATUS_VALUES: Record<string, string> = {
    confirmed: 'Confirmado', cancelled: 'Anulado', pending: 'Pendente', active: 'Activo', blocked: 'Bloqueado', inactive: 'Inactivo', paid: 'Liquidado',
    overdue: 'Em atraso', pending_approval: 'Pendente de aprovação', rejected: 'Rejeitado', approved: 'Aprovado', offline: 'Offline', completed: 'Concluído', failed: 'Falhado',
};
const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Horário de acesso legível: "Seg–Sex 07:00–19:00; Sáb 08:00–12:00". */
export function describeSchedule(days: unknown): string {
    if (!Array.isArray(days)) return '—';
    const parts: string[] = [];
    let start = -1;
    const label = (rule: any) => rule?.allowed ? `${rule.start}–${rule.end}` : 'sem acesso';
    for (let index = 1; index <= 7; index++) {
        const day = index % 7;
        const next = (index + 1) % 7;
        if (start < 0) start = day;
        if (index === 7 || label(days[next]) !== label(days[day])) {
            const range = start === day ? DAY_NAMES[day] : `${DAY_NAMES[start]}–${DAY_NAMES[day]}`;
            parts.push(`${range} ${label(days[day])}`);
            start = -1;
        }
    }
    return parts.join('; ');
}

const formatValue = (key: string, value: unknown): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (SECRET_KEYS.test(key)) return '(protegido)';
    if (key === 'days') return describeSchedule(value);
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (typeof value === 'number') {
        if (/rate|taxa/i.test(key)) return `${value.toLocaleString('pt-AO', { maximumFractionDigits: 4 })}%`;
        if (/amount|balance|interest|due|limit|minor|kz/i.test(key)) {
            const amount = /minor/i.test(key) ? value / 100 : value;
            return `${amount.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
        }
        return value.toLocaleString('pt-AO');
    }
    if (typeof value === 'string') {
        if (key === 'status' && STATUS_VALUES[value]) return STATUS_VALUES[value];
        if (MASK_KEYS.test(key)) return maskValue(value);
        if (/^data:image\//.test(value)) return '(imagem)';
        if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
            const p = luandaParts(value);
            return p ? `${String(p.day).padStart(2, '0')}/${String(p.month + 1).padStart(2, '0')}/${p.year} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` : value;
        }
        return maskText(value).slice(0, 400);
    }
    if (Array.isArray(value)) return value.length > 12 ? `${value.length} itens` : value.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join(', ');
    return JSON.stringify(value).slice(0, 400);
};

const parseJson = (value?: string | null): any => {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
};

/** Só os campos alterados, lado a lado. */
export function diffStates(previous?: string | null, next?: string | null): FieldChange[] {
    const before = parseJson(previous);
    const after = parseJson(next);
    if (!before && !after) return [];
    if (typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) || Array.isArray(after)) {
        const a = formatValue('valor', before); const b = formatValue('valor', after);
        return a === b ? [] : [{ field: 'valor', label: 'Valor', before: a, after: b }];
    }
    const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
    return keys.filter(key => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
        .map(key => ({ field: key, label: FIELD_LABELS[key] || key, before: formatValue(key, before?.[key]), after: formatValue(key, after?.[key]) }));
}

// ── Classificação ────────────────────────────────────────────────────────────────────
const lower = (value: unknown) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function classifyModule(entity: string, details: string, action: string, meta: Record<string, any>): AuditModule {
    const text = lower(details);
    if (['login', 'logout', 'login_failure', 'login_failed', 'mfa_enabled', 'mfa_disabled'].includes(action)) return 'autenticacao';
    if (entity === 'audit') return 'auditoria';
    if (entity === 'report' || text.includes('relatorio')) return text.includes('pagamento') ? 'pagamentos' : 'relatorios';
    if (entity === 'payment') return 'pagamentos';
    if (entity === 'client') return 'clientes';
    if (entity === 'credit') return /aprov|rejeit|decis/.test(text) || meta.decision ? 'aprovacoes' : 'creditos';
    if (entity === 'accounting_entry' || entity === 'accounting') return 'contabilidade';
    if (entity === 'contencioso') return 'contencioso';
    if (entity === 'garantia') return 'garantias';
    if (entity === 'payment_gateway') return 'configuracoes';
    if (entity === 'security' || meta.source === 'security') return 'seguranca';
    if (entity === 'user') return /permiss|perfil|alcada/.test(text) ? 'utilizadores' : /bloquead|seguranca|2fa|mfa/.test(text) ? 'seguranca' : 'utilizadores';
    // Definições, horário, taxas e limites são configurações, mesmo quando o campo é do simulador.
    if (/^(atualizou|actualizou|desativou|desactivou) (as |o |a |os )?(definicoes|horario|tabela de taxas|regras|limites)/.test(text)) return 'configuracoes';
    if (text.includes('simulador') || text.includes('simulacao')) return 'simulador';
    if (/despesa/.test(text)) return 'despesas';
    if (/cobranca|whatsapp|lembrete/.test(text)) return 'cobranca';
    if (/estorno|lancamento|periodo|fecho|contab|panico|congel/.test(text)) return 'contabilidade';
    if (/integridade|intrus|seguranca|ataque|bloqueio/.test(text)) return 'seguranca';
    return 'configuracoes';
}

function classifyAction(rawAction: string, module: AuditModule, details: string, meta: Record<string, any>): AuditAction {
    const text = lower(details);
    if (rawAction === 'login') return 'login';
    if (rawAction === 'login_failure' || rawAction === 'login_failed') return 'login_failed';
    if (rawAction === 'logout') return 'logout';
    if (rawAction === 'security_alert' || /\[403|acesso negado|sem permissao/.test(text)) return 'access_denied';
    if (rawAction === 'mfa_disabled' || rawAction === 'mfa_enabled' || rawAction === 'nuclear_reset' || rawAction === 'database_import') return 'security';
    if (rawAction === 'export' || /^gerou o relatorio|exportou/.test(text)) return 'export';
    if (rawAction === 'import' || /^importa/.test(text)) return 'import';
    if (rawAction === 'view') return /sensive/.test(text) ? 'view_sensitive' : 'view';
    if (rawAction === 'restore' || /^repos|restaurou/.test(text)) return 'restore';
    if (meta.override || /nivel de risco .* alterado|sobrepo/.test(text)) return 'override';
    if (/^anul|anulacao/.test(text)) return 'cancel';
    if (/estorno/.test(text)) return 'reversal';
    if (meta.decision === 'approved' || /^aprovou|aprovado/.test(text)) return 'approve';
    if (meta.decision === 'rejected' || /^rejeitou|rejeitado/.test(text)) return 'reject';
    if (/desembols/.test(text)) return 'disburse';
    if (module === 'utilizadores' && rawAction === 'update' && /permiss|perfil/.test(text)) return 'permission_change';
    if (module === 'configuracoes' && (rawAction === 'update' || rawAction === 'delete')) return 'settings_change';
    if (rawAction === 'create' || rawAction === 'delete' || rawAction === 'update') return rawAction;
    return 'update';
}

const FINANCIAL_SETTINGS = /taxa|juro|comiss|mora|interest|rate|fee|selo|limite|alcada|cancelapprovalthreshold|regras? de calculo/;

function classifySeverity(action: AuditAction, module: AuditModule, details: string, meta: Record<string, any>, changes: FieldChange[], overrides?: AuditContext['severityOverrides']): Severity {
    if (overrides?.[action]) return overrides[action]!;
    const text = lower(details);
    // Crítica
    if (action === 'permission_change' && /super administrador|super_admin|diretor|director|credit_director/.test(text + lower(JSON.stringify(changes)))) return 'critical';
    if (meta.periodId && /reabert|reabr/.test(text)) return 'critical';
    if (/panico|congel/.test(text)) return 'critical';
    if (action === 'security' && /mfa|2fa|dois fatores/.test(text + lower(meta.reason))) return 'critical';
    if (/integridade/.test(text) && /falh|quebr/.test(text)) return 'critical';
    if (action === 'security') return 'high';
    // Alta
    if (['override', 'cancel', 'reversal'].includes(action)) return 'high';
    // Alterações às alçadas (versões, exceções temporárias, desativações) são sempre de gravidade Alta.
    if (meta.limitsChange) return 'high';
    if (/perdao|perdoar|abate|write-?off|ajuste de encargos|desconto/.test(text)) return 'high';
    if (action === 'settings_change' && (FINANCIAL_SETTINGS.test(text) || changes.some(change => FINANCIAL_SETTINGS.test(lower(change.field + change.label))))) return 'high';
    if (action === 'export' && (Number(meta.count) >= 500 || /clientes/.test(text))) return 'high';
    // Média
    if (['approve', 'reject', 'disburse', 'access_denied', 'permission_change', 'settings_change'].includes(action)) return 'medium';
    if (module === 'clientes' && (action === 'update' || action === 'delete')) return 'medium';
    if (module === 'utilizadores' && (action === 'create' || action === 'delete' || /bloque|desativ/.test(text))) return 'medium';
    if (action === 'delete') return 'medium';
    // Baixa / informativo
    if (['login', 'logout', 'login_failed', 'create', 'import', 'restore', 'export', 'update'].includes(action)) return action === 'login_failed' ? 'medium' : 'low';
    return 'info';
}

function entityOf(entity: string, details: string, meta: Record<string, any>, numbers?: Map<string, string>): EntityRef | null {
    const pick = (...keys: string[]) => keys.map(key => meta[key]).find(value => typeof value === 'string' && value) as string | undefined;
    const paymentId = pick('paymentId');
    const creditId = pick('creditId');
    const clientId = pick('clientId');
    const userId = pick('targetUserId');
    const receipt = /RC \d{4}\/\d{6}/.exec(details)?.[0];
    if (paymentId || entity === 'payment') {
        const id = paymentId || (/pagamento ([\w-]{6,})/i.exec(details)?.[1] ?? '');
        return id ? { type: 'payment', id, label: `Pagamento ${receipt || id.slice(0, 12)}`, link: `/pagamentos?search=${encodeURIComponent(receipt || id)}` } : null;
    }
    if (creditId || entity === 'credit') {
        const id = creditId || (/cr[eé]dito:? ([\w-]{8,})/i.exec(details)?.[1] ?? '');
        return id ? { type: 'credit', id, label: `Crédito ${numbers?.get(id) || id.slice(0, 8).toUpperCase()}`, link: `/creditos?search=${encodeURIComponent(id)}` } : null;
    }
    if (clientId || entity === 'client') {
        const name = /cliente:? ([^(,.;]+)/i.exec(details)?.[1]?.trim();
        const id = clientId || name || '';
        return id ? { type: 'client', id, label: `Cliente ${name || id.slice(0, 8)}`, link: `/clientes?search=${encodeURIComponent(name || id)}` } : null;
    }
    if (userId) return { type: 'user', id: userId, label: `Utilizador ${pick('targetUserName') || userId.slice(0, 8)}`, link: '/utilizadores' };
    if (meta.periodId) return { type: 'period', id: String(meta.periodId), label: `Período ${meta.periodId}`, link: '/contabilidade' };
    if (meta.reportId) return { type: 'report', id: String(meta.reportId), label: 'Relatório gerado', link: '' };
    return null;
}

const deviceFrom = (meta: Record<string, any>) => {
    if (typeof meta.device === 'string' && meta.device) return meta.device;
    const agent = String(meta.userAgent || '');
    if (!agent) return meta.source === 'electron-main' ? 'Aplicação desktop' : '';
    const os = /Windows/.test(agent) ? 'Windows' : /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Mac OS/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : 'Outro';
    const browser = /Electron\//.test(agent) ? 'Aplicação desktop' : /Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : 'Navegador';
    return `${os} · ${browser}`;
};

const justificationOf = (details: string, meta: Record<string, any>) => {
    for (const key of ['reason', 'justification', 'motivo']) if (typeof meta[key] === 'string' && meta[key].trim()) return meta[key].trim();
    return /(?:Justifica[cç][aã]o|Motivo)\s*:\s*(.+?)(?:\)|$)/iu.exec(details)?.[1]?.trim() || '';
};

/** Registo bruto → evento de auditoria. */
export function toAuditEvent(row: AuditRow, context: AuditContext = {}): AuditEvent {
    const meta = parseJson(row.metadata) || {};
    const details = normalizeTerminology(String(row.details || ''));
    const rawAction = String(row.action || '').toLowerCase();
    const entity = String(row.entity || '').toLowerCase();
    const module = classifyModule(entity, details, rawAction, meta);
    const action = classifyAction(rawAction, module, details, meta);
    let changes = diffStates(row.previousState, row.newState);
    if (!changes.length && Array.isArray(meta.changes)) changes = meta.changes.filter((item: any) => item?.label).map((item: any) => ({ field: item.field || item.label, label: item.label, before: String(item.before ?? '—'), after: String(item.after ?? '—') }));
    const severity = classifySeverity(action, module, details, meta, changes, context.severityOverrides);
    const result: AuditResult = meta.result === 'denied' || action === 'access_denied' ? 'denied' : meta.result === 'failed' || action === 'login_failed' ? 'failed' : 'success';
    const parts = luandaParts(row.timestamp);
    const userId = String(row.userId || 'system');
    return {
        id: row.id, seq: row.seq ?? null, timestamp: row.timestamp, dateKey: luandaDateKey(row.timestamp),
        hour: parts?.hour ?? 0, weekday: parts?.weekday ?? 0,
        userId, userName: normalizeTerminology(String(row.userName || 'Sistema')), role: context.roles?.get(userId) || String(meta.role || ''),
        sessionId: String(meta.sessionId || ''), ip: String(meta.ip || ''), device: deviceFrom(meta),
        location: String(meta.location || (meta.timezone ? `${meta.timezone} (fuso do dispositivo)` : '')),
        module, action, result, severity, entity: entityOf(entity, details, meta, context.numbers),
        summary: maskText(details), changes, justification: justificationOf(details, meta), hash: String(row.integrityHash || ''),
        metadata: meta, raw: row,
    };
}

/** Sessões: as gravadas no registo; nas antigas, um login abre sessão e 30 min sem actividade fecham-na. */
export function assignSessions(events: AuditEvent[]): AuditEvent[] {
    const byUser = new Map<string, AuditEvent[]>();
    for (const event of events) byUser.set(event.userId, [...(byUser.get(event.userId) || []), event]);
    for (const list of byUser.values()) {
        list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        let current = '';
        let last = 0;
        for (const event of list) {
            const time = new Date(event.timestamp).getTime();
            if (event.sessionId) { current = event.sessionId; last = time; continue; }
            if (!current || event.action === 'login' || time - last > 30 * 60_000) current = `s-${event.userId}-${event.timestamp}`;
            event.sessionId = current;
            last = time;
            if (event.action === 'logout') current = '';
        }
    }
    return events;
}

// ── Filtros e período ────────────────────────────────────────────────────────────────
export type AuditPreset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'year' | 'custom' | 'all';
export const PRESET_LABELS: Record<AuditPreset, string> = { today: 'Hoje', yesterday: 'Ontem', '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', month: 'Este mês', year: 'Este ano', custom: 'Personalizado', all: 'Todo o histórico' };
export type AuditPeriod = { preset: AuditPreset; from: string; to: string; fromTime: string; toTime: string };
export type TimeRange = { fromIso: string; toIso: string; label: string } | null;

export function periodToRange(period: AuditPeriod, now = new Date()): TimeRange {
    const today = luandaTodayKey(now);
    const make = (fromKey: string, toKey: string, label: string, fromTime = '00:00', toTime = '23:59') => ({
        fromIso: luandaToUtc(fromKey, Number(fromTime.slice(0, 2)), Number(fromTime.slice(3, 5))).toISOString(),
        toIso: luandaToUtc(toKey, Number(toTime.slice(0, 2)), Number(toTime.slice(3, 5)), 59, 999).toISOString(), label,
    });
    switch (period.preset) {
        case 'today': return make(today, today, 'Hoje');
        case 'yesterday': { const key = addDaysToKey(today, -1); return make(key, key, 'Ontem'); }
        case '7d': return make(addDaysToKey(today, -6), today, 'Últimos 7 dias');
        case '30d': return make(addDaysToKey(today, -29), today, 'Últimos 30 dias');
        case 'month': return make(`${today.slice(0, 7)}-01`, today, 'Este mês');
        case 'year': return make(`${today.slice(0, 4)}-01-01`, today, `Ano de ${today.slice(0, 4)}`);
        case 'custom': {
            const from = period.from || today; const to = period.to || from;
            return make(from <= to ? from : to, from <= to ? to : from, `${from.split('-').reverse().join('/')} ${period.fromTime || '00:00'} a ${to.split('-').reverse().join('/')} ${period.toTime || '23:59'}`, period.fromTime || '00:00', period.toTime || '23:59');
        }
        default: return null;
    }
}

/** Período anterior com a mesma duração (para a variação dos cartões). */
export function previousRange(range: TimeRange): TimeRange {
    if (!range) return null;
    const from = new Date(range.fromIso).getTime();
    const to = new Date(range.toIso).getTime();
    const length = to - from + 1;
    return { fromIso: new Date(from - length).toISOString(), toIso: new Date(from - 1).toISOString(), label: 'Período anterior' };
}

export const inRange = (event: { timestamp: string }, range: TimeRange) => !range || (event.timestamp >= range.fromIso && event.timestamp <= range.toIso);

export type AuditFilters = {
    users: string[]; roles: string[]; modules: string[]; actions: string[]; severities: string[]; results: string[];
    ip: string; entity: string; search: string;
};
export const EMPTY_AUDIT_FILTERS: AuditFilters = { users: [], roles: [], modules: [], actions: [], severities: [], results: [], ip: '', entity: '', search: '' };

export function matchesAuditFilters(event: AuditEvent, filters: AuditFilters): boolean {
    if (filters.users.length && !filters.users.includes(event.userId)) return false;
    if (filters.roles.length && !filters.roles.includes(event.role)) return false;
    if (filters.modules.length && !filters.modules.includes(event.module)) return false;
    if (filters.actions.length && !filters.actions.includes(event.action)) return false;
    if (filters.severities.length && !filters.severities.includes(event.severity)) return false;
    if (filters.results.length && !filters.results.includes(event.result)) return false;
    if (filters.ip.trim() && !event.ip.includes(filters.ip.trim())) return false;
    const entity = lower(filters.entity.trim());
    if (entity && !lower(`${event.entity?.id || ''} ${event.entity?.label || ''} ${event.summary}`).includes(entity)) return false;
    const term = lower(filters.search.trim());
    if (term && !lower(`${event.summary} ${event.userName} ${MODULE_LABELS[event.module]} ${ACTION_LABELS[event.action]} ${event.ip} ${event.justification}`).includes(term)) return false;
    return true;
}

// ── Alertas ──────────────────────────────────────────────────────────────────────────
export type AlertRuleId = 'self_change' | 'risk_lowered' | 'failed_logins' | 'multi_ip' | 'off_hours_login' | 'new_device' | 'access_denied'
    | 'mass_export' | 'financial_settings' | 'cancellations' | 'off_hours_finance' | 'change_reverted' | 'privilege_escalation' | 'integrity';

export const ALERT_RULES: Record<AlertRuleId, { label: string; severity: Severity }> = {
    self_change: { label: 'Alteração sobre si próprio ou familiar', severity: 'high' },
    risk_lowered: { label: 'Nível de risco reduzido manualmente', severity: 'high' },
    failed_logins: { label: 'Logins falhados seguidos', severity: 'high' },
    multi_ip: { label: 'Acessos de vários IP em pouco tempo', severity: 'high' },
    off_hours_login: { label: 'Login fora do horário permitido', severity: 'medium' },
    new_device: { label: 'Login a partir de dispositivo novo', severity: 'low' },
    access_denied: { label: 'Acessos negados repetidos', severity: 'medium' },
    mass_export: { label: 'Exportação em massa', severity: 'high' },
    financial_settings: { label: 'Alteração de taxas, comissões ou regras de cálculo', severity: 'high' },
    cancellations: { label: 'Anulações ou estornos acima do limite', severity: 'high' },
    off_hours_finance: { label: 'Actividade financeira fora de horas', severity: 'medium' },
    change_reverted: { label: 'Alteração feita e revertida pelo mesmo utilizador', severity: 'medium' },
    privilege_escalation: { label: 'Elevação temporária de permissões com operação sensível', severity: 'critical' },
    integrity: { label: 'Falha na verificação da cadeia de integridade', severity: 'critical' },
};

export type AlertConfig = {
    failedLogins: number; multiIpCount: number; multiIpMinutes: number; deniedPerDay: number; exportThreshold: number;
    cancelAmountThreshold: number; cancelsPerDay: number; revertMinutes: number; nightStart: number; nightEnd: number;
    disabledRules: AlertRuleId[];
};
export const DEFAULT_ALERT_CONFIG: AlertConfig = {
    failedLogins: 5, multiIpCount: 3, multiIpMinutes: 60, deniedPerDay: 3, exportThreshold: 500, cancelAmountThreshold: 500_000,
    cancelsPerDay: 3, revertMinutes: 30, nightStart: 0, nightEnd: 6, disabledRules: [],
};

export type DetectedAlert = {
    key: string; ruleId: AlertRuleId; severity: Severity; title: string; description: string; eventIds: string[];
    originUserId: string; originUserName: string; occurredAt: string;
};

const RISK_ORDER: Record<string, number> = { baixo: 1, medio: 2, elevado: 3, alto: 3 };
const FINANCIAL_ACTIONS = new Set<AuditAction>(['approve', 'reject', 'disburse', 'cancel', 'reversal']);
const isFinancial = (event: AuditEvent) => FINANCIAL_ACTIONS.has(event.action) || (event.module === 'pagamentos' && ['create', 'cancel', 'reversal'].includes(event.action));
const surname = (name: string) => lower(name).split(/\s+/).filter(Boolean).pop() || '';

export function detectAlerts(input: AuditEvent[], options: {
    config?: Partial<AlertConfig>;
    clientNames?: Map<string, string>;
    /** Horário permitido por dia (0 = domingo): null = sem acesso. */
    allowedHours?: Array<{ start: string; end: string } | null>;
} = {}): DetectedAlert[] {
    const config = { ...DEFAULT_ALERT_CONFIG, ...(options.config || {}) };
    const enabled = (rule: AlertRuleId) => !config.disabledRules.includes(rule);
    const events = [...input].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const alerts = new Map<string, DetectedAlert>();
    const add = (ruleId: AlertRuleId, keyPart: string, list: AuditEvent[], description: string, severity?: Severity) => {
        if (!enabled(ruleId) || !list.length) return;
        const key = `${ruleId}:${keyPart}`;
        if (alerts.has(key)) return;
        const origin = list[list.length - 1];
        alerts.set(key, {
            key, ruleId, severity: severity || ALERT_RULES[ruleId].severity, title: ALERT_RULES[ruleId].label, description,
            eventIds: list.map(event => event.id), originUserId: origin.userId, originUserName: origin.userName, occurredAt: origin.timestamp,
        });
    };

    for (const event of events) {
        // 1 e 2: sobreposição de risco (sobre si próprio / familiar; redução de nível).
        if (event.action === 'override' || /nivel de risco/.test(lower(event.summary))) {
            const match = /nivel de risco de (.+?) alterado de (\p{L}+) para (\p{L}+)/u.exec(lower(event.summary));
            if (match) {
                const [, target, from, to] = match;
                if ((RISK_ORDER[from] || 0) > (RISK_ORDER[to] || 0)) add('risk_lowered', event.id, [event], `${event.userName} reduziu o risco de «${target}» de ${from} para ${to}. Justificação: ${event.justification || '—'}`);
                if (lower(event.userName) === target.trim()) add('self_change', event.id, [event], `${event.userName} alterou o nível de risco de si próprio.`, 'critical');
                else if (surname(event.userName) && surname(event.userName) === surname(target)) add('self_change', event.id, [event], `${event.userName} alterou o risco de «${target}», com o mesmo apelido (possível familiar).`);
            }
        }
        if (event.module === 'clientes' && ['update', 'delete'].includes(event.action)) {
            const name = lower(event.entity?.label.replace(/^Cliente /, '') || '');
            if (name && name === lower(event.userName)) add('self_change', event.id, [event], `${event.userName} alterou os próprios dados de cliente.`, 'critical');
        }
        // 7: taxas, comissões e regras de cálculo.
        if (event.action === 'settings_change' && (FINANCIAL_SETTINGS.test(lower(event.summary)) || event.changes.some(change => FINANCIAL_SETTINGS.test(lower(change.field + change.label)))))
            add('financial_settings', event.id, [event], `${event.userName}: ${event.changes.map(change => `${change.label}: ${change.before} → ${change.after}`).join('; ') || event.summary}`);
        // 6: exportação em massa.
        if (event.action === 'export' && Number(event.metadata.count) > config.exportThreshold)
            add('mass_export', event.id, [event], `${event.userName} exportou ${event.metadata.count} registos (limite ${config.exportThreshold}).`);
        // 8 (valor): anulação ou estorno acima do limite.
        if ((event.action === 'cancel' || event.action === 'reversal') && Number(event.metadata.amountMinor) / 100 > config.cancelAmountThreshold)
            add('cancellations', `${event.id}:valor`, [event], `${event.userName}: ${ACTION_LABELS[event.action].toLowerCase()} de ${(Number(event.metadata.amountMinor) / 100).toLocaleString('pt-AO')} Kz (limite ${config.cancelAmountThreshold.toLocaleString('pt-AO')} Kz).`);
        // 9: actividade financeira ao fim de semana, feriado ou de madrugada.
        if (isFinancial(event)) {
            const holidays = angolaHolidays(Number(event.dateKey.slice(0, 4)));
            const holiday = holidays.get(event.dateKey);
            const night = event.hour >= config.nightStart && event.hour < config.nightEnd;
            if (event.weekday === 0 || event.weekday === 6 || holiday || night)
                add('off_hours_finance', event.id, [event], `${ACTION_LABELS[event.action]} por ${event.userName} ${holiday ? `no feriado (${holiday})` : night ? 'de madrugada' : 'ao fim de semana'}: ${event.summary}`);
        }
        // 4: login fora do horário permitido.
        if (event.action === 'login' && options.allowedHours) {
            const rule = options.allowedHours[event.weekday];
            const time = `${String(event.hour).padStart(2, '0')}:${String(luandaParts(event.timestamp)?.minute ?? 0).padStart(2, '0')}`;
            if (!rule || time < rule.start || time > rule.end) add('off_hours_login', event.id, [event], `${event.userName} entrou às ${time} (${DAY_NAMES[event.weekday]}), fora do horário permitido.`);
        }
    }

    // Por utilizador
    const byUser = new Map<string, AuditEvent[]>();
    for (const event of events) byUser.set(event.userId, [...(byUser.get(event.userId) || []), event]);
    for (const [userId, list] of byUser) {
        // 3: logins falhados seguidos.
        let streak: AuditEvent[] = [];
        for (const event of list) {
            if (event.action === 'login_failed') {
                streak.push(event);
                if (streak.length >= config.failedLogins) add('failed_logins', `${userId}:${streak[0].id}`, [...streak], `${streak.length} logins falhados seguidos de ${event.userName}.`);
            } else if (event.action === 'login') streak = [];
        }
        // 3: vários IP em pouco tempo.
        const logins = list.filter(event => event.action === 'login' && event.ip);
        for (let index = 0; index < logins.length; index++) {
            const window = logins.filter(event => {
                const delta = new Date(event.timestamp).getTime() - new Date(logins[index].timestamp).getTime();
                return delta >= 0 && delta <= config.multiIpMinutes * 60_000;
            });
            const ips = new Set(window.map(event => event.ip));
            if (ips.size >= config.multiIpCount) { add('multi_ip', `${userId}:${logins[index].id}`, window, `${window[0].userName} entrou a partir de ${ips.size} IP diferentes em ${config.multiIpMinutes} minutos: ${[...ips].join(', ')}.`); break; }
        }
        // 4: dispositivo novo (nunca visto antes para este utilizador).
        const devices = new Set<string>();
        for (const event of logins.length ? list.filter(item => item.action === 'login') : []) {
            if (!event.device) continue;
            if (devices.size && !devices.has(event.device)) add('new_device', event.id, [event], `${event.userName} entrou a partir de um dispositivo novo: ${event.device}${event.ip ? ` (IP ${event.ip})` : ''}.`);
            devices.add(event.device);
        }
        // 5 e 8 (quantidade): por dia.
        const byDay = new Map<string, AuditEvent[]>();
        for (const event of list) byDay.set(event.dateKey, [...(byDay.get(event.dateKey) || []), event]);
        for (const [day, dayEvents] of byDay) {
            const denied = dayEvents.filter(event => event.action === 'access_denied');
            if (denied.length >= config.deniedPerDay) add('access_denied', `${userId}:${day}`, denied, `${denied.length} acessos negados a ${dayEvents[0].userName} em ${day.split('-').reverse().join('/')}.`);
            const cancels = dayEvents.filter(event => event.action === 'cancel' || event.action === 'reversal');
            if (cancels.length > config.cancelsPerDay) add('cancellations', `${userId}:${day}`, cancels, `${cancels.length} anulações/estornos de ${dayEvents[0].userName} no mesmo dia (limite ${config.cancelsPerDay}).`);
        }
        // 10: alteração feita e revertida.
        for (let index = 0; index < list.length; index++) {
            const first = list[index];
            if (!first.entity || !['update', 'create', 'settings_change', 'permission_change'].includes(first.action)) continue;
            for (let next = index + 1; next < list.length; next++) {
                const second = list[next];
                if (new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime() > config.revertMinutes * 60_000) break;
                if (second.entity?.id !== first.entity.id) continue;
                const reverted = (first.action === 'create' && second.action === 'delete')
                    || (first.changes.length > 0 && first.changes.every(change => second.changes.some(other => other.field === change.field && other.before === change.after && other.after === change.before)));
                if (reverted) { add('change_reverted', `${first.id}:${second.id}`, [first, second], `${first.userName} alterou e reverteu ${first.entity.label} em menos de ${config.revertMinutes} minutos.`); break; }
            }
        }
    }

    // 11: elevação de permissões → operação sensível → redução.
    const permissionEvents = events.filter(event => event.action === 'permission_change' && event.metadata.targetUserId);
    for (const grant of permissionEvents.filter(event => (event.metadata.added || []).length > 0)) {
        const target = String(grant.metadata.targetUserId);
        const grantTime = new Date(grant.timestamp).getTime();
        const sensitive = events.find(event => event.userId === target && event.timestamp > grant.timestamp && ['high', 'critical'].includes(event.severity)
            && new Date(event.timestamp).getTime() - grantTime < 24 * 3600_000);
        if (!sensitive) continue;
        const revoke = permissionEvents.find(event => String(event.metadata.targetUserId) === target && event.timestamp > sensitive.timestamp
            && (event.metadata.removed || []).length > 0 && new Date(event.timestamp).getTime() - grantTime < 48 * 3600_000);
        if (revoke) add('privilege_escalation', `${grant.id}:${revoke.id}`, [grant, sensitive, revoke],
            `${grant.userName} elevou as permissões de ${sensitive.userName}, que fez «${ACTION_LABELS[sensitive.action]}» e depois as permissões foram reduzidas.`);
    }
    return [...alerts.values()];
}

// ── Indicadores e gráficos ───────────────────────────────────────────────────────────
export type AuditKpis = { total: number; criticalHigh: number; loginFailed: number; accessDenied: number; activeUsersToday: number };
export function auditKpis(events: AuditEvent[], today = luandaTodayKey()): AuditKpis {
    return {
        total: events.length,
        criticalHigh: events.filter(event => event.severity === 'critical' || event.severity === 'high').length,
        loginFailed: events.filter(event => event.action === 'login_failed').length,
        accessDenied: events.filter(event => event.action === 'access_denied').length,
        activeUsersToday: new Set(events.filter(event => event.dateKey === today && event.userId !== 'system').map(event => event.userId)).size,
    };
}

export function activityHeatmap(events: AuditEvent[], workStart = 8, workEnd = 18) {
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    for (const event of events) grid[event.weekday][event.hour] += 1;
    const max = Math.max(1, ...grid.flat());
    return { grid, max, offHours: (weekday: number, hour: number) => weekday === 0 || weekday === 6 || hour < workStart || hour >= workEnd };
}

export function byModuleAndSeverity(events: AuditEvent[]) {
    const map = new Map<AuditModule, Record<Severity, number>>();
    for (const event of events) {
        const row = map.get(event.module) || { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
        row[event.severity] += 1;
        map.set(event.module, row);
    }
    return [...map.entries()].map(([module, counts]) => ({ module, label: MODULE_LABELS[module], ...counts, total: SEVERITY_ORDER.reduce((sum, key) => sum + counts[key], 0) }))
        .sort((a, b) => b.total - a.total);
}

export function topUsers(events: AuditEvent[], limit = 8) {
    const map = new Map<string, { userId: string; userName: string; total: number; high: number }>();
    for (const event of events) {
        const row = map.get(event.userId) || { userId: event.userId, userName: event.userName, total: 0, high: 0 };
        row.total += 1;
        if (event.severity === 'high' || event.severity === 'critical') row.high += 1;
        map.set(event.userId, row);
    }
    return [...map.values()].sort((a, b) => b.total - a.total || b.high - a.high).slice(0, limit);
}

export function dailyEvolution(events: AuditEvent[], days = 30, today = luandaTodayKey()) {
    const start = addDaysToKey(today, -(days - 1));
    const counts = new Map<string, { total: number; high: number }>();
    for (const event of events) {
        if (event.dateKey < start || event.dateKey > today) continue;
        const row = counts.get(event.dateKey) || { total: 0, high: 0 };
        row.total += 1;
        if (event.severity === 'high' || event.severity === 'critical') row.high += 1;
        counts.set(event.dateKey, row);
    }
    return Array.from({ length: days }, (_, index) => {
        const key = addDaysToKey(start, index);
        return { key, label: `${key.slice(8, 10)}/${key.slice(5, 7)}`, total: counts.get(key)?.total || 0, high: counts.get(key)?.high || 0 };
    });
}

/** Linha do tempo: dias → sessões → eventos. */
export function timeline(events: AuditEvent[]) {
    const days = new Map<string, Map<string, AuditEvent[]>>();
    for (const event of [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp))) {
        const sessions = days.get(event.dateKey) || new Map<string, AuditEvent[]>();
        sessions.set(event.sessionId || event.id, [...(sessions.get(event.sessionId || event.id) || []), event]);
        days.set(event.dateKey, sessions);
    }
    return [...days.entries()].map(([dateKey, sessions]) => ({
        dateKey,
        sessions: [...sessions.entries()].map(([sessionId, list]) => ({
            sessionId, userName: list[0].userName, userId: list[0].userId, ip: list.find(item => item.ip)?.ip || '', device: list.find(item => item.device)?.device || '',
            start: list[list.length - 1].timestamp, end: list[0].timestamp, events: [...list].reverse(),
        })),
    }));
}

/** Eventos relacionados: mesma sessão e outras alterações à mesma entidade. */
export function relatedEvents(event: AuditEvent, events: AuditEvent[]) {
    return {
        session: events.filter(item => item.id !== event.id && item.sessionId && item.sessionId === event.sessionId).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        entity: event.entity ? events.filter(item => item.id !== event.id && item.entity?.id === event.entity!.id).sort((a, b) => a.timestamp.localeCompare(b.timestamp)) : [],
    };
}

export const relativeTime = (iso: string, now = Date.now()) => {
    const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return 'há instantes';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `há ${minutes} minuto${minutes === 1 ? '' : 's'}`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `há ${hours} hora${hours === 1 ? '' : 's'}`;
    const days = Math.round(hours / 24);
    if (days < 31) return `há ${days} dia${days === 1 ? '' : 's'}`;
    const months = Math.round(days / 30);
    return months < 12 ? `há ${months} mes${months === 1 ? '' : 'es'}` : `há ${Math.round(months / 12)} ano(s)`;
};

/** DD/MM/AAAA HH:MM:SS na hora de Angola. */
export function formatAuditTimestamp(iso: string) {
    const parts = luandaParts(iso);
    if (!parts) return '—';
    const seconds = new Date(new Date(iso).getTime() + 3_600_000).getUTCSeconds();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(parts.day)}/${pad(parts.month + 1)}/${parts.year} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(seconds)}`;
}

export const daysAgo = (key: string, today = luandaTodayKey()) => daysBetweenKeys(key, today);
