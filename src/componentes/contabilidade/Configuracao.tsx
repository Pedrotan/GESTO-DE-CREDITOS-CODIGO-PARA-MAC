import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { Input } from '@/componentes/ui/input';
import { Switch } from '@/componentes/ui/switch';
import { Checkbox } from '@/componentes/ui/checkbox';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useToast } from '@/componentes/ui/use-toast';
import { formatDate } from '@/bibliotecas/formatters';
import { ACCOUNT_CLASS_LABELS, CHART_OF_ACCOUNTS, accountDefinition, naturalBalance } from '@/bibliotecas/plano-contas';
import { angolaHolidays, type WorkingTimeConfig } from '@/bibliotecas/feriados-angola';
import { balanceAt } from '@/bibliotecas/relatorios-contabeis';
import { ServicoDefinicoesPartilhadas } from '@/servicos/ServicoDefinicoesPartilhadas';
import { ServicoContabilidadeGeral } from '@/servicos/ServicoContabilidadeGeral';
import { ServicoAutoBackup } from '@/servicos/ServicoAutoBackup';
import { LimitesAprovacao } from '@/componentes/LimitesAprovacao';
import { AvisoErro, BotoesExportar, SeccaoCabecalho } from './comum';
import { isAdminRole, money } from './formato';
import type { AccountCatalog, ContabilidadeData } from './useContabilidade';

