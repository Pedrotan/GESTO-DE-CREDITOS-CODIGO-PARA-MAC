import { useState, useEffect, useRef } from 'react';
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
    const { reinforceCredit } = useData();
    const { user } = useAuth();
    const { toast } = useToast();

    const [valor, setValor] = useState(0);
    const [notas, setNotas] = useState('');
    const [aGravar, setAGravar] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const idempotencyKeyRef = useRef(crypto.randomUUID());

    useEffect(() => {
        if (isOpen) { setValor(0); setNotas(''); setErro(null); idempotencyKeyRef.current = crypto.randomUUID(); }
    }, [isOpen]);

    if (!credit) return null;

    const taxa = credit.interestRate;
    const jurosReforco = Math.round(valor * (taxa / 100));
    const capitalConsolidado = credit.principalAmount + valor;
    const totalConsolidado = (credit.totalDue || 0) + valor + jurosReforco;

    const confirmar = async () => {
        if (valor <= 0) { setErro('Introduza um valor de reforço maior que zero.'); return; }
        setAGravar(true);
        try {
            await reinforceCredit(
                credit.id,
                valor,
                { notes: notas || undefined, idempotencyKey: idempotencyKeyRef.current },
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
                            Acrescenta capital a este crédito sem abrir um novo contrato.
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
                                        <span className="text-muted-foreground">Juros do reforço ({taxa}%)</span>
                                        <span className="font-bold">{formatCurrency(jurosReforco)}</span>
                                    </div>
                                    <div className="flex justify-between border-t border-emerald-200 pt-1.5 dark:border-emerald-900/50">
                                        <span className="text-muted-foreground">Capital consolidado</span>
                                        <span className="font-black">{formatCurrency(capitalConsolidado)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Total em dívida</span>
                                        <span className="font-black">{formatCurrency(totalConsolidado)}</span>
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
                        <Button onClick={confirmar} disabled={aGravar || valor <= 0} className="gap-2">
                            {aGravar && <Loader2 className="h-4 w-4 animate-spin" />}
                            Registar Reforço
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
