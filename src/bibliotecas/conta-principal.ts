// Super Administrador principal (a conta do proprietário do sistema): acesso total, sem excepções. Não pode ter
// permissões retiradas, nem ser eliminado ou desactivado por outros utilizadores. Todos os outros utilizadores —
// incluindo outros Super Administradores — têm só as permissões que lhes forem atribuídas.
//
// Regras partilhadas pela interface e pelo processo principal (que é quem as impõe de facto).

export const isPrimaryOwner = (user: { isOwner?: unknown } | null | undefined) =>
    Boolean(user) && (user!.isOwner === true || user!.isOwner === 1 || user!.isOwner === '1');

/** Permissões de páginas que antes não tinham nenhuma (todas as páginas do menu passam a ter uma). */
export const PAGE_PERMISSIONS = ['view_market', 'use_simulator', 'view_chat', 'manage_suppliers'] as const;

/** Todas as permissões atribuíveis (as mesmas do editor de utilizadores). */
export const ALL_ASSIGNABLE_PERMISSIONS = [
    'manage_users', 'manage_clients', 'view_credits', 'approve_loans', 'manage_payments', 'view_reports', 'view_user_reports',
    'manage_settings', 'view_audit_logs', 'manage_limits', 'manage_gateways', 'manage_fiscal', 'generate_fiscal_docs',
    'manage_warranties', 'manage_legal', 'edit_credit_rate', ...PAGE_PERMISSIONS,
] as const;

/** Colunas da tabela users que dão ou tiram poder: só a conta principal as altera nos outros utilizadores. */
export const PRIVILEGE_COLUMNS = ['role', 'permissions', 'isOwner', 'status'] as const;

