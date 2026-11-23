// Investigações de Compliance (fase 4): abrir a partir de alertas ou da ficha do cliente, investigar, juntar
// evidências, registar decisões (conclusão interna, medidas e — à parte — a decisão sobre a comunicação à UIF) e
// encerrar. Tudo fica no histórico do caso e na auditoria; consultar uma evidência também fica registado.
// O sistema não comunica com a UIF: regista a decisão e a referência da comunicação feita pelos canais oficiais.
import { db } from '@/bibliotecas/bd';
import { isPrimaryOwner } from '@/bibliotecas/conta-principal';
import {
    DECISOES_POR_TIPO, ROTULO_DECISAO, ROTULO_ESTADO_CASO, ROTULO_TIPO_DECISAO, faltaParaEncerrar, numeroCaso, prazoCaso, transicaoCasoPermitida,
    type EstadoCaso, type Prioridade, type TipoCaso, type TipoDecisao,
} from '@/bibliotecas/compliance/casos';
import {
    SQL_CASO_ABRIR, SQL_CASO_ATRIBUIR, SQL_CASO_ENCERRAR, SQL_CASO_INVESTIGAR, SQL_CASO_LIGAR, SQL_CASO_NOTA, SQL_CASO_PARA_DECISAO,
    SQL_DECISAO_REGISTAR, SQL_EVIDENCIA_FICHEIRO, SQL_EVIDENCIA_REGISTAR,
} from '@/bibliotecas/compliance/permissoes-compliance';
import { hashTexto } from '@/bibliotecas/compliance/listas-xml';
import { podeCompliance, type ActorCompliance } from './ServicoCompliance';

type Statement = { sql: string; params?: unknown[]; expectChanges?: number };

export type Caso = {
    id: string; numero: string; client_id: string; tipo: TipoCaso; prioridade: Prioridade; titulo: string; descricao: string; estado: EstadoCaso;
    responsavel_id: string | null; responsavel_nome: string | null; prazo: string | null; aberto_em: string; aberto_por: string | null; aberto_por_nome: string | null;
    actualizado_em: string | null; encerrado_em: string | null; encerrado_por_nome: string | null; resumo_final: string | null;
};
export type TipoLigacao = 'alerta' | 'screening' | 'avaliacao' | 'verificacao' | 'outro';
export type LigacaoCaso = { id: string; caso_id: string; tipo: TipoLigacao; ref_id: string; descricao: string | null; criado_em: string; criado_por_nome: string | null };
export type NotaCaso = { id: string; caso_id: string; tipo: string; texto: string | null; estado_anterior: string | null; estado_novo: string | null; por_nome: string | null; em: string };
export type TipoEvidencia = 'documento' | 'extracto' | 'declaracao' | 'captura' | 'nota' | 'outro';
export type Evidencia = {
    id: string; caso_id: string; tipo: TipoEvidencia; titulo: string; descricao: string | null; ficheiro_nome: string | null; ficheiro_mime: string | null;
    ficheiro_tamanho: number | null; ficheiro_hash: string | null; criado_em: string; criado_por_nome: string | null;
};
export type DecisaoRegisto = {
    id: string; caso_id: string; client_id: string; tipo: TipoDecisao; decisao: string; fundamento: string; referencia: string | null; data_referencia: string | null;
    decidido_em: string; decidido_por: string | null; decidido_por_nome: string | null;
};
export type DadosCasos = { casos: Caso[]; ligacoes: LigacaoCaso[]; notas: NotaCaso[]; evidencias: Evidencia[]; decisoes: DecisaoRegisto[] };
export const DADOS_CASOS_VAZIOS: DadosCasos = { casos: [], ligacoes: [], notas: [], evidencias: [], decisoes: [] };

export const ROTULO_TIPO_EVIDENCIA: Record<TipoEvidencia, string> = {
    documento: 'Documento', extracto: 'Extracto / movimentos', declaracao: 'Declaração do cliente', captura: 'Captura de ecrã', nota: 'Nota escrita', outro: 'Outro',
};
export const ROTULO_TIPO_LIGACAO: Record<TipoLigacao, string> = { alerta: 'Alerta', screening: 'Screening', avaliacao: 'Avaliação de risco', verificacao: 'Verificação KYC', outro: 'Outro' };
export const TAMANHO_MAXIMO_EVIDENCIA = 5 * 1024 * 1024;

