import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, History, Loader2, Monitor, PauseCircle, PlayCircle, Save, Unplug } from 'lucide-react';
import Swal from 'sweetalert2';
import { Button } from '@/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { cn } from '@/bibliotecas/utils';

// Gestão de uma licença no Tango Master: renovar, mudar plano, suspender, libertar computadores e histórico.

export type LicencaGerida = {
    tenantId: string;
    companyName: string;
    plan: string;
    planName: string;
    tier: string;
    status: 'ativa' | 'suspensa' | 'expirada' | 'revogada';
    endsAt: string | null;
    daysRemaining: number | null;
    maxMachines: number;
    machines: number;
};

export type PlanoServidor = { id: string; name: string };

type Machine = { id: string; name: string | null; fingerprint: string; firstActivatedAt: string; lastHeartbeatAt: string | null; status: 'ativa' | 'libertada' };
type LicenseEvent = { id: string; type: string; detail: Record<string, any>; ip: string | null; at: string };

const EVENT_LABELS: Record<string, string> = {
    criada_por_migracao: 'Licença criada a partir da empresa na nuvem',
    chaves_antigas_importadas: 'Chaves antigas juntas nesta licença',
    chave_emitida: 'Chave de licença emitida',
    maquina_ativada: 'Computador activado',
    maquina_reativada: 'Computador reactivado',
    maquina_migrada: 'Computador de uma chave antiga passou para a licença nova',
    maquina_libertada: 'Computador libertado',
    ativacao_recusada: 'Activação ou renovação recusada',
    alterada_no_painel: 'Estado ou validade alterados no painel',
    plano_alterado: 'Plano alterado',
    expirou: 'A licença expirou',
};

const REFUSAL_LABELS: Record<string, string> = {
    LICENCA_SUSPENSA: 'licença suspensa', LICENCA_EXPIRADA: 'licença expirada', LICENCA_REVOGADA: 'licença revogada',
    LIMITE_MAQUINAS: 'limite de computadores atingido', MAQUINA_LIBERTADA: 'computador libertado',
};

const formatDateTime = (value: string | null) => value ? new Date(value).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString('pt-AO') : 'Sem data';

/** Resumo legível de um evento do histórico. */
const describeEvent = (event: LicenseEvent) => {
    const d = event.detail || {};
    switch (event.type) {
        case 'chave_emitida': return `${d.prefixo || ''}-…${d.substituiuChaveAnterior ? ` (substituiu ${d.prefixoAnterior || 'a anterior'})` : ''}`;
        case 'maquina_ativada':
        case 'maquina_reativada': return `${d.nome || 'Computador'} · ${d.activas}/${d.maximo} em uso`;
        case 'maquina_libertada': return d.nome || `Computador ${d.maquina || ''}`;
        case 'ativacao_recusada': return `Motivo: ${REFUSAL_LABELS[d.motivo] || d.motivo || '—'}${d.origem === 'heartbeat' ? ' (renovação)' : ''}`;
        case 'alterada_no_painel': return `${d.estadoAnterior} → ${d.estado}; fim ${formatDate(d.dataFimAnterior)} → ${formatDate(d.dataFim)}`;
        case 'plano_alterado': return `${d.antes?.plano} (${d.antes?.maxMaquinas}) → ${d.depois?.plano} (${d.depois?.maxMaquinas} computador(es))`;
        case 'chaves_antigas_importadas': return `${(d.chavesRevogadas || []).length} chave(s) antiga(s) revogada(s)`;
        default: return '';
    }
};

