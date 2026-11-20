// Gestão documental do RH: pastas da empresa e pasta pessoal de cada funcionário (7 subpastas padrão, sempre
// presentes, mais as pastas criadas pelo RH), versões, anulados recuperáveis, apagamento definitivo só pelo Super
// Administrador e registo de quem carregou, viu, descarregou, moveu, renomeou, anulou ou restaurou cada ficheiro.
import { db } from '@/bibliotecas/bd';
import { isPrimaryOwner } from '@/bibliotecas/conta-principal';
import { auditoriaRH, type ActorRH, type CategoriaDocumento, type DocumentoRH } from './ServicoRH';

export const EMPRESA = '__empresa__';
export type PastaSistema = { chave: string; nome: string; descricao: string; categoria: CategoriaDocumento };
/** Subpastas padrão da pasta pessoal (não se apagam). A categoria é a dos documentos carregados para lá. */
export const PASTAS_PESSOAIS: PastaSistema[] = [
    { chave: 'identificacao', nome: 'Identificação', descricao: 'BI, NIF, cartão INSS', categoria: 'identificacao' },
    { chave: 'contratos', nome: 'Contratos', descricao: 'Contratos e adendas', categoria: 'contratual' },
    { chave: 'declaracoes', nome: 'Declarações', descricao: 'Geradas pelo sistema', categoria: 'outros' },
    { chave: 'recibos', nome: 'Recibos de salário', descricao: 'Meses aprovados', categoria: 'salarial' },
    { chave: 'ausencias', nome: 'Férias e ausências', descricao: 'Justificações, atestados', categoria: 'saude' },
    { chave: 'formacao', nome: 'Formação e certificados', descricao: 'Certificados e diplomas', categoria: 'academica' },
    { chave: 'relatorios', nome: 'Relatórios pessoais', descricao: 'PDF gerados', categoria: 'outros' },
];
export const PASTAS_EMPRESA: PastaSistema[] = [
    { chave: 'regulamentos', nome: 'Regulamentos internos', descricao: 'Regulamentos e normas', categoria: 'outros' },
    { chave: 'modelos', nome: 'Modelos e minutas', descricao: 'Minutas e formulários', categoria: 'outros' },
    { chave: 'comunicados', nome: 'Comunicados', descricao: 'Comunicados internos', categoria: 'outros' },
];
/** Subpasta de um documento: a escolhida, ou a da sua categoria (documentos anteriores à gestão documental). */
export function pastaDoDocumento(d: Pick<DocumentoRH, 'pasta_id' | 'categoria' | 'funcionario_id'>) {
    if (d.pasta_id) return d.pasta_id;
    if (d.funcionario_id === EMPRESA) return 'raiz';
    const sys = PASTAS_PESSOAIS.find(p => p.categoria === d.categoria && !['declaracoes', 'relatorios'].includes(p.chave));
    return sys ? `sys:${sys.chave}` : 'raiz';
}

export type PastaRH = { id: string; funcionario_id: string; nome: string; anulada: number; criado_por_nome: string | null; criado_em: string };
export type AcessoDocumento = { id: string; documento_id: string; accao: string; detalhe: string | null; utilizador_nome: string | null; criado_em: string };
type Accao = 'ver' | 'descarregar' | 'mover' | 'renomear' | 'anular' | 'restaurar' | 'apagar' | 'carregar';

const agora = () => new Date().toISOString();
const acesso = (documentoId: string, accao: Accao, actor: ActorRH, detalhe: string | null = null, when = agora()) => ({
    sql: 'INSERT INTO rh_doc_auditoria (id, documento_id, accao, detalhe, utilizador_id, utilizador_nome, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)',
    params: [crypto.randomUUID(), documentoId, accao, detalhe, actor.id, actor.name, when],
});
const superAdmin = (actor: ActorRH) => actor.role === 'super_admin' || isPrimaryOwner(actor);

export class ServicoDocumentosRH {
    static pastas() {
        return db.all<PastaRH>('SELECT * FROM rh_doc_pasta WHERE anulada = 0 ORDER BY nome').catch(() => [] as PastaRH[]);
    }