const SQL_AUDITORIA = `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, ?, 'compliance', ?, ?, ?, ?)`;
const auditoria = (actor: ActorCompliance, action: string, details: string, metadata: Record<string, unknown>, when: string): Statement => ({
    sql: SQL_AUDITORIA, params: [crypto.randomUUID(), when, actor.id, actor.name, action, details, null, null, JSON.stringify(metadata)],
});
const nota = (casoId: string, tipo: string, textoNota: string | null, de: string | null, para: string | null, actor: ActorCompliance, when: string): Statement => ({
    sql: SQL_CASO_NOTA, params: [crypto.randomUUID(), casoId, tipo, textoNota, de, para, actor.id, actor.name, when],
});
const lista = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
const texto = (v: unknown) => { const s = String(v ?? '').trim(); return s ? s : null; };
const exigir = (actor: ActorCompliance, permissao: Parameters<typeof podeCompliance>[1], accao: string) => {
    if (!podeCompliance(actor, permissao)) throw new Error(`Sem permissão para ${accao}.`);
};
const ehSuperior = (actor: ActorCompliance) => actor.role === 'super_admin' || isPrimaryOwner(actor);
const lerDataUrl = (ficheiro: File) => new Promise<string>((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
    leitor.readAsDataURL(ficheiro);
});

export class ServicoCasos {
    static async carregar(): Promise<DadosCasos> {
        const [casos, ligacoes, notas, evidencias, decisoes] = await Promise.all([
            lista(db.query<Caso>('SELECT * FROM compliance_caso ORDER BY aberto_em DESC')),
            lista(db.query<LigacaoCaso>('SELECT * FROM compliance_caso_ligacao ORDER BY criado_em')),
            lista(db.query<NotaCaso>('SELECT * FROM compliance_caso_nota ORDER BY em')),
            lista(db.query<Evidencia>('SELECT * FROM compliance_evidencia ORDER BY criado_em')),
            lista(db.query<DecisaoRegisto>('SELECT * FROM compliance_decisao ORDER BY decidido_em')),
        ]);
        return { casos, ligacoes, notas, evidencias, decisoes };
    }

    static async abrir(input: {
        clienteId: string; nomeCliente: string; tipo: TipoCaso; prioridade: Prioridade; titulo: string; descricao: string;
        ligacoes?: Array<{ tipo: TipoLigacao; refId: string; descricao: string }>;
    }, actor: ActorCompliance) {
        exigir(actor, 'compliance_manage', 'abrir investigações');
        const titulo = texto(input.titulo);
        const descricao = texto(input.descricao);
        if (!titulo) throw new Error('Dê um título à investigação.');
        if (!descricao || descricao.length < 20) throw new Error('Descreva o motivo da investigação (pelo menos 20 caracteres).');
        const id = crypto.randomUUID();
        const when = new Date().toISOString();
        const numero = numeroCaso(when, id);
        await db.transaction([
            { sql: SQL_CASO_ABRIR, params: [id, numero, input.clienteId, input.tipo, input.prioridade, titulo, descricao, prazoCaso(when, input.prioridade),
                actor.id, actor.name, when, actor.id, actor.name], expectChanges: 1 },
            ...(input.ligacoes || []).map((l): Statement => ({ sql: SQL_CASO_LIGAR, params: [`${id}:${l.tipo}:${l.refId}`, id, l.tipo, l.refId, l.descricao, when, actor.id, actor.name] })),
            nota(id, 'estado', 'Investigação aberta', null, 'aberto', actor, when),
            auditoria(actor, 'create', `Abriu a investigação ${numero} (${input.nomeCliente})`, { casoId: id, clientId: input.clienteId, ligacoes: (input.ligacoes || []).map(l => l.refId) }, when),
        ]);
        return { id, numero };
    }

    static async mudarEstado(c: Caso, para: 'em_investigacao' | 'aguarda_decisao', comentario: string, actor: ActorCompliance) {
        exigir(actor, 'compliance_manage', 'mover investigações');
        if (!transicaoCasoPermitida(c.estado, para)) throw new Error(`Não é possível passar de «${ROTULO_ESTADO_CASO[c.estado]}» para «${ROTULO_ESTADO_CASO[para]}».`);
        const when = new Date().toISOString();
        await db.transaction([
            { sql: para === 'em_investigacao' ? SQL_CASO_INVESTIGAR : SQL_CASO_PARA_DECISAO, params: [actor.id, when, c.id], expectChanges: 1 },
            nota(c.id, 'estado', texto(comentario), c.estado, para, actor, when),
            auditoria(actor, 'update', `Investigação ${c.numero}: ${ROTULO_ESTADO_CASO[c.estado]} → ${ROTULO_ESTADO_CASO[para]}`, { casoId: c.id }, when),
        ]);
    }

