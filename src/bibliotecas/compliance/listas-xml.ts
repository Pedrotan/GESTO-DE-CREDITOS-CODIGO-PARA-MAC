// Leitura das listas oficiais de sanções descarregadas pelo utilizador (o sistema não as descarrega sozinho):
// - ONU: Lista Consolidada do Conselho de Segurança (consolidated.xml, raiz <CONSOLIDATED_LIST dateGenerated="…">);
// - OFAC (EUA): SDN.XML ou CONSOLIDATED.XML (raiz <sdnList>, com <publshInformation><Publish_Date>).
// Inclui um leitor de XML mínimo e sem dependências (funciona no navegador, no Electron e nos testes). Navios e
// aeronaves ficam de fora: só interessam pessoas e entidades.

export type FonteLista = 'ONU' | 'OFAC' | 'INTERNA';
export type TipoEntrada = 'pessoa' | 'entidade';
export type EntradaLista = {
    fonte: FonteLista; ref: string; tipo: TipoEntrada; nome: string; aliases: string[];
    /** Datas de nascimento ('aaaa-mm-dd', 'aaaa-mm' ou 'aaaa'). */
    nascimentos: string[]; nacionalidades: string[]; programa: string | null; notas: string | null;
};
export type ListaLida = { fonte: Exclude<FonteLista, 'INTERNA'>; dataLista: string | null; entradas: EntradaLista[]; ignoradas: number };

export const FONTES_OFICIAIS: Record<Exclude<FonteLista, 'INTERNA'>, { nome: string; url: string; ficheiro: string }> = {
    ONU: { nome: 'Lista Consolidada do Conselho de Segurança da ONU', url: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml', ficheiro: 'consolidated.xml' },
    OFAC: { nome: 'OFAC — Specially Designated Nationals (EUA)', url: 'https://sanctionslist.ofac.treas.gov/Home/SdnList', ficheiro: 'SDN.XML' },
};

// ── Leitor de XML ────────────────────────────────────────────────────────────────
export type NoXml = { nome: string; attrs: Record<string, string>; filhos: NoXml[]; texto: string };

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const descodificar = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (m, e: string) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENTIDADES[e.toLowerCase()] ?? m;
});
const semPrefixo = (nome: string) => nome.slice(nome.indexOf(':') + 1);

/** Lê um documento XML para uma árvore simples (nomes sem prefixo de namespace). Lança erro se estiver mal formado. */
export function lerXml(xml: string): NoXml {
    const raiz: NoXml = { nome: '#documento', attrs: {}, filhos: [], texto: '' };
    const pilha: NoXml[] = [raiz];
    const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/gu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
        const topo = pilha[pilha.length - 1];
        if (m[1] !== undefined) { topo.texto += m[1]; continue; }
        if (m[6] !== undefined) { topo.texto += descodificar(m[6]); continue; }
        if (m[3] === undefined) continue; // comentário, instrução, DOCTYPE
        const nome = semPrefixo(m[3]);
        if (m[2] === '/') {
            if (pilha.length < 2 || topo.nome !== nome) throw new Error(`XML mal formado: </${nome}> inesperado.`);
            pilha.pop();
            continue;
        }
        const attrs: Record<string, string> = {};
        const reAttr = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
        let a: RegExpExecArray | null;
        while ((a = reAttr.exec(m[4] || ''))) attrs[semPrefixo(a[1])] = descodificar(a[2] ?? a[3] ?? '');
        const no: NoXml = { nome, attrs, filhos: [], texto: '' };
        topo.filhos.push(no);
        if (m[5] !== '/') pilha.push(no);
    }
    if (pilha.length !== 1) throw new Error(`XML incompleto: <${pilha[pilha.length - 1].nome}> não foi fechado.`);
    return raiz;
}

const filhos = (no: NoXml | undefined, nome: string) => (no?.filhos || []).filter(f => f.nome.toUpperCase() === nome.toUpperCase());
const filho = (no: NoXml | undefined, nome: string) => filhos(no, nome)[0];
const texto = (no: NoXml | undefined, nome?: string) => (nome ? filho(no, nome) : no)?.texto.replace(/\s+/gu, ' ').trim() || '';
const juntar = (...partes: string[]) => partes.map(p => p.trim()).filter(Boolean).join(' ');
const unicos = (v: string[]) => [...new Set(v.map(x => x.trim()).filter(Boolean))];

const MESES: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
/** Datas da OFAC: «15 Feb 1962», «Feb 1962», «1962», «circa 1962», «1955 to 1958». */
export function dataOfac(valor: string): string[] {
    const v = valor.trim();
    const completa = v.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/u);
    if (completa && MESES[completa[2].toLowerCase()]) return [`${completa[3]}-${MESES[completa[2].toLowerCase()]}-${completa[1].padStart(2, '0')}`];
    const mes = v.match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/u);
    if (mes && MESES[mes[1].toLowerCase()]) return [`${mes[2]}-${MESES[mes[1].toLowerCase()]}`];
    return unicos(v.match(/\b(19|20)\d{2}\b/gu) || []);
}

