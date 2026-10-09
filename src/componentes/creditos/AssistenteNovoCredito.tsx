// Novo crédito em passos (Parte G): 1) cliente, 2) simulação (o mesmo cálculo do Simulador: TAN ajustada ao risco,
// TAEG, Imposto do Selo e plano; também converte uma simulação guardada), 3) análise de risco (taxa de esforço e
// classificação), 4) documentos e garantias, 5) submissão. O pedido segue as alçadas (Limites): dentro da alçada
// de quem submete é aprovado e desembolsado na mesma transação (contrato e lançamento), só se houver saldo em
// Caixa/Banco; acima dela, ou quando a regra do cliente o exige, fica na fila de Aprovações.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, FileUp, Loader2, Lock, Trash2 } from 'lucide-react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { useConfigSimulador } from '@/ganchos/usar-config-simulador';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { SearchableSelect } from '@/componentes/ui/SearchableSelect';
import { cn } from '@/bibliotecas/utils';
import { formatCurrency } from '@/bibliotecas/formatters';
import { STAGES, type PortfolioRow } from '@/bibliotecas/carteira-credito';
import { clientCreditStanding, newCreditBlockReason, requiresCreditApproval } from '@/bibliotecas/regras-credito';
import { RISK_LABELS } from '@/bibliotecas/risco-simulacao';
import { productLimitErrors } from '@/bibliotecas/config-simulador';
import { activeProducts, clientHistory, computeSimulation, defaultForm, formFromSimulation, parseDetails, productFields, simulationStatus, type SimulatorForm } from '@/componentes/simulador/modelo';
import { ServicoCarteira } from '@/servicos/ServicoCarteira';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import type { Credit } from '@/tipos/credito';

const STEPS = ['Cliente', 'Simulação', 'Análise de risco', 'Documentos e garantias', 'Submeter'];
const DOC_KINDS: Record<string, string> = { contrato: 'Contrato', livranca: 'Livrança', bi: 'Bilhete de Identidade', comprovativo: 'Comprovativo de rendimento', outro: 'Outro' };
type StagedDoc = { kind: string; fileName: string; mimeType: string; dataUrl: string };
type Warranty = { type: 'Veículo' | 'Imóvel' | 'Equipamento' | 'Outro'; description: string; marketValue: string; location: string };
const pct = (value: number | null) => value === null ? '—' : `${value.toLocaleString('pt-AO', { maximumFractionDigits: 2 })}%`;

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'red' | 'green' }) {
    return (
        <div className="flex justify-between gap-3 border-b py-1.5 text-sm last:border-0"><span className="text-muted-foreground">{label}</span><span className={cn('text-right font-semibold', tone === 'red' && 'text-red-700 dark:text-red-400', tone === 'green' && 'text-emerald-700 dark:text-emerald-400')}>{value}</span></div>
    );
}

export type Renewal = { clientId: string; minAmount: number; previousId?: string };

