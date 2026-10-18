import { useState, useEffect, useRef } from 'react';
import { db } from '@/bibliotecas/bd';
import { Input } from '@/componentes/ui/input';
import { reinforcementInterest } from '@/bibliotecas/reforco-capital';
import { buildInstallmentSchedule } from '@/bibliotecas/cronograma-prestacoes';
import { Credit } from '@/tipos/credito';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { Button } from '@/componentes/ui/button';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/componentes/ui/dialog';
import { AlertModal } from '@/componentes/ui/AlertModal';
import { PlusCircle, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/bibliotecas/formatters';
import { useToast } from '@/ganchos/usar-toast';

interface ReinforcementModalProps {
    isOpen: boolean;
    onClose: () => void;
    credit: Credit | null;
}

/**
 * Reforço de capital de um crédito em curso.
 * O contrato mantém-se; sobe o capital e o reforço gera juros à mesma taxa.
 */
export function ReinforcementModal({ isOpen, onClose, credit }: ReinforcementModalProps) {
    const { reinforceCredit, addCredit, credits } = useData();
    const { user } = useAuth();
    const { toast } = useToast();

    const [valor, setValor] = useState(0);
    const [mode, setMode] = useState('existing');
    const [installmentId, setInstallmentId] = useState('');
    const [schedule, setSchedule] = useState<Array<{id: string; dueDate: string; installmentNumber: number; status: string}>>([]);
    const [rate, setRate] = useState(0);
    const [term, setTerm] = useState(1);
    const [notas, setNotas] = useState('');
    const [aGravar, setAGravar] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const idempotencyKeyRef = useRef(crypto.randomUUID());

    useEffect(() => {
        if (isOpen) { setValor(0); setNotas(''); setErro(null); idempotencyKeyRef.current = crypto.randomUUID(); }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !credit) return;
        let cancelled = false;
        setMode('existing'); setInstallmentId(''); setSchedule([]); setRate(credit.interestRate); setTerm(1);
        db.all<{id: string; dueDate: string; installmentNumber: number; status: string}>('SELECT id, installmentNumber, dueDate, status FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber', [credit.id])
            .then(rows => { if (!cancelled) setSchedule(rows.filter(row => row.status !== 'paid')); })
            .catch(() => { if (!cancelled) setErro('Não foi possível carregar as prestações. Volte a abrir o formulário.'); });
        return () => { cancelled = true; };
    }, [isOpen, credit?.id]);
    if (!credit) return null;

    const taxa = mode === 'existing' ? credit.interestRate : rate;
    const jurosReforco = valor > 0 && Number.isFinite(taxa) && taxa >= 0 ? reinforcementInterest(valor, taxa, mode === 'new' ? 'FLAT' : credit.amortizationMethod) : 0;
    const capitalConsolidado = credit.principalAmount + valor;
    const totalConsolidado = (credit.totalDue || 0) + valor + jurosReforco;

    const confirmar = async () => {
        if (valor <= 0) { setErro('Introduza um valor de reforço maior que zero.'); return; }
        if (aGravar) return;
        if (mode === 'existing' && !installmentId) { setErro('Escolha o mês e a prestação do reforço.'); return; }
        if (mode === 'new' && (!Number.isFinite(rate) || rate < 0 || !Number.isInteger(term) || term < 1 || term > 600)) { setErro('Verifique a taxa e o prazo.'); return; }
        setAGravar(true);
        try {
            if (mode === 'new') {
                const start = new Date();
                const plan = buildInstallmentSchedule({ principalMinor: Math.round(valor * 100), installments: term, startDate: start, method: 'FLAT', flatInterestMinor: Math.round(jurosReforco * 100) });
                const created = await addCredit({ id: `CR-${idempotencyKeyRef.current}`, clientId: credit.clientId, clientName: credit.clientName,
                    principalAmount: valor, currentBalance: valor, interestRate: rate, lateInterestRate: credit.lateInterestRate,
                    installments: term, paidInstallments: 0, startDate: start, dueDate: new Date(plan[plan.length - 1].dueDate),
                    status: 'pending_approval', requestedBy: user?.id, requestedAt: start, daysOverdue: 0,
                    accruedInterest: jurosReforco, lateInterest: 0, totalDue: valor + jurosReforco, amortizationMethod: 'FLAT',
                    creditNumber: credits.filter(row => row.clientId === credit.clientId && !row.deletedAt).length + 1,
                    createdAt: start, productId: credit.productId, approvalNotes: notas,
                }, user ? { id: user.id, name: user.name } : undefined, { productId: credit.productId, reinforcementOf: credit.id });
                toast({ title: 'Novo contrato enviado para aprovação', description: created.id });
                onClose(); return;
            }
            await reinforceCredit(
                credit.id,
                valor,
                { installmentId, notes: notas || undefined, idempotencyKey: idempotencyKeyRef.current },
                user ? { id: user.id, name: user.name } : undefined
            );
            toast({
                title: 'Reforço registado',
                description: `Capital consolidado: ${formatCurrency(capitalConsolidado)}.`,
            });
            onClose();
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível registar o reforço.');
        } finally {
            setAGravar(false);
        }
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
                <DialogContent className="w-[95vw] max-w-lg flex max-h-[90vh] flex-col overflow-hidden p-0">
                    <DialogHeader className="shrink-0 p-6 pb-4">
                        <DialogTitle className="flex items-center gap-2">
                            <PlusCircle className="h-5 w-5" />
                            Reforço de Capital
                        </DialogTitle>
                        <DialogDescription>
                            Escolha entre agregar a uma prestação ou criar um contrato independente.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 space-y-5 overflow-y-auto px-6 pb-2">
                        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
                            <p className="font-bold text-foreground">{credit.clientName}</p>
                            <p className="text-xs text-muted-foreground">Crédito {credit.id}</p>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <p className="text-muted-foreground">Capital actual</p>
                                    <p className="font-bold text-foreground">{formatCurrency(credit.principalAmount)}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Taxa do contrato</p>
                                    <p className="font-bold text-foreground">{taxa}%</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="reinforcement-mode">Como aplicar o reforço?</Label>
                            <select id="reinforcement-mode" value={mode} onChange={e => setMode(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3" disabled={aGravar}>
                                <option value="existing">Agregar ao crédito existente, à mesma taxa</option>
                                <option value="new">Novo contrato, com juros próprios</option>
                            </select>
                            {mode === 'existing' ? <div className="space-y-2">
                                <Label htmlFor="reinforcement-month">Mês de cobrança do reforço / prestação</Label>
                                <select id="reinforcement-month" value={installmentId} onChange={e => setInstallmentId(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3" disabled={aGravar}>
                                    <option value="">Escolha o mês e a prestação</option>
                                    {schedule.map(row => <option key={row.id} value={row.id}>{row.dueDate.slice(0, 7)} · {row.installmentNumber}.ª prestação</option>)}
                                </select>
                                <p className="text-xs text-muted-foreground">Desembolso registado hoje. Capital e juros adicionais cobrados apenas na prestação escolhida. Os outros meses não são alterados. Em PRICE/SAC, a taxa anual é convertida para um mês.</p>
                            </div> : <div className="space-y-2 rounded-lg border p-3">
                                <p className="text-sm">Novo contrato FLAT, com juros e prazo próprios. O crédito anterior mantém o seu saldo e cronograma.</p>
                                <Label htmlFor="reinforcement-rate">Taxa total do novo prazo (%)</Label>
                                <Input id="reinforcement-rate" type="number" min={0} step="0.01" value={rate} onChange={e => setRate(Number(e.target.value))} disabled={aGravar} />
                                <Label htmlFor="reinforcement-term">Prazo do novo contrato (meses)</Label>
                                <Input id="reinforcement-term" type="number" min={1} max={600} value={term} onChange={e => setTerm(Number(e.target.value))} disabled={aGravar} />
                                <p className="text-xs text-muted-foreground">Sujeito a aprovação. Após aprovação, haverá dois créditos e o pagamento exigirá escolher o contrato.</p>
                            </div>}
                            <Label htmlFor="valor-reforco">Valor do Reforço</Label>
                            <CurrencyInput
                                id="valor-reforco"
                                value={valor}
                                onValueChange={(v: number) => { setValor(v); setErro(null); }}
                            />
                        </div>

                        {valor > 0 && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/30">
                                <p className="mb-2 font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                                    Simulação
                                </p>
                                <div className="space-y-1.5">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Capital de reforço</span>
                                        <span className="font-bold">{formatCurrency(valor)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Juros do reforço {mode === 'existing' && credit.amortizationMethod && credit.amortizationMethod !== 'FLAT' ? `(TAN ${taxa}%, 1 mês)` : `(${taxa}% do prazo)`}</span>
                                        <span className="font-bold">{formatCurrency(jurosReforco)}</span>
                                    </div>
                                    <div className="flex justify-between border-t border-emerald-200 pt-1.5 dark:border-emerald-900/50">
                                        <span className="text-muted-foreground">{mode === 'existing' ? 'Capital consolidado' : 'Capital do novo contrato'}</span>
                                        <span className="font-black">{formatCurrency(mode === 'existing' ? capitalConsolidado : valor)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Total em dívida</span>
                                        <span className="font-black">{formatCurrency(mode === 'existing' ? totalConsolidado : valor + jurosReforco)}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="notas-reforco">Observações (opcional)</Label>
                            <Textarea
                                id="notas-reforco"
                                value={notas}
                                onChange={(e) => setNotas(e.target.value)}
                                placeholder="Motivo do reforço, acordo com o cliente…"
                                rows={3}
                            />
                        </div>
                    </div>

                    <div className="flex shrink-0 justify-end gap-3 border-t border-border p-4">
                        <Button variant="outline" onClick={onClose} disabled={aGravar}>Cancelar</Button>
                        <Button onClick={confirmar} disabled={aGravar || valor <= 0 || (mode === 'existing' && !installmentId)} className="gap-2">
                            {aGravar && <Loader2 className="h-4 w-4 animate-spin" />}
                            {mode === 'new' ? 'Enviar novo contrato para aprovação' : 'Registar Reforço'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <AlertModal
                isOpen={!!erro}
                onClose={() => setErro(null)}
                title="Não foi possível registar"
                description={erro || ''}
                type="error"
            />
        </>
    );
}
