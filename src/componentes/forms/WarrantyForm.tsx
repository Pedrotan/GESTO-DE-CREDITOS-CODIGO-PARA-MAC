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
import { Warranty } from '@/tipos/contencioso';
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

const warrantySchema = z.object({
    clientId: z.string().min(1, 'Selecione um cliente'),
    creditId: z.string().optional(),
    type: z.enum(['Veículo', 'Imóvel', 'Equipamento', 'Outro']),
    description: z.string().min(3, 'Descrição obrigatória'),
    marketValue: z.coerce.number().min(1, 'Valor inválido'),
    status: z.enum(['active', 'released', 'seized']),
    location: z.string().optional(),
    notes: z.string().optional(),
});

type WarrantyFormValues = z.infer<typeof warrantySchema>;

interface WarrantyFormProps {
    onSubmit: (data: WarrantyFormValues) => void;
    clients: Client[];
    credits: Credit[];
    onCancel: () => void;
    initialData?: Warranty;
}

export function WarrantyForm({ onSubmit, clients, credits, onCancel, initialData }: WarrantyFormProps) {
    const [openClient, setOpenClient] = useState(false);
    const [openCredit, setOpenCredit] = useState(false);

    const form = useForm<WarrantyFormValues>({
        resolver: zodResolver(warrantySchema),
        defaultValues: {
            clientId: initialData?.clientId || '',
            creditId: initialData?.creditId || undefined,
            type: initialData?.type || 'Veículo',
            description: initialData?.description || '',
            marketValue: initialData?.marketValue || 0,
            status: initialData?.status || 'active',
            location: initialData?.location || '',
            notes: initialData?.notes || '',
        },
    });

    const draftKey = initialData?.id ? `warranty_edit_${initialData.id}` : 'warranty_create';
    const { clearDraft } = useFormDraft<WarrantyFormValues>(draftKey, form);

    const handleFormSubmit = (data: WarrantyFormValues) => {
        clearDraft();
        onSubmit(data);
    };

    const selectedClientId = form.watch('clientId');
    const filteredCredits = credits.filter(c => c.clientId === selectedClientId);

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="clientId"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Cliente</FormLabel>
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
                                                : "Pesquisar cliente..."}
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
                                                            form.setValue("creditId", ""); // Reset credit when client changes
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
                            <FormLabel>Crédito Associado (Opcional)</FormLabel>
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
                                            disabled={!selectedClientId}
                                        >
                                            {field.value
                                                ? `${credits.find((c) => c.id === field.value)?.id} - ${formatCurrency(credits.find((c) => c.id === field.value)?.principalAmount || 0)}`
                                                : selectedClientId ? "Selecione um crédito..." : "Selecione um cliente primeiro"}
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
                                                            <span className="text-[10px] text-muted-foreground">{formatCurrency(c.principalAmount)} - {c.status}</span>
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
                        name="type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo de Bem</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione o tipo" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="Veículo">Veículo</SelectItem>
                                        <SelectItem value="Imóvel">Imóvel</SelectItem>
                                        <SelectItem value="Equipamento">Equipamento</SelectItem>
                                        <SelectItem value="Outro">Outro</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="marketValue"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Valor de Mercado</FormLabel>
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
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Estado</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Estado atual" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="active">Ativo (Em Custódia)</SelectItem>
                                        <SelectItem value="released">Libertado (Devolvido)</SelectItem>
                                        <SelectItem value="seized">Apreendido (Executado)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="location"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Localização</FormLabel>
                                <FormControl>
                                    <Input placeholder="Onde se encontra o bem?" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Descrição Detalhada</FormLabel>
                            <FormControl>
                                <Textarea placeholder="Marca, modelo, cor, nº de série, matricula, etc." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Notas Adicionais</FormLabel>
                            <FormControl>
                                <Textarea placeholder="Observações..." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancelar
                    </Button>
                    <Button type="submit">Salvar Garantia</Button>
                </div>
            </form>
        </Form>
    );
}
