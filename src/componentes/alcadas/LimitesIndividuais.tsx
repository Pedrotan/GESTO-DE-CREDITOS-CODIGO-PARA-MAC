import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Pencil, Plus, Trash2, UserCog } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { Button } from '@/componentes/ui/button';
import { Textarea } from '@/componentes/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Switch } from '@/componentes/ui/switch';
import { FIELD_LABELS, OPERATION_LABELS, OPERATION_TYPES, formatLimitValue, isMoneyField, type LimitField, type LimitValues, type OperationType } from '@/bibliotecas/alcadas';
import { formatLuandaDateTime } from '@/bibliotecas/fuso-angola';
import { MoneyCell, NumberCell } from './campos';
import type { AlcadasState } from './useAlcadas';

// Campo vazio no diálogo = segue o perfil (não há "sem teto" individual).
const withField = (values: Partial<Record<LimitField, number | null>>, field: LimitField, value: number | null) => {
    const next = { ...values };
    if (value === null) delete next[field]; else next[field] = value;
    return next;
};

type Editing = { userId: string; operationType: OperationType; allowed: boolean; values: Partial<Record<LimitField, number | null>>; reason: string };

export function LimitesIndividuais({ state }: { state: AlcadasState }) {
    const draft = state.draft!;
    const users = state.data?.users || [];
    const [editing, setEditing] = useState<Editing | null>(null);
    const [error, setError] = useState('');
    const op = editing ? OPERATION_TYPES.find(item => item.id === editing.operationType)! : null;
    const editingUser = users.find(user => user.id === editing?.userId);
    const profileValues = editingUser ? draft.profiles[editingUser.role]?.ops[editing!.operationType] : undefined;
    const list = useMemo(() => [...draft.userOverrides].sort((a, b) => a.userName.localeCompare(b.userName)), [draft.userOverrides]);

    const save = () => {
        if (!editing || !editingUser || !op) return;
        if (editing.reason.trim().length < 10) { setError('Indique o motivo do limite individual (pelo menos 10 caracteres).'); return; }
        const values: Partial<LimitValues> = { allowed: editing.allowed };
        for (const field of op.fields) if (editing.values[field] !== undefined) values[field] = editing.values[field];
        state.setDraft(policy => {
            let override = policy.userOverrides.find(item => item.userId === editing.userId);
            if (!override) { override = { userId: editing.userId, userName: editingUser.name, ops: {}, reason: '', setBy: '', setAt: '' }; policy.userOverrides.push(override); }
            override.ops[editing.operationType] = values;
            override.reason = editing.reason.trim();
            override.setBy = state.user?.name || '';
            override.setAt = new Date().toISOString();
            return policy;
        });
        setEditing(null); setError('');
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-3xl text-sm text-muted-foreground">Um utilizador pode ter limites diferentes do seu perfil, acima ou abaixo, com motivo obrigatório. Ficam destacados como <strong>exceção</strong>; os aumentos exigem a aprovação de um segundo administrador quando se guardam as alterações.</p>
                <Button size="sm" className="gap-1.5" disabled={!users.length} onClick={() => { setError(''); setEditing({ userId: users[0]?.id || '', operationType: 'credit_approval', allowed: true, values: {}, reason: '' }); }}>
                    <Plus className="h-4 w-4" /> Adicionar limite individual
                </Button>
            </div>
            {!list.length && (
                <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                    <UserCog className="mx-auto mb-2 h-8 w-8 opacity-50" />Nenhum utilizador tem limites próprios: todos seguem o seu perfil.
                </div>
            )}
            <div className="grid gap-4 xl:grid-cols-2">
                {list.map(override => {
                    const user = users.find(item => item.id === override.userId);
                    const role = user?.role || '';
                    return (
                        <div key={override.userId} className="rounded-xl border-2 border-amber-300 bg-card p-4 shadow-sm dark:border-amber-800">
                            <div className="mb-3 flex items-start justify-between gap-2">
                                <div>
                                    <p className="flex items-center gap-2 font-bold">{override.userName}
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">Exceção</span></p>
                                    <p className="text-xs text-muted-foreground">Perfil: {role ? state.profileName(role) : 'utilizador removido'}{override.setBy ? ` · definido por ${override.setBy}${override.setAt ? ` em ${formatLuandaDateTime(override.setAt)}` : ''}` : ''}</p>
                                </div>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Remover todos os limites próprios (volta ao perfil)"
                                    onClick={() => state.setDraft(policy => { policy.userOverrides = policy.userOverrides.filter(item => item.userId !== override.userId); return policy; })}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                            <div className="space-y-2">
                                {Object.entries(override.ops).map(([opId, values]) => {
                                    const opInfo = OPERATION_TYPES.find(item => item.id === opId)!;
                                    const base = draft.profiles[role]?.ops[opId as OperationType];
                                    return (
                                        <div key={opId} className="rounded-lg bg-muted/40 p-2.5">
                                            <div className="mb-1 flex items-center justify-between gap-2">
                                                <p className="text-sm font-semibold">{OPERATION_LABELS[opId as OperationType]}</p>
                                                <div className="flex gap-1">
                                                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => { setError(''); setEditing({ userId: override.userId, operationType: opId as OperationType, allowed: values?.allowed ?? true, values: { ...values } as Editing['values'], reason: override.reason }); }}><Pencil className="h-3.5 w-3.5" /></Button>
                                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Remover esta operação"
                                                        onClick={() => state.setDraft(policy => {
                                                            const target = policy.userOverrides.find(item => item.userId === override.userId);
                                                            if (target) delete target.ops[opId as OperationType];
                                                            policy.userOverrides = policy.userOverrides.filter(item => Object.keys(item.ops).length);
                                                            return policy;
                                                        })}><Trash2 className="h-3.5 w-3.5" /></Button>
                                                </div>
                                            </div>
                                            {values?.allowed === false ? <p className="text-xs font-semibold text-red-700 dark:text-red-300">Bloqueada para este utilizador.</p> : (
                                                <div className="grid gap-1 text-xs sm:grid-cols-2">
                                                    {opInfo.fields.filter(field => values?.[field] !== undefined).map(field => {
                                                        const own = values?.[field] as number | null;
                                                        const profile = base?.allowed ? (base[field] as number | null | undefined) : undefined;
                                                        const higher = own === null || (profile !== undefined && profile !== null && Number(own) > Number(profile));
                                                        return (
                                                            <p key={field} className="flex items-center gap-1">
                                                                {higher ? <ArrowUpRight className="h-3.5 w-3.5 text-amber-600" /> : <ArrowDownRight className="h-3.5 w-3.5 text-slate-500" />}
                                                                <span className="text-muted-foreground">{FIELD_LABELS[field]}:</span>
                                                                <span className="line-through opacity-60">{profile === undefined ? 'bloqueada' : formatLimitValue(field, profile)}</span>
                                                                <span>→</span><strong className={cn(higher && 'text-amber-700 dark:text-amber-400')}>{formatLimitValue(field, own)}</strong>
                                                            </p>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="mt-3 text-xs"><span className="font-semibold">Motivo:</span> {override.reason || <span className="text-red-600">em falta</span>}</p>
                        </div>
                    );
                })}
            </div>

            <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Limite individual</DialogTitle>
                        <DialogDescription>Os campos vazios seguem o perfil. Aumentos acima do perfil exigem um segundo administrador ao guardar.</DialogDescription>
                    </DialogHeader>
                    {editing && op && (
                        <div className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div><p className="mb-1 text-xs font-semibold">Utilizador</p>
                                    <Select value={editing.userId} onValueChange={userId => setEditing({ ...editing, userId, values: {} })}>
                                        <SelectTrigger><SelectValue placeholder="Escolha o utilizador" /></SelectTrigger>
                                        <SelectContent>{users.map(user => <SelectItem key={user.id} value={user.id}>{user.name} · {state.profileName(user.role)}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div><p className="mb-1 text-xs font-semibold">Operação</p>
                                    <Select value={editing.operationType} onValueChange={value => setEditing({ ...editing, operationType: value as OperationType, values: {} })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>{OPERATION_TYPES.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm font-semibold"><Switch checked={editing.allowed} onCheckedChange={allowed => setEditing({ ...editing, allowed })} /> {editing.allowed ? 'Permitida para este utilizador' : 'Bloqueada para este utilizador'}</label>
                            {editing.allowed && (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {op.fields.map(field => (
                                        <div key={field}>
                                            <p className="mb-1 text-xs font-semibold capitalize">{FIELD_LABELS[field]} <span className="font-normal text-muted-foreground">(perfil: {profileValues?.allowed ? formatLimitValue(field, profileValues[field] as number | null) : 'bloqueada'})</span></p>
                                            {isMoneyField(field)
                                                ? <MoneyCell ariaLabel={FIELD_LABELS[field]} value={editing.values[field] ?? null} emptyLabel="Como o perfil" onChange={value => setEditing({ ...editing, values: withField(editing.values, field, value) })} />
                                                : <NumberCell ariaLabel={FIELD_LABELS[field]} emptyLabel="Como o perfil" value={editing.values[field] ?? null} suffix={field === 'maxPercent' ? '%' : undefined} onChange={value => setEditing({ ...editing, values: withField(editing.values, field, value) })} />}
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div><p className="mb-1 text-xs font-semibold">Motivo do limite individual (obrigatório)</p>
                                <Textarea rows={2} value={editing.reason} onChange={event => setEditing({ ...editing, reason: event.target.value })} placeholder="Ex.: Gestor sénior responsável pela carteira de empresas da agência Maianga." /></div>
                            {error && <p className="text-sm text-destructive">{error}</p>}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                        <Button onClick={save}>Aplicar ao rascunho</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
