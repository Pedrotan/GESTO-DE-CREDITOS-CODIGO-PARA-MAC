// Plano anual de férias: o RH (ou o funcionário, no portal) escolhe o início e o número de dias úteis e o serviço
// calcula sempre o último dia e o regresso pelo calendário laboral (nunca confia nas datas que a interface envia).
// Fluxo: previsto (não desconta) ou pedido do portal → chefe directo → RH aprova (regista as férias no livro de ponto
// como ausência do tipo Férias) → em gozo → gozado. Também: recusa com motivo, anulação, interrupção (os dias não
// gozados voltam ao saldo), guia de férias numerada e subsídio de férias (processamento do tipo «férias»).
import { db } from '@/bibliotecas/bd';
import { avisosFerias, conflitoDepartamento, diasDoPlano, estadoEfectivo, saldoFerias, simularFerias, type AvisoFerias, type PlanoFerias, type ResultadoFerias } from '@/bibliotecas/rh/ferias';
import { diasUteis, HORARIO_OMISSAO, somarDias, type Feriado, type Horario } from '@/bibliotecas/rh/ponto';
import { valorNumerico } from '@/bibliotecas/rh/parametros-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { auditoriaRH, ServicoRH, type ActorRH, type Funcionario } from './ServicoRH';
import { ServicoTempoRH } from './ServicoTempoRH';
import { ServicoSalariosRH } from './ServicoSalariosRH';
import { avisos } from './ServicoPortalComunicacao';

export type PlanoFeriasRH = PlanoFerias & {
    pedido_funcionario?: number; observacoes: string | null; aprovado_por_nome: string | null; aprovado_em: string | null; criado_por_nome: string | null;
    data_regresso?: string | null; dias_calendario?: number | null; chefe_aprovado_por?: string | null; chefe_aprovado_por_nome?: string | null; chefe_aprovado_em?: string | null;
    recusado?: number; motivo_recusa?: string | null; interrompido_em?: string | null;
};
/** Estado mostrado ao utilizador (o guardado mais a origem e a decisão do chefe). */
export type EstadoVisivelFerias = 'previsto' | 'pendente_chefe' | 'pendente_rh' | 'aprovado' | 'em_gozo' | 'gozado' | 'recusado' | 'anulado' | 'interrompido';
export type SimulacaoFerias = { resultado: ResultadoFerias; avisos: AvisoFerias[]; saldo: number };

const TIPO_FERIAS = 'ausencia-FE';
const agora = () => new Date().toISOString();
const dataPt = (d: string) => d.split('-').reverse().join('/');
/** Aviso ao funcionário com id fixo: a tarefa diária pode correr várias vezes sem o repetir. */
const lembrete = (id: string, userId: string, titulo: string, mensagem: string, quando: string) => ({
    sql: `INSERT INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, ?, ?, 'info', 0, ?) ON CONFLICT(id) DO NOTHING`,
    params: [id, userId, titulo, mensagem, quando],
});

export function estadoVisivel(p: PlanoFeriasRH, hoje: string, temChefe = true): EstadoVisivelFerias {
    if (p.estado === 'anulado') return p.recusado ? 'recusado' : 'anulado';
    if (p.interrompido_em && estadoEfectivo(p, hoje) === 'gozado') return 'interrompido';
    if (p.estado === 'planeado') {
        if (!p.pedido_funcionario) return 'previsto';
        return p.chefe_aprovado_em || !temChefe ? 'pendente_rh' : 'pendente_chefe';
    }
    return estadoEfectivo(p, hoje) as EstadoVisivelFerias;
}

export class ServicoFeriasRH {
    static planos(ano?: number) {
        return ano
            ? db.all<PlanoFeriasRH>('SELECT * FROM rh_plano_ferias WHERE ano IN (?, ?) ORDER BY data_inicio', [ano, ano - 1]).catch(() => [] as PlanoFeriasRH[])
            : db.all<PlanoFeriasRH>('SELECT * FROM rh_plano_ferias ORDER BY data_inicio').catch(() => [] as PlanoFeriasRH[]);
    }

