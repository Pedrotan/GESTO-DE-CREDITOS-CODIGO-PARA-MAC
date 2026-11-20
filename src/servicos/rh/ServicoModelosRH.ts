// Modelos de declaração (texto com variáveis) e de relatório personalizado (secções escolhidas), guardados por empresa.
import { db } from '@/bibliotecas/bd';
import { variaveisDesconhecidas } from '@/bibliotecas/rh/modelos-rh';
import { auditoriaRH, type ActorRH } from './ServicoRH';

export type ModeloRH = {
    id: string; tipo: 'declaracao' | 'relatorio'; nome: string; titulo: string | null; conteudo: string; activo: number; sistema: number;
    criado_em: string; criado_por_nome: string | null; actualizado_em: string | null;
};

export class ServicoModelosRH {
    static modelos(tipo?: ModeloRH['tipo']) {
        return (tipo
            ? db.all<ModeloRH>('SELECT * FROM rh_modelo WHERE tipo = ? ORDER BY sistema DESC, nome', [tipo])
            : db.all<ModeloRH>('SELECT * FROM rh_modelo ORDER BY tipo, sistema DESC, nome')).catch(() => [] as ModeloRH[]);
    }

    static async guardar(m: Partial<ModeloRH> & { tipo: ModeloRH['tipo'] }, actor: ActorRH) {
        const nome = m.nome?.trim();
        const conteudo = m.conteudo?.trim();
        if (!nome || !conteudo) throw new Error('Indique o nome e o conteúdo do modelo.');
        if (m.tipo === 'declaracao') {
            const desconhecidas = variaveisDesconhecidas(conteudo);
            if (desconhecidas.length) throw new Error(`Variáveis desconhecidas: ${desconhecidas.map(v => `{{${v}}}`).join(', ')}.`);
        }
        const repetido = (await this.modelos(m.tipo)).find(x => x.id !== m.id && x.nome.toLowerCase() === nome.toLowerCase());
        if (repetido) throw new Error('Já existe um modelo com esse nome.');
        const when = new Date().toISOString();
        if (m.id) {
            await db.transaction([
                { sql: 'UPDATE rh_modelo SET nome = ?, titulo = ?, conteudo = ?, activo = ?, actualizado_em = ? WHERE id = ?',
                    params: [nome, m.titulo?.trim() || null, conteudo, m.activo === 0 ? 0 : 1, when, m.id], expectChanges: 1 },
                auditoriaRH(actor, 'update', `Alterou o modelo «${nome}»`, { modeloId: m.id }, undefined, undefined, when),
            ]);
            return m.id;
        }
        const id = crypto.randomUUID();
        await db.transaction([
            { sql: `INSERT INTO rh_modelo (id, tipo, nome, titulo, conteudo, activo, sistema, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?)`,
                params: [id, m.tipo, nome, m.titulo?.trim() || null, conteudo, when, actor.id, actor.name], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Criou o modelo «${nome}»`, { modeloId: id, tipo: m.tipo }, undefined, undefined, when),
        ]);
        return id;
    }
}
