// Agenda de contactos dos clientes: filtros, consultas, máscaras e permissões partilhados pelo processo principal
// (Electron, via IPC), pela versão web (fallback no navegador) e pelos testes. A mesma função de filtros serve a
// lista, os indicadores, a contagem e a exportação, para os números baterem sempre.

import { luandaParts, luandaToUtc } from '../fuso-angola.ts';

// ── Tipos ────────────────────────────────────────────────────────────────────────

export type TipoCliente = 'COMUM' | 'APOSENTADO' | 'ESTRANGEIRO';
export type PeriodoCadastro = 'qualquer' | 'hoje' | 'esta_semana' | 'este_mes' | 'mes_passado' | 'ultimos_3_meses' | 'este_ano' | 'ano_passado' | 'personalizado';
export type FiltroDados = '' | 'com_email' | 'sem_email' | 'sem_morada' | 'sem_telefone' | 'com_telefone' | 'incompletos';
export type Ordenacao = 'nome_asc' | 'nome_desc' | 'cadastro_desc' | 'cadastro_asc' | 'provincia';

export type FiltrosContactos = {
    q?: string;
    tipo?: TipoCliente | '';
    provincia?: string;
    municipio?: string;
    cadastradoPor?: string;
    periodo?: PeriodoCadastro;
    de?: string;
    ate?: string;
    dados?: FiltroDados;
    ordenar?: Ordenacao;
    /** Só estes clientes (selecção ou um cliente). */
    ids?: string[];
};

export type LinhaContacto = {
    id: string; nome: string; tipo: TipoCliente; nifMascarado: string; telefone: string; telefoneAlternativo: string;
    email: string; morada: string; provincia: string; municipio: string; cadastradoEm: string | null; cadastradoPor: string; cadastradoPorId: string;
};

export type ResumoContactos = {
    /** Todos os clientes, sem filtros (para «Todos os clientes» na exportação). */
    totalGeral: number;
    total: number; porTipo: Record<TipoCliente, number>; comTelefone: number; comEmail: number; semEmail: number; novosMes: number;
    /** Contagens dos segmentos com os filtros actuais, menos o do tipo. */
    segmentos: Record<'TODOS' | TipoCliente, number>;
    provincias: string[]; municipios: string[]; utilizadores: Array<{ id: string; nome: string }>;
};

export type CampoExportacao = 'nome' | 'tipo' | 'telefone' | 'email' | 'morada' | 'nif' | 'data_cadastro' | 'observacoes' | 'qr_whatsapp';
/** «texto» = copiar para a área de transferência (também passa pelas permissões e pela auditoria). */
export type FormatoExportacao = 'pdf' | 'xlsx' | 'csv' | 'vcf' | 'texto';
export type AmbitoExportacao = 'todos' | 'filtro' | 'seleccionados' | 'um';

export type PedidoExportacao = {
    ambito: AmbitoExportacao;
    /** Filtros da página (ambito «filtro»). */
    filtrosPagina?: FiltrosContactos;
    ids?: string[];
    clienteId?: string;
    /** Período e filtros adicionais da modal. */
    periodo?: PeriodoCadastro; de?: string; ate?: string;
    tipo?: TipoCliente | ''; provincia?: string; dados?: FiltroDados;
    campos: CampoExportacao[];
    formato: FormatoExportacao;
    ordenar?: Ordenacao;
};

export type LinhaExportacao = {
    id: string; nome: string; tipo: TipoCliente; telefone: string; email: string; morada: string; provincia: string; municipio: string;
    nif: string | null; cadastradoEm: string | null; observacoes: string | null;
};

// ── Rótulos ──────────────────────────────────────────────────────────────────────

