import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, FileUp, Loader2, Undo2, XCircle } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { formatCurrency } from '@/bibliotecas/formatters';
import { parseExcelFile } from '@/bibliotecas/ExcelHelper';
import { validateCreditImport, type CreditImportRow } from '@/bibliotecas/importacao-creditos';
import { formatLuandaDateTime } from '@/bibliotecas/fuso-angola';
import { Button } from '@/componentes/ui/button';
import { Textarea } from '@/componentes/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { ServicoCarteira, type ImportBatch } from '@/servicos/ServicoCarteira';
import type { Client, Credit } from '@/tipos/credito';

type Actor = { id: string; name: string; role: string; permissions?: string[] };

/**
 * Importação de créditos: pré-visualização com validação linha a linha e duplicados; os válidos entram como
 * pedidos na fila de aprovação (alçadas). Cada importação é um lote, que pode ser anulado enquanto os pedidos
 * não forem aprovados.
 */
export function ImportacaoCreditos({ open, onClose, clients, credits, actor, addCredit, onImported }: {
    open: boolean; onClose: () => void; clients: Client[]; credits: Credit[]; actor: Actor | null;
    addCredit: (credit: Credit, user?: { id: string; name: string }) => Promise<Credit & { escalationReason?: string }>;
    onImported: (message: string) => void;
}) {
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState<CreditImportRow[]>([]);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');
    const [batches, setBatches] = useState<ImportBatch[]>([]);
    const [cancelling, setCancelling] = useState<ImportBatch | null>(null);
    const [reason, setReason] = useState('');
    const loadBatches = () => void ServicoCarteira.batches().then(setBatches).catch(() => setBatches([]));
    useEffect(() => { if (open) loadBatches(); }, [open]);

    const read = async (file: File) => {
        setError(''); setFileName(file.name);
        try {
            const data = await parseExcelFile(file) as Array<Record<string, unknown>>;
            if (!data.length) throw new Error('O ficheiro não tem linhas.');
            setRows(validateCreditImport(data, { clients, credits: credits as any }));
        } catch (cause: any) { setRows([]); setError(cause?.message || 'Não foi possível ler o ficheiro.'); }
    };
    const valid = rows.filter(row => row.status === 'ok');
    const confirm = async () => {
        if (!actor || !valid.length) return;
        setBusy(true); setError(''); setProgress(0);
        try {
            const batch = await ServicoCarteira.createBatch(fileName, actor);
            let done = 0, total = 0;
            const failures: string[] = [];
            for (const row of valid) {
                const client = clients.find(item => item.id === row.clientId)!;
                const start = new Date(`${row.startKey}T12:00:00`);
                const due = new Date(start); due.setMonth(due.getMonth() + row.months);
                const interest = (row.amount * row.rate) / 100;
                const id = `CR-${crypto.randomUUID()}`;
                try {
                    await addCredit({
                        id, clientId: client.id, clientName: client.name, principalAmount: row.amount, currentBalance: row.amount, interestRate: row.rate,
                        lateInterestRate: client.lateInterestRate || 0.5, installments: row.months, paidInstallments: 0, startDate: start, dueDate: due,
                        status: 'pending_approval', daysOverdue: 0, accruedInterest: interest, lateInterest: 0, totalDue: row.amount + interest,
                        createdAt: new Date(), requestedBy: actor.name, requestedAt: new Date(), creditNumber: credits.filter(item => item.clientId === client.id).length + 1,
                        targetMonthId: row.startKey.slice(0, 7),
                    } as Credit, { id: actor.id, name: actor.name });
                    await ServicoCarteira.addToBatch(batch.id, id);
                    done += 1; total += Math.round(row.amount * 100);
                } catch (cause: any) { failures.push(`Linha ${row.line}: ${cause?.message || 'erro'}`); }
                setProgress(Math.round(((done + failures.length) / valid.length) * 100));
            }
            await ServicoCarteira.finishBatch(batch.id, done, total);
            setRows([]); setFileName(''); loadBatches();
            onImported(`Lote ${batch.number}: ${done} pedido(s) de crédito importado(s) para aprovação${failures.length ? `; ${failures.length} falharam (${failures.slice(0, 2).join('; ')})` : ''}.`);
        } catch (cause: any) { setError(cause?.message || 'A importação falhou.'); } finally { setBusy(false); }
    };

    const STATUS = {
        ok: { label: 'Válida', icon: CheckCircle2, css: 'text-emerald-700 dark:text-emerald-400' },
        error: { label: 'Com erros', icon: XCircle, css: 'text-red-700 dark:text-red-400' },
        duplicate: { label: 'Duplicada', icon: Copy, css: 'text-amber-700 dark:text-amber-400' },
    } as const;
    return (
        <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
            <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Importar créditos</DialogTitle>
                    <DialogDescription>Escolha o ficheiro do modelo. Cada linha é validada antes de gravar; as válidas entram como pedidos na fila de Aprovações, conforme as alçadas.</DialogDescription>
                </DialogHeader>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed p-4 text-sm hover:bg-muted">
                    <FileUp className="h-5 w-5 text-primary" /> {fileName || 'Escolher ficheiro Excel (.xlsx)'}
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void read(file); }} />
                </label>
                {rows.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-sm"><strong>{valid.length}</strong> válida(s) · <strong>{rows.filter(row => row.status === 'error').length}</strong> com erros · <strong>{rows.filter(row => row.status === 'duplicate').length}</strong> duplicada(s)</p>
                        <div className="max-h-72 overflow-y-auto rounded-lg border">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-muted text-left"><tr><th className="p-2">Linha</th><th className="p-2">Cliente</th><th className="p-2 text-right">Montante</th><th className="p-2">Prazo</th><th className="p-2">Taxa</th><th className="p-2">Início</th><th className="p-2">Validação</th></tr></thead>
                                <tbody>{rows.map(row => {
                                    const status = STATUS[row.status];
                                    return (
                                        <tr key={row.line} className={cn('border-t align-top', row.status !== 'ok' && 'bg-red-50/40 dark:bg-red-950/20')}>
                                            <td className="p-2">{row.line}</td><td className="p-2">{row.clientName}<span className="block text-muted-foreground">{row.nif}</span></td>
                                            <td className="p-2 text-right">{formatCurrency(row.amount || 0)}</td><td className="p-2">{row.months} m</td><td className="p-2">{row.rate}%</td><td className="p-2">{row.startKey.split('-').reverse().join('/')}</td>
                                            <td className={cn('p-2', status.css)}><span className="flex items-center gap-1 font-semibold"><status.icon className="h-3.5 w-3.5" /> {status.label}</span>{row.errors.map(item => <span key={item} className="block">{item}</span>)}</td>
                                        </tr>
                                    );
                                })}</tbody>
                            </table>
                        </div>
                    </div>
                )}
                {busy && <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>}
                {error && <p className="flex items-center gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4" /> {error}</p>}

                <div className="space-y-2 rounded-xl border p-3">
                    <p className="text-sm font-bold">Lotes importados</p>
                    {batches.length ? batches.slice(0, 8).map(batch => (
                        <div key={batch.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                            <span><strong>{batch.number}</strong> · {batch.fileName} · {batch.rowsCount} crédito(s) · {formatCurrency(batch.totalMinor / 100)} · {formatLuandaDateTime(batch.createdAt)} por {batch.createdBy}</span>
                            {batch.status === 'cancelled' ? <span className="font-semibold text-muted-foreground">Anulado ({batch.cancelReason})</span>
                                : <Button size="sm" variant="outline" className="h-7 gap-1 text-destructive" onClick={() => { setReason(''); setCancelling(batch); }}><Undo2 className="h-3.5 w-3.5" /> Anular lote</Button>}
                        </div>
                    )) : <p className="text-xs text-muted-foreground">Ainda não há lotes.</p>}
                </div>
                {cancelling && (
                    <div className="space-y-2 rounded-xl border border-destructive/40 p-3">
                        <p className="text-sm font-semibold">Anular o lote {cancelling.number}: os pedidos ainda por aprovar são cancelados; os já aprovados mantêm-se.</p>
                        <Textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} placeholder="Motivo (obrigatório, como na Auditoria)" />
                        <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setCancelling(null)}>Voltar</Button>
                            <Button size="sm" variant="destructive" disabled={!actor || reason.trim().length < 20} onClick={async () => {
                                try { const result = await ServicoCarteira.cancelBatch(cancelling.id, reason, actor!); setCancelling(null); loadBatches(); onImported(`Lote ${cancelling.number} anulado: ${result.cancelled} pedido(s) cancelado(s)${result.kept ? `, ${result.kept} já aprovado(s) mantido(s)` : ''}.`); }
                                catch (cause: any) { setError(cause?.message || 'Não foi possível anular.'); }
                            }}>Anular lote</Button>
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={onClose}>Fechar</Button>
                    <Button disabled={busy || !valid.length || !actor} onClick={() => void confirm()}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Importar {valid.length} crédito(s)</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
