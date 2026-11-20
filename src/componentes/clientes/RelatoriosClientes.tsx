import { useMemo, useState } from 'react';
import { ChevronDown, FileSpreadsheet, FileText, Filter, Loader2, PhoneCall, RotateCcw } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { useToast } from '@/componentes/ui/use-toast';
import { CLIENT_STATUS_LABELS, type ClientDisplayStatus } from '@/bibliotecas/estado-cliente';
import { ROTULO_ESTADO_BI, type EstadoBI } from '@/bibliotecas/rh/bi-validade';
import { renderReportExcel, renderReportPdf } from '@/bibliotecas/relatorios-pagamentos';
import {
    buildClientsReport, CREDIT_FILTER_LABELS, distinctValues, EMPTY_CLIENT_FILTERS, filterClientRows, RISK_LABELS,
    type ClientReportFilters, type ClientReportRow, type CreditFilter,
} from '@/bibliotecas/relatorio-clientes';
import { ServicoAuditoria } from '@/servicos/ServicoAuditoria';

type Props = {
    rows: ClientReportRow[];
    categoryLabel: string;
    settings: unknown;
    user?: { id: string; name: string } | null;
    /** Relatório «Clientes com BI expirado ou a expirar» (Excel), já existente na página. */
    onExportBIContacts: () => void;
};

const field = 'space-y-1.5';

/**
 * Botão «Relatórios» da página de Clientes: lista completa com todos os dados (PDF em paisagem ou Excel),
 * relatório com filtros (estado, risco, tipo, género, província, município, BI, crédito, rendimento, cadastro)
 * e a lista de clientes a contactar por BI expirado.
 */