export function PlanoContas({ data }: { data: ContabilidadeData }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const admin = isAdminRole(user?.role);
    const [catalog, setCatalog] = useState<AccountCatalog>(data.catalog);
    const [busy, setBusy] = useState(false);
    useEffect(() => { setCatalog(data.catalog); }, [data.catalog]);
    const accounts = useMemo(() => {
        const used = new Set(data.journal.flatMap(entry => entry.lines.map(line => line.account)));
        return [...new Set([...CHART_OF_ACCOUNTS.map(item => item.account), ...used])].map(account => accountDefinition(account));
    }, [data.journal]);
    const save = async () => {
        if (!user) return;
        setBusy(true);
        try {
            await ServicoDefinicoesPartilhadas.set('accounting_account_catalog', JSON.stringify(catalog), user.name);
            toast({ title: 'Plano de contas guardado', description: 'Os nomes e códigos personalizados ficam partilhados por todos os dispositivos. Os lançamentos não mudam.' });
            await data.reload();
        } catch (failure: any) { toast({ title: 'Não foi possível guardar', description: failure?.message, variant: 'destructive' }); }
        finally { setBusy(false); }
    };
    const grouped = Object.keys(ACCOUNT_CLASS_LABELS).map(key => ({ key, label: ACCOUNT_CLASS_LABELS[key as keyof typeof ACCOUNT_CLASS_LABELS], items: accounts.filter(item => item.accountClass === key) })).filter(group => group.items.length);
    return (
        <div className="space-y-4">
            <SeccaoCabecalho title="Plano de contas" description="Contas usadas pelo razão, com classe e natureza. O contabilista pode ajustar o código e o nome de cada conta ao plano aprovado; os lançamentos e saldos não mudam."
                actions={<>
                    <BotoesExportar build={() => ({
                        title: 'Plano de contas', fileName: 'plano-de-contas', numericColumns: [5],
                        head: ['Código', 'Conta', 'Classe', 'Natureza', 'Descrição', 'Saldo actual'],
                        body: accounts.map(item => [catalog[item.account]?.code || item.code, catalog[item.account]?.name || item.name, ACCOUNT_CLASS_LABELS[item.accountClass], item.nature === 'debit' ? 'Devedora' : 'Credora', item.description, money(naturalBalance(item.account, balanceAt(data.journal, item.account, null)))]),
                    })} />
                    {admin && <Button size="sm" disabled={busy} onClick={() => void save()}>Guardar plano de contas</Button>}
                </>} />
            {grouped.map(group => (
                <div key={group.key} className="overflow-hidden rounded-xl border bg-card">
                    <p className="bg-muted/50 px-4 py-2 text-sm font-bold uppercase tracking-wide">{group.label}</p>
                    <div className="divide-y">
                        {group.items.map(item => (
                            <div key={item.account} className="grid items-center gap-2 px-4 py-2.5 text-sm md:grid-cols-[110px_1fr_140px_150px]">
                                <Input aria-label={`Código de ${item.name}`} disabled={!admin} value={catalog[item.account]?.code ?? item.code} className="h-8 font-mono"
                                    onChange={event => setCatalog(previous => ({ ...previous, [item.account]: { ...previous[item.account], code: event.target.value } }))} />
                                <div>
                                    <Input aria-label={`Nome de ${item.name}`} disabled={!admin} value={catalog[item.account]?.name ?? item.name} className="h-8"
                                        onChange={event => setCatalog(previous => ({ ...previous, [item.account]: { ...previous[item.account], name: event.target.value } }))} />
                                    <p className="mt-1 text-[11px] text-muted-foreground">{item.description}</p>
                                </div>
                                <Badge variant="outline" className="justify-center">{item.nature === 'debit' ? 'Natureza devedora' : 'Natureza credora'}</Badge>
                                <span className="text-right font-mono font-semibold">{money(naturalBalance(item.account, balanceAt(data.journal, item.account, null)))}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function RegrasContabeis({ data }: { data: ContabilidadeData }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const admin = isAdminRole(user?.role);
    const [cashGuard, setCashGuard] = useState(data.config.cashGuard);
    const [time, setTime] = useState<WorkingTimeConfig>(data.config.workingTime);
    const [newHoliday, setNewHoliday] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { setCashGuard(data.config.cashGuard); setTime(data.config.workingTime); }, [data.config]);
    const year = new Date().getFullYear();
    const holidays = useMemo(() => [...angolaHolidays(year).entries()].sort(([a], [b]) => a.localeCompare(b)), [year]);
    const backup = ServicoAutoBackup.getConfig();
    const save = async () => {
        if (!user) return;
        setBusy(true); setError('');
        try {
            await ServicoContabilidadeGeral.saveConfig({ ...data.config, cashGuard, workingTime: time }, { id: user.id, name: user.name, role: user.role });
            toast({ title: 'Regras guardadas', description: 'Ficam registadas na trilha e partilhadas por todos os dispositivos.' });
            await data.reload();
        } catch (failure: any) { setError(failure?.message); } finally { setBusy(false); }
    };
    return (
        <div className="space-y-5">
            <SeccaoCabecalho title="Regras de controlo" description="Controlo de saldo nos desembolsos e expediente usado pela auditoria para assinalar pagamentos em dias não úteis, feriados ou fora de horas."
                actions={admin ? <Button size="sm" disabled={busy} onClick={() => void save()}>{busy ? 'A guardar…' : 'Guardar regras'}</Button> : undefined} />
            <AvisoErro message={error} />
            <div className="rounded-xl border bg-card p-4">
                <label className="flex items-start gap-3">
                    <Switch checked={cashGuard} disabled={!admin} onCheckedChange={setCashGuard} />
                    <span><span className="font-semibold">Bloquear desembolsos e despesas sem saldo em Caixa e Bancos</span>
                        <span className="block text-sm text-muted-foreground">Recomendado. Desligado, a aplicação deixa sair dinheiro que a contabilidade não tem e a auditoria assinala "Desembolso sem saldo disponível".</span></span>
                </label>
            </div>
            <div className="rounded-xl border bg-card p-4">
                <p className="mb-3 font-semibold">Expediente</p>
                <div className="mb-3 flex flex-wrap gap-3">
                    {WEEKDAYS.map((label, day) => (
                        <label key={label} className="flex items-center gap-2 text-sm">
                            <Checkbox checked={time.workDays.includes(day)} disabled={!admin}
                                onCheckedChange={checked => setTime(previous => ({ ...previous, workDays: checked ? [...previous.workDays, day].sort() : previous.workDays.filter(item => item !== day) }))} />{label}
                        </label>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span>Das</span><Input type="number" min={0} max={24} disabled={!admin} value={time.startHour} className="h-9 w-20" onChange={event => setTime(previous => ({ ...previous, startHour: Number(event.target.value) }))} />
                    <span>às</span><Input type="number" min={0} max={24} disabled={!admin} value={time.endHour} className="h-9 w-20" onChange={event => setTime(previous => ({ ...previous, endHour: Number(event.target.value) }))} /><span>horas</span>
                </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border bg-card p-4">
                    <label className="mb-3 flex items-center gap-3"><Switch checked={time.useNationalHolidays} disabled={!admin} onCheckedChange={checked => setTime(previous => ({ ...previous, useNationalHolidays: checked }))} /><span className="font-semibold">Feriados nacionais de Angola ({year})</span></label>
                    <ul className="space-y-1 text-sm">
                        {holidays.map(([date, name]) => <li key={date} className="flex justify-between gap-2"><span>{name}</span><span className="text-muted-foreground">{formatDate(`${date}T12:00:00`)}</span></li>)}
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">Carnaval e Sexta-Feira Santa são calculados a partir da Páscoa de cada ano.</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                    <p className="mb-2 font-semibold">Outros dias sem expediente</p>
                    <p className="mb-3 text-xs text-muted-foreground">Pontes, tolerâncias de ponto e feriados municipais.</p>
                    {admin && (
                        <div className="mb-3 flex gap-2">
                            <Input type="date" value={newHoliday} onChange={event => setNewHoliday(event.target.value)} className="h-9 w-44" />
                            <Button size="sm" variant="outline" className="gap-1" disabled={!newHoliday || time.extraHolidays.includes(newHoliday)}
                                onClick={() => { setTime(previous => ({ ...previous, extraHolidays: [...previous.extraHolidays, newHoliday].sort() })); setNewHoliday(''); }}><Plus className="h-4 w-4" />Adicionar</Button>
                        </div>
                    )}
                    <ul className="space-y-1 text-sm">
                        {time.extraHolidays.map(date => (
                            <li key={date} className="flex items-center justify-between"><span>{formatDate(`${date}T12:00:00`)}</span>
                                {admin && <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Remover" onClick={() => setTime(previous => ({ ...previous, extraHolidays: previous.extraHolidays.filter(item => item !== date) }))}><Trash2 className="h-3.5 w-3.5" /></Button>}
                            </li>
                        ))}
                        {time.extraHolidays.length === 0 && <li className="text-muted-foreground">Nenhum dia adicional.</li>}
                    </ul>
                </div>
            </div>
            <LimitesAprovacao />
            <div className="rounded-xl border bg-card p-4 text-sm">
                <p className="font-semibold">Cópias de segurança</p>
                <p className="text-muted-foreground">Backup automático: {backup.enabled ? 'activo' : 'desactivado'} · Última cópia: {backup.lastAutoBackupTimestamp ? formatDate(backup.lastAutoBackupTimestamp) : 'sem confirmação'}. Configure o horário e a retenção em Definições.</p>
            </div>
        </div>
    );
}