export const ROTULO_TIPO: Record<TipoCliente, string> = { COMUM: 'Comum', APOSENTADO: 'Aposentado', ESTRANGEIRO: 'Estrangeiro' };
export const ROTULO_TIPO_PLURAL: Record<TipoCliente, string> = { COMUM: 'Comuns', APOSENTADO: 'Aposentados', ESTRANGEIRO: 'Estrangeiros' };
export const ROTULO_PERIODO: Record<PeriodoCadastro, string> = {
    qualquer: 'Qualquer data', hoje: 'Hoje', esta_semana: 'Esta semana', este_mes: 'Este mês', mes_passado: 'Mês passado',
    ultimos_3_meses: 'Últimos 3 meses', este_ano: 'Este ano', ano_passado: 'Ano passado', personalizado: 'Personalizado',
};
export const ROTULO_DADOS: Record<Exclude<FiltroDados, ''>, string> = {
    com_email: 'Com email', sem_email: 'Sem email', sem_morada: 'Sem morada', sem_telefone: 'Sem telefone', com_telefone: 'Com telefone', incompletos: 'Dados incompletos',
};
export const ROTULO_ORDENAR: Record<Ordenacao, string> = {
    nome_asc: 'Nome (A–Z)', nome_desc: 'Nome (Z–A)', cadastro_desc: 'Cadastro (recentes primeiro)', cadastro_asc: 'Cadastro (antigos primeiro)', provincia: 'Província',
};
export const ROTULO_CAMPO: Record<CampoExportacao, string> = {
    nome: 'Nome', tipo: 'Tipo de cliente', telefone: 'Telefone', email: 'Email', morada: 'Morada', nif: 'NIF / BI',
    data_cadastro: 'Data de cadastro', observacoes: 'Observações', qr_whatsapp: 'Código QR do WhatsApp',
};
export const CAMPOS_OMISSAO: CampoExportacao[] = ['nome', 'tipo', 'telefone', 'email', 'morada', 'data_cadastro'];
export const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const LIMITE_SEGUNDO_PLANO = 2000;

const TIPOS: TipoCliente[] = ['COMUM', 'APOSENTADO', 'ESTRANGEIRO'];
const PERIODOS = Object.keys(ROTULO_PERIODO) as PeriodoCadastro[];
const DADOS = Object.keys(ROTULO_DADOS) as Array<Exclude<FiltroDados, ''>>;
const ORDENS = Object.keys(ROTULO_ORDENAR) as Ordenacao[];
const DATA = /^\d{4}-\d{2}-\d{2}$/u;

/** Limpa filtros vindos da URL ou do IPC: só valores conhecidos passam. */
export function normalizarFiltros(f: Partial<FiltrosContactos> | null | undefined): FiltrosContactos {
    const x = f || {};
    const texto = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    return {
        q: texto(x.q, 200),
        tipo: TIPOS.includes(x.tipo as TipoCliente) ? x.tipo as TipoCliente : '',
        provincia: texto(x.provincia), municipio: texto(x.municipio), cadastradoPor: texto(x.cadastradoPor, 80),
        periodo: PERIODOS.includes(x.periodo as PeriodoCadastro) ? x.periodo : 'qualquer',
        de: DATA.test(String(x.de || '')) ? String(x.de) : '', ate: DATA.test(String(x.ate || '')) ? String(x.ate) : '',
        dados: DADOS.includes(x.dados as Exclude<FiltroDados, ''>) ? x.dados : '',
        ordenar: ORDENS.includes(x.ordenar as Ordenacao) ? x.ordenar : 'cadastro_desc',
        ids: Array.isArray(x.ids) ? x.ids.filter(id => typeof id === 'string' && id.length <= 80).slice(0, 10_000) : undefined,
    };
}