    /** Horário, folgas do calendário e funcionário (o mesmo cálculo no RH, no portal e na aprovação). */
    private static async contexto(funcionarioId: string): Promise<{ f: Funcionario | undefined; horario: Horario; feriados: Feriado[] }> {
        const [f, horarios, feriados] = await Promise.all([ServicoRH.funcionario(funcionarioId), ServicoTempoRH.horarios(), ServicoTempoRH.feriados()]);
        const horario = horarios.find(h => h.id === f?.horario_id) || horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
        return { f, horario, feriados };
    }

    /** Saldo do funcionário no ano (direito do contrato activo ou o parâmetro, mais os transitados). */
    static async saldo(f: Funcionario, ano: number, planos?: PlanoFeriasRH[]) {
        const hoje = luandaTodayKey();
        const [contratos, parametros, todos] = await Promise.all([ServicoRH.contratos(f.id), ServicoRH.parametros(), planos ? Promise.resolve(planos) : this.planos()]);
        const direito = contratos.find(c => c.estado === 'activo')?.dias_ferias ?? valorNumerico(parametros, 'dias_ferias_ano', hoje, 22);
        return saldoFerias(todos, f.id, ano, direito, hoje, direito, f.data_admissao, valorNumerico(parametros, 'ferias_transitados_max', hoje, 0));
    }

    /**
     * Simulação (sem gravar): início + N dias úteis → primeiro dia, último dia, regresso, feriados no período, saldo
     * depois e avisos (excede o saldo, sobreposições, colegas do departamento, divisão em períodos).
     */
    static async simular(input: { funcionario_id: string; data_inicio: string; dias: number; planoId?: string | null }): Promise<SimulacaoFerias> {
        const { f, horario, feriados } = await this.contexto(input.funcionario_id);
        if (!f) throw new Error('Funcionário não encontrado.');
        const hoje = luandaTodayKey();
        const [planos, ausencias, funcionarios, parametros] = await Promise.all([this.planos(), ServicoTempoRH.ausencias(), ServicoRH.funcionarios(), ServicoRH.parametros()]);
        const ano = Number(input.data_inicio.slice(0, 4));
        const s = await this.saldo(f, ano, planos);
        const resultado = simularFerias({ inicio: input.data_inicio, dias: input.dias, horario, feriados, saldo: s.saldo });
        const limitePct = valorNumerico(parametros, 'ferias_conflito_pct', hoje, 30);
        const conflito = conflitoDepartamento({ inicio: resultado.inicio, fim: resultado.ultimoDia, funcionarioId: f.id, departamentoId: f.departamento_id, planos, funcionarios, limitePct, hoje });
        return {
            resultado, saldo: s.saldo,
            avisos: avisosFerias({ resultado, funcionarioId: f.id, planoId: input.planoId, saldo: s.saldo, hoje, planos, ausencias, conflito, limitePct,
                periodoMinimo: valorNumerico(parametros, 'ferias_periodo_minimo', hoje, 15), direito: s.direito }),
        };
    }

