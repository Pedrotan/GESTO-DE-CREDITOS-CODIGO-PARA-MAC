import { useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useData } from '@/contextos/ContextoDados';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { CREDIT_REPORTS, buildCreditReport, type CreditReportInput, type CreditReportKey } from '@/bibliotecas/relatorios-creditos';
import { downloadDataUrl, renderReportExcel, renderReportPdf } from '@/bibliotecas/relatorios-pagamentos';
import { ServicoPagamentos } from '@/servicos/ServicoPagamentos';
import { SearchableSelect } from '@/componentes/ui/SearchableSelect';
import type { CarteiraState } from './useCarteira';

type Actor = { id: string; name: string; role: string };

/** Gera um relatório da carteira, guarda-o no histórico de relatórios (a exportação fica na auditoria) e descarrega-o. */
export async function generateCreditReport(key: CreditReportKey, input: CreditReportInput, settings: any, actor: Actor, format: 'pdf' | 'xlsx', download = true) {
    const def = buildCreditReport(key, input);
    const file = format === 'pdf' ? renderReportPdf(def, settings, actor.name, 'datauri') : renderReportExcel(def, settings, actor.name, 'datauri');
    await ServicoPagamentos.saveReport({ reportType: def.key, title: def.title, format, fileName: file.fileName, dataUrl: file.dataUrl, filters: { subtitulo: def.subtitle } }, actor as any).catch(() => undefined);
    if (download) downloadDataUrl(file.dataUrl, file.fileName);
    return { ...file, title: def.title };
}

export function RelatoriosCreditos({ state, open, onClose, actor }: { state: CarteiraState; open: boolean; onClose: () => void; actor: Actor | null }) {
    const { companySettings, payments } = useData();
    const [date, setDate] = useState(state.today);
    const [month, setMonth] = useState(state.today.slice(0, 7));
    const [creditId, setCreditId] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState('');
    const run = async (key: CreditReportKey, format: 'pdf' | 'xlsx') => {
        if (!actor || !state.context) return;
        setBusy(`${key}-${format}`); setError('');
        try {
            await generateCreditReport(key, { rows: state.rows, installments: state.context.installments, payments, dateKey: date, monthKey: month, creditId, todayKey: state.today }, companySettings, actor, format);
        } catch (cause: any) { setError(cause?.message || 'Não foi possível gerar o relatório.'); } finally { setBusy(null); }
    };
    return (
        <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
            <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Relatórios da carteira</DialogTitle>
                    <DialogDescription>PDF e Excel, em português, com o cabeçalho da empresa. Ficam no histórico de relatórios.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    {CREDIT_REPORTS.map(report => (
                        <div key={report.key} className="flex flex-col justify-between gap-2 rounded-xl border bg-card p-4">
                            <div><p className="font-bold">{report.title}</p><p className="text-xs text-muted-foreground">{report.description}</p></div>
                            {report.needs === 'date' && <Input type="date" className="h-9" value={date} onChange={event => setDate(event.target.value)} aria-label="Data da carteira" />}
                            {report.needs === 'month' && <Input type="month" className="h-9" value={month} onChange={event => setMonth(event.target.value)} aria-label="Mês" />}
                            {report.needs === 'credit' && (
                                <SearchableSelect value={creditId} onValueChange={setCreditId} placeholder="Escolha o crédito"
                                    options={state.rows.map(row => ({ value: row.id, label: `${row.reference} · ${row.clientName}` }))} />
                            )}
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="flex-1 gap-1.5" disabled={!!busy || (report.needs === 'credit' && !creditId)} onClick={() => void run(report.key, 'pdf')}>
                                    {busy === `${report.key}-pdf` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-red-600" />} PDF</Button>
                                <Button size="sm" variant="outline" className="flex-1 gap-1.5" disabled={!!busy || (report.needs === 'credit' && !creditId)} onClick={() => void run(report.key, 'xlsx')}>
                                    {busy === `${report.key}-xlsx` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-emerald-600" />} Excel</Button>
                            </div>
                        </div>
                    ))}
                </div>
                {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
            </DialogContent>
        </Dialog>
    );
}
