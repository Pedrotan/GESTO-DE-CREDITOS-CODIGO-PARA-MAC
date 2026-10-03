import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, FileDown, ListOrdered, User, Wallet } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { SearchableSelect } from '@/componentes/ui/SearchableSelect';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { CREDIT_DIALOG_CONTENT_CLASS, CREDIT_DIALOG_HEADER_CLASS } from '@/componentes/forms/credit-dialog-styles';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useToast } from '@/componentes/ui/use-toast';
import { formatCurrency } from '@/bibliotecas/formatters';
import { generatePaymentPlanPDF } from '@/bibliotecas/pdf';
import { buildPaymentPlan, planOptionsFromTiers, type PaymentPlan } from '@/bibliotecas/plano-pagamento';
import { tierPeriodLabel } from '@/bibliotecas/taxas-juro';
import { cn } from '@/bibliotecas/utils';
import type { Credit } from '@/tipos/credito';

// Mostra ao cliente como vai pagar: em quantas prestações, em quantos meses, quanto por mês e o total.
// Pode partir de um crédito já concedido ou de um valor novo comparando os prazos da tabela de taxas.

const NEW_SIMULATION = '__nova__';
const labelClass = 'text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300';
const today = () => new Date().toISOString().slice(0, 10);
const money = (minor: number) => formatCurrency(minor / 100);
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: 'numeric' });
const toMinor = (value: number) => Math.round((Number(value) || 0) * 100);
const creditPrincipalMinor = (credit: Credit) => credit.principalAmountMinor ?? toMinor(credit.principalAmount);
const isoDate = (value: Date | string | undefined) => {
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(date.getTime()) ? today() : date.toISOString().slice(0, 10);
};

