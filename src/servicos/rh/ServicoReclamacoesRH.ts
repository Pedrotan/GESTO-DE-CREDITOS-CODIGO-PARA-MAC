// Reclamações sobre a folha de correcção: depois de calculado (antes de aprovado), o funcionário vê o seu recibo no
// portal e pode reclamar de um desconto (ou de outro valor). O RH responde (aceite/recusada) e só depois aprova.
import { db } from '@/bibliotecas/bd';
import { auditoriaRH, type ActorRH } from './ServicoRH';

export type EstadoReclamacao = 'pendente' | 'aceite' | 'recusada';
export type ReclamacaoRH = {
    id: string; funcionario_id: string; processamento_id: string; recibo_id: string | null; codigo: string | null; descricao: string | null;
    valor_minor: number; motivo: string; estado: EstadoReclamacao; resposta: string | null;
    criado_em: string; criado_por: string | null; criado_por_nome: string | null;
    respondido_em: string | null; respondido_por: string | null; respondido_por_nome: string | null;
};

const agora = () => new Date().toISOString();

export class ServicoReclamacoesRH {
    static doFuncionario(funcionarioId: string) {
        return db.all<ReclamacaoRH>('SELECT * FROM rh_reclamacao WHERE funcionario_id = ? ORDER BY criado_em DESC', [funcionarioId]).catch(() => [] as ReclamacaoRH[]);
    }

    static doProcessamento(processamentoId: string) {
        return db.all<ReclamacaoRH>('SELECT * FROM rh_reclamacao WHERE processamento_id = ? ORDER BY estado = \'pendente\' DESC, criado_em DESC', [processamentoId]).catch(() => [] as ReclamacaoRH[]);
    }

    static async pendentes(processamentoId: string) {
        return (await this.doProcessamento(processamentoId)).filter(r => r.estado === 'pendente').length;
    }

    /** O funcionário reclama de uma linha (ou do recibo todo) da sua folha de correcção. */
    static async reclamar(input: { funcionario_id: string; processamento_id: string; recibo_id: string | null; codigo?: string | null; descricao?: string | null; valor_minor?: number; motivo: string }, actor: ActorRH) {
        const motivo = input.motivo.trim();
        if (motivo.length < 10) throw new Error('Explique o motivo da reclamação (pelo menos 10 caracteres).');
        const id = crypto.randomUUID();
        const when = agora();
        await db.transaction([
            { sql: `INSERT INTO rh_reclamacao (id, funcionario_id, processamento_id, recibo_id, codigo, descricao, valor_minor, motivo, estado, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?)`,
                params: [id, input.funcionario_id, input.processamento_id, input.recibo_id, input.codigo || null, input.descricao || null, Math.round(input.valor_minor || 0), motivo, when, actor.id, actor.name], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Reclamação na folha de correcção${input.descricao ? `: ${input.descricao}` : ''}`, { funcionarioId: input.funcionario_id, processamentoId: input.processamento_id, reclamacaoId: id }, undefined, { motivo }, when),
        ]);
        return id;
    }

    /** O RH responde: aceite (corrige os valores do mês e recalcula) ou recusada, sempre com a explicação. */
    static async responder(r: ReclamacaoRH, estado: 'aceite' | 'recusada', resposta: string, actor: ActorRH) {
        const texto = resposta.trim();
        if (texto.length < 5) throw new Error('Escreva a resposta ao funcionário.');
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_reclamacao SET estado = ?, resposta = ?, respondido_em = ?, respondido_por = ?, respondido_por_nome = ? WHERE id = ? AND estado = 'pendente'`,
                params: [estado, texto, when, actor.id, actor.name, r.id], expectChanges: 1 },
            auditoriaRH(actor, 'update', `${estado === 'aceite' ? 'Aceitou' : 'Recusou'} uma reclamação da folha de correcção`, { funcionarioId: r.funcionario_id, processamentoId: r.processamento_id, reclamacaoId: r.id }, undefined, { resposta: texto }, when),
        ]);
    }
}
