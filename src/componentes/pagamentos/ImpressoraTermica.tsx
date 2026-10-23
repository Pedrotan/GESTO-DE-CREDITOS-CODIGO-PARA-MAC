import { useEffect, useState } from 'react';
import { AlertTriangle, Download, Loader2, Printer, Receipt } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Checkbox } from '@/componentes/ui/checkbox';
import { cn } from '@/bibliotecas/utils';

// O talão de 80 mm só deve sair numa impressora térmica de rolo de 80 mm: numa impressora A4 sairia uma tira
// estreita no meio da folha. Antes de imprimir, avisa e deixa escolher só impressoras térmicas.

type PrinterInfo = { name: string; displayName?: string; description?: string; isDefault?: boolean };

const LAST_PRINTER_KEY = 'tango_impressora_80mm';
const THERMAL_NAME = /(80\s*mm|\b80\b|\bpos\b|pos[-\s]?\d|thermal|t[ée]rmic|receipt|recibo|tal[ãa]o|xprinter|\bxp-|\btm-|epson tm|rongta|bixolon|star tsp|\bgp-|sewoo|citizen ct|zjiang|hprt|sunmi|elgin|daruma|bematech)/i;

/** Impressora que, pelo nome ou descrição, é térmica de 80 mm. */
export const isThermalPrinter = (printer: PrinterInfo) => THERMAL_NAME.test(`${printer.name} ${printer.displayName || ''} ${printer.description || ''}`);

export function ImpressoraTermica({ open, onOpenChange, onPrint, onDownload }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPrint: (printerName?: string) => Promise<void>;
    onDownload: () => Promise<void>;
}) {
    const desktop = typeof window !== 'undefined' && Boolean(window.electronAPI?.getPrinters);
    const [printers, setPrinters] = useState<PrinterInfo[] | null>(null);
    const [selected, setSelected] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return;
        setError(''); setConfirmed(false); setBusy(false);
        if (!desktop) { setPrinters([]); return; }
        setPrinters(null);
        window.electronAPI!.getPrinters().then(list => {
            setPrinters(list);
            let last = '';
            try { last = localStorage.getItem(LAST_PRINTER_KEY) || ''; } catch { /* preferência local */ }
            const preferred = list.find(item => item.name === last) || list.find(isThermalPrinter);
            setSelected(preferred?.name || '');
        }).catch(() => setPrinters([]));
    }, [open, desktop]);

    const chosen = printers?.find(item => item.name === selected);
    const chosenIsThermal = Boolean(chosen && isThermalPrinter(chosen));
    const canPrint = desktop ? Boolean(chosen) && (chosenIsThermal || confirmed) : true;
    const thermalCount = printers?.filter(isThermalPrinter).length || 0;

    const run = async (action: () => Promise<void>) => {
        setBusy(true); setError('');
        try { await action(); onOpenChange(false); }
        catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
        finally { setBusy(false); }
    };
    const print = () => run(async () => {
        if (chosen) { try { localStorage.setItem(LAST_PRINTER_KEY, chosen.name); } catch { /* preferência local */ } }
        await onPrint(desktop ? chosen?.name : undefined);
    });

    return (
        <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-primary" /> Impressora térmica de 80 mm necessária</DialogTitle>
                    <DialogDescription>
                        Este comprovativo é um talão de rolo com <b>80 mm de largura</b>. Só deve ser impresso numa impressora térmica de talões
                        (rolo de 80 mm, por exemplo Epson TM-T20, Xprinter XP-80 ou POS-80). Numa impressora de folhas A4 sairia uma tira estreita.
                    </DialogDescription>
                </DialogHeader>

                {desktop ? (
                    printers === null ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A procurar impressoras…</p>
                    ) : printers.length === 0 ? (
                        <p className="flex gap-2 rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Não há impressoras instaladas neste computador. Instale a impressora térmica de 80 mm ou descarregue o talão em PDF.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {thermalCount === 0 && (
                                <p className="flex gap-2 rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Nenhuma das impressoras instaladas parece ser térmica de 80 mm. Ligue a impressora de talões ou confirme abaixo que a escolhida usa rolo de 80 mm.
                                </p>
                            )}
                            <div className="max-h-56 space-y-1.5 overflow-y-auto" role="radiogroup" aria-label="Impressora">
                                {printers.map(printer => {
                                    const thermal = isThermalPrinter(printer);
                                    return (
                                        <button key={printer.name} type="button" role="radio" aria-checked={selected === printer.name}
                                            onClick={() => { setSelected(printer.name); setConfirmed(false); }}
                                            className={cn('flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                                                selected === printer.name ? 'border-primary bg-primary/5' : 'hover:bg-muted/60')}>
                                            <span className="flex min-w-0 items-center gap-2"><Printer className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{printer.displayName || printer.name}</span></span>
                                            <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase', thermal ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
                                                {thermal ? 'Térmica 80 mm' : 'Não é térmica'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            {chosen && !chosenIsThermal && (
                                <label className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
                                    <Checkbox checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} className="mt-0.5" />
                                    <span>Confirmo que <b>{chosen.displayName || chosen.name}</b> é uma impressora térmica com rolo de 80 mm (o nome não o indica).</span>
                                </label>
                            )}
                        </div>
                    )
                ) : (
                    <p className="flex gap-2 rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> No navegador, escolha a impressora térmica de 80 mm na janela de impressão seguinte (papel 80 mm, margens nenhumas).
                    </p>
                )}

                {error && <p className="flex gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
                <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
                    <Button variant="outline" className="gap-2" onClick={() => run(onDownload)} disabled={busy}><Download className="h-4 w-4" /> Descarregar PDF</Button>
                    <Button className="gap-2" onClick={print} disabled={busy || !canPrint}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Imprimir talão
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
