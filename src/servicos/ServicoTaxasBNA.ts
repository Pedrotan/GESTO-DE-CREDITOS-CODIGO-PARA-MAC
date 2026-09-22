/**
 * Taxas do Banco Nacional de Angola e da banca comercial.
 *
 * Fonte: Angola API (https://angola-api.netlify.app/docs/taxas/).
 * O endereço é configurável por `VITE_ANGOLA_API_URL` porque o host documentado
 * (Heroku) foi desactivado — ver README/NOTA no fim deste ficheiro.
 *
 * Nenhum endpoint em falta derruba os restantes: cada um é obtido em paralelo e
 * o que falhar é simplesmente omitido do resultado.
 */

import { ServicoBNA } from './ServicoBNA';

const BASE_URL =
    (import.meta.env.VITE_ANGOLA_API_URL as string | undefined)?.replace(/\/+$/, '') ||
    'https://angolaapi.onrender.com/api/v1';

/**
 * Recurso para as taxas de câmbio quando a Angola API não responde.
 * Sem chave, com CORS aberto, cotações de mercado actualizadas diariamente.
 */
const FALLBACK_CAMBIO_URL = 'https://open.er-api.com/v6/latest/USD';

/** Moedas mostradas no ticker quando se usa o recurso alternativo. */
const MOEDAS_FALLBACK = ['USD', 'EUR', 'ZAR', 'GBP', 'CNY', 'BRL'];

/** A Angola API faz scraping e é lenta; não vale a pena esperar por ela. */
const TIMEOUT_BNA_MS = 6_000;
/** A fonte de mercado é um JSON simples e responde em centenas de ms. */
const TIMEOUT_MERCADO_MS = 8_000;

const CACHE_KEY = 'tango_taxas_bna';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

/**
 * Enquanto a Angola API estiver avariada não faz sentido voltar a sondá-la a
 * cada arranque: seis pedidos a expirar antes de mostrar seja o que for.
 * Depois de uma falha completa fica de quarentena durante este tempo.
 */
const QUARENTENA_KEY = 'tango_taxas_bna_falha';
const QUARENTENA_MS = 60 * 60 * 1000; // 1 hora

function bnaEmQuarentena(): boolean {
    try {
        const t = Number(localStorage.getItem(QUARENTENA_KEY) || 0);
        return Date.now() - t < QUARENTENA_MS;
    } catch {
        return false;
    }
}

function marcarFalhaBNA() {
    try { localStorage.setItem(QUARENTENA_KEY, String(Date.now())); } catch { /* opcional */ }
}

function limparQuarentenaBNA() {
    try { localStorage.removeItem(QUARENTENA_KEY); } catch { /* opcional */ }
}

/** Uma taxa já normalizada, pronta a mostrar no ticker. */
export interface TaxaTicker {
    id: string;
    /** Família da taxa, ex.: "Taxa de câmbio do BNA" */
    grupo: string;
    /** Identificação dentro da família, ex.: "USD", "Overnight", "Inflação Mensal" */
    rotulo: string;
    /** Valor já formatado para leitura, ex.: "15,5%" ou "635,762" */
    valor: string;
    /** Direcção da variação, quando a fonte a fornece. */
    tendencia?: 'up' | 'down' | null;
}

export interface ResultadoTaxas {
    taxas: TaxaTicker[];
    /** Data indicada pela fonte, quando disponível. */
    data?: string;
    /** true quando os dados vieram da cache local por a fonte estar inacessível. */
    emCache: boolean;
    /** Origem efectiva dos dados mostrados. */
    fonte: 'bna' | 'mercado' | 'cache' | 'nenhuma';
    /** Preenchido quando nenhuma taxa pôde ser obtida. */
    erro?: string;
}

async function obterJSON<T>(caminho: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_BNA_MS);
    try {
        const resposta = await fetch(`${BASE_URL}${caminho}`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
        });
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

        // O host desactivado responde com uma página HTML e status 200/404;
        // sem esta verificação o JSON.parse rebentava com um erro pouco claro.
        const texto = await resposta.text();
        const inicio = texto.trimStart()[0];
        if (inicio !== '{' && inicio !== '[') {
            throw new Error('Resposta não é JSON (serviço provavelmente indisponível)');
        }
        return JSON.parse(texto) as T;
    } finally {
        clearTimeout(timer);
    }
}

