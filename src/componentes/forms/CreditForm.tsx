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
import { Info, Calculator, Calendar, AlertTriangle } from 'lucide-react';
import { useToast } from '@/componentes/ui/use-toast';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { SearchableSelect } from '@/componentes/ui/SearchableSelect';

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

    const form = useForm<CreditFormValues>({
        resolver: zodResolver(creditSchema),
        defaultValues: initialData
            ? {
                clientId: initialData.clientId,
                principalAmount: initialData.principalAmount,
                interestRate: initialData.interestRate,
                lateInterestRate: initialData.lateInterestRate,
                installments: initialData.installments,
                startDate: (initialData.startDate && !isNaN(new Date(initialData.startDate).getTime()))
                    ? new Date(initialData.startDate).toISOString().split('T')[0]
                    : new Date().toISOString().split('T')[0],
                dueDate: (initialData.dueDate && !isNaN(new Date(initialData.dueDate).getTime()))
                    ? new Date(initialData.dueDate).toISOString().split('T')[0]
                    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: initialData.status as any,
            }
            : {
                clientId: prefillData?.clientId || '',
                principalAmount: prefillData?.principalAmount || 0,
                interestRate: prefillData?.interestRate || 0,
                lateInterestRate: prefillData?.lateInterestRate || 0,
                installments: prefillData?.installments || 1,
                startDate: prefillData?.startDate || new Date().toISOString().split('T')[0],
                // Default due date: 30 days from start or now
                dueDate: prefillData?.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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

    // Auto-fill effect: Prioritize client profile rates, fallback to last credit
    useEffect(() => {
        if (!selectedClientId || initialData) return;

        const currentValues = form.getValues();
        // Only auto-fill if rates are zero (meaning they haven't been manually set yet)
        if (currentValues.interestRate > 0 && currentValues.lateInterestRate > 0) return;

        const selectedClient = clients.find(c => c.id === selectedClientId);

        // PRIORITY 1: Use client-defined rates from profile
        if (selectedClient && selectedClient.defaultInterestRate > 0) {
            form.setValue('interestRate', selectedClient.defaultInterestRate);
            form.setValue('lateInterestRate', selectedClient.lateInterestRate || 1);
            toast({
                title: "Taxas Aplicadas",
                description: `Taxas automáticas aplicadas para ${selectedClient.name}`,
            });
            return;
        }

        // PRIORITY 2: Fallback to last credit history
        if (credits) {
            const lastCredit = credits
                .filter(c => c.clientId === selectedClientId)
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

            if (lastCredit) {
                form.setValue('interestRate', lastCredit.interestRate);
                form.setValue('lateInterestRate', lastCredit.lateInterestRate);
                form.setValue('installments', lastCredit.installments);
                toast({
                    title: "Valores Sugeridos",
                    description: "Padrão de cobrança carregado do histórico.",
                });
            }
        }
    }, [selectedClientId, clients, credits, initialData, form, toast]);

    const totalInterest = (principal * rate) / 100;
    const totalToReturn = principal + totalInterest;
    const valuePerInstallment = totalToReturn / instalments;

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

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit, handleError)} className="space-y-6">
                <FormField
                    control={form.control}
                    name="clientId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-2">
                                Cliente
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
                                <div className="mt-2 flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                                    {clients.find(c => c.id === selectedClientId) && (() => {
                                        const client = clients.find(c => c.id === selectedClientId)!;
                                        const clientCredits = credits?.filter(cr => cr.clientId === selectedClientId && cr.status !== 'cancelled' && cr.status !== 'rejected') || [];
                                        const cycle = initialData?.creditNumber || clientCredits.length + 1;
                                        const ratio = client.creditLimit > 0 ? (client.availableCredit / client.creditLimit) : 0;
                                        let variant: 'success' | 'warning' | 'destructive' = 'success';
                                        if (ratio <= 0) variant = 'destructive';
                                        else if (ratio <= 0.2) variant = 'warning';

                                        return (
                                            <>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Badge variant="secondary" className="px-3 py-1 text-xs font-bold bg-primary/10 text-primary border-primary/20">
                                                        {cycle}º Ciclo de Crédito
                                                    </Badge>
                                                    {initialData && (
                                                        <Badge variant="outline" className="text-[10px]">Editando Registro #{initialData.id.substring(0, 8)}</Badge>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 p-2 bg-muted/30 rounded-lg border w-full">
                                                    <div className="text-[10px] font-semibold text-muted-foreground uppercase px-1">Limite do Cliente:</div>
                                                    <Badge variant="outline" className="text-[10px] h-5">Total: {formatCurrency(client.creditLimit)}</Badge>
                                                    <Badge variant="outline" className="text-[10px] h-5">Usado: {formatCurrency(client.usedCredit)}</Badge>
                                                    <Badge variant={variant} className="text-[10px] h-5 font-bold"> Disponível: {formatCurrency(client.availableCredit)}</Badge>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                        </FormItem>
                    )}
                />

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="principalAmount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Montante Emprestado</FormLabel>
                                <FormControl>
                                    <CurrencyInput
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        className="h-11"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="installments"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Número de Prestações</FormLabel>
                                <FormControl>
                                    <Input type="number" className="h-11" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="interestRate"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Taxa de Juros (%)</FormLabel>
                                <FormControl>
                                    <div className="relative">
                                        <Input type="number" step="0.1" className="h-11 pr-10" {...field} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">%</span>
                                    </div>
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
                                <FormLabel>Taxa de Mora diária (%)</FormLabel>
                                <FormControl>
                                    <div className="relative">
                                        <Input type="number" step="0.1" className="h-11 pr-10" {...field} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">%</span>
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="startDate"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    Data de Início
                                </FormLabel>
                                <FormControl>
                                    <Input type="date" className="h-11" {...field} />
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
                                <FormLabel className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    Data de Vencimento
                                </FormLabel>
                                <FormControl>
                                    <Input type="date" className="h-11" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* Calculation Summary Box */}
                <div className="rounded-xl border-2 border-primary/10 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-primary font-bold text-sm mb-2">
                        <Calculator className="h-4 w-4" />
                        RESUMO DO EMPRÉSTIMO
                    </div>
                    <div className="flex flex-col gap-3 text-sm">
                        <div className="flex justify-between items-start gap-4">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider whitespace-nowrap pt-1">Total de Juros:</span>
                            <span className="text-right font-medium break-all">{formatCurrency(totalInterest)}</span>
                        </div>

                        <div className="flex justify-between items-start gap-4 py-2 border-t border-primary/10">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider whitespace-nowrap pt-2">Total a Devolver:</span>
                            <span className="text-right font-bold text-lg md:text-xl text-primary break-all leading-tight">
                                {formatCurrency(totalToReturn)}
                            </span>
                        </div>

                        <div className="pt-2 border-t border-primary/10">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Valor por Prestação ({instalments}x):</span>
                                <span className="text-right font-bold text-success-foreground bg-success/20 px-3 py-1.5 rounded-lg border border-success/30 break-all">
                                    {formatCurrency(valuePerInstallment)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="ghost" onClick={onCancel} className="h-11 px-8" disabled={form.formState.isSubmitting}>
                        Cancelar
                    </Button>
                    <Button type="submit" className="h-11 px-8 min-w-[150px]" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? 'Processando...' : (initialData ? 'Atualizar' : (submitLabel || 'Confirmar Empréstimo'))}
                    </Button>
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
