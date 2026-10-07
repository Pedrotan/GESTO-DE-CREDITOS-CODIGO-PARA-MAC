import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle, Calculator, CheckCircle2, FileDown, GitCompareArrows, History, Info, Loader2, Mail, MessageCircle,
    RotateCcw, Save, Send, ShieldAlert, Sparkles, Undo2, UserRound, X,
} from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Button } from '@/componentes/ui/button';
import { Slider } from '@/componentes/ui/slider';
import { Switch } from '@/componentes/ui/switch';
import { Badge } from '@/componentes/ui/badge';
import { Textarea } from '@/componentes/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { SearchableSelect } from '@/componentes/ui/SearchableSelect';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { DecimalInput } from '@/componentes/ui/DecimalInput';
import { AlertModal } from '@/componentes/ui/AlertModal';
import { useToast } from '@/ganchos/usar-toast';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useConfigSimulador } from '@/ganchos/usar-config-simulador';
import { cn } from '@/bibliotecas/utils';
import { formatCurrency, formatDate, formatDecimal, formatPercent } from '@/bibliotecas/formatters';
import {
    AMORTIZATION_LABELS, GRACE_LABELS, effortRate, maxPrincipalForPayment, minMonthsForPayment, simulateCredit, stampDutyUseRate,
    type SimulationResult,
} from '@/bibliotecas/simulador-credito';
import { productLimitErrors, type RiskLevel, type SimulatorConfig } from '@/bibliotecas/config-simulador';
import { RISK_LABELS, assessRisk } from '@/bibliotecas/risco-simulacao';
import { clientCreditStanding, newCreditBlockReason } from '@/bibliotecas/regras-credito';
import { SIMULATION_NOTICE, legalContextFrom } from '@/bibliotecas/termos-legais';
import type { Simulation } from '@/tipos/credito';
import { CartoesResultado } from '@/componentes/simulador/CartoesResultado';
import { TabelaCronograma } from '@/componentes/simulador/TabelaCronograma';
import { GraficosSimulacao } from '@/componentes/simulador/GraficosSimulacao';
import { HistoricoSimulacoes } from '@/componentes/simulador/HistoricoSimulacoes';
import { ServicoAuditoriaAvancada } from '@/servicos/ServicoAuditoriaAvancada';
import { ComparadorCenarios, MAX_SCENARIOS, type Scenario } from '@/componentes/simulador/ComparadorCenarios';
import {
    QUICK_TERMS, activeProducts, baseAnnualRate, buildInput, clientHistory, defaultForm, formFromSimulation, newSimulationNumber,
    newVerificationCode, parseDetails, productFields, simulationStatus, type SimulatorForm, type StoredDetails,
} from '@/componentes/simulador/modelo';

type SavedRef = { id: string; number: string; code: string; issuedAt: Date; expiresAt: Date; signature: string; status: 'simulated' | 'converted'; convertedCreditId?: string | null };

const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => (item && typeof item === 'object' && !Array.isArray(item)
    ? Object.keys(item).sort().reduce((acc, key) => ({ ...acc, [key]: (item as Record<string, unknown>)[key] }), {})
    : item));
const signatureOf = (form: SimulatorForm, annualRate: number) => stable({ form, annualRate: Math.round(annualRate * 1e6) / 1e6 });
const yearsLabel = (months: number) => {
    if (!months) return '';
    const years = months / 12;
    return Number.isInteger(years) ? `${years} ${years === 1 ? 'ano' : 'anos'}` : `${formatDecimal(years, 1)} anos`;
};
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

