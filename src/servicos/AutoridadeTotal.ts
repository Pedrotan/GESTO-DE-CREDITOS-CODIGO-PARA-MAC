import { db } from '@/bibliotecas/bd';
import { hasFullAuthority } from '@/bibliotecas/conta-principal';

/**
 * Autoridade total lida da base de dados (nunca do ecrã): papel super_admin ou conta principal.
 * A coluna isOwner só existe na versão desktop; na web a leitura falha e conta apenas o papel.
 */
export async function actorHasFullAuthority(actorId?: string | null): Promise<boolean> {
    if (!actorId) return false;
    const row = await db.get<{ role?: string }>('SELECT role FROM users WHERE id = ?', [actorId]).catch(() => undefined);
    const owner = await db.get<{ isOwner?: number }>('SELECT isOwner FROM users WHERE id = ?', [actorId]).catch(() => undefined);
    return hasFullAuthority({ role: row?.role, isOwner: owner?.isOwner });
}