// ── Períodos (fuso de Angola; a semana começa à segunda-feira) ─────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const chave = (ano: number, mes: number, dia: number) => {
    const d = new Date(Date.UTC(ano, mes, dia));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** Intervalo [inicio, fim[ em ISO UTC; null = sem limite. Datas «personalizado» são dias de Luanda inclusivos. */
export function intervaloPeriodo(periodo: PeriodoCadastro | undefined, de?: string, ate?: string, agora: Date = new Date()): { inicio: string | null; fim: string | null } {
    const p = luandaParts(agora)!;
    const dia = (ano: number, mes: number, d: number) => luandaToUtc(chave(ano, mes, d)).toISOString();
    switch (periodo) {
        case 'hoje': return { inicio: dia(p.year, p.month, p.day), fim: dia(p.year, p.month, p.day + 1) };
        case 'esta_semana': {
            const recuo = (p.weekday + 6) % 7;
            return { inicio: dia(p.year, p.month, p.day - recuo), fim: dia(p.year, p.month, p.day - recuo + 7) };
        }
        case 'este_mes': return { inicio: dia(p.year, p.month, 1), fim: dia(p.year, p.month + 1, 1) };
        case 'mes_passado': return { inicio: dia(p.year, p.month - 1, 1), fim: dia(p.year, p.month, 1) };
        case 'ultimos_3_meses': return { inicio: dia(p.year, p.month - 2, 1), fim: dia(p.year, p.month + 1, 1) };
        case 'este_ano': return { inicio: dia(p.year, 0, 1), fim: dia(p.year + 1, 0, 1) };
        case 'ano_passado': return { inicio: dia(p.year - 1, 0, 1), fim: dia(p.year, 0, 1) };
        case 'personalizado': {
            const inicio = de && DATA.test(de) ? luandaToUtc(de).toISOString() : null;
            const fim = ate && DATA.test(ate) ? new Date(luandaToUtc(ate).getTime() + 86_400_000).toISOString() : null;
            return { inicio, fim };
        }
        default: return { inicio: null, fim: null };
    }
}

/** Valida o intervalo personalizado: De ≤ Até e Até não pode ser futuro. */
export function erroPeriodoPersonalizado(de: string, ate: string, agora: Date = new Date()): string | null {
    const hoje = (() => { const p = luandaParts(agora)!; return chave(p.year, p.month, p.day); })();
    if (de && !DATA.test(de)) return 'A data «De» é inválida.';
    if (ate && !DATA.test(ate)) return 'A data «Até» é inválida.';
    if (de && ate && de > ate) return 'A data «De» tem de ser anterior ou igual a «Até».';
    if (ate && ate > hoje) return 'A data «Até» não pode ser futura.';
    return null;
}

// ── Filtro SQL (único) ───────────────────────────────────────────────────────────

const ACENTOS: Array<[string, string]> = [
    ['á', 'a'], ['à', 'a'], ['â', 'a'], ['ã', 'a'], ['Á', 'a'], ['À', 'a'], ['Â', 'a'], ['Ã', 'a'],
    ['é', 'e'], ['ê', 'e'], ['É', 'e'], ['Ê', 'e'], ['í', 'i'], ['Í', 'i'],
    ['ó', 'o'], ['ô', 'o'], ['õ', 'o'], ['Ó', 'o'], ['Ô', 'o'], ['Õ', 'o'], ['ú', 'u'], ['ü', 'u'], ['Ú', 'u'], ['ç', 'c'], ['Ç', 'c'],
];
/** Expressão SQL sem acentos e em minúsculas (o lower() do SQLite só trata ASCII). */
export const sqlSemAcentos = (expr: string) => ACENTOS.reduce((acc, [de, para]) => `replace(${acc}, '${de}', '${para}')`, `lower(COALESCE(${expr}, ''))`);
export const textoSemAcentos = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase();
const sqlDigitos = (expr: string) => `replace(replace(replace(replace(replace(replace(COALESCE(${expr}, ''), ' ', ''), '+', ''), '-', ''), '.', ''), '(', ''), ')', '')`;

const TIPO_SQL = "COALESCE(NULLIF(c.clientCategory, ''), 'COMUM')";
const VAZIO = (col: string) => `TRIM(COALESCE(${col}, '')) = ''`;
const CHEIO = (col: string) => `TRIM(COALESCE(${col}, '')) <> ''`;

/** Cláusula WHERE e parâmetros para os filtros (base: clientes não eliminados). */
export function construirFiltro(entrada: FiltrosContactos, agora: Date = new Date()): { where: string; params: unknown[] } {
    const f = normalizarFiltros(entrada);
    const partes = ['c.deletedAt IS NULL'];
    const params: unknown[] = [];
    const q = (f.q || '').trim();
    if (q) {
        const termo = `%${textoSemAcentos(q).replace(/[%_]/gu, '')}%`;
        const ou = [`${sqlSemAcentos('c.name')} LIKE ?`, `${sqlSemAcentos('c.email')} LIKE ?`, `${sqlSemAcentos('c.address')} LIKE ?`, `${sqlSemAcentos('c.nif')} LIKE ?`];
        params.push(termo, termo, termo, termo);
        const digitos = q.replace(/\D/gu, '').replace(/^244(?=\d{9})/u, '');
        if (digitos.length >= 3) {
            ou.push(`${sqlDigitos('c.phone')} LIKE ?`, `${sqlDigitos('c.alternativePhone')} LIKE ?`);
            params.push(`%${digitos}%`, `%${digitos}%`);
        }
        partes.push(`(${ou.join(' OR ')})`);
    }
    if (f.tipo) { partes.push(`${TIPO_SQL} = ?`); params.push(f.tipo); }
    if (f.provincia) { partes.push("TRIM(COALESCE(c.province, '')) = ?"); params.push(f.provincia); }
    if (f.municipio) { partes.push("TRIM(COALESCE(c.municipality, '')) = ?"); params.push(f.municipio); }
    if (f.cadastradoPor) { partes.push('c.usuario_id = ?'); params.push(f.cadastradoPor); }
    const { inicio, fim } = intervaloPeriodo(f.periodo, f.de, f.ate, agora);
    if (inicio) { partes.push('julianday(c.createdAt) >= julianday(?)'); params.push(inicio); }
    if (fim) { partes.push('julianday(c.createdAt) < julianday(?)'); params.push(fim); }
    switch (f.dados) {
        case 'com_email': partes.push(CHEIO('c.email')); break;
        case 'sem_email': partes.push(VAZIO('c.email')); break;
        case 'sem_morada': partes.push(VAZIO('c.address')); break;
        case 'sem_telefone': partes.push(VAZIO('c.phone')); break;
        case 'com_telefone': partes.push(CHEIO('c.phone')); break;
        case 'incompletos': partes.push(`(${VAZIO('c.email')} OR ${VAZIO('c.address')} OR ${VAZIO('c.phone')})`); break;
        default: break;
    }
    if (f.ids) {
        if (!f.ids.length) partes.push('0');
        else { partes.push(`c.id IN (${f.ids.map(() => '?').join(', ')})`); params.push(...f.ids); }
    }
    return { where: partes.join(' AND '), params };
}

export function ordemSql(ordenar: Ordenacao | undefined): string {
    const nome = sqlSemAcentos('c.name');
    switch (ordenar) {
        case 'nome_asc': return `${nome} ASC`;
        case 'nome_desc': return `${nome} DESC`;
        case 'cadastro_asc': return `julianday(c.createdAt) IS NULL, julianday(c.createdAt) ASC, ${nome}`;
        case 'provincia': return `COALESCE(NULLIF(TRIM(c.province), ''), 'zzz') COLLATE NOCASE, ${nome}`;
        default: return `julianday(c.createdAt) IS NULL, julianday(c.createdAt) DESC, ${nome}`;
    }
}

// ── Formatação ──────────────────────────────────────────────────────────────────

/** NIF/BI mascarado: 4 primeiros + ••••• + 5 últimos (números curtos mostram menos). */
export function mascararNif(nif: string | null | undefined): string {
    const v = String(nif || '').trim();
    if (!v) return '';
    if (v.length >= 12) return `${v.slice(0, 4)}•••••${v.slice(-5)}`;
    if (v.length >= 6) return `${v.slice(0, 2)}•••••${v.slice(-2)}`;
    return '•••••';
}

/** Número local angolano de 9 algarismos (sem +244), ou null. */
export function telefoneLocal(telefone: string | null | undefined): string | null {
    let d = String(telefone || '').replace(/\D/gu, '');
    if (d.startsWith('00244')) d = d.slice(5);
    else if (d.length === 12 && d.startsWith('244')) d = d.slice(3);
    return d.length === 9 ? d : null;
}

export function formatarTelefone(telefone: string | null | undefined): string {
    const local = telefoneLocal(telefone);
    return local ? `+244 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : String(telefone || '').trim();
}

/** Número para wa.me (244 + 9 algarismos) só se parecer um telemóvel angolano (começa por 9). */
export function numeroWhatsApp(telefone: string | null | undefined): string | null {
    const local = telefoneLocal(telefone);
    return local && local.startsWith('9') ? `244${local}` : null;
}

export const ligacaoTelefone = (telefone: string | null | undefined) => {
    const local = telefoneLocal(telefone);
    return local ? `tel:+244${local}` : `tel:${String(telefone || '').replace(/[^\d+]/gu, '')}`;
};

export const ligacaoMapa = (morada: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(morada)}`;

export function dataCurta(iso: string | null | undefined): string {
    const p = iso ? luandaParts(iso) : null;
    return p ? `${pad(p.day)}/${pad(p.month + 1)}/${p.year}` : '';
}

export const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;

/** Cor fixa do avatar (6 cores sóbrias), pelo hash do id. */
export const CORES_AVATAR = ['#4F46E5', '#C01048', '#B54708', '#0E7090', '#087443', '#6941C6'];
export function corAvatar(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return CORES_AVATAR[h % CORES_AVATAR.length];
}
export function iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/u).filter(Boolean);
    if (!partes.length) return 'CL';
    return (partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Linha de texto de um contacto: «Nome — +244 9XX XXX XXX — email — morada». */
export function linhaTexto(c: { nome: string; telefone: string; email: string; morada: string }): string {
    return [c.nome, formatarTelefone(c.telefone), c.email, c.morada].filter(v => v && v.trim()).join(' — ');
}

// ── Consultas (o executor é a base do processo principal ou a do navegador) ─────

export type ExecutorSql = { all: (sql: string, params?: unknown[]) => Promise<any[]>; get: (sql: string, params?: unknown[]) => Promise<any> };

const COLUNAS = `c.id, c.name, ${TIPO_SQL} AS tipo, c.nif, c.phone, c.alternativePhone, c.email, c.address, c.province, c.municipality,
    c.createdAt, c.usuario_id, u.name AS criadoPor`;
const DE = 'FROM clients c LEFT JOIN users u ON u.id = c.usuario_id';

const datasValidas = (v: unknown) => {
    const s = typeof v === 'string' ? v : '';
    return s && !Number.isNaN(new Date(s).getTime()) ? s : null;
};

const paraLinha = (r: any): LinhaContacto => ({
    id: String(r.id), nome: String(r.name || ''), tipo: (TIPOS.includes(r.tipo) ? r.tipo : 'COMUM') as TipoCliente,
    nifMascarado: mascararNif(r.nif), telefone: String(r.phone || ''), telefoneAlternativo: String(r.alternativePhone || ''),
    email: String(r.email || '').trim(), morada: String(r.address || '').trim(), provincia: String(r.province || '').trim(),
    municipio: String(r.municipality || '').trim(), cadastradoEm: datasValidas(r.createdAt), cadastradoPor: String(r.criadoPor || ''),
    cadastradoPorId: String(r.usuario_id || ''),
});

export async function consultarLista(exec: ExecutorSql, filtros: FiltrosContactos, pagina = 1, porPagina = 25, agora = new Date()) {
    const tamanho = [25, 50, 100].includes(porPagina) ? porPagina : 25;
    const { where, params } = construirFiltro(filtros, agora);
    const total = Number((await exec.get(`SELECT COUNT(*) AS total ${DE} WHERE ${where}`, params))?.total || 0);
    const paginas = Math.max(1, Math.ceil(total / tamanho));
    const actual = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
    const linhas = await exec.all(`SELECT ${COLUNAS} ${DE} WHERE ${where} ORDER BY ${ordemSql(normalizarFiltros(filtros).ordenar)} LIMIT ? OFFSET ?`,
        [...params, tamanho, (actual - 1) * tamanho]);
    return { linhas: linhas.map(paraLinha), total, pagina: actual, porPagina: tamanho };
}

export async function contar(exec: ExecutorSql, filtros: FiltrosContactos, agora = new Date()) {
    const { where, params } = construirFiltro(filtros, agora);
    return Number((await exec.get(`SELECT COUNT(*) AS total ${DE} WHERE ${where}`, params))?.total || 0);
}

/** Ids dos clientes de um filtro (para «Seleccionar os N resultados»). */
export async function idsDoFiltro(exec: ExecutorSql, filtros: FiltrosContactos, agora = new Date()) {
    const { where, params } = construirFiltro(filtros, agora);
    return (await exec.all(`SELECT c.id ${DE} WHERE ${where} ORDER BY ${ordemSql(normalizarFiltros(filtros).ordenar)}`, params)).map(r => String(r.id));
}

export async function consultarResumo(exec: ExecutorSql, filtros: FiltrosContactos, agora = new Date()): Promise<ResumoContactos> {
    const f = normalizarFiltros(filtros);
    // Indicadores: só tipo e província; segmentos: todos os filtros menos o tipo.
    const base = construirFiltro({ tipo: f.tipo, provincia: f.provincia }, agora);
    const mes = intervaloPeriodo('este_mes', undefined, undefined, agora);
    const ind = await exec.get(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN ${CHEIO('c.phone')} THEN 1 ELSE 0 END) AS comTelefone,
        SUM(CASE WHEN ${CHEIO('c.email')} THEN 1 ELSE 0 END) AS comEmail,
        SUM(CASE WHEN julianday(c.createdAt) >= julianday(?) AND julianday(c.createdAt) < julianday(?) THEN 1 ELSE 0 END) AS novosMes,
        SUM(CASE WHEN ${TIPO_SQL} = 'COMUM' THEN 1 ELSE 0 END) AS comum,
        SUM(CASE WHEN ${TIPO_SQL} = 'APOSENTADO' THEN 1 ELSE 0 END) AS aposentado,
        SUM(CASE WHEN ${TIPO_SQL} = 'ESTRANGEIRO' THEN 1 ELSE 0 END) AS estrangeiro
        ${DE} WHERE ${base.where}`, [mes.inicio, mes.fim, ...base.params]);
    const seg = construirFiltro({ ...f, tipo: '', ids: undefined }, agora);
    const s = await exec.get(`SELECT COUNT(*) AS todos,
        SUM(CASE WHEN ${TIPO_SQL} = 'COMUM' THEN 1 ELSE 0 END) AS comum,
        SUM(CASE WHEN ${TIPO_SQL} = 'APOSENTADO' THEN 1 ELSE 0 END) AS aposentado,
        SUM(CASE WHEN ${TIPO_SQL} = 'ESTRANGEIRO' THEN 1 ELSE 0 END) AS estrangeiro
        ${DE} WHERE ${seg.where}`, seg.params);
    const geral = await exec.get('SELECT COUNT(*) AS total FROM clients WHERE deletedAt IS NULL');
    const provincias = await exec.all("SELECT DISTINCT TRIM(province) AS v FROM clients WHERE deletedAt IS NULL AND TRIM(COALESCE(province, '')) <> '' ORDER BY v COLLATE NOCASE");
    const municipios = await exec.all(`SELECT DISTINCT TRIM(municipality) AS v FROM clients WHERE deletedAt IS NULL AND TRIM(COALESCE(municipality, '')) <> ''
        ${f.provincia ? 'AND TRIM(province) = ?' : ''} ORDER BY v COLLATE NOCASE`, f.provincia ? [f.provincia] : []);
    const utilizadores = await exec.all('SELECT DISTINCT u.id, u.name FROM clients c JOIN users u ON u.id = c.usuario_id WHERE c.deletedAt IS NULL ORDER BY u.name COLLATE NOCASE');
    const n = (v: unknown) => Number(v || 0);
    const total = n(ind?.total);
    return {
        totalGeral: n(geral?.total), total, porTipo: { COMUM: n(ind?.comum), APOSENTADO: n(ind?.aposentado), ESTRANGEIRO: n(ind?.estrangeiro) },
        comTelefone: n(ind?.comTelefone), comEmail: n(ind?.comEmail), semEmail: total - n(ind?.comEmail), novosMes: n(ind?.novosMes),
        segmentos: { TODOS: n(s?.todos), COMUM: n(s?.comum), APOSENTADO: n(s?.aposentado), ESTRANGEIRO: n(s?.estrangeiro) },
        provincias: provincias.map(r => String(r.v)), municipios: municipios.map(r => String(r.v)),
        utilizadores: utilizadores.map(r => ({ id: String(r.id), nome: String(r.name || '') })),
    };
}

export async function consultarFicha(exec: ExecutorSql, id: string) {
    const r = await exec.get(`SELECT ${COLUNAS}, c.notes ${DE} WHERE c.deletedAt IS NULL AND c.id = ?`, [id]);
    return r ? { ...paraLinha(r), observacoes: String(r.notes || '') } : null;
}

export async function revelarNif(exec: ExecutorSql, id: string): Promise<{ nome: string; nif: string } | null> {
    const r = await exec.get('SELECT name, nif FROM clients WHERE deletedAt IS NULL AND id = ?', [id]);
    return r ? { nome: String(r.name || ''), nif: String(r.nif || '') } : null;
}

/** Filtros finais de um pedido de exportação (a contagem e o ficheiro usam exactamente estes). */
export function filtrosDaExportacao(p: PedidoExportacao): FiltrosContactos {
    if (p.ambito === 'um') return { ids: p.clienteId ? [p.clienteId] : [], ordenar: p.ordenar };
    const base: FiltrosContactos = p.ambito === 'filtro' ? { ...normalizarFiltros(p.filtrosPagina) } : {};
    if (p.ambito === 'seleccionados') base.ids = Array.isArray(p.ids) ? p.ids : [];
    else delete base.ids;
    if (p.periodo) { base.periodo = p.periodo; base.de = p.de; base.ate = p.ate; }
    if (p.tipo !== undefined && (p.tipo || p.ambito !== 'filtro')) base.tipo = p.tipo;
    if (p.provincia !== undefined && (p.provincia || p.ambito !== 'filtro')) base.provincia = p.provincia;
    if (p.dados !== undefined && (p.dados || p.ambito !== 'filtro')) base.dados = p.dados;
    base.ordenar = p.ordenar || base.ordenar || 'nome_asc';
    return base;
}

export async function linhasExportacao(exec: ExecutorSql, pedido: PedidoExportacao, incluirNif: boolean, agora = new Date()): Promise<LinhaExportacao[]> {
    const filtros = filtrosDaExportacao(pedido);
    const { where, params } = construirFiltro(filtros, agora);
    const rows = await exec.all(`SELECT ${COLUNAS}, c.notes ${DE} WHERE ${where} ORDER BY ${ordemSql(normalizarFiltros(filtros).ordenar)}`, params);
    return rows.map(r => ({
        id: String(r.id), nome: String(r.name || ''), tipo: (TIPOS.includes(r.tipo) ? r.tipo : 'COMUM') as TipoCliente,
        telefone: String(r.phone || ''), email: String(r.email || '').trim(), morada: String(r.address || '').trim(),
        provincia: String(r.province || '').trim(), municipio: String(r.municipality || '').trim(),
        nif: incluirNif ? String(r.nif || '') : null, cadastradoEm: datasValidas(r.createdAt),
        observacoes: pedido.campos.includes('observacoes') ? String(r.notes || '') : null,
    }));
}

/** Resumo legível dos filtros (chips do PDF, folha «Info» do Excel e auditoria). */
export function descreverFiltros(f: FiltrosContactos): string[] {
    const n = normalizarFiltros(f);
    const out: string[] = [];
    out.push(`Tipo: ${n.tipo ? ROTULO_TIPO[n.tipo].toLowerCase() : 'todos'}`);
    out.push(`Cadastro: ${n.periodo === 'personalizado' ? `${n.de ? dataCurta(luandaToUtc(n.de).toISOString()) : '…'} a ${n.ate ? dataCurta(luandaToUtc(n.ate).toISOString()) : '…'}` : ROTULO_PERIODO[n.periodo || 'qualquer'].toLowerCase()}`);
    if (n.provincia) out.push(`Província: ${n.provincia}`);
    if (n.municipio) out.push(`Município: ${n.municipio}`);
    if (n.dados) out.push(ROTULO_DADOS[n.dados]);
    if (n.q) out.push(`Pesquisa: «${n.q}»`);
    if (n.ids) out.push(n.ids.length === 1 ? 'Um cliente' : `${n.ids.length} seleccionados`);
    return out;
}

// ── Permissões (verificadas no processo principal e repetidas na interface) ───

export type AccaoAgenda = 'ver' | 'editar' | 'exportar_um' | 'revelar_nif' | 'exportar_lista' | 'exportar_nif';

export const PERMISSOES_AGENDA = {
    revelar_nif: 'clients_reveal_id',
    exportar_lista: 'clients_export_lists',
    exportar_nif: 'clients_export_id',
} as const;

/** Perfis que têm cada acção por omissão (além do Super Administrador e da conta principal). */
const POR_PERFIL: Record<string, AccaoAgenda[]> = {
    admin: ['revelar_nif', 'exportar_lista', 'exportar_nif'],
    system_admin: ['revelar_nif', 'exportar_lista', 'exportar_nif'],
    credit_director: ['revelar_nif', 'exportar_lista'],
    manager: ['revelar_nif', 'exportar_lista'],
};

type UtilizadorAgenda = { role?: unknown; isOwner?: unknown; permissions?: unknown } | null | undefined;

const listaPermissoes = (p: unknown): string[] => {
    if (Array.isArray(p)) return p.map(String);
    if (typeof p === 'string') { try { const v = JSON.parse(p); return Array.isArray(v) ? v.map(String) : []; } catch { return p.split(',').map(s => s.trim()); } }
    return [];
};

export function podeAgenda(u: UtilizadorAgenda, accao: AccaoAgenda): boolean {
    if (!u) return false;
    const total = String(u.role) === 'super_admin' || u.isOwner === true || u.isOwner === 1 || u.isOwner === '1';
    if (total) return true;
    const perms = listaPermissoes(u.permissions);
    if (accao === 'ver' || accao === 'editar' || accao === 'exportar_um') return perms.includes('manage_clients') || (POR_PERFIL[String(u.role)] || []).length > 0;
    return perms.includes(PERMISSOES_AGENDA[accao]) || (POR_PERFIL[String(u.role)] || []).includes(accao);
}

/** Recusa (mensagem) de um pedido de exportação, ou null se o utilizador o pode fazer. */
export function recusaExportacao(u: UtilizadorAgenda, pedido: PedidoExportacao): string | null {
    if (!podeAgenda(u, 'exportar_um')) return 'Sem permissão para exportar contactos de clientes.';
    if (pedido.ambito !== 'um' && !podeAgenda(u, 'exportar_lista')) return 'Sem permissão para exportar listas de contactos (só um cliente de cada vez).';
    if (pedido.campos.includes('nif') && !podeAgenda(u, 'exportar_nif')) return 'Sem permissão para incluir o NIF/BI nas exportações.';
    if (!['pdf', 'xlsx', 'csv', 'vcf', 'texto'].includes(pedido.formato)) return 'Formato de exportação desconhecido.';
    return null;
}

/** SQL de auditoria (o mesmo do RepositorioAuditoria, para a sincronização o reconhecer). */
export const SQL_AUDITORIA = 'INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