export function GerirLicenca({ license, plans, open, onOpenChange, api, notify, onRenew, onToggleStatus, onChanged }: {
    license: LicencaGerida | null;
    plans: PlanoServidor[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    api: (action: string, payload?: Record<string, any>) => Promise<any>;
    notify: (type: 'success' | 'error', message: string) => void;
    onRenew: (tenantId: string) => Promise<void>;
    onToggleStatus: (tenantId: string) => Promise<void>;
    onChanged: () => Promise<void>;
}) {
    const [machines, setMachines] = useState<Machine[]>([]);
    const [events, setEvents] = useState<LicenseEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState('');
    const [plan, setPlan] = useState('');
    const [tier, setTier] = useState('empresarial');
    const [maxMachines, setMaxMachines] = useState('1');

    const tenantId = license?.tenantId || '';
    const loadDetails = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const data = await api('license-details', { tenantId });
            setMachines(data.machines || []);
            setEvents(data.events || []);
        } catch (error: any) {
            notify('error', error?.message || 'Não foi possível obter os detalhes da licença.');
        } finally {
            setLoading(false);
        }
    }, [api, notify, tenantId]);

    useEffect(() => {
        if (!open || !license) return;
        setPlan(license.plan);
        setTier(license.tier);
        setMaxMachines(String(license.maxMachines));
        void loadDetails();
        // Só ao abrir para esta empresa: as alterações seguintes vêm de onChanged.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, tenantId]);

    if (!license) return null;

    const run = async (key: string, action: () => Promise<void>) => {
        setBusy(key);
        try {
            await action();
            await onChanged();
            await loadDetails();
        } finally {
            setBusy('');
        }
    };

    const savePlan = () => run('plan', async () => {
        try {
            const data = await api('license-change-plan', { tenantId, plan, tier, maxMachines: Number(maxMachines) });
            notify('success', data.overLimit
                ? `Plano alterado. Atenção: há ${data.activeMachines} computador(es) activos e o novo máximo é ${maxMachines}; liberte os que já não usa.`
                : 'Plano da licença alterado.');
        } catch (error: any) {
            notify('error', error?.message || 'Não foi possível alterar o plano.');
        }
    });

    const releaseMachine = async (machine: Machine) => {
        const confirmation = await Swal.fire({
            title: 'Libertar este computador?',
            html: `<b>${(machine.name || 'Computador').replace(/[<>&"]/g, '')}</b> deixa de renovar a licença (continua a funcionar até ao fim da validação actual, no máximo 7 dias) e o lugar fica livre para outro computador.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Libertar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#F37021',
        });
        if (!confirmation.isConfirmed) return;
        await run(`machine:${machine.id}`, async () => {
            try {
                await api('license-release-machine', { tenantId, activationId: machine.id });
                notify('success', 'Computador libertado.');
            } catch (error: any) {
                notify('error', error?.message || 'Não foi possível libertar o computador.');
            }
        });
    };

    const suspended = license.status === 'suspensa';
    const revoked = license.status === 'revogada';
    const activeMachines = machines.filter(machine => machine.status === 'ativa');
    const planChanged = plan !== license.plan || tier !== license.tier || Number(maxMachines) !== license.maxMachines;

    return (
        // Não modal: as confirmações (SweetAlert) abrem por cima e têm de receber cliques e teclado.
        <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
            <DialogContent
                className="max-h-[90vh] max-w-3xl overflow-y-auto shadow-2xl"
                onInteractOutside={event => event.preventDefault()}
                onEscapeKeyDown={event => { if (Swal.isVisible()) event.preventDefault(); }}
            >
                <DialogHeader>
                    <DialogTitle>{license.companyName}</DialogTitle>
                    <DialogDescription>
                        NIF {license.tenantId} · {license.planName} · {license.status === 'ativa'
                            ? (license.daysRemaining === null ? 'sem data de fim' : `${license.daysRemaining} dias restantes (até ${formatDate(license.endsAt)})`)
                            : license.status}
                    </DialogDescription>
                </DialogHeader>

                {/* Acções rápidas */}
                <div className="flex flex-wrap gap-2">
                    <Button onClick={() => run('renew', () => onRenew(tenantId))} disabled={!!busy || revoked} className="gap-2 bg-[#F37021] text-white hover:bg-orange-600">
                        {busy === 'renew' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} Renovar
                    </Button>
                    <Button variant="outline" onClick={() => run('status', () => onToggleStatus(tenantId))} disabled={!!busy || revoked} className="gap-2">
                        {busy === 'status' ? <Loader2 className="h-4 w-4 animate-spin" /> : suspended ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                        {suspended ? 'Reactivar' : 'Suspender'}
                    </Button>
                </div>

                {/* Plano */}
                <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                    <h4 className="mb-3 text-sm font-black text-slate-800 dark:text-slate-100">Plano</h4>
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end">
                        <label className="space-y-1 text-xs font-semibold text-slate-500">
                            <span>Plano</span>
                            <select value={plan} onChange={event => setPlan(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                                {plans.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                            </select>
                        </label>
                        <label className="space-y-1 text-xs font-semibold text-slate-500">
                            <span>Escalão</span>
                            <select value={tier} onChange={event => setTier(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                                <option value="empresarial">Empresarial</option>
                                <option value="singular">Pessoal (singular)</option>
                            </select>
                        </label>
                        <label className="space-y-1 text-xs font-semibold text-slate-500">
                            <span>Computadores</span>
                            <input type="number" min={1} max={10000} value={maxMachines} onChange={event => setMaxMachines(event.target.value)}
                                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                        </label>
                        <Button onClick={savePlan} disabled={!!busy || revoked || !planChanged || !(Number(maxMachines) >= 1)} className="gap-2">
                            {busy === 'plan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
                        </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">A data de fim muda com «Renovar». Os computadores já activados mantêm-se ao mudar o plano.</p>
                </section>

                {/* Computadores */}
                <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100">
                        <Monitor className="h-4 w-4 text-[#F37021]" /> Computadores ({activeMachines.length} de {license.maxMachines} em uso)
                    </h4>
                    {loading && !machines.length ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : !machines.length ? (
                        <p className="text-xs text-slate-500">Nenhum computador activado com esta licença.</p>
                    ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                            {machines.map(machine => (
                                <li key={machine.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                                    <div className="min-w-0">
                                        <p className={cn('font-bold', machine.status === 'ativa' ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 line-through')}>
                                            {machine.name || 'Computador sem nome'}
                                        </p>
                                        <p className="font-mono text-[10px] text-slate-400">
                                            {machine.fingerprint} · activado {formatDateTime(machine.firstActivatedAt)} · último contacto {formatDateTime(machine.lastHeartbeatAt)}
                                        </p>
                                    </div>
                                    {machine.status === 'ativa' ? (
                                        <Button variant="outline" size="sm" onClick={() => releaseMachine(machine)} disabled={!!busy} className="h-7 gap-1 text-[11px]">
                                            {busy === `machine:${machine.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />} Libertar
                                        </Button>
                                    ) : <span className="text-[10px] font-semibold uppercase text-slate-400">Libertado</span>}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* Histórico */}
                <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100">
                        <History className="h-4 w-4 text-[#F37021]" /> Histórico
                    </h4>
                    {!events.length ? <p className="text-xs text-slate-500">{loading ? 'A carregar…' : 'Sem registos.'}</p> : (
                        <ol className="max-h-72 space-y-2 overflow-y-auto pr-1">
                            {events.map(event => (
                                <li key={event.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/50">
                                    <div className="flex flex-wrap justify-between gap-2">
                                        <span className={cn('font-bold', event.type === 'ativacao_recusada' ? 'text-red-600' : 'text-slate-800 dark:text-slate-100')}>
                                            {EVENT_LABELS[event.type] || event.type}
                                        </span>
                                        <span className="text-[10px] text-slate-400">{formatDateTime(event.at)}{event.ip ? ` · ${event.ip}` : ''}</span>
                                    </div>
                                    {describeEvent(event) && <p className="mt-0.5 text-slate-500">{describeEvent(event)}</p>}
                                </li>
                            ))}
                        </ol>
                    )}
                </section>
            </DialogContent>
        </Dialog>
    );
}