interface PlanoPagamentoDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function PlanoPagamentoDialog({ open, onOpenChange }: PlanoPagamentoDialogProps) {
    const { clients, credits, interestTiers, companySettings } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    const [clientId, setClientId] = useState('');
    const [creditId, setCreditId] = useState(NEW_SIMULATION);
    const [amount, setAmount] = useState(0);
    const [startDate, setStartDate] = useState(today);
    const [selectedTierId, setSelectedTierId] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setClientId('');
        setCreditId(NEW_SIMULATION);
        setAmount(0);
        setStartDate(today());
        setSelectedTierId(null);
    }, [open]);

    const client = clients.find(item => item.id === clientId);
    const clientCredits = useMemo(() => credits
        .filter(credit => credit.clientId === clientId && !['cancelled', 'rejected'].includes(credit.status) && !credit.deletedAt)
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()), [credits, clientId]);
    const selectedCredit = clientCredits.find(credit => credit.id === creditId);

    // Ao escolher o cliente, abre o crédito mais recente dele (se tiver).
    const handleClientChange = (value: string) => {
        setClientId(value);
        const latest = credits
            .filter(credit => credit.clientId === value && !['cancelled', 'rejected'].includes(credit.status) && !credit.deletedAt)
            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];
        setCreditId(latest ? latest.id : NEW_SIMULATION);
        setSelectedTierId(null);
    };

    const creditPlan = useMemo<PaymentPlan | null>(() => {
        if (!selectedCredit) return null;
        try {
            return buildPaymentPlan({
                principalMinor: creditPrincipalMinor(selectedCredit),
                ratePercent: Number(selectedCredit.interestRate) || 0,
                months: Math.max(1, Number(selectedCredit.installments) || 1),
                startDate: isoDate(selectedCredit.startDate),
            });
        } catch {
            return null;
        }
    }, [selectedCredit]);

    const options = useMemo(() => {
        if (selectedCredit || toMinor(amount) <= 0) return [];
        try {
            return planOptionsFromTiers(toMinor(amount), interestTiers, startDate);
        } catch {
            return [];
        }
    }, [selectedCredit, amount, interestTiers, startDate]);

    const chosenOption = options.find(option => option.tier.id === selectedTierId) || options[0];
    const plan = creditPlan || chosenOption?.plan || null;
    const paidInstallments = selectedCredit ? Number(selectedCredit.paidInstallments) || 0 : 0;

    const exportPdf = () => {
        if (!plan || !client) return;
        try {
            generatePaymentPlanPDF({
                clientName: client.name,
                clientNif: client.nif,
                creditReference: selectedCredit ? `${selectedCredit.id} (${selectedCredit.creditNumber || 1}º crédito)` : undefined,
                plan,
                paidInstallments,
            }, companySettings, user?.name);
        } catch (error) {
            console.error('[PlanoPagamento] Falha ao gerar PDF:', error);
            toast({ title: 'Não foi possível gerar o PDF', variant: 'destructive' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={`${CREDIT_DIALOG_CONTENT_CLASS} max-w-4xl`}>
                <DialogHeader className={CREDIT_DIALOG_HEADER_CLASS}>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight text-white">
                        <ListOrdered className="h-5 w-5 text-secondary" />
                        Plano de Pagamento
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-white/75">
                        Escolha o cliente e veja em quantas prestações e meses vai pagar o crédito, e o valor total.
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-slate-50/70 p-4 md:p-6 dark:bg-slate-950/40">
                    {/* 1. Cliente e crédito */}
                    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <span className={cn(labelClass, 'flex items-center gap-1.5')}><User className="h-3.5 w-3.5 text-secondary" /> Cliente *</span>
                                <SearchableSelect
                                    options={clients.map(item => ({ value: item.id, label: item.name, subLabel: item.nif ? `NIF ${item.nif}` : undefined }))}
                                    value={clientId}
                                    onValueChange={handleClientChange}
                                    placeholder="Pesquisar cliente por nome..."
                                    searchPlaceholder="Digite o nome do cliente..."
                                />
                            </div>
                            <div className="space-y-1.5">
                                <span className={cn(labelClass, 'flex items-center gap-1.5')}><Wallet className="h-3.5 w-3.5 text-secondary" /> Crédito</span>
                                <select
                                    value={creditId}
                                    disabled={!clientId}
                                    onChange={event => { setCreditId(event.target.value); setSelectedTierId(null); }}
                                    aria-label="Crédito do cliente"
                                    className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950"
                                >
                                    {clientCredits.map(credit => (
                                        <option key={credit.id} value={credit.id}>
                                            {credit.creditNumber || 1}º crédito · {formatCurrency(credit.principalAmount)} · {credit.installments} meses · {dateLabel(isoDate(credit.startDate))}
                                        </option>
                                    ))}
                                    <option value={NEW_SIMULATION}>Novo valor (simular prazos)</option>
                                </select>
                            </div>
                        </div>

                        {clientId && !selectedCredit && (
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-1.5">
                                    <span className={labelClass}>Valor concedido (AOA) *</span>
                                    <CurrencyInput value={amount} onValueChange={value => setAmount(Number(value) || 0)}
                                        className="h-10 rounded-xl border-slate-200 font-mono text-base font-bold" />
                                    {client && client.availableCredit > 0 && toMinor(amount) > toMinor(client.availableCredit) && (
                                        <p className="text-xs font-semibold text-amber-600">Acima do crédito disponível do cliente ({formatCurrency(client.availableCredit)}).</p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <span className={cn(labelClass, 'flex items-center gap-1.5')}><CalendarDays className="h-3.5 w-3.5 text-secondary" /> Data do acordo</span>
                                    <Input type="date" value={startDate} onChange={event => event.target.value && setStartDate(event.target.value)}
                                        className="h-10 rounded-xl border-slate-200 font-mono" />
                                </div>
                            </div>
                        )}
                    </section>

                    {!clientId && (
                        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
                            Escolha um cliente para ver o plano de pagamento.
                        </p>
                    )}

                    {/* 2. Comparação de prazos (novo valor) */}
                    {options.length > 0 && (
                        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                            <h3 className={labelClass}>Escolha o prazo</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                                        <tr>
                                            <th className="py-2 pr-3">Prazo</th>
                                            <th className="py-2 pr-3 text-right">Taxa</th>
                                            <th className="py-2 pr-3 text-right">Prestação mensal</th>
                                            <th className="py-2 pr-3 text-right">Juros</th>
                                            <th className="py-2 text-right">Total a pagar</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {options.map(option => {
                                            const isSelected = option === chosenOption;
                                            return (
                                                <tr key={option.tier.id} onClick={() => setSelectedTierId(option.tier.id)}
                                                    className={cn('cursor-pointer border-t border-slate-100 transition-colors dark:border-slate-800',
                                                        isSelected ? 'bg-primary/10 font-bold text-primary dark:bg-primary/30 dark:text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60')}>
                                                    <td className="py-2.5 pr-3">
                                                        <span className="inline-flex items-center gap-1.5">
                                                            {isSelected && <CheckCircle2 className="h-4 w-4 text-secondary" />}
                                                            {option.plan.months} {option.plan.months === 1 ? 'prestação' : 'prestações'}
                                                            <span className="text-xs font-normal text-slate-500">({tierPeriodLabel(option.tier)})</span>
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 pr-3 text-right font-mono">{option.plan.ratePercent}%</td>
                                                    <td className="py-2.5 pr-3 text-right font-mono">{money(option.plan.installmentMinor)}</td>
                                                    <td className="py-2.5 pr-3 text-right font-mono">{money(option.plan.interestMinor)}</td>
                                                    <td className="py-2.5 text-right font-mono">{money(option.plan.totalMinor)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {/* 3. Resumo e calendário de prestações */}
                    {plan && client && (
                        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                            <div className="rounded-xl bg-primary px-4 py-3 text-primary-foreground">
                                <p className="text-sm">
                                    <strong>{client.name}</strong> vai pagar <strong>{money(plan.totalMinor)}</strong> em{' '}
                                    <strong>{plan.months} {plan.months === 1 ? 'prestação' : 'prestações'}</strong> mensais de{' '}
                                    <strong>{money(plan.installmentMinor)}</strong>, durante {plan.months} {plan.months === 1 ? 'mês' : 'meses'}
                                    {' '}(de {dateLabel(plan.firstDueDate)} a {dateLabel(plan.lastDueDate)}).
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                {[
                                    { label: 'Valor concedido', value: money(plan.principalMinor) },
                                    { label: `Juros (${plan.ratePercent}%)`, value: money(plan.interestMinor) },
                                    { label: 'Total a pagar', value: money(plan.totalMinor), highlight: true },
                                    { label: selectedCredit ? 'Prestações pagas' : 'Prestação mensal', value: selectedCredit ? `${Math.min(paidInstallments, plan.months)} de ${plan.months}` : money(plan.installmentMinor) },
                                ].map(item => (
                                    <div key={item.label} className={cn('rounded-xl border px-4 py-3', item.highlight ? 'border-primary/30 bg-primary/5 dark:bg-primary/20' : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950')}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{item.label}</p>
                                        <p className={cn('font-mono text-base font-black', item.highlight ? 'text-primary dark:text-secondary' : 'text-slate-900 dark:text-white')}>{item.value}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                                        <tr>
                                            <th className="py-2 pr-3">Nº</th>
                                            <th className="py-2 pr-3">Vencimento</th>
                                            <th className="py-2 pr-3 text-right">Capital</th>
                                            <th className="py-2 pr-3 text-right">Juros</th>
                                            <th className="py-2 pr-3 text-right">Prestação</th>
                                            <th className="py-2 pr-3 text-right">Saldo restante</th>
                                            {selectedCredit && <th className="py-2 text-right">Estado</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {plan.installments.map(item => {
                                            const isPaid = item.number <= paidInstallments;
                                            return (
                                                <tr key={item.number} className="border-t border-slate-100 dark:border-slate-800">
                                                    <td className="py-2 pr-3 font-bold">{item.number}</td>
                                                    <td className="py-2 pr-3">{dateLabel(item.dueDate)}</td>
                                                    <td className="py-2 pr-3 text-right font-mono">{money(item.principalMinor)}</td>
                                                    <td className="py-2 pr-3 text-right font-mono">{money(item.interestMinor)}</td>
                                                    <td className="py-2 pr-3 text-right font-mono font-bold">{money(item.totalMinor)}</td>
                                                    <td className="py-2 pr-3 text-right font-mono text-slate-500">{money(item.balanceAfterMinor)}</td>
                                                    {selectedCredit && (
                                                        <td className="py-2 text-right">
                                                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold',
                                                                isPaid ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
                                                                {isPaid ? 'Paga' : 'Por pagar'}
                                                            </span>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}
                </div>

                <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-4 py-4 md:px-6 dark:border-slate-800 dark:bg-slate-900">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}
                        className="h-11 rounded-xl border-slate-200 px-6 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                        Fechar
                    </Button>
                    <Button type="button" onClick={exportPdf} disabled={!plan || !client}
                        className="h-11 gap-2 rounded-xl bg-primary px-6 font-bold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90">
                        <FileDown className="h-4 w-4" /> Gerar PDF para o cliente
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
