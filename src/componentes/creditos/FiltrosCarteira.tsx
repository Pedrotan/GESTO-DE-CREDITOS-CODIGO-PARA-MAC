import { useMemo, useState } from 'react';
import { Bookmark, Save, Trash2 } from 'lucide-react';
import { AGING_LABELS, type AgingBucket } from '@/bibliotecas/carteira-credito';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/componentes/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { EMPTY_FILTERS, type CarteiraState, type CreditFilters } from './useCarteira';

const STORAGE = 'creditos_filtros_guardados';
type Saved = { name: string; filters: CreditFilters; tab: string };
const readSaved = (): Saved[] => { try { return JSON.parse(localStorage.getItem(STORAGE) || '[]'); } catch { return []; } };
const ALL = '__todos__';

/** Filtros da tabela (estado, produto, gestor, agência, risco, escalão de atraso, valores e datas) e filtros guardados. */
export function FiltrosCarteira({ state, open, onClose }: { state: CarteiraState; open: boolean; onClose: () => void }) {
    const [saved, setSaved] = useState<Saved[]>(readSaved);
    const [name, setName] = useState('');
    const f = state.filters;
    const set = (patch: Partial<CreditFilters>) => state.setFilters(previous => ({ ...previous, ...patch }));
    const options = useMemo(() => ({
        products: [...new Set(state.rows.map(row => row.product))].sort(),
        managers: [...new Map(state.rows.map(row => [row.managerId, row.managerName])).entries()].filter(([id]) => id).sort((a, b) => a[1].localeCompare(b[1])),
        branches: [...new Map(state.rows.map(row => [row.branchId, row.branchName])).entries()].filter(([id]) => id),
    }), [state.rows]);
    const persist = (list: Saved[]) => { setSaved(list); try { localStorage.setItem(STORAGE, JSON.stringify(list)); } catch { /* sem armazenamento */ } };
    const pick = (label: string, value: string, onChange: (value: string) => void, items: Array<[string, string]>) => (
        <div><p className="mb-1 text-xs font-semibold">{label}</p>
            <Select value={value || ALL} onValueChange={next => onChange(next === ALL ? '' : next)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{items.map(([id, text]) => <SelectItem key={id} value={id}>{text}</SelectItem>)}</SelectContent>
            </Select></div>
    );
    return (
        <Sheet open={open} onOpenChange={value => { if (!value) onClose(); }}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>Filtros</SheetTitle>
                    <SheetDescription>Os filtros aplicam-se em tempo real à tabela e aos totais.</SheetDescription>
                </SheetHeader>
                <div className="mt-4 space-y-3">
                    {pick('Produto', f.product, product => set({ product }), options.products.map(item => [item, item]))}
                    {pick('Gestor', f.managerId, managerId => set({ managerId }), options.managers)}
                    {pick('Agência', f.branchId, branchId => set({ branchId }), options.branches)}
                    {pick('Nível de risco', f.risk, risk => set({ risk }), [['low', 'Baixo'], ['medium', 'Médio'], ['high', 'Alto']])}
                    {pick('Escalão de atraso', f.aging, aging => set({ aging }), (Object.keys(AGING_LABELS) as AgingBucket[]).map(key => [key, AGING_LABELS[key]]))}
                    <div className="grid grid-cols-2 gap-2">
                        <div><p className="mb-1 text-xs font-semibold">Capital de (Kz)</p><Input type="number" min={0} value={f.minAmount} onChange={event => set({ minAmount: event.target.value })} /></div>
                        <div><p className="mb-1 text-xs font-semibold">Até (Kz)</p><Input type="number" min={0} value={f.maxAmount} onChange={event => set({ maxAmount: event.target.value })} /></div>
                        <div><p className="mb-1 text-xs font-semibold">Concedido de</p><Input type="date" value={f.grantedFrom} onChange={event => set({ grantedFrom: event.target.value })} /></div>
                        <div><p className="mb-1 text-xs font-semibold">Até</p><Input type="date" value={f.grantedTo} onChange={event => set({ grantedTo: event.target.value })} /></div>
                        <div><p className="mb-1 text-xs font-semibold">Vencimento de</p><Input type="date" value={f.dueFrom} onChange={event => set({ dueFrom: event.target.value })} /></div>
                        <div><p className="mb-1 text-xs font-semibold">Até</p><Input type="date" value={f.dueTo} onChange={event => set({ dueTo: event.target.value })} /></div>
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => { state.setFilters({ ...EMPTY_FILTERS }); state.setTab('todos'); state.setCard('all'); }}>Limpar filtros</Button>

                    <div className="space-y-2 rounded-xl border p-3">
                        <p className="flex items-center gap-1.5 text-sm font-bold"><Bookmark className="h-4 w-4 text-primary" /> Filtros guardados</p>
                        <div className="flex gap-2">
                            <Input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Atrasos da Maianga" />
                            <Button size="icon" aria-label="Guardar filtros" disabled={!name.trim()} onClick={() => { persist([...saved.filter(item => item.name !== name.trim()), { name: name.trim(), filters: f, tab: state.tab }]); setName(''); }}><Save className="h-4 w-4" /></Button>
                        </div>
                        {saved.map(item => (
                            <div key={item.name} className="flex items-center gap-2">
                                <button type="button" className="flex-1 rounded-md border px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { state.setFilters({ ...EMPTY_FILTERS, ...item.filters }); state.setTab(item.tab || 'todos'); }}>{item.name}</button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Apagar ${item.name}`} onClick={() => persist(saved.filter(other => other.name !== item.name))}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                        ))}
                        {!saved.length && <p className="text-xs text-muted-foreground">Ainda não guardou filtros.</p>}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