    /**
     * Guarda um plano previsto (não desconta) ou altera um ainda não aprovado. Com início e dias úteis, o fim e o
     * regresso são recalculados aqui; sem datas, fica só o mês previsto.
     */
    static async guardar(input: { id?: string; funcionario_id: string; ano: number; mes_previsto: number | null; data_inicio?: string | null; dias?: number | null; data_fim?: string | null; observacoes?: string }, actor: ActorRH) {
        if (!input.funcionario_id || !Number.isInteger(input.ano)) throw new Error('Escolha o funcionário e o ano.');
        let inicio = input.data_inicio || null;
        let fim: string | null = null;
        let regresso: string | null = null;
        let corridos: number | null = null;
        let dias = 0;
        if (inicio && input.dias) {
            const sim = await this.simular({ funcionario_id: input.funcionario_id, data_inicio: inicio, dias: input.dias, planoId: input.id });
            const erro = sim.avisos.find(a => a.nivel === 'erro');
            if (erro) throw new Error(erro.texto);
            ({ inicio, ultimoDia: fim, regresso, diasCalendario: corridos, diasUteis: dias } = sim.resultado);
        } else if (inicio && input.data_fim) {
            // Compatibilidade: início e fim (versões anteriores da interface); os dias contam-se pelo calendário.
            if (input.data_fim < inicio) throw new Error('O fim tem de ser depois do início.');
            const { horario, feriados } = await this.contexto(input.funcionario_id);
            fim = input.data_fim;
            dias = diasDoPlano(inicio, fim, horario, feriados);
        } else if (inicio) throw new Error('Indique os dias úteis de férias.');
        if (inicio && Number(inicio.slice(0, 4)) !== input.ano) throw new Error('As férias têm de começar no ano do plano.');
        const mes = inicio ? Number(inicio.slice(5, 7)) : input.mes_previsto || null;
        const when = agora();
        if (input.id) {
            await db.transaction([
                { sql: `UPDATE rh_plano_ferias SET mes_previsto = ?, data_inicio = ?, data_fim = ?, dias = ?, data_regresso = ?, dias_calendario = ?, observacoes = ?, actualizado_em = ? WHERE id = ? AND estado = 'planeado'`,
                    params: [mes, inicio, fim, dias, regresso, corridos, input.observacoes?.trim() || null, when, input.id], expectChanges: 1 },
                auditoriaRH(actor, 'update', `Alterou o plano de férias ${input.ano} de ${input.funcionario_id}${inicio ? `: ${inicio} a ${fim} (${dias} dias úteis)` : ''}`, { planoId: input.id }, undefined, input, when),
            ]);
            return input.id;
        }
        const id = crypto.randomUUID();
        await db.transaction([
            { sql: `INSERT INTO rh_plano_ferias (id, funcionario_id, ano, mes_previsto, data_inicio, data_fim, dias, data_regresso, dias_calendario, estado, observacoes, criado_em, criado_por, criado_por_nome)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'planeado', ?, ?, ?, ?)`,
                params: [id, input.funcionario_id, input.ano, mes, inicio, fim, dias, regresso, corridos, input.observacoes?.trim() || null, when, actor.id, actor.name], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Planeou férias ${input.ano} para ${input.funcionario_id}${inicio ? `: ${inicio} a ${fim} (${dias} dias úteis)` : ''}`, { planoId: id }, undefined, input, when),
        ]);
        return id;
    }

    /**
     * Aprova o plano (com datas): confirma o saldo, regista as férias como ausência aprovada do tipo Férias (o livro
     * de ponto marca Fé nos dias úteis; fins-de-semana e feriados mantêm FS/FR) e avisa o funcionário.
     */
    static async aprovar(p: PlanoFeriasRH, actor: ActorRH) {
        if (p.estado !== 'planeado') throw new Error('Só se aprova um plano previsto ou pedido.');
        if (!p.data_inicio || !p.data_fim) throw new Error('Indique as datas exactas antes de aprovar.');
        const { f, horario, feriados } = await this.contexto(p.funcionario_id);
        if (!f) throw new Error('Funcionário não encontrado.');
        const planos = await this.planos();
        const s = await this.saldo(f, p.ano, planos);
        const dias = Number(p.dias) || diasDoPlano(p.data_inicio, p.data_fim, horario, feriados);
        if (dias > s.saldo) throw new Error(`Excede o saldo disponível (${s.saldo} dias): reduza os dias ou corrija o direito do contrato.`);
        const regresso = p.data_regresso || simularFerias({ inicio: p.data_inicio, dias, horario, feriados }).regresso;
        await ServicoTempoRH.registarAusencias({ funcionarios: [p.funcionario_id], tipo_id: TIPO_FERIAS, data_inicio: p.data_inicio, data_fim: p.data_fim, motivo: `Férias ${p.ano} (plano aprovado)` }, actor);
        const ausencia = (await ServicoTempoRH.ausencias()).find(a => a.funcionario_id === p.funcionario_id && a.tipo_id === TIPO_FERIAS && a.data_inicio === p.data_inicio && a.estado === 'aprovada');
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_plano_ferias SET estado = 'aprovado', ausencia_id = ?, data_regresso = ?, aprovado_por = ?, aprovado_por_nome = ?, aprovado_em = ?, actualizado_em = ? WHERE id = ? AND estado = 'planeado'`,
                params: [ausencia?.id || null, regresso, actor.id, actor.name, when, when, p.id], expectChanges: 1 },
            auditoriaRH(actor, 'approve', `Aprovou as férias de ${p.data_inicio} a ${p.data_fim}`, { planoId: p.id, funcionarioId: p.funcionario_id }, undefined, undefined, when),
            ...avisos(f.utilizador_id ? [f.utilizador_id] : [], 'Férias aprovadas',
                `As suas férias de ${dataPt(p.data_inicio)} a ${dataPt(p.data_fim)} foram aprovadas. Regressa a ${dataPt(regresso)}.`, when),
        ]);
    }

