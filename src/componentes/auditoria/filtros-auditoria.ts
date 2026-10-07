import { useEffect, useState } from 'react';
import { ROLES } from '@/tipos/autenticacao';
import { ACTION_LABELS, MODULE_LABELS, RESULT_LABELS, SEVERITY_LABELS, type AuditFilters, type AuditPeriod } from '@/bibliotecas/auditoria-analise';

export type SavedAuditFilter = { id: string; name: string; filters: AuditFilters; period: AuditPeriod };
const savedKey = (userId?: string) => `auditoria:filtros-guardados:${userId || 'anonimo'}`;

export function useSavedAuditFilters(userId?: string) {
    const [saved, setSaved] = useState<SavedAuditFilter[]>([]);
    useEffect(() => { try { setSaved(JSON.parse(localStorage.getItem(savedKey(userId)) || '[]')); } catch { setSaved([]); } }, [userId]);
    const persist = (next: SavedAuditFilter[]) => { setSaved(next); try { localStorage.setItem(savedKey(userId), JSON.stringify(next)); } catch { /* preferência local */ } };
    return {
        saved,
        save: (name: string, filters: AuditFilters, period: AuditPeriod) => persist([...saved.filter(item => item.name.toLowerCase() !== name.toLowerCase()), { id: crypto.randomUUID(), name, filters, period }]),
        remove: (id: string) => persist(saved.filter(item => item.id !== id)),
    };
}

export function chipsOf(filters: AuditFilters, userName: (id: string) => string) {
    const chips: Array<{ key: string; label: string; clear: Partial<AuditFilters> }> = [];
    const list = (field: keyof AuditFilters, prefix: string, label: (value: string) => string) => (filters[field] as string[]).forEach(value =>
        chips.push({ key: `${field}:${value}`, label: `${prefix}: ${label(value)}`, clear: { [field]: (filters[field] as string[]).filter(item => item !== value) } as Partial<AuditFilters> }));
    list('users', 'Utilizador', userName);
    list('roles', 'Perfil', value => ROLES[value]?.label || value);
    list('modules', 'Módulo', value => MODULE_LABELS[value as keyof typeof MODULE_LABELS] || value);
    list('actions', 'Ação', value => ACTION_LABELS[value as keyof typeof ACTION_LABELS] || value);
    list('severities', 'Gravidade', value => SEVERITY_LABELS[value as keyof typeof SEVERITY_LABELS] || value);
    list('results', 'Resultado', value => RESULT_LABELS[value as keyof typeof RESULT_LABELS] || value);
    if (filters.ip.trim()) chips.push({ key: 'ip', label: `IP: ${filters.ip.trim()}`, clear: { ip: '' } });
    if (filters.entity.trim()) chips.push({ key: 'entity', label: `Entidade: ${filters.entity.trim()}`, clear: { entity: '' } });
    if (filters.search.trim()) chips.push({ key: 'search', label: `Pesquisa: «${filters.search.trim()}»`, clear: { search: '' } });
    return chips;
}
