import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, Mail, MessageSquare } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Textarea } from '@/componentes/ui/textarea';
import { ServicoPortalComunicacao, ROTULO_PEDIDO, type MensagemRH, type PedidoRH } from '@/servicos/rh/ServicoPortalComunicacao';
import { ServicoRH, type ActorRH, type Funcionario } from '@/servicos/rh/ServicoRH';
import { ServicoFeriasRH } from '@/servicos/rh/ServicoFeriasRH';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import { cn } from '@/bibliotecas/utils';
import { CorreioInterno } from './CorreioFuncionario';
import { dataPt, executar, useCarregar, Vazio } from './comum-rh';

/**
 * Painel do RH (e do Administrador principal): pedidos que chegaram do portal dos funcionários e o correio interno.
 * Os pedidos de férias e de dispensa aprovam-se nas suas páginas; os outros (ex.: subsídio de férias) respondem-se aqui.
 */
export function CaixaPortalRH({ actor, podeResponder }: { actor: ActorRH; podeResponder: boolean }) {
    const dados = useCarregar(async () => {
        const [pedidos, correio, funcionarios, planos, ausencias] = await Promise.all([ServicoPortalComunicacao.todosPedidos(), ServicoPortalComunicacao.todoCorreio(),
            ServicoRH.funcionarios(), ServicoFeriasRH.planos(), ServicoTempoRH.ausencias()]);
        return { pedidos, correio, funcionarios, feriasPendentes: planos.filter(p => p.estado === 'planeado' && p.pedido_funcionario).length,
            dispensasPendentes: ausencias.filter(a => a.estado === 'pendente').length };
    }, { pedidos: [] as PedidoRH[], correio: [] as MensagemRH[], funcionarios: [] as Funcionario[], feriasPendentes: 0, dispensasPendentes: 0 }, []);
    const [aba, setAba] = useState<'pedidos' | 'correio'>('pedidos');
    const [respostas, setRespostas] = useState<Record<string, string>>({});
    const [conversa, setConversa] = useState<string | null>(null);
    const d = dados.dados;
    const nome = (id: string) => d.funcionarios.find(f => f.id === id)?.nome || 'Funcionário';
    const utilizador = (id: string) => d.funcionarios.find(f => f.id === id)?.utilizador_id || null;
    const pendentes = d.pedidos.filter(p => p.estado === 'pendente');
    const conversas = useMemo(() => {
        const mapa = new Map<string, { funcionario_id: string; ultima: string; porLer: number }>();
        for (const m of d.correio) {
            const c = mapa.get(m.funcionario_id) || { funcionario_id: m.funcionario_id, ultima: m.criado_em, porLer: 0 };
            if (m.criado_em > c.ultima) c.ultima = m.criado_em;
            if (m.sentido === 'para_rh' && !m.lida) c.porLer += 1;
            mapa.set(m.funcionario_id, c);
        }
        return [...mapa.values()].sort((a, b) => b.porLer - a.porLer || b.ultima.localeCompare(a.ultima));
    }, [d.correio]);
    const porLer = conversas.reduce((s, c) => s + c.porLer, 0);
    const responder = async (p: PedidoRH, estado: 'aprovado' | 'recusado') => {
        const ok = await executar(() => ServicoPortalComunicacao.responderPedido(p, estado, respostas[p.id] || '', actor, utilizador(p.funcionario_id)), estado === 'aprovado' ? 'Pedido aprovado' : 'Pedido recusado');
        if (ok) void dados.recarregar();
    };

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-black"><Inbox className="h-4 w-4" /> Portal dos funcionários</h2>
                <div className="flex gap-1.5">
                    {([['pedidos', `Pedidos${pendentes.length + d.feriasPendentes + d.dispensasPendentes ? ` (${pendentes.length + d.feriasPendentes + d.dispensasPendentes})` : ''}`], ['correio', `Correio${porLer ? ` (${porLer})` : ''}`]] as const).map(([id, rotulo]) => (
                        <button key={id} type="button" onClick={() => setAba(id)} className={cn('rounded-full border px-3 py-1 text-xs font-bold', aba === id ? 'border-rh-navy bg-rh-navy text-white' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300')}>{rotulo}</button>
                    ))}
                </div>
            </div>

            {aba === 'pedidos' && (
                <div className="mt-3 space-y-2 text-sm">
                    {(d.feriasPendentes > 0 || d.dispensasPendentes > 0) && (
                        <div className="flex flex-wrap gap-2">
                            {d.feriasPendentes > 0 && <Link to="/rh/ferias" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100">{d.feriasPendentes} pedido(s) de férias por aprovar →</Link>}
                            {d.dispensasPendentes > 0 && <Link to="/rh/ausencias" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100">{d.dispensasPendentes} dispensa(s) por aprovar →</Link>}
                        </div>
                    )}
                    {d.pedidos.length === 0 ? <Vazio>Sem outros pedidos dos funcionários.</Vazio> : d.pedidos.slice(0, 30).map(p => (
                        <div key={p.id} className={cn('rounded-xl border px-3 py-2', p.estado === 'pendente' ? 'border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-800')}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span><b>{nome(p.funcionario_id)}</b> · {ROTULO_PEDIDO[p.tipo]}{p.tipo === 'subsidio_ferias' && p.ano ? ` ${p.ano}` : ''}{p.tipo !== 'subsidio_ferias' ? ` · ${p.assunto}` : ''} · {dataPt(p.criado_em)}</span>
                                <span className="text-xs font-bold uppercase text-slate-500">{p.estado}</span>
                            </div>
                            {p.descricao && <p className="mt-0.5 text-slate-600 dark:text-slate-300">«{p.descricao}»</p>}
                            {p.resposta && <p className="mt-0.5 text-xs text-slate-500">Resposta de {p.respondido_por_nome}: {p.resposta}</p>}
                            {p.estado === 'pendente' && podeResponder && (
                                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
                                    <Textarea rows={2} className="text-sm" placeholder={p.tipo === 'subsidio_ferias' ? 'Ex.: aprovado; entra no processamento de férias de Dezembro.' : 'Resposta ao funcionário'}
                                        value={respostas[p.id] || ''} onChange={e => setRespostas(x => ({ ...x, [p.id]: e.target.value }))} />
                                    <div className="flex shrink-0 gap-1.5">
                                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={(respostas[p.id] || '').trim().length < 3} onClick={() => void responder(p, 'aprovado')}>Aprovar</Button>
                                        <Button size="sm" variant="outline" className="border-red-200 text-red-700" disabled={(respostas[p.id] || '').trim().length < 3} onClick={() => void responder(p, 'recusado')}>Recusar</Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    {pendentes.some(p => p.tipo === 'subsidio_ferias') && <p className="text-xs text-slate-500">Depois de aprovar um subsídio de férias, processe-o em <Link to="/rh/ferias" className="font-bold underline">Férias</Link> («Processar subsídio» no plano do funcionário).</p>}
                </div>
            )}

            {aba === 'correio' && (
                <div className="mt-3 grid gap-3 lg:grid-cols-[240px_1fr]">
                    <div className="space-y-1">
                        <select aria-label="Escrever a um funcionário" className="mb-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                            value="" onChange={e => e.target.value && setConversa(e.target.value)}>
                            <option value="">Nova mensagem para…</option>
                            {d.funcionarios.filter(f => f.estado !== 'cessado').map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                        </select>
                        {conversas.length === 0 && <p className="text-xs text-slate-500">Sem mensagens.</p>}
                        {conversas.map(c => (
                            <button key={c.funcionario_id} type="button" onClick={() => setConversa(c.funcionario_id)}
                                className={cn('flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm', conversa === c.funcionario_id ? 'border-rh-navy bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-800')}>
                                {c.porLer ? <Mail className="h-4 w-4 text-sky-600" /> : <MessageSquare className="h-4 w-4 text-slate-400" />}
                                <span className={cn('min-w-0 flex-1 truncate', c.porLer && 'font-black')}>{nome(c.funcionario_id)}</span>
                                {c.porLer > 0 && <span className="rounded-full bg-sky-500 px-1.5 text-[10px] font-bold text-white">{c.porLer}</span>}
                            </button>
                        ))}
                    </div>
                    {conversa ? (
                        <div>
                            <p className="mb-2 text-sm font-black">{nome(conversa)}</p>
                            <CorreioInterno lado="rh" mensagens={d.correio.filter(m => m.funcionario_id === conversa)} onMudou={() => void dados.recarregar()}
                                onEnviar={(assunto, corpo, respostaA) => podeResponder
                                    ? executar(() => ServicoPortalComunicacao.escreverAoFuncionario(conversa, assunto, corpo, actor, utilizador(conversa), respostaA), 'Mensagem enviada')
                                    : Promise.resolve(false)} />
                        </div>
                    ) : <Vazio>Escolha uma conversa ou escreva a um funcionário.</Vazio>}
                </div>
            )}
        </section>
    );
}
