import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Checkbox } from '@/componentes/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import type { DataRemovalOptions } from '@/contextos/ContextoDados';

type Item = { key: 'record' | 'credits' | 'accounting' | 'purge'; page: string; detail: string; fixed?: boolean };

/**
 * Modal de eliminação de um cliente ou de um contrato: lista as páginas do sistema e deixa marcar de onde saem
 * os dados. O registo principal (cadastro ou contrato) sai sempre; o resto é escolhido aqui.
 */
export function ModalEliminarDados({ open, onOpenChange, kind, name, activeCredits = 0, onConfirm }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    kind: 'client' | 'contract';
    name: string;
    /** Créditos activos ou em atraso que também vão ser eliminados (aviso). */
    activeCredits?: number;
    onConfirm: (options: DataRemovalOptions) => Promise<void>;
}) {
    const [selected, setSelected] = useState({ credits: true, accounting: true, purge: false });
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (open) setSelected({ credits: true, accounting: true, purge: false }); }, [open]);

    const items: Item[] = kind === 'client' ? [
        { key: 'record', page: 'Clientes', detail: 'Cadastro do cliente, documentos e garantias.', fixed: true },
        { key: 'credits', page: 'Créditos, Contratos e Pagamentos', detail: 'Todos os créditos e contratos do cliente, os planos de pagamento, os pagamentos e os recibos (estão ligados: saem juntos).' },
        { key: 'accounting', page: 'Contabilidade', detail: 'O desembolso dos créditos é estornado: o capital ainda em dívida volta a Caixa/Bancos e os juros por receber são anulados.', fixed: true },
        { key: 'purge', page: 'Lixeira', detail: 'Apagar já definitivamente, sem passar pela lixeira. Não pode ser restaurado.' },
    ] : [
        { key: 'record', page: 'Contratos e Créditos', detail: 'O contrato e o crédito (mesmo registo), o plano de pagamento, os pagamentos e os recibos.', fixed: true },
        { key: 'accounting', page: 'Contabilidade', detail: 'O desembolso é estornado: o capital ainda em dívida volta a Caixa/Bancos e os juros por receber são anulados.', fixed: true },
        { key: 'purge', page: 'Lixeira', detail: 'Apagar já definitivamente, sem passar pela lixeira. Não pode ser restaurado.' },
    ];
    const isChecked = (item: Item) => item.fixed || (item.key === 'credits' && selected.purge) || Boolean(selected[item.key as keyof typeof selected]);

    const confirm = async () => {
        setBusy(true);
        try {
            await onConfirm({ withCredits: selected.credits || selected.purge, accounting: selected.accounting, purge: selected.purge });
            onOpenChange(false);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader className="bg-gradient-to-br from-red-700 to-rose-700">
                    <DialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5" /> Eliminar {kind === 'client' ? 'cliente' : 'contrato'}</DialogTitle>
                    <DialogDescription>Marque as páginas de onde quer eliminar os dados de <strong className="text-white">{name}</strong>.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    {items.map(item => (
                        <label key={item.key} className={`flex items-start gap-3 rounded-xl border p-3 ${item.fixed ? 'bg-muted/40' : 'cursor-pointer hover:bg-muted/40'}`}>
                            <Checkbox className="mt-0.5" checked={isChecked(item)} disabled={item.fixed || (item.key === 'credits' && selected.purge) || busy}
                                onCheckedChange={value => setSelected(previous => ({ ...previous, [item.key]: value === true }))} />
                            <span>
                                <span className="block text-sm font-bold">{item.page}{item.fixed ? ' (sempre)' : ''}</span>
                                <span className="block text-xs text-muted-foreground">{item.detail}</span>
                            </span>
                        </label>
                    ))}
                    {activeCredits > 0 && (selected.credits || selected.purge || kind === 'contract') && (
                        <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            {activeCredits === 1 ? 'Há 1 crédito ainda por pagar' : `Há ${activeCredits} créditos ainda por pagar`} que também {activeCredits === 1 ? 'será eliminado' : 'serão eliminados'}. Use só para dados errados ou de teste.
                        </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                        Nenhum dinheiro sai da contabilidade sem registo: os lançamentos originais e o estorno ficam no diário (a contabilidade não
                        permite apagar linhas). Ao restaurar da lixeira, o desembolso volta a ser lançado e exige saldo em Caixa e Bancos.
                    </p>
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
                        <Trash2 className="mr-1.5 h-4 w-4" /> {busy ? 'A eliminar…' : selected.purge ? 'Eliminar definitivamente' : 'Eliminar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