function lerOnu(raiz: NoXml): ListaLida {
    const lista = filho(raiz, 'CONSOLIDATED_LIST')!;
    const entradas: EntradaLista[] = [];
    for (const ind of filhos(filho(lista, 'INDIVIDUALS'), 'INDIVIDUAL')) {
        const nome = juntar(texto(ind, 'FIRST_NAME'), texto(ind, 'SECOND_NAME'), texto(ind, 'THIRD_NAME'), texto(ind, 'FOURTH_NAME'));
        if (!nome) continue;
        const nascimentos = filhos(ind, 'INDIVIDUAL_DATE_OF_BIRTH').flatMap(d => {
            const data = texto(d, 'DATE').slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/u.test(data)) return [data];
            return [texto(d, 'YEAR'), texto(d, 'FROM_YEAR'), texto(d, 'TO_YEAR')].filter(y => /^\d{4}$/u.test(y));
        });
        entradas.push({
            fonte: 'ONU', ref: texto(ind, 'REFERENCE_NUMBER') || texto(ind, 'DATAID'), tipo: 'pessoa', nome,
            aliases: unicos(filhos(ind, 'INDIVIDUAL_ALIAS').map(a => texto(a, 'ALIAS_NAME'))),
            nascimentos: unicos(nascimentos),
            nacionalidades: unicos(filhos(filho(ind, 'NATIONALITY'), 'VALUE').map(v => texto(v))),
            programa: texto(ind, 'UN_LIST_TYPE') || null, notas: texto(ind, 'COMMENTS1').slice(0, 500) || null,
        });
    }
    for (const ent of filhos(filho(lista, 'ENTITIES'), 'ENTITY')) {
        const nome = juntar(texto(ent, 'FIRST_NAME'), texto(ent, 'SECOND_NAME'));
        if (!nome) continue;
        entradas.push({
            fonte: 'ONU', ref: texto(ent, 'REFERENCE_NUMBER') || texto(ent, 'DATAID'), tipo: 'entidade', nome,
            aliases: unicos(filhos(ent, 'ENTITY_ALIAS').map(a => texto(a, 'ALIAS_NAME'))), nascimentos: [], nacionalidades: [],
            programa: texto(ent, 'UN_LIST_TYPE') || null, notas: texto(ent, 'COMMENTS1').slice(0, 500) || null,
        });
    }
    const gerada = String(lista.attrs.dateGenerated || '').slice(0, 10);
    return { fonte: 'ONU', dataLista: /^\d{4}-\d{2}-\d{2}$/u.test(gerada) ? gerada : null, entradas, ignoradas: 0 };
}

function lerOfac(raiz: NoXml): ListaLida {
    const lista = filho(raiz, 'sdnList')!;
    const entradas: EntradaLista[] = [];
    let ignoradas = 0;
    for (const e of filhos(lista, 'sdnEntry')) {
        const tipoOfac = texto(e, 'sdnType').toLowerCase();
        if (tipoOfac !== 'individual' && tipoOfac !== 'entity') { ignoradas += 1; continue; }
        const nome = juntar(texto(e, 'firstName'), texto(e, 'lastName'));
        if (!nome) { ignoradas += 1; continue; }
        entradas.push({
            fonte: 'OFAC', ref: texto(e, 'uid'), tipo: tipoOfac === 'individual' ? 'pessoa' : 'entidade', nome,
            aliases: unicos(filhos(filho(e, 'akaList'), 'aka').map(a => juntar(texto(a, 'firstName'), texto(a, 'lastName')))),
            nascimentos: unicos(filhos(filho(e, 'dateOfBirthList'), 'dateOfBirthItem').flatMap(d => dataOfac(texto(d, 'dateOfBirth')))),
            nacionalidades: unicos([...filhos(filho(e, 'nationalityList'), 'nationality'), ...filhos(filho(e, 'citizenshipList'), 'citizenship')].map(n => texto(n, 'country'))),
            programa: unicos(filhos(filho(e, 'programList'), 'program').map(p => texto(p))).join(', ') || null,
            notas: texto(e, 'remarks').slice(0, 500) || null,
        });
    }
    const pub = texto(filho(lista, 'publshInformation'), 'Publish_Date').match(/^(\d{2})\/(\d{2})\/(\d{4})$/u);
    return { fonte: 'OFAC', dataLista: pub ? `${pub[3]}-${pub[1]}-${pub[2]}` : null, entradas, ignoradas };
}

/** Reconhece o formato (ONU ou OFAC) e lê as entradas. Lança erro se o ficheiro não for uma das listas suportadas. */
export function lerListaSancoes(xml: string): ListaLida {
    if (!/<(?:\w+:)?(CONSOLIDATED_LIST|sdnList)\b/u.test(xml)) {
        throw new Error('O ficheiro não é a Lista Consolidada da ONU nem a lista SDN/Consolidated da OFAC (XML).');
    }
    const raiz = lerXml(xml);
    const lida = filho(raiz, 'CONSOLIDATED_LIST') ? lerOnu(raiz) : lerOfac(raiz);
    if (!lida.entradas.length) throw new Error('A lista não tem entradas de pessoas ou entidades.');
    return lida;
}

/** Impressão digital do ficheiro (SHA-256 em hexadecimal) para registar a versão exacta da lista usada. */
export async function hashTexto(texto: string): Promise<string> {
    const bytes = new TextEncoder().encode(texto);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
