import { useCallback, useEffect, useMemo, useState } from 'react';
import { sqlite } from '@/bibliotecas/adaptador-sqlite';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';
import { rebuildBrowserReplica, replicaBackupAt, restoreBrowserReplicaBackup, reprocessRetainedOperations, syncCloudNow, getLastCloudSyncStatus } from '@/servicos/ServicoSincronizacaoCloud';
import { useData } from '@/contextos/ContextoDados';
import { Fragment } from 'react';
import { CONFLICT_STATUS_LABELS, conflictArchiveStatements, conflictNote, conflictOperationDetails, conflictReason, conflictStatus, entityLabel, filterConflicts, type SyncConflict } from '@/bibliotecas/sync-conflitos';
import { downloadConflictReport } from '@/bibliotecas/sync-conflitos-relatorio';
import { RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, Archive, ArchiveRestore, Download, Search, ChevronLeft, ChevronRight, ArrowUpDown, CloudDownload, History } from 'lucide-react';

const dateText = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('pt-AO') : '—';
const selectClass = 'h-10 rounded-md border border-input bg-background px-3 text-sm';
const readConflicts = () => sqlite.all<SyncConflict>(`SELECT id, entityType, entityId, operation, status, createdAt, resolutionNote, resolvedBy, resolvedAt
    FROM sync_conflicts ORDER BY createdAt DESC, id ASC`);

