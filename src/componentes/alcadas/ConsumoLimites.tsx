import { useMemo, useState } from 'react';
import { Building, Building2, Clock, RefreshCw, Search, User } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Switch } from '@/componentes/ui/switch';
import { OPERATION_LABELS, OPERATION_TYPES, SCOPE_LABELS, nextResets, sumUsage, type OperationType, type UsageMeter, type UsageRow } from '@/bibliotecas/alcadas';
import { MeterBar } from './campos';
import type { AlcadasState } from './useAlcadas';

const SOURCE: Record<UsageRow['source'], { label: string; css: string }> = {
    perfil: { label: 'Perfil', css: 'bg-muted text-muted-foreground' },
    individual: { label: 'Individual', css: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
    temporaria: { label: 'Temporária', css: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
    desativado: { label: 'Desativado', css: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
    'sem-limite': { label: 'Bloqueada', css: 'bg-slate-200 text-slate-700' },
};

const countdown = (target: Date, now: Date) => {
    const minutes = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60_000));
    const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), rest = minutes % 60;
    return days ? `${days} d ${hours} h` : `${hours} h ${String(rest).padStart(2, '0')} min`;
};

/** Soma de medidores sem contar duas vezes um volume partilhado (agência ou empresa toda). */
function combine(rows: UsageRow[], key: 'day' | 'month' | 'count'): UsageMeter {
    const seen = new Map<string, UsageMeter>();
    for (const row of rows) if (!seen.has(row.scopeId)) seen.set(row.scopeId, row[key]);
    const meters = [...seen.values()];
    const used = meters.reduce((sum, item) => sum + item.used, 0);
    const limit = meters.some(item => item.limit === null) ? null : meters.reduce((sum, item) => sum + (item.limit || 0), 0);
    return { used, limit, pct: limit ? Math.round((used / limit) * 1000) / 10 : null };
}