const Section = ({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) => (
    <div className={cn('space-y-3', className)}>
        <Label className="text-xs font-bold uppercase text-muted-foreground">{title}</Label>
        {children}
    </div>
);

type Computed = {
    ready: boolean;
    baseRate: number;
    riskAdjustment: number;
    annualRate: number;
    result: SimulationResult | null;
    effort: number | null;
    risk: ReturnType<typeof assessRisk>;
    riskLevel: RiskLevel;
};

/** Cálculo completo: risco a partir da prestação sem ajuste, depois TAN ajustada ao risco e simulação final. */
function compute(form: SimulatorForm, config: SimulatorConfig, history: ReturnType<typeof clientHistory>): Computed {
    const ready = form.principal > 0 && form.months > 0;
    const baseRate = baseAnnualRate(form);
    const baseResult = ready ? simulateCredit(buildInput(form, config, baseRate)) : null;
    const baseEffort = baseResult?.valid ? effortRate(baseResult.maxInstallment, form.otherDebts, form.income) : null;
    const risk = assessRisk({
        effortRate: baseEffort, effortLimit: config.effortLimit,
        latePayments: history?.latePayments || 0, maxDaysOverdue: history?.maxDaysOverdue || 0, paidCredits: history?.paidCredits || 0,
        activeCredits: history?.activeCredits || 0, defaultedCredits: history?.defaultedCredits || 0, guaranteeCoverage: history?.guaranteeCoverage || 0,
    });
    const riskLevel = form.riskOverride ?? risk.level;
    const riskAdjustment = form.applyRiskAdjustment ? config.riskSpread[riskLevel] : 0;
    const annualRate = Math.max(0, baseRate + riskAdjustment);
    const result = ready ? simulateCredit(buildInput(form, config, annualRate)) : null;
    const effort = result?.valid ? effortRate(result.maxInstallment, form.otherDebts, form.income) : null;
    return { ready, baseRate, riskAdjustment, annualRate, result, effort, risk, riskLevel };
}

export function SimuladorCredito() {
    const { companySettings, clients, credits, payments, warranties, simulations, addSimulation, deleteSimulation, updateSimulationStatus, addCredit, addLog } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const { config, loading: configLoading } = useConfigSimulador();

    const [tab, setTab] = useState('simulador');
    const [form, setForm] = useState<SimulatorForm>(() => defaultForm(config));
    const touched = useRef(false);
    const [saved, setSaved] = useState<SavedRef | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [scenarios, setScenarios] = useState<Scenario[]>([]);
    const [riskDialog, setRiskDialog] = useState<{ open: boolean; level: RiskLevel; justification: string }>({ open: false, level: 'medium', justification: '' });
    const [riskError, setRiskError] = useState('');
    const [convertOpen, setConvertOpen] = useState(false);
    const [inverseOpen, setInverseOpen] = useState(false);
    const [inverseTarget, setInverseTarget] = useState(0);
    const [deleteTarget, setDeleteTarget] = useState<Simulation | null>(null);

    // Quando a configuração partilhada chega, os valores do produto por omissão passam a ser os da empresa.
    useEffect(() => { if (!configLoading && !touched.current) setForm(defaultForm(config)); }, [config, configLoading]);

    const products = useMemo(() => activeProducts(config), [config]);
    const product = useMemo(() => config.products.find(item => item.id === form.productId) || products[0], [config.products, form.productId, products]);
    const client = useMemo(() => clients.find(item => item.id === form.clientId), [clients, form.clientId]);
    const history = useMemo(() => clientHistory(client, credits, payments, warranties as any, form.principal), [client, credits, payments, warranties, form.principal]);
    const calc = useMemo(() => compute(form, config, history), [form, config, history]);
    const { ready, result, effort, risk, riskLevel, annualRate } = calc;
    const signature = useMemo(() => signatureOf(form, annualRate), [form, annualRate]);
    const isSaved = !!saved && saved.signature === signature;

    const set = useCallback((changes: Partial<SimulatorForm>) => { touched.current = true; setForm(prev => ({ ...prev, ...changes })); }, []);

    // ── Validação ────────────────────────────────────────────────────────────────────
    const errors = useMemo(() => {
        if (!ready) return [] as string[];
        const list = productLimitErrors(product, form.principal, form.months, value => formatCurrency(value));
        if (form.graceMonths >= form.months) list.push('A carência tem de ser inferior ao prazo do crédito.');
        if (form.dueDay < 1 || form.dueDay > 28) list.push('O dia de vencimento tem de estar entre 1 e 28.');
        if (Number.isNaN(new Date(`${form.startDate}T12:00:00`).getTime())) list.push('Indique uma data de início válida.');
        return list;
    }, [ready, product, form.principal, form.months, form.graceMonths, form.dueDay, form.startDate]);

    const overLimit = effort !== null && effort > config.effortLimit;
    const recommendation = useMemo(() => {
        if (!overLimit || !result?.valid) return null;
        const maxPayment = (config.effortLimit / 100) * form.income - form.otherDebts;
        if (maxPayment <= 0) return { maxPayment: 0, maxAmount: 0, minMonths: null as number | null };
        const { principal: _ignored, ...rest } = buildInput(form, config, annualRate);
        const maxAmount = Math.min(product.maxAmount, maxPrincipalForPayment(maxPayment, rest, Math.max(product.maxAmount, form.principal) * 1.5));
        const minMonths = minMonthsForPayment(maxPayment, buildInput(form, config, annualRate), product.maxMonths);
        return { maxPayment, maxAmount, minMonths };
    }, [overLimit, result, config, form, annualRate, product]);

    const missingReason = useMemo(() => {
        const name = !form.clientName.trim();
        if (name && !form.principal) return 'Indique o nome do cliente e o montante.';
        if (name) return 'Indique o nome do cliente.';
        if (!form.principal) return 'Indique o montante.';
        if (!form.months) return 'Indique o prazo.';
        if (errors.length) return errors[0];
        if (form.riskOverride && form.riskJustification.trim().length < 10) return 'Justifique a alteração do nível de risco.';
        return null;
    }, [form.clientName, form.principal, form.months, form.riskOverride, form.riskJustification, errors]);

    const standing = useMemo(() => (client ? clientCreditStanding(client.id, credits) : null), [client, credits]);
    const convertReason = useMemo(() => {
        if (missingReason) return missingReason;
        if (!client) return 'Só é possível converter simulações de clientes registados. Seleccione o cliente na pesquisa.';
        // Clientes inactivos podem pedir: o pedido segue sempre para aprovação. Só os bloqueados não podem.
        if (client.status === 'blocked' || client.blocked) return `O cliente está bloqueado${client.blockReason ? `: ${client.blockReason}` : ''}.`;
        const blocked = standing ? newCreditBlockReason(standing, value => formatCurrency(value)) : null;
        if (blocked) return `O cliente tem créditos por liquidar. ${blocked}`;
        if (form.graceMonths > 0) return 'Os pedidos de crédito não suportam carência: retire a carência para converter.';
        if (isSaved && saved?.status === 'converted') return 'Esta simulação já foi convertida em pedido de crédito.';
        return null;
    }, [missingReason, client, standing, form.graceMonths, isSaved, saved]);

    // ── Cliente e produto ────────────────────────────────────────────────────────────
    const clientOptions = useMemo(() => clients.filter(item => !item.deletedAt).map(item => ({
        value: item.id, label: item.name, subLabel: [item.nif && `NIF ${item.nif}`, item.phone].filter(Boolean).join(' · '), keywords: `${item.nif || ''} ${item.phone || ''} ${item.email || ''}`,
    })), [clients]);

    const selectClient = (id: string) => {
        const selected = clients.find(item => item.id === id);
        if (!selected) return;
        const info = clientHistory(selected, credits, payments, warranties as any, form.principal);
        set({
            clientId: selected.id, clientName: selected.name, clientNif: selected.nif || '', clientPhone: selected.phone || '', clientEmail: selected.email || '',
            clientAddress: selected.address || '', income: Number(selected.monthlyIncome) || 0, otherDebts: info?.monthlyDebts || 0,
            riskOverride: null, riskJustification: '',
        });
    };
    const clearClient = () => set({ clientId: null, clientName: '', clientNif: '', clientPhone: '', clientEmail: '', clientAddress: '', income: 0, otherDebts: 0, riskOverride: null, riskJustification: '' });

    const selectProduct = (id: string) => {
        const next = config.products.find(item => item.id === id);
        if (!next) return;
        const clamp = (value: number, min: number, max: number) => (value ? Math.min(max, Math.max(min, value)) : value);
        set({ ...productFields(next, config), principal: clamp(form.principal, next.minAmount, next.maxAmount), months: clamp(form.months, next.minMonths, next.maxMonths) });
    };

    // ── Guardar, PDF, partilha e conversão ───────────────────────────────────────────
    const buildDetails = (): StoredDetails => ({
        version: 2, form, productName: product.name, baseRate: calc.baseRate, riskAdjustment: calc.riskAdjustment, annualRate,
        risk: { calculated: risk.level, level: riskLevel, score: risk.score, overridden: !!form.riskOverride, justification: form.riskOverride ? form.riskJustification : undefined },
        effortRate: effort,
        summary: {
            taeg: result?.taeg ?? null, mtic: result?.mtic || 0, netReceived: result?.netReceived || 0, installmentBase: result?.installmentBase || 0,
            totalInterest: result?.totalInterest || 0, totalTaxes: result?.totalTaxes || 0, totalCommissions: result?.totalCommissions || 0, totalInsurance: result?.totalInsurance || 0,
        },
        settings: { stampDuty: config.stampDuty, extraHolidays: config.extraHolidays, effortLimit: config.effortLimit, lateSurcharge: config.lateSurcharge, validityDays: config.validityDays, indexName: config.indexName },
    });

    const save = async (): Promise<SavedRef | null> => {
        if (missingReason || !result?.valid) {
            toast({ title: 'Simulação incompleta', description: missingReason || 'Indique o montante e o prazo.', variant: 'destructive' });
            return null;
        }
        if (isSaved && saved) return saved;
        const used = new Set(simulations.map(item => item.reference));
        let number = newSimulationNumber();
        while (used.has(number)) number = newSimulationNumber();
        const issuedAt = new Date();
        const expiresAt = addDays(issuedAt, config.validityDays);
        const record: Simulation = {
            id: crypto.randomUUID(), reference: number, date: issuedAt, clientName: form.clientName.trim(), clientIncome: form.income,
            amount: form.principal, term: form.months, interestRate: Math.round(annualRate * 10000) / 10000, method: form.system, riskProfile: riskLevel,
            totalPayment: result.totalPayments, monthlyPayment: result.installment, createdAt: issuedAt, status: 'simulated',
            clientId: form.clientId, productId: product.id, verificationCode: newVerificationCode(), expiresAt, details: JSON.stringify(buildDetails()), updatedAt: issuedAt,
        };
        await addSimulation(record);
        const ref: SavedRef = { id: record.id, number, code: record.verificationCode!, issuedAt, expiresAt, signature, status: 'simulated' };
        setSaved(ref);
        return ref;
    };

    const handleSave = async () => {
        setBusy('save');
        try {
            const ref = await save();
            if (ref) toast({ title: 'Guardada no histórico', description: `Simulação ${ref.number} · código ${ref.code} · válida até ${formatDate(ref.expiresAt)}.` });
        } catch (error: any) {
            toast({ title: 'Não foi possível guardar', description: error?.message, variant: 'destructive' });
        } finally { setBusy(null); }
    };

    const legal = useMemo(() => legalContextFrom(companySettings, config), [companySettings, config]);

    const sheetFor = (input: { form: SimulatorForm; result: SimulationResult; annualRate: number; baseRate: number; riskAdjustment: number; productName: string; effort: number | null; riskLevel: RiskLevel; overridden: boolean; justification?: string; number: string; code: string; issuedAt: Date; expiresAt: Date; settings: Pick<SimulatorConfig, 'effortLimit' | 'lateSurcharge' | 'validityDays' | 'indexName'> }) => ({
        number: input.number, verificationCode: input.code, issuedAt: input.issuedAt, expiresAt: input.expiresAt,
        client: { name: input.form.clientName, nif: input.form.clientNif, phone: input.form.clientPhone, email: input.form.clientEmail, address: input.form.clientAddress, income: input.form.income, otherDebts: input.form.otherDebts, registered: !!input.form.clientId },
        productName: input.productName,
        params: {
            principal: input.form.principal, months: input.form.months, system: input.form.system, startDate: input.form.startDate, dueDay: input.form.dueDay,
            graceMonths: input.form.graceMonths, graceType: input.form.graceType, rateType: input.form.rateType, indexName: input.settings.indexName,
            indexValue: input.form.indexValue, spread: input.form.spread, baseRate: input.baseRate, riskAdjustment: input.riskAdjustment, annualRate: input.annualRate,
            feePayment: input.form.feePayment, openingFee: input.form.openingFee, processingFee: input.form.processingFee, insuranceRate: input.form.insuranceEnabled ? input.form.insuranceRate : 0,
        },
        result: input.result, effortRate: input.effort, effortLimit: input.settings.effortLimit,
        risk: { level: input.riskLevel, overridden: input.overridden, justification: input.justification },
        lateSurcharge: input.settings.lateSurcharge, validityDays: input.settings.validityDays,
    });

    const handlePdf = async () => {
        setBusy('pdf');
        try {
            const ref = await save();
            if (!ref || !result) return;
            const { generateSimulationSheetPdf } = await import('@/bibliotecas/ficha-simulacao-pdf');
            await generateSimulationSheetPdf(sheetFor({
                form, result, annualRate, baseRate: calc.baseRate, riskAdjustment: calc.riskAdjustment, productName: product.name, effort, riskLevel,
                overridden: !!form.riskOverride, justification: form.riskJustification, number: ref.number, code: ref.code, issuedAt: ref.issuedAt, expiresAt: ref.expiresAt, settings: config,
            }), companySettings, user?.name, legal);
        } catch (error: any) {
            toast({ title: 'Não foi possível gerar a ficha', description: error?.message, variant: 'destructive' });
        } finally { setBusy(null); }
    };

    const historyPdf = async (simulation: Simulation) => {
        try {
            const details = parseDetails(simulation);
            const savedForm = formFromSimulation(simulation, config);
            const settings = { ...config, ...(details?.settings || {}) };
            const rate = details?.annualRate ?? (Number(simulation.interestRate) || 0) * (details ? 1 : 12);
            const replay = simulateCredit(buildInput(savedForm, settings, rate));
            if (!replay.valid) throw new Error('A simulação guardada não tem montante ou prazo válidos.');
            const issuedAt = new Date(simulation.date);
            const { generateSimulationSheetPdf } = await import('@/bibliotecas/ficha-simulacao-pdf');
            await generateSimulationSheetPdf(sheetFor({
                form: savedForm, result: replay, annualRate: rate, baseRate: details?.baseRate ?? rate, riskAdjustment: details?.riskAdjustment ?? 0,
                productName: details?.productName || 'Crédito', effort: details?.effortRate ?? effortRate(replay.maxInstallment, savedForm.otherDebts, savedForm.income),
                riskLevel: (details?.risk.level || simulation.riskProfile) as RiskLevel, overridden: !!details?.risk.overridden, justification: details?.risk.justification,
                number: simulation.reference, code: simulation.verificationCode || '—', issuedAt,
                expiresAt: simulation.expiresAt ? new Date(simulation.expiresAt) : addDays(issuedAt, settings.validityDays), settings,
            }), companySettings, user?.name, legalContextFrom(companySettings, settings));
        } catch (error: any) {
            toast({ title: 'Não foi possível gerar a ficha', description: error?.message, variant: 'destructive' });
        }
    };

    const shareText = () => {
        if (!result?.valid) return '';
        return [
            `*Simulação de crédito — ${companySettings?.name || 'Tango'}*`,
            isSaved && saved ? `N.º ${saved.number} (válida até ${formatDate(saved.expiresAt)})` : null,
            form.clientName ? `Cliente: ${form.clientName}` : null,
            `Produto: ${product.name}`,
            `Montante: ${formatCurrency(form.principal)} · Prazo: ${form.months} meses`,
            `${form.system === 'price' ? 'Prestação mensal' : '1.ª prestação'}: ${formatCurrency(result.installment)}`,
            `TAN: ${formatPercent(annualRate)} · TAEG: ${result.taeg === null ? '—' : formatPercent(result.taeg)}`,
            `Montante a receber: ${formatCurrency(result.netReceived)}`,
            `MTIC: ${formatCurrency(result.mtic)}`,
            '',
            SIMULATION_NOTICE,
        ].filter(line => line !== null).join('\n');
    };

    const share = async (channel: 'whatsapp' | 'email') => {
        const ref = await save();
        if (!ref) return;
        const text = shareText();
        if (channel === 'whatsapp') {
            const phone = form.clientPhone.replace(/\D/g, '');
            const number = phone ? (phone.startsWith('244') ? phone : phone.startsWith('9') ? `244${phone}` : phone) : '';
            window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank');
        } else {
            const subject = `Simulação de crédito ${ref.number} — ${companySettings?.name || ''}`.trim();
            window.location.href = `mailto:${encodeURIComponent(form.clientEmail || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text.replace(/\*/g, ''))}`;
        }
        void addLog('update', 'system', `Simulação ${ref.number} partilhada por ${channel === 'whatsapp' ? 'WhatsApp' : 'email'} (${form.clientName}).`, user?.id, user?.name);
    };

    const convert = async () => {
        if (convertReason || !client || !result?.valid) return;
        setBusy('convert');
        try {
            const ref = await save();
            if (!ref) return;
            const creditId = `CR-${crypto.randomUUID()}`;
            const ownCredits = credits.filter(item => item.clientId === client.id && !['rejected', 'cancelled'].includes(item.status));
            const start = new Date(`${form.startDate}T12:00:00`);
            const due = result.lastDueDate ? new Date(`${result.lastDueDate}T12:00:00`) : addDays(start, form.months * 30);
            await addCredit({
                id: creditId, clientId: client.id, clientName: client.name, principalAmount: form.principal, currentBalance: form.principal,
                interestRate: Math.round(annualRate * 10000) / 10000, lateInterestRate: client.lateInterestRate || 1, installments: form.months, paidInstallments: 0,
                startDate: start, dueDate: due, status: 'pending_approval', requestedBy: user?.name || 'Sistema', requestedAt: new Date(),
                daysOverdue: 0, accruedInterest: result.totalInterest, lateInterest: 0, totalDue: form.principal + result.totalInterest,
                amortizationMethod: form.system === 'sac' ? 'SAC' : 'PRICE', creditNumber: ownCredits.length + 1, createdAt: new Date(),
                targetMonthId: form.startDate.slice(0, 7),
            } as any, user ? { id: user.id, name: user.name } : undefined, { productId: product.id, effortRate: effort });
            await updateSimulationStatus(ref.id, 'converted', creditId);
            setSaved({ ...ref, status: 'converted', convertedCreditId: creditId });
            await addLog('create', 'credit', `Pedido de crédito ${creditId} criado a partir da simulação ${ref.number} (${product.name}, ${formatCurrency(form.principal)}, ${form.months} meses, TAN ${formatPercent(annualRate)}, TAEG ${result.taeg === null ? 'n.d.' : formatPercent(result.taeg)}, MTIC ${formatCurrency(result.mtic)}).`, user?.id, user?.name, null, { simulation: ref.number, creditId });
            setConvertOpen(false);
            toast({ title: 'Pedido de crédito enviado para aprovação', description: `A simulação ${ref.number} foi convertida no pedido ${creditId.slice(0, 13)}…` });
        } catch (error: any) {
            toast({ title: 'Não foi possível converter', description: error?.message, variant: 'destructive' });
        } finally { setBusy(null); }
    };

    // ── Risco ────────────────────────────────────────────────────────────────────────
    const applyRiskOverride = async () => {
        const justification = riskDialog.justification.trim().replace(/\s+/g, ' ');
        // Justificação válida: 20+ caracteres, 3+ palavras, sem caracteres repetidos e diferente das anteriores.
        const invalid = await ServicoAuditoriaAvancada.checkJustification(justification, user?.id);
        if (invalid) { setRiskError(invalid); return; }
        setRiskError('');
        set({ riskOverride: riskDialog.level, riskJustification: justification });
        setRiskDialog(prev => ({ ...prev, open: false }));
        await addLog('update', 'system', `Simulador: nível de risco de ${form.clientName || 'cliente não identificado'} alterado de ${RISK_LABELS[risk.level]} para ${RISK_LABELS[riskDialog.level]}. Justificação: ${justification}`,
            user?.id, user?.name, { level: RISK_LABELS[risk.level], score: risk.score }, { level: RISK_LABELS[riskDialog.level] },
            { justification, override: true, clientId: form.clientId || undefined, clientName: form.clientName || undefined, from: risk.level, to: riskDialog.level });
    };
    const resetRisk = async () => {
        const previous = form.riskOverride;
        set({ riskOverride: null, riskJustification: '' });
        if (previous) await addLog('update', 'system', `Simulador: alteração manual do risco (${RISK_LABELS[previous]}) removida; volta ao cálculo automático (${RISK_LABELS[risk.level]}).`, user?.id, user?.name);
    };

    // ── Histórico ────────────────────────────────────────────────────────────────────
    const reopen = (simulation: Simulation, asNew: boolean) => {
        touched.current = true;
        const next = formFromSimulation(simulation, config);
        const details = parseDetails(simulation);
        setForm(next);
        if (!asNew && details) {
            setSaved({
                id: simulation.id, number: simulation.reference, code: simulation.verificationCode || '—', issuedAt: new Date(simulation.date),
                expiresAt: simulation.expiresAt ? new Date(simulation.expiresAt) : addDays(new Date(simulation.date), config.validityDays),
                signature: signatureOf(details.form, details.annualRate), status: simulation.status === 'converted' ? 'converted' : 'simulated', convertedCreditId: simulation.convertedCreditId,
            });
        } else setSaved(null);
        setTab('simulador');
        toast(asNew
            ? { title: 'Simulação duplicada', description: 'Ajuste os valores e guarde para gerar um novo número.' }
            : { title: `Simulação ${simulation.reference} reaberta`, description: simulationStatus(simulation) === 'expired' ? 'Está expirada: ao guardar novamente é emitida uma nova ficha.' : 'Pode gerar a ficha, partilhar ou converter em pedido.' });
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteSimulation(deleteTarget.id);
            await addLog('delete', 'system', `Eliminou a simulação ${deleteTarget.reference} (${deleteTarget.clientName}).`, user?.id, user?.name);
            if (saved?.id === deleteTarget.id) setSaved(null);
            toast({ title: 'Simulação eliminada' });
        } catch (error: any) {
            toast({ title: 'Não foi possível eliminar', description: error?.message, variant: 'destructive' });
        } finally { setDeleteTarget(null); }
    };

    // ── Simulação inversa ────────────────────────────────────────────────────────────
    const inverse = useMemo(() => {
        if (!inverseOpen || !(inverseTarget > 0) || !form.months) return null;
        const { principal: _ignored, ...rest } = buildInput(form, config, annualRate);
        const maxAmount = maxPrincipalForPayment(inverseTarget, rest, Math.max(product.maxAmount, form.principal) * 2);
        const minMonths = form.principal > 0 ? minMonthsForPayment(inverseTarget, buildInput(form, config, annualRate), product.maxMonths) : null;
        return { maxAmount, minMonths, withinProduct: Math.min(maxAmount, product.maxAmount) };
    }, [inverseOpen, inverseTarget, form, config, annualRate, product]);

    const openInverse = () => {
        const byEffort = form.income > 0 ? Math.max(0, (config.effortLimit / 100) * form.income - form.otherDebts) : 0;
        setInverseTarget(Math.floor(byEffort || result?.installment || 0));
        if (!form.months) set({ months: Math.min(product.maxMonths, Math.max(product.minMonths, 12)) });
        setInverseOpen(true);
    };

    const addScenario = () => {
        if (!ready) { toast({ title: 'Simulação incompleta', description: 'Indique o montante e o prazo antes de comparar.' }); return; }
        if (scenarios.length >= MAX_SCENARIOS) return;
        setScenarios(prev => [...prev, { id: crypto.randomUUID(), name: `Cenário ${prev.length + 1}`, form: { ...form }, annualRate }]);
        setTab('comparar');
    };

    // ── Interface ────────────────────────────────────────────────────────────────────
    const amountStep = product.maxAmount > 10_000_000 ? 50_000 : product.maxAmount > 1_000_000 ? 10_000 : 1_000;
    const useRate = stampDutyUseRate(form.months || product.minMonths, config.stampDuty);
    const riskTone = (level: RiskLevel) => level === 'low' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : level === 'medium' ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300';

    return (
        <MainLayout title="Simulador de Crédito" subtitle="Simulação ao padrão dos bancos angolanos: TAN, TAEG, MTIC, Imposto do Selo e taxa de esforço">
            <Tabs value={tab} onValueChange={setTab} className="w-full space-y-6">
                <TabsList className="grid w-full max-w-[640px] grid-cols-4">
                    <TabsTrigger value="simulador" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white"><Calculator className="mr-2 h-4 w-4" /> Simulador</TabsTrigger>
                    <TabsTrigger value="comparar"><GitCompareArrows className="mr-2 h-4 w-4" /> Comparar{scenarios.length ? ` (${scenarios.length})` : ''}</TabsTrigger>
                    <TabsTrigger value="historico"><History className="mr-2 h-4 w-4" /> Histórico</TabsTrigger>
                    <TabsTrigger value="guia"><Info className="mr-2 h-4 w-4" /> Guia</TabsTrigger>
                </TabsList>

                <TabsContent value="simulador">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        {/* ── PARÂMETROS ── */}
                        <div className="space-y-6 lg:col-span-1">
                            <Card className="card-elevated border-none bg-card shadow-lg">
                                <CardHeader className="rounded-t-xl border-b border-border bg-muted/50 pb-4">
                                    <CardTitle className="flex items-center justify-between gap-2 text-indigo-600 dark:text-indigo-400">
                                        <span className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Parâmetros da Simulação</span>
                                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => { touched.current = true; setForm(defaultForm(config)); setSaved(null); }}>
                                            <RotateCcw className="h-3.5 w-3.5" /> Limpar
                                        </Button>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-6">
                                    {/* Cliente */}
                                    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                                        <Label className="text-xs font-bold uppercase text-muted-foreground">Dados do Cliente</Label>
                                        <div className="space-y-2">
                                            <Label className="text-xs">Pesquisar cliente registado</Label>
                                            <div className="flex gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <SearchableSelect options={clientOptions} value={form.clientId || ''} onValueChange={selectClient}
                                                        placeholder="Nome, NIF ou telefone…" searchPlaceholder="Pesquisar cliente…" emptyMessage="Nenhum cliente encontrado." />
                                                </div>
                                                {form.clientId && <Button variant="outline" size="icon" className="shrink-0" title="Retirar cliente" onClick={clearClient}><X className="h-4 w-4" /></Button>}
                                            </div>
                                        </div>
                                        {client && history && (
                                            <div className="flex flex-wrap gap-1.5 text-[11px]">
                                                <Badge variant="outline" className="gap-1"><UserRound className="h-3 w-3" /> {client.status === 'active' ? 'Activo' : 'Inactivo'}</Badge>
                                                <Badge variant="outline">{history.activeCredits} crédito(s) activo(s)</Badge>
                                                <Badge variant="outline">{history.paidCredits} liquidado(s)</Badge>
                                                {history.latePayments > 0 && <Badge variant="outline" className="border-red-300 text-red-600">{history.latePayments} atraso(s)</Badge>}
                                                {history.guaranteesValue > 0 && <Badge variant="outline">Garantias {formatCurrency(history.guaranteesValue)}</Badge>}
                                            </div>
                                        )}
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold">Nome completo <span className="text-red-500">*</span></Label>
                                            <Input placeholder="Ex.: João Manuel da Silva" value={form.clientName} disabled={!!form.clientId} onChange={event => set({ clientName: event.target.value })} />
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label className="text-xs">Rendimento Mensal Líquido</Label>
                                                <CurrencyInput value={form.income} onValueChange={income => set({ income })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">Outros encargos mensais com créditos</Label>
                                                <CurrencyInput value={form.otherDebts} onValueChange={otherDebts => set({ otherDebts })} />
                                            </div>
                                        </div>
                                        {history && history.activeCredits > 0 && (
                                            <p className="text-[11px] leading-tight text-muted-foreground">Encargos preenchidos com as prestações estimadas dos {history.activeCredits} crédito(s) em curso no sistema ({formatCurrency(history.monthlyDebts)}/mês). Acrescente créditos noutras instituições.</p>
                                        )}
                                    </div>

                                    {/* Produto */}
                                    <Section title="Produto">
                                        <Select value={product.id} onValueChange={selectProduct}>
                                            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                                            <SelectContent>{products.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <p className="text-[11px] text-muted-foreground">
                                            {formatCurrency(product.minAmount)} a {formatCurrency(product.maxAmount)} · {product.minMonths} a {product.maxMonths} meses · {product.rateType === 'variable' ? `${config.indexName} + ${formatDecimal(product.spread, 2)} p.p.` : `TAN ${formatPercent(product.annualRate)}`}
                                        </p>
                                    </Section>

                                    {/* Montante */}
                                    <div className="space-y-3">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <Label>Montante do Crédito</Label>
                                            <span className="truncate font-bold text-indigo-600">{form.principal ? formatCurrency(form.principal) : '—'}</span>
                                        </div>
                                        <Slider value={[Math.max(product.minAmount, Math.min(product.maxAmount, form.principal || product.minAmount))]} min={product.minAmount} max={product.maxAmount} step={amountStep}
                                            onValueChange={([value]) => set({ principal: value })} className="py-2" />
                                        <CurrencyInput value={form.principal} onValueChange={principal => set({ principal })} className="text-right font-mono font-bold" placeholder="Ex.: 1 000 000,00" />
                                    </div>

                                    {/* Prazo */}
                                    <div className="space-y-3">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <Label>Prazo</Label>
                                            <span className="font-bold text-indigo-600">{form.months ? `${form.months} meses · ${yearsLabel(form.months)}` : 'Escolha o prazo'}</span>
                                        </div>
                                        <Slider value={[Math.max(product.minMonths, Math.min(product.maxMonths, form.months || product.minMonths))]} min={product.minMonths} max={product.maxMonths} step={1}
                                            onValueChange={([value]) => set({ months: value })} className="py-2" />
                                        <div className="flex flex-wrap gap-1.5">
                                            {QUICK_TERMS.map(months => {
                                                const allowed = months >= product.minMonths && months <= product.maxMonths;
                                                return (
                                                    <button key={months} type="button" disabled={!allowed} onClick={() => set({ months })}
                                                        className={cn('rounded-md border px-2.5 py-1 text-xs font-bold transition-all',
                                                            form.months === months ? 'border-indigo-500 bg-indigo-600 text-white' : 'bg-background hover:bg-muted', !allowed && 'cursor-not-allowed opacity-40')}>
                                                        {months}
                                                    </button>
                                                );
                                            })}
                                            <span className="self-center text-[11px] text-muted-foreground">meses</span>
                                        </div>
                                    </div>

                                    {/* Datas */}
                                    <Section title="Datas e carência" className="rounded-lg border border-border bg-muted/30 p-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1"><Label className="text-[11px]">Data de início (desembolso)</Label><Input type="date" value={form.startDate} onChange={event => set({ startDate: event.target.value })} className="h-9 bg-background" /></div>
                                            <div className="space-y-1"><Label className="text-[11px]">Dia de vencimento</Label><DecimalInput digits={0} min={1} max={28} value={form.dueDay} onValueChange={dueDay => set({ dueDay })} className="h-9 bg-background" /></div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <Label className="text-[11px]">Carência (opcional)</Label>
                                                <Select value={String(form.graceMonths)} onValueChange={value => set({ graceMonths: Number(value) })}>
                                                    <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                                                    <SelectContent>{[0, 1, 2, 3, 4, 5, 6].map(value => <SelectItem key={value} value={String(value)}>{value === 0 ? 'Sem carência' : `${value} ${value === 1 ? 'mês' : 'meses'}`}</SelectItem>)}</SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[11px]">Tipo de carência</Label>
                                                <Select value={form.graceType} disabled={!form.graceMonths} onValueChange={value => set({ graceType: value as SimulatorForm['graceType'] })}>
                                                    <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                                                    <SelectContent><SelectItem value="capital">Só capital</SelectItem><SelectItem value="total">Capital e juros</SelectItem></SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        {form.graceMonths > 0 && <p className="text-[11px] text-muted-foreground">{GRACE_LABELS[form.graceType]}.</p>}
                                    </Section>

                                    {/* Taxa */}
                                    <Section title="Taxa de juro" className="rounded-lg border border-border bg-muted/30 p-4">
                                        <Tabs value={form.rateType} onValueChange={value => set({ rateType: value as SimulatorForm['rateType'] })}>
                                            <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="fixed">Taxa Fixa</TabsTrigger><TabsTrigger value="variable">Taxa Variável</TabsTrigger></TabsList>
                                        </Tabs>
                                        {form.rateType === 'fixed' ? (
                                            <div className="space-y-1"><Label className="text-[11px]">TAN — Taxa Anual Nominal</Label><DecimalInput suffix="%" min={0} max={500} value={form.baseRate} onValueChange={baseRate => set({ baseRate })} className="bg-background text-right font-bold" /></div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1"><Label className="text-[11px]">Indexante ({config.indexName})</Label><DecimalInput suffix="%" digits={3} min={0} max={500} value={form.indexValue} onValueChange={indexValue => set({ indexValue })} className="bg-background text-right" /></div>
                                                <div className="space-y-1"><Label className="text-[11px]">Spread</Label><DecimalInput suffix="p.p." min={-100} max={500} value={form.spread} onValueChange={spread => set({ spread })} className="bg-background text-right" /></div>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2">
                                            <div className="text-xs">
                                                <p>Ajustar ao risco <span className="font-bold">({RISK_LABELS[riskLevel]}: {calc.riskAdjustment >= 0 ? '+' : ''}{formatDecimal(form.applyRiskAdjustment ? config.riskSpread[riskLevel] : 0, 2)} p.p.)</span></p>
                                            </div>
                                            <Switch checked={form.applyRiskAdjustment} onCheckedChange={applyRiskAdjustment => set({ applyRiskAdjustment })} />
                                        </div>
                                        <div className="rounded-md border border-indigo-500/20 bg-indigo-500/5 px-3 py-2">
                                            <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{formatPercent(annualRate)} <span className="text-xs font-bold text-muted-foreground">TAN</span></p>
                                            <p className="text-xs text-muted-foreground">Taxa mensal (TAN ÷ 12): {formatPercent(annualRate / 12, 4)} · {form.rateType === 'fixed' ? 'fixa' : 'variável'}</p>
                                        </div>
                                    </Section>

                                    {/* Sistema */}
                                    <Section title="Sistema de amortização">
                                        <Tabs value={form.system} onValueChange={value => set({ system: value as SimulatorForm['system'] })} className="w-full">
                                            <TabsList className="grid w-full grid-cols-2">
                                                <TabsTrigger value="price" className="text-xs">{AMORTIZATION_LABELS.price}</TabsTrigger>
                                                <TabsTrigger value="sac" className="text-xs">{AMORTIZATION_LABELS.sac}</TabsTrigger>
                                            </TabsList>
                                        </Tabs>
                                    </Section>

                                    {/* Encargos */}
                                    <Section title="Encargos" className="rounded-lg border border-border bg-muted/30 p-4">
                                        <div className="space-y-1">
                                            <Label className="text-[11px]">Comissão de abertura</Label>
                                            <div className="flex gap-2">
                                                <Select value={form.openingFee.mode} onValueChange={mode => set({ openingFee: { ...form.openingFee, mode: mode as 'percent' | 'fixed' } })}>
                                                    <SelectTrigger className="h-9 w-20 bg-background"><SelectValue /></SelectTrigger>
                                                    <SelectContent><SelectItem value="percent">%</SelectItem><SelectItem value="fixed">Kz</SelectItem></SelectContent>
                                                </Select>
                                                <div className="flex-1">
                                                    {form.openingFee.mode === 'percent'
                                                        ? <DecimalInput suffix="%" min={0} max={100} value={form.openingFee.value} onValueChange={value => set({ openingFee: { ...form.openingFee, value } })} className="h-9 bg-background" />
                                                        : <CurrencyInput value={form.openingFee.value} onValueChange={value => set({ openingFee: { ...form.openingFee, value } })} className="h-9 bg-background" />}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-1"><Label className="text-[11px]">Comissão de processamento (por prestação)</Label><CurrencyInput value={form.processingFee} onValueChange={processingFee => set({ processingFee })} className="h-9 bg-background" /></div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <Label className="text-[11px]">Seguro (% mensal sobre o capital em dívida)</Label>
                                                <DecimalInput suffix="% / mês" digits={3} min={0} max={100} disabled={!form.insuranceEnabled} value={form.insuranceRate} onValueChange={insuranceRate => set({ insuranceRate })} className="h-9 bg-background" />
                                            </div>
                                            <Switch className="mt-5" checked={form.insuranceEnabled} onCheckedChange={insuranceEnabled => set({ insuranceEnabled })} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[11px]">Comissão de abertura e Imposto do Selo de utilização</Label>
                                            <Select value={form.feePayment} onValueChange={feePayment => set({ feePayment: feePayment as SimulatorForm['feePayment'] })}>
                                                <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                                                <SelectContent><SelectItem value="deducted">Descontados no desembolso</SelectItem><SelectItem value="financed">Financiados (somados ao capital)</SelectItem></SelectContent>
                                            </Select>
                                        </div>
                                        <p className="text-[11px] leading-tight text-muted-foreground">
                                            Imposto do Selo: {formatPercent(useRate)} sobre a utilização ({(form.months || product.minMonths) >= 60 ? '5 anos ou mais' : (form.months || product.minMonths) > 12 ? 'mais de 1 ano' : 'até 1 ano'}) e {formatPercent(config.stampDuty.interest)} sobre os juros de cada prestação. Taxas em Configurações › Simulador e Produtos.
                                        </p>
                                    </Section>

                                    {/* Acções */}
                                    <div className="space-y-2">
                                        <Button className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={!!missingReason || !!busy || isSaved} onClick={() => void handleSave()}>
                                            {busy === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : isSaved ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                                            {isSaved ? 'Guardada no Histórico' : 'Guardar no Histórico'}
                                        </Button>
                                        {missingReason && <p className="flex items-start gap-1.5 text-xs text-amber-600"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {missingReason}</p>}
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button variant="outline" className="gap-2" disabled={!!missingReason || !!busy} onClick={() => void handlePdf()}>
                                                {busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Ficha (PDF)
                                            </Button>
                                            <Button variant="outline" className="gap-2" disabled={!form.months} onClick={openInverse}><Sparkles className="h-4 w-4" /> Simulação inversa</Button>
                                            <Button variant="outline" className="gap-2 text-emerald-700" disabled={!!missingReason || !!busy} onClick={() => void share('whatsapp')}><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
                                            <Button variant="outline" className="gap-2" disabled={!!missingReason || !!busy} onClick={() => void share('email')}><Mail className="h-4 w-4" /> Email</Button>
                                        </div>
                                        <Button variant="outline" className="w-full gap-2" disabled={!ready || scenarios.length >= MAX_SCENARIOS} onClick={addScenario}><GitCompareArrows className="h-4 w-4" /> Adicionar ao comparador ({scenarios.length}/{MAX_SCENARIOS})</Button>
                                        <Button className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={!!convertReason || !!busy} onClick={() => setConvertOpen(true)}><Send className="h-4 w-4" /> Converter em pedido de crédito</Button>
                                        {convertReason && !missingReason && <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {convertReason}</p>}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* ── RESULTADOS ── */}
                        <div className="space-y-6 lg:col-span-2">
                            {errors.length > 0 && (
                                <div className="space-y-1 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
                                    <p className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" /> Fora dos limites do produto</p>
                                    {errors.map(error => <p key={error}>{error}</p>)}
                                </div>
                            )}

                            {!ready || !result?.valid ? (
                                <Card className="border-dashed">
                                    <CardContent className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10"><Calculator className="h-8 w-8 text-indigo-600" /></div>
                                        <p className="text-lg font-bold">Indique o montante e o prazo para ver a simulação</p>
                                        <p className="max-w-md text-sm text-muted-foreground">Escolha o produto, o montante e o prazo. A prestação, a TAN, a TAEG, o MTIC, o Imposto do Selo e a taxa de esforço são calculados em tempo real.</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                <>
                                    {isSaved && saved && (
                                        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-2.5 text-sm">
                                            <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                                            <span className="font-mono font-bold">{saved.number}</span>
                                            <span className="text-muted-foreground">· código {saved.code} · válida até {formatDate(saved.expiresAt)}</span>
                                            {saved.status === 'converted' && <Badge variant="success" className="ml-auto">Convertida em pedido</Badge>}
                                        </div>
                                    )}

                                    <CartoesResultado result={result} system={form.system} rateType={form.rateType} effort={effort} effortLimit={config.effortLimit} feePayment={form.feePayment} />

                                    {/* Risco e taxa de esforço */}
                                    <Card className={cn('border shadow-md', riskTone(riskLevel))}>
                                        <CardContent className="space-y-3 p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="rounded-xl bg-background/60 p-3"><ShieldAlert className="h-6 w-6" /></div>
                                                    <div>
                                                        <p className="font-bold text-foreground">Risco {RISK_LABELS[riskLevel]} {form.riskOverride && <Badge variant="outline" className="ml-1 align-middle">alterado manualmente</Badge>}</p>
                                                        <p className="text-xs text-muted-foreground">Pontuação calculada: {risk.score}/100 ({RISK_LABELS[risk.level]}) · ajuste da TAN: {calc.riskAdjustment >= 0 ? '+' : ''}{formatDecimal(calc.riskAdjustment, 2)} p.p.</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    {form.riskOverride
                                                        ? <Button size="sm" variant="outline" className="gap-1 bg-background" onClick={() => void resetRisk()}><Undo2 className="h-4 w-4" /> Repor cálculo</Button>
                                                        : <Button size="sm" variant="outline" className="bg-background" onClick={() => setRiskDialog({ open: true, level: risk.level === 'high' ? 'medium' : risk.level, justification: '' })}>Alterar nível de risco</Button>}
                                                </div>
                                            </div>
                                            <ul className="grid gap-1 text-xs text-foreground/80 md:grid-cols-2">
                                                {risk.reasons.map(reason => (
                                                    <li key={reason.text} className="flex items-start gap-1.5">
                                                        <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', reason.impact >= 0 ? 'bg-emerald-500' : 'bg-red-500')} />{reason.text}
                                                    </li>
                                                ))}
                                            </ul>
                                            {form.riskOverride && <p className="text-xs italic text-muted-foreground">Justificação: {form.riskJustification}</p>}
                                        </CardContent>
                                    </Card>

                                    {overLimit && recommendation && (
                                        <div className="space-y-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
                                            <p className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300"><AlertTriangle className="h-4 w-4" /> Taxa de esforço de {formatPercent(effort ?? 0, 1)} acima do limite de {formatPercent(config.effortLimit, 0)}</p>
                                            {recommendation.maxPayment <= 0 ? (
                                                <p className="text-red-700 dark:text-red-300">Os outros encargos já esgotam o limite: não há margem para uma nova prestação.</p>
                                            ) : (
                                                <div className="grid gap-3 md:grid-cols-3">
                                                    <div className="rounded-lg bg-background/70 p-3"><p className="text-xs text-muted-foreground">Prestação máxima</p><p className="font-bold">{formatCurrency(recommendation.maxPayment)}</p></div>
                                                    <div className="flex items-center justify-between gap-2 rounded-lg bg-background/70 p-3">
                                                        <div><p className="text-xs text-muted-foreground">Montante máximo recomendado ({form.months} meses)</p><p className="font-bold">{formatCurrency(recommendation.maxAmount)}</p></div>
                                                        <Button size="sm" variant="outline" disabled={recommendation.maxAmount < product.minAmount} onClick={() => set({ principal: recommendation.maxAmount })}>Aplicar</Button>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2 rounded-lg bg-background/70 p-3">
                                                        <div><p className="text-xs text-muted-foreground">Prazo mínimo ({formatCurrency(form.principal)})</p><p className="font-bold">{recommendation.minMonths ? `${recommendation.minMonths} meses` : `Acima de ${product.maxMonths} meses`}</p></div>
                                                        <Button size="sm" variant="outline" disabled={!recommendation.minMonths} onClick={() => recommendation.minMonths && set({ months: recommendation.minMonths })}>Aplicar</Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <GraficosSimulacao result={result} />
                                    <TabelaCronograma result={result} title={`Cronograma ${isSaved && saved ? saved.number : 'da simulação'}`}
                                        subtitle={`${form.clientName || 'Cliente'} · ${product.name} · ${formatCurrency(form.principal)} · ${form.months} meses · TAN ${formatPercent(annualRate)} · ${AMORTIZATION_LABELS[form.system]}`} />
                                </>
                            )}
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="comparar">
                    <ComparadorCenarios scenarios={scenarios} config={config} onChange={setScenarios} onAddCurrent={addScenario}
                        onApply={scenario => {
                            touched.current = true;
                            setForm({ ...scenario.form, rateType: 'fixed', baseRate: scenario.annualRate, applyRiskAdjustment: false, riskOverride: null, riskJustification: '' });
                            setSaved(null);
                            setTab('simulador');
                        }} />
                </TabsContent>

                <TabsContent value="historico">
                    <HistoricoSimulacoes simulations={simulations} onReopen={simulation => reopen(simulation, false)} onDuplicate={simulation => reopen(simulation, true)}
                        onPdf={simulation => void historyPdf(simulation)} onDelete={setDeleteTarget} />
                </TabsContent>

                <TabsContent value="guia">
                    <GuiaSimulador config={config} onTerms={() => navigate('/termos-e-politicas')} />
                </TabsContent>
            </Tabs>

            {/* Alteração manual do risco */}
            <Dialog open={riskDialog.open} onOpenChange={open => setRiskDialog(prev => ({ ...prev, open }))}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Alterar nível de risco</DialogTitle>
                        <DialogDescription>O risco calculado é {RISK_LABELS[risk.level]} ({risk.score}/100). A alteração fica registada na auditoria com a justificação e o seu nome.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-2">
                            {(['low', 'medium', 'high'] as const).map(level => (
                                <button key={level} type="button" onClick={() => setRiskDialog(prev => ({ ...prev, level }))}
                                    className={cn('rounded-lg border px-2 py-2 text-xs font-bold transition-all', riskDialog.level === level ? riskTone(level) + ' ring-2 ring-current/20' : 'bg-background text-muted-foreground hover:bg-muted')}>
                                    Risco {RISK_LABELS[level]}
                                </button>
                            ))}
                        </div>
                        <div className="space-y-1">
                            <Label>Justificação (obrigatória)</Label>
                            <Textarea rows={4} value={riskDialog.justification} onChange={event => { setRiskError(''); setRiskDialog(prev => ({ ...prev, justification: event.target.value })); }} placeholder="Ex.: cliente com garantia hipotecária ainda não registada no sistema…" />
                            <p className="text-xs text-muted-foreground">Pelo menos 20 caracteres e 3 palavras, sem caracteres repetidos e diferente das suas justificações anteriores. Fica na auditoria com gravidade Alta.</p>
                            {riskError && <p className="text-xs font-semibold text-destructive">{riskError}</p>}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRiskDialog(prev => ({ ...prev, open: false }))}>Cancelar</Button>
                        <Button disabled={riskDialog.justification.trim().length < 20 || riskDialog.level === risk.level} onClick={() => void applyRiskOverride()}>Aplicar alteração</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Conversão em pedido de crédito */}
            <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Converter em pedido de crédito</DialogTitle>
                        <DialogDescription>O pedido fica pendente de aprovação na página Aprovações. A simulação passa ao estado «Convertida em pedido».</DialogDescription>
                    </DialogHeader>
                    {result?.valid && (
                        <dl className="divide-y rounded-xl border text-sm">
                            {[
                                ['Cliente', form.clientName], ['Produto', product.name], ['Montante', formatCurrency(form.principal)], ['Prazo', `${form.months} meses`],
                                ['Sistema', AMORTIZATION_LABELS[form.system]], ['TAN', formatPercent(annualRate)], ['Prestação', formatCurrency(result.installmentBase) + ' (sem encargos)'],
                                ['Total de juros', formatCurrency(result.totalInterest)], ['TAEG', result.taeg === null ? '—' : formatPercent(result.taeg)],
                            ].map(([label, value]) => <div key={label} className="flex justify-between gap-3 px-3 py-1.5"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>)}
                        </dl>
                    )}
                    <p className="text-xs text-muted-foreground">O plano do pedido usa o capital, a TAN e o sistema de amortização simulados. Comissões e Imposto do Selo são cobrados conforme o preçário no momento do desembolso.</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancelar</Button>
                        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={!!convertReason || busy === 'convert'} onClick={() => void convert()}>
                            {busy === 'convert' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar para aprovação
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Simulação inversa */}
            <Dialog open={inverseOpen} onOpenChange={setInverseOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-indigo-600" /> Simulação inversa</DialogTitle>
                        <DialogDescription>Indique a prestação mensal máxima que o cliente pode pagar. Calculamos o montante máximo para o prazo actual e o prazo mínimo para o montante actual, com a TAN e os encargos escolhidos.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <Label>Prestação mensal máxima (com encargos)</Label>
                            <CurrencyInput value={inverseTarget} onValueChange={setInverseTarget} />
                            {form.income > 0 && <p className="text-xs text-muted-foreground">Pela taxa de esforço de {formatPercent(config.effortLimit, 0)}: até {formatCurrency(Math.max(0, (config.effortLimit / 100) * form.income - form.otherDebts))} por mês.</p>}
                        </div>
                        {inverse && (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border p-3">
                                    <p className="text-xs text-muted-foreground">Montante máximo em {form.months} meses</p>
                                    <p className="text-lg font-black">{formatCurrency(inverse.withinProduct)}</p>
                                    {inverse.maxAmount > product.maxAmount && <p className="text-[11px] text-amber-600">Limitado ao máximo do produto.</p>}
                                    <Button size="sm" className="mt-2 w-full" disabled={inverse.withinProduct < product.minAmount} onClick={() => { set({ principal: inverse.withinProduct }); setInverseOpen(false); }}>Aplicar montante</Button>
                                </div>
                                <div className="rounded-xl border p-3">
                                    <p className="text-xs text-muted-foreground">Prazo mínimo para {form.principal ? formatCurrency(form.principal) : 'o montante actual'}</p>
                                    <p className="text-lg font-black">{inverse.minMonths ? `${inverse.minMonths} meses` : form.principal ? `Acima de ${product.maxMonths} meses` : '—'}</p>
                                    <Button size="sm" variant="outline" className="mt-2 w-full" disabled={!inverse.minMonths} onClick={() => { if (inverse.minMonths) set({ months: inverse.minMonths }); setInverseOpen(false); }}>Aplicar prazo</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <AlertModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={() => void confirmDelete()}
                showCancel
                title="Eliminar simulação?"
                description={deleteTarget ? `A simulação ${deleteTarget.reference} de ${deleteTarget.clientName} será eliminada do histórico. O código de verificação deixa de poder ser confirmado.` : ''}
                type="error"
            />
        </MainLayout>
    );
}

function GuiaSimulador({ config, onTerms }: { config: SimulatorConfig; onTerms: () => void }) {
    const items: Array<[string, string]> = [
        ['Produto', 'Escolha o produto: os limites de montante e prazo, a TAN, as comissões e o sistema de amortização vêm de Configurações › Simulador e Produtos.'],
        ['Montante e prazo', 'Use o cursor ou escreva o valor (ex.: 1000000 aparece como 1 000 000,00 Kz). O prazo é escolhido em meses, com atalhos de 6 a 60 meses.'],
        ['Datas e carência', 'A data de início é a do desembolso. As prestações vencem no dia escolhido (1 a 28); se calhar num fim-de-semana ou feriado, passa para o dia útil seguinte. A carência pode ser só de capital (paga juros) ou de capital e juros (juros capitalizados).'],
        ['TAN e TAEG', 'A TAN é a taxa anual nominal (a mensal é TAN ÷ 12). A TAEG junta juros, comissões, Imposto do Selo e seguros e é calculada pela TIR dos fluxos reais.'],
        ['Imposto do Selo', `${formatPercent(config.stampDuty.upToOneYear)} (até 1 ano), ${formatPercent(config.stampDuty.overOneYear)} (mais de 1 ano) ou ${formatPercent(config.stampDuty.fiveYearsOrMore)} (5 anos ou mais) sobre a utilização, e ${formatPercent(config.stampDuty.interest)} sobre os juros de cada prestação.`],
        ['Taxa de esforço e risco', `(nova prestação + outros encargos) ÷ rendimento líquido. Verde abaixo de 30%, amarelo até ${formatPercent(config.effortLimit, 0)}, vermelho acima. O risco é calculado automaticamente e pode ser alterado com justificação registada na auditoria.`],
        ['Ficha de Simulação', `PDF com número único, código de verificação e QR code, válido ${config.validityDays} dias, com o plano completo e uma página de termos e legislação.`],
        ['Converter em pedido', 'Só para clientes registados sem créditos por liquidar. O pedido segue para Aprovações e a simulação fica «Convertida em pedido».'],
    ];
    return (
        <Card>
            <CardHeader>
                <CardTitle>Guia do Simulador de Crédito</CardTitle>
                <CardDescription>Como usar o simulador e o que significa cada valor.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                    {items.map(([title, text], index) => (
                        <div key={title} className="flex gap-3 rounded-xl border bg-muted/20 p-4">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{index + 1}</span>
                            <div><p className="font-bold">{title}</p><p className="text-sm text-muted-foreground">{text}</p></div>
                        </div>
                    ))}
                </div>
                <Button variant="outline" className="gap-2" onClick={onTerms}>Ver Termos, Políticas e legislação aplicável</Button>
            </CardContent>
        </Card>
    );
}

export default SimuladorCredito;