    static async criarPasta(funcionarioId: string, nome: string, actor: ActorRH) {
        const limpo = nome.trim();
        if (!limpo) throw new Error('Indique o nome da pasta.');
        const sistema = (funcionarioId === EMPRESA ? PASTAS_EMPRESA : PASTAS_PESSOAIS).some(p => p.nome.toLowerCase() === limpo.toLowerCase());
        const existentes = (await this.pastas()).filter(p => p.funcionario_id === funcionarioId);
        if (sistema || existentes.some(p => p.nome.toLowerCase() === limpo.toLowerCase())) throw new Error('Já existe uma pasta com esse nome.');
        const id = crypto.randomUUID();
        const when = agora();
        await db.transaction([
            { sql: 'INSERT INTO rh_doc_pasta (id, funcionario_id, nome, anulada, criado_por, criado_por_nome, criado_em) VALUES (?, ?, ?, 0, ?, ?, ?)',
                params: [id, funcionarioId, limpo, actor.id, actor.name, when], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Criou a pasta «${limpo}»`, { funcionarioId, pastaId: id }, undefined, undefined, when),
        ]);
        return id;
    }

    static async renomearPasta(id: string, nome: string, actor: ActorRH) {
        if (id.startsWith('sys:')) throw new Error('As subpastas padrão não se renomeiam.');
        if (!nome.trim()) throw new Error('Indique o nome da pasta.');
        const when = agora();
        await db.transaction([
            { sql: 'UPDATE rh_doc_pasta SET nome = ?, actualizado_em = ? WHERE id = ? AND anulada = 0', params: [nome.trim(), when, id], expectChanges: 1 },
            auditoriaRH(actor, 'update', `Renomeou uma pasta para «${nome.trim()}»`, { pastaId: id }, undefined, undefined, when),
        ]);
    }

    /** Anula uma pasta criada pelo RH; os documentos que lá estavam voltam à raiz da pasta pessoal. */
    static async anularPasta(id: string, actor: ActorRH) {
        if (id.startsWith('sys:')) throw new Error('As subpastas padrão não se apagam.');
        const when = agora();
        await db.transaction([
            { sql: 'UPDATE rh_documento SET pasta_id = NULL, actualizado_em = ? WHERE pasta_id = ?', params: [when, id] },
            { sql: 'UPDATE rh_doc_pasta SET anulada = 1, actualizado_em = ? WHERE id = ? AND anulada = 0', params: [when, id], expectChanges: 1 },
            auditoriaRH(actor, 'delete', 'Anulou uma pasta de documentos', { pastaId: id }, undefined, undefined, when),
        ]);
    }

    static async mover(documento: DocumentoRH, pastaId: string, actor: ActorRH) {
        const when = agora();
        await db.transaction([
            { sql: 'UPDATE rh_documento SET pasta_id = ?, actualizado_em = ? WHERE id = ?', params: [pastaId === 'raiz' ? null : pastaId, when, documento.id], expectChanges: 1 },
            acesso(documento.id, 'mover', actor, `${pastaDoDocumento(documento)} → ${pastaId}`, when),
        ]);
    }

    static async renomear(documento: DocumentoRH, nome: string, actor: ActorRH) {
        if (!nome.trim()) throw new Error('Indique o nome do documento.');
        const when = agora();
        await db.transaction([
            { sql: 'UPDATE rh_documento SET nome = ?, actualizado_em = ? WHERE id = ?', params: [nome.trim(), when, documento.id], expectChanges: 1 },
            acesso(documento.id, 'renomear', actor, `${documento.nome} → ${nome.trim()}`, when),
        ]);
    }

    /** Restaura um documento anulado (volta a activo). */
    static async restaurar(documento: DocumentoRH, actor: ActorRH) {
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_documento SET estado = 'activo', anulado_por = NULL, anulado_por_nome = NULL, anulado_em = NULL, actualizado_em = ? WHERE id = ? AND estado = 'arquivado'`,
                params: [when, documento.id], expectChanges: 1 },
            acesso(documento.id, 'restaurar', actor, null, when),
        ]);
    }

    /** Apaga definitivamente (só o Super Administrador, e só documentos já anulados). Fica o registo na auditoria. */
    static async apagarDefinitivo(documento: DocumentoRH, actor: ActorRH) {
        if (!superAdmin(actor)) throw new Error('Só o Super Administrador apaga documentos definitivamente.');
        if (documento.estado !== 'arquivado') throw new Error('Anule primeiro o documento; só os anulados se apagam definitivamente.');
        const when = agora();
        await db.transaction([
            { sql: 'DELETE FROM rh_documento_ficheiro WHERE documento_id = ?', params: [documento.id] },
            { sql: `DELETE FROM rh_documento WHERE id = ? AND estado = 'arquivado'`, params: [documento.id], expectChanges: 1 },
            acesso(documento.id, 'apagar', actor, documento.nome, when),
            auditoriaRH(actor, 'delete', `Apagou definitivamente o documento «${documento.nome}»`, { documentoId: documento.id, funcionarioId: documento.funcionario_id }, documento, undefined, when),
        ]);
    }

    /** Regista que o utilizador viu ou descarregou o ficheiro. */
    static registarAcesso(documentoId: string, accao: 'ver' | 'descarregar', actor: ActorRH) {
        return db.transaction([acesso(documentoId, accao, actor)]).catch(() => undefined);
    }

    static acessos(documentoId: string) {
        return db.all<AcessoDocumento>('SELECT * FROM rh_doc_auditoria WHERE documento_id = ? ORDER BY criado_em DESC', [documentoId]).catch(() => [] as AcessoDocumento[]);
    }
}