export function AssistenteNovoCredito({ open, onClose, rows, credits, renewal, onCreated }: {
    open: boolean; onClose: () => void; rows: PortfolioRow[]; credits: Credit[]; renewal?: Renewal | null;
    onCreated: (result: { credit: Credit & { escalationReason?: string }; pending: boolean }) => void;
}) {
    const { user } = useAuth();
    const { clients, payments, warranties, simulations, addCredit, addWarranty, updateSimulationStatus, suppliers, companySettings } = useData() as any;
    const { config, loading: configLoading } = useConfigSimulador();
    const [step, setStep] = useState(0);
    const [clientId, setClientId] = useState(renewal?.clientId || '');
    const [form, setForm] = useState<SimulatorForm>(() => defaultForm(config));
    const [simulationId, setSimulationId] = useState('');
    const [targetMonth, setTargetMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [supplierId, setSupplierId] = useState('');
    const [supplierRate, setSupplierRate] = useState(0);
    const [docs, setDocs] = useState<StagedDoc[]>([]);
    const [docKind, setDocKind] = useState('contrato');
    const [warranty, setWarranty] = useState<Warranty>({ type: 'Veículo', description: '', marketValue: '', location: '' });
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return;
        setStep(0); setError(''); setDocs([]); setSimulationId(''); setNotes(''); setSupplierId(''); setSupplierRate(0);
        setWarranty({ type: 'Veículo', description: '', marketValue: '', location: '' });
        setClientId(renewal?.clientId || '');
        setForm({ ...defaultForm(config), principal: renewal?.minAmount || 0, months: 12 });
        setTargetMonth(new Date().toISOString().slice(0, 7));
        // Só volta ao início quando abre ou quando a configuração do Simulador acaba de carregar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, renewal, configLoading]);

    const client = clients.find((item: any) => item.id === clientId);
    const standing = useMemo(() => clientId ? clientCreditStanding(clientId, credits) : null, [clientId, credits]);
    const blockReason = useMemo(() => {
        if (!client) return null;
        if (client.status === 'blocked' || client.blocked) return `O cliente está bloqueado${client.blockReason ? `: ${client.blockReason}` : ''}.`;
        return standing ? newCreditBlockReason(standing, value => formatCurrency(value)) : null;
    }, [client, standing]);
    const clientRows = useMemo(() => rows.filter(row => row.clientId === clientId), [rows, clientId]);
    const history = useMemo(() => client ? clientHistory(client, credits, payments, warranties || [], form.principal) : null, [client, credits, payments, warranties, form.principal]);
    const extraCoverage = Number(warranty.marketValue || 0);
    const calc = useMemo(() => computeSimulation(form, config, history ? { ...history, guaranteeCoverage: form.principal > 0 ? (history.guaranteesValue + extraCoverage) / form.principal : 0 } : null), [form, config, history, extraCoverage]);
    const product = config.products.find(item => item.id === form.productId) || activeProducts(config)[0];
    const limitErrors = product ? productLimitErrors(product, form.principal, form.months, value => formatCurrency(value)) : [];
    const savedSimulations = useMemo(() => (simulations || []).filter((item: any) => simulationStatus(item) === 'simulated' && (item.clientId ? item.clientId === clientId : item.clientName === client?.name)), [simulations, clientId, client]);
    const activeSuppliers = (suppliers || []).filter((item: any) => item.status === 'active');
    const showSuppliers = companySettings?.enableSuppliersModule !== false && activeSuppliers.length > 0;
    const set = (patch: Partial<SimulatorForm>) => setForm(previous => ({ ...previous, ...patch }));

    const selectClient = (id: string) => {
        const selected = clients.find((item: any) => item.id === id);
        setClientId(id);
        if (!selected) return;
        const info = clientHistory(selected, credits, payments, warranties || [], form.principal);
        set({ clientId: selected.id, clientName: selected.name, clientNif: selected.nif || '', clientPhone: selected.phone || '', clientEmail: selected.email || '', clientAddress: selected.address || '',
            income: Number(selected.monthlyIncome) || 0, otherDebts: info?.monthlyDebts || 0 });
    };
    const loadSimulation = (id: string) => {
        setSimulationId(id);
        const simulation = savedSimulations.find((item: any) => item.id === id);
        if (!simulation) return;
        const loaded = formFromSimulation(simulation, config);
        set({ ...loaded, clientId: form.clientId, clientName: form.clientName, clientNif: form.clientNif, clientPhone: form.clientPhone, clientEmail: form.clientEmail, clientAddress: form.clientAddress,
            income: loaded.income || form.income, otherDebts: form.otherDebts, graceMonths: 0 });
        setTargetMonth(loaded.startDate.slice(0, 7));
    };

    const result = calc.result;
    const stepError = (index: number): string | null => {
        if (index === 0) {
            if (!client) return 'Escolha o cliente.';
            if (blockReason) return blockReason;
        }
        if (index === 1) {
            if (!(form.principal > 0) || !(form.months > 0)) return 'Indique o montante e o prazo.';
            if (renewal && form.principal < renewal.minAmount) return `O novo crédito tem de ser igual ou superior ao anterior (${formatCurrency(renewal.minAmount)}).`;
            if (limitErrors.length) return limitErrors[0];
            if (form.graceMonths > 0) return 'Os pedidos de crédito não suportam carência.';
            if (!result?.valid) return 'A simulação não é válida com estes valores.';
        }
        if (index === 2 && calc.effort !== null && calc.effort > config.effortLimit && notes.trim().length < 20) return `Taxa de esforço acima do limite (${pct(config.effortLimit)}): justifique o pedido (pelo menos 20 caracteres).`;
        if (index === 3 && (warranty.description.trim() || warranty.marketValue) && (!warranty.description.trim() || !(Number(warranty.marketValue) > 0))) return 'Complete a garantia (descrição e valor) ou deixe-a em branco.';
        return null;
    };
    const next = () => { const problem = stepError(step); if (problem) { setError(problem); return; } setError(''); setStep(value => Math.min(STEPS.length - 1, value + 1)); };

    const addDoc = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > 2_000_000) { setError('O documento é demasiado grande (máximo 2 MB).'); return; }
        const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Não foi possível ler o ficheiro.')); reader.readAsDataURL(file); });
        setDocs(previous => [...previous, { kind: docKind, fileName: file.name, mimeType: file.type, dataUrl }]);
    };

    const submit = async () => {
        for (let index = 0; index < STEPS.length - 1; index++) { const problem = stepError(index); if (problem) { setStep(index); setError(problem); return; } }
        if (!client || !result?.valid || !user) return;
        setBusy(true); setError('');
        try {
            const canApprove = ServicoControloAcesso.temPermissao(user as any, 'creditos.aprovar') || user.role === 'super_admin' || Boolean(user.permissions?.includes('approve_loans'));
            const pending = requiresCreditApproval({ canApprove, principalAmount: form.principal, availableCredit: Number(client.availableCredit) || 0, clientStatus: client.status, riskLevel: calc.riskLevel === 'high' ? 'high' : client.riskLevel });
            const id = `CR-${crypto.randomUUID()}`;
            const start = new Date(`${form.startDate}T12:00:00`);
            const due = result.lastDueDate ? new Date(`${result.lastDueDate}T12:00:00`) : new Date(start.getTime() + form.months * 30 * 86_400_000);
            const own = credits.filter(item => item.clientId === client.id && !['rejected', 'cancelled'].includes(item.status));
            const saved = await addCredit({
                id, clientId: client.id, clientName: client.name, principalAmount: form.principal, currentBalance: form.principal,
                interestRate: Math.round(calc.annualRate * 10000) / 10000, lateInterestRate: Number(client.lateInterestRate) || 1, installments: form.months, paidInstallments: 0,
                startDate: start, dueDate: due, status: pending ? 'pending_approval' : 'active', requestedBy: user.name || 'Sistema', requestedAt: new Date(),
                daysOverdue: 0, accruedInterest: result.totalInterest, lateInterest: 0, totalDue: form.principal + result.totalInterest,
                amortizationMethod: form.system === 'sac' ? 'SAC' : 'PRICE', creditNumber: own.length + 1, createdAt: new Date(), targetMonthId: targetMonth,
                supplierId: supplierId || undefined, supplierProfitRate: supplierId ? supplierRate : undefined,
                approvalNotes: notes.trim() || undefined,
            } as any, { id: user.id, name: user.name }, { productId: product?.id || null, effortRate: calc.effort });
            const actor = { id: user.id, name: user.name, role: user.role };
            // Depois de gravado o crédito: documentos, garantia e simulação convertida (falhas aqui não anulam o pedido).
            const followUp: string[] = [];
            for (const doc of docs) await ServicoCarteira.addDocument({ creditId: id, ...doc }, actor).catch((cause: any) => followUp.push(`${doc.fileName}: ${cause?.message || 'falhou'}`));
            if (warranty.description.trim() && Number(warranty.marketValue) > 0) {
                await addWarranty({ clientId: client.id, creditId: id, type: warranty.type, description: warranty.description.trim(), marketValue: Number(warranty.marketValue), status: 'active', location: warranty.location || undefined }, { id: user.id, name: user.name })
                    .catch((cause: any) => followUp.push(`garantia: ${cause?.message || 'falhou'}`));
            }
            if (simulationId) await updateSimulationStatus(simulationId, 'converted', id).catch(() => followUp.push('simulação: não foi possível marcá-la como convertida'));
            if (followUp.length) setError(`Crédito registado, mas: ${followUp.join('; ')}.`);
            onCreated({ credit: saved, pending: saved.status === 'pending_approval' });
        } catch (cause: any) {
            setError(cause?.message || 'Não foi possível registar o pedido.');
        } finally { setBusy(false); }
    };

    const clientOptions = useMemo(() => clients.filter((item: any) => !item.deletedAt).map((item: any) => ({
        value: item.id, label: item.name, subLabel: [item.nif && `NIF ${item.nif}`, item.phone].filter(Boolean).join(' · '), keywords: `${item.nif || ''} ${item.phone || ''} ${item.email || ''}`,
    })), [clients]);

    return (
        <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
            <DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{renewal ? 'Solicitar novo crédito' : 'Novo crédito'}</DialogTitle>
                    <DialogDescription>{renewal ? `O cliente liquidou o crédito anterior. O novo valor tem de ser igual ou superior a ${formatCurrency(renewal.minAmount)} e o pedido segue o fluxo normal de aprovação.` : 'Cinco passos. O pedido é encaminhado conforme as alçadas definidas em Limites.'}</DialogDescription>
                </DialogHeader>
                <ol className="mb-2 grid grid-cols-5 gap-1">
                    {STEPS.map((label, index) => (
                        <li key={label}>
                            <button type="button" disabled={index > step} onClick={() => { setError(''); setStep(index); }}
                                className={cn('flex w-full flex-col items-center gap-1 rounded-lg p-1.5 text-center text-[11px] font-semibold', index === step ? 'bg-primary/10 text-primary' : index < step ? 'text-foreground hover:bg-muted' : 'text-muted-foreground')}>
                                <span className={cn('flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs', index < step ? 'border-emerald-500 bg-emerald-500 text-white' : index === step ? 'border-primary' : 'border-muted')}>{index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                                <span className="hidden sm:block">{label}</span>
                            </button>
                        </li>
                    ))}
                </ol>

                {step === 0 && (
                    <div className="space-y-3">
                        <SearchableSelect value={clientId} onValueChange={selectClient} options={clientOptions} placeholder="Pesquisar cliente por nome, NIF ou telefone…" disabled={!!renewal} />
                        {client && (
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-xl border p-3">
                                    <Row label="NIF" value={client.nif || '—'} />
                                    <Row label="Telefone" value={client.phone || '—'} />
                                    <Row label="Rendimento mensal" value={client.monthlyIncome ? formatCurrency(Number(client.monthlyIncome)) : 'Não indicado'} />
                                    <Row label="Limite disponível" value={formatCurrency(Number(client.availableCredit) || 0)} />
                                    <Row label="Risco" value={RISK_LABELS[client.riskLevel as 'low'] || client.riskLevel} tone={client.riskLevel === 'high' ? 'red' : undefined} />
                                    <Row label="Estado" value={client.status === 'active' ? 'Ativo' : client.status === 'blocked' ? 'Bloqueado' : 'Inativo'} tone={client.status === 'active' ? 'green' : 'red'} />
                                </div>
                                <div className="rounded-xl border p-3">
                                    <p className="mb-1 text-xs font-bold uppercase text-muted-foreground">Créditos do cliente ({clientRows.length})</p>
                                    {!clientRows.length ? <p className="text-sm text-muted-foreground">Primeiro crédito deste cliente.</p> : clientRows.map(row => (
                                        <div key={row.id} className="flex items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0">
                                            <span className="font-mono text-xs">{row.reference}</span>
                                            <span className={cn('rounded-full border px-2 text-[11px] font-bold', STAGES[row.stage].badge)}>{STAGES[row.stage].label}</span>
                                            <span className="text-right text-xs">{formatCurrency(row.outstandingMinor / 100)} em dívida</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {blockReason && <p className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"><Lock className="mt-0.5 h-4 w-4 shrink-0" /> {blockReason}</p>}
                    </div>
                )}

                {step === 1 && (
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-3">
                            {savedSimulations.length > 0 && (
                                <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">Converter uma simulação guardada</span>
                                    <Select value={simulationId || '__nova__'} onValueChange={value => value === '__nova__' ? setSimulationId('') : loadSimulation(value)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="__nova__">Nova simulação</SelectItem>{savedSimulations.map((item: any) => <SelectItem key={item.id} value={item.id}>{item.reference} · {formatCurrency(Number(item.amount))} · {item.term} meses</SelectItem>)}</SelectContent>
                                    </Select>
                                </label>
                            )}
                            <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">Produto</span>
                                <Select value={form.productId} onValueChange={id => { const selected = config.products.find(item => item.id === id); if (selected) set(productFields(selected, config)); }}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>{activeProducts(config).map(item => <SelectItem key={item.id} value={item.id}>{item.name} · {item.minAmount.toLocaleString('pt-AO')}–{item.maxAmount.toLocaleString('pt-AO')} Kz · {item.minMonths}–{item.maxMonths} meses</SelectItem>)}</SelectContent>
                                </Select>
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="space-y-1"><span className="text-xs font-semibold text-muted-foreground">Montante (Kz)</span><Input type="number" min={renewal?.minAmount || 0} value={form.principal || ''} onChange={event => set({ principal: Number(event.target.value) })} /></label>
                                <label className="space-y-1"><span className="text-xs font-semibold text-muted-foreground">Prazo (meses)</span><Input type="number" min={1} value={form.months || ''} onChange={event => set({ months: Number(event.target.value) })} /></label>
                                <label className="space-y-1"><span className="text-xs font-semibold text-muted-foreground">Data de início</span><Input type="date" value={form.startDate} onChange={event => { set({ startDate: event.target.value }); setTargetMonth(event.target.value.slice(0, 7)); }} /></label>
                                <label className="space-y-1"><span className="text-xs font-semibold text-muted-foreground">Dia de vencimento</span><Input type="number" min={1} max={28} value={form.dueDay} onChange={event => set({ dueDay: Math.min(28, Math.max(1, Number(event.target.value) || 1)) })} /></label>
                                <label className="space-y-1"><span className="text-xs font-semibold text-muted-foreground">Sistema</span>
                                    <Select value={form.system} onValueChange={value => set({ system: value as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="price">Prestação constante (PRICE)</SelectItem><SelectItem value="sac">Amortização constante (SAC)</SelectItem></SelectContent></Select>
                                </label>
                                <label className="space-y-1"><span className="text-xs font-semibold text-muted-foreground">Mês de competência</span><Input type="month" value={targetMonth} onChange={event => setTargetMonth(event.target.value)} /></label>
                            </div>
                            {showSuppliers && (
                                <div className="grid grid-cols-2 gap-2 rounded-lg border p-2">
                                    <label className="space-y-1"><span className="text-xs font-semibold text-muted-foreground">Origem do capital</span>
                                        <Select value={supplierId || '__proprio__'} onValueChange={value => { setSupplierId(value === '__proprio__' ? '' : value); if (value === '__proprio__') setSupplierRate(0); }}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent><SelectItem value="__proprio__">Capital próprio</SelectItem>{activeSuppliers.map((item: any) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </label>
                                    {supplierId && <label className="space-y-1"><span className="text-xs font-semibold text-muted-foreground">Taxa do fornecedor (%)</span><Input type="number" min={0} max={calc.annualRate} step="0.1" value={supplierRate} onChange={event => setSupplierRate(Math.min(Number(event.target.value) || 0, calc.annualRate))} /></label>}
                                </div>
                            )}
                        </div>
                        <div className="rounded-xl border bg-muted/20 p-3">
                            <p className="mb-1 text-xs font-bold uppercase text-muted-foreground">Resultado (o mesmo cálculo do Simulador)</p>
                            {result?.valid ? (
                                <>
                                    <Row label="TAN" value={`${pct(calc.annualRate)}${calc.riskAdjustment ? ` (base ${pct(calc.baseRate)} + risco ${pct(calc.riskAdjustment)})` : ''}`} />
                                    <Row label="TAEG" value={pct(result.taeg)} />
                                    <Row label="Prestação" value={formatCurrency(result.installment)} />
                                    <Row label="Juros totais" value={formatCurrency(result.totalInterest)} />
                                    <Row label="Imposto do Selo (utilização + juros)" value={formatCurrency(result.stampDutyUse + result.totalStampDutyInterest)} />
                                    <Row label="Comissões" value={formatCurrency(result.totalCommissions)} />
                                    <Row label="Montante líquido a receber" value={formatCurrency(result.netReceived)} />
                                    <Row label="MTIC (total imputado ao cliente)" value={formatCurrency(result.mtic)} />
                                    <Row label="Última prestação" value={result.lastDueDate ? result.lastDueDate.split('-').reverse().join('/') : '—'} />
                                </>
                            ) : <p className="text-sm text-muted-foreground">Indique o montante e o prazo.</p>}
                        </div>
                        {result?.valid && (
                            <div className="max-h-56 overflow-y-auto rounded-xl border md:col-span-2">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-background text-muted-foreground"><tr><th className="p-2 text-left">N.º</th><th className="p-2 text-left">Vencimento</th><th className="p-2 text-right">Capital</th><th className="p-2 text-right">Juros</th><th className="p-2 text-right">Selo</th><th className="p-2 text-right">Prestação</th></tr></thead>
                                    <tbody>{result.rows.map(item => <tr key={item.number} className="border-t"><td className="p-2">{item.number}</td><td className="p-2">{String(item.dueDate).slice(0, 10).split('-').reverse().join('/')}</td><td className="p-2 text-right">{formatCurrency(item.amortization)}</td><td className="p-2 text-right">{formatCurrency(item.interest)}</td><td className="p-2 text-right">{formatCurrency(item.stampDutyInterest)}</td><td className="p-2 text-right font-semibold">{formatCurrency(item.payment)}</td></tr>)}</tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {step === 2 && (
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-xl border p-3">
                            <Row label="Rendimento mensal" value={<Input type="number" min={0} className="h-8 w-40 text-right" value={form.income || ''} onChange={event => set({ income: Number(event.target.value) })} />} />
                            <Row label="Outros encargos mensais" value={<Input type="number" min={0} className="h-8 w-40 text-right" value={form.otherDebts || ''} onChange={event => set({ otherDebts: Number(event.target.value) })} />} />
                            <Row label="Nova prestação (máxima)" value={result?.valid ? formatCurrency(result.maxInstallment) : '—'} />
                            <Row label="Taxa de esforço" value={`${pct(calc.effort)} (limite ${pct(config.effortLimit)})`} tone={calc.effort !== null && calc.effort > config.effortLimit ? 'red' : 'green'} />
                            <Row label="Classificação de risco" value={RISK_LABELS[calc.riskLevel]} tone={calc.riskLevel === 'high' ? 'red' : calc.riskLevel === 'low' ? 'green' : undefined} />
                            <Row label="Pontuação" value={`${calc.risk.score} / 100`} />
                        </div>
                        <div className="rounded-xl border p-3">
                            <p className="mb-1 text-xs font-bold uppercase text-muted-foreground">Fatores</p>
                            <ul className="space-y-1 text-sm">{calc.risk.reasons.map(reason => <li key={reason.text} className="flex gap-2"><span className={cn('w-10 shrink-0 text-right font-mono text-xs font-bold', reason.impact >= 0 ? 'text-emerald-700' : 'text-red-700')}>{reason.impact > 0 ? '+' : ''}{reason.impact}</span>{reason.text}</li>)}</ul>
                        </div>
                        <label className="space-y-1 md:col-span-2"><span className="text-xs font-semibold text-muted-foreground">Observações para o aprovador{calc.effort !== null && calc.effort > config.effortLimit ? ' (obrigatório: esforço acima do limite)' : ''}</span>
                            <Textarea rows={3} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Ex.: rendimento complementar comprovado por contrato de arrendamento." /></label>
                    </div>
                )}

                {step === 3 && (
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2 rounded-xl border p-3">
                            <p className="text-xs font-bold uppercase text-muted-foreground">Documentos</p>
                            <div className="flex gap-2">
                                <Select value={docKind} onValueChange={setDocKind}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DOC_KINDS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
                                <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-semibold hover:bg-muted"><FileUp className="h-4 w-4" /> Anexar
                                    <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={event => { void addDoc(event.target.files?.[0]); event.target.value = ''; }} /></label>
                            </div>
                            {!docs.length ? <p className="text-sm text-muted-foreground">Nenhum documento anexado (pode anexá-los mais tarde na ficha do crédito).</p> : docs.map((doc, index) => (
                                <div key={`${doc.fileName}-${index}`} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-sm">
                                    <span className="truncate">{DOC_KINDS[doc.kind]} · {doc.fileName}</span>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remover ${doc.fileName}`} onClick={() => setDocs(previous => previous.filter((_, other) => other !== index))}><Trash2 className="h-3.5 w-3.5" /></Button>
                                </div>
                            ))}
                        </div>
                        <div className="space-y-2 rounded-xl border p-3">
                            <p className="text-xs font-bold uppercase text-muted-foreground">Garantia (opcional)</p>
                            <Select value={warranty.type} onValueChange={value => setWarranty(previous => ({ ...previous, type: value as Warranty['type'] }))}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{['Veículo', 'Imóvel', 'Equipamento', 'Outro'].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
                            <Input value={warranty.description} onChange={event => setWarranty(previous => ({ ...previous, description: event.target.value }))} placeholder="Descrição (ex.: Toyota Hilux, matrícula LD-00-00-AA)" />
                            <div className="grid grid-cols-2 gap-2">
                                <Input type="number" min={0} value={warranty.marketValue} onChange={event => setWarranty(previous => ({ ...previous, marketValue: event.target.value }))} placeholder="Valor de mercado (Kz)" />
                                <Input value={warranty.location} onChange={event => setWarranty(previous => ({ ...previous, location: event.target.value }))} placeholder="Localização" />
                            </div>
                            {history && <p className="text-xs text-muted-foreground">Garantias ativas do cliente: {formatCurrency(history.guaranteesValue)}. Cobertura com esta: {pct(form.principal ? Math.round(((history.guaranteesValue + extraCoverage) / form.principal) * 1000) / 10 : null)}.</p>}
                        </div>
                    </div>
                )}

                {step === 4 && result?.valid && client && (
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-xl border p-3">
                            <Row label="Cliente" value={client.name} />
                            <Row label="Produto" value={product?.name || '—'} />
                            <Row label="Montante" value={formatCurrency(form.principal)} />
                            <Row label="Prazo" value={`${form.months} meses · ${form.system === 'sac' ? 'SAC' : 'PRICE'}`} />
                            <Row label="TAN / TAEG" value={`${pct(calc.annualRate)} / ${pct(result.taeg)}`} />
                            <Row label="Prestação" value={formatCurrency(result.installment)} />
                            <Row label="Taxa de esforço" value={pct(calc.effort)} tone={calc.effort !== null && calc.effort > config.effortLimit ? 'red' : undefined} />
                            <Row label="Risco" value={RISK_LABELS[calc.riskLevel]} />
                            <Row label="Documentos / garantia" value={`${docs.length} / ${warranty.description.trim() ? formatCurrency(Number(warranty.marketValue) || 0) : 'nenhuma'}`} />
                            <Row label="Mês de competência" value={targetMonth.split('-').reverse().join('/')} />
                        </div>
                        <div className="space-y-2 rounded-xl border bg-muted/20 p-3 text-sm">
                            <p className="font-bold">O que acontece a seguir</p>
                            <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> O pedido é avaliado pelas alçadas (Limites): dentro da sua alçada é aprovado de imediato; acima dela fica na fila de Aprovações e os aprovadores do nível exigido são notificados.</p>
                            <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Na aprovação, o contrato é gerado automaticamente e o desembolso só acontece se houver saldo em Caixa/Banco, com o lançamento contabilístico na mesma transação.</p>
                            <p className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> Sem ligação ao servidor a submissão é recusada e nada fica gravado neste dispositivo.</p>
                        </div>
                    </div>
                )}

                {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
                <DialogFooter className="gap-2 sm:justify-between">
                    <Button variant="outline" disabled={busy} onClick={() => step === 0 ? onClose() : (setError(''), setStep(step - 1))}><ChevronLeft className="mr-1 h-4 w-4" />{step === 0 ? 'Cancelar' : 'Anterior'}</Button>
                    {step < STEPS.length - 1
                        ? <Button onClick={next}>Seguinte<ChevronRight className="ml-1 h-4 w-4" /></Button>
                        : <Button disabled={busy} onClick={() => void submit()}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Submeter para aprovação</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
