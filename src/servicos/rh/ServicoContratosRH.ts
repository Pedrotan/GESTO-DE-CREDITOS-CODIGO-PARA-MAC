// Contratos de trabalho: modelos de contrato (texto com variáveis), o texto escrito de cada contrato e a emissão
// numerada (CT AAAA/NNNN), que guarda o texto emitido e arquiva o PDF na pasta pessoal (Contratos).
import { db } from '@/bibliotecas/bd';
import { variaveisDesconhecidasContrato } from '@/bibliotecas/rh/contratos-rh';
import { auditoriaRH, type ActorRH, type Contrato } from './ServicoRH';
import { ServicoTempoRH } from './ServicoTempoRH';

export type ModeloContrato = {
    id: string; nome: string; tipo_contrato: 'todos' | 'indeterminado' | 'determinado'; titulo: string | null; conteudo: string;
    activo: number; sistema: number; criado_em: string; criado_por_nome: string | null; actualizado_em: string | null;
};
export type ContratoRH = Contrato & { texto?: string | null; titulo?: string | null; modelo_id?: string | null; texto_actualizado_em?: string | null };

const agora = () => new Date().toISOString();

export class ServicoContratosRH {
    static modelos() {
        return db.all<ModeloContrato>('SELECT * FROM rh_contrato_modelo ORDER BY sistema DESC, nome').catch(() => [] as ModeloContrato[]);
    }

    static contratos() {
        return db.all<ContratoRH>('SELECT * FROM rh_contrato ORDER BY estado, inicio DESC').catch(() => [] as ContratoRH[]);
    }

    static async guardarModelo(m: Partial<ModeloContrato>, actor: ActorRH) {
        const nome = m.nome?.trim();
        const conteudo = m.conteudo?.trim();
        if (!nome || !conteudo) throw new Error('Indique o nome e o texto do modelo.');
        const desconhecidas = variaveisDesconhecidasContrato(conteudo);
        if (desconhecidas.length) throw new Error(`Variáveis desconhecidas: ${desconhecidas.map(v => `{{${v}}}`).join(', ')}.`);
        const tipo = ['indeterminado', 'determinado'].includes(String(m.tipo_contrato)) ? m.tipo_contrato : 'todos';
        const repetido = (await this.modelos()).find(x => x.id !== m.id && x.nome.toLowerCase() === nome.toLowerCase());
        if (repetido) throw new Error('Já existe um modelo com esse nome.');
        const when = agora();
        if (m.id) {
            await db.transaction([
                { sql: 'UPDATE rh_contrato_modelo SET nome = ?, tipo_contrato = ?, titulo = ?, conteudo = ?, activo = ?, actualizado_em = ? WHERE id = ?',
                    params: [nome, tipo, m.titulo?.trim() || null, conteudo, m.activo === 0 ? 0 : 1, when, m.id], expectChanges: 1 },
                auditoriaRH(actor, 'update', `Alterou o modelo de contrato «${nome}»`, { modeloContratoId: m.id }, undefined, undefined, when),
            ]);
            return m.id;
        }
        const id = crypto.randomUUID();
        await db.transaction([
            { sql: `INSERT INTO rh_contrato_modelo (id, nome, tipo_contrato, titulo, conteudo, activo, sistema, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?)`,
                params: [id, nome, tipo, m.titulo?.trim() || null, conteudo, when, actor.id, actor.name], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Criou o modelo de contrato «${nome}»`, { modeloContratoId: id }, undefined, undefined, when),
        ]);
        return id;
    }

    /** Guarda o texto do contrato (rascunho editável; não numera). */
    static async guardarTexto(c: ContratoRH, dados: { modelo_id: string | null; titulo: string; texto: string }, actor: ActorRH) {
        if (!dados.texto.trim()) throw new Error('O contrato não tem texto.');
        const when = agora();
        await db.transaction([
            { sql: 'UPDATE rh_contrato SET texto = ?, titulo = ?, modelo_id = ?, texto_actualizado_em = ?, actualizado_em = ? WHERE id = ?',
                params: [dados.texto.trim(), dados.titulo.trim() || null, dados.modelo_id, when, when, c.id], expectChanges: 1 },
            auditoriaRH(actor, 'update', `Escreveu o texto do contrato ${c.id}`, { contratoId: c.id, funcionarioId: c.funcionario_id }, undefined, undefined, when),
        ]);
    }

    /** Emite o contrato numerado (CT AAAA/NNNN): guarda o texto no contrato e no documento emitido. */
    static async emitir(c: ContratoRH, dados: { modelo_id: string | null; titulo: string; texto: string }, actor: ActorRH) {
        if (!dados.texto.trim()) throw new Error('O contrato não tem texto.');
        const when = agora();
        return ServicoTempoRH.emitirDocumento(c.funcionario_id, 'contrato_trabalho', 'CT', { contratoId: c.id, titulo: dados.titulo, texto: dados.texto.trim(), modeloId: dados.modelo_id }, actor, [
            { sql: 'UPDATE rh_contrato SET texto = ?, titulo = ?, modelo_id = ?, texto_actualizado_em = ?, actualizado_em = ? WHERE id = ?',
                params: [dados.texto.trim(), dados.titulo.trim() || null, dados.modelo_id, when, when, c.id], expectChanges: 1 },
        ]);
    }
}
