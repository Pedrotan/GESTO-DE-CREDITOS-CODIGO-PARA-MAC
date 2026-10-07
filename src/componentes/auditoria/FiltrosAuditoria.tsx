import { useState } from 'react';
import { chipsOf, type SavedAuditFilter } from './filtros-auditoria';
import { Bookmark, CalendarRange, FilterX, Save, Trash2, X } from 'lucide-react';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { MultiCombo, ToggleChips } from '@/componentes/pagamentos/FiltrosPagamentos';
import { cn } from '@/bibliotecas/utils';
import { ROLES } from '@/tipos/autenticacao';
import {
    ACTION_LABELS, EMPTY_AUDIT_FILTERS, MODULE_LABELS, PRESET_LABELS, RESULT_LABELS, SEVERITY_LABELS, SEVERITY_ORDER,
    type AuditFilters, type AuditPeriod, type AuditPreset,
} from '@/bibliotecas/auditoria-analise';

export function SeletorPeriodoAuditoria({ value, onChange }: { value: AuditPeriod; onChange: (value: AuditPeriod) => void }) {
    return (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            {(Object.keys(PRESET_LABELS) as AuditPreset[]).map(preset => (
                <button key={preset} type="button" onClick={() => onChange({ ...value, preset })} aria-pressed={value.preset === preset}
                    className={cn('rounded-lg px-3 py-1.5 text-xs font-bold transition-colors', value.preset === preset ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow' : 'bg-background hover:bg-muted')}>
                    {PRESET_LABELS[preset]}
                </button>
            ))}
            {value.preset === 'custom' && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">De</span>
                    <Input type="date" value={value.from} onChange={event => onChange({ ...value, from: event.target.value })} className="h-9 w-40 bg-background" aria-label="Data inicial" />
                    <Input type="time" value={value.fromTime} onChange={event => onChange({ ...value, fromTime: event.target.value })} className="h-9 w-28 bg-background" aria-label="Hora inicial" />
                    <span className="text-muted-foreground">até</span>
                    <Input type="date" value={value.to} onChange={event => onChange({ ...value, to: event.target.value })} className="h-9 w-40 bg-background" aria-label="Data final" />
                    <Input type="time" value={value.toTime} onChange={event => onChange({ ...value, toTime: event.target.value })} className="h-9 w-28 bg-background" aria-label="Hora final" />
                </div>
            )}
        </div>
    );
}

export function FiltrosAuditoria({ open, filters, onChange, users, saved, onSave, onApplySaved, onRemoveSaved }: {
    open: boolean;
    filters: AuditFilters;
    onChange: (changes: Partial<AuditFilters>) => void;
    users: Array<{ id: string; name: string; role: string }>;
    saved: SavedAuditFilter[];
    onSave: (name: string) => void;
    onApplySaved: (item: SavedAuditFilter) => void;
    onRemoveSaved: (id: string) => void;
}) {
    const [name, setName] = useState('');
    const userName = (id: string) => users.find(user => user.id === id)?.name || id;
    const chips = chipsOf(filters, userName);
    const roles = [...new Set(users.map(user => user.role).filter(Boolean))];
    return (
        <>
            {open && (
                <div className="mb-3 grid gap-4 rounded-xl border bg-muted/30 p-4 md:grid-cols-2 xl:grid-cols-4">
                    <MultiCombo label="Utilizador" placeholder="Todos os utilizadores" values={filters.users} onChange={users => onChange({ users })} options={users.map(user => ({ value: user.id, label: user.name }))} />
                    <MultiCombo label="Perfil" placeholder="Todos os perfis" values={filters.roles} onChange={roles => onChange({ roles })} options={roles.map(role => ({ value: role, label: ROLES[role]?.label || role }))} />
                    <MultiCombo label="Módulo" placeholder="Todos os módulos" values={filters.modules} onChange={modules => onChange({ modules })} options={Object.entries(MODULE_LABELS).map(([value, label]) => ({ value, label }))} />
                    <MultiCombo label="Ação" placeholder="Todas as ações" values={filters.actions} onChange={actions => onChange({ actions })} options={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))} />
                    <ToggleChips label="Gravidade" values={filters.severities} onChange={severities => onChange({ severities })} options={SEVERITY_ORDER.slice().reverse().map(value => ({ value, label: SEVERITY_LABELS[value] }))} />
                    <ToggleChips label="Resultado" values={filters.results} onChange={results => onChange({ results })} options={Object.entries(RESULT_LABELS).map(([value, label]) => ({ value, label }))} />
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground">Endereço IP</Label>
                        <Input className="h-9 bg-background" value={filters.ip} onChange={event => onChange({ ip: event.target.value })} placeholder="Ex.: 192.168.1.10" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground">Entidade (n.º do crédito, cliente, recibo)</Label>
                        <Input className="h-9 bg-background" value={filters.entity} onChange={event => onChange({ entity: event.target.value })} placeholder="Ex.: CR-2026-0001 ou RC 2026/000001" />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs font-semibold text-muted-foreground">Guardar estes filtros com um nome</Label>
                        <div className="flex gap-2">
                            <Input className="h-9 bg-background" value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder="Ex.: Acessos negados do Contencioso" />
                            <Button type="button" variant="outline" className="h-9 gap-2" disabled={!name.trim()} onClick={() => { onSave(name.trim()); setName(''); }}><Save className="h-4 w-4" /> Guardar</Button>
                        </div>
                    </div>
                </div>
            )}
            {(chips.length > 0 || saved.length > 0) && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    {saved.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs"><Bookmark className="h-3.5 w-3.5" /> Filtros guardados</Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-72">
                                <DropdownMenuLabel>Aplicar um filtro guardado</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {saved.map(item => (
                                    <DropdownMenuItem key={item.id} className="flex items-center justify-between gap-2" onSelect={() => onApplySaved(item)}>
                                        <span className="truncate">{item.name}</span>
                                        <button type="button" aria-label={`Apagar ${item.name}`} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                            onClick={event => { event.preventDefault(); event.stopPropagation(); onRemoveSaved(item.id); }}><Trash2 className="h-3.5 w-3.5" /></button>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    {chips.map(chip => (
                        <Badge key={chip.key} variant="outline" className="gap-1 bg-background py-1 pl-2.5 pr-1">
                            {chip.label}
                            <button type="button" aria-label={`Remover ${chip.label}`} className="rounded-full p-0.5 hover:bg-muted" onClick={() => onChange(chip.clear)}><X className="h-3 w-3" /></button>
                        </Badge>
                    ))}
                    {chips.length > 0 && <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => onChange({ ...EMPTY_AUDIT_FILTERS })}><FilterX className="h-3.5 w-3.5" /> Limpar filtros</Button>}
                </div>
            )}
        </>
    );
}
