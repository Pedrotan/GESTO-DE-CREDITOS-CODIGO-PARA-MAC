import { useEffect, useState } from 'react';
import { Loader2, Percent, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { useToast } from '@/componentes/ui/use-toast';
import { useData } from '@/contextos/ContextoDados';
import { CREDIT_DIALOG_CONTENT_CLASS, CREDIT_DIALOG_HEADER_CLASS } from '@/componentes/forms/credit-dialog-styles';
import {
    DEFAULT_INTEREST_TIERS,
    InterestTier,
    MAX_INTEREST_TIERS,
    tierLabel,
    validateInterestTiers,
} from '@/bibliotecas/taxas-juro';

interface TabelaTaxasDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type DraftTier = { id: string; minMonths: string; maxMonths: string; rate: string };

const toDraft = (tiers: InterestTier[]): DraftTier[] =>
    tiers.map(t => ({ id: t.id, minMonths: String(t.minMonths), maxMonths: String(t.maxMonths), rate: String(t.rate) }));

const fromDraft = (rows: DraftTier[]): InterestTier[] =>
    rows.map(r => ({
        id: r.id,
        minMonths: Number(r.minMonths),
        maxMonths: Number(r.maxMonths),
        rate: Number(String(r.rate).replace(',', '.')),
    }));

const cellClass = 'h-10 rounded-xl border-slate-200 bg-white text-center font-mono text-sm font-bold dark:border-slate-700 dark:bg-slate-950';

export function TabelaTaxasDialog({ open, onOpenChange }: TabelaTaxasDialogProps) {
    const { interestTiers, saveInterestTiers } = useData();
    const { toast } = useToast();
    const [rows, setRows] = useState<DraftTier[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (open) setRows(toDraft(interestTiers));
    }, [open, interestTiers]);

    const tiers = fromDraft(rows);
    const error = validateInterestTiers(tiers);

    const updateRow = (id: string, field: keyof Omit<DraftTier, 'id'>, value: string) =>
        setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));

    const addRow = () => {
        const lastMax = tiers.reduce((max, t) => (Number.isFinite(t.maxMonths) ? Math.max(max, t.maxMonths) : max), 0);
        const lastRate = tiers.length > 0 ? tiers[tiers.length - 1].rate : 0;
        setRows(prev => [...prev, {
            id: `tier-${Date.now()}`,
            minMonths: String(lastMax + 1),
            maxMonths: String(lastMax + 1),
            rate: String(Number.isFinite(lastRate) ? lastRate : 0),
        }]);
    };

    const handleSave = async () => {
        if (error) return;
        setIsSaving(true);
        try {
            await saveInterestTiers(tiers);
            toast({ title: 'Taxas de juro guardadas', description: 'Ficam disponíveis no Novo Crédito e são partilhadas com os outros dispositivos pela nuvem.' });
            onOpenChange(false);
        } catch (err) {
            console.error('[TabelaTaxasDialog] Falha ao guardar a tabela de taxas:', err);
            toast({ title: 'Não foi possível guardar', description: 'Tente novamente.', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={`${CREDIT_DIALOG_CONTENT_CLASS} max-w-2xl`}>
                <DialogHeader className={CREDIT_DIALOG_HEADER_CLASS}>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight text-white">
                        <Percent className="h-5 w-5 text-secondary" />
                        Cadastro de Taxas de Juro
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-white/75">
                        Cadastre a taxa de cada prazo e guarde. Estas taxas aparecem no modal de Novo Crédito.
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4 md:p-6 dark:bg-slate-950/40">
                    <div className="hidden grid-cols-[1fr_1fr_1fr_auto] gap-3 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:grid">
                        <span>Do mês</span>
                        <span>Até ao mês</span>
                        <span>Taxa de juro (%)</span>
                        <span className="w-10" />
                    </div>

                    {rows.map((row, index) => {
                        const tier = tiers[index];
                        return (
                            <div key={row.id} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                                <Input type="number" min={1} max={120} inputMode="numeric" aria-label="Do mês" className={cellClass}
                                    value={row.minMonths} onChange={e => updateRow(row.id, 'minMonths', e.target.value)} />
                                <Input type="number" min={1} max={120} inputMode="numeric" aria-label="Até ao mês" className={cellClass}
                                    value={row.maxMonths} onChange={e => updateRow(row.id, 'maxMonths', e.target.value)} />
                                <div className="relative">
                                    <Input type="number" min={0} step="0.1" inputMode="decimal" aria-label="Taxa de juro" className={`${cellClass} pr-8`}
                                        value={row.rate} onChange={e => updateRow(row.id, 'rate', e.target.value)} />
                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
                                </div>
                                <Button type="button" variant="ghost" size="icon" aria-label={`Remover escalão ${tier ? tierLabel(tier) : ''}`}
                                    className="h-10 w-10 rounded-xl text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                                    disabled={rows.length <= 1}
                                    onClick={() => setRows(prev => prev.filter(r => r.id !== row.id))}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        );
                    })}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <Button type="button" variant="outline" onClick={addRow} disabled={rows.length >= MAX_INTEREST_TIERS}
                            className="h-10 gap-2 rounded-xl border-dashed border-slate-300 text-sm font-semibold">
                            <Plus className="h-4 w-4" /> Adicionar escalão
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setRows(toDraft(DEFAULT_INTEREST_TIERS))}
                            className="h-10 gap-2 rounded-xl text-sm text-slate-600 dark:text-slate-300">
                            <RotateCcw className="h-4 w-4" /> Repor tabela padrão
                        </Button>
                    </div>

                    {error ? (
                        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                            {error}
                        </p>
                    ) : (
                        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Pré-visualização</p>
                            <div className="flex flex-wrap gap-2">
                                {[...tiers].sort((a, b) => a.minMonths - b.minMonths).map(t => (
                                    <span key={t.id} className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary dark:bg-primary/30 dark:text-primary-foreground">
                                        {tierLabel(t)}
                                    </span>
                                ))}
                            </div>
                            <p className="mt-2 text-[11px] text-slate-500">
                                Prazos acima do último escalão usam a última taxa. Ao escolher um escalão, o contrato fica com o mês final do intervalo.
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-4 py-4 md:px-6 dark:border-slate-800 dark:bg-slate-900">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}
                        className="h-11 rounded-xl border-slate-200 px-6 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                        Cancelar
                    </Button>
                    <Button type="button" onClick={handleSave} disabled={!!error || isSaving}
                        className="h-11 gap-2 rounded-xl bg-primary px-6 font-bold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Guardar Tabela
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