    /** Recusa um pedido (RH ou chefe directo): fica anulado com o motivo e o funcionário é avisado. */
    static async recusar(p: PlanoFeriasRH, motivo: string, actor: ActorRH, comoChefe = false) {
        if (p.estado !== 'planeado') throw new Error('Só se recusa um pedido ainda por aprovar.');
        if (!motivo?.trim() || motivo.trim().length < 5) throw new Error('Indique o motivo da recusa.');
        const f = await ServicoRH.funcionario(p.funcionario_id);
        const when = agora();
        await db.transaction([
            comoChefe
                ? { sql: `UPDATE rh_plano_ferias SET estado = 'anulado', recusado = 1, motivo_recusa = ?, chefe_aprovado_por = ?, chefe_aprovado_por_nome = ?, chefe_aprovado_em = ?, actualizado_em = ? WHERE id = ? AND estado = 'planeado' AND pedido_funcionario = 1`,
                    params: [motivo.trim(), actor.id, actor.name, when, when, p.id], expectChanges: 1 }
                : { sql: `UPDATE rh_plano_ferias SET estado = 'anulado', recusado = 1, motivo_recusa = ?, actualizado_em = ? WHERE id = ? AND estado = 'planeado'`,
                    params: [motivo.trim(), when, p.id], expectChanges: 1 },
            auditoriaRH(actor, 'cancel', `Recusou o pedido de férias ${p.id}${comoChefe ? ' (chefe directo)' : ''}: ${motivo.trim()}`, { planoId: p.id, funcionarioId: p.funcionario_id }, undefined, undefined, when),
            ...avisos(f?.utilizador_id ? [f.utilizador_id] : [], 'Pedido de férias recusado',
                `O seu pedido de férias${p.data_inicio ? ` de ${dataPt(p.data_inicio)} a ${dataPt(p.data_fim || p.data_inicio)}` : ''} foi recusado: ${motivo.trim()}`, when),
        ]);
    }