export function ConflictReview({ actorId, actorName, canManage }: { actorId?: string; actorName?: string; canManage: boolean }) {
    const { companySettings } = useData();
    const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [checked, setChecked] = useState<string[]>([]);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('pending');
    const [entity, setEntity] = useState('all');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [ascending, setAscending] = useState(false);
    const [archiveDialog, setArchiveDialog] = useState<{ action: 'archive' | 'restore'; ids: string[] } | null>(null);
    const [archiveNote, setArchiveNote] = useState('');

    const refresh = useCallback(async () => {
        setLoading(true);
        try { setConflicts(await readConflicts()); setChecked([]); setError(''); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível ler os conflitos.'); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { void refresh(); }, [refresh]);
    useEffect(() => { setPage(1); setChecked([]); }, [search, status, entity, pageSize]);
    const filtered = useMemo(() => filterConflicts(conflicts, search, status, entity)
        .sort((a, b) => (ascending ? 1 : -1) * (a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))), [conflicts, search, status, entity, ascending]);
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, pages);
    const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const selectable = visible.filter(row => row.status === 'pending' || conflictStatus(row) === 'archived');
    const detail = conflicts.find(row => row.id === selected);
    const counts = conflicts.reduce<Record<string, number>>((result, row) => { const key = conflictStatus(row); result[key] = (result[key] || 0) + 1; return result; }, {});
    const reportError = (cause: unknown) => setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.');

    const handleReprocess = async () => {
        setBusy(true); setError(''); setSuccess('');
        try { const count = await reprocessRetainedOperations(); await syncCloudNow(); await refresh(); setSuccess(`${count} registo(s) seguro(s) reprocessados. Os restantes continuam disponíveis para revisão.`); }
        catch (cause) { reportError(cause); } finally { setBusy(false); }
    };
    const [rebuildOpen, setRebuildOpen] = useState(false);
    const handleRebuild = async () => {
        setBusy(true); setError('');
        try { await syncCloudNow(); await rebuildBrowserReplica(); }
        catch (cause) { reportError(cause); setBusy(false); setRebuildOpen(false); }
    };
    const decide = async (decision: 'accepted' | 'rejected') => {
        if (!detail || detail.status !== 'pending' || !actorId || !actorName || !canManage) return;
        if (note.trim().length < 10 || note.trim().length > 1000) { setError('Descreva a decisão em 10 a 1000 caracteres.'); return; }
        setBusy(true); setError('');
        try {
            const now = new Date().toISOString();
            await sqlite.transaction([
                { sql: `UPDATE sync_conflicts SET status = ?, resolutionNote = ?, resolvedBy = ?, resolvedAt = ? WHERE id = ? AND status = 'pending'`,
                    params: [decision, note.trim(), actorId, now, detail.id], expectChanges: 1 },
                { sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                        VALUES (?, ?, ?, ?, 'update', 'credit', ?, ?)`,
                    params: [crypto.randomUUID(), now, actorId, actorName, `Conflito de sincronização ${decision === 'accepted' ? 'reconciliado' : 'rejeitado'}`,
                        JSON.stringify({ conflictId: detail.id, entityType: detail.entityType, entityId: detail.entityId, status: decision, explanation: note.trim() })] },
            ]);
            setSelected(null); setNote(''); await syncCloudNow(); await refresh(); setSuccess('Decisão registada no histórico.');
        } catch (cause) { reportError(cause); } finally { setBusy(false); }
    };
    const openArchive = (action: 'archive' | 'restore', ids: string[]) => {
        setArchiveNote(action === 'archive' ? 'Arquivado pelo administrador sem aplicar a alteração remota.' : 'Restaurado pelo administrador para nova análise e sincronização.');
        setArchiveDialog({ action, ids }); setError('');
    };
    const saveArchive = async () => {
        if (!archiveDialog || !actorId || !actorName || !canManage) return;
        setBusy(true); setError('');
        try {
            const rows = conflicts.filter(row => archiveDialog.ids.includes(row.id));
            if (rows.length !== archiveDialog.ids.length) throw new Error('A selecção mudou. Atualize a tabela.');
            await sqlite.transaction(conflictArchiveStatements(rows, archiveDialog.action, actorId, actorName, archiveNote));
            const message = archiveDialog.action === 'archive' ? `${rows.length} registo(s) arquivados. Consulte-os no filtro Arquivados.` : `${rows.length} registo(s) restaurados para a fila pendente.`;
            setArchiveDialog(null); setChecked([]); await syncCloudNow(); await refresh(); setSuccess(message);
        } catch (cause) { reportError(cause); } finally { setBusy(false); }
    };
    const downloadReport = async (format: string) => {
        if (!format || !canManage) return;
        setExporting(true); setError('');
        try {
            const rows = await readConflicts();
            const cloud = getLastCloudSyncStatus();
            await downloadConflictReport(format, rows, { company: companySettings.name, nif: companySettings.nif, server: companySettings.syncUrl,
                syncState: cloud.state, lastAttempt: cloud.at, pending: cloud.pending || 0 });
            setSuccess(`Relatório completo descarregado com ${rows.length} registo(s), incluindo o arquivo.`);
        } catch (cause) { reportError(cause); } finally { setExporting(false); }
    };
    const selectionFor = (action: 'archive' | 'restore') => checked.filter(id => conflicts.some(row => row.id === id && (action === 'archive' ? row.status === 'pending' : conflictStatus(row) === 'archived')));

    return <Card className="card-elevated border-none shadow-lg">
        <CardHeader><div className="flex flex-wrap items-start justify-between gap-4">
            <div><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />Conflitos de Sincronização</CardTitle>
                <CardDescription className="mt-2">Consulte e arquive alterações que precisam de revisão. Arquivar retira da fila sem aplicar a alteração; conserva o registo e permite restaurá-lo.</CardDescription></div>
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" disabled={busy || loading} onClick={() => void refresh()}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Atualizar</Button>
                {canManage && <label className="flex items-center gap-2 rounded-md border px-2 text-sm"><Download className="h-4 w-4" /><select aria-label="Baixar relatório completo" className="h-9 max-w-52 bg-background text-sm" disabled={exporting || loading} value="" onChange={event => void downloadReport(event.target.value)}>
                    <option value="">{exporting ? 'A gerar relatório…' : 'Baixar relatório completo'}</option><option value="pdf">PDF completo</option><option value="csv">Folha de cálculo (CSV) completa</option><option value="json">Ficheiro técnico (JSON) com as operações completas</option>
                </select></label>}
                {canManage && <Button size="sm" disabled={busy || loading} onClick={() => void handleReprocess()}><ShieldCheck className="mr-2 h-4 w-4" />Reprocessar registos seguros</Button>}
                {canManage && !window.electronAPI && <Button variant="outline" size="sm" disabled={busy || loading} onClick={() => { setError(''); setRebuildOpen(true); }}><CloudDownload className="mr-2 h-4 w-4" />Receber tudo de novo da nuvem</Button>}
                {!window.electronAPI && replicaBackupAt() && <Button variant="outline" size="sm" disabled={busy} title="Repõe a cópia deste navegador guardada antes de «Receber tudo de novo» e recebe por cima o que mudou na nuvem."
                    onClick={() => { if (window.confirm(`Repor a cópia deste navegador de ${new Date(replicaBackupAt()!).toLocaleString('pt-AO')}? O que mudou na nuvem desde então volta a ser recebido por cima.`)) { try { restoreBrowserReplicaBackup(); } catch (cause) { reportError(cause); } } }}>
                    <History className="mr-2 h-4 w-4" />Repor cópia anterior
                </Button>}
            </div>
        </div></CardHeader>
        <CardContent className="space-y-4">
            {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            {success && <p role="status" className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />{success}</p>}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Object.entries(CONFLICT_STATUS_LABELS).map(([key, label]) => <button type="button" key={key} onClick={() => setStatus(key)} className={`rounded-lg border p-3 text-left ${status === key ? 'border-primary bg-primary/5' : 'bg-muted/20'}`}><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-xl">{counts[key] || 0}</strong></button>)}</div>
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-60 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Pesquisar conflitos" className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar identificador, tipo, motivo ou decisão…" /></div>
                <select aria-label="Estado dos conflitos" className={selectClass} value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todos os estados</option>{Object.entries(CONFLICT_STATUS_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
                <select aria-label="Tipo de registo" className={selectClass} value={entity} onChange={event => setEntity(event.target.value)}><option value="all">Todos os tipos</option>{[...new Set(conflicts.map(row => row.entityType))].sort((a, b) => entityLabel(a).localeCompare(entityLabel(b), 'pt')).map(type => <option key={type} value={type}>{entityLabel(type)}</option>)}</select>
                {canManage && <><Button variant="outline" disabled={busy || !selectionFor('archive').length} onClick={() => openArchive('archive', selectionFor('archive'))}><Archive className="mr-2 h-4 w-4" />Arquivar seleção</Button>
                    <Button variant="outline" disabled={busy || !selectionFor('restore').length} onClick={() => openArchive('restore', selectionFor('restore'))}><ArchiveRestore className="mr-2 h-4 w-4" />Restaurar seleção</Button></>}
            </div>
            <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow>
                {canManage && <TableHead className="w-10"><input type="checkbox" aria-label="Selecionar registos desta página" disabled={busy || !selectable.length} checked={!!selectable.length && selectable.every(row => checked.includes(row.id))} onChange={event => setChecked(event.target.checked ? selectable.map(row => row.id) : [])} /></TableHead>}
                <TableHead><button type="button" className="flex items-center gap-1" onClick={() => setAscending(value => !value)}>Data <ArrowUpDown className="h-3 w-3" /></button></TableHead><TableHead>Tipo / registo</TableHead><TableHead>Motivo</TableHead><TableHead>Estado</TableHead><TableHead>Decisão / arquivo</TableHead><TableHead>Ações</TableHead>
            </TableRow></TableHeader><TableBody>{visible.map(row => <TableRow key={row.id}>
                {canManage && <TableCell><input type="checkbox" aria-label={`Selecionar conflito ${row.id}`} disabled={busy || !(row.status === 'pending' || conflictStatus(row) === 'archived')} checked={checked.includes(row.id)} onChange={event => setChecked(value => event.target.checked ? [...value, row.id] : value.filter(id => id !== row.id))} /></TableCell>}
                <TableCell className="whitespace-nowrap text-xs">{dateText(row.createdAt)}</TableCell><TableCell><strong className="block text-xs">{entityLabel(row.entityType)}</strong><span className="block max-w-64 break-all text-xs text-muted-foreground">{row.entityId || 'Sem identificador de registo'}</span></TableCell>
                <TableCell className="min-w-56 max-w-md"><span className="line-clamp-3 text-xs" title={conflictReason(row)}>{conflictReason(row) || 'Sem motivo indicado'}</span></TableCell>
                <TableCell><span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs ${row.status === 'pending' ? 'bg-amber-100 text-amber-800' : conflictStatus(row) === 'archived' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800'}`}>{CONFLICT_STATUS_LABELS[conflictStatus(row)]}</span></TableCell>
                <TableCell className="max-w-xs"><span className="line-clamp-2 text-xs">{conflictNote(row) || '—'}</span><span className="block text-xs text-muted-foreground">{row.resolvedAt ? dateText(row.resolvedAt) : ''}</span></TableCell>
                <TableCell><div className="flex gap-1"><Button variant="outline" size="sm" disabled={busy} onClick={() => { setSelected(row.id); setNote(''); }}>Detalhes{canManage && row.status === 'pending' ? ' / Decidir' : ''}</Button>
                    {canManage && row.status === 'pending' && <Button variant="ghost" size="sm" disabled={busy} onClick={() => openArchive('archive', [row.id])} aria-label={`Arquivar conflito ${row.id}`}><Archive className="h-4 w-4" /></Button>}
                    {canManage && conflictStatus(row) === 'archived' && <Button variant="ghost" size="sm" disabled={busy} onClick={() => openArchive('restore', [row.id])} aria-label={`Restaurar conflito ${row.id}`}><ArchiveRestore className="h-4 w-4" /></Button>}</div></TableCell>
            </TableRow>)}{!visible.length && <TableRow><TableCell colSpan={canManage ? 7 : 6} className="h-28 text-center text-muted-foreground">{loading ? 'A carregar registos…' : 'Nenhum registo corresponde aos filtros.'}</TableCell></TableRow>}</TableBody></Table></div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span>{filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} de {filtered.length} registos · {conflicts.length} no total{checked.length ? ` · ${checked.length} selecionados` : ''}</span><div className="flex items-center gap-2">
                <select aria-label="Registos por página" className={selectClass} value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{[10, 25, 50, 100, 200].map(size => <option key={size} value={size}>{size} por página</option>)}</select><Button variant="outline" size="sm" aria-label="Página anterior" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setChecked([]); }}><ChevronLeft className="h-4 w-4" /></Button><span>Página {currentPage} de {pages}</span><Button variant="outline" size="sm" aria-label="Página seguinte" disabled={currentPage >= pages} onClick={() => { setPage(currentPage + 1); setChecked([]); }}><ChevronRight className="h-4 w-4" /></Button>
            </div></div><p className="text-xs text-muted-foreground">Os relatórios incluem todos os registos e estados, independentemente dos filtros. O ficheiro técnico (JSON) inclui as operações completas. O arquivo é local a este dispositivo.</p>
        </CardContent>
        <Dialog open={!!detail} onOpenChange={open => { if (!open && !busy) setSelected(null); }}><DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Detalhes do conflito</DialogTitle><DialogDescription>Consulte a operação e o histórico antes de registar uma decisão.</DialogDescription></DialogHeader>{detail && <div className="space-y-4 text-sm">
            <p className="break-all"><strong>Identificador:</strong> {detail.id}<br /><strong>Tipo:</strong> {entityLabel(detail.entityType)}<br /><strong>Registo:</strong> {detail.entityId || '—'}<br /><strong>Estado:</strong> {CONFLICT_STATUS_LABELS[conflictStatus(detail)]}<br /><strong>Criado:</strong> {dateText(detail.createdAt)}</p>
            <p className="whitespace-pre-wrap break-words rounded-md bg-muted p-3">{conflictReason(detail)}</p>
            {detail.resolutionNote && <p className="whitespace-pre-wrap break-words"><strong>Decisão:</strong> {conflictNote(detail)}<br /><strong>Responsável:</strong> {detail.resolvedBy || '—'}<br /><strong>Data:</strong> {dateText(detail.resolvedAt)}</p>}
            {canManage && <details><summary className="cursor-pointer">Operação completa</summary><dl className="mt-2 grid max-h-64 grid-cols-[minmax(9rem,auto)_1fr] gap-x-3 gap-y-1 overflow-auto rounded bg-muted p-3 text-xs">{conflictOperationDetails(detail).map(([label, value]) => <Fragment key={label}><dt className="font-semibold text-muted-foreground">{label}</dt><dd className="break-all">{value}</dd></Fragment>)}</dl></details>}
            {canManage && detail.status === 'pending' && <><Label htmlFor="sync-conflict-note">Decisão e referência da operação manual (10 a 1000 caracteres)</Label><Textarea id="sync-conflict-note" value={note} maxLength={1000} onChange={event => setNote(event.target.value)} /><p className="text-xs text-muted-foreground">Marcar reconciliado apenas regista a decisão; não executa a operação financeira. Use após a reconciliação manual.</p><div className="flex flex-wrap gap-2"><Button disabled={busy || note.trim().length < 10} onClick={() => void decide('accepted')}>Marcar reconciliado</Button><Button variant="destructive" disabled={busy || note.trim().length < 10} onClick={() => void decide('rejected')}>Rejeitar alteração</Button></div></>}{error && <p role="alert" className="text-destructive">{error}</p>}
        </div>}</DialogContent></Dialog>
        <Dialog open={rebuildOpen} onOpenChange={open => { if (!busy) setRebuildOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Receber tudo de novo da nuvem</DialogTitle><DialogDescription>Apaga a cópia local deste navegador e volta a receber todos os dados da empresa. Resolve conflitos antigos que já não se conseguem reaplicar.</DialogDescription></DialogHeader>
            <p className="text-sm text-muted-foreground">Só é feito se não houver alterações deste navegador por enviar e se a sincronização estiver a funcionar. Antes de apagar, a cópia actual fica guardada e pode ser reposta com «Repor cópia anterior». A página recarrega e a primeira sincronização pode demorar alguns minutos. Os computadores e os outros navegadores não são afectados.</p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setRebuildOpen(false)}>Cancelar</Button><Button disabled={busy} onClick={() => void handleRebuild()}>{busy ? 'A preparar…' : 'Receber tudo de novo'}</Button></div></DialogContent></Dialog>
        <Dialog open={!!archiveDialog} onOpenChange={open => { if (!open && !busy) setArchiveDialog(null); }}><DialogContent><DialogHeader><DialogTitle>{archiveDialog?.action === 'archive' ? 'Arquivar' : 'Restaurar'} {archiveDialog?.ids.length} registo(s)</DialogTitle><DialogDescription>{archiveDialog?.action === 'archive' ? 'Os conflitos sairão da fila pendente sem aplicar as alterações remotas. Continuarão no histórico e poderão ser restaurados.' : 'Os conflitos voltarão à fila pendente e poderão ser reprocessados pela sincronização.'}</DialogDescription></DialogHeader><Label htmlFor="sync-archive-note">Motivo (10 a 1000 caracteres)</Label><Textarea id="sync-archive-note" value={archiveNote} maxLength={1000} onChange={event => setArchiveNote(event.target.value)} />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setArchiveDialog(null)}>Cancelar</Button><Button disabled={busy || archiveNote.trim().length < 10} onClick={() => void saveArchive()}>{busy ? 'A guardar…' : 'Confirmar'}</Button></div></DialogContent></Dialog>
    </Card>;
}