export function ConsumoLimites({ state }: { state: AlcadasState }) {
    const [view, setView] = useState<'users' | 'branches' | 'company'>('users');
    const [operation, setOperation] = useState<OperationType | 'all'>('all');
    const [branch, setBranch] = useState('all');
    const [search, setSearch] = useState('');
    const [onlyHigh, setOnlyHigh] = useState(false);
    const resets = nextResets(state.now);
    const branches = useMemo(() => [...new Set((state.data?.users || []).map(user => user.branchId || ''))], [state.data]);
    const rows = useMemo(() => state.usage.filter(row => (operation === 'all' || row.operationType === operation) && (branch === 'all' || (row.branchId || '__none__') === branch)
        && (!search.trim() || row.userName.toLowerCase().includes(search.trim().toLowerCase()))
        && (!onlyHigh || Math.max(row.day.pct ?? 0, row.month.pct ?? 0, row.count.pct ?? 0) >= 80))
        .sort((a, b) => Math.max(b.day.pct ?? 0, b.month.pct ?? 0, b.count.pct ?? 0) - Math.max(a.day.pct ?? 0, a.month.pct ?? 0, a.count.pct ?? 0) || a.userName.localeCompare(b.userName)),
    [state.usage, operation, branch, search, onlyHigh]);
    const grouped = useMemo(() => {
        const map = new Map<string, UsageRow[]>();
        for (const row of rows) {
            const key = view === 'company' ? row.operationType : `${row.branchId}|${row.operationType}`;
            map.set(key, [...(map.get(key) || []), row]);
        }
        return [...map.entries()];
    }, [rows, view]);
    const company = sumUsage(state.data?.ledger || [], 'disbursement', 'all', 'all', state.now);
    const global = state.policy?.global;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5 text-primary" /> Atualização automática a cada 30 s · última às <strong>{state.refreshedAt.toLocaleTimeString('pt-AO')}</strong></span>
                    <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-primary" /> Contador diário reinicia às 00:00 de Angola (faltam <strong>{countdown(resets.daily, state.now)}</strong>) · mensal a dia 1 (faltam <strong>{countdown(resets.monthly, state.now)}</strong>)</span>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void state.reload({ silent: true })}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border bg-card p-0.5">
                    {([['users', 'Utilizadores', User], ['branches', 'Agências', Building], ['company', 'Empresa', Building2]] as const).map(([key, label, Icon]) => (
                        <button key={key} type="button" onClick={() => setView(key)} className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold', view === key ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}><Icon className="h-3.5 w-3.5" /> {label}</button>
                    ))}
                </div>
                <Select value={operation} onValueChange={value => setOperation(value as OperationType | 'all')}>
                    <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todas as operações</SelectItem>{OPERATION_TYPES.map(op => <SelectItem key={op.id} value={op.id}>{op.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={branch} onValueChange={setBranch}>
                    <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todas as agências</SelectItem>{branches.map(id => <SelectItem key={id || '__none__'} value={id || '__none__'}>{state.branchName(id)}</SelectItem>)}</SelectContent>
                </Select>
                <div className="relative"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Procurar utilizador" className="h-9 w-56 pl-8" /></div>
                <label className="flex items-center gap-2 text-xs font-semibold"><Switch checked={onlyHigh} onCheckedChange={setOnlyHigh} /> Só acima de 80%</label>
            </div>

            {view === 'company' && global && (
                <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-2">
                    <MeterBar label="Desembolsos da empresa — hoje" meter={{ used: company.dayMinor, limit: global.companyDailyDisbursementMinor, pct: global.companyDailyDisbursementMinor ? Math.round(company.dayMinor / global.companyDailyDisbursementMinor * 1000) / 10 : null }} />
                    <MeterBar label="Desembolsos da empresa — este mês" meter={{ used: company.monthMinor, limit: global.companyMonthlyDisbursementMinor, pct: global.companyMonthlyDisbursementMinor ? Math.round(company.monthMinor / global.companyMonthlyDisbursementMinor * 1000) / 10 : null }} />
                </div>
            )}

            {view === 'users' ? (
                <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                            <tr><th className="p-3 text-left">Utilizador</th><th className="p-3 text-left">Operação</th><th className="p-3 text-left">Hoje</th><th className="p-3 text-left">Este mês</th><th className="p-3 text-left">Quantidade hoje</th></tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={`${row.userId}-${row.operationType}`} className="border-t align-top">
                                    <td className="p-3"><p className="font-semibold">{row.userName}</p><p className="text-xs text-muted-foreground">{state.profileName(row.role)} · {state.branchName(row.branchId)}</p></td>
                                    <td className="p-3"><p className="font-medium">{OPERATION_LABELS[row.operationType]}</p>
                                        <p className="mt-1 flex flex-wrap gap-1 text-[10px]"><span className="rounded-full bg-muted px-1.5 py-0.5">{SCOPE_LABELS[row.scope]}</span><span className={cn('rounded-full px-1.5 py-0.5 font-semibold', SOURCE[row.source].css)}>{SOURCE[row.source].label}</span></p></td>
                                    <td className="p-3">{row.operationType === 'client_export' ? <span className="text-xs text-muted-foreground">—</span> : <MeterBar meter={row.day} compact />}</td>
                                    <td className="p-3">{row.operationType === 'client_export' ? <span className="text-xs text-muted-foreground">—</span> : <MeterBar meter={row.month} compact />}</td>
                                    <td className="p-3">{row.count.limit !== null ? <MeterBar meter={row.count} unit="count" compact /> : <span className="text-xs text-muted-foreground">{row.count.used} operação(ões)</span>}</td>
                                </tr>
                            ))}
                            {!rows.length && <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">Sem consumo para mostrar com estes filtros.</td></tr>}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {grouped.map(([key, list]) => {
                        const op = list[0].operationType;
                        return (
                            <div key={key} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
                                <div>
                                    <p className="font-bold">{view === 'company' ? 'Empresa toda' : state.branchName(list[0].branchId)}</p>
                                    <p className="text-xs text-muted-foreground">{OPERATION_LABELS[op]} · {new Set(list.map(row => row.userId)).size} utilizador(es)</p>
                                </div>
                                {op !== 'client_export' && <MeterBar label="Hoje" meter={combine(list, 'day')} />}
                                {op !== 'client_export' && <MeterBar label="Este mês" meter={combine(list, 'month')} />}
                                {combine(list, 'count').limit !== null && <MeterBar label="Quantidade hoje" unit="count" meter={combine(list, 'count')} />}
                            </div>
                        );
                    })}
                    {!grouped.length && <p className="col-span-full rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Sem consumo para mostrar com estes filtros.</p>}
                </div>
            )}
        </div>
    );
}
