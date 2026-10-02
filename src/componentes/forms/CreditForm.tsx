import { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useFormDraft } from '@/ganchos/usar-rascunho-formulario';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/componentes/ui/form';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/componentes/ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/componentes/ui/dialog';
import { Input } from '@/componentes/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/componentes/ui/select';
import { Credit, Client } from '@/tipos/credito';
import { formatCurrency } from '@/bibliotecas/formatters';
import { Calculator, Calendar, AlertTriangle, FileText, Landmark, CheckCircle2, Sparkles, User, TrendingUp, ShieldCheck, Plus } from 'lucide-react';
import { useToast } from '@/componentes/ui/use-toast';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { SearchableSelect } from '@/componentes/ui/SearchableSelect';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { generateContractPDF, generatePermanentTransferLetterPDF } from '@/bibliotecas/pdf';
import { ServicoCartasTransferencia } from '@/servicos/ServicoCartasTransferencia';
import { cn } from '@/bibliotecas/utils';

import { InterestTier, canManageInterestTiers, tierForMonths, tierMonths, tierPeriodLabel } from '@/bibliotecas/taxas-juro';
import { TabelaTaxasDialog } from '@/componentes/creditos/TabelaTaxasDialog';

const labelClass ='text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300';
const inputClass = 'h-10 rounded-xl border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-950';

interface FormSectionProps {
    step: number;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    description?: string;
    aside?: React.ReactNode;
    children: React.ReactNode;
}

const FormSection = ({ step, icon: Icon, title, description, aside, children }: FormSectionProps) => (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground shadow-xs">
                    {step}
                </div>
                <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                        <Icon className="h-4 w-4 shrink-0 text-secondary" />
                        {title}
                    </h3>
                    {description && <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>}
                </div>
            </div>
            {aside}
        </header>
        <div className="space-y-4 p-5">{children}</div>
    </section>
);

const calculateDueDate = (startDateStr: string, months: number): string => {
    if (!startDateStr) return '';
    try {
        const d = new Date(startDateStr + 'T00:00:00');
        if (isNaN(d.getTime())) return '';
        d.setMonth(d.getMonth() + months);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    } catch {
        return '';
    }
};

const creditSchema = z.object({
    clientId: z.string().min(1, 'Selecione um cliente'),
    principalAmount: z.coerce.number().min(1, 'Montante inválido'),
    interestRate: z.coerce.number().min(0, 'Taxa inválida'),
    lateInterestRate: z.coerce.number().min(0, 'Taxa por mora inválida'),
    installments: z.coerce.number().min(1, 'Número de prestações inválido'),
    startDate: z.string().min(1, 'Data de início obrigatória'),
    dueDate: z.string().min(1, 'Data de vencimento obrigatória'),
    status: z.enum(['active', 'overdue', 'paid', 'renegotiated', 'defaulted', 'pending_approval', 'rejected', 'cancelled']),
    creditNumber: z.number().optional(),
    targetMonthId: z.string().optional(),
});

type CreditFormValues = z.infer<typeof creditSchema>;

const limitConsumingCreditStatuses = new Set<Credit['status']>(['active', 'overdue', 'defaulted', 'renegotiated']);

interface CreditFormProps {
    onSubmit: (data: CreditFormValues) => void;
    initialData?: Credit;
    prefillData?: Partial<CreditFormValues>; // New prop for renewal/pre-fill
    clients: Client[];
    credits?: Credit[]; // New prop for history lookup
    onCancel: () => void;
    submitLabel?: string;
}

