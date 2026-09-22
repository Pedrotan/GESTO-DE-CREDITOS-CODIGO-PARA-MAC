/**
 * Câmbios do kwanza contra todas as moedas, com histórico diário para gráficos.
 *
 * Fonte: currency-api (@fawazahmed0) servida por jsDelivr.
 * Escolhida por três razões que as alternativas não reúnem: cobre o AOA, expõe
 * histórico por data (`@AAAA-MM-DD`), e responde com CORS aberto sem chave.
 */

const CDN = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api';
const TIMEOUT_MS = 10_000;
const CACHE_KEY = 'tango_mercado_cambio';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Moedas postas à cabeça por serem as de uso corrente em Angola. */
export const MOEDAS_PRINCIPAIS = ['usd', 'eur', 'zar', 'gbp', 'cny', 'brl', 'nad', 'cad', 'jpy', 'chf'];

export interface CotacaoMoeda {
    /** Código em minúsculas, ex.: "usd" */
    codigo: string;
    /** Nome da moeda quando conhecido, ex.: "US Dollar" */
    nome: string;
    /** Quantos kwanzas vale 1 unidade desta moeda. */
    porAoa: number;
    /** Variação percentual face ao dia anterior disponível. */
    variacao?: number;
}

export interface PontoHistorico {
    /** Data ISO curta, ex.: "2026-08-26" */
    data: string;
    /** Etiqueta curta para o eixo, ex.: "26/08" */
    etiqueta: string;
    /** Valor em kwanzas por unidade da moeda. */
    valor: number;
}

export interface ResultadoMercado {
    cotacoes: CotacaoMoeda[];
    /** Data indicada pela fonte. */
    data?: string;
    emCache: boolean;
    erro?: string;
}

async function obterJSON<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const r = await fetch(url, { signal: controller.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as T;
    } finally {
        clearTimeout(timer);
    }
}

interface RespAoa { date?: string; aoa: Record<string, number> }

/** Nomes das moedas, obtidos uma vez e reaproveitados. */
let nomesCache: Record<string, string> | null = null;

async function obterNomes(): Promise<Record<string, string>> {
    if (nomesCache) return nomesCache;
    try {
        nomesCache = await obterJSON<Record<string, string>>(`${CDN}@latest/v1/currencies.json`);
    } catch {
        nomesCache = {}; // sem nomes mostra-se só o código
    }
    return nomesCache;
}

function etiquetaData(iso: string): string {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
}

/** Datas dos últimos `dias` dias, da mais antiga para a mais recente. */
function ultimasDatas(dias: number): string[] {
    const saida: string[] = [];
    const hoje = new Date();
    for (let i = dias - 1; i >= 0; i--) {
        const d = new Date(hoje);
        d.setDate(d.getDate() - i);
        saida.push(d.toISOString().slice(0, 10));
    }
    return saida;
}

/**
 * Os dois conjuntos de dados distintos mais recentes.
 *
 * Não se usa `@latest` porque o jsDelivr serve-o com atraso: chega a reportar
 * a véspera quando o ficheiro do próprio dia já existe. Comparar `@latest` com
 * "ontem" devolvia então o mesmo dia duas vezes, e a variação dava zero em
 * todas as moedas. Pedem-se os últimos dias por data explícita e ficam-se com
 * os dois cujo campo `date` é de facto diferente.
 */
async function obterDoisDiasDistintos(): Promise<{ atual: RespAoa | null; anterior: RespAoa | null }> {
    const datas = [...ultimasDatas(6)].reverse(); // do mais recente para o mais antigo
    const respostas = await Promise.allSettled(
        datas.map((d) => obterJSON<RespAoa>(`${CDN}@${d}/v1/currencies/aoa.json`))
    );

    let atual: RespAoa | null = null;
    let anterior: RespAoa | null = null;
    for (const r of respostas) {
        if (r.status !== 'fulfilled' || !r.value?.aoa) continue;
        if (!atual) { atual = r.value; continue; }
        if (r.value.date !== atual.date) { anterior = r.value; break; }
    }
    return { atual, anterior };
}

