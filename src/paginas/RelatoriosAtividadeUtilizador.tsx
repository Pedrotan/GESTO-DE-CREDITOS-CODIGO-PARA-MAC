import { useEffect, useMemo, useState } from 'react';
import { Activity, Eye, FileDown, FileSpreadsheet, Filter, Loader2, Search, ShieldCheck, User } from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { db } from '@/bibliotecas/bd';
import { formatLuandaDateTime, luandaTodayKey, addDaysToKey } from '@/bibliotecas/fuso-angola';
import {
    ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, activityLabel, activityOrigin, activityReportDef, activityType, countByType, entityLabel, filterActivity,
    type ActivityLog, type ActivityType,
} from '@/bibliotecas/atividade-utilizador';
import { generateReportFromDef } from '@/componentes/creditos/RelatoriosCreditos';
import { Card, CardContent, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { useToast } from '@/componentes/ui/use-toast';

// Início do dia em Angola (UTC+1) no formato guardado no registo de auditoria.
const dayStartIso = (key: string) => new Date(`${key}T00:00:00+01:00`).toISOString();
const TYPE_TONE: Partial<Record<ActivityType, string>> = {
    cadastro: 'bg-emerald-100 text-emerald-800', edicao: 'bg-sky-100 text-sky-800', exclusao: 'bg-red-100 text-red-800', reposicao: 'bg-amber-100 text-amber-800',
    aprovacao: 'bg-emerald-100 text-emerald-800', rejeicao: 'bg-red-100 text-red-800', exportacao: 'bg-violet-100 text-violet-800', seguranca: 'bg-red-100 text-red-800',
    sessao_falhada: 'bg-orange-100 text-orange-800',
};
const CARD_TYPES: ActivityType[] = ['cadastro', 'edicao', 'exclusao', 'aprovacao', 'exportacao', 'inicio_sessao'];

/**
 * Relatórios de actividade dos utilizadores: lê o registo de auditoria completo do período, filtra por utilizador,
 * tipo de acção (cadastro, edição, exclusão…), área e texto, e gera o PDF ou o Excel com esses filtros. O registo de
 * auditoria é imutável (lei e cadeia de hashes): não se apagam acções.
 */
export default function UserActivityReports() {
    const { user } = useAuth();
    const { users, companySettings } = useData();
    const { toast } = useToast();
    const today = luandaTodayKey();
    const [startKey, setStartKey] = useState(addDaysToKey(today, -29));
    const [endKey, setEndKey] = useState(today);
    const [userId, setUserId] = useState('all');
    const [roleFilter, setRoleFilter] = useState('all');
    const [types, setTypes] = useState<ActivityType[]>([]);
    const [entity, setEntity] = useState('all');
    const [search, setSearch] = useState('');
    const [rows, setRows] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [detailUser, setDetailUser] = useState<{ id: string; name: string } | null>(null);

    // Registo completo do período (não só os mais recentes em memória).
    useEffect(() => {
        let alive = true;
        setLoading(true);
        const from = startKey ? dayStartIso(startKey) : '0000';
        const to = endKey ? dayStartIso(addDaysToKey(endKey, 1)) : '9999';
        db.all<ActivityLog>(`SELECT id, timestamp, userId, userName, action, entity, details, metadata FROM audit_logs
            WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp DESC LIMIT 50000`, [from, to])
            .then(result => { if (alive) setRows(result || []); })
            .catch(() => { if (alive) setRows([]); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [startKey, endKey]);

    const roleUserIds = useMemo(() => roleFilter === 'all' ? undefined : users.filter(u => u.role === roleFilter).map(u => u.id), [roleFilter, users]);
    const filters = useMemo(() => ({
        userIds: userId !== 'all' ? [userId] : roleUserIds, types, entities: entity !== 'all' ? [entity] : undefined, search, startKey, endKey,
    }), [userId, roleUserIds, types, entity, search, startKey, endKey]);
    const filtered = useMemo(() => filterActivity(rows, filters), [rows, filters]);
    const counts = useMemo(() => countByType(filtered), [filtered]);
    const entities = useMemo(() => [...new Set(rows.map(row => String(row.entity || '')).filter(Boolean))].sort((a, b) => entityLabel(a).localeCompare(entityLabel(b), 'pt')), [rows]);

    const perUser = useMemo(() => {
        const map = new Map<string, { id: string; name: string; total: number; counts: Record<ActivityType, number>; last: string }>();
        for (const log of filtered) {
            const id = String(log.userId || 'sistema');
            const entry = map.get(id) || { id, name: log.userName || 'Sistema', total: 0, counts: countByType([]), last: String(log.timestamp) };
            entry.total += 1; entry.counts[activityType(log)] += 1;
            if (String(log.timestamp) > entry.last) entry.last = String(log.timestamp);
            map.set(id, entry);
        }
        return [...map.values()].sort((a, b) => b.total - a.total);
    }, [filtered]);

    const toggleType = (type: ActivityType) => setTypes(previous => previous.includes(type) ? previous.filter(item => item !== type) : [...previous, type]);

    const download = async (format: 'pdf' | 'xlsx', onlyUser?: { id: string; name: string }) => {
        if (!user) return;
        const logs = onlyUser ? filtered.filter(log => String(log.userId || 'sistema') === onlyUser.id) : filtered;
        if (!logs.length) { toast({ title: 'Sem dados', description: 'Não há acções com estes filtros.', variant: 'destructive' }); return; }
        setBusy(`${format}-${onlyUser?.id || 'todos'}`);
        try {
            const usersText = onlyUser ? onlyUser.name : userId !== 'all' ? (users.find(u => u.id === userId)?.name || 'Utilizador') : roleFilter !== 'all' ? `Todos (${roleFilter === 'admin' ? 'administradores' : roleFilter === 'manager' ? 'gestores' : roleFilter})` : 'Todos os utilizadores';
            const def = activityReportDef(logs, filters, { users: usersText, scope: onlyUser || userId !== 'all' ? 'one' : 'all' });
            await generateReportFromDef(def, companySettings, { id: user.id, name: user.name, role: user.role } as any, format);
            toast({ title: 'Relatório gerado', description: `${logs.length} acção(ões) no relatório.` });
        } catch (error: any) {
            toast({ title: 'Não foi possível gerar o relatório', description: error?.message || String(error), variant: 'destructive' });
        } finally { setBusy(null); }
    };

    if (user?.role !== 'super_admin') {
        return (
            <MainLayout title="Relatórios de Actividade" subtitle="Acesso restrito">
                <div className="flex h-[60vh] items-center justify-center"><p className="text-muted-foreground">Acesso restrito ao Super Administrador.</p></div>
            </MainLayout>
        );
    }

    const detailLogs = detailUser ? filtered.filter(log => String(log.userId || 'sistema') === detailUser.id) : [];

    return (
        <MainLayout title="Relatórios de Actividade" subtitle="O que cada utilizador fez no sistema, com filtros e relatórios">
            <div className="space-y-5">
                <Card>
                    <CardContent className="space-y-4 pt-5">
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="text-xs font-bold">De<Input type="date" className="mt-1 h-9 w-40" value={startKey} max={endKey || undefined} onChange={event => setStartKey(event.target.value)} /></label>
                            <label className="text-xs font-bold">Até<Input type="date" className="mt-1 h-9 w-40" value={endKey} min={startKey || undefined} onChange={event => setEndKey(event.target.value)} /></label>
                            <div className="text-xs font-bold">Utilizador
                                <Select value={userId} onValueChange={setUserId}>
                                    <SelectTrigger className="mt-1 h-9 w-52"><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="all">Todos os utilizadores</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="text-xs font-bold">Perfil
                                <Select value={roleFilter} onValueChange={setRoleFilter}>
                                    <SelectTrigger className="mt-1 h-9 w-44"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos os perfis</SelectItem><SelectItem value="super_admin">Super Administradores</SelectItem>
                                        <SelectItem value="admin">Administradores</SelectItem><SelectItem value="manager">Gestores</SelectItem><SelectItem value="operator">Operadores</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="text-xs font-bold">Área
                                <Select value={entity} onValueChange={setEntity}>
                                    <SelectTrigger className="mt-1 h-9 w-48"><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="all">Todas as áreas</SelectItem>{entities.map(item => <SelectItem key={item} value={item}>{entityLabel(item)}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <label className="min-w-56 flex-1 text-xs font-bold">Pesquisar
                                <div className="relative mt-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input className="h-9 pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cliente, crédito, descrição…" /></div>
                            </label>
                        </div>
                        <div>
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold"><Filter className="h-3.5 w-3.5" /> Tipo de acção {types.length ? `(${types.length} escolhido(s))` : '(todas)'}</p>
                            <div className="flex flex-wrap gap-1.5">
                                {ACTIVITY_TYPES.map(type => (
                                    <button key={type} type="button" onClick={() => toggleType(type)}
                                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${types.includes(type) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                                        {ACTIVITY_TYPE_LABELS[type]}
                                    </button>
                                ))}
                                {types.length > 0 && <Button variant="ghost" size="sm" className="h-7" onClick={() => setTypes([])}>Limpar</Button>}
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                            <p className="text-sm text-muted-foreground">{loading ? 'A carregar…' : `${filtered.length} acção(ões) com estes filtros, de ${perUser.length} utilizador(es).`}</p>
                            <div className="flex gap-2">
                                <Button size="sm" disabled={!!busy || loading} onClick={() => void download('pdf')}>
                                    {busy === 'pdf-todos' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDown className="mr-1.5 h-4 w-4" />} Baixar relatório (PDF)
                                </Button>
                                <Button size="sm" variant="outline" disabled={!!busy || loading} onClick={() => void download('xlsx')}>
                                    {busy === 'xlsx-todos' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" />} Excel
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1"><CardTitle className="text-xs font-semibold">Total de acções</CardTitle><Activity className="h-4 w-4 text-muted-foreground" /></CardHeader>
                        <CardContent><div className="text-2xl font-bold">{filtered.length}</div><p className="text-[11px] text-muted-foreground">No período e filtros</p></CardContent>
                    </Card>
                    {CARD_TYPES.map(type => (
                        <button key={type} type="button" onClick={() => setTypes([type])} className="text-left">
                            <Card className={types.length === 1 && types[0] === type ? 'border-primary' : ''}>
                                <CardHeader className="pb-1"><CardTitle className="text-xs font-semibold">{ACTIVITY_TYPE_LABELS[type]}</CardTitle></CardHeader>
                                <CardContent><div className="text-2xl font-bold">{counts[type]}</div><p className="text-[11px] text-muted-foreground">Clique para filtrar</p></CardContent>
                            </Card>
                        </button>
                    ))}
                </div>

                <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead>Utilizador</TableHead><TableHead className="text-center">Total</TableHead>
                                {CARD_TYPES.map(type => <TableHead key={type} className="text-center">{ACTIVITY_TYPE_LABELS[type]}</TableHead>)}
                                <TableHead className="text-right">Última acção</TableHead><TableHead className="text-right">Relatórios</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />A carregar acções…</TableCell></TableRow>
                            ) : perUser.length === 0 ? (
                                <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">Nenhuma acção com estes filtros.</TableCell></TableRow>
                            ) : perUser.map(entry => (
                                <TableRow key={entry.id}>
                                    <TableCell><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary"><User className="h-4 w-4" /></span><span className="font-medium">{entry.name}</span></div></TableCell>
                                    <TableCell className="text-center font-bold">{entry.total}</TableCell>
                                    {CARD_TYPES.map(type => <TableCell key={type} className="text-center">{entry.counts[type] || '—'}</TableCell>)}
                                    <TableCell className="text-right text-xs text-muted-foreground">{formatLuandaDateTime(entry.last)}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon" title="Ver as acções" onClick={() => setDetailUser({ id: entry.id, name: entry.name })}><Eye className="h-4 w-4 text-primary" /></Button>
                                            <Button variant="ghost" size="icon" title="Relatório deste utilizador (PDF)" disabled={!!busy} onClick={() => void download('pdf', entry)}><FileDown className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" title="Relatório deste utilizador (Excel)" disabled={!!busy} onClick={() => void download('xlsx', entry)}><FileSpreadsheet className="h-4 w-4 text-emerald-600" /></Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> O registo de actividade é protegido e não pode ser apagado nem alterado: é a prova do que cada utilizador fez.</p>
            </div>

            <Dialog open={!!detailUser} onOpenChange={open => { if (!open) setDetailUser(null); }}>
                <DialogContent className="flex max-h-[85vh] max-w-5xl flex-col">
                    <DialogHeader>
                        <DialogTitle>Acções de {detailUser?.name}</DialogTitle>
                        <DialogDescription>{detailLogs.length} acção(ões) com os filtros escolhidos.</DialogDescription>
                    </DialogHeader>
                    <div className="mt-2 flex-1 overflow-auto rounded-md border">
                        <Table>
                            <TableHeader><TableRow><TableHead className="w-44">Data e hora</TableHead><TableHead>Tipo de acção</TableHead><TableHead>Área</TableHead><TableHead>Descrição</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {detailLogs.map(log => (
                                    <TableRow key={log.id}>
                                        <TableCell className="text-xs">{formatLuandaDateTime(log.timestamp)}</TableCell>
                                        <TableCell><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_TONE[activityType(log)] || 'bg-slate-100 text-slate-700'}`}>{activityLabel(log)}</span></TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{entityLabel(log.entity)}</TableCell>
                                        <TableCell className="text-xs">{log.details}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{activityOrigin(log)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}
