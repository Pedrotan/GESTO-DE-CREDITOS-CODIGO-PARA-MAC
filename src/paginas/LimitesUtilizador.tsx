import { useState, type ComponentType } from 'react';
import { BarChart3, FileBarChart, GitBranch, Globe2, History, Info, Loader2, RefreshCw, ShieldCheck, Timer, UserCog } from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { AlertModal, type AlertModalType } from '@/componentes/ui/AlertModal';
import { cn } from '@/bibliotecas/utils';
import { chainLabel } from '@/bibliotecas/alcadas';
import { useAlcadas } from '@/componentes/alcadas/useAlcadas';
import { CartoesAlcadas, type LimitsTab } from '@/componentes/alcadas/CartoesAlcadas';
import { AvisosAlcadas } from '@/componentes/alcadas/AvisosAlcadas';
import { TabelaLimitesPerfil } from '@/componentes/alcadas/TabelaLimitesPerfil';
import { CadeiaAprovacao } from '@/componentes/alcadas/CadeiaAprovacao';
import { LimitesIndividuais } from '@/componentes/alcadas/LimitesIndividuais';
import { LimitesGlobais } from '@/componentes/alcadas/LimitesGlobais';
import { ConsumoLimites } from '@/componentes/alcadas/ConsumoLimites';
import { ExcecoesTemporarias } from '@/componentes/alcadas/ExcecoesTemporarias';
import { HistoricoLimites } from '@/componentes/alcadas/HistoricoLimites';
import { BarraAlteracoes, ModalGuardarLimites } from '@/componentes/alcadas/GuardarAlteracoes';
import { RelatoriosLimites } from '@/componentes/alcadas/RelatoriosLimites';

// Limites de Transação (alçadas bancárias): limites por perfil e por tipo de operação, cadeia de aprovação
// com dupla aprovação, limites individuais e globais, consumo em tempo real, exceções temporárias e histórico
// de versões. A verificação real acontece nos serviços e no servidor; esta página mostra e gere.

const TABS: Array<{ id: LimitsTab; label: string; icon: ComponentType<{ className?: string }> }> = [
    { id: 'perfil', label: 'Limites por Perfil', icon: ShieldCheck },
    { id: 'cadeia', label: 'Cadeia de Aprovação', icon: GitBranch },
    { id: 'individuais', label: 'Limites Individuais', icon: UserCog },
    { id: 'globais', label: 'Limites Globais', icon: Globe2 },
    { id: 'consumo', label: 'Consumo', icon: BarChart3 },
    { id: 'excecoes', label: 'Exceções Temporárias', icon: Timer },
    { id: 'historico', label: 'Histórico', icon: History },
];

export default function UserLimits() {
    const state = useAlcadas();
    const [tab, setTab] = useState<LimitsTab>('perfil');
    const [saving, setSaving] = useState(false);
    const [reports, setReports] = useState(false);
    const [notice, setNotice] = useState<{ title: string; description: string; type: AlertModalType } | null>(null);
    const editTabs: LimitsTab[] = ['perfil', 'cadeia', 'individuais', 'globais'];

    return (
        <MainLayout title="Limites de Transação" subtitle="Alçadas, cadeia de aprovação e consumo">
            <div className="space-y-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Limites de Transação</h1>
                        <p className="text-muted-foreground">Alçadas por perfil e por operação, como num banco: quem pode aprovar o quê, até quanto, e o que sobe na cadeia.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReports(true)} disabled={!state.data}><FileBarChart className="h-4 w-4" /> Relatórios</Button>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void state.reload({ silent: false })} disabled={state.loading}>
                            {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar
                        </Button>
                    </div>
                </div>

                {state.policy && (
                    <div className="flex items-start gap-3 rounded-xl border border-primary/10 bg-primary/5 p-4 text-sm text-primary">
                        <Info className="mt-0.5 h-5 w-5 shrink-0" />
                        <p>Cada operação é verificada no servidor, na mesma transação, contra a alçada de quem a faz. Acima dela vai para a fila de <strong>Aprovações</strong> com o motivo e o nível exigido.
                            Cadeia em vigor: <strong>{chainLabel(state.policy)}</strong>. Sem limite definido, a operação fica bloqueada.</p>
                    </div>
                )}
                {!state.canEdit && state.data && <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">Pode consultar os limites; alterá-los exige a permissão «Limites › Editar».</p>}
                {state.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}

                <CartoesAlcadas state={state} onSelect={setTab} />
                <AvisosAlcadas state={state} onOpenExceptions={() => setTab('excecoes')} />

                <div className="-mx-1 overflow-x-auto px-1">
                    <div role="tablist" aria-label="Secções dos limites" className="inline-flex min-w-full gap-1 rounded-xl border bg-card p-1 shadow-sm">
                        {TABS.map(item => {
                            const Icon = item.icon;
                            const dirtyHere = state.dirty && editTabs.includes(item.id) && state.changes.some(change => ({ perfil: 'profile', cadeia: 'chain', individuais: 'override', globais: 'global' } as Record<string, string>)[item.id] === change.kind
                                || (item.id === 'cadeia' && change.kind === 'risk'));
                            return (
                                <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
                                    className={cn('relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                                        tab === item.id ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                                    <Icon className="h-4 w-4" /> {item.label}
                                    {dirtyHere && <span className="h-2 w-2 rounded-full bg-sky-400" title="Alterações por guardar" />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {!state.draft || !state.policy ? (
                    <div className="flex h-60 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> A carregar limites…</div>
                ) : (
                    <div role="tabpanel" className="animate-fade-in">
                        {tab === 'perfil' && <TabelaLimitesPerfil state={state} />}
                        {tab === 'cadeia' && <CadeiaAprovacao state={state} />}
                        {tab === 'individuais' && <LimitesIndividuais state={state} />}
                        {tab === 'globais' && <LimitesGlobais state={state} />}
                        {tab === 'consumo' && <ConsumoLimites state={state} />}
                        {tab === 'excecoes' && <ExcecoesTemporarias state={state} />}
                        {tab === 'historico' && <HistoricoLimites state={state} />}
                    </div>
                )}

                <BarraAlteracoes state={state} onSave={() => setSaving(true)} />
            </div>

            <ModalGuardarLimites state={state} open={saving} onClose={() => setSaving(false)}
                onSaved={message => setNotice({ title: message.title, description: message.description, type: message.pending ? 'warning' : 'success' })} />
            <RelatoriosLimites state={state} open={reports} onClose={() => setReports(false)} />
            <AlertModal isOpen={!!notice} onClose={() => setNotice(null)} title={notice?.title || ''} description={notice?.description || ''} type={notice?.type || 'success'} />
        </MainLayout>
    );
}
