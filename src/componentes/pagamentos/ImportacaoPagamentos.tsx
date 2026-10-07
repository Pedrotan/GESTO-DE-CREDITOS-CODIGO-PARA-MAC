import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Download, FileSpreadsheet, Layers, Loader2, Upload, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Checkbox } from '@/componentes/ui/checkbox';
import { Input } from '@/componentes/ui/input';
import { formatCurrency } from '@/bibliotecas/formatters';
import { formatLuandaDateTime, luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { cn } from '@/bibliotecas/utils';
import { methodLabel, validateImportRows, type ImportPreviewRow, type PaymentRow } from '@/bibliotecas/pagamentos-analise';
import { buildImportTemplate, readImportFile } from '@/bibliotecas/relatorios-pagamentos';
import { ServicoPagamentos, type Actor, type ImportBatch } from '@/servicos/ServicoPagamentos';
import { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import type { Credit } from '@/tipos/credito';

const TONE: Record<ImportPreviewRow['status'], string> = {
    ok: 'bg-emerald-50 dark:bg-emerald-500/10',
    warning: 'bg-amber-50 dark:bg-amber-500/10',
    error: 'bg-red-50 dark:bg-red-500/10',
};

export function ImportacaoPagamentos({ open, onOpenChange, credits, rows, numbers, closedMonths, batches, actor, onFinished }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    credits: Credit[];
    rows: PaymentRow[];
    numbers: Map<string, string>;
    closedMonths: Set<string>;
    batches: ImportBatch[];
    actor: Actor;
    onFinished: () => Promise<void> | void;
}) {
    const [fileName, setFileName] = useState('');
    const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
    const [includeWarnings, setIncludeWarnings] = useState<Set<number>>(new Set());
    const [error, setError] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [result, setResult] = useState<{ batch: string; imported: number; failed: string[] } | null>(null);
    const [cancelId, setCancelId] = useState('');
    const [cancelReason, setCancelReason] = useState('');
    const [busy, setBusy] = useState(false);
    const canBackdate = ServicoControloAcesso.temPermissao(actor as any, 'pagamentos.data_retroativa');

    useEffect(() => { if (open) { setFileName(''); setPreview([]); setIncludeWarnings(new Set()); setError(''); setConfirming(false); setProgress(null); setResult(null); } }, [open]);

    const counts = useMemo(() => ({
        ok: preview.filter(row => row.status === 'ok').length,
        warning: preview.filter(row => row.status === 'warning').length,
        error: preview.filter(row => row.status === 'error').length,
    }), [preview]);
    const selected = preview.filter(row => row.status === 'ok' || (row.status === 'warning' && includeWarnings.has(row.line)));
    const selectedTotal = selected.reduce((sum, row) => sum + Math.round(row.amount * 100), 0);

    const downloadTemplate = () => {
        const bytes = buildImportTemplate([...numbers.entries()].filter(([id]) => credits.some(credit => credit.id === id && ['active', 'overdue', 'defaulted', 'renegotiated'].includes(credit.status))).map(([, contract]) => ({ contract })));
        const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        const link = document.createElement('a');
        link.href = url; link.download = 'Modelo_Importacao_Pagamentos.xlsx';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
    };

    const load = async (file: File) => {
        setError(''); setResult(null); setConfirming(false);
        try {
            const raw = await readImportFile(file);
            if (!raw.length) throw new Error('O ficheiro não tem linhas preenchidas.');
            if (raw.length > 2000) throw new Error('Máximo de 2000 linhas por importação. Divida o ficheiro.');
            const validated = validateImportRows(raw, { credits, numbers, existing: rows, closedMonths, today: luandaTodayKey() });
            const today = luandaTodayKey();
            setPreview(validated.map(row => !canBackdate && row.status !== 'error' && row.dateKey && row.dateKey < today
                ? { ...row, status: 'error', messages: [...row.messages, 'Sem permissão para datas retroactivas.'] } : row));
            setIncludeWarnings(new Set());
            setFileName(file.name);
        } catch (failure) {
            setPreview([]);
            setError(failure instanceof Error ? failure.message : 'Não foi possível ler o ficheiro Excel.');
        }
    };

    const runImport = async () => {
        if (!selected.length || progress) return;
        setProgress({ done: 0, total: selected.length });
        const failed: string[] = [];
        let imported = 0;
        let totalMinor = 0;
        try {
            const batch = await ServicoPagamentos.createBatch(fileName || 'importacao.xlsx', actor);
            for (const row of selected) {
                try {
                    const draft = { creditId: row.creditId, valueDateKey: row.dateKey, amount: row.amount, method: row.method!, reference: row.reference };
                    const payment = ServicoPagamentos.buildPayment(draft, { id: `pag-${crypto.randomUUID()}`, idempotencyKey: `${batch.id}:${row.line}`, clientName: row.clientName, actor, batchId: batch.id });
                    if (payment.status === 'pending') await ServicoPagamentos.registerPending(payment);
                    else {
                        // Versão lida da base de dados a cada linha: várias linhas do mesmo contrato seguem em sequência.
                        const current = (await ServicoFinanceiro.getAllCredits()).find(item => item.id === row.creditId);
                        if (!current) throw new Error('Contrato não encontrado.');
                        await ServicoFinanceiro.addPaymentAndUpdateCredit(payment, current.version ?? 0, current.clientId);
                    }
                    imported++;
                    totalMinor += Math.round(row.amount * 100);
                } catch (failure) {
                    failed.push(`Linha ${row.line}: ${failure instanceof Error ? failure.message : String(failure)}`);
                }
                setProgress(value => value ? { ...value, done: value.done + 1 } : value);
            }
            await ServicoPagamentos.finishBatch(batch.id, imported, totalMinor);
            setResult({ batch: batch.number, imported, failed });
            setPreview([]);
            await onFinished();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
            setProgress(null); setConfirming(false);
        }
    };

    const cancelBatch = async (batch: ImportBatch) => {
        setBusy(true); setError('');
        try {
            const count = await ServicoPagamentos.cancelBatch(batch.id, cancelReason, actor);
            setCancelId(''); setCancelReason('');
            setResult({ batch: batch.number, imported: -count, failed: [] });
            await onFinished();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message.replace(/^\[403[^\]]*\]\s*/, '') : String(failure));
        } finally { setBusy(false); }
    };

    return (
        <Dialog open={open} onOpenChange={value => { if (!progress) onOpenChange(value); }}>
            <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary" /> Importação de pagamentos</DialogTitle>
                    <DialogDescription>Modelo Excel com instruções e validações, pré-visualização linha a linha e importação por lotes que podem ser anulados.</DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="import">
                    <TabsList>
                        <TabsTrigger value="import">Importar</TabsTrigger>
                        <TabsTrigger value="batches" className="gap-1.5"><Layers className="h-3.5 w-3.5" /> Lotes ({batches.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="import" className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border p-4">
                                <p className="text-sm font-bold">1. Descarregar o modelo</p>
                                <p className="mb-3 text-xs text-muted-foreground">Folha «Pagamentos» com listas e validações nas colunas e folha «Instruções».</p>
                                <Button variant="outline" className="gap-2" onClick={downloadTemplate}><Download className="h-4 w-4" /> Modelo Excel</Button>
                            </div>
                            <div className="rounded-lg border p-4">
                                <p className="text-sm font-bold">2. Carregar o ficheiro preenchido</p>
                                <p className="mb-3 text-xs text-muted-foreground">{fileName ? `Ficheiro: ${fileName}` : 'Formato .xlsx (até 2000 linhas).'}</p>
                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-semibold hover:bg-muted">
                                    <Upload className="h-4 w-4" /> Escolher ficheiro
                                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void load(file); }} />
                                </label>
                            </div>
                        </div>
                        {result && (
                            <div className={cn('rounded-lg border p-3 text-sm', result.failed.length ? 'border-amber-400/60 bg-amber-50 dark:bg-amber-500/10' : 'border-emerald-400/60 bg-emerald-50 dark:bg-emerald-500/10')}>
                                <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />
                                    {result.imported >= 0 ? `Lote ${result.batch}: ${result.imported} pagamento(s) importado(s).` : `Lote ${result.batch} anulado: ${-result.imported} pagamento(s) anulado(s) com estorno.`}</p>
                                {result.failed.map(item => <p key={item} className="text-xs text-destructive">{item}</p>)}
                            </div>
                        )}
                        {preview.length > 0 && (
                            <>
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                    <Badge variant="success">{counts.ok} válida(s)</Badge>
                                    <Badge variant="warning">{counts.warning} com aviso</Badge>
                                    <Badge variant="destructive">{counts.error} com erro</Badge>
                                    <span className="text-muted-foreground">As linhas com erro nunca entram; as linhas com aviso só entram se as marcar.</span>
                                </div>
                                <div className="max-h-[360px] overflow-auto rounded-lg border">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-muted text-left text-[11px] uppercase text-muted-foreground">
                                            <tr><th className="p-2">Linha</th><th className="p-2">Incluir</th><th className="p-2">Contrato</th><th className="p-2">Cliente</th><th className="p-2">Data-valor</th><th className="p-2 text-right">Valor</th><th className="p-2">Método</th><th className="p-2">Resultado</th></tr>
                                        </thead>
                                        <tbody>
                                            {preview.map(row => (
                                                <tr key={row.line} className={cn('border-t align-top', TONE[row.status])}>
                                                    <td className="p-2 font-mono text-xs">{row.line}</td>
                                                    <td className="p-2">
                                                        {row.status === 'ok' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : row.status === 'error' ? <XCircle className="h-4 w-4 text-red-600" /> : (
                                                            <Checkbox checked={includeWarnings.has(row.line)} aria-label={`Incluir a linha ${row.line}`}
                                                                onCheckedChange={value => setIncludeWarnings(previous => { const next = new Set(previous); if (value) next.add(row.line); else next.delete(row.line); return next; })} />
                                                        )}
                                                    </td>
                                                    <td className="p-2 font-mono text-xs">{row.contractText || '—'}</td>
                                                    <td className="p-2">{row.clientName || '—'}</td>
                                                    <td className="p-2 whitespace-nowrap">{row.dateKey ? `${row.dateKey.slice(8, 10)}/${row.dateKey.slice(5, 7)}/${row.dateKey.slice(0, 4)}` : '—'}</td>
                                                    <td className="p-2 text-right tabular-nums">{row.amount ? formatCurrency(row.amount) : '—'}</td>
                                                    <td className="p-2 whitespace-nowrap">{row.method ? methodLabel(row.method) : '—'}</td>
                                                    <td className="p-2 text-xs">{row.messages.length ? row.messages.map(message => <p key={message}>{message}</p>) : <span className="text-emerald-700 dark:text-emerald-300">Pronta a importar</span>}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
                                    <p className="text-sm"><b>3.</b> Vão ser importadas <b>{selected.length}</b> linha(s), no total de <b>{formatCurrency(selectedTotal / 100)}</b>, num novo lote.</p>
                                    {progress ? (
                                        <span className="flex items-center gap-2 text-sm font-semibold"><Loader2 className="h-4 w-4 animate-spin" /> {progress.done} de {progress.total}...</span>
                                    ) : confirming ? (
                                        <div className="flex gap-2">
                                            <Button variant="ghost" onClick={() => setConfirming(false)}>Voltar</Button>
                                            <Button onClick={runImport} className="gap-2"><CheckCircle2 className="h-4 w-4" /> Confirmo: importar {selected.length} linha(s)</Button>
                                        </div>
                                    ) : (
                                        <Button disabled={!selected.length} onClick={() => setConfirming(true)} className="gap-2"><Upload className="h-4 w-4" /> Importar linhas válidas</Button>
                                    )}
                                </div>
                            </>
                        )}
                    </TabsContent>
                    <TabsContent value="batches" className="space-y-2">
                        {!batches.length ? <p className="py-8 text-center text-sm text-muted-foreground">Ainda não há importações.</p> : batches.map(batch => (
                            <div key={batch.id} className="rounded-lg border p-3 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="font-semibold">{batch.number} <Badge variant={batch.status === 'active' ? 'success' : 'destructive'} className="ml-1">{batch.status === 'active' ? 'Activo' : 'Anulado'}</Badge></p>
                                        <p className="text-xs text-muted-foreground">{batch.fileName || '—'} · {batch.createdBy} · {formatLuandaDateTime(batch.createdAt)} · {batch.rowsCount} linha(s) · {formatCurrency(batch.totalMinor / 100)}</p>
                                        {batch.status === 'cancelled' && <p className="text-xs text-destructive">Anulado por {batch.cancelledBy} em {formatLuandaDateTime(batch.cancelledAt)} · {batch.cancelReason}</p>}
                                    </div>
                                    {batch.status === 'active' && cancelId !== batch.id && (
                                        <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => { setCancelId(batch.id); setCancelReason(''); setError(''); }}><Ban className="h-3.5 w-3.5" /> Anular lote</Button>
                                    )}
                                </div>
                                {cancelId === batch.id && (
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <Input className="h-9 min-w-[260px] flex-1" autoFocus maxLength={300} value={cancelReason} onChange={event => setCancelReason(event.target.value)} placeholder="Motivo (ex.: ficheiro importado por engano)" />
                                        <Button size="sm" variant="ghost" onClick={() => setCancelId('')} disabled={busy}>Cancelar</Button>
                                        <Button size="sm" variant="destructive" className="gap-1.5" disabled={busy || cancelReason.trim().length < 20} onClick={() => cancelBatch(batch)}>
                                            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Anular os pagamentos do lote
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </TabsContent>
                </Tabs>
                {error && <p className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
            </DialogContent>
        </Dialog>
    );
}