export function RelatoriosClientes({ rows, categoryLabel, settings, user, onExportBIContacts }: Props) {
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [filters, setFilters] = useState<ClientReportFilters>(EMPTY_CLIENT_FILTERS);
    const [busy, setBusy] = useState<string | null>(null);
    const clients = useMemo(() => rows.map(row => row.client), [rows]);
    const provinces = useMemo(() => distinctValues(clients, 'province'), [clients]);
    const municipalities = useMemo(() => distinctValues(clients, 'municipality', filters.province), [clients, filters.province]);
    const genders = useMemo(() => distinctValues(clients, 'gender'), [clients]);
    const selected = useMemo(() => filterClientRows(rows, filters), [rows, filters]);
    const set = <K extends keyof ClientReportFilters>(key: K, value: ClientReportFilters[K]) => setFilters(current => ({ ...current, [key]: value }));

    const generate = async (format: 'pdf' | 'xlsx', withFilters: boolean) => {
        const list = withFilters ? selected : rows;
        if (!list.length) {
            toast({ title: 'Sem clientes para o relatório', description: 'Nenhum cliente corresponde aos filtros escolhidos.' });
            return;
        }
        setBusy(`${format}-${withFilters ? 'filtros' : 'completa'}`);
        try {
            const def = buildClientsReport(list, {
                title: withFilters ? 'Relatório de clientes (filtrado)' : 'Lista completa de clientes',
                categoryLabel, filters: withFilters ? filters : undefined,
            });
            const userName = user?.name || 'Sistema';
            const file = format === 'pdf' ? renderReportPdf(def, settings, userName, 'save') : renderReportExcel(def, settings, userName, 'save');
            if (user) {
                await ServicoAuditoria.addLog('export', 'report', `Relatório de clientes (${format.toUpperCase()}) · ${list.length} cliente(s)`, user.id, user.name,
                    null, null, { report: 'clientes', format, filtros: withFilters ? filters : 'lista completa', fileName: file.fileName }).catch(() => undefined);
            }
            toast({ title: 'Relatório gerado', description: `${file.fileName} · ${list.length} cliente(s).` });
        } catch (error) {
            console.error('[Clientes] Falha ao gerar o relatório:', error);
            toast({ title: 'Não foi possível gerar o relatório', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
        } finally {
            setBusy(null);
        }
    };
    const spinner = (key: string, icon: JSX.Element) => (busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : icon);

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-10 gap-2 rounded-xl border-border/70 bg-card font-semibold shadow-sm hover:bg-muted" disabled={!!busy}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-primary" />}
                        Relatórios
                        <ChevronDown className="h-4 w-4 opacity-60" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuLabel>Lista completa ({rows.length} clientes)</DropdownMenuLabel>
                    <DropdownMenuItem className="gap-2" onClick={() => void generate('pdf', false)}>
                        <FileText className="h-4 w-4 text-red-600" /> PDF em paisagem, com todos os dados
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onClick={() => void generate('xlsx', false)}>
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel, com todos os dados
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="gap-2 font-semibold" onClick={() => setOpen(true)}>
                        <Filter className="h-4 w-4 text-primary" /> Relatório com filtros…
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onClick={onExportBIContacts}>
                        <PhoneCall className="h-4 w-4 text-orange-600" /> Clientes a contactar (BI expirado) — Excel
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Filter className="h-5 w-5 text-primary" /> Relatório de clientes com filtros</DialogTitle>
                        <DialogDescription>Combine os filtros que precisar. O relatório sai em paisagem com todos os dados de cada cliente: identificação, morada, situação financeira e cônjuge.</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className={field}>
                            <Label htmlFor="relatorio-clientes-pesquisa">Pesquisa (nome, BI/NIF, telefone ou email)</Label>
                            <Input id="relatorio-clientes-pesquisa" value={filters.search} onChange={event => set('search', event.target.value)} placeholder="Ex.: Paulo, 00123…" />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className={field}>
                                <Label>Estado</Label>
                                <Select value={filters.status} onValueChange={value => set('status', value as ClientReportFilters['status'])}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos os estados</SelectItem>
                                        {(Object.keys(CLIENT_STATUS_LABELS) as ClientDisplayStatus[]).map(key => <SelectItem key={key} value={key}>{CLIENT_STATUS_LABELS[key]}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className={field}>
                                <Label>Crédito</Label>
                                <Select value={filters.credit} onValueChange={value => set('credit', value as CreditFilter)}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {(Object.keys(CREDIT_FILTER_LABELS) as CreditFilter[]).map(key => <SelectItem key={key} value={key}>{CREDIT_FILTER_LABELS[key]}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className={field}>
                                <Label>Risco</Label>
                                <Select value={filters.risk} onValueChange={value => set('risk', value as ClientReportFilters['risk'])}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos os níveis</SelectItem>
                                        {Object.entries(RISK_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className={field}>
                                <Label>Tipo de cliente</Label>
                                <Select value={filters.clientType} onValueChange={value => set('clientType', value as ClientReportFilters['clientType'])}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Particulares e empresas</SelectItem>
                                        <SelectItem value="PARTICULAR">Particulares</SelectItem>
                                        <SelectItem value="EMPRESA">Empresas</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className={field}>
                                <Label>Validade do BI</Label>
                                <Select value={filters.bi} onValueChange={value => set('bi', value as ClientReportFilters['bi'])}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos</SelectItem>
                                        <SelectItem value="contactar">Expirado ou a expirar</SelectItem>
                                        {(['valido', 'a_expirar', 'expirado', 'sem_data'] as EstadoBI[]).map(key => <SelectItem key={key} value={key}>{ROTULO_ESTADO_BI[key]}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className={field}>
                                <Label>Género</Label>
                                <Select value={filters.gender} onValueChange={value => set('gender', value)}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos</SelectItem>
                                        {genders.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className={field}>
                                <Label>Província</Label>
                                <Select value={filters.province} onValueChange={value => setFilters(current => ({ ...current, province: value, municipality: 'all' }))}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas as províncias</SelectItem>
                                        {provinces.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className={field}>
                                <Label>Município</Label>
                                <Select value={filters.municipality} onValueChange={value => set('municipality', value)}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos os municípios</SelectItem>
                                        {municipalities.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="hidden sm:block" />
                            <div className={field}>
                                <Label htmlFor="relatorio-clientes-de">Cadastrado de</Label>
                                <Input id="relatorio-clientes-de" type="date" className="h-9" value={filters.createdFrom} onChange={event => set('createdFrom', event.target.value)} />
                            </div>
                            <div className={field}>
                                <Label htmlFor="relatorio-clientes-ate">Cadastrado até</Label>
                                <Input id="relatorio-clientes-ate" type="date" className="h-9" value={filters.createdTo} onChange={event => set('createdTo', event.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className={field}>
                                    <Label htmlFor="relatorio-clientes-rmin">Rendimento mín.</Label>
                                    <Input id="relatorio-clientes-rmin" inputMode="numeric" className="h-9" value={filters.incomeMin} onChange={event => set('incomeMin', event.target.value.replace(/[^\d.]/g, ''))} placeholder="Kz" />
                                </div>
                                <div className={field}>
                                    <Label htmlFor="relatorio-clientes-rmax">Rendimento máx.</Label>
                                    <Input id="relatorio-clientes-rmax" inputMode="numeric" className="h-9" value={filters.incomeMax} onChange={event => set('incomeMax', event.target.value.replace(/[^\d.]/g, ''))} placeholder="Kz" />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/40 p-3 text-sm">
                            <p><span className="font-bold text-foreground">{selected.length}</span> de {rows.length} cliente(s) correspondem aos filtros.</p>
                            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setFilters(EMPTY_CLIENT_FILTERS)}><RotateCcw className="h-3.5 w-3.5" /> Limpar filtros</Button>
                        </div>

                        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
                            <Button variant="outline" className="gap-2" disabled={!!busy} onClick={() => void generate('xlsx', true)}>
                                {spinner('xlsx-filtros', <FileSpreadsheet className="h-4 w-4 text-emerald-600" />)} Descarregar Excel
                            </Button>
                            <Button className="gap-2" disabled={!!busy} onClick={() => void generate('pdf', true)}>
                                {spinner('pdf-filtros', <FileText className="h-4 w-4" />)} Descarregar PDF (paisagem)
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