export const ServicoMercadoCambio = {
    obterCache(): ResultadoMercado | null {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const c = JSON.parse(raw);
            if (!Array.isArray(c?.cotacoes) || c.cotacoes.length === 0) return null;
            if (Date.now() - (c.guardadoEm || 0) > CACHE_TTL_MS * 7) return null;
            return { cotacoes: c.cotacoes, data: c.data, emCache: true };
        } catch {
            return null;
        }
    },

    /**
     * Todas as moedas contra o kwanza.
     * A resposta vem em base AOA (quantas unidades de X valem 1 AOA), por isso
     * o valor mostrado é o inverso: quantos kwanzas custa 1 unidade de X.
     */
    async obterTodas(): Promise<ResultadoMercado> {
        try {
            const [dias, nomes] = await Promise.all([obterDoisDiasDistintos(), obterNomes()]);
            const hoje = dias.atual;
            if (!hoje?.aoa) throw new Error('resposta inesperada');

            // Sem dia anterior as cotações mostram-se na mesma, apenas sem variação.
            const anterior: Record<string, number> | null = dias.anterior?.aoa || null;

            const cotacoes: CotacaoMoeda[] = [];
            for (const [codigo, valor] of Object.entries(hoje.aoa)) {
                if (codigo === 'aoa' || !valor || !Number.isFinite(valor)) continue;
                const porAoa = 1 / valor;
                if (!Number.isFinite(porAoa)) continue;

                let variacao: number | undefined;
                const ant = anterior?.[codigo];
                if (ant && Number.isFinite(ant)) {
                    const antPorAoa = 1 / ant;
                    if (antPorAoa > 0) variacao = ((porAoa - antPorAoa) / antPorAoa) * 100;
                }

                cotacoes.push({
                    codigo,
                    nome: nomes[codigo] || codigo.toUpperCase(),
                    porAoa,
                    variacao,
                });
            }

            // Principais à cabeça, o resto por ordem alfabética.
            cotacoes.sort((a, b) => {
                const ia = MOEDAS_PRINCIPAIS.indexOf(a.codigo);
                const ib = MOEDAS_PRINCIPAIS.indexOf(b.codigo);
                if (ia !== -1 || ib !== -1) {
                    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
                }
                return a.codigo.localeCompare(b.codigo);
            });

            const resultado = { cotacoes, data: hoje.date, emCache: false };
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({ ...resultado, guardadoEm: Date.now() }));
            } catch { /* cache é um extra */ }
            return resultado;
        } catch (e) {
            const cache = this.obterCache();
            if (cache) return cache;
            return {
                cotacoes: [],
                emCache: false,
                erro: 'Não foi possível obter as cotações. Verifique a ligação à internet.',
            };
        }
    },

    /**
     * Séries diárias de várias moedas de uma só vez.
     *
     * Cada data é pedida uma única vez e dela extraem-se todas as moedas
     * pedidas. Buscar N moedas em separado multiplicaria os pedidos por N,
     * quando a resposta de cada dia já traz o mercado inteiro.
     */
    async obterHistoricoMultiplo(
        codigos: string[],
        dias = 30
    ): Promise<Record<string, PontoHistorico[]>> {
        const datas = ultimasDatas(dias);
        const respostas = await Promise.allSettled(
            datas.map((d) => obterJSON<RespAoa>(`${CDN}@${d}/v1/currencies/aoa.json`))
        );

        const saida: Record<string, PontoHistorico[]> = {};
        codigos.forEach((c) => { saida[c] = []; });
        const vistos = new Set<string>();

        respostas.forEach((r, i) => {
            if (r.status !== 'fulfilled' || !r.value?.aoa) return;
            const data = r.value.date || datas[i];
            if (vistos.has(data)) return;
            vistos.add(data);

            codigos.forEach((c) => {
                const bruto = r.value.aoa[c];
                if (!bruto || !Number.isFinite(bruto)) return;
                const valor = 1 / bruto;
                if (!Number.isFinite(valor)) return;
                saida[c].push({ data, etiqueta: etiquetaData(data), valor });
            });
        });

        codigos.forEach((c) => saida[c].sort((x, y) => x.data.localeCompare(y.data)));
        return saida;
    },

    /**
     * Série diária de uma moeda contra o kwanza.
     * Os dias em falta na fonte (fins de semana, feriados) são simplesmente omitidos.
     */
    async obterHistorico(codigo: string, dias = 14): Promise<PontoHistorico[]> {
        const datas = ultimasDatas(dias);
        const respostas = await Promise.allSettled(
            datas.map((d) => obterJSON<RespAoa>(`${CDN}@${d}/v1/currencies/aoa.json`))
        );

        // Usa-se a data que a resposta reporta, e não a que foi pedida: um dia em
        // falta na fonte é servido com o conteúdo de outro, o que duplicaria pontos.
        const pontos: PontoHistorico[] = [];
        const vistos = new Set<string>();
        respostas.forEach((r, i) => {
            if (r.status !== 'fulfilled') return;
            const bruto = r.value?.aoa?.[codigo];
            if (!bruto || !Number.isFinite(bruto)) return;
            const valor = 1 / bruto;
            if (!Number.isFinite(valor)) return;

            const data = r.value.date || datas[i];
            if (vistos.has(data)) return;
            vistos.add(data);
            pontos.push({ data, etiqueta: etiquetaData(data), valor });
        });

        pontos.sort((a, b) => a.data.localeCompare(b.data));
        return pontos;
    },
};
