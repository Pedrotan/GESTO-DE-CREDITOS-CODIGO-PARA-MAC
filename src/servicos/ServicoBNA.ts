/**
 * Taxas oficiais do Banco Nacional de Angola.
 *
 * Fala directamente com a API do próprio BNA (`https://www.bna.ao/service/rest`),
 * a mesma que alimenta o sítio oficial. Não é preciso proxy nem scraping: o
 * serviço responde com `Access-Control-Allow-Origin: *`.
 *
 * Substitui a Angola API, que fazia scraping do BNA com Puppeteer e está
 * avariada na origem (o Chrome dela não arranca no servidor).
 */

const BASE_URL =
    (import.meta.env.VITE_BNA_API_URL as string | undefined)?.replace(/\/+$/, '') ||
    'https://www.bna.ao/service/rest';

const TIMEOUT_MS = 12_000;
const CACHE_KEY = 'tango_bna_referencia';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas: o BNA publica uma vez por dia

/** O BNA publica três tipos por moeda; "M" é a taxa de referência média. */
const TIPO_MEDIO = 'M';

export interface TaxaBNA {
    /** Código ISO, ex.: "USD" */
    codigo: string;
    /** Designação oficial, ex.: "DÓLAR AMERICANO" */
    designacao: string;
    /** Kwanzas por unidade da moeda. */
    taxa: number;
    /** Data da publicação, ISO curta. */
    data: string;
}

export interface PontoBNA {
    data: string;
    /** Etiqueta curta para eixos, ex.: "26/08" */
    etiqueta: string;
    valor: number;
}

export interface ResultadoBNA {
    taxas: TaxaBNA[];
    /** Data da publicação mais recente. */
    data?: string;
    emCache: boolean;
    erro?: string;
}

interface RespostaBNA<T> { genericResponse: T[] }

interface RegistoTaxa {
    taxa: number;
    tipoCambio: string;
    descricaoTipoCambio: string;
    data: string;
    designacaoMoeda: string;
    codigoMoeda: string;
}

async function obterJSON<T>(caminho: string): Promise<RespostaBNA<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const r = await fetch(`${BASE_URL}${caminho}`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as RespostaBNA<T>;
        if (!Array.isArray(j?.genericResponse)) throw new Error('resposta inesperada');
        return j;
    } finally {
        clearTimeout(timer);
    }
}

function etiquetaData(iso: string): string {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
}

function guardarCache(payload: { taxas: TaxaBNA[]; data?: string }) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ...payload, guardadoEm: Date.now() }));
    } catch { /* a cache é um extra */ }
}

export const ServicoBNA = {
    /** Última cópia guardada, lida de forma síncrona para o primeiro render. */
    obterCache(): ResultadoBNA | null {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const c = JSON.parse(raw);
            if (!Array.isArray(c?.taxas) || c.taxas.length === 0) return null;
            if (Date.now() - (c.guardadoEm || 0) > CACHE_TTL_MS * 28) return null; // 7 dias
            return { taxas: c.taxas, data: c.data, emCache: true };
        } catch {
            return null;
        }
    },

    /**
     * Taxas de referência de todas as moedas cotadas pelo BNA.
     * Só se fica com a taxa média: a resposta traz compra, venda e média por
     * moeda, e mostrar as três triplicaria as linhas sem acrescentar leitura.
     */
    async obterReferencia(): Promise<ResultadoBNA> {
        try {
            const j = await obterJSON<RegistoTaxa>('/taxas/get/taxa/referencia');

            const taxas: TaxaBNA[] = j.genericResponse
                .filter((r) => r.tipoCambio === TIPO_MEDIO && Number.isFinite(r.taxa))
                .map((r) => ({
                    codigo: r.codigoMoeda,
                    designacao: r.designacaoMoeda,
                    taxa: r.taxa,
                    data: r.data,
                }))
                .sort((a, b) => a.codigo.localeCompare(b.codigo));

            if (taxas.length === 0) throw new Error('sem taxas médias na resposta');

            const resultado = { taxas, data: taxas[0].data, emCache: false };
            guardarCache(resultado);
            return resultado;
        } catch {
            const cache = this.obterCache();
            if (cache) return cache;
            return {
                taxas: [],
                emCache: false,
                erro: 'Não foi possível obter as taxas do BNA. Verifique a ligação à internet.',
            };
        }
    },

    /**
     * Evolução histórica de uma moeda, tal como o BNA a publica.
     * A série vem completa desde o início do período disponível; `dias` corta
     * apenas os pontos mais recentes.
     */
    async obterEvolucao(codigo: string, dias = 30): Promise<PontoBNA[]> {
        try {
            const j = await obterJSON<RegistoTaxa>(
                `/taxas/get/evolucao/taxa?codigoMoeda=${encodeURIComponent(codigo.toUpperCase())}`
            );

            const pontos = j.genericResponse
                .filter((r) => Number.isFinite(r.taxa) && !!r.data)
                .map((r) => ({ data: r.data, etiqueta: etiquetaData(r.data), valor: r.taxa }))
                .sort((a, b) => a.data.localeCompare(b.data));

            return dias > 0 ? pontos.slice(-dias) : pontos;
        } catch {
            return [];
        }
    },
};

export const BNA_CACHE_TTL_MS = CACHE_TTL_MS;
