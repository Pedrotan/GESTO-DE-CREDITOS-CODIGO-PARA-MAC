import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Filter, Hourglass, MessageCircle, Plus, Search, Settings2, Upload } from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { SeletorPeriodo } from '@/componentes/comum/SeletorPeriodo';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { useToast } from '@/componentes/ui/use-toast';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { formatCurrency } from '@/bibliotecas/formatters';
import { formatLuandaDate, luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { defaultPeriod, periodRange, type PeriodSelection } from '@/bibliotecas/periodos';
import {
    EMPTY_FILTERS, activeFilterChips, computeKpis, inKeyRange, matchesCard, matchesFilters, previousKeyRange, rangeKeys,
    type CardFilter, type PaymentFilters, type PaymentRow,
} from '@/bibliotecas/pagamentos-analise';
import { openWhatsApp } from '@/bibliotecas/whatsapp';
import { ServicoPagamentos } from '@/servicos/ServicoPagamentos';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import { usePagamentos } from '@/componentes/pagamentos/usePagamentos';
import { CartoesPagamentos } from '@/componentes/pagamentos/CartoesPagamentos';
import { GraficosPagamentos } from '@/componentes/pagamentos/GraficosPagamentos';
import { FiltrosPagamentos } from '@/componentes/pagamentos/FiltrosPagamentos';
import { useSavedFilters } from '@/componentes/pagamentos/filtros-guardados';
import { TabelaPagamentos, type ViewMode } from '@/componentes/pagamentos/TabelaPagamentos';
import { DetalhePagamento } from '@/componentes/pagamentos/DetalhePagamento';
import { AssistentePagamento } from '@/componentes/pagamentos/AssistentePagamento';
import { AnulacaoPagamento, AprovacoesAnulacao, type CancellationRequest } from '@/componentes/pagamentos/AnulacaoPagamento';
import { ImportacaoPagamentos } from '@/componentes/pagamentos/ImportacaoPagamentos';
import { EnvioAutomatico, GerarRelatorioDialog, HistoricoRelatorios, MenuRelatorios } from '@/componentes/pagamentos/RelatoriosPagamentos';
import { downloadReceipt, printReceipt, receiptClientOf, sendReceiptEmail, sendReceiptWhatsApp, smtpReady } from '@/componentes/pagamentos/acoes-recibo';
import { generatePaymentsReport } from '@/componentes/pagamentos/gerar-relatorio';
import { generateReceiptA4 } from '@/bibliotecas/recibo-pagamento';
import type { ReportKey } from '@/bibliotecas/relatorios-pagamentos';

const VIEW_LABELS: Record<ViewMode, string> = { payment: 'Por pagamento', credit: 'Agrupado por crédito', client: 'Agrupado por cliente' };

async function readFile(file: File) {
    if (file.size > 1_500_000) throw new Error('O comprovativo tem de ter no máximo 1,5 MB.');
    if (!/^(image\/(png|jpe?g|webp)|application\/pdf)$/.test(file.type)) throw new Error('Use uma imagem (PNG, JPG, WEBP) ou um PDF.');
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
        reader.readAsDataURL(file);
    });
    return { fileName: file.name, mimeType: file.type, dataUrl };
}

