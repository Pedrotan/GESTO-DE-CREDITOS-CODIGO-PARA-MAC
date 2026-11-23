import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Loader2, Plus, Search } from 'lucide-react';
import { Indicador, Vazio, dataPt } from '@/componentes/rh/comum-rh';
import { NavegacaoCompliance, useActorCompliance, useCompliance } from '@/componentes/compliance/comum-compliance';
import { AVISO_SIGILO, DialogoNovoCaso, SeloCaso, SeloPrioridade } from '@/componentes/compliance/casos-comum';
import { ROTULO_ESTADO_CASO, ROTULO_TIPO_CASO, type EstadoCaso } from '@/bibliotecas/compliance/casos';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { cn } from '@/bibliotecas/utils';

const TODOS = '__todos__';
const ORDEM_PRIORIDADE = { critica: 0, alta: 1, media: 2, baixa: 3 } as const;

export default function CasosCompliance() {
    const comp = useCompliance();
    const { actor, registar } = useActorCompliance();
    const { casos, decisoes } = comp.dados.cas;
    const hoje = luandaTodayKey();
    const [estado, setEstado] = useState<'abertos' | EstadoCaso | typeof TODOS>('abertos');
    const [pesquisa, setPesquisa] = useState('');
    const [novo, setNovo] = useState(false);
    const nome = (id: string) => comp.clientes.find(c => c.id === id)?.name || 'Cliente';

    const filtrados = useMemo(() => {
        const t = pesquisa.trim().toLowerCase();
        return casos.filter(c => (estado === TODOS || (estado === 'abertos' ? c.estado !== 'encerrado' : c.estado === estado))
            && (!t || [c.numero, c.titulo, nome(c.client_id)].some(v => v.toLowerCase().includes(t))))
            .sort((a, b) => Number(a.estado === 'encerrado') - Number(b.estado === 'encerrado') || ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade] || String(a.prazo).localeCompare(String(b.prazo)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [casos, estado, pesquisa, comp.clientes]);
    const abertos = casos.filter(c => c.estado !== 'encerrado');

    return (
        <MainLayout title="Compliance" subtitle="Investigações">
            <NavegacaoCompliance />
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-extrabold">Investigações</h1>
                    <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">Casos abertos a partir de alertas ou da ficha do cliente: evidências, conclusão interna, medidas e — em separado — a decisão sobre a comunicação à UIF.</p>
                    <p className="mt-1 text-xs font-semibold text-violet-700 dark:text-violet-300">{AVISO_SIGILO}</p>
                </div>
                {registar && <Button onClick={() => setNovo(true)}><Plus className="mr-1 h-4 w-4" />Abrir investigação</Button>}
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Indicador titulo="Em curso" valor={abertos.length} nota={`${abertos.filter(c => c.estado === 'aguarda_decisao').length} a aguardar decisão`} tom={abertos.length ? 'orange' : 'slate'} />
                <Indicador titulo="Fora do prazo" valor={abertos.filter(c => c.prazo && c.prazo < hoje).length} nota="Prazo ultrapassado" tom={abertos.some(c => c.prazo && c.prazo < hoje) ? 'red' : 'slate'} />
                <Indicador titulo="Suspeitas fundamentadas" valor={decisoes.filter(d => d.tipo === 'conclusao' && d.decisao === 'suspeita_fundamentada').length} nota="Conclusões internas" tom="slate" />
                <Indicador titulo="Comunicadas à UIF" valor={decisoes.filter(d => d.tipo === 'uif' && d.decisao === 'comunicar').length} nota="Decisões de comunicar" tom="slate" />
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input value={pesquisa} onChange={e => setPesquisa(e.target.value)} placeholder="Pesquisar por número, título ou cliente" className="pl-9" aria-label="Pesquisar investigações" />
                </div>
                <Select value={estado} onValueChange={v => setEstado(v as EstadoCaso)}>
                    <SelectTrigger className="w-[190px]" aria-label="Estado"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="abertos">Em curso</SelectItem>
                        {(Object.keys(ROTULO_ESTADO_CASO) as EstadoCaso[]).map(e => <SelectItem key={e} value={e}>{ROTULO_ESTADO_CASO[e]}</SelectItem>)}
                        <SelectItem value={TODOS}>Todas</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {comp.aCarregar && !casos.length ? <div className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>
                : !filtrados.length ? <Vazio>{estado === 'abertos' ? 'Não há investigações em curso.' : 'Nenhuma investigação corresponde aos filtros.'}</Vazio> : (
                <ul className="space-y-2">
                    {filtrados.map(c => {
                        const atrasado = c.estado !== 'encerrado' && !!c.prazo && c.prazo < hoje;
                        return (
                            <li key={c.id}>
                                <Link to={`/compliance/casos/${c.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-3"><span className="font-mono text-xs text-slate-500">{c.numero}</span><span className="truncate text-sm font-bold">{c.titulo}</span></div>
                                        <div className="flex items-center gap-3"><SeloPrioridade prioridade={c.prioridade} /><SeloCaso estado={c.estado} /></div>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{nome(c.client_id)} · {ROTULO_TIPO_CASO[c.tipo]} · aberto em {dataPt(c.aberto_em)} por {c.aberto_por_nome}{c.responsavel_nome ? ` · responsável: ${c.responsavel_nome}` : ''}</p>
                                    <p className={cn('mt-0.5 text-xs', atrasado ? 'font-bold text-red-600' : 'text-slate-500')}>{c.estado === 'encerrado' ? `Encerrado em ${dataPt(c.encerrado_em)}` : `Prazo: ${dataPt(c.prazo)}${atrasado ? ' (ultrapassado)' : ''}`}</p>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}

            {novo && actor && <DialogoNovoCaso clientes={comp.clientes.map(c => ({ id: c.id, nome: c.name }))} actor={actor} onClose={() => setNovo(false)} />}
        </MainLayout>
    );
}