export function CreditForm({ onSubmit, initialData, prefillData, clients, credits, onCancel, submitLabel }: CreditFormProps) {
    const { toast } = useToast();
    const { companySettings, interestTiers } = useData();
    const { user } = useAuth();
    const [showLimitWarning, setShowLimitWarning] = useState(false);
    const [showReflectionModal, setShowReflectionModal] = useState(false);
    const [tempFormData, setTempFormData] = useState<CreditFormValues | null>(null);
    const [selectedReflectionMonth, setSelectedReflectionMonth] = useState('');
    const [isRatesDialogOpen, setIsRatesDialogOpen] = useState(false);
    const canEditRates = canManageInterestTiers(user?.role);

    const getReflectionMonthOptions = () => {
        const options = [];
        const now = new Date();
        const currentYear = now.getFullYear();
        const MONTH_NAMES = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        
        // Ano anterior (últimos 3 meses)
        for (let m = 9; m < 12; m++) {
            const monthVal = (m + 1).toString().padStart(2, '0');
            options.push({
                value: `${currentYear - 1}-${monthVal}`,
                label: `${MONTH_NAMES[m]} de ${currentYear - 1}`
            });
        }

        // Ano corrente (todos os 12 meses)
        for (let m = 0; m < 12; m++) {
            const monthVal = (m + 1).toString().padStart(2, '0');
            options.push({
                value: `${currentYear}-${monthVal}`,
                label: `${MONTH_NAMES[m]} de ${currentYear}`
            });
        }

        // Ano seguinte (todos os 12 meses)
        for (let m = 0; m < 12; m++) {
            const monthVal = (m + 1).toString().padStart(2, '0');
            options.push({
                value: `${currentYear + 1}-${monthVal}`,
                label: `${MONTH_NAMES[m]} de ${currentYear + 1}`
            });
        }

        return options;
    };

    const initialStartDate = (initialData?.startDate && !isNaN(new Date(initialData.startDate).getTime()))
        ? new Date(initialData.startDate).toISOString().split('T')[0]
        : (prefillData?.startDate || new Date().toISOString().split('T')[0]);

    const initialInstallments = initialData?.installments || prefillData?.installments || 1;

    // Tabela de taxas definida na página de Créditos (ou a tabela padrão).
    const defaultTierForInstallments = tierForMonths(interestTiers, initialInstallments) || interestTiers[0];

    const form = useForm<CreditFormValues>({
        resolver: zodResolver(creditSchema),
        defaultValues: initialData
            ? {
                clientId: initialData.clientId,
                principalAmount: initialData.principalAmount,
                interestRate: initialData.interestRate,
                lateInterestRate: initialData.lateInterestRate,
                installments: initialData.installments,
                startDate: initialStartDate,
                dueDate: (initialData.dueDate && !isNaN(new Date(initialData.dueDate).getTime()))
                    ? new Date(initialData.dueDate).toISOString().split('T')[0]
                    : calculateDueDate(initialStartDate, initialData.installments || 1),
                status: initialData.status as any,
            }
            : {
                clientId: prefillData?.clientId || '',
                principalAmount: prefillData?.principalAmount || 0,
                interestRate: prefillData?.interestRate !== undefined ? prefillData.interestRate : defaultTierForInstallments.rate,
                lateInterestRate: prefillData?.lateInterestRate !== undefined ? prefillData.lateInterestRate : 1,
                installments: initialInstallments,
                startDate: initialStartDate,
                dueDate: prefillData?.dueDate || calculateDueDate(initialStartDate, initialInstallments),
                status: 'active',
            },
    });

    const draftKey = initialData ? `credit_edit_${initialData.id}` : (prefillData?.clientId ? `credit_renew_${prefillData.clientId}` : 'credit_create');
    const { clearDraft } = useFormDraft<CreditFormValues>(draftKey, form);

    const watchedValues = useWatch({ control: form.control });
    const principal = Number(watchedValues.principalAmount || 0);
    const rate = Number(watchedValues.interestRate || 0);
    const instalments = Number(watchedValues.installments || 1);
    const selectedClientId = watchedValues.clientId;
    const currentStartDate = watchedValues.startDate || new Date().toISOString().split('T')[0];

    // Identifica o tier ativo atual
    const activeTier = tierForMonths(interestTiers, instalments);

    // Manipulador ao clicar em um escalão da Tabela de Taxas
    const handleSelectTier = (tier: InterestTier) => {
        const months = tierMonths(tier);
        form.setValue('installments', months, { shouldValidate: true, shouldDirty: true });
        form.setValue('interestRate', tier.rate, { shouldValidate: true, shouldDirty: true });
        const newDueDate = calculateDueDate(currentStartDate, months);
        if (newDueDate) {
            form.setValue('dueDate', newDueDate, { shouldValidate: true, shouldDirty: true });
        }
        toast({
            title: `Taxa de ${tier.rate}% Aplicada`,
            description: `Duração definida para ${months} ${months === 1 ? 'mês' : 'meses'}.`,
        });
    };

    // Atualização manual de meses
    const handleInstallmentsChange = (valStr: string) => {
        const months = Number(valStr);
        form.setValue('installments', months, { shouldValidate: true, shouldDirty: true });
        
        if (months > 0) {
            const tier = tierForMonths(interestTiers, months);

            if (tier) {
                form.setValue('interestRate', tier.rate, { shouldValidate: true });
            }
            const newDueDate = calculateDueDate(currentStartDate, months);
            if (newDueDate) {
                form.setValue('dueDate', newDueDate, { shouldValidate: true });
            }
        }
    };

    // Atualização manual da data de início / acordo
    const handleStartDateChange = (val: string) => {
        form.setValue('startDate', val, { shouldValidate: true, shouldDirty: true });
        if (instalments > 0 && val) {
            const newDueDate = calculateDueDate(val, instalments);
            if (newDueDate) {
                form.setValue('dueDate', newDueDate, { shouldValidate: true });
            }
        }
    };

    // Auto-fill effect: Prioritize client profile rates if specifically set, fallback to last credit
    useEffect(() => {
        if (!selectedClientId || initialData) return;

        const selectedClient = clients.find(c => c.id === selectedClientId);

        // PRIORITY 1: Use client-defined rates from profile if explicitly configured (> 0)
        if (selectedClient && selectedClient.defaultInterestRate > 0) {
            form.setValue('interestRate', selectedClient.defaultInterestRate);
            form.setValue('lateInterestRate', selectedClient.lateInterestRate || 1);
            toast({
                title: "Taxas do Perfil Aplicadas",
                description: `Taxa personalizada de ${selectedClient.defaultInterestRate}% aplicada para ${selectedClient.name}`,
            });
            return;
        }

        // PRIORITY 2: If client has previous credits, suggest standard
        if (credits) {
            const lastCredit = credits
                .filter(c => c.clientId === selectedClientId)
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

            if (lastCredit && lastCredit.interestRate > 0 && form.getValues().interestRate === 0) {
                form.setValue('interestRate', lastCredit.interestRate);
                form.setValue('lateInterestRate', lastCredit.lateInterestRate);
                form.setValue('installments', lastCredit.installments);
            }
        }
    }, [selectedClientId, clients, credits, initialData, form, toast]);

    const totalInterest = (principal * rate) / 100;
    const totalToReturn = principal + totalInterest;
    const valuePerInstallment = instalments > 0 ? (totalToReturn / instalments) : totalToReturn;

    // Dados de avaliação do cliente selecionado
    const selectedClient = clients.find(c => c.id === selectedClientId);
    const clientNif = selectedClient?.nif || 'Não informado';
    const clientBi = (selectedClient as any)?.bi || selectedClient?.nif || 'Não informado';
    const monthlyIncome = Number(selectedClient?.monthlyIncome || 0);

    const clientActiveCredits = credits?.filter(
        cr => cr.clientId === selectedClientId && limitConsumingCreditStatuses.has(cr.status) && (Number(cr.currentBalance) || 0) > 0.1
    ) || [];

    const currentMonthlyAmortizations = clientActiveCredits.reduce((acc, cr) => {
        const inst = Math.max(Number(cr.installments) || 1, 1);
        const balance = Number(cr.totalDue || cr.currentBalance || 0);
        return acc + Math.round(balance / inst);
    }, 0);

    const newInstallment = valuePerInstallment;
    const totalProjectedCommitment = currentMonthlyAmortizations + newInstallment;

    // Taxa de Esforço Projectada
    const effortRate = monthlyIncome > 0
        ? (totalProjectedCommitment / monthlyIncome) * 100
        : (selectedClient?.creditLimit && selectedClient.creditLimit > 0 ? (totalProjectedCommitment / selectedClient.creditLimit) * 100 : 30);

    const effortVerdict = effortRate <= 35
        ? { label: 'Operação recomendada — taxa de esforço dentro de limites conservadores.', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' }
        : effortRate <= 50
            ? { label: 'Atenção — taxa de esforço elevada. Avalie garantias adicionais.', className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' }
            : { label: 'Risco alto — a prestação compromete grande parte do rendimento.', className: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' };

    const handleError = (errors: any) => {
        console.error("Validation Errors:", errors);
        const firstError = Object.values(errors)[0] as any;
        toast({
            title: "Erro de Validação",
            description: firstError?.message || "Verifique os campos obrigatórios.",
            variant: "destructive"
        });
    };

    const handleSubmit = (data: CreditFormValues) => {
        const client = clients.find(c => c.id === data.clientId);
        if (client && data.principalAmount > client.availableCredit && !initialData) {
            setShowLimitWarning(true);
            return;
        }
        
        if (!initialData) {
            setTempFormData(data);
            const defaultMonth = data.startDate ? data.startDate.substring(0, 7) : new Date().toISOString().substring(0, 7);
            setSelectedReflectionMonth(defaultMonth);
            setShowReflectionModal(true);
        } else {
            clearDraft();
            onSubmit({
                ...data,
                targetMonthId: initialData.targetMonthId
            } as any);
        }
    };

    // Gerar Minuta (Rascunho do Contrato)
    const handleGenerateDraft = () => {
        if (!selectedClient) {
            toast({
                title: "Selecione um cliente",
                description: "É necessário selecionar um cliente primeiro para gerar a minuta.",
                variant: "destructive"
            });
            return;
        }
        const currentVals = form.getValues();
        const mockCredit: any = {
            id: initialData?.id || `MINUTA-${Date.now().toString().slice(-4)}`,
            clientId: selectedClient.id,
            clientName: selectedClient.name,
            principalAmount: principal || 100000,
            currentBalance: totalToReturn || 100000,
            interestRate: rate,
            lateInterestRate: currentVals.lateInterestRate || 1,
            installments: instalments || 1,
            startDate: currentVals.startDate || new Date().toISOString().split('T')[0],
            dueDate: currentVals.dueDate || new Date().toISOString().split('T')[0],
            status: 'pending_approval',
            totalDue: totalToReturn || 100000,
            createdAt: new Date().toISOString()
        };

        try {
            generateContractPDF(mockCredit, companySettings, [], 'save', user?.name);
            toast({
                title: "Minuta Gerada",
                description: "Rascunho de contrato baixado em PDF com sucesso.",
            });
        } catch (err) {
            console.error("Erro ao gerar minuta:", err);
            toast({
                title: "Erro ao gerar minuta",
                description: "Não foi possível gerar a minuta em PDF.",
                variant: "destructive"
            });
        }
    };

    // Gerar Carta de Transferência Bancária
    const handleGenerateBankLetter = () => {
        if (!selectedClient) {
            toast({
                title: "Selecione um cliente",
                description: "É necessário selecionar um cliente primeiro para gerar a carta bancária.",
                variant: "destructive"
            });
            return;
        }
        const currentVals = form.getValues();
        const mockCredit: any = {
            id: initialData?.id || `CRED-${Date.now().toString().slice(-4)}`,
            clientId: selectedClient.id,
            clientName: selectedClient.name,
            principalAmount: principal || 100000,
            totalDue: totalToReturn || 100000,
            installments: instalments || 1,
            installmentAmount: valuePerInstallment || 100000,
            startDate: currentVals.startDate || new Date().toISOString().split('T')[0],
            dueDate: currentVals.dueDate || new Date().toISOString().split('T')[0],
        };

        try {
            const letterTemplate = ServicoCartasTransferencia.getDefaultLetterTemplate(selectedClient, mockCredit, companySettings);
            const letterData: any = {
                ...letterTemplate,
                clientId: selectedClient.id,
                clientName: selectedClient.name,
                clientNif: selectedClient.nif || 'Não informado',
                clientPhone: selectedClient.phone || '',
                clientBank: ServicoCartasTransferencia.resolveClientBank(selectedClient),
                clientIban: ServicoCartasTransferencia.resolveClientIBAN(selectedClient),
                companyName: companySettings?.name || 'Tango Créditos, Lda.',
                companyIban: (companySettings as any)?.bankDetails?.iban || (companySettings as any)?.iban || 'AO06.0000.0000.0000.0000.0000.0',
                companyBank: (companySettings as any)?.bankDetails?.bankName || 'Banco Comercial',
                installmentAmount: valuePerInstallment,
                creditReference: mockCredit.id,
                startDate: currentVals.startDate,
                endDate: currentVals.dueDate,
                dayOfMonth: 28,
                createdAt: new Date().toISOString()
            };

            generatePermanentTransferLetterPDF(letterData, companySettings, user?.name || 'Operador');
            toast({
                title: "Carta de Transferência Gerada",
                description: "A carta bancária para ordem de transferência foi emitida em PDF.",
            });
        } catch (err) {
            console.error("Erro ao gerar carta bancária:", err);
            toast({
                title: "Erro ao gerar carta",
                description: "Não foi possível emitir a carta bancária.",
                variant: "destructive"
            });
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit, handleError)} className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-slate-50/70 p-4 md:p-6 dark:bg-slate-950/40">
                    {/* 1. Cliente */}
                    <FormSection step={1} icon={User} title="Cliente Solicitante" description="Selecione o beneficiário do crédito.">
                        <FormField
                            control={form.control}
                            name="clientId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className={labelClass}>Cliente *</FormLabel>
                                    <FormControl>
                                        <SearchableSelect
                                            options={clients.map(c => {
                                                const clientCredits = credits?.filter(cr => cr.clientId === c.id && cr.status !== 'cancelled' && cr.status !== 'rejected') || [];
                                                const activeCredit = clientCredits.find(cr => limitConsumingCreditStatuses.has(cr.status) && (Number(cr.currentBalance) || 0) > 0.1);
                                                const cycle = clientCredits.length + 1;

                                                return {
                                                    value: c.id,
                                                    label: c.name,
                                                    disabled: c.availableCredit <= 0 && !initialData,
                                                    subLabel: activeCredit
                                                        ? `⚠️ Possui crédito ${activeCredit.status === 'overdue' ? 'VENCIDO' : 'ACTIVO'} - Disp: ${formatCurrency(c.availableCredit)}`
                                                        : `${cycle}º Crédito - Disponível: ${formatCurrency(c.availableCredit)}`
                                                };
                                            })}
                                            value={field.value}
                                            onValueChange={(val) => {
                                                field.onChange(val);
                                                const clientCredits = credits?.filter(cr => cr.clientId === val && cr.status !== 'cancelled' && cr.status !== 'rejected') || [];
                                                form.setValue('creditNumber', clientCredits.length + 1);
                                            }}
                                            disabled={!!initialData}
                                            placeholder="Pesquisar cliente por nome..."
                                            searchPlaceholder="Digite o nome do cliente..."
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {selectedClient && (() => {
                            const clientCredits = credits?.filter(cr => cr.clientId === selectedClient.id && cr.status !== 'cancelled' && cr.status !== 'rejected') || [];
                            const cycle = initialData?.creditNumber || clientCredits.length + 1;
                            const ratio = selectedClient.creditLimit > 0 ? (selectedClient.availableCredit / selectedClient.creditLimit) : 0;
                            const availableClass = ratio <= 0
                                ? 'text-red-600 dark:text-red-400'
                                : ratio <= 0.2 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';

                            return (
                                <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1 duration-200 sm:grid-cols-4">
                                    {[
                                        { label: 'Ciclo', value: `${cycle}º crédito`, className: 'text-secondary' },
                                        { label: 'Limite total', value: formatCurrency(selectedClient.creditLimit), className: 'text-slate-900 dark:text-white' },
                                        { label: 'Utilizado', value: formatCurrency(selectedClient.usedCredit), className: 'text-slate-900 dark:text-white' },
                                        { label: 'Disponível', value: formatCurrency(selectedClient.availableCredit), className: availableClass },
                                    ].map(item => (
                                        <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{item.label}</p>
                                            <p className={cn('truncate font-mono text-sm font-bold', item.className)}>{item.value}</p>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                    </FormSection>

                    {/* 2. Condições do crédito */}
                    <FormSection step={2} icon={Calculator} title="Condições do Crédito" description="Escolha um prazo da tabela ou ajuste os valores manualmente.">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="principalAmount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={labelClass}>Montante do Capital (AOA) *</FormLabel>
                                        <FormControl>
                                            <CurrencyInput
                                                value={field.value}
                                                onValueChange={field.onChange}
                                                className={cn(inputClass, 'font-mono text-base font-bold')}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="interestRate"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={labelClass}>Taxa de Juros *</FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    type="number"
                                                    step="0.1"
                                                    className={cn(inputClass, 'pr-10 font-mono text-base font-bold')}
                                                    {...field}
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">%</span>
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Tabela de taxas por prazo (definida na página de Créditos) */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className={cn(labelClass, 'flex items-center gap-1.5')}>
                                    <Sparkles className="h-3.5 w-3.5 text-secondary" />
                                    Tabela de Taxas por Prazo
                                </span>
                                {canEditRates ? (
                                    <button
                                        type="button"
                                        onClick={() => setIsRatesDialogOpen(true)}
                                        className="flex h-8 items-center gap-1.5 rounded-lg border border-primary/30 bg-white px-3 text-xs font-bold text-primary shadow-xs hover:bg-primary/5 dark:bg-slate-950 dark:text-secondary dark:hover:bg-primary/20"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        Cadastrar Taxas
                                    </button>
                                ) : (
                                    <span className="text-[11px] text-slate-500">Toque num prazo para aplicar a taxa</span>
                                )}
                            </div>
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
                                {interestTiers.map(tier => {
                                    const isSelected = activeTier?.id === tier.id;
                                    return (
                                        <button
                                            key={tier.id}
                                            type="button"
                                            onClick={() => handleSelectTier(tier)}
                                            aria-pressed={isSelected}
                                            className={cn(
                                                'flex flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                                                isSelected
                                                    ? 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20 ring-2 ring-secondary/60'
                                                    : 'border-slate-200 bg-white text-slate-700 hover:border-primary/50 hover:bg-primary/5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-primary/20'
                                            )}
                                        >
                                            <span className={cn('text-[11px] font-semibold', isSelected ? 'text-primary-foreground/80' : 'text-slate-500 dark:text-slate-400')}>
                                                {tierPeriodLabel(tier)}
                                            </span>
                                            <span className="font-mono text-base font-black">{tier.rate}%</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="installments"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={labelClass}>Duração (Meses) *</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                min="1"
                                                className={cn(inputClass, 'font-mono font-bold')}
                                                value={field.value}
                                                onChange={(e) => handleInstallmentsChange(e.target.value)}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="lateInterestRate"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={labelClass}>Taxa de Mora Diária</FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input type="number" step="0.1" className={cn(inputClass, 'pr-10 font-mono font-bold')} {...field} />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">%</span>
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="startDate"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={cn(labelClass, 'flex items-center gap-1.5')}>
                                            <Calendar className="h-3.5 w-3.5 text-secondary" />
                                            Data do Acordo *
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="date"
                                                className={cn(inputClass, 'font-mono')}
                                                value={field.value}
                                                onChange={(e) => handleStartDateChange(e.target.value)}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="dueDate"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={cn(labelClass, 'flex items-center gap-1.5')}>
                                            <Calendar className="h-3.5 w-3.5 text-secondary" />
                                            Data de Vencimento *
                                        </FormLabel>
                                        <FormControl>
                                            <Input type="date" className={cn(inputClass, 'font-mono')} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </FormSection>

                    {/* 3. Resumo */}
                    <FormSection step={3} icon={TrendingUp} title="Plano de Liquidação" description="Valores projectados com as condições acima.">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Juros ({rate}%)</p>
                                <p className="font-mono text-base font-bold text-slate-900 dark:text-white">+ {formatCurrency(totalInterest)}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total a Devolver</p>
                                <p className="font-mono text-base font-bold text-slate-900 dark:text-white">{formatCurrency(totalToReturn)}</p>
                            </div>
                            <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 dark:bg-primary/20">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-primary dark:text-secondary">Mensalidade Estimada</p>
                                <p className="font-mono text-base font-black text-primary dark:text-secondary">
                                    {formatCurrency(valuePerInstallment)} <span className="text-xs font-normal text-slate-500">/ mês</span>
                                </p>
                            </div>
                        </div>

                        {selectedClient && (
                            <div className="space-y-2 rounded-xl border border-slate-200 p-4 text-xs dark:border-slate-800">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className={cn(labelClass, 'flex items-center gap-1.5')}>
                                        <ShieldCheck className="h-3.5 w-3.5 text-secondary" />
                                        Avaliação de Risco e Capacidade
                                    </span>
                                    <span className="font-mono text-[11px] text-slate-500">NIF: {clientNif} · BI: {clientBi}</span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300">
                                    <span>Rendimento: <strong className="font-mono text-slate-900 dark:text-white">{monthlyIncome > 0 ? formatCurrency(monthlyIncome) : 'Não informado'}</strong></span>
                                    <span>Amortizações activas: <strong className="font-mono text-slate-900 dark:text-white">{formatCurrency(currentMonthlyAmortizations)}</strong></span>
                                    <span>Compromisso mensal projectado: <strong className="font-mono text-slate-900 dark:text-white">{formatCurrency(totalProjectedCommitment)}</strong></span>
                                </div>
                                <div className={cn('flex items-center justify-between gap-3 rounded-lg px-3 py-2 font-semibold', effortVerdict.className)}>
                                    <span>{effortVerdict.label}</span>
                                    <span className="font-mono text-sm font-black">{effortRate.toFixed(1)}%</span>
                                </div>
                            </div>
                        )}

                        {!initialData && (
                            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                <p className="leading-relaxed">
                                    O crédito será submetido como <strong>proposta pendente</strong>. A validação e o desembolso do capital dependem da aprovação do Administrador.
                                </p>
                            </div>
                        )}
                    </FormSection>
                </div>

                {/* Rodapé fixo com as acções */}
                <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-white px-4 py-4 shadow-lg sm:flex-row sm:items-center sm:justify-between md:px-6 dark:border-slate-800 dark:bg-slate-900">
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleGenerateDraft}
                            className="h-10 gap-1.5 rounded-xl border-slate-200 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                            disabled={!selectedClientId}
                        >
                            <FileText className="h-4 w-4" />
                            Gerar Minuta
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleGenerateBankLetter}
                            className="h-10 gap-1.5 rounded-xl border-slate-200 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                            disabled={!selectedClientId}
                        >
                            <Landmark className="h-4 w-4" />
                            Carta de Transferência
                        </Button>
                    </div>

                    <div className="flex w-full items-center gap-3 sm:w-auto sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCancel}
                            className="h-11 shrink-0 rounded-xl border-slate-200 px-4 font-semibold sm:px-6 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200"
                            disabled={form.formState.isSubmitting}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            className="h-11 min-w-0 flex-1 gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 sm:flex-none sm:px-6"
                            disabled={form.formState.isSubmitting}
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            {form.formState.isSubmitting ? 'A processar...' : (initialData ? 'Actualizar' : (submitLabel || 'Solicitar Homologação'))}
                        </Button>
                    </div>
                </div>
            </form>

            {canEditRates && <TabelaTaxasDialog open={isRatesDialogOpen} onOpenChange={setIsRatesDialogOpen} />}

            <AlertDialog open={showLimitWarning} onOpenChange={setShowLimitWarning}>
                <AlertDialogContent className="border-danger/20">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-danger">
                            <AlertTriangle className="h-5 w-5" />
                            Limite Excedido
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-base text-foreground pt-2">
                            O crédito solicitado ultrapassa o valor limite permitido para este cliente.
                            <br /><br />
                            Caso necessite de mais, vá ao perfil do cliente, clique em <strong>Editar</strong> e aumente o <strong>Plafom/Limite de Crédito</strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-4">
                        <Button variant="ghost" onClick={() => setShowLimitWarning(false)}>
                            Cancelar e Corrigir
                        </Button>
                        <Button variant="destructive" onClick={() => {
                            setShowLimitWarning(false);
                        }}>
                            Entendi
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={showReflectionModal} onOpenChange={setShowReflectionModal}>
                <DialogContent className="max-w-md border-primary/20">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-primary" />
                            Mês de Reflexão Financeira
                        </DialogTitle>
                        <DialogDescription className="text-white/80">
                            Selecione o mês/ano onde este crédito, o seu capital aplicado e os pagamentos devem refletir nos cartões estatísticos e folhas mensais.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2 text-foreground">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-muted-foreground uppercase">Mês de Competência</label>
                            <Select value={selectedReflectionMonth} onValueChange={setSelectedReflectionMonth}>
                                <SelectTrigger className="h-11">
                                    <SelectValue placeholder="Selecione o mês" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {getReflectionMonthOptions().map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                Nota: Por padrão, o sistema sugere o mês de início do crédito ({tempFormData?.startDate ? new Date(tempFormData.startDate + 'T00:00:00').toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' }) : ''}). Pode alterar se o recebimento for previsto para outro mês.
                            </p>
                        </div>
                    </div>
                    <DialogFooter className="mt-4 flex gap-2">
                        <Button type="button" variant="ghost" onClick={() => setShowReflectionModal(false)}>
                            Voltar
                        </Button>
                        <Button type="button" onClick={() => {
                            if (tempFormData) {
                                clearDraft();
                                onSubmit({
                                    ...tempFormData,
                                    targetMonthId: selectedReflectionMonth
                                });
                            }
                            setShowReflectionModal(false);
                        }}>
                            Confirmar Mês
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Form>
    );
}
