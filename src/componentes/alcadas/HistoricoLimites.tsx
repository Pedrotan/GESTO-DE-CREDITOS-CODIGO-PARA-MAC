import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Columns2, GitCompare, History, RotateCcw } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Switch } from '@/componentes/ui/switch';
import { OPERATION_LABELS, diffPolicies, formatKz, type OperationType } from '@/bibliotecas/alcadas';
import { formatLuandaDateTime, luandaDateKey, luandaToUtc } from '@/bibliotecas/fuso-angola';
import { durationLabel } from '@/bibliotecas/relatorios-alcadas';
import { ServicoAlcadas, type PolicyVersion } from '@/servicos/ServicoAlcadas';
import { DialogoDecisao } from './AvisosAlcadas';
import type { AlcadasState } from './useAlcadas';

const STATUS: Record<PolicyVersion['status'], { label: string; css: string }> = {
    approved: { label: 'Aprovada', css: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
    pending: { label: 'À espera de 2.º administrador', css: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
    rejected: { label: 'Rejeitada', css: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
    cancelled: { label: 'Cancelada', css: 'bg-muted text-muted-foreground' },
};
const ESCALATION_STATUS: Record<string, string> = { pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada', cancelled: 'Cancelada' };

export function HistoricoLimites({ state }: { state: AlcadasState }) {
    const versions = useMemo(() => state.data?.versions || [], [state.data]);
    const [selected, setSelected] = useState<string[]>([]);
    const [restoring, setRestoring] = useState<PolicyVersion | null>(null);
    const [schedule, setSchedule] = useState<{ enabled: boolean; date: string }>({ enabled: false, date: '' });
    const [onlyToday, setOnlyToday] = useState(false);
    useEffect(() => { if (!selected.length && versions.length >= 2) setSelected([versions[1].id, versions[0].id]); }, [versions, selected.length]);
    const [left, right] = useMemo(() => {
        const chosen = selected.map(id => versions.find(item => item.id === id)).filter(Boolean) as PolicyVersion[];
        return chosen.sort((a, b) => a.version - b.version);
    }, [selected, versions]);
    const comparison = useMemo(() => left && right ? diffPolicies(left.policy, right.policy, state.profileName) : [], [left, right, state.profileName]);
    const activeId = state.data?.version?.id;
    const today = luandaDateKey(state.now);
    const escalations = (state.data?.escalations || []).filter(item => !onlyToday || luandaDateKey(item.createdAt) === today).slice(0, 40);
    const toggle = (id: string) => setSelected(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous.slice(-1), id]);

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border bg-card shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                    <h3 className="flex items-center gap-2 text-lg font-bold"><History className="h-5 w-5 text-primary" /> Versões dos limites</h3>
                    <p className="text-xs text-muted-foreground">Selecione duas versões para as comparar lado a lado. Repor uma versão é uma nova alteração, com motivo.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                            <tr><th className="p-3"><Columns2 className="h-4 w-4" /></th><th className="p-3 text-left">Versão</th><th className="p-3 text-left">Estado</th><th className="p-3 text-left">Em vigor desde</th><th className="p-3 text-left">Quem e quando</th><th className="p-3 text-left">Motivo</th><th className="p-3 text-right">Ações</th></tr>
                        </thead>
                        <tbody>
                            {versions.map(version => (
                                <tr key={version.id} className={cn('border-t align-top', version.id === activeId && 'bg-primary/5')}>
                                    <td className="p-3 text-center"><input type="checkbox" aria-label={`Comparar a versão ${version.version}`} checked={selected.includes(version.id)} onChange={() => toggle(version.id)} className="h-4 w-4 accent-[hsl(var(--primary))]" /></td>
                                    <td className="p-3"><p className="font-bold">v{version.version}</p>{version.id === activeId && <p className="text-[10px] font-black uppercase text-primary">Em vigor</p>}{version.restoredFrom && <p className="text-[10px] text-muted-foreground">Reposição de v{versions.find(item => item.id === version.restoredFrom)?.version ?? '?'}</p>}</td>
                                    <td className="p-3"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS[version.status].css)}>{STATUS[version.status].label}</span></td>
                                    <td className="p-3 text-xs">{formatLuandaDateTime(version.effectiveFrom)}{version.status === 'approved' && new Date(version.effectiveFrom).getTime() > state.now.getTime() && <p className="font-semibold text-sky-700">Agendada</p>}</td>
                                    <td className="p-3 text-xs"><p><strong>{version.createdByName}</strong> · {formatLuandaDateTime(version.createdAt)}</p>
                                        {version.decidedByName && <p className="text-muted-foreground">{version.status === 'rejected' ? 'Rejeitada' : 'Aprovada'} por {version.decidedByName} · {formatLuandaDateTime(version.decidedAt)}</p>}</td>
                                    <td className="max-w-[340px] p-3 text-xs"><p className="line-clamp-2" title={version.reason}>{version.reason}</p>
                                        <details className="mt-1"><summary className="cursor-pointer text-primary">{version.summary.length} alteração(ões)</summary>
                                            <ul className="mt-1 list-disc space-y-0.5 pl-4">{version.summary.map(line => <li key={line}>{line}</li>)}</ul></details></td>
                                    <td className="p-3 text-right">
                                        {state.canEdit && version.id !== activeId && version.status === 'approved' && (
                                            <Button size="sm" variant="outline" className="gap-1" onClick={() => { setSchedule({ enabled: false, date: '' }); setRestoring(version); }}><RotateCcw className="h-3.5 w-3.5" /> Repor</Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {!versions.length && <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">Ainda não há versões guardadas: estão em vigor os valores por omissão (a partir dos limites anteriores).</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>

            {left && right && (
                <section className="rounded-2xl border bg-card p-4 shadow-sm">
                    <h3 className="mb-3 flex items-center gap-2 text-lg font-bold"><GitCompare className="h-5 w-5 text-primary" /> Comparação: v{left.version} ↔ v{right.version}</h3>
                    {comparison.length ? (
                        <div className="overflow-x-auto rounded-xl border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="p-2 text-left">Campo</th><th className="p-2 text-left">v{left.version} ({formatLuandaDateTime(left.effectiveFrom)})</th><th className="p-2 text-left">v{right.version} ({formatLuandaDateTime(right.effectiveFrom)})</th></tr></thead>
                                <tbody>{comparison.map(change => (
                                    <tr key={change.path} className="border-t">
                                        <td className="p-2 font-medium">{change.label}</td>
                                        <td className="p-2 text-red-700 dark:text-red-300">{change.before}</td>
                                        <td className="p-2 font-semibold text-emerald-700 dark:text-emerald-300">{change.after}{change.increasePct !== null && change.increasePct !== Infinity && <span className="ml-1 text-[11px]">(+{String(change.increasePct).replace('.', ',')}%)</span>}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    ) : <p className="text-sm text-muted-foreground">As duas versões têm os mesmos valores.</p>}
                </section>
            )}

            <section className="rounded-2xl border bg-card shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                    <h3 className="flex items-center gap-2 text-lg font-bold"><ArrowUpRight className="h-5 w-5 text-primary" /> Operações escaladas</h3>
                    <label className="flex items-center gap-2 text-xs font-semibold"><Switch checked={onlyToday} onCheckedChange={setOnlyToday} /> Só hoje</label>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="p-3 text-left">Data/hora</th><th className="p-3 text-left">Operação</th><th className="p-3 text-right">Valor</th><th className="p-3 text-left">Motivo</th><th className="p-3 text-left">Estado</th><th className="p-3 text-left">Tempo</th></tr></thead>
                        <tbody>
                            {escalations.map(item => (
                                <tr key={item.id} className="border-t align-top">
                                    <td className="p-3 text-xs">{formatLuandaDateTime(item.createdAt)}<p className="text-muted-foreground">{item.requestedByName}</p></td>
                                    <td className="p-3">{OPERATION_LABELS[item.operationType as OperationType] || item.operationType}</td>
                                    <td className="p-3 text-right font-mono text-xs">{formatKz(item.amountMinor)}</td>
                                    <td className="max-w-[360px] p-3 text-xs"><p className="font-semibold">{item.reason}</p>{item.escalationCount > 0 && <p className="text-amber-700">Subiu {item.escalationCount}× por falta de decisão</p>}</td>
                                    <td className="p-3 text-xs">{ESCALATION_STATUS[item.status] || item.status}{item.decidedByName && <p className="text-muted-foreground">por {item.decidedByName}</p>}</td>
                                    <td className="p-3 text-xs">{item.decidedAt ? durationLabel(item.createdAt, item.decidedAt) : `há ${durationLabel(item.createdAt, state.now.toISOString())}`}</td>
                                </tr>
                            ))}
                            {!escalations.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Sem operações escaladas{onlyToday ? ' hoje' : ''}.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>

            <DialogoDecisao open={!!restoring} userId={state.user?.id} title={`Repor a versão ${restoring?.version}`}
                description="Os valores desta versão passam a ser uma nova versão, com as mesmas regras: motivo obrigatório e segundo administrador quando há aumentos grandes ou desativações."
                confirmLabel="Repor versão" onClose={() => setRestoring(null)}
                onConfirm={async reason => {
                    if (!restoring || !state.actor) return;
                    const effectiveFrom = schedule.enabled && schedule.date ? luandaToUtc(schedule.date).toISOString() : null;
                    await ServicoAlcadas.restore(restoring.id, reason, state.actor, state.profileName, effectiveFrom);
                    await state.reload({ resetDraft: true });
                }}>
                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 p-3 text-sm">
                    <label className="flex items-center gap-2 font-semibold"><Switch checked={schedule.enabled} onCheckedChange={enabled => setSchedule(previous => ({ ...previous, enabled }))} /> Agendar entrada em vigor</label>
                    {schedule.enabled && <Input type="date" className="h-9 w-44" value={schedule.date} min={luandaDateKey(new Date(Date.now() + 86_400_000))} onChange={event => setSchedule(previous => ({ ...previous, date: event.target.value }))} />}
                </div>
            </DialogoDecisao>
        </div>
    );
}
