import { useMemo, useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Loader2, ScanSearch, Search } from 'lucide-react';
import { Indicador, Vazio } from '@/componentes/rh/comum-rh';
import { NavegacaoCompliance, SeloAlerta, SeloGravidade, dataHoraPt, useActorCompliance, useCompliance } from '@/componentes/compliance/comum-compliance';
import { DetalheAlerta } from '@/componentes/compliance/DetalheAlerta';
import {
    ESTADOS_ABERTOS, REGRAS_MONITORIZACAO, ROTULO_CATEGORIA_ALERTA, ROTULO_ESTADO_ALERTA,
    type CategoriaAlerta, type EstadoAlerta, type Gravidade, type RegraId,
} from '@/bibliotecas/compliance/monitorizacao';
import { ServicoMonitorizacao } from '@/servicos/compliance/ServicoMonitorizacao';
import { toast } from '@/ganchos/usar-toast';
import { cn } from '@/bibliotecas/utils';

const TODOS = '__todos__';
const ORDEM_GRAVIDADE: Record<Gravidade, number> = { alta: 0, media: 1, baixa: 2 };

export default function AlertasCompliance() {
    const comp = useCompliance();
    const { actor, registar } = useActorCompliance();
    const { alertas, historico } = comp.dados.alr;
    const [estado, setEstado] = useState<'abertos' | EstadoAlerta | typeof TODOS>('abertos');
    const [categoria, setCategoria] = useState<CategoriaAlerta | typeof TODOS>(TODOS);
    const [regra, setRegra] = useState<RegraId | typeof TODOS>(TODOS);
    const [pesquisa, setPesquisa] = useState('');
    const [aberto, setAberto] = useState<string | null>(null);
    const [aAnalisar, setAAnalisar] = useState(false);
    const nome = (id: string | null) => (id ? comp.clientes.find(c => c.id === id)?.name || null : null);

    const ind = useMemo(() => ({
        novos: alertas.filter(a => a.estado === 'NEW').length,
        analise: alertas.filter(a => a.estado === 'IN_REVIEW' || a.estado === 'INFORMATION_REQUESTED').length,
        alta: alertas.filter(a => ESTADOS_ABERTOS.includes(a.estado) && a.gravidade === 'alta').length,
        fundamentados: alertas.filter(a => a.resultado === 'SUBSTANTIATED').length,
    }), [alertas]);

    const filtrados = useMemo(() => {
        const termo = pesquisa.trim().toLowerCase();
        return alertas.filter(a => (estado === TODOS || (estado === 'abertos' ? ESTADOS_ABERTOS.includes(a.estado) : a.estado === estado))
            && (categoria === TODOS || a.categoria === categoria) && (regra === TODOS || a.regra === regra)
            && (!termo || [a.titulo, a.descricao, nome(a.client_id)].some(v => String(v || '').toLowerCase().includes(termo))))
            .sort((x, y) => ORDEM_GRAVIDADE[x.gravidade] - ORDEM_GRAVIDADE[y.gravidade] || y.detectado_em.localeCompare(x.detectado_em));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [alertas, estado, categoria, regra, pesquisa, comp.clientes]);

    const analisar = async () => {
        if (!actor) return;
        setAAnalisar(true);
        try {
            const r = await ServicoMonitorizacao.analisar(actor);
            toast({ title: r.novos.length ? `${r.novos.length} alerta(s) novo(s)` : 'Análise concluída: sem alertas novos', description: `${r.total} situação(ões) detectada(s) no período analisado (as já registadas não se repetem).` });
            void comp.recarregar();
        } catch (e) { toast({ variant: 'destructive', title: 'Não foi possível analisar as operações', description: e instanceof Error ? e.message : String(e) }); }
        setAAnalisar(false);
    };
    const actual = alertas.find(a => a.id === aberto) || null;

    return (
        <MainLayout title="Compliance" subtitle="Monitorização de operações e detecção de fraude">
            <NavegacaoCompliance />
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-extrabold">Alertas de operações</h1>
                    <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
                        Desembolsos, pagamentos, reforços e anulações analisados com as regras da versão activa do modelo (corre sozinho a cada 30 minutos).
                        Um alerta não prova nada: é analisado, concluído com fundamento e encerrado com as medidas tomadas. Os registos financeiros nunca são alterados.
                    </p>
                </div>
                {registar && <Button onClick={analisar} disabled={aAnalisar}>{aAnalisar ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-1 h-4 w-4" />}Analisar operações agora</Button>}
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Indicador titulo="Novos" valor={ind.novos} nota="Por iniciar a análise" tom={ind.novos ? 'sky' : 'slate'} />
                <Indicador titulo="Em análise" valor={ind.analise} nota="Incluindo informação pedida" tom={ind.analise ? 'orange' : 'slate'} />
                <Indicador titulo="Gravidade alta" valor={ind.alta} nota="Abertos" tom={ind.alta ? 'red' : 'slate'} />
                <Indicador titulo="Fundamentados" valor={ind.fundamentados} nota="Contam na avaliação de risco" tom={ind.fundamentados ? 'red' : 'slate'} />
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input value={pesquisa} onChange={e => setPesquisa(e.target.value)} placeholder="Pesquisar por cliente ou descrição" className="pl-9" aria-label="Pesquisar alertas" />
                </div>
                <Select value={estado} onValueChange={v => setEstado(v as EstadoAlerta)}>
                    <SelectTrigger className="w-[180px]" aria-label="Estado"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="abertos">Abertos</SelectItem>
                        {(Object.keys(ROTULO_ESTADO_ALERTA) as EstadoAlerta[]).map(e => <SelectItem key={e} value={e}>{ROTULO_ESTADO_ALERTA[e]}</SelectItem>)}
                        <SelectItem value={TODOS}>Todos</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={categoria} onValueChange={v => setCategoria(v as CategoriaAlerta)}>
                    <SelectTrigger className="w-[180px]" aria-label="Categoria"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={TODOS}>Todas as categorias</SelectItem>
                        {(Object.keys(ROTULO_CATEGORIA_ALERTA) as CategoriaAlerta[]).map(c => <SelectItem key={c} value={c}>{ROTULO_CATEGORIA_ALERTA[c]}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={regra} onValueChange={v => setRegra(v as RegraId)}>
                    <SelectTrigger className="w-[240px]" aria-label="Regra"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={TODOS}>Todas as regras</SelectItem>
                        {(Object.keys(REGRAS_MONITORIZACAO) as RegraId[]).map(r => <SelectItem key={r} value={r}>{REGRAS_MONITORIZACAO[r].titulo}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            {comp.aCarregar && !alertas.length ? <div className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>
                : !filtrados.length ? <Vazio>{estado === 'abertos' ? 'Não há alertas abertos.' : 'Nenhum alerta corresponde aos filtros.'}</Vazio> : (
                <ul className="space-y-2">
                    {filtrados.slice(0, 300).map(a => (
                        <li key={a.id}>
                            <button type="button" onClick={() => setAberto(a.id)}
                                className={cn('w-full rounded-2xl border bg-white p-4 text-left transition-colors hover:border-slate-300 dark:bg-slate-900 dark:hover:border-slate-600',
                                    a.gravidade === 'alta' && ESTADOS_ABERTOS.includes(a.estado) ? 'border-red-200 dark:border-red-900' : 'border-slate-200 dark:border-slate-800')}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-3"><SeloGravidade gravidade={a.gravidade} /><span className="truncate text-sm font-bold">{a.titulo}</span></div>
                                    <div className="flex items-center gap-2"><span className="text-xs text-slate-500">{ROTULO_CATEGORIA_ALERTA[a.categoria]}</span><SeloAlerta estado={a.estado} /></div>
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{a.descricao}</p>
                                <p className="mt-1 text-[11px] text-slate-500">{nome(a.client_id) || (a.client_id ? 'Cliente' : 'Utilizadores')} · {dataHoraPt(a.data_operacao || a.detectado_em)}{a.responsavel_nome ? ` · ${a.responsavel_nome}` : ''}</p>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {actual && <DetalheAlerta alerta={actual} historico={historico.filter(h => h.alerta_id === actual.id)} nomeCliente={nome(actual.client_id)} actor={actor}
                casos={comp.dados.cas.ligacoes.filter(l => l.tipo === 'alerta' && l.ref_id === actual.id).map(l => comp.dados.cas.casos.find(c => c.id === l.caso_id)).filter((c): c is NonNullable<typeof c> => !!c)}
                onClose={() => setAberto(null)} aoMudar={() => void comp.recarregar()} />}
        </MainLayout>
    );
}