/** Converte "1.234,56" ou 1234.56 num número, ou null se não for possível. */
function paraNumero(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v !== 'string') return null;
    const n = Number(v.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

function formatarNumero(v: unknown): string {
    const n = paraNumero(v);
    if (n === null) return String(v ?? '—');
    return n.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

function tendenciaDe(variacao: string): 'up' | 'down' | null {
    const n = paraNumero(variacao);
    if (n === null || n === 0) return null;
    return n > 0 ? 'up' : 'down';
}

// --- Formas das respostas, tal como documentadas ---
interface RespJuroBNA { rate: string }
interface RespCambio { rates: Array<{ currency: string; rate: number | string }> }
interface RespInflacao { date?: string; status?: string; rates: Array<{ type: string; rate: string }> }
interface RespLuibor { date?: string; rates: Array<{ maturity: string; rate: string }> }
interface RespVariacao {
    date?: string;
    banks: Array<{
        name: string;
        variation?: { buy?: Array<{ currency: string; variation: string }> };
    }>;
}
interface RespDepositos {
    date?: string;
    banks: Array<{ name: string; rates: Array<{ days: number; rate: string }> }>;
}

/** Abrevia "Banco Angolano de Investimentos - (BAI)" para "BAI". */
function siglaBanco(nome: string): string {
    const m = nome.match(/\(([^)]+)\)\s*$/);
    return m ? m[1] : nome.split(' ').slice(-1)[0];
}

interface RespFallback {
    result?: string;
    time_last_update_utc?: string;
    rates?: Record<string, number>;
}

/**
 * Taxas de câmbio a partir da fonte alternativa.
 * A resposta vem em base USD, por isso X/AOA = rates.AOA / rates.X.
 */
async function obterCambioAlternativo(): Promise<{ taxas: TaxaTicker[]; data?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MERCADO_MS);
    try {
        const resposta = await fetch(FALLBACK_CAMBIO_URL, { signal: controller.signal });
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
        const j = (await resposta.json()) as RespFallback;
        if (j.result !== 'success' || !j.rates?.AOA) throw new Error('resposta inesperada');

        const taxas: TaxaTicker[] = [];
        for (const moeda of MOEDAS_FALLBACK) {
            const cotacao = j.rates[moeda];
            if (!cotacao) continue;
            taxas.push({
                id: `cambio-${moeda}`,
                grupo: 'Taxa de câmbio (mercado)',
                rotulo: `${moeda}/AOA`,
                valor: formatarNumero(j.rates.AOA / cotacao),
            });
        }
        return { taxas, data: j.time_last_update_utc };
    } finally {
        clearTimeout(timer);
    }
}

