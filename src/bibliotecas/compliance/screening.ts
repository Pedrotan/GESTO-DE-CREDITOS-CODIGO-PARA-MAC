// Screening de PEP e sanções: compara os nomes do cliente (e, nas empresas, do representante legal e dos
// beneficiários efectivos) com as listas importadas e com a lista interna.
//
// Regras (especificação, secção 3.2 e endpoint 4):
// - semelhança de nomes dá no máximo «possível correspondência» (POTENTIAL_MATCH): só uma pessoa a confirma;
// - uma lista não importada é NOT_CHECKED e uma lista indisponível/ilegível é ERROR — nunca NO_MATCH;
// - cada resultado guarda a fonte, a versão/data da lista, a impressão digital do ficheiro e os critérios usados.
// O algoritmo é tolerante a acentos, maiúsculas, ordem dos nomes e nomes do meio omitidos (Jaro-Winkler por
// palavra), e a data de nascimento, quando existe nos dois lados, sobe ou desce a pontuação.

import type { EntradaLista, FonteLista, TipoEntrada } from './listas-xml.ts';

export type CategoriaInterna = 'pep' | 'sancao' | 'outro';
export type EntradaIndexada = EntradaLista & { categoria?: CategoriaInterna };
export type ResultadoFonte = 'NO_MATCH' | 'POTENTIAL_MATCH' | 'NOT_CHECKED' | 'ERROR';
export type PapelPessoa = 'cliente' | 'representante' | 'beneficiario';
export type PessoaPesquisa = { papel: PapelPessoa; nome: string; nascimento: string | null; tipo: TipoEntrada };
export type Candidato = {
    fonte: FonteLista; ref: string; tipo: TipoEntrada; nomeLista: string; nomeCorrespondente: string; pontuacao: number; motivos: string[];
    programa: string | null; nascimentos: string[]; nacionalidades: string[]; categoria: CategoriaInterna | null;
};
export type VersaoFonte = { id: string; dataLista: string | null; hash: string | null; total: number; importadaEm: string };
export type VerificacaoFonte = {
    fonte: FonteLista; resultado: ResultadoFonte; versao: VersaoFonte | null; candidatos: Candidato[]; nota: string | null;
};
export type ResultadoPessoa = { pessoa: PessoaPesquisa; fontes: VerificacaoFonte[] };

export const ALGORITMO_SCREENING = 'jaro-winkler-palavras-v1';
export const LIMIAR_PADRAO = 0.85;

export const ROTULO_RESULTADO: Record<ResultadoFonte | 'CONFIRMED_MATCH', string> = {
    NO_MATCH: 'Sem correspondência', POTENTIAL_MATCH: 'Possível correspondência', CONFIRMED_MATCH: 'Correspondência confirmada',
    NOT_CHECKED: 'Não verificado', ERROR: 'Erro na verificação',
};
export const ROTULO_FONTE_LISTA: Record<FonteLista, string> = { ONU: 'ONU (Conselho de Segurança)', OFAC: 'OFAC (EUA)', INTERNA: 'Lista interna' };
export const ROTULO_PAPEL: Record<PapelPessoa, string> = { cliente: 'Cliente', representante: 'Representante legal', beneficiario: 'Beneficiário efectivo' };

