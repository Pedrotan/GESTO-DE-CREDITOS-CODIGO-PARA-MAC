import { useCallback, useMemo } from 'react';
import { useData } from '@/contextos/ContextoDados';

/** Alguns lançamentos guardam o ID do utilizador (concessões); mostra sempre o nome quando o conhece. */
export function useNomeUtilizador() {
    const { users } = useData();
    const names = useMemo(() => new Map((users || []).map((user: any) => [String(user.id), String(user.name || user.username || user.email || user.id)])), [users]);
    return useCallback((value?: string | null) => (value ? names.get(String(value)) || value : '—'), [names]);
}
