// Confirmação da recepção do salário: depois de o RH marcar o processamento como pago, o funcionário confirma no
// portal que recebeu (ou avisa que não recebeu, com uma observação). O RH vê as confirmações no processamento.
import { db } from '@/bibliotecas/bd';
import { auditoriaRH, type ActorRH } from './ServicoRH';

export type EstadoRecebimento = 'recebido' | 'nao_recebido';
export type RecebimentoRH = {
    id: string; funcionario_id: string; recibo_id: string; processamento_id: string; estado: EstadoRecebimento; observacao: string | null;
    criado_em: string; criado_por: string | null; criado_por_nome: string | null;
};

/** A última confirmação de cada recibo (a mais recente vale: «não recebi» seguido de «recebi» fica recebido). */
export const ultimaPorRecibo = (lista: RecebimentoRH[]) => {
    const mapa = new Map<string, RecebimentoRH>();
    for (const r of [...lista].sort((a, b) => a.criado_em.localeCompare(b.criado_em))) mapa.set(r.recibo_id, r);
    return mapa;
};

export class ServicoRecebimentoRH {
    static doFuncionario(funcionarioId: string) {
        return db.all<RecebimentoRH>('SELECT * FROM rh_recebimento WHERE funcionario_id = ? ORDER BY criado_em', [funcionarioId]).catch(() => [] as RecebimentoRH[]);
    }

    static doProcessamento(processamentoId: string) {
        return db.all<RecebimentoRH>('SELECT * FROM rh_recebimento WHERE processamento_id = ? ORDER BY criado_em', [processamentoId]).catch(() => [] as RecebimentoRH[]);
    }

    static async confirmar(input: { funcionario_id: string; recibo_id: string; processamento_id: string; estado: EstadoRecebimento; observacao?: string }, actor: ActorRH) {
        const observacao = input.observacao?.trim() || null;
        if (input.estado === 'nao_recebido' && (!observacao || observacao.length < 5)) throw new Error('Diga ao RH o que aconteceu (ex.: o valor ainda não entrou na conta).');
        const id = crypto.randomUUID();
        const when = new Date().toISOString();
        await db.transaction([
            { sql: 'INSERT INTO rh_recebimento (id, funcionario_id, recibo_id, processamento_id, estado, observacao, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                params: [id, input.funcionario_id, input.recibo_id, input.processamento_id, input.estado, observacao, when, actor.id, actor.name], expectChanges: 1 },
            auditoriaRH(actor, 'create', input.estado === 'recebido' ? 'Confirmou a recepção do salário' : 'Avisou que não recebeu o salário',
                { funcionarioId: input.funcionario_id, processamentoId: input.processamento_id, reciboId: input.recibo_id }, undefined, observacao ? { observacao } : undefined, when),
        ]);
    }
}
