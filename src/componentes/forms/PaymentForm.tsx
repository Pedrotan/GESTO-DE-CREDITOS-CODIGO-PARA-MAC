import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useFormDraft } from '@/ganchos/usar-rascunho-formulario';
import { Button } from '@/componentes/ui/button';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { formatCurrency } from '@/bibliotecas/formatters';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/componentes/ui/form';
import { Input } from '@/componentes/ui/input';
import { Credit, Payment } from '@/tipos/credito';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/componentes/ui/popover';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/componentes/ui/command';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/componentes/ui/select";
import { useState } from 'react';

const paymentSchema = z.object({
    creditId: z.string().min(1, 'Selecione um crédito'),
    amount: z.coerce.number().min(1, 'Montante inválido'),
    method: z.enum(['cash', 'transfer', 'reference']),
    reference: z.string().optional(),
    paymentDate: z.string().min(1, 'Data obrigatória'),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface PaymentFormProps {
    onSubmit: (data: PaymentFormValues) => void;
    credits: Credit[];
    onCancel: () => void;
    initialCreditId?: string;
}

const payableCreditStatuses = new Set<Credit['status']>(['active', 'overdue', 'renegotiated', 'defaulted']);

const isPayableCredit = (credit: Credit) => (
    payableCreditStatuses.has(credit.status) &&
    (Number(credit.currentBalance) || 0) > 0.1
);

export function PaymentForm({ onSubmit, credits, onCancel, initialCreditId }: PaymentFormProps) {
    const [open, setOpen] = useState(false);
    const form = useForm<PaymentFormValues>({
        resolver: zodResolver(paymentSchema),
        defaultValues: {
            creditId: initialCreditId || '',
            amount: 0,
            method: 'cash',
            reference: '',
            paymentDate: new Date().toISOString().split('T')[0],
        },
    });

    const draftKey = initialCreditId ? `payment_credit_${initialCreditId}` : 'payment_create';
    const { clearDraft } = useFormDraft<PaymentFormValues>(draftKey, form);

    const handleFormSubmit = (data: PaymentFormValues) => {
        clearDraft();
        onSubmit(data);
    };

    const selectedCreditId = form.watch('creditId');
    const selectedCredit = credits.find(c => c.id === selectedCreditId);
    const clientActiveCredits = selectedCredit 
        ? credits.filter(c => c.clientId === selectedCredit.clientId && isPayableCredit(c))
        : [];

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="creditId"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Crédito / Cliente</FormLabel>
                            <Popover open={open} onOpenChange={setOpen}>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={open}
                                            className={cn(
                                                "w-full justify-between h-11 font-normal",
                                                !field.value && "text-muted-foreground"
                                            )}
                                        >
                                            {field.value
                                                ? `${selectedCredit?.clientName || ''} - Crédito ${selectedCredit?.creditNumber || 1} (${formatCurrency(selectedCredit?.currentBalance || 0)})`
                                                : "Pesquisar por cliente ou ID..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Digite nome ou ID..." />
                                        <CommandList>
                                            <CommandEmpty>Nenhum crédito encontrado.</CommandEmpty>
                                            <CommandGroup>
                                                {credits
                                                    .filter(isPayableCredit)
                                                    .map((c) => (
                                                        <CommandItem
                                                            key={c.id}
                                                            value={`${c.id} ${c.clientName}`}
                                                            onSelect={() => {
                                                                form.setValue("creditId", c.id);
                                                                setOpen(false);
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    c.id === field.value ? "opacity-100" : "opacity-0"
                                                                )}
                                                            />
                                                            <div className="flex flex-col">
                                                                <span className="font-medium">{c.clientName}</span>
                                                                <span className="text-[10px] text-muted-foreground uppercase">
                                                                    Crédito {c.creditNumber || 1} - {c.id} - Saldo: {formatCurrency(c.currentBalance)}
                                                                </span>
                                                            </div>
                                                        </CommandItem>
                                                    ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {clientActiveCredits.length > 1 && (
                    <div className="p-4 bg-muted/40 border rounded-lg space-y-3 animate-in fade-in duration-200">
                        <p className="text-xs font-bold uppercase tracking-wider text-primary">
                            Este cliente possui múltiplos créditos ativos. Selecione o crédito para pagamento:
                        </p>
                        <div className="grid gap-2">
                            {clientActiveCredits.map(c => {
                                const isSelected = c.id === selectedCreditId;
                                return (
                                    <div
                                        key={c.id}
                                        onClick={() => form.setValue('creditId', c.id)}
                                        className={cn(
                                            "flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all hover:bg-muted/80",
                                            isSelected ? "border-primary bg-primary/5 font-bold" : "border-slate-200 bg-white"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="radio"
                                                name="activeCreditSelector"
                                                checked={isSelected}
                                                onChange={() => {}} // handled by parent div onClick
                                                className="text-primary focus:ring-primary h-4 w-4"
                                            />
                                            <div className="text-sm">
                                                <p className="text-foreground">Pagar Crédito {c.creditNumber || 1}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase">
                                                    {c.id} - Início: {c.startDate ? new Date(c.startDate).toLocaleDateString() : 'N/D'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-destructive">{formatCurrency(c.currentBalance)}</p>
                                            <p className="text-[10px] text-muted-foreground">Saldo Devedor</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Montante</FormLabel>
                                <FormControl>
                                    <div className="space-y-2">
                                        <CurrencyInput
                                            value={field.value}
                                            onValueChange={field.onChange}
                                            className="h-11"
                                        />
                                        {form.watch('creditId') && (
                                            <p className="text-[10px] text-muted-foreground">
                                                Saldo Devedor Atual: <span className="font-bold text-foreground">
                                                    {(() => {
                                                        const c = credits.find(cr => cr.id === form.getValues('creditId'));
                                                        return c ? formatCurrency(c.currentBalance) : formatCurrency(0);
                                                    })()}
                                                </span>
                                            </p>
                                        )}
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="paymentDate"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Data do Pagamento</FormLabel>
                                <FormControl>
                                    <Input type="date" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="method"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Método de Pagamento</FormLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione o método" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="cash">Numerário</SelectItem>
                                        <SelectItem value="transfer">Transferência</SelectItem>
                                        <SelectItem value="reference">Referência</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="reference"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Referência (Opcional)</FormLabel>
                                <FormControl>
                                    <Input placeholder="Nº do comprovativo" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancelar
                    </Button>
                    <Button type="submit">Salvar</Button>
                </div>
            </form>
        </Form>
    );
}