export default function Payments() {
    const { user } = useAuth();
    const { addPayment, refreshData, companySettings } = useData() as any;
    const data = usePagamentos();
    const { toast } = useToast();
    const [searchParams] = useSearchParams();
    const [period, setPeriod] = useState<PeriodSelection>(() => defaultPeriod());
    const [filters, setFilters] = useState<PaymentFilters>(() => ({ ...EMPTY_FILTERS, search: searchParams.get('search') || '' }));
    const [card, setCard] = useState<CardFilter>('all');
    const [view, setView] = useState<ViewMode>(() => { try { return (localStorage.getItem('pagamentos:vista') as ViewMode) || 'payment'; } catch { return 'payment'; } });
    const [showFilters, setShowFilters] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [detailId, setDetailId] = useState<string | null>(null);
    const [openAfterReload, setOpenAfterReload] = useState<string | null>(null);
    const [wizard, setWizard] = useState<{ open: boolean; creditId?: string }>({ open: false });
    const [cancelRow, setCancelRow] = useState<PaymentRow | null>(null);
    const [importOpen, setImportOpen] = useState(false);
    const [report, setReport] = useState<ReportKey | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [schedulesOpen, setSchedulesOpen] = useState(false);
    const [missingOpen, setMissingOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [threshold, setThreshold] = useState('');
    const [requests, setRequests] = useState<CancellationRequest[]>([]);
    const saved = useSavedFilters(user?.id);

    const actor = useMemo(() => ({ ...(user as any), id: user?.id || 'system', name: user?.name || 'Sistema', role: user?.role || 'manager' }), [user]);
    const can = (permission: string) => ServicoControloAcesso.temPermissao(user as any, permission);
    const canRegister = can('pagamentos.criar');
    const canCancel = can('pagamentos.anular_pagamento');
    const canValidate = can('pagamentos.validar_transferencia');
    const canExport = can('pagamentos.exportar') || can('pagamentos.ver');
    const isAdmin = ['super_admin', 'admin'].includes(String(user?.role));

    useEffect(() => { const query = searchParams.get('search'); if (query) setFilters(previous => ({ ...previous, search: query })); }, [searchParams]);
    useEffect(() => { try { localStorage.setItem('pagamentos:vista', view); } catch { /* preferência local */ } }, [view]);
    const loadRequests = () => { if (canCancel || isAdmin) ServicoPagamentos.pendingCancellationRequests().then(list => setRequests(list as any)).catch(() => setRequests([])); };
    useEffect(loadRequests, [data.payments]); // eslint-disable-line react-hooks/exhaustive-deps

    // Período e filtros (sempre na data-valor, em hora de Angola).
    const range = useMemo(() => periodRange(period), [period]);
    const keys = useMemo(() => rangeKeys(range), [range]);
    const previousKeys = useMemo(() => previousKeyRange(period, keys), [period, keys]);
    const filtered = useMemo(() => data.rows.filter(row => matchesFilters(row, filters)), [data.rows, filters]);
    const scopedSchedule = useMemo(() => {
        const creditOk = new Set(data.credits.filter((credit: any) => {
            const client = data.clients.find((item: any) => item.id === credit.clientId);
            const row = { clientId: credit.clientId, creditId: credit.id, managerId: client?.usuario_id || credit.usuario_id || '' };
            if (filters.clientId && row.clientId !== filters.clientId) return false;
            if (filters.creditId && row.creditId !== filters.creditId) return false;
            if (filters.managers.length && !filters.managers.includes(row.managerId)) return false;
            if (filters.products.length) {
                const product = data.rows.find(item => item.creditId === credit.id)?.product
                    || (client?.clientType === 'EMPRESA' ? 'Crédito a empresas' : client?.clientCategory === 'APOSENTADO' ? 'Crédito a aposentados' : client?.clientCategory === 'ESTRANGEIRO' ? 'Crédito a estrangeiros' : 'Crédito pessoal');
                if (!filters.products.includes(product)) return false;
            }
            return true;
        }).map((credit: any) => credit.id));
        return data.schedule.filter(item => creditOk.has(item.creditId));
    }, [data.schedule, data.credits, data.clients, data.rows, filters]);
    const kpiContext = { today: luandaTodayKey(), phones: data.phones, managers: data.managers, numbers: data.numbers };
    const kpis = useMemo(() => computeKpis(filtered, scopedSchedule, keys, kpiContext), [filtered, scopedSchedule, keys]); // eslint-disable-line react-hooks/exhaustive-deps
    const previous = useMemo(() => previousKeys ? computeKpis(filtered, scopedSchedule, previousKeys, kpiContext) : null, [filtered, scopedSchedule, previousKeys]); // eslint-disable-line react-hooks/exhaustive-deps
    const periodRows = useMemo(() => filtered.filter(row => inKeyRange(row.valueDateKey, keys)), [filtered, keys]);
    const tableRows = useMemo(() => periodRows.filter(row => matchesCard(row, card)), [periodRows, card]);
    const monthsWithPayments = useMemo(() => new Set(data.rows.filter(row => row.status !== 'cancelled' && row.valueDateKey.startsWith(String(period.year))).map(row => Number(row.valueDateKey.slice(5, 7)) - 1)), [data.rows, period.year]);
    const detail = data.rows.find(row => row.id === detailId) || null;
    const pendingInPeriod = periodRows.filter(row => row.status === 'pending').length;

    useEffect(() => { setSelected(new Set()); }, [period, filters, card, view]);
    useEffect(() => {
        if (openAfterReload && data.rows.some(row => row.id === openAfterReload)) { setDetailId(openAfterReload); setOpenAfterReload(null); }
    }, [data.rows, openAfterReload]);

    const options = useMemo(() => {
        const names = new Map<string, string>(data.users.map((item: any) => [item.id, item.name]));
        return {
            operators: [...new Set(data.rows.map(row => row.operator))].sort().map(value => ({ value, label: value })),
            managers: [...new Set(data.rows.map(row => row.managerId).filter(Boolean))].map(id => ({ value: id, label: names.get(id) || id })),
            products: [...new Set(data.rows.map(row => row.product))].sort().map(value => ({ value, label: value })),
            clients: data.clients.map((client: any) => ({ value: client.id, label: client.name, subLabel: client.nif || client.phone || '' })),
            contracts: data.credits.map((credit: any) => ({ value: credit.id, label: data.numbers.get(credit.id) || credit.id.slice(0, 8), subLabel: credit.clientName, clientId: credit.clientId })),
        };
    }, [data.rows, data.users, data.clients, data.credits, data.numbers]);
    const chipsText = useMemo(() => activeFilterChips(filters, {
        client: options.clients.find((item: any) => item.value === filters.clientId)?.label,
        contract: options.contracts.find((item: any) => item.value === filters.creditId)?.label,
        manager: id => options.managers.find(item => item.value === id)?.label || id,
    }).map(chip => chip.label), [filters, options]);

    const notifyError = (title: string, error: unknown) => toast({ title, description: error instanceof Error ? error.message.replace(/^\[403[^\]]*\]\s*/, '') : String(error), variant: 'destructive' });
    const afterChange = async () => { await refreshData?.(); data.reload(); loadRequests(); };

    // ── Acções ────────────────────────────────────────────────────────────────────────
    const receiptActions = {
        print: (row: PaymentRow, kind: 'a4' | 'thermal') => printReceipt(row, data.clients, companySettings, actor.name, kind, message => notifyError('Impressão', message || 'Não foi possível imprimir.')).catch(error => notifyError('Impressão', error)),
        download: (row: PaymentRow, kind: 'a4' | 'thermal' | 'second') => downloadReceipt(row, data.clients, companySettings, actor.name, kind).catch(error => notifyError('Recibo', error)),
        whatsapp: (row: PaymentRow) => { try { sendReceiptWhatsApp(row, data.clients, companySettings?.name || ''); } catch (error) { notifyError('WhatsApp', error); } },
        email: async (row: PaymentRow) => {
            try {
                const result = await sendReceiptEmail(row, data.clients, companySettings, actor.name);
                toast({ title: result === 'sent' ? 'Recibo enviado por email' : 'Email preparado', description: result === 'sent' ? `Enviado para ${receiptClientOf(row, data.clients).email}.` : 'O recibo foi descarregado: anexe-o à mensagem aberta no seu programa de email.' });
            } catch (error) { notifyError('Email', error); }
        },
        cancel: (row: PaymentRow) => setCancelRow(row),
        validate: async (row: PaymentRow) => {
            try {
                await ServicoPagamentos.validatePending(row.id, actor);
                toast({ title: 'Transferência validada', description: `${row.clientName}: ${formatCurrency(row.total)} passou a contar como arrecadado e o recibo foi emitido.` });
                await afterChange();
            } catch (error) { notifyError('Validação', error); }
        },
        attachProof: async (row: PaymentRow, file: File) => {
            try { await ServicoPagamentos.attachProof(row.id, await readFile(file), actor); toast({ title: 'Comprovativo anexado' }); data.reload(); } catch (error) { notifyError('Comprovativo', error); }
        },
        canCancel, canValidate,
    };

    const cancelPayment = async (row: PaymentRow, reason: string) => {
        const result = await ServicoPagamentos.cancel(row.id, reason, actor);
        toast(result.status === 'requested'
            ? { title: 'Pedido de anulação enviado', description: `Acima de ${formatCurrency(data.config.cancelApprovalThreshold)}: outro administrador tem de aprovar.` }
            : { title: 'Pagamento anulado', description: `${row.receipt || 'Pagamento'} anulado; estorno contabilístico gerado e mora recalculada.` });
        await afterChange();
    };

    const validateMany = async (rows: PaymentRow[]) => {
        let done = 0;
        const failed: string[] = [];
        for (const row of rows) {
            try { await ServicoPagamentos.validatePending(row.id, actor); done++; } catch (error) { failed.push(`${row.clientName}: ${error instanceof Error ? error.message : String(error)}`); }
        }
        toast({ title: `${done} transferência(s) validada(s)`, description: failed.length ? failed.join(' · ') : 'Os recibos foram emitidos.', variant: failed.length ? 'destructive' : 'default' });
        setSelected(new Set());
        await afterChange();
    };

    const sendMany = async (rows: PaymentRow[]) => {
        const eligible = rows.filter(row => row.status === 'confirmed' && row.receipt);
        if (!eligible.length) { toast({ title: 'Sem recibos para enviar', description: 'Só pagamentos confirmados têm recibo.' }); return; }
        let sent = 0;
        const failed: string[] = [];
        if (!smtpReady(companySettings)) {
            for (const row of eligible) await generateReceiptA4(row, receiptClientOf(row, data.clients), companySettings, actor.name, 'save');
            toast({ title: `${eligible.length} recibo(s) descarregado(s)`, description: 'Configure o servidor de email (SMTP) em Definições para enviar os recibos automaticamente.' });
            return;
        }
        for (const row of eligible) {
            try { await sendReceiptEmail(row, data.clients, companySettings, actor.name); sent++; } catch (error) { failed.push(`${row.clientName}: ${error instanceof Error ? error.message : String(error)}`); }
        }
        toast({ title: `${sent} recibo(s) enviado(s) por email`, description: failed.length ? failed.slice(0, 4).join(' · ') : undefined, variant: failed.length ? 'destructive' : 'default' });
    };

    const generate = async (key: ReportKey, format: 'pdf' | 'xlsx', statement?: { clientId?: string; creditId?: string; label: string }, rowsOverride?: PaymentRow[], selectionOverride?: PeriodSelection, extraFilters: string[] = []) => {
        await generatePaymentsReport({
            key, format, rows: rowsOverride || filtered, schedule: scopedSchedule, selection: selectionOverride || period, filters: [...chipsText, ...extraFilters],
            numbers: data.numbers, phones: data.phones, managers: data.managers, statement, settings: companySettings, actor,
        });
        toast({ title: 'Relatório gerado', description: 'Guardado no histórico de relatórios.' });
    };

    const exportSelected = (rows: PaymentRow[]) => generate('lista-mensal', 'xlsx', undefined, rows, { ...period, kind: 'all' }, [`${rows.length} pagamento(s) seleccionado(s)`])
        .catch(error => notifyError('Exportação', error));

    const endMonthKey = keys?.end.slice(0, 7) || luandaTodayKey().slice(0, 7);

    return (
        <MainLayout title="Pagamentos" subtitle="Registo, validação e relatórios de pagamentos">
            <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:w-96">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Pesquisar por recibo, referência, cliente ou contrato..." value={filters.search} onChange={event => setFilters(previous => ({ ...previous, search: event.target.value }))} className="pl-10" />
                </div>
                <div className="flex flex-wrap gap-2">
                    <Select value={view} onValueChange={value => setView(value as ViewMode)}>
                        <SelectTrigger className="h-10 w-[200px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{(Object.keys(VIEW_LABELS) as ViewMode[]).map(key => <SelectItem key={key} value={key}>{VIEW_LABELS[key]}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button variant={showFilters ? 'default' : 'outline'} className="gap-2" onClick={() => setShowFilters(value => !value)} aria-expanded={showFilters}>
                        <Filter className="h-4 w-4" /> Filtros{chipsText.length ? ` (${chipsText.length})` : ''}
                    </Button>
                    {canExport && <MenuRelatorios onPick={setReport} onHistory={() => setHistoryOpen(true)} onSchedules={() => setSchedulesOpen(true)} />}
                    {canRegister && <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Importar</Button>}
                    {canRegister && <Button className="gap-2" onClick={() => setWizard({ open: true })}><Plus className="h-4 w-4" /> Registar Pagamento</Button>}
                    {isAdmin && (
                        <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Regras de pagamentos" title="Regras de pagamentos"
                            onClick={() => { setThreshold(String(data.config.cancelApprovalThreshold)); setSettingsOpen(true); }}>
                            <Settings2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            <div className="mb-4">
                <SeletorPeriodo value={period} onChange={value => { setPeriod(value); }} kinds={['day', 'week', 'month', 'quarter', 'semester', 'year', 'custom', 'all']} monthsWithData={monthsWithPayments} />
            </div>

            <FiltrosPagamentos
                open={showFilters} filters={filters} onChange={changes => setFilters(previous => ({ ...previous, ...changes }))} options={options}
                saved={saved.saved} onSave={name => { saved.save(name, filters); toast({ title: 'Filtro guardado', description: `«${name}» fica disponível em Filtros guardados.` }); }}
                onApplySaved={item => setFilters({ ...EMPTY_FILTERS, ...item.filters })} onRemoveSaved={saved.remove}
            />

            <AprovacoesAnulacao requests={requests} actorId={actor.id} onDecide={async (request, approve, reason) => {
                await ServicoPagamentos.decideCancellation(request, approve, reason, actor);
                toast({ title: approve ? 'Anulação aprovada' : 'Pedido rejeitado' });
                await afterChange();
            }} />

            {kpis.inconsistent.length > 0 && (
                <div className="mb-4 flex gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                    <div>
                        <p className="font-bold text-destructive">A decomposição não bate com o valor arrecadado</p>
                        <p>Em {kpis.inconsistent.length} pagamento(s), capital + juros + mora (+ selo e comissões) não somam o valor pago: {kpis.inconsistent.slice(0, 5).map(row => row.receipt || row.id).join(', ')}{kpis.inconsistent.length > 5 ? '…' : ''}. Reveja-os na Contabilidade.</p>
                    </div>
                </div>
            )}
            {pendingInPeriod > 0 && (
                <button type="button" onClick={() => { setCard('pending'); }} className="mb-4 flex w-full items-center gap-3 rounded-xl border border-amber-400/60 bg-amber-50 p-3 text-left text-sm text-amber-900 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-200">
                    <Hourglass className="h-4 w-4 shrink-0" />
                    <span><b>{pendingInPeriod} pagamento(s) pendente(s) de validação</b> ({formatCurrency(kpis.pendingAmount)}) não contam no arrecadado até alguém confirmar a entrada no banco. Clique para os ver.</span>
                </button>
            )}

            <CartoesPagamentos kpis={kpis} previous={previous} periodLabel={range.label} active={card} onSelect={setCard} onShowMissing={() => setMissingOpen(true)} loading={data.loading} />
            {card !== 'all' && (
                <div className="mb-3 flex items-center gap-2 text-sm">
                    <span className="rounded-full border bg-background px-3 py-1 font-semibold">
                        Cartão activo: {{ collected: 'confirmados', interest: 'com juros', late: 'com juros de mora', principal: 'com capital', pending: 'pendentes de validação', cancelled: 'anulados', all: '' }[card]}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setCard('all')}>Mostrar todos</Button>
                </div>
            )}

            <GraficosPagamentos rows={filtered} schedule={scopedSchedule} range={keys} endMonthKey={endMonthKey} />

            <TabelaPagamentos
                rows={tableRows} view={view} loading={data.loading} onOpen={row => setDetailId(row.id)} onRegister={() => setWizard({ open: true })}
                selected={selected} onSelectedChange={setSelected} canValidate={canValidate}
                onExportSelected={exportSelected} onSendReceipts={rows => void sendMany(rows)} onValidateSelected={rows => void validateMany(rows)}
            />

            <DetalhePagamento row={detail} open={Boolean(detail)} onOpenChange={open => { if (!open) setDetailId(null); }}
                clientPhone={detail ? data.phones.get(detail.clientId) : undefined} actions={receiptActions} />

            <AssistentePagamento
                open={wizard.open} onOpenChange={open => setWizard(previous => ({ ...previous, open }))} initialCreditId={wizard.creditId}
                credits={data.credits} clients={data.clients} rows={data.rows} numbers={data.numbers} actor={actor}
                onRegisterConfirmed={payment => addPayment(payment, { id: actor.id, name: actor.name })}
                onDone={({ payment, pending }) => {
                    setWizard({ open: false });
                    toast({ title: pending ? 'Pagamento registado como pendente' : 'Pagamento registado', description: pending ? 'Fica pendente de validação até alguém confirmar a entrada no banco.' : `Recibo emitido para ${payment.clientName}.` });
                    setOpenAfterReload(payment.id);
                    data.reload();
                }}
            />

            <AnulacaoPagamento row={cancelRow} open={Boolean(cancelRow)} onOpenChange={open => { if (!open) setCancelRow(null); }}
                threshold={data.config.cancelApprovalThreshold} actorId={actor.id} onConfirm={cancelPayment} />

            <ImportacaoPagamentos open={importOpen} onOpenChange={setImportOpen} credits={data.credits} rows={data.rows} numbers={data.numbers}
                closedMonths={data.closedMonths} batches={data.batches} actor={actor} onFinished={afterChange} />

            <GerarRelatorioDialog report={report} onOpenChange={open => { if (!open) setReport(null); }} periodLabel={range.label} filters={chipsText}
                clients={options.clients} contracts={options.contracts} onGenerate={(key, format, statement) => generate(key, format, statement)} />
            <HistoricoRelatorios open={historyOpen} onOpenChange={setHistoryOpen} />
            <EnvioAutomatico open={schedulesOpen} onOpenChange={setSchedulesOpen} actor={actor} smtpConfigured={smtpReady(companySettings)} />

            <Dialog open={missingOpen} onOpenChange={setMissingOpen}>
                <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Em falta no período · {range.label}</DialogTitle>
                        <DialogDescription>{kpis.missing.length} prestação(ões) vencida(s) e não paga(s) de {kpis.missingClients} cliente(s) · {formatCurrency(kpis.missingAmount)}</DialogDescription>
                    </DialogHeader>
                    {kpis.missing.length ? (
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted text-left text-[11px] uppercase text-muted-foreground">
                                    <tr><th className="p-2">Cliente</th><th className="p-2">Contrato</th><th className="p-2">Prest.</th><th className="p-2">Vencimento</th><th className="p-2 text-right">Dias</th><th className="p-2 text-right">Em falta</th><th className="p-2 text-right">Mora</th><th className="p-2">Gestor</th><th className="p-2" /></tr>
                                </thead>
                                <tbody>
                                    {kpis.missing.map(item => (
                                        <tr key={`${item.creditId}-${item.number}`} className="border-t">
                                            <td className="p-2 font-medium">{item.clientName}<p className="text-xs text-muted-foreground">{item.phone || 'sem telefone'}</p></td>
                                            <td className="p-2 font-mono text-xs">{item.contract}</td>
                                            <td className="p-2">{item.number}.ª</td>
                                            <td className="p-2 whitespace-nowrap">{formatLuandaDate(`${item.dueDateKey}T12:00:00Z`)}</td>
                                            <td className="p-2 text-right font-semibold text-destructive">{item.daysLate}</td>
                                            <td className="p-2 text-right tabular-nums">{formatCurrency(item.missing)}</td>
                                            <td className="p-2 text-right tabular-nums">{formatCurrency(item.late)}</td>
                                            <td className="p-2">{item.manager || '—'}</td>
                                            <td className="p-2">
                                                <div className="flex gap-1">
                                                    {item.phone && (
                                                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="WhatsApp" title="Contactar por WhatsApp"
                                                            onClick={() => openWhatsApp(item.phone, `Olá ${item.clientName}, a ${item.number}.ª prestação do contrato ${item.contract} venceu a ${formatLuandaDate(`${item.dueDateKey}T12:00:00Z`)} e tem ${formatCurrency(item.missing)} em falta. Por favor regularize. ${companySettings?.name || ''}`)}>
                                                            <MessageCircle className="h-3.5 w-3.5" />
                                                        </Button>
                                                    )}
                                                    {canRegister && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setMissingOpen(false); setWizard({ open: true, creditId: item.creditId }); }}>Registar</Button>}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : <p className="py-8 text-center text-sm text-muted-foreground">Não há prestações vencidas por pagar no período.</p>}
                    {canExport && kpis.missing.length > 0 && (
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => generate('nao-pagas', 'xlsx').catch(error => notifyError('Relatório', error))}>Excel</Button>
                            <Button onClick={() => generate('nao-pagas', 'pdf').catch(error => notifyError('Relatório', error))}>Relatório PDF (lista de trabalho)</Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Regras de pagamentos</DialogTitle>
                        <DialogDescription>Aplicam-se a todos os computadores e à versão web.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5">
                        <Label htmlFor="threshold">Anulações acima deste valor exigem aprovação de outro administrador (Kz)</Label>
                        <Input id="threshold" type="number" min={0} value={threshold} onChange={event => setThreshold(event.target.value)} />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setSettingsOpen(false)}>Cancelar</Button>
                        <Button onClick={async () => {
                            try { await ServicoPagamentos.saveConfig({ cancelApprovalThreshold: Number(threshold) }, actor); toast({ title: 'Regras guardadas' }); setSettingsOpen(false); data.reload(); }
                            catch (error) { notifyError('Regras de pagamentos', error); }
                        }}>Guardar</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}
