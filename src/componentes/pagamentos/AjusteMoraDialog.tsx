import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, HandCoins, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { formatCurrency } from '@/bibliotecas/formatters';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { buildMoraPlan } from '@/bibliotecas/juros-mora';
import { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
import type { Actor } from '@/servicos/ServicoPagamentos';

export type AjusteMoraKind = 'forgive' | 'renegotiate';

const kz = (minor: number) => formatCurrency(minor / 100);
const toMinor = (value: number) => Math.round((Number(value) || 0) * 100);
const dateLabel = (key: string) => key.split('-').reverse().join('/');

/** Perdoar ou renegociar os juros de mora em dívida de um crédito, com a mora calculada até hoje. */
export function AjusteMoraDialog({ kind, creditId, creditLabel, actor, onClose, onDone }: {
    kind: AjusteMoraKind | null;
    creditId: string;
    creditLabel: string;
    actor: Actor;
    onClose: () => void;
    onDone: (message: string) => void;
}) {
    const [owedMinor, setOwedMinor] = useState<number | null>(null);
    const [amount, setAmount] = useState(0);
    const [agreed, setAgreed] = useState(0);
    const [count, setCount] = useState(1);
    const [firstDue, setFirstDue] = useState(luandaTodayKey());
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const inFlight = useRef(false);
    const forgiving = kind === 'forgive';
    const today = luandaTodayKey();

    useEffect(() => {
        if (!kind) return;
        let cancelled = false;
        setOwedMinor(null); setError(''); setReason(''); setCount(1); setFirstDue(luandaTodayKey());
        ServicoFinanceiro.getLateInterestSummary(creditId)
            .then(summary => {
                if (cancelled) return;
                setOwedMinor(summary.owedMinor);
                setAmount(summary.owedMinor / 100);
                setAgreed(summary.owedMinor / 100);
            })
            .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Não foi possível calcular a mora.'); });
        return () => { cancelled = true; };
    }, [kind, creditId]);

    const amountMinor = toMinor(forgiving ? amount : (owedMinor ?? 0) / 100);
    const agreedMinor = forgiving ? 0 : toMinor(agreed);
    const forgivenMinor = forgiving ? amountMinor : Math.max(0, amountMinor - agreedMinor);
    const plan = useMemo(() => {
        if (forgiving) return { items: [], problem: '' };
        try { return { items: buildMoraPlan(agreedMinor, count, firstDue), problem: '' }; }
        catch (cause) { return { items: [], problem: cause instanceof Error ? cause.message : 'Plano inválido.' }; }
    }, [forgiving, agreedMinor, count, firstDue]);

    const problem = owedMinor === null ? '' : owedMinor <= 0 ? 'Este crédito não tem juros de mora em dívida.'
        : amountMinor <= 0 ? 'Indique o valor de mora a perdoar.'
        : amountMinor > owedMinor ? `A mora em dívida é de ${kz(owedMinor)}.`
        : agreedMinor > amountMinor ? 'O valor acordado não pode ser maior do que a mora em dívida.'
        : !forgiving && firstDue < today ? 'A primeira prestação não pode ser anterior a hoje.'
        : plan.problem;
    const canConfirm = !busy && owedMinor !== null && !problem && reason.trim().length >= 10;

    const confirm = async () => {
        if (inFlight.current || !canConfirm || !kind) return;
        inFlight.current = true;
        setBusy(true);
        setError('');
        try {
            await ServicoFinanceiro.adjustLateInterest({ creditId, kind, amountMinor, agreedMinor, installments: count, firstDueKey: firstDue, reason, actor: actor as any });
            onDone(forgiving
                ? `Foram perdoados ${kz(amountMinor)} de juros de mora.`
                : `Mora renegociada: ${kz(agreedMinor)} em ${count} prestação(ões)${forgivenMinor ? `, com ${kz(forgivenMinor)} perdoados` : ''}.`);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            inFlight.current = false;
            setBusy(false);
        }
    };

    return (
        <Dialog open={Boolean(kind)} onOpenChange={open => { if (!open && !busy) onClose(); }}>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {forgiving ? <HandCoins className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
                        {forgiving ? 'Perdoar juros de mora' : 'Renegociar juros de mora'}
                    </DialogTitle>
                    <DialogDescription>{creditLabel}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-1">
                    <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                        <span className="text-muted-foreground">Mora em dívida até hoje</span>
                        {owedMinor === null ? <Loader2 className="h-4 w-4 animate-spin" /> : <b className="tabular-nums text-red-600">{kz(owedMinor)}</b>}
                    </div>

                    {forgiving ? (
                        <div className="space-y-1.5">
                            <Label>Valor a perdoar (Kz)</Label>
                            {/* A chave recria o campo quando a mora chega: com foco, o campo não mostrava o valor recebido. */}
                            <CurrencyInput key={owedMinor ?? 'a-calcular'} value={amount} onValueChange={setAmount} aria-label="Valor a perdoar" />
                        </div>
                    ) : (
                        <>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="space-y-1.5">
                                    <Label>Valor acordado (Kz)</Label>
                                    <CurrencyInput key={owedMinor ?? 'a-calcular'} value={agreed} onValueChange={setAgreed} aria-label="Valor acordado" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="mora-count">Prestações</Label>
                                    <Input id="mora-count" type="number" min={1} max={24} value={count} onChange={event => setCount(Number(event.target.value))} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="mora-first">1.ª prestação em</Label>
                                    <Input id="mora-first" type="date" min={today} value={firstDue} onChange={event => setFirstDue(event.target.value)} />
                                </div>
                            </div>
                            {forgivenMinor > 0 && <p className="text-sm">A diferença de <b>{kz(forgivenMinor)}</b> é perdoada.</p>}
                            {plan.items.length > 0 && (
                                <div className="max-h-36 overflow-y-auto rounded-lg border text-sm">
                                    {plan.items.map((item, index) => (
                                        <div key={item.dueDateKey} className="flex justify-between border-t px-3 py-1.5 tabular-nums first:border-t-0">
                                            <span>{index + 1}.ª · {dateLabel(item.dueDateKey)}</span><b>{kz(item.amountMinor)}</b>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="mora-reason">Motivo (obrigatório, fica na auditoria)</Label>
                        <Textarea id="mora-reason" rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Ex.: acordo com o cliente após reunião de cobrança" />
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Esta decisão não se pode anular. Se a prestação continuar em atraso, volta a gerar mora a partir de amanhã.
                    </p>
                    {(problem || error) && (
                        <p role="alert" className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error || problem}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
                    <Button onClick={() => void confirm()} disabled={!canConfirm} className="gap-2">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        {forgiving ? 'Confirmar perdão' : 'Confirmar renegociação'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
