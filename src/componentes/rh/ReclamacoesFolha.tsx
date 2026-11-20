import { useState } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Textarea } from '@/componentes/ui/textarea';
import { ServicoReclamacoesRH, type ReclamacaoRH } from '@/servicos/rh/ServicoReclamacoesRH';
import type { ActorRH } from '@/servicos/rh/ServicoRH';
import { dataPt, executar, kz, useCarregar } from './comum-rh';

/**
 * Reclamações dos funcionários sobre a folha de correcção de um processamento. O RH responde (aceite ou recusada); a
 * aprovação fica bloqueada enquanto houver reclamações por responder.
 */
export function ReclamacoesFolha({ processamentoId, actor, podeResponder, nomeDe, onMudou }: {
    processamentoId: string; actor: ActorRH | null; podeResponder: boolean; nomeDe: (funcionarioId: string) => string; onMudou?: () => void;
}) {
    const lista = useCarregar(() => ServicoReclamacoesRH.doProcessamento(processamentoId), [] as ReclamacaoRH[], [processamentoId]);
    const [respostas, setRespostas] = useState<Record<string, string>>({});
    if (!lista.dados.length) return null;
    const pendentes = lista.dados.filter(r => r.estado === 'pendente').length;
    const responder = async (r: ReclamacaoRH, estado: 'aceite' | 'recusada') => {
        if (!actor) return;
        const ok = await executar(() => ServicoReclamacoesRH.responder(r, estado, respostas[r.id] || '', actor), estado === 'aceite' ? 'Reclamação aceite' : 'Reclamação recusada');
        if (ok) { await lista.recarregar(); onMudou?.(); }
    };
    return (
        <div className={`rounded-2xl border p-3 text-sm ${pendentes ? 'border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
            <h3 className="mb-1 flex items-center gap-1.5 text-xs font-black uppercase text-slate-600 dark:text-slate-300">
                <MessageSquareWarning className="h-4 w-4 text-amber-600" /> Reclamações da folha de correcção
                {pendentes > 0 && <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] text-white">{pendentes} por responder</span>}
            </h3>
            {pendentes > 0 && <p className="mb-2 text-xs text-amber-800 dark:text-amber-300">Responda antes de aprovar. Se aceitar, corrija o salário ou as faltas do funcionário e recalcule.</p>}
            {lista.dados.map(r => (
                <div key={r.id} className="border-t border-slate-200/70 py-2 first:border-0 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span><b>{nomeDe(r.funcionario_id)}</b> · {r.descricao || 'Outro valor'}{r.valor_minor ? ` (${kz(r.valor_minor)})` : ''} · {dataPt(r.criado_em)}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.estado === 'pendente' ? 'bg-amber-100 text-amber-800' : r.estado === 'aceite' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                            {r.estado === 'pendente' ? 'Por responder' : r.estado === 'aceite' ? 'Aceite' : 'Recusada'}
                        </span>
                    </div>
                    <p className="mt-0.5 text-slate-600 dark:text-slate-300">«{r.motivo}»</p>
                    {r.resposta && <p className="mt-1 text-xs text-slate-500">Resposta de {r.respondido_por_nome}: {r.resposta}</p>}
                    {r.estado === 'pendente' && podeResponder && actor && (
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
                            <Textarea rows={2} className="text-sm" placeholder="Resposta ao funcionário" value={respostas[r.id] || ''} onChange={e => setRespostas(x => ({ ...x, [r.id]: e.target.value }))} />
                            <div className="flex shrink-0 gap-1.5">
                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={(respostas[r.id] || '').trim().length < 5} onClick={() => void responder(r, 'aceite')}>Aceitar</Button>
                                <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" disabled={(respostas[r.id] || '').trim().length < 5} onClick={() => void responder(r, 'recusada')}>Recusar</Button>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