export const ServicoTaxasBNA = {
    /**
     * Última cópia guardada, lida de forma síncrona.
     * Serve para a faixa aparecer preenchida no primeiro render, sem esperar pela rede.
     */
    obterCache(): { taxas: TaxaTicker[]; data?: string } | null {
        return lerCache();
    },

    /** true quando a Angola API falhou há pouco e está a ser saltada. */
    bnaIndisponivel(): boolean {
        return bnaEmQuarentena();
    },

    /**
     * Só a fonte de mercado. Responde em centenas de milissegundos, por isso é
     * o que se usa para preencher a faixa depressa no arranque.
     */
    async obterMercado(): Promise<ResultadoTaxas> {
        try {
            const r = await obterCambioAlternativo();
            if (r.taxas.length > 0) {
                guardarCache({ taxas: r.taxas, data: r.data });
                return { ...r, emCache: false, fonte: 'mercado' };
            }
        } catch { /* tratado pelo chamador */ }

        const cache = lerCache();
        if (cache) return { taxas: cache.taxas, data: cache.data, emCache: true, fonte: 'cache' };

        return {
            taxas: [],
            emCache: false,
            fonte: 'nenhuma',
            erro: 'Não foi possível obter as taxas. Verifique a ligação à internet.',
        };
    },

    /**
     * Obtém todas as taxas em paralelo.
     * Se nada for obtido, devolve a última cópia em cache (se existir).
     */
    async obterTodas(): Promise<ResultadoTaxas> {
        // Via principal: API oficial do BNA (www.bna.ao/service/rest).
        // Responde com CORS aberto, por isso é consultada directamente.
        try {
            const oficial = await ServicoBNA.obterReferencia();
            if (oficial.taxas.length > 0 && !oficial.emCache) {
                const taxas: TaxaTicker[] = oficial.taxas.map((t) => ({
                    id: `bna-${t.codigo}`,
                    grupo: 'Taxa de câmbio do BNA',
                    rotulo: `${t.codigo}/AOA`,
                    valor: formatarNumero(t.taxa),
                }));
                limparQuarentenaBNA();
                guardarCache({ taxas, data: oficial.data });
                return { taxas, data: oficial.data, emCache: false, fonte: 'bna' };
            }
        } catch {
            // segue para as vias seguintes
        }

        // Fonte em quarentena: nem vale a pena tentar, iria só somar seis
        // expirações antes de a faixa mostrar fosse o que fosse.
        if (bnaEmQuarentena()) {
            return this.obterMercado();
        }

        const [juroBNA, cambio, inflacao, luibor, variacao, depositos] = await Promise.allSettled([
            obterJSON<RespJuroBNA>('/banks/rates/interest/bna'),
            obterJSON<RespCambio>('/banks/rates/exchange'),
            obterJSON<RespInflacao>('/banks/rates/inflation'),
            obterJSON<RespLuibor>('/banks/rates/interest/luibor'),
            obterJSON<RespVariacao>('/banks/rates/comercial-exchange'),
            obterJSON<RespDepositos>('/banks/rates/interest/term-deposit'),
        ]);

        const taxas: TaxaTicker[] = [];
        let data: string | undefined;

        // 1. Taxa de Juros do BNA (taxa directora)
        if (juroBNA.status === 'fulfilled' && juroBNA.value?.rate) {
            taxas.push({
                id: 'bna-juro',
                grupo: 'Taxa de Juros do BNA',
                rotulo: 'Taxa Directora',
                valor: juroBNA.value.rate,
            });
        }

        // 2. Taxa de câmbio do BNA
        if (cambio.status === 'fulfilled' && Array.isArray(cambio.value?.rates)) {
            cambio.value.rates.forEach((r) => {
                taxas.push({
                    id: `cambio-${r.currency}`,
                    grupo: 'Taxa de câmbio do BNA',
                    rotulo: `${r.currency}/AOA`,
                    valor: formatarNumero(r.rate),
                });
            });
        }

        // 3. Taxa de inflação
        if (inflacao.status === 'fulfilled' && Array.isArray(inflacao.value?.rates)) {
            data ??= inflacao.value.date;
            inflacao.value.rates.forEach((r) => {
                taxas.push({
                    id: `inflacao-${r.type}`,
                    grupo: 'Taxa de inflação',
                    rotulo: r.type,
                    valor: r.rate,
                });
            });
        }

        // 4. Luibor
        if (luibor.status === 'fulfilled' && Array.isArray(luibor.value?.rates)) {
            data ??= luibor.value.date;
            luibor.value.rates.forEach((r) => {
                taxas.push({
                    id: `luibor-${r.maturity}`,
                    grupo: 'Taxa de Juro de Luibor',
                    rotulo: r.maturity,
                    valor: r.rate,
                });
            });
        }

        // 5. Variação de câmbio (compra, por banco)
        if (variacao.status === 'fulfilled' && Array.isArray(variacao.value?.banks)) {
            data ??= variacao.value.date;
            variacao.value.banks.slice(0, 6).forEach((banco) => {
                banco.variation?.buy?.forEach((v) => {
                    taxas.push({
                        id: `variacao-${banco.name}-${v.currency}`,
                        grupo: 'Taxa de Variação de Câmbio',
                        rotulo: `${siglaBanco(banco.name)} ${v.currency}`,
                        valor: v.variation,
                        tendencia: tendenciaDe(v.variation),
                    });
                });
            });
        }

        // 6. Bancos comerciais (depósitos a prazo, 360 dias)
        if (depositos.status === 'fulfilled' && Array.isArray(depositos.value?.banks)) {
            data ??= depositos.value.date;
            depositos.value.banks.slice(0, 8).forEach((banco) => {
                const anual = banco.rates?.find((r) => r.days >= 360) || banco.rates?.slice(-1)[0];
                if (!anual) return;
                taxas.push({
                    id: `deposito-${banco.name}`,
                    grupo: 'Taxa de Juros dos Bancos Comerciais',
                    rotulo: `${siglaBanco(banco.name)} · ${anual.days}d`,
                    valor: anual.rate,
                });
            });
        }

        if (taxas.length > 0) {
            limparQuarentenaBNA();
            guardarCache({ taxas, data });
            return { taxas, data, emCache: false, fonte: 'bna' };
        }

        // Falhou por completo: entra em quarentena para os próximos arranques
        // irem directos à fonte de mercado.
        marcarFalhaBNA();
        return this.obterMercado();
    },
};

function guardarCache(payload: { taxas: TaxaTicker[]; data?: string }) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ...payload, guardadoEm: Date.now() }));
    } catch { /* quota cheia ou storage indisponível: a cache é um extra */ }
}

function lerCache(): { taxas: TaxaTicker[]; data?: string } | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const c = JSON.parse(raw);
        if (!Array.isArray(c?.taxas) || c.taxas.length === 0) return null;
        if (Date.now() - (c.guardadoEm || 0) > CACHE_TTL_MS * 48) return null; // 24h: acima disso é ruído
        return { taxas: c.taxas, data: c.data };
    } catch {
        return null;
    }
}

export const TAXAS_CACHE_TTL_MS = CACHE_TTL_MS;
