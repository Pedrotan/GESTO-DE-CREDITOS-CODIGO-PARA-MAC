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
import { Textarea } from '@/componentes/ui/textarea';
import { Client, Credit } from '@/tipos/credito';
import { LegalCase } from '@/tipos/contencioso';
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
import { useState, useEffect } from 'react';

const legalCaseSchema = z.object({
    clientId: z.string().min(1, 'Selecione um cliente'),
    creditId: z.string().min(1, 'Selecione um crédito'),
    stage: z.enum(['interpellated', 'mediation', 'court', 'closed']),
    priority: z.enum(['low', 'normal', 'high', 'critical']),
    debtAmount: z.coerce.number().min(1, 'Valor da dívida inválido'),
    lastAction: z.string().optional(),
    notes: z.string().optional(),
});

type LegalCaseFormValues = z.infer<typeof legalCaseSchema>;

interface LegalCaseFormProps {
    onSubmit: (data: LegalCaseFormValues) => void;
    clients: Client[];
    credits: Credit[];
    onCancel: () => void;
    initialData?: LegalCase;
}

export function LegalCaseForm({ onSubmit, clients, credits, onCancel, initialData }: LegalCaseFormProps) {
    const [openClient, setOpenClient] = useState(false);
    const [openCredit, setOpenCredit] = useState(false);

    const form = useForm<LegalCaseFormValues>({
        resolver: zodResolver(legalCaseSchema),
        defaultValues: {
            clientId: initialData?.clientId || '',
            creditId: initialData?.creditId || '',
            stage: initialData?.stage || 'interpellated',
            priority: initialData?.priority || 'normal',
            debtAmount: initialData?.debtAmount || 0,
            lastAction: initialData?.lastAction || '',
            notes: initialData?.notes || '',
        },
    });

    const draftKey = initialData?.id ? `legal_case_edit_${initialData.id}` : 'legal_case_create';
    const { clearDraft } = useFormDraft<LegalCaseFormValues>(draftKey, form);

    const handleFormSubmit = (data: LegalCaseFormValues) => {
        clearDraft();
        onSubmit(data);
    };

    const selectedClientId = form.watch('clientId');
    const selectedCreditId = form.watch('creditId');
    const filteredCredits = credits.filter(c => c.clientId === selectedClientId);

    // Auto-fill debt amount when credit is selected
    useEffect(() => {
        if (selectedCreditId && !initialData) {
            const credit = credits.find(c => c.id === selectedCreditId);
            if (credit) {
                form.setValue('debtAmount', credit.currentBalance);
            }
        }
    }, [selectedCreditId, credits, form, initialData]);

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="clientId"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Cliente Devedor</FormLabel>
                            <Popover open={openClient} onOpenChange={setOpenClient}>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openClient}
                                            className={cn(
                                                "w-full justify-between h-11 font-normal",
                                                !field.value && "text-muted-foreground"
                                            )}
                                            disabled={!!initialData}
                                        >
                                            {field.value
                                                ? clients.find((c) => c.id === field.value)?.name
                                                : "Pesquisar devedor..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Digite o nome do cliente..." />
                                        <CommandList>
                                            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                                            <CommandGroup>
                                                {clients.map((c) => (
                                                    <CommandItem
                                                        key={c.id}
                                                        value={`${c.name} ${c.nif}`}
                                                        onSelect={() => {
                                                            form.setValue("clientId", c.id);
                                                            form.setValue("creditId", "");
                                                            setOpenClient(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                c.id === field.value ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{c.name}</span>
                                                            <span className="text-[10px] text-muted-foreground">{c.nif}</span>
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

                <FormField
                    control={form.control}
                    name="creditId"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Crédito em Incumprimento</FormLabel>
                            <Popover open={openCredit} onOpenChange={setOpenCredit}>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openCredit}
                                            className={cn(
                                                "w-full justify-between h-11 font-normal",
                                                !field.value && "text-muted-foreground"
                                            )}
                                            disabled={!selectedClientId || !!initialData}
                                        >
                                            {field.value
                                                ? `${credits.find((c) => c.id === field.value)?.id} - ${formatCurrency(credits.find((c) => c.id === field.value)?.principalAmount || 0)}`
                                                : selectedClientId ? "Selecione o crédito..." : "Selecione um cliente primeiro"}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Pesquisar crédito..." />
                                        <CommandList>
                                            <CommandEmpty>Nenhum crédito encontrado.</CommandEmpty>
                                            <CommandGroup>
                                                {filteredCredits.map((c) => (
                                                    <CommandItem
                                                        key={c.id}
                                                        value={c.id}
                                                        onSelect={() => {
                                                            form.setValue("creditId", c.id);
                                                            setOpenCredit(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                c.id === field.value ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{c.id}</span>
                                                            <span className="text-[10px] text-muted-foreground">{formatCurrency(c.principalAmount)} - Saldo: {formatCurrency(c.currentBalance)}</span>
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

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="stage"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Fase do Processo</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione a fase" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="interpellated">Interpelação</SelectItem>
                                        <SelectItem value="mediation">Mediação / CMC</SelectItem>
                                        <SelectItem value="court">Tribunal / Comarca</SelectItem>
                                        <SelectItem value="closed">Fechado / Recuperado</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="priority"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Prioridade</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Prioridade" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="low">Baixa</SelectItem>
                                        <SelectItem value="normal">Normal</SelectItem>
                                        <SelectItem value="high">Alta</SelectItem>
                                        <SelectItem value="critical">Crítica</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="debtAmount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Valor da Dívida</FormLabel>
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
                        name="lastAction"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Última Diligência</FormLabel>
                                <FormControl>
                                    <Input placeholder="Resumo da última ação..." {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Estratégia / Notas</FormLabel>
                            <FormControl>
                                <Textarea placeholder="Estratégia de recuperação, notas importantes..." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancelar
                    </Button>
                    <Button type="submit" className="bg-red-600 hover:bg-red-700">Salvar Processo</Button>
                </div>
            </form>
        </Form>
    );
}
