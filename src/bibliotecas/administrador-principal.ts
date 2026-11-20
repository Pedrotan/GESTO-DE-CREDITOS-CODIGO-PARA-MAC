// Administrador principal: entre os vários Super Administradores, um é o principal. Só ele muda o nível (perfil e
// permissões) de outro Super Administrador, e ninguém mexe no nível dele. Fica em `shared_settings` (sincronizado),
// por isso vale em todos os computadores e na versão web.
//
// Designação: enquanto não houver principal, qualquer Super Administrador escolhe um (ele próprio ou outro); depois
// disso só o principal actual transfere a função. Regras partilhadas pela interface e pelo processo principal.

export const CHAVE_ADMIN_PRINCIPAL = 'admin_principal_v1';

export type AdminPrincipal = { userId: string; nome: string; designadoPor: string; designadoPorNome: string; em: string };
type Utilizador = { id: string; role?: unknown; status?: unknown; name?: unknown } | null | undefined;

export const lerAdminPrincipal = (value: unknown): AdminPrincipal | null => {
    try {
        const v = typeof value === 'string' ? JSON.parse(value) : value;
        return v && typeof v === 'object' && typeof (v as AdminPrincipal).userId === 'string' && (v as AdminPrincipal).userId ? v as AdminPrincipal : null;
    } catch { return null; }
};

const activo = (u: Utilizador) => !['blocked', 'inactive', 'pending_activation', 'deleted'].includes(String(u?.status || 'active'));

/** null quando o actor pode designar o alvo como Administrador principal; senão, o motivo da recusa. */
export const motivoRecusaDesignar = (actor: Utilizador, alvo: Utilizador, actual: AdminPrincipal | null): string | null => {
    if (!actor || String(actor.role) !== 'super_admin') return 'Só um Super Administrador pode designar o Administrador principal.';
    if (actual && actual.userId !== actor.id) return `Só o Administrador principal actual (${actual.nome}) pode transferir esta função.`;
    if (!alvo) return 'Utilizador não encontrado.';
    if (String(alvo.role) !== 'super_admin') return 'O Administrador principal tem de ser um Super Administrador.';
    if (!activo(alvo)) return 'O Administrador principal tem de ter a conta activa.';
    if (actual && actual.userId === alvo.id) return 'Este utilizador já é o Administrador principal.';
    return null;
};

/**
 * null quando o actor pode mudar o nível, as permissões ou o estado do alvo (ou eliminá-lo) pelas regras do
 * Administrador principal; senão, o motivo. Sem principal designado vale a regra anterior (qualquer Super Administrador).
 */
export const motivoRecusaNivel = (actor: Utilizador, alvo: Utilizador, principal: AdminPrincipal | null): string | null => {
    if (!principal || !actor || !alvo) return null;
    if (alvo.id === principal.userId) {
        return actor.id === principal.userId
            ? 'Transfira primeiro a função de Administrador principal para outro Super Administrador.'
            : `O nível do Administrador principal (${principal.nome}) não pode ser alterado por outros utilizadores.`;
    }
    if (String(alvo.role) === 'super_admin' && actor.id !== principal.userId)
        return `Só o Administrador principal (${principal.nome}) pode mudar o nível de outro Super Administrador.`;
    return null;
};
