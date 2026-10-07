import { useEffect, useMemo, useRef, useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/componentes/ui/table';
import {
    AreaChart,
    Area,
    LineChart,
    Line,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceDot,
} from 'recharts';
import {
    ServicoMercadoCambio,
    CotacaoMoeda,
    PontoHistorico,
    MOEDAS_PRINCIPAIS,
} from '@/servicos/ServicoMercadoCambio';
import { ServicoBNA, TaxaBNA } from '@/servicos/ServicoBNA';
import {
    RefreshCw,
    TrendingUp,
    TrendingDown,
    Search,
    WifiOff,
    Activity,
    Landmark,
    ChevronLeft,
    ChevronRight,
    ChevronsUpDown,
    ArrowUp,
    ArrowDown,
} from 'lucide-react';
import { cn } from '@/bibliotecas/utils';

/** De quanto em quanto tempo a página se refresca sozinha. */
const INTERVALO_MS = 60_000;
const DIAS_GRAFICO = 14;
const POR_PAGINA = 15;
/** Moedas com série própria no topo do painel. */
const SERIES_PAINEL = ['usd', 'eur', 'zar'] as const;
const DIAS_PAINEL = 30;
/** Abaixo desta variação absoluta considera-se a moeda estável no dia. */
const LIMIAR_ESTAVEL = 0.1;

const COR_SERIE: Record<string, string> = { usd: '#0ea5e9', eur: '#8b5cf6', zar: '#84cc16' };

type Coluna = 'codigo' | 'nome' | 'porAoa' | 'variacao';
type Tendencia = 'todas' | 'alta' | 'baixa';

const fmt = (n: number) =>
    n.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 6 : 3 });

