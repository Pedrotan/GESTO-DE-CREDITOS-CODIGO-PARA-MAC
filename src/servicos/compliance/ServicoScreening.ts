// Screening de PEP e sanções (fase 2): importação das listas oficiais (ONU, OFAC), lista interna da empresa,
// execução do screening por cliente ou em lote, e decisão humana sobre cada possível correspondência.
// As entradas das listas ficam só neste dispositivo (compliance_lista_bloco); a versão activa, os resultados e as
// decisões sincronizam. Uma lista que existe noutro computador mas não neste dá ERROR, nunca «sem correspondência».
import { db } from '@/bibliotecas/bd';
import { lerListaSancoes, hashTexto, type EntradaLista, type FonteLista } from '@/bibliotecas/compliance/listas-xml';
import {
    ALGORITMO_SCREENING, LIMIAR_PADRAO, ROTULO_FONTE_LISTA, ROTULO_RESULTADO, chaveCorrespondencia, estadoScreening, executarScreening, indexarLista,
    palavrasNome, pessoasDoCliente, resultadoGlobal,
    type CategoriaInterna, type Candidato, type DecisaoCorrespondencia, type FonteDisponivel, type IndiceLista, type PessoaPesquisa, type ResultadoFonte,
    type ResultadoPessoa, type VersaoFonte,
} from '@/bibliotecas/compliance/screening';
import { ehEmpresa, type ClienteKyc } from '@/bibliotecas/compliance/kyc';
import {
    SQL_INTERNA_ALTERAR, SQL_INTERNA_CRIAR, SQL_LISTA_BLOCO_GRAVAR, SQL_LISTA_BLOCO_LIMPAR, SQL_LISTA_VERSAO_CRIAR, SQL_LISTA_VERSAO_DESACTIVAR,
    SQL_SCREENING_DECIDIR, SQL_SCREENING_REGISTAR,
} from '@/bibliotecas/compliance/permissoes-compliance';
import { podeCompliance, type ActorCompliance } from './ServicoCompliance';

type Statement = { sql: string; params?: unknown[]; expectChanges?: number };

export type VersaoLista = {
    id: string; fonte: 'ONU' | 'OFAC'; data_lista: string | null; hash: string; total_entradas: number; ignoradas: number; nome_ficheiro: string | null;
    activa: number; importada_em: string; importada_por: string | null; importada_por_nome: string | null;
};
export type EntradaInterna = {
    id: string; categoria: CategoriaInterna; tipo: 'pessoa' | 'entidade'; nome: string; aliases: string | null; nascimento: string | null; nacionalidade: string | null;
    funcao: string | null; fonte_referencia: string | null; notas: string | null; activa: number; criado_em: string; criado_por_nome: string | null;
    actualizado_em: string | null; actualizado_por_nome: string | null;
};
export type MotivoScreening = 'manual' | 'novo_cliente' | 'pedido_credito' | 'periodico' | 'lista_actualizada';
export type ScreeningRegisto = {
    id: string; client_id: string; motivo: MotivoScreening; resultado: ResultadoFonte; resultados: string; criterios: string;
    criado_em: string; criado_por: string | null; criado_por_nome: string | null;
};
export type DecisaoScreening = DecisaoCorrespondencia & {
    id: string; screening_id: string; client_id: string; nome_lista: string; fundamento: string; decidido_em: string; decidido_por: string | null; decidido_por_nome: string | null;
};
export type DadosScreening = {
    versoes: VersaoLista[]; interna: EntradaInterna[]; screenings: ScreeningRegisto[]; decisoes: DecisaoScreening[];
    /** Entradas guardadas neste dispositivo por versão (para saber se a lista está disponível aqui). */
    blocos: Record<string, number>;
};
export const DADOS_SCREENING_VAZIOS: DadosScreening = { versoes: [], interna: [], screenings: [], decisoes: [], blocos: {} };

export const ROTULO_MOTIVO_SCREENING: Record<MotivoScreening, string> = {
    manual: 'Pedido manual', novo_cliente: 'Novo cliente', pedido_credito: 'Pedido de crédito', periodico: 'Revisão periódica', lista_actualizada: 'Lista actualizada',
};
export const ROTULO_CATEGORIA: Record<CategoriaInterna, string> = { pep: 'PEP (pessoa politicamente exposta)', sancao: 'Sanção / designação nacional', outro: 'Outro (vigilância interna)' };

