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
import { Info, Calculator, Calendar, AlertTriangle, FileText, Landmark, CheckCircle2, Sparkles } from 'lucide-react';
import { useToast } from '@/componentes/ui/use-toast';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { SearchableSelect } from '@/componentes/ui/SearchableSelect';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { generateContractPDF, generatePermanentTransferLetterPDF } from '@/bibliotecas/pdf';
import { ServicoCartasTransferencia } from '@/servicos/ServicoCartasTransferencia';
import { cn } from '@/bibliotecas/utils';

export interface StandardInterestTier {
    id: string;
    label: string;
    months: number;
    minMonths: number;
    maxMonths: number;
    rate: number;
}

export const DEFAULT_STANDARD_INTEREST_TIERS: StandardInterestTier[] = [
    { id: '1m', label: '1 Mês (35%)', months: 1, minMonths: 1, maxMonths: 1, rate: 35 },
    { id: '2m', label: '2 Meses (50%)', months: 2, minMonths: 2, maxMonths: 2, rate: 50 },
    { id: '3m', label: '3 Meses (60%)', months: 3, minMonths: 3, maxMonths: 3, rate: 60 },
    { id: '4-5m', label: '4-5 Meses (70%)', months: 5, minMonths: 4, maxMonths: 5, rate: 70 },
    { id: '6-8m', label: '6-8 Meses (80%)', months: 6, minMonths: 6, maxMonths: 8, rate: 80 },
    { id: '9-10m', label: '9-10 M. (100%)', months: 10, minMonths: 9, maxMonths: 10, rate: 100 },
];

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
    const { companySettings } = useData();
    const { user } = useAuth();
    const [showLimitWarning, setShowLimitWarning] = useState(false);
    const [showReflectionModal, setShowReflectionModal] = useState(false);
    const [tempFormData, setTempFormData] = useState<CreditFormValues | null>(null);
    const [selectedReflectionMonth, setSelectedReflectionMonth] = useState('');

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

    // Obtém a taxa padrão inicial baseada no número de parcelas
    const defaultTierForInstallments = DEFAULT_STANDARD_INTEREST_TIERS.find(
        t => initialInstallments >= t.minMonths && initialInstallments <= t.maxMonths
    ) || (initialInstallments >= 10 ? DEFAULT_STANDARD_INTEREST_TIERS[DEFAULT_STANDARD_INTEREST_TIERS.length - 1] : DEFAULT_STANDARD_INTEREST_TIERS[0]);

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
    const activeTier = DEFAULT_STANDARD_INTEREST_TIERS.find(
        t => (instalments >= t.minMonths && instalments <= t.maxMonths)
    ) || (instalments >= 10 ? DEFAULT_STANDARD_INTEREST_TIERS[DEFAULT_STANDARD_INTEREST_TIERS.length - 1] : undefined);

    // Manipulador ao clicar em um mês na Tabela Automática de Taxas
    const handleSelectTier = (tier: StandardInterestTier) => {
        form.setValue('installments', tier.months, { shouldValidate: true, shouldDirty: true });
        form.setValue('interestRate', tier.rate, { shouldValidate: true, shouldDirty: true });
        const newDueDate = calculateDueDate(currentStartDate, tier.months);
        if (newDueDate) {
            form.setValue('dueDate', newDueDate, { shouldValidate: true, shouldDirty: true });
        }
        toast({
            title: `Taxa de ${tier.rate}% Aplicada`,
            description: `Duração definida para ${tier.label.split(' ')[0]} ${tier.label.split(' ')[1] || ''}.`,
        });
    };

    // Atualização manual de meses
    const handleInstallmentsChange = (valStr: string) => {
        const months = Number(valStr);
        form.setValue('installments', months, { shouldValidate: true, shouldDirty: true });
        
        if (months > 0) {
            const tier = DEFAULT_STANDARD_INTEREST_TIERS.find(t => months >= t.minMonths && months <= t.maxMonths)
                || (months >= 10 ? DEFAULT_STANDARD_INTEREST_TIERS[DEFAULT_STANDARD_INTEREST_TIERS.length - 1] : undefined);
            
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
            <form onSubmit={form.handleSubmit(handleSubmit, handleError)} className="space-y-4">
                {/* 1. Cliente Solicitante */}
                <FormField
                    control={form.control}
                    name="clientId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                                Cliente Solicitante *
                                <span className="text-xs font-normal text-muted-foreground">(Selecione o beneficiário)</span>
                            </FormLabel>
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
                            {selectedClientId && (
                                <div className="mt-1 flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                    {clients.find(c => c.id === selectedClientId) && (() => {
                                        const client = clients.find(c => c.id === selectedClientId)!;
                                        const clientCredits = credits?.filter(cr => cr.clientId === selectedClientId && cr.status !== 'cancelled' && cr.status !== 'rejected') || [];
                                        const cycle = initialData?.creditNumber || clientCredits.length + 1;
                                        const ratio = client.creditLimit > 0 ? (client.availableCredit / client.creditLimit) : 0;
                                        let variant: 'success' | 'warning' | 'destructive' = 'success';
                                        if (ratio <= 0) variant = 'destructive';
                                        else if (ratio <= 0.2) variant = 'warning';

                                        return (
                                            <div className="flex flex-wrap items-center gap-2 p-2 bg-muted/40 rounded-lg border w-full text-xs">
                                                <Badge variant="secondary" className="px-2 py-0.5 text-[11px] font-bold bg-primary/10 text-primary border-primary/20">
                                                    {cycle}º Ciclo de Crédito
                                                </Badge>
                                                <span className="text-[10px] text-muted-foreground">Limite:</span>
                                                <Badge variant="outline" className="text-[10px] h-5">Total: {formatCurrency(client.creditLimit)}</Badge>
                                                <Badge variant="outline" className="text-[10px] h-5">Usado: {formatCurrency(client.usedCredit)}</Badge>
                                                <Badge variant={variant} className="text-[10px] h-5 font-bold">Disp: {formatCurrency(client.availableCredit)}</Badge>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </FormItem>
                    )}
                />

                {/* 2. Montante do Capital e Taxa de Juros (Layout conforme imagem) */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="principalAmount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="font-bold text-slate-800 dark:text-slate-100">Montante do Capital (AOA) *</FormLabel>
                                <FormControl>
                                    <CurrencyInput
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        className="h-11 font-mono text-base font-bold"
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
                                <FormLabel className="font-bold text-slate-800 dark:text-slate-100">Taxa de Juros (%) *</FormLabel>
                                <FormControl>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            step="0.1"
                                            className="h-11 pr-10 font-mono text-base font-bold"
                                            {...field}
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">%</span>
                                    </div>
                                </FormControl>
                                <p className="text-[11px] text-muted-foreground mt-1">Calculada automaticamente pelo prazo.</p>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* 3. TABELA AUTOMÁTICA DE TAXAS DE JUROS (Conforme imagem) */}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/10 p-3 space-y-2">
                    <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        TABELA AUTOMÁTICA DE TAXAS DE JUROS
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {DEFAULT_STANDARD_INTEREST_TIERS.map(tier => {
                            const isSelected = activeTier?.id === tier.id;
                            return (
                                <button
                                    key={tier.id}
                                    type="button"
                                    onClick={() => handleSelectTier(tier)}
                                    className={cn(
                                        "py-2 px-3 rounded-lg text-xs font-bold transition-all text-center border shadow-xs flex items-center justify-center cursor-pointer",
                                        isSelected
                                            ? "bg-[#f97316] text-white border-orange-600 ring-2 ring-orange-400/40 font-bold"
                                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-orange-400 hover:bg-orange-50/50 dark:hover:bg-orange-950/20"
                                    )}
                                >
                                    {tier.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 4. Duração do Contrato e Data do Acordo (Conforme imagem) */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="installments"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="font-bold text-slate-800 dark:text-slate-100">Duração do Contrato (Meses) *</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        min="1"
                                        className="h-11 font-mono text-base font-bold"
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
                        name="startDate"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    Data do Acordo *
                                </FormLabel>
                                <FormControl>
                                    <Input
                                        type="date"
                                        className="h-11 font-mono"
                                        value={field.value}
                                        onChange={(e) => handleStartDateChange(e.target.value)}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* Vencimento e Taxa de Mora */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="dueDate"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                    Data de Vencimento
                                </FormLabel>
                                <FormControl>
                                    <Input type="date" className="h-9 font-mono text-xs" {...field} />
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
                                <FormLabel className="text-xs font-semibold text-slate-600 dark:text-slate-300">Taxa de Mora diária (%)</FormLabel>
                                <FormControl>
                                    <div className="relative">
                                        <Input type="number" step="0.1" className="h-9 pr-8 font-mono text-xs" {...field} />
                                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium">%</span>
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* 5. AVALIAÇÃO DE RISCO E CAPACIDADE (Conforme imagem) */}
                {selectedClient && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 space-y-2 text-xs">
                        <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
                            <span>📊</span> AVALIAÇÃO DE RISCO E CAPACIDADE | NIF: <span className="font-mono text-primary font-bold">{clientNif}</span> | BI: <span className="font-mono text-primary font-bold">{clientBi}</span>
                        </div>
                        <div className="text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-3 gap-y-1 text-[11px] pt-1 border-t border-emerald-200/50 dark:border-emerald-800/40">
                            <span>Rendimento: <strong className="font-mono text-slate-900 dark:text-white">{monthlyIncome > 0 ? formatCurrency(monthlyIncome) : '1 200 000 AOA'}</strong></span>
                            <span>|</span>
                            <span>Amortizações Activas: <strong className="font-mono text-slate-900 dark:text-white">{formatCurrency(currentMonthlyAmortizations)}</strong></span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">
                            A nova prestação de <strong className="font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(newInstallment)}</strong> elevará o compromisso mensal para <strong className="font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(totalProjectedCommitment)}</strong>.
                        </p>
                        <div className="flex items-center justify-between pt-1 border-t border-emerald-200/50 dark:border-emerald-800/40">
                            <span className="text-[11px] text-slate-600 dark:text-slate-400">Nova Taxa de Esforço Projectada:</span>
                            <span className="font-bold font-mono text-sm text-slate-900 dark:text-white">{effortRate.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            <span>☑</span> Operação recomendada. Taxa dentro de limites conservadores (Margem Excelente).
                        </div>
                    </div>
                )}

                {/* 6. PLANO DE LIQUIDAÇÃO PROJECTADO (Conforme imagem) */}
                <div className="rounded-xl border-2 border-orange-400/50 bg-orange-50/20 dark:bg-orange-950/10 p-4 space-y-2.5">
                    <div className="text-xs font-black text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                        PLANO DE LIQUIDAÇÃO PROJECTADO:
                    </div>
                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                            <span>Juros Prorratados ({rate}%):</span>
                            <span className="font-bold font-mono text-slate-900 dark:text-white">+ {formatCurrency(totalInterest)}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                            <span>Valor Total com Juros:</span>
                            <span className="font-bold font-mono text-base text-slate-900 dark:text-white">{formatCurrency(totalToReturn)}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-2 border-t border-orange-200/60 dark:border-orange-900/40 gap-1">
                            <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">Mensalidade Média Estimada:</span>
                            <span className="font-black text-base md:text-lg text-orange-600 dark:text-orange-400 font-mono">
                                {formatCurrency(valuePerInstallment)} <span className="text-xs font-normal text-slate-500">/ mês</span>
                            </span>
                        </div>
                    </div>
                </div>

                {/* 7. Aviso Operador Técnico (Conforme imagem) */}
                <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 p-3 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <div className="font-bold text-amber-800 dark:text-amber-300 mb-0.5 text-xs">Aviso Operador Técnico</div>
                        <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300/80">
                            Esta apólice será submetida como uma proposta pendente. A validação e o desembolso final de capital dependem da chancela oficial do Administrador.
                        </p>
                    </div>
                </div>

                {/* 8. Botões de Acção (Conforme imagem) */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleGenerateDraft}
                            className="h-10 text-xs gap-1.5 text-slate-700 dark:text-slate-200 border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                            disabled={!selectedClientId}
                        >
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            Gerar Minuta (Rascunho)
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleGenerateBankLetter}
                            className="h-10 text-xs gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/20 dark:border-blue-800"
                            disabled={!selectedClientId}
                        >
                            <Landmark className="h-4 w-4 text-blue-600" />
                            Carta de Transferência (Banco)
                        </Button>
                    </div>

                    <div className="flex items-center gap-2 justify-end">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onCancel}
                            className="h-10 px-5 text-sm"
                            disabled={form.formState.isSubmitting}
                        >
                            Regressar
                        </Button>
                        <Button
                            type="submit"
                            className="h-10 px-6 min-w-[170px] bg-[#f97316] hover:bg-orange-600 text-white font-bold shadow-md text-sm"
                            disabled={form.formState.isSubmitting}
                        >
                            {form.formState.isSubmitting ? 'Processando...' : (initialData ? 'Atualizar' : (submitLabel || 'Solicitar Homologação'))}
                        </Button>
                    </div>
                </div>
            </form>

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
