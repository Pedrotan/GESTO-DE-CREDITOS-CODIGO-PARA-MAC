import { useEffect, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { formatCurrency } from '@/bibliotecas/formatters';
import { formatLuandaDateTime } from '@/bibliotecas/fuso-angola';
import type { PaymentRow } from '@/bibliotecas/pagamentos-analise';
import { validateJustification } from '@/bibliotecas/justificacao';

/** Anulação: permissão própria, motivo obrigatório e segregação de funções (validadas no serviço). */
export function AnulacaoPagamento({ row, open, onOpenChange, threshold, actorId, onConfirm }: {
    row: PaymentRow | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    threshold: number;
    actorId: string;
    onConfirm: (row: PaymentRow, reason: string) => Promise<void>;
}) {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (open) { setReason(''); setError(''); setBusy(false); } }, [open]);
    if (!row) return null;
    const ownPayment = Boolean(row.operatorId && row.operatorId === actorId);
    const needsApproval = row.status === 'confirmed' && row.total > threshold;
    const submit = async () => {
        const invalid = validateJustification(reason);
        if (invalid) { setError(invalid); return; }
        setBusy(true); setError('');
        try { await onConfirm(row, reason.trim()); onOpenChange(false); }
        catch (failure) { setError(failure instanceof Error ? failure.message.replace(/^\[403[^\]]*\]\s*/, '') : String(failure)); }
        finally { setBusy(false); }
    };
    return (
        <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive"><Ban className="h-5 w-5" /> Anular pagamento</DialogTitle>
                    <DialogDescription>{row.receipt || 'Pagamento pendente'} · {row.clientName} · {formatCurrency(row.total)}</DialogDescription>
                </DialogHeader>
                <ul className="space-y-1.5 rounded-lg bg-muted/50 p-3 text-sm">
                    <li>• Nada é apagado: o pagamento fica <b>Anulado</b> e o recibo mantém o número, marcado «ANULADO».</li>
                    {row.status === 'confirmed' && <li>• É gerado o estorno contabilístico, a imputação nas prestações é revertida e a mora é recalculada.</li>}
                    {needsApproval && <li className="font-semibold text-amber-700 dark:text-amber-300">• Valor acima de {formatCurrency(threshold)}: fica um pedido para outro administrador aprovar.</li>}
                </ul>
                {ownPayment && (
                    <p className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> Foi o utilizador actual que registou este pagamento: pela segregação de funções, tem de ser outra pessoa a anulá-lo.
                    </p>
                )}
                <div className="space-y-1.5">
                    <Label htmlFor="cancel-reason">Motivo da anulação</Label>
                    <Textarea id="cancel-reason" rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Ex.: valor registado em duplicado no mesmo dia" />
                    <p className="text-xs text-muted-foreground">Pelo menos 20 caracteres e 3 palavras, sem caracteres repetidos e diferente das suas justificações anteriores.</p>
                </div>
                {error && <p className="flex gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
                    <Button variant="destructive" onClick={submit} disabled={busy || ownPayment} className="gap-2">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}{needsApproval ? 'Pedir aprovação' : 'Anular pagamento'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export type CancellationRequest = { id: string; targetId: string; amountMinor?: number | null; description?: string; reason: string; requestedBy: string; requestedById: string; requestedAt: string };

/** Pedidos de anulação acima do limite, à espera de um segundo administrador. */
export function AprovacoesAnulacao({ requests, actorId, onDecide }: { requests: CancellationRequest[]; actorId: string; onDecide: (request: CancellationRequest, approve: boolean, reason: string) => Promise<void> }) {
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [rejecting, setRejecting] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    if (!requests.length) return null;
    const decide = async (request: CancellationRequest, approve: boolean) => {
        const reason = approve ? 'Aprovado' : rejectReason.trim();
        if (!approve && reason.length < 5) { setError('Indique o motivo da rejeição (pelo menos 5 caracteres).'); return; }
        setBusy(request.id); setError('');
        try { await onDecide(request, approve, reason); setRejecting(''); setRejectReason(''); } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); } finally { setBusy(''); }
    };
    return (
        <div className="mb-4 rounded-xl border border-amber-400/60 bg-amber-50/70 p-4 dark:bg-amber-500/10">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-200"><ShieldAlert className="h-4 w-4" /> Anulações à espera de aprovação ({requests.length})</p>
            <div className="space-y-2">
                {requests.map(request => (
                    <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/80 px-3 py-2 text-sm">
                        <div className="min-w-0">
                            <p className="font-semibold">{request.description} · {formatCurrency((request.amountMinor || 0) / 100)}</p>
                            <p className="text-xs text-muted-foreground">Pedido por {request.requestedBy} em {formatLuandaDateTime(request.requestedAt)} · Motivo: {request.reason}</p>
                        </div>
                        {request.requestedById === actorId ? <span className="text-xs text-muted-foreground">Aguarda outro administrador</span> : rejecting === request.id ? (
                            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                                <input className="h-8 min-w-[220px] flex-1 rounded-md border bg-background px-2 text-sm" autoFocus value={rejectReason} maxLength={300}
                                    onChange={event => setRejectReason(event.target.value)} placeholder="Motivo da rejeição" />
                                <Button size="sm" variant="destructive" className="h-8" disabled={busy === request.id} onClick={() => decide(request, false)}>Rejeitar</Button>
                                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setRejecting(''); setRejectReason(''); }}>Cancelar</Button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="h-8 gap-1" disabled={busy === request.id} onClick={() => { setRejecting(request.id); setError(''); }}><XCircle className="h-3.5 w-3.5" /> Rejeitar</Button>
                                <Button size="sm" className="h-8 gap-1" disabled={busy === request.id} onClick={() => decide(request, true)}>{busy === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Aprovar e anular</Button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
    );
}