const BLOCO = 1000;
const SQL_AUDITORIA = `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, ?, 'compliance', ?, ?, ?, ?)`;
const auditoria = (actor: ActorCompliance, action: string, details: string, metadata: Record<string, unknown>, when = new Date().toISOString()): Statement => ({
    sql: SQL_AUDITORIA, params: [crypto.randomUUID(), when, actor.id, actor.name, action, details, null, null, JSON.stringify(metadata)],
});
const lista = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
const texto = (v: unknown) => { const t = String(v ?? '').trim(); return t ? t : null; };
const exigir = (actor: ActorCompliance, permissao: Parameters<typeof podeCompliance>[1], accao: string) => {
    if (!podeCompliance(actor, permissao)) throw new Error(`Sem permissão para ${accao}.`);
};
export const lerResultados = (s: ScreeningRegisto): ResultadoPessoa[] => { try { return JSON.parse(s.resultados) as ResultadoPessoa[]; } catch { return []; } };

// Índices em memória por versão (a lista OFAC demora a ler; só se lê uma vez por sessão).
const indices = new Map<string, IndiceLista>();

/** «Versão» da lista interna: muda sempre que se acrescenta, altera ou desactiva uma entrada. */
export function versaoInterna(interna: EntradaInterna[]): VersaoFonte | null {
    const activas = interna.filter(e => e.activa === 1);
    if (!activas.length) return null;
    const ultima = interna.reduce((m, e) => (String(e.actualizado_em || e.criado_em) > m ? String(e.actualizado_em || e.criado_em) : m), '');
    return { id: `interna:${ultima}:${activas.length}`, dataLista: ultima.slice(0, 10), hash: null, total: activas.length, importadaEm: ultima };
}

/** Versões activas de cada fonte (para saber se o screening de um cliente ficou desactualizado). */
export function versoesActivas(d: DadosScreening): Array<{ fonte: FonteLista; id: string; importadaEm: string; versao: VersaoFonte }> {
    const r: Array<{ fonte: FonteLista; id: string; importadaEm: string; versao: VersaoFonte }> = [];
    for (const fonte of ['ONU', 'OFAC'] as const) {
        const v = d.versoes.find(x => x.fonte === fonte && x.activa === 1);
        if (v) r.push({ fonte, id: v.id, importadaEm: v.importada_em, versao: { id: v.id, dataLista: v.data_lista, hash: v.hash, total: v.total_entradas, importadaEm: v.importada_em } });
    }
    const vi = versaoInterna(d.interna);
    if (vi) r.push({ fonte: 'INTERNA', id: vi.id, importadaEm: vi.importadaEm, versao: vi });
    return r;
}

/** Estado do screening de cada cliente (último screening, decisões e versões activas). */
export function estadosPorCliente(d: DadosScreening) {
    const activas = versoesActivas(d);
    const ultimo = new Map<string, ScreeningRegisto>();
    for (const s of d.screenings) { const u = ultimo.get(s.client_id); if (!u || s.criado_em > u.criado_em) ultimo.set(s.client_id, s); }
    const decisoesPor = new Map<string, DecisaoScreening[]>();
    for (const x of d.decisoes) decisoesPor.set(x.client_id, [...(decisoesPor.get(x.client_id) || []), x]);
    return (clienteId: string) => {
        const u = ultimo.get(clienteId) || null;
        return {
            ultimo: u,
            ...estadoScreening({ ultimo: u ? { criadoEm: u.criado_em, resultados: lerResultados(u) } : null, decisoes: decisoesPor.get(clienteId) || [], versoesActivas: activas }),
        };
    };
}

