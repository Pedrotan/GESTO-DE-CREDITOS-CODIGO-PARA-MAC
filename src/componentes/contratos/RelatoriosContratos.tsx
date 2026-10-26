import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Label } from '@/componentes/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { SearchableSelect } from '@/componentes/ui/SearchableSelect';
import { SeletorPeriodo } from '@/componentes/comum/SeletorPeriodo';
import { useToast } from '@/componentes/ui/use-toast';
import { defaultPeriod, periodRange, type PeriodSelection } from '@/bibliotecas/periodos';
import { inKeyRange, rangeKeys } from '@/bibliotecas/pagamentos-analise';
import { renderReportExcel, renderReportPdf } from '@/bibliotecas/relatorios-pagamentos';
import {
    REPORT_STATE_LABELS, buildContractsReport, kz, matchesReportState, sumContracts, type ContractRow, type ReportStateFilter,
} from '@/bibliotecas/contratos-analise';
import { ServicoAuditoria } from '@/servicos/ServicoAuditoria';

const ALL = '__todos__';

/**
 * Relatório de contratos celebrados (PDF e Excel) com os filtros de período (mês, trimestre, ano ou intervalo),
 * estado, cliente, produto e gestor. Usa o mesmo motor e estilo dos relatórios de Pagamentos.
 */
export function RelatoriosContratos({ open, onOpenChange, rows, settings, user }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    rows: ContractRow[];
    settings: any;
    user?: { id: string; name: string } | null;
}) {
    const { toast } = useToast();
    const [period, setPeriod] = useState<PeriodSelection>(() => defaultPeriod(new Date(), 'month'));
    const [state, setState] = useState<ReportStateFilter>('todos');
    const [clientId, setClientId] = useState(ALL);
    const [product, setProduct] = useState(ALL);
    const [managerId, setManagerId] = useState(ALL);
    const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);

    const options = useMemo(() => {
        const clients = new Map<string, { label: string; sub: string }>();
        const managers = new Map<string, string>();
        rows.forEach(row => {
            clients.set(row.clientId, { label: row.clientName, sub: row.nif });
            if (row.managerId) managers.set(row.managerId, row.managerName);
        });
        return {
            clients: [{ value: ALL, label: 'Todos os clientes' }, ...[...clients].sort((a, b) => a[1].label.localeCompare(b[1].label)).map(([value, item]) => ({ value, label: item.label, subLabel: item.sub }))],
            products: [...new Set(rows.map(row => row.product).filter(item => item && item !== '—'))].sort(),
            managers: [...managers].sort((a, b) => a[1].localeCompare(b[1])),
        };
    }, [rows]);

    const range = useMemo(() => periodRange(period), [period]);
    const selected = useMemo(() => {
        const keys = rangeKeys(range);
        return rows.filter(row => inKeyRange(row.startKey, keys) && matchesReportState(row, state)
            && (clientId === ALL || row.clientId === clientId) && (product === ALL || row.product === product)
            && (managerId === ALL || row.managerId === managerId));
    }, [rows, range, state, clientId, product, managerId]);
    const totals = useMemo(() => sumContracts(selected), [selected]);

    const filterLabels = () => [
        state !== 'todos' ? `Estado: ${REPORT_STATE_LABELS[state]}` : '',
        clientId !== ALL ? `Cliente: ${options.clients.find(item => item.value === clientId)?.label || clientId}` : '',
        product !== ALL ? `Produto: ${product}` : '',
        managerId !== ALL ? `Gestor: ${options.managers.find(item => item[0] === managerId)?.[1] || managerId}` : '',
    ].filter(Boolean);

    const generate = async (format: 'pdf' | 'xlsx') => {
        setBusy(format);
        try {
            const def = buildContractsReport(selected, { periodLabel: range.label, filters: filterLabels() });
            const userName = user?.name || 'Sistema';
            const file = format === 'pdf' ? renderReportPdf(def, settings, userName, 'save') : renderReportExcel(def, settings, userName, 'save');
            if (user) {
                await ServicoAuditoria.addLog('export', 'report', `Relatório de contratos (${format.toUpperCase()}) · ${range.label} · ${selected.length} contrato(s)`, user.id, user.name,
                    null, null, { report: 'contratos', format, periodo: range.label, filtros: filterLabels(), fileName: file.fileName }).catch(() => undefined);
            }
            toast({ title: 'Relatório gerado', description: `${file.fileName} · ${selected.length} contrato(s).` });
        } catch (error) {
            console.error('[Contratos] Falha ao gerar o relatório:', error);
            toast({ title: 'Não foi possível gerar o relatório', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
        } finally {
            setBusy(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-indigo-500" /> Relatório de contratos celebrados</DialogTitle>
                    <DialogDescription>Escolha o período e os filtros. O relatório inclui o n.º de contratos, o valor contratado, o saldo em dívida, o valor em atraso e o valor reembolsado.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label>Período (data de início do contrato)</Label>
                        <SeletorPeriodo value={period} onChange={setPeriod} kinds={['month', 'quarter', 'year', 'custom']} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Estado</Label>
                            <Select value={state} onValueChange={value => setState(value as ReportStateFilter)}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(REPORT_STATE_LABELS) as ReportStateFilter[]).map(key => <SelectItem key={key} value={key}>{REPORT_STATE_LABELS[key]}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Cliente</Label>
                            <SearchableSelect options={options.clients} value={clientId} onValueChange={value => setClientId(value || ALL)} placeholder="Todos os clientes" searchPlaceholder="Pesquisar cliente..." emptyMessage="Nenhum cliente." />
                        </div>
                        {options.products.length > 0 && (
                            <div className="space-y-1.5">
                                <Label>Produto</Label>
                                <Select value={product} onValueChange={setProduct}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={ALL}>Todos os produtos</SelectItem>
                                        {options.products.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        {options.managers.length > 0 && (
                            <div className="space-y-1.5">
                                <Label>Gestor</Label>
                                <Select value={managerId} onValueChange={setManagerId}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={ALL}>Todos os gestores</SelectItem>
                                        {options.managers.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/40 p-3 text-xs sm:grid-cols-5">
                        {[
                            ['Contratos', String(totals.count)], ['Valor contratado', kz(totals.amountMinor)], ['Saldo em dívida', kz(totals.outstandingMinor)],
                            ['Em atraso', kz(totals.overdueMinor)], ['Reembolsado', kz(totals.repaidMinor)],
                        ].map(([label, value]) => (
                            <div key={label} className="min-w-0">
                                <p className="font-semibold text-muted-foreground">{label}</p>
                                <p className="truncate font-bold text-foreground" title={value}>{value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
                        <Button variant="outline" className="gap-2" disabled={!!busy} onClick={() => void generate('xlsx')}>
                            {busy === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-emerald-600" />} Descarregar Excel
                        </Button>
                        <Button className="gap-2" disabled={!!busy} onClick={() => void generate('pdf')}>
                            {busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Descarregar PDF
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
