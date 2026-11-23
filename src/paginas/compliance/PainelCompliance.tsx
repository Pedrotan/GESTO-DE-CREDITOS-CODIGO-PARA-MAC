import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Input } from '@/componentes/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { AlertTriangle, ChevronRight, Loader2, Radar, Search, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { Indicador, SeloBI, Vazio, dataPt } from '@/componentes/rh/comum-rh';
import { NavegacaoCompliance, SeloKyc, SeloRisco, SeloScreening, useCompliance, type LinhaCompliance } from '@/componentes/compliance/comum-compliance';
import { mascararDocumento, ROTULO_ESTADO_KYC, type EstadoKyc } from '@/bibliotecas/compliance/kyc';
import { ROTULO_NIVEL, type NivelRisco } from '@/bibliotecas/compliance/motor-risco';
import { cn } from '@/bibliotecas/utils';

const TODOS = '__todos__';
type FiltroAccao = typeof TODOS | 'accao' | 'decisao' | 'revisao_vencida';

const ALERTA_SCREENING = ['possivel', 'confirmada', 'erro'];
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

export default function PainelCompliance() {
    const { linhas, gruposPorRever, aCarregar, hoje } = useCompliance();
    const [pesquisa, setPesquisa] = useState('');
    const [estado, setEstado] = useState<EstadoKyc | typeof TODOS>(TODOS);
    const [nivel, setNivel] = useState<NivelRisco | 'sem' | typeof TODOS>(TODOS);
    const [accao, setAccao] = useState<FiltroAccao>('accao');

    const ind = useMemo(() => {
        const total = linhas.length;
        const verificados = linhas.filter(l => l.kyc.estado === 'verificado').length;
        const porNivel = { baixo: 0, medio: 0, elevado: 0, sem: 0 };
        for (const l of linhas) porNivel[l.nivel || 'sem'] += 1;
        return {
            total, verificados,
            decisoes: linhas.filter(l => l.verificacaoPendente).length + linhas.filter(l => l.aRever).length + linhas.filter(l => l.screening.pendentes.length > 0).length,
            expirados: linhas.filter(l => l.kyc.documento.estado === 'expirado').length,
            aExpirar: linhas.filter(l => l.kyc.documento.estado === 'a_expirar').length,
            vencidas: linhas.filter(l => l.kyc.revisaoVencida).length,
            porNivel,
        };
    }, [linhas]);

    const filtradas = useMemo(() => {
        const termo = pesquisa.trim().toLowerCase();
        const ordemNivel = { elevado: 0, medio: 1, baixo: 2 } as const;
        return linhas.filter(l => (estado === TODOS || l.kyc.estado === estado)
            && (nivel === TODOS || (nivel === 'sem' ? !l.nivel : l.nivel === nivel))
            && (accao === TODOS || (accao === 'accao' ? l.kyc.precisaAccao || l.aRever || l.verificacaoPendente || l.duplicados.length > 0 || ALERTA_SCREENING.includes(l.screening.estado)
                : accao === 'decisao' ? l.aRever || l.verificacaoPendente || l.screening.pendentes.length > 0 : l.kyc.revisaoVencida))
            && (!termo || [l.cliente.name, l.cliente.clientNumber, l.cliente.nif].some(v => String(v || '').toLowerCase().includes(termo))))
            .sort((a, b) => Number(b.aRever || b.verificacaoPendente) - Number(a.aRever || a.verificacaoPendente)
                || (a.nivel ? ordemNivel[a.nivel] : 3) - (b.nivel ? ordemNivel[b.nivel] : 3)
                || a.kyc.completude - b.kyc.completude || String(a.cliente.name).localeCompare(String(b.cliente.name)));
    }, [linhas, pesquisa, estado, nivel, accao]);

    return (
        <MainLayout title="Compliance" subtitle="Conhecer o cliente (KYC), risco de branqueamento de capitais e possíveis duplicados">
            <NavegacaoCompliance />
            <div className="mb-4">
                <h1 className="text-2xl font-extrabold">Compliance</h1>
                <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
                    Identificação e verificação dos clientes, classificação de risco e dados partilhados entre fichas. Um alerta ou uma pontuação alta não prova
                    nada: os casos relevantes são decididos por um responsável, com fundamento registado.
                </p>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Indicador titulo="KYC verificado" valor={`${pct(ind.verificados, ind.total)}%`} nota={`${ind.verificados} de ${ind.total} clientes`} tom={pct(ind.verificados, ind.total) >= 80 ? 'emerald' : 'orange'} />
                <Indicador titulo="Decisões por tomar" valor={ind.decisoes} nota="Verificações, avaliações e screening" tom={ind.decisoes ? 'orange' : 'slate'} />
                <Indicador titulo="Documentos" valor={ind.expirados} nota={`expirados · ${ind.aExpirar} a expirar em 60 dias`} tom={ind.expirados ? 'red' : 'slate'} />
                <Indicador titulo="Possíveis duplicados" valor={gruposPorRever.length} nota={`por rever · ${ind.vencidas} revisões periódicas vencidas`} tom={gruposPorRever.length ? 'orange' : 'slate'} />
            </div>

            <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold">Clientes por nível de risco</h2>
                    <span className="text-xs text-slate-500">{ind.porNivel.sem} sem avaliação</span>
                </div>
                <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img"
                    aria-label={`Baixo ${ind.porNivel.baixo}, médio ${ind.porNivel.medio}, elevado ${ind.porNivel.elevado}, sem avaliação ${ind.porNivel.sem}`}>
                    <div className="bg-emerald-500" style={{ width: `${pct(ind.porNivel.baixo, ind.total)}%` }} />
                    <div className="bg-amber-500" style={{ width: `${pct(ind.porNivel.medio, ind.total)}%` }} />
                    <div className="bg-red-500" style={{ width: `${pct(ind.porNivel.elevado, ind.total)}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                    {(['baixo', 'medio', 'elevado'] as NivelRisco[]).map(n => (
                        <button key={n} type="button" onClick={() => { setNivel(n); setAccao(TODOS); }} className="inline-flex items-center gap-1.5 hover:underline">
                            <span className={cn('h-2 w-2 rounded-full', n === 'baixo' ? 'bg-emerald-500' : n === 'medio' ? 'bg-amber-500' : 'bg-red-500')} />
                            {ROTULO_NIVEL[n]}: <strong className="text-slate-900 dark:text-white">{ind.porNivel[n]}</strong>
                        </button>
                    ))}
                </div>
            </section>

            <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input value={pesquisa} onChange={e => setPesquisa(e.target.value)} placeholder="Pesquisar por nome, n.º de cliente ou documento" className="pl-9" aria-label="Pesquisar clientes" />
                </div>
                <Select value={accao} onValueChange={v => setAccao(v as FiltroAccao)}>
                    <SelectTrigger className="w-[210px]" aria-label="Filtrar por acção"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="accao">Precisam de atenção</SelectItem>
                        <SelectItem value="decisao">Decisões por tomar</SelectItem>
                        <SelectItem value="revisao_vencida">Revisão periódica vencida</SelectItem>
                        <SelectItem value={TODOS}>Todos os clientes</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={estado} onValueChange={v => setEstado(v as EstadoKyc)}>
                    <SelectTrigger className="w-[180px]" aria-label="Filtrar por estado KYC"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={TODOS}>Qualquer estado KYC</SelectItem>
                        {(Object.keys(ROTULO_ESTADO_KYC) as EstadoKyc[]).map(e => <SelectItem key={e} value={e}>{ROTULO_ESTADO_KYC[e]}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={nivel} onValueChange={v => setNivel(v as NivelRisco)}>
                    <SelectTrigger className="w-[170px]" aria-label="Filtrar por nível de risco"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={TODOS}>Qualquer risco</SelectItem>
                        <SelectItem value="elevado">Risco elevado</SelectItem>
                        <SelectItem value="medio">Risco médio</SelectItem>
                        <SelectItem value="baixo">Risco baixo</SelectItem>
                        <SelectItem value="sem">Sem avaliação</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {aCarregar && !linhas.length ? (
                <div className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>
            ) : !filtradas.length ? (
                <Vazio>{accao === 'accao' && !pesquisa ? 'Nenhum cliente precisa de atenção neste momento.' : 'Nenhum cliente corresponde aos filtros.'}</Vazio>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <table className="w-full min-w-[980px] text-sm">
                        <thead className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800">
                            <tr>
                                <th className="px-4 py-3 font-bold">Cliente</th>
                                <th className="px-3 py-3 font-bold">KYC</th>
                                <th className="px-3 py-3 font-bold">Documento</th>
                                <th className="px-3 py-3 font-bold">Screening</th>
                                <th className="px-3 py-3 font-bold">Risco</th>
                                <th className="px-3 py-3 font-bold">Próxima revisão</th>
                                <th className="px-3 py-3 font-bold">Atenção</th>
                                <th className="px-3 py-3"><span className="sr-only">Abrir</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtradas.slice(0, 300).map(l => <Linha key={l.cliente.id} l={l} hoje={hoje} />)}
                        </tbody>
                    </table>
                    {filtradas.length > 300 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">A mostrar 300 de {filtradas.length}. Use a pesquisa ou os filtros para encontrar os restantes.</p>}
                </div>
            )}
        </MainLayout>
    );
}

function Linha({ l, hoje }: { l: LinhaCompliance; hoje: string }) {
    const avisos: Array<{ texto: string; icone: typeof AlertTriangle; tom: string }> = [];
    if (l.screening.estado === 'confirmada') avisos.push({ texto: 'Sanção confirmada', icone: Radar, tom: 'text-red-700 dark:text-red-300' });
    else if (l.screening.pendentes.length) avisos.push({ texto: `${l.screening.pendentes.length} correspondência(s) por decidir`, icone: Radar, tom: 'text-amber-700 dark:text-amber-300' });
    else if (l.screening.estado === 'erro') avisos.push({ texto: 'Screening com erro', icone: Radar, tom: 'text-red-700 dark:text-red-300' });
    if (l.verificacaoPendente) avisos.push({ texto: 'Verificação por decidir', icone: UserCheck, tom: 'text-sky-700 dark:text-sky-300' });
    if (l.aRever) avisos.push({ texto: 'Avaliação a rever', icone: ShieldCheck, tom: 'text-amber-700 dark:text-amber-300' });
    if (l.duplicados.length) avisos.push({ texto: l.duplicados.join(', '), icone: Users, tom: 'text-red-700 dark:text-red-300' });
    if (l.kyc.emFalta.length) avisos.push({ texto: `${l.kyc.emFalta.length} dado(s) em falta`, icone: AlertTriangle, tom: 'text-amber-700 dark:text-amber-300' });
    const vencida = l.perfil?.proxima_revisao && l.perfil.proxima_revisao < hoje;
    return (
        <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 dark:border-slate-800/60 dark:hover:bg-slate-800/40">
            <td className="px-4 py-3">
                <Link to={`/compliance/clientes/${l.cliente.id}`} className="font-semibold text-slate-900 hover:underline dark:text-white">{l.cliente.name}</Link>
                <div className="text-xs text-slate-500">{l.cliente.clientNumber ? `N.º ${l.cliente.clientNumber} · ` : ''}<span className="font-mono">{mascararDocumento(l.cliente.nif)}</span></div>
            </td>
            <td className="px-3 py-3">
                <SeloKyc estado={l.kyc.estado} />
                <div className="mt-1 flex items-center gap-1.5">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={cn('h-full', l.kyc.completude === 100 ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${l.kyc.completude}%` }} /></div>
                    <span className="text-[11px] text-slate-500">{l.kyc.completude}%</span>
                </div>
            </td>
            <td className="px-3 py-3"><SeloBI situacao={l.kyc.documento} /></td>
            <td className="px-3 py-3"><SeloScreening estado={l.screening.estado} /></td>
            <td className="px-3 py-3"><SeloRisco nivel={l.nivel} pontuacao={l.perfil?.pontuacao_risco} /></td>
            <td className={cn('px-3 py-3 text-xs', vencida ? 'font-bold text-red-600' : 'text-slate-600 dark:text-slate-400')}>{l.perfil?.proxima_revisao ? `${dataPt(l.perfil.proxima_revisao)}${vencida ? ' (vencida)' : ''}` : '—'}</td>
            <td className="px-3 py-3">
                <div className="space-y-0.5">
                    {avisos.slice(0, 3).map(a => <div key={a.texto} className={cn('flex items-center gap-1 text-xs font-medium', a.tom)}><a.icone className="h-3.5 w-3.5 shrink-0" aria-hidden /> {a.texto}</div>)}
                    {!avisos.length && <span className="text-xs text-slate-400">—</span>}
                </div>
            </td>
            <td className="px-3 py-3 text-right">
                <Link to={`/compliance/clientes/${l.cliente.id}`} aria-label={`Abrir a ficha de Compliance de ${l.cliente.name}`} className="inline-flex rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></Link>
            </td>
        </tr>
    );
}