export class ServicoScreening {
    static async carregar(): Promise<DadosScreening> {
        const [versoes, interna, screenings, decisoes, blocos] = await Promise.all([
            lista(db.query<VersaoLista>('SELECT * FROM compliance_lista_versao ORDER BY importada_em DESC')),
            lista(db.query<EntradaInterna>('SELECT * FROM compliance_lista_interna ORDER BY activa DESC, nome')),
            lista(db.query<ScreeningRegisto>('SELECT * FROM compliance_screening ORDER BY criado_em DESC')),
            lista(db.query<DecisaoScreening>('SELECT * FROM compliance_screening_decisao ORDER BY decidido_em DESC')),
            lista(db.query<{ versao_id: string; n: number; total: number }>('SELECT versao_id, COUNT(*) AS n, MAX(total) AS total FROM compliance_lista_bloco GROUP BY versao_id')),
        ]);
        // Entradas disponíveis = total da versão quando todos os blocos estão cá (cada bloco tem até 1000 entradas).
        const disponiveis = blocos.map(b => [b.versao_id, Number(b.n) >= Math.ceil(Number(b.total) / BLOCO) ? Number(b.total) : 0] as const);
        return { versoes, interna, screenings, decisoes, blocos: Object.fromEntries(disponiveis) };
    }

    /** A versão está completa neste dispositivo? */
    static disponivelAqui(d: DadosScreening, v: VersaoLista) {
        return (d.blocos[v.id] || 0) >= v.total_entradas;
    }

    /**
     * Fontes prontas para pesquisar (lê os blocos da base deste dispositivo, uma vez por versão). A lista da ONU entra
     * sempre (é a de aplicação obrigatória: sem ela o resultado é «não verificado»); a OFAC e a lista interna só
     * entram quando a empresa as usa (versão activa ou entradas activas).
     */
    static async fontes(d: DadosScreening): Promise<FonteDisponivel[]> {
        const fontes: FonteDisponivel[] = [];
        for (const fonte of ['ONU', 'OFAC'] as const) {
            const v = d.versoes.find(x => x.fonte === fonte && x.activa === 1);
            if (!v) { if (fonte === 'ONU') fontes.push({ fonte, versao: null, indice: null }); continue; }
            const versao: VersaoFonte = { id: v.id, dataLista: v.data_lista, hash: v.hash, total: v.total_entradas, importadaEm: v.importada_em };
            let indice = indices.get(v.id) || null;
            if (!indice && this.disponivelAqui(d, v)) {
                const blocos = await lista(db.query<{ conteudo: string }>('SELECT conteudo FROM compliance_lista_bloco WHERE versao_id = ? ORDER BY ordem', [v.id]));
                const entradas = blocos.flatMap(b => { try { return JSON.parse(b.conteudo) as EntradaLista[]; } catch { return []; } });
                if (entradas.length >= v.total_entradas) { indice = indexarLista(entradas); indices.set(v.id, indice); }
            }
            fontes.push({ fonte, versao, indice });
        }
        const vi = versaoInterna(d.interna);
        const activas = d.interna.filter(e => e.activa === 1);
        if (vi) fontes.push({
            fonte: 'INTERNA', versao: vi,
            indice: indexarLista(activas.map(e => ({
                fonte: 'INTERNA', ref: e.id, tipo: e.tipo, nome: e.nome, aliases: (e.aliases || '').split(/[;\n]/u).map(a => a.trim()).filter(Boolean),
                nascimentos: e.nascimento ? [e.nascimento] : [], nacionalidades: e.nacionalidade ? [e.nacionalidade] : [],
                programa: e.categoria === 'pep' ? (e.funcao || 'PEP') : e.fonte_referencia, notas: e.notas, categoria: e.categoria,
            }))),
        });
        return fontes;
    }