    static async atribuir(c: Caso, dados: { responsavelId: string; responsavelNome: string; prioridade: Prioridade; prazo: string }, actor: ActorCompliance) {
        exigir(actor, 'compliance_manage', 'atribuir investigações');
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(dados.prazo)) throw new Error('Indique o prazo (data).');
        const when = new Date().toISOString();
        await db.transaction([
            { sql: SQL_CASO_ATRIBUIR, params: [dados.responsavelId, dados.responsavelNome, dados.prioridade, dados.prazo, actor.id, when, c.id], expectChanges: 1 },
            nota(c.id, 'atribuicao', `Responsável: ${dados.responsavelNome} · prioridade ${dados.prioridade} · prazo ${dados.prazo.split('-').reverse().join('/')}`, null, null, actor, when),
            auditoria(actor, 'update', `Investigação ${c.numero}: atribuída a ${dados.responsavelNome}`, { casoId: c.id, ...dados }, when),
        ]);
    }

    static async comentar(c: Caso, comentario: string, actor: ActorCompliance) {
        exigir(actor, 'compliance_manage', 'escrever na investigação');
        const t = texto(comentario);
        if (!t) throw new Error('Escreva a nota.');
        if (c.estado === 'encerrado') throw new Error('A investigação está encerrada.');
        await db.transaction([nota(c.id, 'nota', t, null, null, actor, new Date().toISOString())]);
    }

    static async ligar(c: Caso, tipo: TipoLigacao, refId: string, descricao: string, actor: ActorCompliance) {
        exigir(actor, 'compliance_manage', 'ligar registos à investigação');
        if (c.estado === 'encerrado') throw new Error('A investigação está encerrada.');
        const when = new Date().toISOString();
        await db.transaction([
            { sql: SQL_CASO_LIGAR, params: [`${c.id}:${tipo}:${refId}`, c.id, tipo, refId, descricao, when, actor.id, actor.name] },
            nota(c.id, 'ligacao', `${ROTULO_TIPO_LIGACAO[tipo]} ligado: ${descricao}`, null, null, actor, when),
        ]);
    }

    /** Junta uma evidência (ficheiro até 5 MB e/ou descrição). Guarda a impressão digital SHA-256 do ficheiro. */
    static async juntarEvidencia(c: Caso, dados: { tipo: TipoEvidencia; titulo: string; descricao: string; ficheiro?: File | null }, actor: ActorCompliance) {
        exigir(actor, 'compliance_manage', 'juntar evidências');
        if (c.estado === 'encerrado') throw new Error('A investigação está encerrada.');
        const titulo = texto(dados.titulo);
        if (!titulo) throw new Error('Dê um título à evidência.');
        const f = dados.ficheiro || null;
        if (!f && !texto(dados.descricao)) throw new Error('Junte um ficheiro ou descreva a evidência.');
        if (f && f.size > TAMANHO_MAXIMO_EVIDENCIA) throw new Error('O ficheiro tem mais de 5 MB.');
        const conteudo = f ? await lerDataUrl(f) : null;
        const hash = conteudo ? await hashTexto(conteudo) : null;
        const id = crypto.randomUUID();
        const when = new Date().toISOString();
        await db.transaction([
            { sql: SQL_EVIDENCIA_REGISTAR, params: [id, c.id, dados.tipo, titulo, texto(dados.descricao), f?.name || null, f?.type || null, f?.size ?? null, hash, when, actor.id, actor.name], expectChanges: 1 },
            ...(conteudo ? [{ sql: SQL_EVIDENCIA_FICHEIRO, params: [id, conteudo], expectChanges: 1 }] : []),
            nota(c.id, 'evidencia', `Evidência junta: ${titulo}${f ? ` (${f.name})` : ''}`, null, null, actor, when),
            auditoria(actor, 'create', `Investigação ${c.numero}: juntou a evidência «${titulo}»`, { casoId: c.id, evidenciaId: id, hash }, when),
        ]);
        return id;
    }

    /** Abre o ficheiro de uma evidência; a consulta fica registada na auditoria. */
    static async lerEvidencia(c: Caso, e: Evidencia, actor: ActorCompliance) {
        exigir(actor, 'compliance_view', 'consultar evidências');
        const linha = await db.get<{ conteudo: string }>('SELECT conteudo FROM compliance_evidencia_ficheiro WHERE id = ?', [e.id]);
        if (!linha) throw new Error('O ficheiro desta evidência não está neste computador (aguarde a sincronização).');
        await db.transaction([auditoria(actor, 'view', `Consultou a evidência «${e.titulo}» da investigação ${c.numero}`, { casoId: c.id, evidenciaId: e.id }, new Date().toISOString())]);
        return linha.conteudo;
    }

    static async decidir(c: Caso, d: { tipo: TipoDecisao; decisao: string; fundamento: string; referencia?: string; dataReferencia?: string },
        decisoes: DecisaoRegisto[], actor: ActorCompliance) {
        exigir(actor, 'compliance_approve', 'registar decisões');
        if (c.estado === 'encerrado') throw new Error('A investigação está encerrada.');
        if (!DECISOES_POR_TIPO[d.tipo]?.includes(d.decisao)) throw new Error('Escolha a decisão.');
        const fundamento = texto(d.fundamento);
        if (!fundamento || fundamento.length < 20) throw new Error('Fundamente a decisão (pelo menos 20 caracteres).');
        const doCaso = decisoes.filter(x => x.caso_id === c.id);
        if (d.tipo !== 'medida' && doCaso.some(x => x.tipo === d.tipo)) throw new Error(`A decisão «${ROTULO_TIPO_DECISAO[d.tipo]}» já foi registada e não se altera.`);
        if (d.tipo === 'conclusao' && c.aberto_por === actor.id && !ehSuperior(actor)) throw new Error('Quem abriu a investigação não regista a conclusão: tem de ser outro responsável.');
        if (d.tipo === 'uif' && !doCaso.some(x => x.tipo === 'conclusao')) throw new Error('Registe primeiro a conclusão interna; a decisão sobre a UIF é separada e vem depois.');
        const dataRef = texto(d.dataReferencia);
        if (dataRef && !/^\d{4}-\d{2}-\d{2}$/u.test(dataRef)) throw new Error('A data de referência tem de ser uma data.');
        const id = crypto.randomUUID();
        const when = new Date().toISOString();
        await db.transaction([
            { sql: SQL_DECISAO_REGISTAR, params: [id, c.id, c.client_id, d.tipo, d.decisao, fundamento, texto(d.referencia), dataRef, when, actor.id, actor.name], expectChanges: 1 },
            nota(c.id, 'decisao', `${ROTULO_TIPO_DECISAO[d.tipo]}: ${ROTULO_DECISAO[d.decisao as keyof typeof ROTULO_DECISAO]}`, null, null, actor, when),
            auditoria(actor, 'approve', `Investigação ${c.numero}: ${ROTULO_TIPO_DECISAO[d.tipo]} — ${ROTULO_DECISAO[d.decisao as keyof typeof ROTULO_DECISAO]}`,
                { casoId: c.id, decisaoId: id, tipo: d.tipo, decisao: d.decisao }, when),
        ]);
    }

    static async encerrar(c: Caso, resumo: string, decisoes: DecisaoRegisto[], actor: ActorCompliance) {
        exigir(actor, 'compliance_approve', 'encerrar investigações');
        const falta = faltaParaEncerrar(c.estado, decisoes.filter(x => x.caso_id === c.id));
        if (falta.length) throw new Error(falta.join(' '));
        const r = texto(resumo);
        if (!r || r.length < 20) throw new Error('Escreva o resumo final (pelo menos 20 caracteres).');
        const when = new Date().toISOString();
        await db.transaction([
            { sql: SQL_CASO_ENCERRAR, params: [r, actor.id, actor.name, when, actor.id, when, c.id], expectChanges: 1 },
            nota(c.id, 'estado', r, c.estado, 'encerrado', actor, when),
            auditoria(actor, 'approve', `Encerrou a investigação ${c.numero}`, { casoId: c.id }, when),
        ]);
    }

    /** Regista na auditoria a exportação de um relatório (quem, qual, filtros e número de linhas). */
    static async registarExportacao(relatorio: string, formato: 'csv' | 'pdf', linhas: number, filtros: Record<string, unknown>, actor: ActorCompliance) {
        exigir(actor, 'compliance_reports', 'exportar relatórios de Compliance');
        await db.transaction([auditoria(actor, 'export', `Exportou o relatório «${relatorio}» (${formato.toUpperCase()}, ${linhas} linha(s))`, { relatorio, formato, linhas, ...filtros }, new Date().toISOString())]);
    }
}
