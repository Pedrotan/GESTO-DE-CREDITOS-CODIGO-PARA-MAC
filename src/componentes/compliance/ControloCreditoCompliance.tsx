import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Checkbox } from '@/componentes/ui/checkbox';
import { CheckCircle2, Clock, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { executar } from '@/componentes/rh/comum-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { ROTULO_DECISAO_CONTROLO, type DecisaoControlo, type ResultadoControlo } from '@/bibliotecas/compliance/controlo-credito';
import { CONTROLOS, ROTULO_EFEITO, ROTULO_MODO, type CodigoControlo } from '@/bibliotecas/compliance/politica-bloqueio';
import { ServicoControloCredito, type AutorizacaoRegisto, type LevantamentoRegisto } from '@/servicos/compliance/ServicoControloCredito';
import { podeCompliance, type ActorCompliance } from '@/servicos/compliance/ServicoCompliance';
import type { DecisaoRegisto } from '@/servicos/compliance/ServicoCasos';

const COR: Record<DecisaoControlo, string> = {
    permitido: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    requer_revisao: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    pendente: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
    bloqueado: 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200',
};
const ICONE: Record<DecisaoControlo, typeof ShieldCheck> = { permitido: ShieldCheck, requer_revisao: ShieldAlert, pendente: Clock, bloqueado: Lock };

/** Aviso de Compliance para uma operação de crédito (aprovação, novo crédito, reforço). Não aparece com o controlo desligado. */
export function AvisoComplianceCredito({ clientId, montante, className, compacto = false }: { clientId: string; montante: number; className?: string; compacto?: boolean }) {
    const [r, setR] = useState<ResultadoControlo | null>(null);
    useEffect(() => {
        let vivo = true;
        ServicoControloCredito.avaliar(clientId, montante).then(x => { if (vivo) setR(x); }).catch(() => { if (vivo) setR(null); });
        return () => { vivo = false; };
    }, [clientId, montante]);
    if (!r || r.modo === 'desligado' || (r.decisao === 'permitido' && !r.autorizacao && compacto)) return null;
    const Icone = ICONE[r.decisao];
    const pendentes = r.motivos.filter(m => !m.autorizado);
    return (
        <div className={cn('rounded-xl border p-3 text-xs', COR[r.decisao], className)} role={r.impede ? 'alert' : 'status'}>
            <p className="flex items-center gap-1.5 font-bold"><Icone className="h-4 w-4" />Compliance: {ROTULO_DECISAO_CONTROLO[r.decisao]}
                {r.modo === 'aviso' && r.decisao !== 'permitido' && <span className="font-normal">(só aviso — não impede)</span>}</p>
            {r.autorizacao && <p className="mt-1">Autorizado por Compliance até {(r.autorizacao.montanteMaximo).toLocaleString('pt-PT')} Kz, válido até {r.autorizacao.validoAte.split('-').reverse().join('/')}.</p>}
            {!compacto && pendentes.length > 0 && <ul className="mt-1 space-y-0.5">{pendentes.map(m => <li key={m.codigo}>• {m.texto} — {ROTULO_EFEITO[m.efeito]}</li>)}</ul>}
            {pendentes.length > 0 && <Link to={`/compliance/clientes/${clientId}#controlo`} className="mt-1 inline-block font-semibold underline">Ver na ficha de Compliance</Link>}
        </div>
    );
}

/** Secção da ficha de Compliance: resultado do controlo, autorizações e medidas de bloqueio. */
export function SeccaoControloCredito({ cliente, actor, medidas, aoMudar }: {
    cliente: { id: string; nome: string }; actor: ActorCompliance | null; medidas: DecisaoRegisto[]; aoMudar: () => void;
}) {
    const [montante, setMontante] = useState(500_000);
    const [r, setR] = useState<ResultadoControlo | null>(null);
    const [autorizacoes, setAutorizacoes] = useState<AutorizacaoRegisto[]>([]);
    const [levantamentos, setLevantamentos] = useState<LevantamentoRegisto[]>([]);
    const [versao, setVersao] = useState(0);
    const [motivos, setMotivos] = useState<CodigoControlo[]>([]);
    const [validoAte, setValidoAte] = useState('');
    const [fundamento, setFundamento] = useState('');
    const [levantar, setLevantar] = useState<{ id: string; texto: string } | null>(null);
    const [aGuardar, setAGuardar] = useState(false);
    const decidir = !!actor && podeCompliance(actor, 'compliance_approve');

    useEffect(() => {
        let vivo = true;
        void Promise.all([ServicoControloCredito.avaliar(cliente.id, montante), ServicoControloCredito.autorizacoes(cliente.id), ServicoControloCredito.levantamentos(cliente.id)])
            .then(([res, a, l]) => {
                if (!vivo) return;
                setR(res); setAutorizacoes(a); setLevantamentos(l);
                setMotivos(res.porAutorizar);
            });
        return () => { vivo = false; };
    }, [cliente.id, montante, versao, medidas.length]);
    useEffect(() => {
        if (!validoAte && r) {
            const d = new Date(Date.parse(`${luandaTodayKey()}T12:00:00Z`) + 30 * 86_400_000);
            setValidoAte(d.toISOString().slice(0, 10));
        }
    }, [r, validoAte]);

    const registar = async (decisao: 'autorizado' | 'recusado') => {
        if (!actor) return;
        setAGuardar(true);
        const ok = await executar(() => ServicoControloCredito.autorizar({ clienteId: cliente.id, nomeCliente: cliente.nome, decisao, montanteMaximo: montante, validoAte, motivos, fundamento }, actor),
            decisao === 'autorizado' ? 'Autorização de Compliance registada' : 'Recusa de Compliance registada');
        setAGuardar(false);
        if (ok) { setFundamento(''); setVersao(v => v + 1); aoMudar(); }
    };
    const confirmarLevantamento = async () => {
        if (!actor || !levantar) return;
        const medida = medidas.find(m => m.id === levantar.id);
        if (!medida) return;
        setAGuardar(true);
        const ok = await executar(() => ServicoControloCredito.levantarBloqueio(medida, cliente.nome, levantar.texto, actor), 'Bloqueio levantado');
        setAGuardar(false);
        if (ok) { setLevantar(null); setVersao(v => v + 1); aoMudar(); }
    };
    const bloqueios = medidas.filter(m => m.tipo === 'medida' && ['bloqueio_operacoes', 'encerramento_relacao'].includes(m.decisao));
    const levantado = (id: string) => levantamentos.find(l => l.decisao_id === id);

    return (
        <section id="controlo" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div>
                    <h2 className="text-base font-bold">Controlo do crédito</h2>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">Regra aplicada antes de conceder, aprovar ou reforçar créditos deste cliente.{r ? ` Modo: ${ROTULO_MODO[r.modo].toLowerCase()}.` : ''}</p>
                </div>
                <div className="flex items-center gap-2"><Label className="text-xs">Montante</Label><Input type="number" min={0} className="w-36 text-right" value={montante} onChange={e => setMontante(Number(e.target.value) || 0)} /><span className="text-xs">Kz</span></div>
            </div>
            <div className="space-y-4 p-5">
                {r && (
                    <div className={cn('rounded-xl border p-3 text-sm', COR[r.decisao])}>
                        <p className="font-bold">{ROTULO_DECISAO_CONTROLO[r.decisao]}{r.modo === 'aviso' && r.decisao !== 'permitido' ? ' (modo só aviso: não impede)' : ''}{r.modo === 'desligado' ? ' (controlo desligado)' : ''}</p>
                        {!r.motivos.length ? <p className="mt-1 flex items-center gap-1 text-xs"><CheckCircle2 className="h-3.5 w-3.5" />Todos os controlos em dia.</p> : (
                            <ul className="mt-1 space-y-0.5 text-xs">{r.motivos.map(m => <li key={m.codigo}>{m.autorizado ? '✓' : '•'} {m.texto} — {m.autorizado ? 'autorizado' : ROTULO_EFEITO[m.efeito]}</li>)}</ul>
                        )}
                    </div>
                )}

                {decidir && r && r.porAutorizar.length > 0 && (
                    <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                        <p className="text-sm font-bold">Autorizar ou recusar operações de crédito</p>
                        <p className="text-xs text-slate-500">Cobre os motivos marcados até ao montante indicado acima e até à data escolhida. Não cobre motivos pendentes nem bloqueios.</p>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                            {r.porAutorizar.map(c => (
                                <label key={c} className="flex items-center gap-2 text-xs"><Checkbox checked={motivos.includes(c)} onCheckedChange={v => setMotivos(x => v ? [...x, c] : x.filter(y => y !== c))} />{CONTROLOS[c].titulo}</label>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="space-y-1"><Label className="text-xs">Válido até</Label><Input type="date" value={validoAte} min={luandaTodayKey()} onChange={e => setValidoAte(e.target.value)} className="w-40" /></div>
                        </div>
                        <Textarea rows={2} value={fundamento} onChange={e => setFundamento(e.target.value)} placeholder="Fundamento: o que foi analisado, condições e diligência aplicada" />
                        <div className="flex gap-2">
                            <Button size="sm" disabled={aGuardar || fundamento.trim().length < 20 || !motivos.length || !(montante > 0)} onClick={() => registar('autorizado')}>Autorizar até {montante.toLocaleString('pt-PT')} Kz</Button>
                            <Button size="sm" variant="outline" className="text-red-700" disabled={aGuardar || fundamento.trim().length < 20} onClick={() => registar('recusado')}>Recusar</Button>
                        </div>
                    </div>
                )}

                {bloqueios.length > 0 && (
                    <div>
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Medidas de bloqueio (investigações)</p>
                        <ul className="space-y-1.5 text-xs">
                            {bloqueios.map(m => {
                                const l = levantado(m.id);
                                return (
                                    <li key={m.id} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                                        <strong>{m.decisao === 'bloqueio_operacoes' ? 'Bloqueio de novas operações' : 'Encerramento da relação'}</strong> — {m.decidido_por_nome}, {m.decidido_em.slice(0, 10).split('-').reverse().join('/')}
                                        {l ? <p className="text-emerald-700 dark:text-emerald-400">Levantado por {l.levantado_por_nome}: {l.fundamento}</p>
                                            : decidir && (levantar?.id === m.id ? (
                                                <div className="mt-1.5 space-y-1.5">
                                                    <Textarea rows={2} value={levantar.texto} onChange={e => setLevantar({ id: m.id, texto: e.target.value })} placeholder="Fundamento do levantamento" />
                                                    <div className="flex gap-2"><Button size="sm" disabled={aGuardar || levantar.texto.trim().length < 20} onClick={confirmarLevantamento}>Levantar bloqueio</Button><Button size="sm" variant="ghost" onClick={() => setLevantar(null)}>Cancelar</Button></div>
                                                </div>
                                            ) : <button type="button" className="ml-2 font-semibold underline" onClick={() => setLevantar({ id: m.id, texto: '' })}>Levantar…</button>)}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                {autorizacoes.length > 0 && (
                    <div>
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Autorizações e recusas</p>
                        <ul className="space-y-1 text-xs">
                            {autorizacoes.map(a => {
                                const valida = a.valido_ate >= luandaTodayKey();
                                return <li key={a.id} className={cn('rounded-lg border border-slate-200 p-2 dark:border-slate-700', !valida && 'opacity-60')}>
                                    <strong className={a.decisao === 'recusado' ? 'text-red-700 dark:text-red-300' : ''}>{a.decisao === 'autorizado' ? `Autorizado até ${(a.montante_maximo_minor / 100).toLocaleString('pt-PT')} Kz` : 'Recusado'}</strong>
                                    {' '}· válido até {a.valido_ate.split('-').reverse().join('/')}{!valida ? ' (caducado)' : ''} · {a.autorizado_por_nome}
                                    <p className="text-slate-600 dark:text-slate-400">{a.fundamento}</p>
                                </li>;
                            })}
                        </ul>
                    </div>
                )}
            </div>
        </section>
    );
}