    // ── Listas oficiais ───────────────────────────────────────────────────────────
    /**
     * Importa o ficheiro XML de uma lista oficial. Se for o mesmo ficheiro da versão activa (mesma impressão digital),
     * só guarda as entradas neste dispositivo; senão cria e activa uma versão nova.
     */
    static async importarLista(conteudo: string, nomeFicheiro: string, d: DadosScreening, actor: ActorCompliance) {
        exigir(actor, 'compliance_manage', 'carregar listas de sanções');
        const lida = lerListaSancoes(conteudo);
        const hash = await hashTexto(conteudo);
        const activa = d.versoes.find(v => v.fonte === lida.fonte && v.activa === 1);
        const mesma = activa && activa.hash === hash ? activa : null;
        if (!mesma) exigir(actor, 'compliance_settings', 'activar uma versão nova de uma lista de sanções');
        const id = mesma?.id || crypto.randomUUID();
        const blocos: Statement[] = [];
        for (let i = 0; i * BLOCO < lida.entradas.length; i++) {
            blocos.push({ sql: SQL_LISTA_BLOCO_GRAVAR, params: [`${id}:${i}`, id, lida.fonte, i, lida.entradas.length, JSON.stringify(lida.entradas.slice(i * BLOCO, (i + 1) * BLOCO))] });
        }
        await db.transactionLocal(blocos);
        if (!mesma) {
            const when = new Date().toISOString();
            await db.transaction([
                { sql: SQL_LISTA_VERSAO_CRIAR, params: [id, lida.fonte, lida.dataLista, hash, lida.entradas.length, lida.ignoradas, nomeFicheiro.slice(0, 200), when, actor.id, actor.name], expectChanges: 1 },
                { sql: SQL_LISTA_VERSAO_DESACTIVAR, params: [lida.fonte, id] },
                auditoria(actor, 'update', `Importou a lista ${ROTULO_FONTE_LISTA[lida.fonte]} de ${lida.dataLista || 'data desconhecida'} (${lida.entradas.length} entradas)`,
                    { versaoId: id, fonte: lida.fonte, hash, ficheiro: nomeFicheiro }, when),
            ]);
        }
        await db.transactionLocal([{ sql: SQL_LISTA_BLOCO_LIMPAR, params: [lida.fonte, id] }]);
        return { fonte: lida.fonte, total: lida.entradas.length, dataLista: lida.dataLista, nova: !mesma };
    }

    // ── Lista interna ─────────────────────────────────────────────────────────────
    static async guardarInterna(e: Partial<EntradaInterna>, actor: ActorCompliance) {
        exigir(actor, 'compliance_manage', 'alterar a lista interna');
        const nome = texto(e.nome);
        if (!nome || palavrasNome(nome).length < 1) throw new Error('Indique o nome.');
        const categoria = (['pep', 'sancao', 'outro'] as const).includes(e.categoria as CategoriaInterna) ? e.categoria! : 'pep';
        const tipo = e.tipo === 'entidade' ? 'entidade' : 'pessoa';
        const fonteRef = texto(e.fonte_referencia);
        if (!fonteRef) throw new Error('Indique a fonte (ex.: publicação no Diário da República, deliberação, comunicação oficial).');
        if (categoria === 'pep' && !texto(e.funcao)) throw new Error('Indique a função pública da pessoa politicamente exposta.');
        const nascimento = texto(e.nascimento);
        if (nascimento && !/^\d{4}(-\d{2}-\d{2})?$/u.test(nascimento)) throw new Error('A data de nascimento tem de ser aaaa-mm-dd ou só o ano.');
        const valores = [categoria, tipo, nome, texto(e.aliases), nascimento, texto(e.nacionalidade), texto(e.funcao), fonteRef, texto(e.notas)];
        const when = new Date().toISOString();
        if (e.id) {
            await db.transaction([
                { sql: SQL_INTERNA_ALTERAR, params: [...valores, e.activa === 0 ? 0 : 1, actor.id, actor.name, when, e.id], expectChanges: 1 },
                auditoria(actor, 'update', `${e.activa === 0 ? 'Desactivou' : 'Alterou'} a entrada «${nome}» da lista interna`, { entradaId: e.id, categoria }, when),
            ]);
            return e.id;
        }
        const id = crypto.randomUUID();
        await db.transaction([
            { sql: SQL_INTERNA_CRIAR, params: [id, ...valores, when, actor.id, actor.name], expectChanges: 1 },
            auditoria(actor, 'create', `Acrescentou «${nome}» à lista interna (${ROTULO_CATEGORIA[categoria]})`, { entradaId: id, categoria }, when),
        ]);
        return id;
    }

    // ── Execução ──────────────────────────────────────────────────────────────────
    private static registo(cliente: ClienteKyc, beneficiarios: string | null | undefined, fontes: FonteDisponivel[], motivo: MotivoScreening, actor: ActorCompliance, when: string) {
        const pessoas: PessoaPesquisa[] = pessoasDoCliente(cliente, ehEmpresa(cliente), beneficiarios);
        const resultados = executarScreening(pessoas, fontes);
        const global = resultadoGlobal(resultados);
        const id = crypto.randomUUID();
        const statement: Statement = {
            sql: SQL_SCREENING_REGISTAR,
            params: [id, cliente.id, motivo, global, JSON.stringify(resultados), JSON.stringify({ algoritmo: ALGORITMO_SCREENING, limiar: LIMIAR_PADRAO, pessoas: pessoas.length }), when, actor.id, actor.name],
            expectChanges: 1,
        };
        return { id, global, resultados, statement };
    }

