import { useCallback, useEffect, useState } from 'react';
import { ServicoTaxasBNA, TaxaTicker, ResultadoTaxas, TAXAS_CACHE_TTL_MS } from '@/servicos/ServicoTaxasBNA';
import { TrendingUp, TrendingDown, Landmark, RefreshCw, WifiOff } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';

/**
 * Faixa de cotações do BNA e da banca comercial, a correr da direita para a esquerda.
 * A lista é duplicada para o ciclo da animação não deixar buracos.
 */
export function TickerTaxas() {
    // Arranca já com a última cópia guardada: a faixa aparece preenchida no
    // primeiro render, sem esperar por rede nenhuma.
    const cacheInicial = ServicoTaxasBNA.obterCache();
    const [taxas, setTaxas] = useState<TaxaTicker[]>(cacheInicial?.taxas || []);
    const [fonte, setFonte] = useState<ResultadoTaxas['fonte']>(cacheInicial ? 'cache' : 'nenhuma');
    const [erro, setErro] = useState<string | null>(null);
    const [aCarregar, setACarregar] = useState(!cacheInicial);

    const aplicar = useCallback((r: ResultadoTaxas) => {
        if (r.taxas.length === 0) return false;
        setTaxas(r.taxas);
        setFonte(r.fonte);
        setErro(null);
        return true;
    }, []);

    /**
     * Actualiza em duas etapas para o arranque não ficar refém da fonte lenta:
     * primeiro a de mercado (rápida), depois a do BNA, que substitui a anterior
     * se responder. Com o BNA em quarentena a segunda etapa nem chega a correr.
     */
    const carregar = useCallback(async () => {
        setACarregar(true);
        try {
            const mercado = await ServicoTaxasBNA.obterMercado();
            const temDados = aplicar(mercado);
            if (!temDados) setErro(mercado.erro || null);
            setACarregar(false);

            if (!ServicoTaxasBNA.bnaIndisponivel()) {
                const completo = await ServicoTaxasBNA.obterTodas();
                if (completo.fonte === 'bna') aplicar(completo);
            }
        } catch {
            setTaxas(current => {
                if (current.length === 0) setErro('Falha ao contactar o serviço de taxas.');
                return current;
            });
        } finally {
            setACarregar(false);
        }
    }, [aplicar]);

    useEffect(() => {
        carregar();
        const intervalo = setInterval(carregar, TAXAS_CACHE_TTL_MS);
        return () => clearInterval(intervalo);
    }, [carregar]);

    // Sem taxas e sem erro ainda: não ocupa espaço no topo.
    if (aCarregar && taxas.length === 0 && !erro) return null;

    if (taxas.length === 0) {
        return (
            <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border bg-muted/40 px-4 text-[13px] font-medium text-muted-foreground">
                <WifiOff className="h-4 w-4 shrink-0" />
                <span className="truncate">{erro || 'Taxas do BNA indisponíveis.'}</span>
                <button
                    type="button"
                    onClick={carregar}
                    className="ml-auto flex shrink-0 items-center gap-1 font-bold text-primary hover:underline"
                >
                    <RefreshCw className={cn('h-3.5 w-3.5', aCarregar && 'animate-spin')} />
                    Tentar de novo
                </button>
            </div>
        );
    }

    // Duplicado: a animação desloca-se exactamente -50%, por isso a segunda
    // metade entra pela direita no instante em que a primeira sai pela esquerda.
    const sequencia = [...taxas, ...taxas];

    return (
        <div className="group relative flex h-12 shrink-0 items-center overflow-hidden border-b-2 border-emerald-400/40 bg-gradient-to-r from-emerald-800 via-teal-700 to-emerald-800 text-white shadow-lg">
            {/* Etiqueta fixa à esquerda */}
            <div className="z-20 flex h-full shrink-0 items-center gap-2 bg-slate-950 px-4 text-amber-300 shadow-lg">
                <Landmark className="h-5 w-5 shrink-0" />
                <span className="text-sm font-black uppercase tracking-wider">
                    BNA
                </span>
            </div>

            <div className="relative flex-1 overflow-hidden">
                <div
                    className="flex w-max animate-ticker gap-10 whitespace-nowrap pl-10 group-hover:[animation-play-state:paused]"
                    style={{
                        // Velocidade constante e legível (~40px/s), independentemente do número de taxas.
                        animationDuration: `${Math.max(60, taxas.length * 7)}s`,
                        maskImage: 'linear-gradient(to right, transparent, black 3rem, black calc(100% - 3rem), transparent)',
                        WebkitMaskImage: 'linear-gradient(to right, transparent, black 3rem, black calc(100% - 3rem), transparent)',
                    }}
                >
                    {sequencia.map((t, i) => (
                        <span key={`${t.id}-${i}`} className="flex items-center gap-2.5 text-[13px]">
                            <span className="font-medium text-white/60">{t.grupo}</span>
                            <span className="font-semibold text-white">{t.rotulo}</span>
                            <span className="text-[15px] font-black tabular-nums text-amber-300">{t.valor}</span>
                            {t.tendencia === 'up' && <TrendingUp className="h-4 w-4 text-emerald-400" />}
                            {t.tendencia === 'down' && <TrendingDown className="h-4 w-4 text-rose-400" />}
                            <span className="ml-8 h-1.5 w-1.5 shrink-0 rounded-full bg-white/35" />
                        </span>
                    ))}
                </div>

            </div>

            {fonte === 'mercado' && (
                <span
                    title="O serviço do BNA está indisponível; a mostrar cotações de mercado."
                    className="z-20 shrink-0 self-stretch flex items-center bg-sky-500/15 px-3 text-[11px] font-bold uppercase tracking-wider text-sky-300"
                >
                    Mercado
                </span>
            )}

            {fonte === 'cache' && (
                <span
                    title="A fonte está inacessível; a mostrar os últimos valores guardados."
                    className="z-20 shrink-0 self-stretch flex items-center bg-amber-500/15 px-3 text-[11px] font-bold uppercase tracking-wider text-amber-400"
                >
                    Em cache
                </span>
            )}
        </div>
    );
}