/** Lê as colunas alteradas por um UPDATE users SET ... WHERE id = ? (nomes em minúsculas). */
export const updatedUserColumns = (sql: string): string[] => {
    const setClause = sql.replace(/\s+/gu, ' ').match(/^UPDATE\s+["'`\[]?users["'`\]]?\s+SET\s+(.+?)\s+WHERE\s/iu)?.[1] || '';
    return setClause.split(',').map(part => part.split('=')[0].replace(/["'`\[\]]/gu, '').trim().toLowerCase()).filter(Boolean);
};

/** Divide por vírgulas que não estão dentro de parênteses nem de texto entre aspas. */
const splitTopLevel = (text: string) => {
    const parts: string[] = [];
    let depth = 0; let quote = ''; let current = '';
    for (const char of text) {
        if (quote) { if (char === quote) quote = ''; current += char; continue; }
        if (char === "'" || char === '"') { quote = char; current += char; continue; }
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;
        if (char === ',' && depth === 0) { parts.push(current); current = ''; continue; }
        current += char;
    }
    if (current.trim()) parts.push(current);
    return parts;
};

const literalOrParam = (expression: string, params: unknown[], cursor: { index: number }) => {
    const value = expression.trim();
    const placeholders = (value.match(/\?/g) || []).length;
    let result: unknown;
    if (value === '?') result = params[cursor.index];
    else if (/^'.*'$/su.test(value)) result = value.slice(1, -1);
    else if (/^-?\d+(\.\d+)?$/u.test(value)) result = Number(value);
    else if (/^NULL$/iu.test(value)) result = null;
    else result = undefined; // expressão (COALESCE(...), etc.)
    cursor.index += placeholders;
    return result;
};

/** Valor atribuído a uma coluna num UPDATE users SET ... (parâmetro ou literal); undefined se não for atribuída. */
export const updatedUserValue = (sql: string, params: unknown[], column: string): unknown => {
    const setClause = sql.replace(/\s+/gu, ' ').match(/^UPDATE\s+["'`\[]?users["'`\]]?\s+SET\s+(.+?)\s+WHERE\s/iu)?.[1] || '';
    const cursor = { index: 0 };
    for (const part of splitTopLevel(setClause)) {
        const [name, ...rest] = part.split('=');
        const value = literalOrParam(rest.join('='), params, cursor);
        if (name.replace(/["'`\[\]]/gu, '').trim().toLowerCase() === column.toLowerCase()) return value;
    }
    return undefined;
};

/** Valor de uma coluna num INSERT INTO users (...) VALUES (...); undefined se não existir. */
export const insertedUserValue = (sql: string, params: unknown[], column: string): unknown => {
    const columns = insertedUserColumns(sql);
    const values = splitTopLevel(sql.replace(/\s+/gu, ' ').match(/\bVALUES\s*\((.+)\)\s*$/iu)?.[1] || '');
    const cursor = { index: 0 };
    let found: unknown;
    values.forEach((expression, index) => {
        const value = literalOrParam(expression, params, cursor);
        if (columns[index] === column.toLowerCase()) found = value;
    });
    return found;
};

/** Colunas indicadas num INSERT INTO users (...) (nomes em minúsculas). */
export const insertedUserColumns = (sql: string): string[] =>
    (sql.match(/\busers\s*\(([^)]+)\)/iu)?.[1] || '').split(',').map(column => column.replace(/["'`\[\]]/gu, '').trim().toLowerCase()).filter(Boolean);

export const parsePermissionList = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(String);
    try { const parsed = JSON.parse(String(value || '[]')); return Array.isArray(parsed) ? parsed.map(String) : []; }
    catch { return []; }
};

export type UserMutationCheck = {
    kind: 'insert' | 'update' | 'delete';
    sql: string;
    params: unknown[];
    actor: { id: string; isOwner?: unknown; permissions?: unknown };
    /** Utilizador alvo (UPDATE/DELETE ... WHERE id = ?), lido da base pelo processo principal. */
    target?: { id: string; isOwner?: unknown; role?: string } | null;
};

/**
 * Decide se uma alteração à tabela users é permitida pelas regras da conta principal. Devolve null quando é
 * permitida, ou a mensagem de recusa. `changesPrivileges` indica se deve ficar na auditoria de permissões.
 */
export const checkUserMutation = (input: UserMutationCheck): { error: string | null; changesPrivileges: boolean } => {
    const actorIsOwner = isPrimaryOwner(input.actor);
    if (input.kind === 'insert') {
        const columns = insertedUserColumns(input.sql);
        if (columns.includes('isowner')) return { error: 'A conta principal não pode ser criada nem atribuída por outro utilizador.', changesPrivileges: true };
        if (actorIsOwner) return { error: null, changesPrivileges: true };
        if (String(insertedUserValue(input.sql, input.params, 'role')) === 'super_admin') {
            return { error: 'Só o Super Administrador principal pode criar Super Administradores.', changesPrivileges: true };
        }
        // Quem não é a conta principal só pode dar as permissões que ele próprio tem.
        if (columns.includes('permissions')) {
            const own = new Set(parsePermissionList(input.actor.permissions));
            const extra = parsePermissionList(insertedUserValue(input.sql, input.params, 'permissions')).filter(permission => !own.has(permission));
            if (extra.length) return { error: `Não pode atribuir permissões que não tem: ${extra.join(', ')}.`, changesPrivileges: true };
        }
        return { error: null, changesPrivileges: true };
    }
    const targetIsOwner = isPrimaryOwner(input.target);
    if (input.kind === 'delete') {
        if (targetIsOwner) return { error: 'O Super Administrador principal não pode ser eliminado.', changesPrivileges: true };
        return { error: null, changesPrivileges: true };
    }
    const columns = updatedUserColumns(input.sql);
    if (columns.includes('isowner')) return { error: 'A conta principal não pode ser alterada.', changesPrivileges: true };
    const privileged = columns.filter(column => (PRIVILEGE_COLUMNS as readonly string[]).includes(column));
    const selfUpdate = input.target ? String(input.target.id) === String(input.actor.id) : false;
    if (targetIsOwner && !selfUpdate) {
        return { error: 'O Super Administrador principal só pode ser alterado por ele próprio.', changesPrivileges: privileged.length > 0 };
    }
    if (targetIsOwner && selfUpdate) {
        // A própria conta principal não perde o papel nem se bloqueia por engano.
        if (columns.includes('role') && String(updatedUserValue(input.sql, input.params, 'role')) !== 'super_admin') {
            return { error: 'O Super Administrador principal não pode mudar o próprio papel.', changesPrivileges: true };
        }
        if (columns.includes('status') && !['active', 'offline', 'online'].includes(String(updatedUserValue(input.sql, input.params, 'status')))) {
            return { error: 'O Super Administrador principal não pode desactivar a própria conta.', changesPrivileges: true };
        }
        return { error: null, changesPrivileges: false };
    }
    const changesPermissions = columns.includes('role') || columns.includes('permissions');
    if (changesPermissions && !actorIsOwner) {
        return { error: 'Só o Super Administrador principal pode alterar perfis e permissões.', changesPrivileges: true };
    }
    return { error: null, changesPrivileges: privileged.length > 0 };
};

/**
 * Autoridade total: o Super Administrador (nível máximo) e a conta principal passam por cima das regras de
 * segregação de funções ("quatro olhos") — podem decidir os próprios pedidos e dispensam segundo aprovador.
 * Cada vez que isso acontece fica marcado na auditoria. Os restantes perfis mantêm a segregação.
 */
export const FULL_AUTHORITY_ROLE = 'super_admin';
export const hasFullAuthority = (user: { role?: unknown; isOwner?: unknown } | null | undefined) =>
    Boolean(user) && (String(user!.role) === FULL_AUTHORITY_ROLE || isPrimaryOwner(user));
