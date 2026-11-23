import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { SeloAlerta, SeloGravidade, dataHoraPt } from './comum-compliance';
import { DetalheAlerta } from './DetalheAlerta';
import type { AlertaRegisto, HistoricoAlerta } from '@/servicos/compliance/ServicoMonitorizacao';
import type { ActorCompliance } from '@/servicos/compliance/ServicoCompliance';

/** Secção da ficha: alertas de operações do cliente (abertos primeiro), com o detalhe e a triagem. */
export function AlertasCliente({ alertas, historico, nomeCliente, actor, aoMudar, casosDoAlerta }: {
    alertas: AlertaRegisto[]; historico: HistoricoAlerta[]; nomeCliente: string; actor: ActorCompliance | null; aoMudar: () => void;
    casosDoAlerta?: (alertaId: string) => Array<{ id: string; numero: string }>;
}) {
    const [aberto, setAberto] = useState<string | null>(null);
    const ordenados = [...alertas].sort((a, b) => Number(a.estado === 'CLOSED') - Number(b.estado === 'CLOSED') || b.detectado_em.localeCompare(a.detectado_em));
    const actual = alertas.find(a => a.id === aberto) || null;
    return (
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                    <Activity className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden />
                    <div><h2 className="text-base font-bold">Alertas de operações</h2><p className="text-[13px] text-slate-500 dark:text-slate-400">Monitorização de desembolsos, pagamentos, reforços e anulações.</p></div>
                </div>
                <Link to="/compliance/alertas" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Ver todos</Link>
            </div>
            <div className="p-5">
                {!ordenados.length ? <p className="text-sm text-slate-500">Sem alertas para este cliente.</p> : (
                    <ul className="space-y-2">
                        {ordenados.map(a => (
                            <li key={a.id}>
                                <button type="button" onClick={() => setAberto(a.id)} className="w-full rounded-xl border border-slate-200 p-3 text-left hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-600">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="flex items-center gap-2 text-sm font-semibold"><SeloGravidade gravidade={a.gravidade} />{a.titulo}</span>
                                        <SeloAlerta estado={a.estado} />
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{a.descricao}</p>
                                    <p className="mt-0.5 text-[11px] text-slate-500">{dataHoraPt(a.data_operacao || a.detectado_em)}</p>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {actual && <DetalheAlerta alerta={actual} historico={historico.filter(h => h.alerta_id === actual.id)} nomeCliente={nomeCliente} actor={actor} casos={casosDoAlerta?.(actual.id)}
                onClose={() => setAberto(null)} aoMudar={aoMudar} />}
        </section>
    );
}
