import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { formatCurrency } from '@/bibliotecas/formatters';
import { DEFAULT_DEBTOR_FILTERS, buildDebtors, debtorsReport, type DebtorFilters } from '@/bibliotecas/relatorios-previsao';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { useCarteira } from '@/componentes/creditos/useCarteira';
import { generateReportFromDef } from '@/componentes/creditos/RelatoriosCreditos';

const selectClass = 'mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

/** Relatório de devedores (PDF ou Excel) com filtros escolhidos: situação, atraso, valor, gestor, pesquisa e ordem. */
export function RelatorioDevedores({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
            <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Relatório de devedores</DialogTitle>
                    <DialogDescription>Escolha os filtros e descarregue em PDF ou Excel. Fica no histórico de relatórios.</DialogDescription>
                </DialogHeader>
                {/* Os dados da carteira só são lidos com a janela aberta. */}
                {open && <Conteudo />}
            </DialogContent>
        </Dialog>
    );
}

function Conteudo() {
    const state = useCarteira();
    const { user } = useAuth();
    const { clients, companySettings } = useData();
    const [filters, setFilters] = useState<DebtorFilters>(DEFAULT_DEBTOR_FILTERS);
    const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);
    const [error, setError] = useState('');
    const phones = useMemo(() => new Map(clients.map(client => [client.id, client.phone || ''])), [clients]);
    const managers = useMemo(() => [...new Set(state.rows.map(row => row.managerName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt')), [state.rows]);
    const preview = useMemo(() => buildDebtors(state.rows, phones, filters), [state.rows, phones, filters]);
    const set = <K extends keyof DebtorFilters>(key: K, value: DebtorFilters[K]) => setFilters(previous => ({ ...previous, [key]: value }));

    const download = async (format: 'pdf' | 'xlsx') => {
        if (!user) return;
        setBusy(format); setError('');
        try {
            await generateReportFromDef(debtorsReport({ rows: state.rows, phones, filters, todayKey: state.today }), companySettings, { id: user.id, name: user.name, role: user.role }, format);
        } catch (cause: any) { setError(cause?.message || 'Não foi possível gerar o relatório.'); } finally { setBusy(null); }
    };

    if (state.loading) return <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />A ler a carteira…</p>;
    const total = preview.reduce((sum, item) => sum + item.owedMinor, 0);
    const overdue = preview.reduce((sum, item) => sum + item.overdueMinor, 0);

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
                <div><Label className="text-xs font-bold">Situação</Label>
                    <select className={selectClass} value={filters.situation} onChange={event => set('situation', event.target.value as DebtorFilters['situation'])}>
                        <option value="all">Todos os devedores</option><option value="overdue">Só em atraso</option><option value="current">Só em dia</option>
                    </select></div>
                <div><Label className="text-xs font-bold">Atraso mínimo (dias)</Label>
                    <Input className="mt-1 h-9" type="number" min={0} value={filters.minDays} onChange={event => set('minDays', Math.max(0, Number(event.target.value) || 0))} /></div>
                <div><Label className="text-xs font-bold">Dívida mínima (Kz)</Label>
                    <Input className="mt-1 h-9" type="number" min={0} step={1000} value={filters.minOwedKz} onChange={event => set('minOwedKz', Math.max(0, Number(event.target.value) || 0))} /></div>
                <div><Label className="text-xs font-bold">Gestor</Label>
                    <select className={selectClass} value={filters.manager} onChange={event => set('manager', event.target.value)}>
                        <option value="all">Todos os gestores</option>{managers.map(name => <option key={name} value={name}>{name}</option>)}
                    </select></div>
                <div><Label className="text-xs font-bold">Ordenar por</Label>
                    <select className={selectClass} value={filters.sort} onChange={event => set('sort', event.target.value as DebtorFilters['sort'])}>
                        <option value="owed">Maior dívida</option><option value="days">Maior atraso</option><option value="overdue">Maior valor em atraso</option><option value="name">Nome</option>
                    </select></div>
                <div><Label className="text-xs font-bold">Pesquisar</Label>
                    <Input className="mt-1 h-9" placeholder="Nome, telefone ou contrato" value={filters.search} onChange={event => set('search', event.target.value)} /></div>
            </div>
            <div className="grid gap-3 rounded-xl border bg-muted/30 p-3 text-sm sm:grid-cols-3">
                <p><span className="block text-[11px] font-bold uppercase text-muted-foreground">Devedores</span><strong className="text-lg">{preview.length}</strong></p>
                <p><span className="block text-[11px] font-bold uppercase text-muted-foreground">Total em dívida</span><strong className="text-lg text-destructive">{formatCurrency(total / 100)}</strong></p>
                <p><span className="block text-[11px] font-bold uppercase text-muted-foreground">Em atraso</span><strong className="text-lg text-amber-600">{formatCurrency(overdue / 100)}</strong></p>
            </div>
            {preview.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                    {preview.slice(0, 20).map(item => (
                        <li key={item.clientId} className="flex justify-between gap-2 border-b py-1">
                            <span><strong>{item.clientName}</strong> · {item.maxDays > 0 ? <span className="font-semibold text-red-600">{item.maxDays} dia(s) em atraso</span> : <span className="text-emerald-600">em dia</span>}</span>
                            <span className="font-bold">{formatCurrency(item.owedMinor / 100)}</span>
                        </li>
                    ))}
                </ul>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setFilters(DEFAULT_DEBTOR_FILTERS)}>Limpar filtros</Button>
                <Button variant="outline" disabled={!!busy} onClick={() => void download('xlsx')}>
                    {busy === 'xlsx' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" />} Excel</Button>
                <Button disabled={!!busy} onClick={() => void download('pdf')}>
                    {busy === 'pdf' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />} PDF</Button>
            </div>
        </div>
    );
}