export default function Mercado() {
    const cacheInicial = ServicoMercadoCambio.obterCache();
    const [cotacoes, setCotacoes] = useState<CotacaoMoeda[]>(cacheInicial?.cotacoes || []);
    const [dataFonte, setDataFonte] = useState<string | undefined>(cacheInicial?.data);
    const [erro, setErro] = useState<string | null>(null);
    const [aCarregar, setACarregar] = useState(!cacheInicial);

    const [selecionada, setSelecionada] = useState('usd');
    const [historico, setHistorico] = useState<PontoHistorico[]>([]);
    const [seriesPainel, setSeriesPainel] = useState<Record<string, PontoHistorico[]>>({});

    const [taxasBNA, setTaxasBNA] = useState<TaxaBNA[]>([]);
    const [dataBNA, setDataBNA] = useState<string | undefined>();
    const [procura, setProcura] = useState('');
    const [tendencia, setTendencia] = useState<Tendencia>('todas');
    const [ordenarPor, setOrdenarPor] = useState<Coluna>('codigo');
    const [ascendente, setAscendente] = useState(true);
    const [pagina, setPagina] = useState(1);
    const [segundos, setSegundos] = useState(INTERVALO_MS / 1000);

    // Evita que uma resposta lenta de uma moeda já trocada sobrescreva a actual.
    const moedaPedida = useRef(selecionada);

    const carregar = async () => {
        setACarregar(true);
        try {
            const r = await ServicoMercadoCambio.obterTodas();
            if (r.cotacoes.length > 0) {
                setCotacoes(r.cotacoes);
                setDataFonte(r.data);
                setErro(null);
            } else {
                setErro(r.erro || null);
            }
        } finally {
            setACarregar(false);
            setSegundos(INTERVALO_MS / 1000);
        }

        // Taxas oficiais do BNA, obtidas directamente da API do banco central.
        // Se falharem, a página continua a funcionar só com os câmbios de mercado.
        try {
            const oficial = await ServicoBNA.obterReferencia();
            if (oficial.taxas.length > 0) {
                setTaxasBNA(oficial.taxas);
                setDataBNA(oficial.data);
            }
        } catch { /* extra */ }
    };

    // Carregamento inicial + refrescamento automático
    useEffect(() => {
        carregar();
        const t = setInterval(carregar, INTERVALO_MS);
        return () => clearInterval(t);
    }, []);

    // Conta-decrescente até ao próximo refrescamento
    useEffect(() => {
        const t = setInterval(() => setSegundos((s) => (s > 0 ? s - 1 : 0)), 1000);
        return () => clearInterval(t);
    }, []);

    // Histórico da moeda em foco
    useEffect(() => {
        moedaPedida.current = selecionada;
        ServicoMercadoCambio.obterHistorico(selecionada, DIAS_GRAFICO).then((pontos) => {
            if (moedaPedida.current === selecionada) setHistorico(pontos);
        });
    }, [selecionada]);

    // Séries do painel: um único lote de pedidos serve as três moedas
    useEffect(() => {
        let cancelado = false;
        ServicoMercadoCambio
            .obterHistoricoMultiplo([...SERIES_PAINEL], DIAS_PAINEL)
            .then((mapa) => { if (!cancelado) setSeriesPainel(mapa); });
        return () => { cancelado = true; };
    }, []);

    // Só a procura: serve de base às contagens dos separadores de tendência,
    // para cada um mostrar quantas moedas tem dentro da procura em curso.
    const porProcura = useMemo(() => {
        const q = procura.trim().toLowerCase();
        if (!q) return cotacoes;
        return cotacoes.filter((c) => c.codigo.includes(q) || c.nome.toLowerCase().includes(q));
    }, [cotacoes, procura]);

    const contagens = useMemo(() => ({
        todas: porProcura.length,
        alta: porProcura.filter((c) => (c.variacao ?? 0) > 0).length,
        baixa: porProcura.filter((c) => (c.variacao ?? 0) < 0).length,
    }), [porProcura]);

    const filtradas = useMemo(() => {
        if (tendencia === 'alta') return porProcura.filter((c) => (c.variacao ?? 0) > 0);
        if (tendencia === 'baixa') return porProcura.filter((c) => (c.variacao ?? 0) < 0);
        return porProcura;
    }, [porProcura, tendencia]);

    // Ordenação da tabela. A ordem por omissão ("codigo") preserva a que o
    // serviço já devolve, com as moedas de uso corrente à cabeça.
    const ordenadas = useMemo(() => {
        if (ordenarPor === 'codigo' && ascendente) return filtradas;
        const copia = [...filtradas];
        copia.sort((a, b) => {
            let r = 0;
            if (ordenarPor === 'porAoa') r = a.porAoa - b.porAoa;
            else if (ordenarPor === 'variacao') r = (a.variacao ?? 0) - (b.variacao ?? 0);
            else if (ordenarPor === 'nome') r = a.nome.localeCompare(b.nome);
            else r = a.codigo.localeCompare(b.codigo);
            return ascendente ? r : -r;
        });
        return copia;
    }, [filtradas, ordenarPor, ascendente]);

    const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / POR_PAGINA));
    const pagexata = Math.min(pagina, totalPaginas);
    const visiveis = useMemo(
        () => ordenadas.slice((pagexata - 1) * POR_PAGINA, pagexata * POR_PAGINA),
        [ordenadas, pagexata]
    );

    // Procurar ou reordenar volta ao início, senão ficava-se numa página vazia.
    useEffect(() => { setPagina(1); }, [procura, tendencia, ordenarPor, ascendente]);

    const alternarOrdem = (coluna: Coluna) => {
        if (ordenarPor === coluna) setAscendente((v) => !v);
        else { setOrdenarPor(coluna); setAscendente(coluna === 'codigo' || coluna === 'nome'); }
    };

    const IconeOrdem = ({ coluna }: { coluna: Coluna }) => {
        if (ordenarPor !== coluna) return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />;
        return ascendente ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
    };

    const emFoco = cotacoes.find((c) => c.codigo === selecionada);

    /** Repartição do mercado do dia: em alta, em baixa e praticamente parado. */
    const indicadores = useMemo(() => {
        const comVariacao = cotacoes.filter((c) => c.variacao !== undefined);
        const total = comVariacao.length || 1;
        const alta = comVariacao.filter((c) => (c.variacao as number) > LIMIAR_ESTAVEL).length;
        const baixa = comVariacao.filter((c) => (c.variacao as number) < -LIMIAR_ESTAVEL).length;
        const estaveis = comVariacao.length - alta - baixa;
        return {
            total: comVariacao.length,
            alta,
            baixa,
            estaveis,
            pctAlta: (alta / total) * 100,
            pctBaixa: (baixa / total) * 100,
            pctEstaveis: (estaveis / total) * 100,
        };
    }, [cotacoes]);

    /** As seis moedas que mais se mexeram, para o gráfico de barras. */
    const maioresVariacoes = useMemo(
        () => cotacoes
            .filter((c) => c.variacao !== undefined)
            .sort((a, b) => Math.abs(b.variacao as number) - Math.abs(a.variacao as number))
            .slice(0, 6)
            .map((c) => ({
                nome: c.codigo.toUpperCase(),
                variacao: Number((c.variacao as number).toFixed(2)),
            })),
        [cotacoes]
    );

    return (
        <MainLayout title="Mercado" subtitle="Câmbios do kwanza e taxas de referência, em tempo real">
            <div className="flex flex-col gap-6">
                {/* Estado e refrescamento */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-600 text-white shadow-lg">
                            <Activity className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-foreground">
                                {cotacoes.length} moedas contra o kwanza
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {dataFonte ? `Fecho de ${dataFonte}` : 'A obter cotações…'}
                                <span className="mx-1.5">·</span>
                                <span className="font-semibold text-emerald-600">
                                    actualiza em {segundos}s
                                </span>
                            </p>
                        </div>
                    </div>

                    <Button onClick={carregar} disabled={aCarregar} className="gap-2">
                        <RefreshCw className={cn('h-4 w-4', aCarregar && 'animate-spin')} />
                        Actualizar
                    </Button>
                </div>

                {cotacoes.length === 0 ? (
                    <div className="card-elevated flex flex-col items-center gap-3 p-12 text-center">
                        <WifiOff className="h-10 w-10 text-muted-foreground/40" />
                        <p className="font-semibold text-foreground">
                            {erro || 'Sem cotações disponíveis de momento.'}
                        </p>
                        <Button variant="outline" onClick={carregar} disabled={aCarregar} className="mt-2 gap-2">
                            <RefreshCw className={cn('h-4 w-4', aCarregar && 'animate-spin')} />
                            Tentar de novo
                        </Button>
                    </div>
                ) : (
                    <>
                        {/* Gráfico principal */}
                        <div className="card-elevated p-5">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-bold tracking-tight text-foreground">
                                        {emFoco?.nome || selecionada.toUpperCase()} / AOA
                                    </h2>
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-display text-3xl font-black tracking-tight text-foreground">
                                            {emFoco ? fmt(emFoco.porAoa) : '—'}
                                        </span>
                                        {emFoco?.variacao !== undefined && (
                                            <span className={cn(
                                                'flex items-center gap-1 text-sm font-bold',
                                                emFoco.variacao >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                            )}>
                                                {emFoco.variacao >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                                                {emFoco.variacao >= 0 ? '+' : ''}{emFoco.variacao.toFixed(2)}%
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                    {MOEDAS_PRINCIPAIS.slice(0, 6).map((m) => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => setSelecionada(m)}
                                            className={cn(
                                                'rounded-lg px-3 py-1.5 text-xs font-bold uppercase transition-all',
                                                selecionada === m
                                                    ? 'bg-emerald-600 text-white shadow-sm'
                                                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                                            )}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="h-64 w-full">
                                {historico.length > 1 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={historico} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="grad-mercado" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                                                    <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                                            <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                                            <YAxis
                                                domain={['auto', 'auto']}
                                                tick={{ fontSize: 11 }}
                                                tickLine={false}
                                                axisLine={false}
                                                width={70}
                                                tickFormatter={(v: number) => fmt(v)}
                                            />
                                            <Tooltip
                                                formatter={(v: number) => [`${fmt(v)} Kz`, selecionada.toUpperCase()]}
                                                contentStyle={{ borderRadius: 12, fontSize: 12 }}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="valor"
                                                stroke="#059669"
                                                strokeWidth={2.5}
                                                fill="url(#grad-mercado)"
                                                isAnimationActive
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                        A carregar histórico…
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Séries de 30 dias, uma por moeda de referência */}
                        <div className="grid gap-4 lg:grid-cols-3">
                            {SERIES_PAINEL.map((codigo) => {
                                const serie = seriesPainel[codigo] || [];
                                const cor = COR_SERIE[codigo];
                                const cot = cotacoes.find((c) => c.codigo === codigo);

                                // Extremos do período, anotados no gráfico como na referência.
                                const minimo = serie.length ? serie.reduce((a, b) => (b.valor < a.valor ? b : a)) : null;
                                const maximo = serie.length ? serie.reduce((a, b) => (b.valor > a.valor ? b : a)) : null;

                                return (
                                    <button
                                        key={codigo}
                                        type="button"
                                        onClick={() => setSelecionada(codigo)}
                                        className={cn(
                                            'card-elevated p-4 text-left transition-all hover:-translate-y-0.5',
                                            selecionada === codigo && 'ring-2 ring-emerald-500'
                                        )}
                                    >
                                        <div className="mb-2 flex items-baseline justify-between gap-2">
                                            <h3 className="text-sm font-bold text-foreground">
                                                {codigo.toUpperCase()}/AOA
                                                <span className="ml-1.5 font-medium text-muted-foreground">
                                                    · {DIAS_PAINEL} dias
                                                </span>
                                            </h3>
                                            {cot?.variacao !== undefined && (
                                                <span className={cn(
                                                    'text-xs font-bold',
                                                    cot.variacao >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                                )}>
                                                    {cot.variacao >= 0 ? '+' : ''}{cot.variacao.toFixed(2)}%
                                                </span>
                                            )}
                                        </div>

                                        <div className="h-36 w-full">
                                            {serie.length > 1 ? (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={serie} margin={{ top: 14, right: 14, left: 0, bottom: 0 }}>
                                                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                                                        <XAxis
                                                            dataKey="etiqueta"
                                                            tick={{ fontSize: 10 }}
                                                            tickLine={false}
                                                            axisLine={false}
                                                            interval="preserveStartEnd"
                                                            minTickGap={28}
                                                        />
                                                        <YAxis
                                                            domain={['auto', 'auto']}
                                                            tick={{ fontSize: 10 }}
                                                            tickLine={false}
                                                            axisLine={false}
                                                            width={54}
                                                            tickFormatter={(v: number) => v.toFixed(0)}
                                                        />
                                                        <Tooltip
                                                            formatter={(v: number) => [`${fmt(v)} Kz`, codigo.toUpperCase()]}
                                                            contentStyle={{ borderRadius: 12, fontSize: 12 }}
                                                        />
                                                        <Line
                                                            type="monotone"
                                                            dataKey="valor"
                                                            stroke={cor}
                                                            strokeWidth={2}
                                                            dot={false}
                                                            isAnimationActive={false}
                                                        />
                                                        {maximo && (
                                                            <ReferenceDot
                                                                x={maximo.etiqueta}
                                                                y={maximo.valor}
                                                                r={3}
                                                                fill={cor}
                                                                stroke="none"
                                                                label={{ value: fmt(maximo.valor), position: 'top', fontSize: 10, fill: 'currentColor' }}
                                                            />
                                                        )}
                                                        {minimo && (
                                                            <ReferenceDot
                                                                x={minimo.etiqueta}
                                                                y={minimo.valor}
                                                                r={3}
                                                                fill={cor}
                                                                stroke="none"
                                                                label={{ value: fmt(minimo.valor), position: 'bottom', fontSize: 10, fill: 'currentColor' }}
                                                            />
                                                        )}
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                                                    A carregar série…
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Repartição do mercado + maiores variações */}
                        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                            {([
                                { titulo: 'Moedas em Alta', pct: indicadores.pctAlta, qtd: indicadores.alta, cor: '#059669' },
                                { titulo: 'Moedas em Baixa', pct: indicadores.pctBaixa, qtd: indicadores.baixa, cor: '#e11d48' },
                                { titulo: 'Moedas Estáveis', pct: indicadores.pctEstaveis, qtd: indicadores.estaveis, cor: '#0ea5e9' },
                            ]).map((anel) => (
                                <div key={anel.titulo} className="card-elevated flex flex-col items-center p-4">
                                    <p className="mb-1 self-start text-sm font-bold text-foreground">{anel.titulo}</p>
                                    <div className="relative h-44 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={[
                                                        { nome: anel.titulo, valor: anel.pct },
                                                        { nome: 'Restante', valor: Math.max(0, 100 - anel.pct) },
                                                    ]}
                                                    dataKey="valor"
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius="70%"
                                                    outerRadius="90%"
                                                    startAngle={90}
                                                    endAngle={-270}
                                                    paddingAngle={2}
                                                    stroke="none"
                                                    isAnimationActive={false}
                                                >
                                                    <Cell fill={anel.cor} />
                                                    <Cell className="fill-muted" />
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>

                                        {/* Valor ao centro do anel */}
                                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                            <span className="font-display text-3xl font-black tracking-tight text-foreground">
                                                {anel.pct.toFixed(1)}%
                                            </span>
                                            <span className="text-[11px] font-semibold text-muted-foreground">
                                                {anel.qtd} de {indicadores.total}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <div className="card-elevated p-4">
                                <p className="mb-1 text-sm font-bold text-foreground">Maiores Variações</p>
                                <div className="h-44 w-full">
                                    {maioresVariacoes.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart
                                                data={maioresVariacoes}
                                                layout="vertical"
                                                margin={{ top: 4, right: 28, left: 0, bottom: 0 }}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                                                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                                <YAxis
                                                    type="category"
                                                    dataKey="nome"
                                                    tick={{ fontSize: 11 }}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    width={54}
                                                />
                                                <Tooltip
                                                    formatter={(v: number) => [`${v >= 0 ? '+' : ''}${v}%`, 'Variação']}
                                                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                                                />
                                                <Bar dataKey="variacao" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                                                    {maioresVariacoes.map((m) => (
                                                        <Cell key={m.nome} fill={m.variacao >= 0 ? '#059669' : '#e11d48'} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                                            Sem variações para mostrar.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Totais do dia */}
                        <div className="grid gap-4 sm:grid-cols-3">
                            {([
                                { rotulo: 'Moedas Acompanhadas', valor: cotacoes.length, cor: 'text-foreground' },
                                { rotulo: 'Em Alta', valor: indicadores.alta, cor: 'text-emerald-600' },
                                { rotulo: 'Em Baixa', valor: indicadores.baixa, cor: 'text-rose-600' },
                            ]).map((t) => (
                                <div key={t.rotulo} className="card-elevated p-5">
                                    <p className="text-sm font-semibold text-muted-foreground">{t.rotulo}</p>
                                    <p className={cn('font-display text-4xl font-black tracking-tight tabular-nums', t.cor)}>
                                        {t.valor.toLocaleString('pt-AO')}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Taxas de referência do BNA, quando a fonte responde */}
                        {taxasBNA.length > 0 && (
                            <section className="flex flex-col gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Landmark className="h-5 w-5 text-primary" />
                                    <h2 className="text-lg font-bold tracking-tight text-foreground">
                                        Taxas de referência do BNA
                                    </h2>
                                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                                        {taxasBNA.length}
                                    </span>
                                    {dataBNA && (
                                        <span className="text-xs text-muted-foreground">
                                            · publicação de {dataBNA}
                                        </span>
                                    )}
                                </div>
                                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                                    {taxasBNA
                                        .filter((t) => MOEDAS_PRINCIPAIS.includes(t.codigo.toLowerCase()))
                                        .map((t) => (
                                            <div key={t.codigo} className="card-kpi-amber">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 text-slate-950 shrink-0 dark:bg-white/10 dark:text-white">
                                                        <Landmark className="h-5 w-5" />
                                                    </div>
                                                    <p className="truncate text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">
                                                        {t.codigo}/AOA
                                                    </p>
                                                </div>
                                                <div className="my-2">
                                                    <p className="font-display truncate text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                                                        {fmt(t.taxa)}
                                                    </p>
                                                </div>
                                                <p className="truncate text-xs font-semibold text-slate-900/75 dark:text-slate-400" title={t.designacao}>
                                                    {t.designacao}
                                                </p>
                                            </div>
                                        ))}
                                </div>
                            </section>
                        )}

                        {/* Todas as moedas */}
                        <section className="flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <Activity className="h-5 w-5 text-primary" />
                                <h2 className="text-lg font-bold tracking-tight text-foreground">
                                    Todas as moedas
                                </h2>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                                    {filtradas.length}
                                </span>
                            </div>

                            <div className="card-elevated overflow-hidden">
                                {/* Barra de ferramentas da tabela: procura + tendência */}
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-muted bg-muted/20 p-3">
                                    <div className="relative w-full sm:w-72">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            placeholder="Procurar por código ou nome…"
                                            value={procura}
                                            onChange={(e) => setProcura(e.target.value)}
                                            className="pl-10"
                                        />
                                    </div>

                                    <div className="flex items-center gap-1 rounded-xl bg-background p-1 shadow-sm">
                                        {([
                                            { id: 'todas', rotulo: 'Todas', icone: null },
                                            { id: 'alta', rotulo: 'Em alta', icone: TrendingUp },
                                            { id: 'baixa', rotulo: 'Em baixa', icone: TrendingDown },
                                        ] as const).map((opcao) => {
                                            const activo = tendencia === opcao.id;
                                            const Icone = opcao.icone;
                                            return (
                                                <button
                                                    key={opcao.id}
                                                    type="button"
                                                    onClick={() => setTendencia(opcao.id)}
                                                    className={cn(
                                                        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                                                        activo
                                                            ? opcao.id === 'alta'
                                                                ? 'bg-emerald-600 text-white shadow-sm'
                                                                : opcao.id === 'baixa'
                                                                    ? 'bg-rose-600 text-white shadow-sm'
                                                                    : 'bg-foreground text-background shadow-sm'
                                                            : 'text-muted-foreground hover:bg-muted'
                                                    )}
                                                >
                                                    {Icone && <Icone className="h-3.5 w-3.5" />}
                                                    {opcao.rotulo}
                                                    <span className={cn(
                                                        'rounded-full px-1.5 text-[10px] tabular-nums',
                                                        activo ? 'bg-white/20' : 'bg-muted'
                                                    )}>
                                                        {contagens[opcao.id]}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                                                <TableHead className="w-28">
                                                    <button
                                                        type="button"
                                                        onClick={() => alternarOrdem('codigo')}
                                                        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                                                    >
                                                        Moeda <IconeOrdem coluna="codigo" />
                                                    </button>
                                                </TableHead>
                                                <TableHead>
                                                    <button
                                                        type="button"
                                                        onClick={() => alternarOrdem('nome')}
                                                        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                                                    >
                                                        Designação <IconeOrdem coluna="nome" />
                                                    </button>
                                                </TableHead>
                                                <TableHead className="text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => alternarOrdem('porAoa')}
                                                        className="ml-auto flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                                                    >
                                                        Cotação (AOA) <IconeOrdem coluna="porAoa" />
                                                    </button>
                                                </TableHead>
                                                <TableHead className="w-32 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => alternarOrdem('variacao')}
                                                        className="ml-auto flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                                                    >
                                                        Variação <IconeOrdem coluna="variacao" />
                                                    </button>
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>

                                        <TableBody>
                                            {visiveis.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                                                        {tendencia === 'alta'
                                                            ? 'Nenhuma moeda em alta nesta procura.'
                                                            : tendencia === 'baixa'
                                                                ? 'Nenhuma moeda em baixa nesta procura.'
                                                                : `Nenhuma moeda corresponde a “${procura}”.`}
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                visiveis.map((c) => {
                                                    const subiu = (c.variacao ?? 0) >= 0;
                                                    return (
                                                        <TableRow
                                                            key={c.codigo}
                                                            onClick={() => setSelecionada(c.codigo)}
                                                            title={`Ver histórico de ${c.nome}`}
                                                            className={cn(
                                                                'cursor-pointer',
                                                                selecionada === c.codigo && 'bg-emerald-500/10 hover:bg-emerald-500/15'
                                                            )}
                                                        >
                                                            <TableCell className="font-black uppercase tracking-wider">
                                                                {c.codigo}
                                                            </TableCell>
                                                            <TableCell className="text-muted-foreground">
                                                                {c.nome}
                                                            </TableCell>
                                                            <TableCell className="text-right font-display text-base font-black tabular-nums">
                                                                {fmt(c.porAoa)}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {c.variacao === undefined ? (
                                                                    <span className="text-muted-foreground">—</span>
                                                                ) : (
                                                                    <span className={cn(
                                                                        'inline-flex items-center gap-1 font-bold tabular-nums',
                                                                        subiu ? 'text-emerald-600' : 'text-rose-600'
                                                                    )}>
                                                                        {subiu ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                                                                        {subiu ? '+' : ''}{c.variacao.toFixed(2)}%
                                                                    </span>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* Paginação */}
                                <div className="flex items-center justify-between border-t border-muted bg-muted/20 px-4 py-3">
                                    <div className="text-sm text-muted-foreground">
                                        Mostrando{' '}
                                        <span className="font-medium">
                                            {ordenadas.length === 0 ? 0 : (pagexata - 1) * POR_PAGINA + 1}
                                        </span>{' '}
                                        a{' '}
                                        <span className="font-medium">
                                            {Math.min(ordenadas.length, pagexata * POR_PAGINA)}
                                        </span>{' '}
                                        de <span className="font-medium">{ordenadas.length}</span> moedas
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPagina((v) => Math.max(v - 1, 1))}
                                            disabled={pagexata === 1}
                                            className="h-8 w-8 p-0"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <span className="text-sm font-medium">
                                            Página {pagexata} de {totalPaginas}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPagina((v) => Math.min(v + 1, totalPaginas))}
                                            disabled={pagexata === totalPaginas}
                                            className="h-8 w-8 p-0"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </MainLayout>
    );
}
