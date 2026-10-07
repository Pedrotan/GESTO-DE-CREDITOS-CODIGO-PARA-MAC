import { useEffect, useState } from 'react';
import { CalendarClock, ChevronDown, Download, FileBarChart, FileSpreadsheet, FileText, History, Loader2, Mail, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Switch } from '@/componentes/ui/switch';
import { SearchableSelect } from '@/componentes/ui/SearchableSelect';
import { formatLuandaDateTime } from '@/bibliotecas/fuso-angola';
import { cn } from '@/bibliotecas/utils';
import { REPORTS, downloadDataUrl, type ReportKey } from '@/bibliotecas/relatorios-pagamentos';
import { ServicoPagamentos, type ReportHistoryItem, type ReportSchedule } from '@/servicos/ServicoPagamentos';

type Option = { value: string; label: string; subLabel?: string };

export function MenuRelatorios({ onPick, onHistory, onSchedules, disabled }: { onPick: (key: ReportKey) => void; onHistory: () => void; onSchedules: () => void; disabled?: boolean }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={disabled}><FileBarChart className="h-4 w-4" /> Relatórios <ChevronDown className="h-3.5 w-3.5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Relatórios (período e filtros actuais)</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {REPORTS.map((report, index) => (
                    <DropdownMenuItem key={report.key} onSelect={() => onPick(report.key)} className="flex flex-col items-start gap-0.5">
                        <span className="font-semibold">{index + 1}. {report.title}</span>
                        <span className="text-xs text-muted-foreground">{report.description}</span>
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onSchedules} className="gap-2"><CalendarClock className="h-4 w-4" /> Envio automático por email</DropdownMenuItem>
                <DropdownMenuItem onSelect={onHistory} className="gap-2"><History className="h-4 w-4" /> Histórico de relatórios gerados</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function GerarRelatorioDialog({ report, onOpenChange, periodLabel, filters, clients, contracts, onGenerate }: {
    report: ReportKey | null;
    onOpenChange: (open: boolean) => void;
    periodLabel: string;
    filters: string[];
    clients: Option[];
    contracts: Array<Option & { clientId: string }>;
    onGenerate: (key: ReportKey, format: 'pdf' | 'xlsx', statement?: { clientId?: string; creditId?: string; label: string }) => Promise<void>;
}) {
    const [format, setFormat] = useState<'pdf' | 'xlsx'>('pdf');
    const [clientId, setClientId] = useState('');
    const [creditId, setCreditId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { if (report) { setError(''); setBusy(false); } }, [report]);
    const info = REPORTS.find(item => item.key === report);
    const statement = report === 'extrato-cliente';
    const clientContracts = clientId ? contracts.filter(item => item.clientId === clientId) : contracts;
    const generate = async () => {
        if (!report) return;
        if (statement && !clientId && !creditId) { setError('Escolha o cliente ou o contrato.'); return; }
        setBusy(true); setError('');
        try {
            const label = creditId ? `Contrato ${contracts.find(item => item.value === creditId)?.label || ''}` : `Cliente ${clients.find(item => item.value === clientId)?.label || ''}`;
            await onGenerate(report, format, statement ? { clientId: clientId || undefined, creditId: creditId || undefined, label } : undefined);
            onOpenChange(false);
        } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); } finally { setBusy(false); }
    };
    return (
        <Dialog open={Boolean(report)} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{info?.title}</DialogTitle>
                    <DialogDescription>{info?.description}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    {!statement && (
                        <div className="rounded-lg bg-muted/50 p-3 text-sm">
                            <p><span className="text-muted-foreground">Período:</span> <b>{report === 'rendimentos' ? `ano de ${periodLabel.match(/\d{4}/)?.[0] || ''}` : periodLabel}</b></p>
                            <p><span className="text-muted-foreground">Filtros:</span> {filters.length ? filters.join(' · ') : 'nenhum'}</p>
                        </div>
                    )}
                    {statement && (
                        <div className="grid gap-3">
                            <div className="space-y-1.5">
                                <Label>Cliente</Label>
                                <SearchableSelect options={clients} value={clientId} onValueChange={value => { setClientId(value); setCreditId(''); }} placeholder="Escolher cliente" searchPlaceholder="Pesquisar cliente..." />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Contrato (opcional)</Label>
                                <SearchableSelect options={[{ value: '', label: 'Todos os contratos do cliente' }, ...clientContracts]} value={creditId} onValueChange={setCreditId} placeholder="Todos os contratos" searchPlaceholder="Pesquisar contrato..." />
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        {([['pdf', 'PDF (A4)', FileText], ['xlsx', 'Excel', FileSpreadsheet]] as const).map(([value, label, Icon]) => (
                            <button key={value} type="button" onClick={() => setFormat(value)} aria-pressed={format === value}
                                className={cn('flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-semibold', format === value ? 'border-primary bg-primary/10 ring-2 ring-primary/30' : 'hover:bg-muted')}>
                                <Icon className="h-4 w-4" /> {label}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">O relatório fica guardado no histórico (com os filtros usados) e a geração é registada na auditoria.</p>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
                        <Button onClick={generate} disabled={busy} className="gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Gerar e descarregar</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function HistoricoRelatorios({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const [items, setItems] = useState<ReportHistoryItem[] | null>(null);
    const [error, setError] = useState('');
    useEffect(() => { if (open) { setItems(null); ServicoPagamentos.listReports().then(setItems).catch(() => setItems([])); } }, [open]);
    const download = async (item: ReportHistoryItem) => {
        setError('');
        const file = await ServicoPagamentos.reportFile(item.id);
        if (!file?.fileData) { setError('O ficheiro deste relatório não foi guardado (demasiado grande). Gere-o novamente.'); return; }
        downloadDataUrl(file.fileData, file.fileName);
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Histórico de relatórios gerados</DialogTitle>
                    <DialogDescription>Cada relatório fica guardado neste computador com a data, o utilizador e os filtros usados.</DialogDescription>
                </DialogHeader>
                {!items ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : !items.length ? <p className="py-8 text-center text-sm text-muted-foreground">Ainda não foram gerados relatórios.</p> : (
                    <div className="space-y-2">
                        {items.map(item => {
                            let filters = '';
                            try { const parsed = JSON.parse(item.filters || '{}'); filters = [parsed.periodo, parsed.extrato, ...(parsed.filtros || [])].filter(Boolean).join(' · '); } catch { /* sem filtros */ }
                            return (
                                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                                    <div className="min-w-0">
                                        <p className="font-semibold">{item.title} <Badge variant="outline" className="ml-1 uppercase">{item.format}</Badge></p>
                                        <p className="truncate text-xs text-muted-foreground">{formatLuandaDateTime(item.generatedAt)} · {item.generatedBy}{filters ? ` · ${filters}` : ''}</p>
                                    </div>
                                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => download(item)}><Download className="h-3.5 w-3.5" /> Descarregar</Button>
                                </div>
                            );
                        })}
                    </div>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
            </DialogContent>
        </Dialog>
    );
}

export function EnvioAutomatico({ open, onOpenChange, actor, smtpConfigured }: { open: boolean; onOpenChange: (open: boolean) => void; actor: { id: string; name: string; role: string }; smtpConfigured: boolean }) {
    const [items, setItems] = useState<ReportSchedule[]>([]);
    const [reportType, setReportType] = useState<'resumo-mensal' | 'lista-mensal'>('resumo-mensal');
    const [recipients, setRecipients] = useState('');
    const [error, setError] = useState('');
    const reload = () => ServicoPagamentos.listSchedules().then(list => setItems(list.filter(item => item.reportType !== 'auditoria-semanal'))).catch(() => setItems([]));
    useEffect(() => { if (open) { setError(''); void reload(); } }, [open]);
    const add = async () => {
        setError('');
        try {
            await ServicoPagamentos.saveSchedule({ reportType, recipients: recipients.split(/[,;\s]+/), enabled: true }, actor as any);
            setRecipients('');
            await reload();
        } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Envio automático de relatórios</DialogTitle>
                    <DialogDescription>No dia 1 de cada mês, o relatório do mês anterior é gerado em PDF e enviado aos destinatários escolhidos.</DialogDescription>
                </DialogHeader>
                {!smtpConfigured && (
                    <p className="rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                        O envio usa o servidor de email (SMTP) configurado em Definições e só corre na aplicação desktop. Enquanto não estiver configurado, os envios ficam pendentes e são tentados de novo.
                    </p>
                )}
                <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
                    <div className="space-y-1.5">
                        <Label>Relatório</Label>
                        <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={reportType} onChange={event => setReportType(event.target.value as any)}>
                            <option value="resumo-mensal">Resumo Mensal de Cobrança</option>
                            <option value="lista-mensal">Lista Mensal de Pagamentos</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Destinatários (separados por vírgula)</Label>
                        <Input value={recipients} onChange={event => setRecipients(event.target.value)} placeholder="direccao@empresa.ao, contabilidade@empresa.ao" />
                    </div>
                    <Button onClick={add} className="gap-1.5" disabled={!recipients.trim()}><Plus className="h-4 w-4" /> Agendar</Button>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="space-y-2">
                    {!items.length ? <p className="py-4 text-center text-sm text-muted-foreground">Sem envios agendados.</p> : items.map(item => (
                        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                            <div className="min-w-0">
                                <p className="font-semibold">{REPORTS.find(report => report.key === item.reportType)?.title || item.reportType}</p>
                                <p className="truncate text-xs text-muted-foreground">Para: {item.recipients}</p>
                                <p className="text-xs text-muted-foreground">
                                    {item.lastRunAt ? `Último envio: ${formatLuandaDateTime(item.lastRunAt)}${item.lastRunMonth ? ` (mês ${item.lastRunMonth})` : ''}` : 'Ainda não enviado'}
                                    {item.lastError ? ` · Erro: ${item.lastError}` : ''}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch checked={Boolean(item.enabled)} aria-label="Activo"
                                    onCheckedChange={async value => { await ServicoPagamentos.saveSchedule({ id: item.id, reportType: item.reportType, recipients: item.recipients.split(/,\s*/), enabled: value }, actor as any); await reload(); }} />
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="Apagar agendamento" onClick={async () => { await ServicoPagamentos.deleteSchedule(item.id); await reload(); }}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