    static async executar(cliente: ClienteKyc, beneficiarios: string | null | undefined, d: DadosScreening, motivo: MotivoScreening, actor: ActorCompliance) {
        exigir(actor, 'compliance_manage', 'executar o screening');
        const fontes = await this.fontes(d);
        const when = new Date().toISOString();
        const r = this.registo(cliente, beneficiarios, fontes, motivo, actor, when);
        await db.transaction([r.statement, auditoria(actor, 'create', `Screening de PEP e sanções de ${cliente.name || cliente.id}: ${ROTULO_RESULTADO[r.global]}`,
            { clientId: cliente.id, screeningId: r.id, motivo, resultado: r.global }, when)]);
        return r;
    }

    /** Screening de vários clientes, em lotes de 200 (cada lote numa transacção, com uma linha de auditoria). */
    static async executarLote(clientes: Array<{ cliente: ClienteKyc; beneficiarios: string | null | undefined }>, d: DadosScreening, motivo: MotivoScreening,
        actor: ActorCompliance, progresso?: (feitos: number, total: number) => void) {
        exigir(actor, 'compliance_manage', 'executar o screening');
        const fontes = await this.fontes(d);
        const contagem: Record<ResultadoFonte, number> = { NO_MATCH: 0, POTENTIAL_MATCH: 0, NOT_CHECKED: 0, ERROR: 0 };
        for (let i = 0; i < clientes.length; i += 200) {
            const lote = clientes.slice(i, i + 200);
            const when = new Date().toISOString();
            const registos = lote.map(x => this.registo(x.cliente, x.beneficiarios, fontes, motivo, actor, when));
            registos.forEach(r => { contagem[r.global] += 1; });
            await db.transaction([...registos.map(r => r.statement), auditoria(actor, 'create', `Screening de PEP e sanções em lote: ${lote.length} cliente(s)`,
                { motivo, clientes: lote.map(x => x.cliente.id), possiveis: registos.filter(r => r.global === 'POTENTIAL_MATCH').length }, when)]);
            progresso?.(Math.min(i + 200, clientes.length), clientes.length);
            await new Promise(r => setTimeout(r, 0));
        }
        return contagem;
    }

    // ── Decisões ──────────────────────────────────────────────────────────────────
    static async decidir(input: {
        screening: ScreeningRegisto; candidato: Candidato; pessoa: PessoaPesquisa; decisao: 'falso_positivo' | 'confirmada'; fundamento: string;
        decisoes: DecisaoScreening[]; nomeCliente: string;
    }, actor: ActorCompliance) {
        exigir(actor, 'compliance_approve', 'decidir correspondências do screening');
        const fundamento = texto(input.fundamento);
        if (!fundamento || fundamento.length < 15) throw new Error('Fundamente a decisão (pelo menos 15 caracteres): o que foi comparado e como.');
        const chave = chaveCorrespondencia(input.candidato.fonte, input.candidato.ref, input.pessoa.nome);
        if (input.decisoes.some(x => x.client_id === input.screening.client_id && chaveCorrespondencia(x.fonte, x.ref, x.nome_pesquisado) === chave)) {
            throw new Error('Esta correspondência já foi decidida.');
        }
        const id = crypto.randomUUID();
        const when = new Date().toISOString();
        const c = input.candidato;
        await db.transaction([
            { sql: SQL_SCREENING_DECIDIR, params: [id, input.screening.id, input.screening.client_id, c.fonte, c.ref, c.nomeLista, input.pessoa.nome, c.categoria,
                input.decisao, fundamento, when, actor.id, actor.name], expectChanges: 1 },
            auditoria(actor, 'approve', `${input.decisao === 'confirmada' ? 'Confirmou' : 'Descartou (falso positivo)'} a correspondência de ${input.pessoa.nome} (${input.nomeCliente}) com «${c.nomeLista}» — ${ROTULO_FONTE_LISTA[c.fonte]} ${c.ref}`,
                { clientId: input.screening.client_id, screeningId: input.screening.id, fonte: c.fonte, ref: c.ref, decisao: input.decisao, fundamento }, when),
        ]);
    }
}
