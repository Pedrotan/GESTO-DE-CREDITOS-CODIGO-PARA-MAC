// Portal do funcionário: cada utilizador com a permissão «RH: Portal do funcionário» vê só a ficha ligada à sua
// conta, os seus recibos aprovados, o saldo de férias e faz pedidos (férias e dispensas) que o RH aprova. O processo
// principal só aceita estes dois pedidos e confirma que a ficha é mesmo de quem pede.
import { db } from '@/bibliotecas/bd';
import { diasDoPlano } from '@/bibliotecas/rh/ferias';
import { diasUteis, HORARIO_OMISSAO } from '@/bibliotecas/rh/ponto';
import { auditoriaRH, type ActorRH, type Funcionario } from './ServicoRH';
import { ServicoTempoRH } from './ServicoTempoRH';
import { ServicoSalariosRH } from './ServicoSalariosRH';

const agora = () => new Date().toISOString();
const OFICIAIS = new Set(['aprovado', 'pago', 'fechado']);

export class ServicoPortalRH {
    static meuFuncionario(utilizadorId: string) {
        return db.get<Funcionario>('SELECT * FROM rh_funcionario WHERE utilizador_id = ?', [utilizadorId]).catch(() => undefined);
    }

    static async meusRecibos(funcionarioId: string) {
        return (await ServicoSalariosRH.recibosFuncionario(funcionarioId)).filter(r => OFICIAIS.has(r.estado));
    }

    private static async horario(f: Funcionario) {
        const horarios = await ServicoTempoRH.horarios();
        return horarios.find(h => h.id === f.horario_id) || horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
    }

    /** Pedido de férias: fica «planeado» e marcado como pedido do funcionário até o RH o aprovar. */
    static async pedirFerias(f: Funcionario, inicio: string, fim: string, observacoes: string, actor: ActorRH) {
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/u.test(fim) || fim < inicio) throw new Error('Indique o início e o fim das férias.');
        const dias = diasDoPlano(inicio, fim, await this.horario(f), await ServicoTempoRH.feriados());
        if (!dias) throw new Error('O período escolhido não tem dias úteis.');
        const id = crypto.randomUUID();
        const when = agora();
        await db.transaction([
            { sql: `INSERT INTO rh_plano_ferias (id, funcionario_id, ano, mes_previsto, data_inicio, data_fim, dias, observacoes, estado, pedido_funcionario, criado_em, criado_por, criado_por_nome)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planeado', 1, ?, ?, ?)`,
                params: [id, f.id, Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7)), inicio, fim, dias, observacoes.trim() || null, when, actor.id, actor.name], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Pedido de férias no portal: ${inicio} a ${fim} (${dias} dias úteis)`, { funcionarioId: f.id, planoId: id }, undefined, undefined, when),
        ]);
    }

    /** Pedido de dispensa: ausência pendente que o RH (ou o chefe) aprova em «Dispensas e licenças». */
    static async pedirDispensa(f: Funcionario, input: { tipo_id: string; inicio: string; fim: string; horas: number; motivo: string }, actor: ActorRH) {
        const fim = input.horas > 0 ? input.inicio : input.fim;
        if (!input.tipo_id || !/^\d{4}-\d{2}-\d{2}$/u.test(input.inicio) || !fim || fim < input.inicio) throw new Error('Indique o tipo e as datas.');
        if (!input.motivo.trim()) throw new Error('Indique o motivo.');
        const dias = input.horas > 0 ? 0 : diasUteis(input.inicio, fim, await this.horario(f), await ServicoTempoRH.feriados());
        const id = crypto.randomUUID();
        const when = agora();
        await db.transaction([
            { sql: `INSERT INTO rh_ausencia (id, funcionario_id, tipo_id, data_inicio, data_fim, dias, horas, motivo, estado, pedido_dispensa, criado_em, criado_por, criado_por_nome)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente', 1, ?, ?, ?)`,
                params: [id, f.id, input.tipo_id, input.inicio, fim, dias, Math.max(0, input.horas || 0), input.motivo.trim(), when, actor.id, actor.name], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Pedido de dispensa no portal: ${input.inicio}${fim !== input.inicio ? ` a ${fim}` : ''}`, { funcionarioId: f.id, ausenciaId: id }, undefined, undefined, when),
        ]);
    }
}
