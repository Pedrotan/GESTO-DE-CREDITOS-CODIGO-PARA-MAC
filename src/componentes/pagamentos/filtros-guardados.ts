import { useEffect, useState } from 'react';
import type { PaymentFilters } from '@/bibliotecas/pagamentos-analise';
import type { PeriodSelection } from '@/bibliotecas/periodos';

/** Combinações de filtros guardadas com um nome, por utilizador (preferência deste computador). */
export type SavedFilter = { id: string; name: string; filters: PaymentFilters; period?: PeriodSelection };

const savedKey = (userId?: string) => `pagamentos:filtros-guardados:${userId || 'anonimo'}`;

export function useSavedFilters(userId?: string) {
    const [saved, setSaved] = useState<SavedFilter[]>([]);
    useEffect(() => {
        try { setSaved(JSON.parse(localStorage.getItem(savedKey(userId)) || '[]')); } catch { setSaved([]); }
    }, [userId]);
    const persist = (next: SavedFilter[]) => {
        setSaved(next);
        try { localStorage.setItem(savedKey(userId), JSON.stringify(next)); } catch { /* preferência local */ }
    };
    return {
        saved,
        save: (name: string, filters: PaymentFilters, period?: PeriodSelection) => persist([...saved.filter(item => item.name.toLowerCase() !== name.toLowerCase()), { id: crypto.randomUUID(), name, filters, period }]),
        remove: (id: string) => persist(saved.filter(item => item.id !== id)),
    };
}

