import { useMemo, useState } from 'react';
import { Bookmark, Check, ChevronsUpDown, FilterX, Save, Trash2, X } from 'lucide-react';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Switch } from '@/componentes/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/componentes/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/componentes/ui/command';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { SearchableSelect } from '@/componentes/ui/SearchableSelect';
import { cn } from '@/bibliotecas/utils';
import { EMPTY_FILTERS, PAYMENT_METHODS, PAYMENT_STATUS, activeFilterChips, type PaymentFilters } from '@/bibliotecas/pagamentos-analise';

type Option = { value: string; label: string; subLabel?: string };
import type { SavedFilter } from './filtros-guardados';

export function MultiCombo({ label, options, values, onChange, placeholder }: { label: string; options: Option[]; values: string[]; onChange: (values: string[]) => void; placeholder: string }) {
    const [open, setOpen] = useState(false);
    const toggle = (value: string) => onChange(values.includes(value) ? values.filter(item => item !== value) : [...values, value]);
    return (
        <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={open} className="h-9 w-full justify-between bg-background font-normal">
                        <span className="truncate">{values.length ? `${values.length} seleccionado(s)` : placeholder}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                        <CommandInput placeholder="Pesquisar..." className="h-9" />
                        <CommandList>
                            <CommandEmpty>Sem resultados.</CommandEmpty>
                            <CommandGroup>
                                {options.map(option => (
                                    <CommandItem key={option.value} value={`${option.label} ${option.subLabel || ''}`} onSelect={() => toggle(option.value)} className="flex items-center gap-2">
                                        <span className={cn('flex h-4 w-4 items-center justify-center rounded border', values.includes(option.value) && 'border-primary bg-primary text-primary-foreground')}>
                                            {values.includes(option.value) && <Check className="h-3 w-3" />}
                                        </span>
                                        <span className="truncate">{option.label}</span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}

export function ToggleChips({ label, options, values, onChange }: { label: string; options: Option[]; values: string[]; onChange: (values: string[]) => void }) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
            <div className="flex flex-wrap gap-1.5">
                {options.map(option => {
                    const active = values.includes(option.value);
                    return (
                        <button
                            key={option.value} type="button" aria-pressed={active}
                            onClick={() => onChange(active ? values.filter(item => item !== option.value) : [...values, option.value])}
                            className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                                active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export function FiltrosPagamentos({ open, filters, onChange, options, saved, onApplySaved, onSave, onRemoveSaved }: {
    open: boolean;
    filters: PaymentFilters;
    onChange: (changes: Partial<PaymentFilters>) => void;
    options: { operators: Option[]; managers: Option[]; products: Option[]; clients: Option[]; contracts: Array<Option & { clientId: string }> };
    saved: SavedFilter[];
    onApplySaved: (item: SavedFilter) => void;
    onSave: (name: string) => void;
    onRemoveSaved: (id: string) => void;
}) {
    const [name, setName] = useState('');
    const managerName = (id: string) => options.managers.find(item => item.value === id)?.label || id;
    const chips = useMemo(() => activeFilterChips(filters, {
        client: options.clients.find(item => item.value === filters.clientId)?.label,
        contract: options.contracts.find(item => item.value === filters.creditId)?.label,
        manager: managerName,
    }), [filters, options]); // eslint-disable-line react-hooks/exhaustive-deps
    const contracts = filters.clientId ? options.contracts.filter(item => item.clientId === filters.clientId) : options.contracts;

    return (
        <>
            {open && (
                <div className="mb-3 rounded-xl border bg-muted/30 p-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <ToggleChips label="Método" values={filters.methods} onChange={methods => onChange({ methods })}
                            options={Object.entries(PAYMENT_METHODS).map(([value, item]) => ({ value, label: item.label }))} />
                        <ToggleChips label="Estado" values={filters.statuses} onChange={statuses => onChange({ statuses })}
                            options={Object.entries(PAYMENT_STATUS).map(([value, item]) => ({ value, label: item.label }))} />
                        <ToggleChips label="Produto / carteira" values={filters.products} onChange={products => onChange({ products })} options={options.products} />
                        <div className="flex items-end gap-3">
                            <div className="flex items-center gap-2 pb-1.5">
                                <Switch id="only-late" checked={filters.onlyLate} onCheckedChange={onlyLate => onChange({ onlyLate })} />
                                <Label htmlFor="only-late" className="text-sm">Só pagamentos com juros de mora</Label>
                            </div>
                        </div>
                        <MultiCombo label="Operador que registou" placeholder="Todos os operadores" options={options.operators} values={filters.operators} onChange={operators => onChange({ operators })} />
                        <MultiCombo label="Gestor do cliente" placeholder="Todos os gestores" options={options.managers} values={filters.managers} onChange={managers => onChange({ managers })} />
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground">Cliente</Label>
                            <SearchableSelect className="h-9 bg-background" options={[{ value: '', label: 'Todos os clientes' }, ...options.clients]} value={filters.clientId}
                                onValueChange={clientId => onChange({ clientId, creditId: '' })} placeholder="Todos os clientes" searchPlaceholder="Pesquisar cliente..." />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground">Contrato</Label>
                            <SearchableSelect className="h-9 bg-background" options={[{ value: '', label: 'Todos os contratos' }, ...contracts]} value={filters.creditId}
                                onValueChange={creditId => onChange({ creditId })} placeholder="Todos os contratos" searchPlaceholder="Pesquisar contrato..." />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground">Valor mínimo (Kz)</Label>
                            <Input type="number" min={0} inputMode="decimal" className="h-9 bg-background" value={filters.minAmount ?? ''}
                                onChange={event => onChange({ minAmount: event.target.value === '' ? null : Number(event.target.value) })} placeholder="0,00" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground">Valor máximo (Kz)</Label>
                            <Input type="number" min={0} inputMode="decimal" className="h-9 bg-background" value={filters.maxAmount ?? ''}
                                onChange={event => onChange({ maxAmount: event.target.value === '' ? null : Number(event.target.value) })} placeholder="Sem limite" />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <Label className="text-xs font-semibold text-muted-foreground">Guardar esta combinação de filtros</Label>
                            <div className="flex gap-2">
                                <Input className="h-9 bg-background" value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder="Ex.: Transferências por validar" />
                                <Button type="button" variant="outline" className="h-9 gap-2" disabled={!name.trim()} onClick={() => { onSave(name.trim()); setName(''); }}>
                                    <Save className="h-4 w-4" /> Guardar
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {(chips.length > 0 || saved.length > 0) && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    {saved.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs"><Bookmark className="h-3.5 w-3.5" /> Filtros guardados</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-72">
                                <DropdownMenuLabel>Aplicar um filtro guardado</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {saved.map(item => (
                                    <DropdownMenuItem key={item.id} className="flex items-center justify-between gap-2" onSelect={() => onApplySaved(item)}>
                                        <span className="truncate">{item.name}</span>
                                        <button type="button" aria-label={`Apagar ${item.name}`} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                            onClick={event => { event.preventDefault(); event.stopPropagation(); onRemoveSaved(item.id); }}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    {chips.map(chip => (
                        <Badge key={chip.key} variant="outline" className="gap-1 bg-background py-1 pl-2.5 pr-1">
                            {chip.label}
                            <button type="button" aria-label={`Remover ${chip.label}`} className="rounded-full p-0.5 hover:bg-muted" onClick={() => onChange(chip.clear)}>
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                    {chips.length > 0 && (
                        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => onChange({ ...EMPTY_FILTERS })}>
                            <FilterX className="h-3.5 w-3.5" /> Limpar filtros
                        </Button>
                    )}
                </div>
            )}
        </>
    );
}