// ── Nomes ────────────────────────────────────────────────────────────────────────
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'd']);
/** Palavras do nome comparáveis: sem acentos, minúsculas, sem pontuação e sem «de/da/do/dos/das/e». */
export function palavrasNome(nome: string | null | undefined): string[] {
    return String(nome || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')
        .split(' ').filter(p => p && !PARTICULAS.has(p));
}

/** Semelhança de Jaro-Winkler entre duas palavras (0 a 1). */
export function jaroWinkler(a: string, b: string): number {
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;
    const janela = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
    const ma = new Array<boolean>(a.length).fill(false);
    const mb = new Array<boolean>(b.length).fill(false);
    let iguais = 0;
    for (let i = 0; i < a.length; i++) {
        for (let j = Math.max(0, i - janela); j < Math.min(b.length, i + janela + 1); j++) {
            if (mb[j] || a[i] !== b[j]) continue;
            ma[i] = mb[j] = true; iguais++; break;
        }
    }
    if (!iguais) return 0;
    let t = 0, k = 0;
    for (let i = 0; i < a.length; i++) {
        if (!ma[i]) continue;
        while (!mb[k]) k++;
        if (a[i] !== b[k]) t++;
        k++;
    }
    const jaro = (iguais / a.length + iguais / b.length + (iguais - t / 2) / iguais) / 3;
    let prefixo = 0;
    while (prefixo < 4 && prefixo < a.length && prefixo < b.length && a[prefixo] === b[prefixo]) prefixo++;
    return jaro + prefixo * 0.1 * (1 - jaro);
}

const semelhancaPalavra = (a: string, b: string) => (a.length <= 3 || b.length <= 3 ? (a === b ? 1 : 0) : jaroWinkler(a, b));

/**
 * Semelhança entre dois nomes (0 a 1), independente da ordem: cada palavra do nome mais curto procura a melhor
 * palavra livre do outro (média = 70%), e conta quantas palavras do nome mais longo ficaram cobertas (30%).
 */
export function semelhancaNomes(q: string[], c: string[]): number {
    if (!q.length || !c.length) return 0;
    if (q.join(' ') === c.join(' ')) return 1;
    const [curto, longo] = q.length <= c.length ? [q, c] : [c, q];
    const usadas = new Set<number>();
    let soma = 0, cobertas = 0;
    for (const p of curto) {
        let melhor = 0, idx = -1;
        longo.forEach((l, i) => { if (usadas.has(i)) return; const s = semelhancaPalavra(p, l); if (s > melhor) { melhor = s; idx = i; } });
        if (idx >= 0) usadas.add(idx);
        soma += melhor;
        if (melhor >= 0.88) cobertas++;
    }
    return 0.7 * (soma / curto.length) + 0.3 * (cobertas / longo.length);
}

// ── Índice ───────────────────────────────────────────────────────────────────────
export type IndiceLista = { entradas: EntradaIndexada[]; nomes: string[][][]; porPrefixo: Map<string, number[]> };
const prefixo = (p: string) => p.slice(0, 3);

/** Prepara a lista para pesquisa rápida (agrupa as entradas pelas 3 primeiras letras de cada palavra). */
export function indexarLista(entradas: EntradaIndexada[]): IndiceLista {
    const nomes = entradas.map(e => [e.nome, ...e.aliases].map(palavrasNome).filter(n => n.length));
    const porPrefixo = new Map<string, number[]>();
    nomes.forEach((lista, i) => {
        for (const chave of new Set(lista.flat().map(prefixo))) {
            const v = porPrefixo.get(chave);
            if (v) v.push(i); else porPrefixo.set(chave, [i]);
        }
    });
    return { entradas, nomes, porPrefixo };
}

const anoDe = (d: string) => d.slice(0, 4);

/** Candidatos de uma lista para uma pessoa (no máximo `max`, do mais semelhante para o menos). */
export function pesquisarNome(pessoa: PessoaPesquisa, indice: IndiceLista, limiar = LIMIAR_PADRAO, max = 5): Candidato[] {
    const q = palavrasNome(pessoa.nome);
    if (!q.length) return [];
    const toques = new Map<number, number>();
    for (const chave of new Set(q.map(prefixo))) for (const i of indice.porPrefixo.get(chave) || []) toques.set(i, (toques.get(i) || 0) + 1);
    const candidatos: Candidato[] = [];
    for (const [i, n] of toques) {
        const e = indice.entradas[i];
        if (e.tipo !== pessoa.tipo) continue;
        const maiorNome = Math.max(...indice.nomes[i].map(x => x.length));
        if (n < Math.min(2, q.length, maiorNome)) continue;
        let melhor = 0, qual = 0;
        indice.nomes[i].forEach((nome, k) => { const s = semelhancaNomes(q, nome); if (s > melhor) { melhor = s; qual = k; } });
        const motivos: string[] = [melhor === 1 ? 'Nome igual' : `Nome semelhante (${Math.round(melhor * 100)}%)`];
        if (qual > 0) motivos.push('Corresponde a um nome alternativo (alias) da lista');
        let pontuacao = melhor;
        const nasc = (pessoa.nascimento || '').slice(0, 10);
        if (/^\d{4}/u.test(nasc) && e.nascimentos.length) {
            if (e.nascimentos.some(d => d.length === 10 && d === nasc)) { pontuacao += 0.05; motivos.push('Data de nascimento igual'); }
            else if (e.nascimentos.some(d => anoDe(d) === anoDe(nasc))) { pontuacao += 0.03; motivos.push('Ano de nascimento coincide'); }
            else { pontuacao -= 0.12; motivos.push(`Data de nascimento diferente (lista: ${e.nascimentos.slice(0, 3).join(', ')})`); }
        }
        if (pontuacao < limiar) continue;
        candidatos.push({
            fonte: e.fonte, ref: e.ref, tipo: e.tipo, nomeLista: e.nome, nomeCorrespondente: qual === 0 ? e.nome : e.aliases[qual - 1] || e.nome,
            pontuacao: Math.min(100, Math.round(pontuacao * 100)), motivos, programa: e.programa, nascimentos: e.nascimentos,
            nacionalidades: e.nacionalidades, categoria: e.categoria ?? null,
        });
    }
    return candidatos.sort((a, b) => b.pontuacao - a.pontuacao).slice(0, max);
}

export type FonteDisponivel = { fonte: FonteLista; versao: VersaoFonte | null; indice: IndiceLista | null };

/** Executa o screening de várias pessoas contra todas as fontes. */
export function executarScreening(pessoas: PessoaPesquisa[], fontes: FonteDisponivel[], limiar = LIMIAR_PADRAO): ResultadoPessoa[] {
    return pessoas.map(pessoa => ({
        pessoa,
        fontes: fontes.map((f): VerificacaoFonte => {
            if (!f.versao) return { fonte: f.fonte, resultado: 'NOT_CHECKED', versao: null, candidatos: [], nota: f.fonte === 'INTERNA' ? 'A lista interna não tem entradas activas.' : 'Lista ainda não importada.' };
            if (!f.indice) return { fonte: f.fonte, resultado: 'ERROR', versao: f.versao, candidatos: [], nota: 'Lista não disponível neste dispositivo: importe o ficheiro aqui.' };
            const candidatos = pesquisarNome(pessoa, f.indice, limiar);
            return { fonte: f.fonte, resultado: candidatos.length ? 'POTENTIAL_MATCH' : 'NO_MATCH', versao: f.versao, candidatos, nota: null };
        }),
    }));
}

/** Pessoas a pesquisar: o cliente e, nas empresas, o representante legal e os beneficiários efectivos. */
export function pessoasDoCliente(c: { name?: string | null; birthDate?: string | null; legalRepresentative?: string | null }, empresa: boolean, beneficiarios?: string | null): PessoaPesquisa[] {
    const pessoas: PessoaPesquisa[] = [];
    if (String(c.name || '').trim()) pessoas.push({ papel: 'cliente', nome: String(c.name).trim(), nascimento: empresa ? null : (c.birthDate || null), tipo: empresa ? 'entidade' : 'pessoa' });
    if (empresa && String(c.legalRepresentative || '').trim()) pessoas.push({ papel: 'representante', nome: String(c.legalRepresentative).trim(), nascimento: null, tipo: 'pessoa' });
    if (empresa) {
        for (const parte of String(beneficiarios || '').split(/[;,\n]|\s+e\s+/u)) {
            const nome = parte.replace(/\(?\d+([.,]\d+)?\s*%\)?/gu, '').replace(/[()]/gu, '').trim();
            if (palavrasNome(nome).length >= 2 && !pessoas.some(p => p.nome === nome)) pessoas.push({ papel: 'beneficiario', nome, nascimento: null, tipo: 'pessoa' });
        }
    }
    return pessoas;
}

/** Resultado global de um screening: o pior de todos (erro > possível > não verificado > sem correspondência). */
export function resultadoGlobal(resultados: ResultadoPessoa[]): ResultadoFonte {
    const todos = resultados.flatMap(r => r.fontes.map(f => f.resultado));
    for (const r of ['ERROR', 'POTENTIAL_MATCH', 'NOT_CHECKED'] as ResultadoFonte[]) if (todos.includes(r)) return r;
    return todos.length ? 'NO_MATCH' : 'NOT_CHECKED';
}

// ── Estado do cliente ────────────────────────────────────────────────────────────
export type DecisaoCorrespondencia = { fonte: string; ref: string; nome_pesquisado: string; decisao: 'falso_positivo' | 'confirmada'; categoria: string | null };
export type EstadoScreening = 'sem_correspondencia' | 'possivel' | 'confirmada' | 'erro' | 'nao_verificado' | 'desactualizado';
export const ROTULO_ESTADO_SCREENING: Record<EstadoScreening, string> = {
    sem_correspondencia: 'Sem correspondências', possivel: 'Possível correspondência', confirmada: 'Sanção confirmada', erro: 'Erro no screening',
    nao_verificado: 'Screening por fazer', desactualizado: 'Screening desactualizado',
};
export type PendenteScreening = Candidato & { pessoa: PessoaPesquisa };

/** Chave de uma correspondência para não voltar a pedir a mesma decisão (mesma fonte, entrada e nome pesquisado). */
export const chaveCorrespondencia = (fonte: string, ref: string, nome: string) => `${fonte}:${ref}:${palavrasNome(nome).join(' ')}`;

/**
 * Estado do screening de um cliente: confirmações (de qualquer altura) mandam; depois correspondências por decidir
 * no último screening; depois erros; depois listas importadas ou alteradas depois do último screening.
 */
export function estadoScreening(input: {
    ultimo: { criadoEm: string; resultados: ResultadoPessoa[] } | null; decisoes: DecisaoCorrespondencia[]; versoesActivas: Array<{ fonte: FonteLista; id: string; importadaEm: string }>;
}) {
    const confirmadas = input.decisoes.filter(d => d.decisao === 'confirmada');
    const pepConfirmado = confirmadas.some(d => d.categoria === 'pep');
    const sancaoConfirmada = confirmadas.some(d => d.categoria !== 'pep' && d.categoria !== 'outro');
    const decididas = new Set(input.decisoes.map(d => chaveCorrespondencia(d.fonte, d.ref, d.nome_pesquisado)));
    const pendentes: PendenteScreening[] = (input.ultimo?.resultados || []).flatMap(r => r.fontes.flatMap(f => f.candidatos
        .filter(c => !decididas.has(chaveCorrespondencia(c.fonte, c.ref, r.pessoa.nome))).map(c => ({ ...c, pessoa: r.pessoa }))));
    let estado: EstadoScreening;
    if (sancaoConfirmada) estado = 'confirmada';
    else if (!input.ultimo) estado = 'nao_verificado';
    else if (pendentes.length) estado = 'possivel';
    else if (input.ultimo.resultados.some(r => r.fontes.some(f => f.resultado === 'ERROR'))) estado = 'erro';
    else {
        const usadas = new Map(input.ultimo.resultados.flatMap(r => r.fontes).filter(f => f.versao).map(f => [f.fonte, f.versao!.id]));
        const mudou = input.versoesActivas.some(v => usadas.get(v.fonte) !== v.id);
        estado = mudou ? 'desactualizado' : 'sem_correspondencia';
    }
    return { estado, pendentes, pepConfirmado, sancaoConfirmada };
}

// ── Versões activas (partilhado pelo renderer e pelo processo principal) ───────────
export type VersaoListaRegisto = { id: string; fonte: string; activa: number; importada_em: string; data_lista: string | null; hash: string; total_entradas: number };
export type EntradaInternaRegisto = { activa: number; criado_em: string; actualizado_em: string | null };

/** «Versão» da lista interna: muda sempre que se acrescenta, altera ou desactiva uma entrada. */
export function versaoInternaDe(interna: EntradaInternaRegisto[]): VersaoFonte | null {
    const activas = interna.filter(e => e.activa === 1);
    if (!activas.length) return null;
    const ultima = interna.reduce((m, e) => (String(e.actualizado_em || e.criado_em) > m ? String(e.actualizado_em || e.criado_em) : m), '');
    return { id: `interna:${ultima}:${activas.length}`, dataLista: ultima.slice(0, 10), hash: null, total: activas.length, importadaEm: ultima };
}

/** Versões activas de cada fonte (ONU, OFAC e lista interna). */
export function versoesActivasDe(versoes: VersaoListaRegisto[], interna: EntradaInternaRegisto[]): Array<{ fonte: FonteLista; id: string; importadaEm: string; versao: VersaoFonte }> {
    const r: Array<{ fonte: FonteLista; id: string; importadaEm: string; versao: VersaoFonte }> = [];
    for (const fonte of ['ONU', 'OFAC'] as const) {
        const v = versoes.find(x => x.fonte === fonte && x.activa === 1);
        if (v) r.push({ fonte, id: v.id, importadaEm: v.importada_em, versao: { id: v.id, dataLista: v.data_lista, hash: v.hash, total: v.total_entradas, importadaEm: v.importada_em } });
    }
    const vi = versaoInternaDe(interna);
    if (vi) r.push({ fonte: 'INTERNA', id: vi.id, importadaEm: vi.importadaEm, versao: vi });
    return r;
}