    /** O chefe directo dá parecer favorável ao pedido do portal; segue para o RH, que aprova. */
    static async aprovarComoChefe(p: PlanoFeriasRH, actor: ActorRH, destinatariosRH: string[] = []) {
        if (p.estado !== 'planeado' || !p.pedido_funcionario) throw new Error('Só os pedidos do portal por decidir passam pelo chefe.');
        if (p.chefe_aprovado_em) throw new Error('O chefe já deu o parecer a este pedido.');
        const f = await ServicoRH.funcionario(p.funcionario_id);
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_plano_ferias SET chefe_aprovado_por = ?, chefe_aprovado_por_nome = ?, chefe_aprovado_em = ?, actualizado_em = ? WHERE id = ? AND estado = 'planeado' AND pedido_funcionario = 1 AND chefe_aprovado_em IS NULL`,
                params: [actor.id, actor.name, when, when, p.id], expectChanges: 1 },
            auditoriaRH(actor, 'approve', `Chefe directo aprovou o pedido de férias ${p.id}`, { planoId: p.id, funcionarioId: p.funcionario_id }, undefined, undefined, when),
            ...avisos(destinatariosRH, `Férias de ${f?.nome || 'funcionário'}: aprovadas pelo chefe`,
                `${p.data_inicio ? `${dataPt(p.data_inicio)} a ${dataPt(p.data_fim || p.data_inicio)} (${p.dias} dias úteis)` : ''}. Falta a aprovação do RH em Férias e ausências.`, when),
        ]);
    }

    /** Anula um plano (e a ausência de férias no livro de ponto, se já estava aprovado). */
    static async anular(p: PlanoFeriasRH, motivo: string, actor: ActorRH) {
        if (!['planeado', 'aprovado'].includes(estadoEfectivo(p, luandaTodayKey()))) throw new Error('Férias em gozo ou gozadas não se anulam (interrompa-as).');
        if (!motivo?.trim() || motivo.trim().length < 5) throw new Error('Indique o motivo da anulação.');
        if (p.ausencia_id) {
            const ausencia = (await ServicoTempoRH.ausencias()).find(a => a.id === p.ausencia_id);
            if (ausencia && ausencia.estado !== 'anulada') await ServicoTempoRH.anularAusencia(ausencia, `Plano de férias anulado: ${motivo.trim()}`, actor);
        }
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_plano_ferias SET estado = 'anulado', observacoes = ?, actualizado_em = ? WHERE id = ? AND estado IN ('planeado', 'aprovado')`, params: [motivo.trim(), when, p.id], expectChanges: 1 },
            auditoriaRH(actor, 'cancel', `Anulou o plano de férias ${p.id}: ${motivo.trim()}`, { planoId: p.id }, undefined, undefined, when),
        ]);
    }

    /**
     * Interrompe férias aprovadas ou em gozo (ex.: regresso antecipado): o último dia passa a ser `ultimoDia`, os dias
     * úteis não gozados voltam ao saldo e a ausência no livro de ponto encurta. Fica na auditoria com o motivo.
     */
    static async interromper(p: PlanoFeriasRH, ultimoDia: string, motivo: string, actor: ActorRH) {
        const estado = estadoEfectivo(p, luandaTodayKey());
        if (!['aprovado', 'em_gozo'].includes(estado) || !p.data_inicio || !p.data_fim) throw new Error('Só se interrompem férias aprovadas ou em gozo.');
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(ultimoDia) || ultimoDia < p.data_inicio || ultimoDia >= p.data_fim) throw new Error('O novo último dia tem de estar dentro do período e antes do fim previsto.');
        if (!motivo?.trim() || motivo.trim().length < 5) throw new Error('Indique o motivo da interrupção.');
        const bloqueado = await ServicoTempoRH.mesBloqueado(ultimoDia);
        if (bloqueado) throw new Error(`O mês de ${ultimoDia.slice(0, 7)} já foi processado (${bloqueado}): reabra o processamento para alterar o ponto.`);
        const { horario, feriados } = await this.contexto(p.funcionario_id);
        const dias = diasUteis(p.data_inicio, ultimoDia, horario, feriados);
        const regresso = simularFerias({ inicio: p.data_inicio, dias: Math.max(1, dias), horario, feriados }).regresso;
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_plano_ferias SET data_fim = ?, dias = ?, data_regresso = ?, interrompido_em = ?, observacoes = ?, actualizado_em = ? WHERE id = ? AND estado IN ('aprovado', 'em_gozo')`,
                params: [ultimoDia, dias, regresso, when, motivo.trim(), when, p.id], expectChanges: 1 },
            ...(p.ausencia_id ? [{ sql: `UPDATE rh_ausencia SET data_fim = ?, dias = ?, actualizado_em = ? WHERE id = ? AND estado = 'aprovada'`, params: [ultimoDia, dias, when, p.ausencia_id] }] : []),
            auditoriaRH(actor, 'update', `Interrompeu as férias ${p.id}: último dia ${ultimoDia} (${Number(p.dias) - dias} dias voltam ao saldo). ${motivo.trim()}`,
                { planoId: p.id, funcionarioId: p.funcionario_id }, { data_fim: p.data_fim, dias: p.dias }, { data_fim: ultimoDia, dias }, when),
        ]);
    }

    /**
     * Depois de mudar um feriado ou ponte: recalcula o fim e o regresso dos planos ainda por aprovar (mantém os dias
     * úteis) e, nos aprovados que ainda não começaram, avisa o RH se o regresso mudaria (não altera o que foi aprovado).
     */
    static async recalcularPlanos(actor: ActorRH) {
        const hoje = luandaTodayKey();
        const [planos, horarios, feriados, funcionarios] = await Promise.all([this.planos(), ServicoTempoRH.horarios(), ServicoTempoRH.feriados(), ServicoRH.funcionarios()]);
        const when = agora();
        const statements: Array<{ sql: string; params: unknown[] }> = [];
        const mudancas: string[] = [];
        for (const p of planos) {
            if (!p.data_inicio || !p.data_fim || !Number(p.dias) || p.data_inicio < hoje || !['planeado', 'aprovado'].includes(p.estado)) continue;
            const f = funcionarios.find(x => x.id === p.funcionario_id);
            const horario = horarios.find(h => h.id === f?.horario_id) || horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
            const r = simularFerias({ inicio: p.data_inicio, dias: Number(p.dias), horario, feriados });
            if (r.ultimoDia === p.data_fim && (!p.data_regresso || r.regresso === p.data_regresso)) continue;
            const nome = f?.nome || p.funcionario_id;
            if (p.estado === 'planeado') {
                statements.push({ sql: `UPDATE rh_plano_ferias SET data_inicio = ?, data_fim = ?, data_regresso = ?, dias_calendario = ?, actualizado_em = ? WHERE id = ? AND estado = 'planeado'`,
                    params: [r.inicio, r.ultimoDia, r.regresso, r.diasCalendario, when, p.id] });
                mudancas.push(`${nome}: regresso passou para ${dataPt(r.regresso)}`);
            } else {
                mudancas.push(`${nome} (aprovado): com o calendário novo regressaria a ${dataPt(r.regresso)} em vez de ${dataPt(p.data_regresso || p.data_fim)}; reveja o plano`);
            }
        }
        if (!mudancas.length) return 0;
        const alerta = { sql: `INSERT INTO rh_alerta (id, tipo, referencia_id, funcionario_id, mensagem, data_alerta, destinatario_perfil, prioridade, accao, estado, criado_em)
                VALUES (?, 'ferias_calendario', NULL, NULL, ?, ?, 'rh', 2, '/rh/ferias', 'novo', ?) ON CONFLICT(id) DO UPDATE SET mensagem = excluded.mensagem, estado = 'novo', actualizado_em = excluded.criado_em`,
            params: [`ferias_calendario:${hoje}`, `O calendário mudou: ${mudancas.join(' · ')}`.slice(0, 900), hoje, when] };
        await db.transaction([...statements, alerta, auditoriaRH(actor, 'update', `Calendário alterado: ${mudancas.length} plano(s) de férias revisto(s)`, {}, undefined, { mudancas }, when)]);
        return mudancas.length;
    }

    /** Emite (ou reutiliza) a guia de férias numerada do plano aprovado. */
    static async emitirGuia(p: PlanoFeriasRH, dados: Record<string, unknown>, actor: ActorRH) {
        if (!['aprovado', 'em_gozo', 'gozado'].includes(p.estado)) throw new Error('A guia é emitida a partir de um plano aprovado.');
        if (p.guia_id) {
            const existente = (await ServicoTempoRH.documentosEmitidos(p.funcionario_id)).find(d => d.id === p.guia_id);
            if (existente) return { id: existente.id, numero: existente.numero, emitido_em: existente.emitido_em };
        }
        return ServicoTempoRH.emitirDocumento(p.funcionario_id, 'guia_ferias', 'GF', { ...dados, planoId: p.id }, actor, [
            { sql: 'UPDATE rh_plano_ferias SET guia_id = ? WHERE id = ? AND guia_id IS NULL', params: ['$documento', p.id], expectChanges: 1 },
        ]);
    }

    /** «Processar subsídio»: abre (ou reutiliza) o processamento do tipo férias só para este funcionário. */
    static async processarSubsidio(p: PlanoFeriasRH, nome: string, actor: ActorRH) {
        if (p.subsidio_processado) throw new Error('O subsídio de férias deste plano já foi processado.');
        if (p.processamento_id && (await ServicoSalariosRH.processamentos()).some(x => x.id === p.processamento_id)) return p.processamento_id;
        const inicio = p.data_inicio || `${p.ano}-${String(p.mes_previsto || 1).padStart(2, '0')}-01`;
        const id = await ServicoSalariosRH.abrir({ ano: Number(inicio.slice(0, 4)), mes: Number(inicio.slice(5, 7)), tipo: 'ferias', funcionarios: [p.funcionario_id], descricao: `Férias de ${nome}` }, actor);
        await db.transaction([
            { sql: 'UPDATE rh_plano_ferias SET processamento_id = ?, actualizado_em = ? WHERE id = ?', params: [id, agora(), p.id], expectChanges: 1 },
        ]);
        return id;
    }

    /**
     * Acerta os estados pelas datas (aprovado → em gozo → gozado), marca o subsídio como processado quando o
     * processamento de férias ligado ao plano foi aprovado, pago ou fechado, e lembra o funcionário 7 dias antes do
     * início e na véspera do regresso (um aviso de cada, com id fixo). Corre na tarefa diária (com hr_manage).
     */
    static async sincronizar(actor: ActorRH) {
        const hoje = luandaTodayKey();
        const [planos, processamentos, funcionarios] = await Promise.all([this.planos(), ServicoSalariosRH.processamentos(), ServicoRH.funcionarios()]);
        const when = agora();
        const statements: Array<{ sql: string; params: unknown[] }> = [];
        const lembretes: Array<{ sql: string; params: unknown[] }> = [];
        for (const p of planos) {
            const utilizador = funcionarios.find(x => x.id === p.funcionario_id)?.utilizador_id;
            if (utilizador && p.data_inicio && p.data_fim && ['aprovado', 'em_gozo'].includes(estadoEfectivo(p, hoje))) {
                const regresso = p.data_regresso || somarDias(p.data_fim, 1);
                if (hoje >= somarDias(p.data_inicio, -7) && hoje < p.data_inicio)
                    lembretes.push(lembrete(`ferias-inicio:${p.id}`, utilizador, 'As suas férias estão a chegar',
                        `As suas férias começam a ${dataPt(p.data_inicio)} e vão até ${dataPt(p.data_fim)}. Regressa a ${dataPt(regresso)}.`, when));
                if (hoje >= somarDias(regresso, -1) && hoje < regresso)
                    lembretes.push(lembrete(`ferias-regresso:${p.id}`, utilizador, 'Regresso ao trabalho amanhã', `Lembrete: regressa ao trabalho a ${dataPt(regresso)}.`, when));
            }
            const efectivo = estadoEfectivo(p, hoje);
            if (efectivo !== p.estado && ['em_gozo', 'gozado'].includes(efectivo))
                statements.push({ sql: `UPDATE rh_plano_ferias SET estado = ?, actualizado_em = ? WHERE id = ? AND estado IN ('aprovado', 'em_gozo')`, params: [efectivo, when, p.id] });
            if (!p.subsidio_processado && processamentos.some(x => x.id === p.processamento_id && ['aprovado', 'pago', 'fechado'].includes(x.estado)))
                statements.push({ sql: 'UPDATE rh_plano_ferias SET subsidio_processado = 1, actualizado_em = ? WHERE id = ? AND subsidio_processado = 0', params: [when, p.id] });
        }
        if (statements.length) await db.transaction([...statements, auditoriaRH(actor, 'update', `Tarefa diária: ${statements.length} actualização(ões) do plano de férias`, {}, undefined, undefined, when)]);
        if (lembretes.length) await db.transaction(lembretes);
        return statements.length;
    }
}
