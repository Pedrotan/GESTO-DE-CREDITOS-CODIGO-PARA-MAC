// Portal do funcionário: cada utilizador com a permissão «RH: Portal do funcionário» vê só a ficha ligada à sua
// conta, os seus recibos aprovados, o saldo de férias e faz pedidos (férias e dispensas) que o RH aprova. O processo
// principal só aceita estes dois pedidos e confirma que a ficha é mesmo de quem pede.
import { db } from '@/bibliotecas/bd';
import { diasUteis, HORARIO_OMISSAO } from '@/bibliotecas/rh/ponto';
import { auditoriaRH, type ActorRH, type Funcionario } from './ServicoRH';
import { ServicoTempoRH } from './ServicoTempoRH';
import { ServicoSalariosRH } from './ServicoSalariosRH';
import { ServicoFeriasRH } from './ServicoFeriasRH';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { avisos } from './ServicoPortalComunicacao';

const agora = () => new Date().toISOString();
const OFICIAIS = new Set(['aprovado', 'pago', 'fechado']);

export class ServicoPortalRH {
    static meuFuncionario(utilizadorId: string) {
        return db.get<Funcionario>('SELECT * FROM rh_funcionario WHERE utilizador_id = ?', [utilizadorId]).catch(() => undefined);
    }

    static async meusRecibos(funcionarioId: string) {
        return (await ServicoSalariosRH.recibosFuncionario(funcionarioId)).filter(r => OFICIAIS.has(r.estado));
    }

    /** Folha de correcção: recibos calculados mas ainda por aprovar (o funcionário confere e pode reclamar). */
    static async minhaFolhaCorreccao(funcionarioId: string) {
        return (await ServicoSalariosRH.recibosFuncionario(funcionarioId)).filter(r => r.estado === 'calculado');
    }

    private static async horario(f: Funcionario) {
        const horarios = await ServicoTempoRH.horarios();
        return horarios.find(h => h.id === f.horario_id) || horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
    }

    /**
     * Pedido de férias: o funcionário escolhe o início e os dias úteis; o fim e o regresso calculam-se aqui pelo
     * calendário laboral. Fica «planeado» e marcado como pedido do funcionário (chefe directo → RH).
     */
    static async pedirFerias(f: Funcionario, inicio: string, dias: number, observacoes: string, actor: ActorRH, destinatarios: string[] = []) {
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(inicio)) throw new Error('Indique o início das férias.');
        if (inicio < luandaTodayKey()) throw new Error('O início das férias tem de ser hoje ou depois.');
        const sim = await ServicoFeriasRH.simular({ funcionario_id: f.id, data_inicio: inicio, dias });
        const erro = sim.avisos.find(a => a.nivel === 'erro');
        if (erro) throw new Error(erro.texto);
        if (sim.resultado.diasUteis > sim.saldo) throw new Error(`Pede mais dias do que o seu saldo (${sim.saldo}).`);
        const r = sim.resultado;
        const id = crypto.randomUUID();
        const when = agora();
        await db.transaction([
            { sql: `INSERT INTO rh_plano_ferias (id, funcionario_id, ano, mes_previsto, data_inicio, data_fim, dias, data_regresso, dias_calendario, observacoes, estado, pedido_funcionario, criado_em, criado_por, criado_por_nome)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planeado', 1, ?, ?, ?)`,
                params: [id, f.id, Number(r.inicio.slice(0, 4)), Number(r.inicio.slice(5, 7)), r.inicio, r.ultimoDia, r.diasUteis, r.regresso, r.diasCalendario, observacoes.trim() || null, when, actor.id, actor.name], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Pedido de férias no portal: ${r.inicio} a ${r.ultimoDia} (${r.diasUteis} dias úteis, regresso ${r.regresso})`, { funcionarioId: f.id, planoId: id }, undefined, undefined, when),
            ...avisos(destinatarios, `Pedido de férias de ${f.nome}`, `${r.inicio.split('-').reverse().join('/')} a ${r.ultimoDia.split('-').reverse().join('/')} (${r.diasUteis} dias úteis). Regressa a ${r.regresso.split('-').reverse().join('/')}.`, when),
        ]);
        return r;
    }

    /** Cancelar um pedido de férias ainda por decidir (o próprio funcionário). */
    static async cancelarPedidoFerias(f: Funcionario, planoId: string, actor: ActorRH) {
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_plano_ferias SET estado = 'anulado', observacoes = 'Cancelado pelo funcionário', actualizado_em = ? WHERE id = ? AND funcionario_id = ? AND estado = 'planeado' AND pedido_funcionario = 1`,
                params: [when, planoId, f.id], expectChanges: 1 },
            auditoriaRH(actor, 'cancel', `Cancelou o pedido de férias ${planoId} no portal`, { funcionarioId: f.id, planoId }, undefined, undefined, when),
        ]);
    }

    /** Pedido de dispensa: ausência pendente que o RH (ou o chefe) aprova em «Dispensas e licenças». */
    static async pedirDispensa(f: Funcionario, input: { tipo_id: string; inicio: string; fim: string; horas: number; motivo: string }, actor: ActorRH, destinatarios: string[] = []) {
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
            ...avisos(destinatarios, `Pedido de dispensa de ${f.nome}`, `${input.inicio}${fim !== input.inicio ? ` a ${fim}` : ''}: ${input.motivo.trim().slice(0, 140)}`, when),
        ]);
    }
}
