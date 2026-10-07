import { useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useData } from '@/contextos/ContextoDados';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { luandaDateKey } from '@/bibliotecas/fuso-angola';
import { LIMITS_REPORTS, buildLimitsReport, type LimitsReportKey } from '@/bibliotecas/relatorios-alcadas';
import { downloadDataUrl, renderReportExcel, renderReportPdf } from '@/bibliotecas/relatorios-pagamentos';
import { ServicoPagamentos } from '@/servicos/ServicoPagamentos';
import { ServicoAlcadas } from '@/servicos/ServicoAlcadas';
import type { AlcadasState } from './useAlcadas';

type Period = 'month' | 'previous' | '30d' | 'year' | 'custom';
const shiftDays = (key: string, days: number) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); };
const label = (key: string) => key.split('-').reverse().join('/');

function rangeOf(period: Period, from: string, to: string, now: Date) {
    const today = luandaDateKey(now);
    const [year, month] = today.split('-').map(Number);
    if (period === 'month') { const start = `${today.slice(0, 7)}-01`; return { from: start, to: today, label: `Mês atual (${label(start)} a ${label(today)})` }; }
    if (period === 'previous') {
        const start = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
        const end = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
        return { from: start, to: end, label: `Mês anterior (${label(start)} a ${label(end)})` };
    }
    if (period === '30d') { const start = shiftDays(today, -29); return { from: start, to: today, label: `Últimos 30 dias (${label(start)} a ${label(today)})` }; }
    if (period === 'year') { const start = `${year}-01-01`; return { from: start, to: today, label: `Ano de ${year} (até ${label(today)})` }; }
    return { from, to, label: `De ${label(from)} a ${label(to)}` };
}

export function RelatoriosLimites({ state, open, onClose }: { state: AlcadasState; open: boolean; onClose: () => void }) {
    const { companySettings } = useData();
    const [period, setPeriod] = useState<Period>('month');
    const [from, setFrom] = useState(luandaDateKey(new Date()).slice(0, 8) + '01');
    const [to, setTo] = useState(luandaDateKey(new Date()));
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState('');

    const generate = async (key: LimitsReportKey, format: 'pdf' | 'xlsx') => {
        if (!state.data || !state.policy || !state.user) return;
        const range = rangeOf(period, from, to, new Date());
        if (range.from > range.to) { setError('A data inicial tem de ser anterior à final.'); return; }
        setBusy(`${key}-${format}`); setError('');
        try {
            // Consumo lido desde o início do período (a página só mantém os dois últimos meses).
            const ledger = await ServicoAlcadas.ledger(range.from);
            const def = buildLimitsReport(key, {
                periodLabel: range.label, fromKey: range.from, toKey: range.to, policy: state.policy, profileName: state.profileName,
                users: state.data.users.map(user => ({ id: user.id, name: user.name, role: user.role, branchId: user.branchId || null, branchName: user.branchName })),
                ledger, escalations: state.data.escalations, approvals: state.data.approvals, exceptions: state.data.exceptions, versions: state.data.versions,
            });
            const file = format === 'pdf' ? renderReportPdf(def, companySettings, state.user.name, 'datauri') : renderReportExcel(def, companySettings, state.user.name, 'datauri');
            await ServicoPagamentos.saveReport({ reportType: def.key, title: def.title, format, fileName: file.fileName, dataUrl: file.dataUrl,
                filters: { periodo: range.label } }, { id: state.user.id, name: state.user.name, role: state.user.role } as any).catch(() => undefined);
            downloadDataUrl(file.dataUrl, file.fileName);
        } catch (cause: any) { setError(cause?.message || 'Não foi possível gerar o relatório.'); } finally { setBusy(null); }
    };

    return (
        <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Relatórios de limites</DialogTitle>
                    <DialogDescription>PDF e Excel, em português, com o cabeçalho da empresa. Ficam no histórico de relatórios e a exportação fica na Auditoria.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-wrap items-end gap-2">
                    <div><p className="mb-1 text-xs font-semibold">Período</p>
                        <Select value={period} onValueChange={value => setPeriod(value as Period)}>
                            <SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="month">Mês atual</SelectItem><SelectItem value="previous">Mês anterior</SelectItem><SelectItem value="30d">Últimos 30 dias</SelectItem><SelectItem value="year">Este ano</SelectItem><SelectItem value="custom">Personalizado</SelectItem></SelectContent>
                        </Select></div>
                    {period === 'custom' && <>
                        <div><p className="mb-1 text-xs font-semibold">De</p><Input type="date" className="h-9" value={from} onChange={event => setFrom(event.target.value)} /></div>
                        <div><p className="mb-1 text-xs font-semibold">Até</p><Input type="date" className="h-9" value={to} onChange={event => setTo(event.target.value)} /></div>
                    </>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    {LIMITS_REPORTS.map(report => (
                        <div key={report.key} className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4">
                            <div><p className="font-bold">{report.title}</p><p className="text-xs text-muted-foreground">{report.description}</p></div>
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="flex-1 gap-1.5" disabled={!!busy} onClick={() => void generate(report.key, 'pdf')}>
                                    {busy === `${report.key}-pdf` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-red-600" />} PDF</Button>
                                <Button size="sm" variant="outline" className="flex-1 gap-1.5" disabled={!!busy} onClick={() => void generate(report.key, 'xlsx')}>
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
