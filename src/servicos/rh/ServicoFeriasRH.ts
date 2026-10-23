// Plano anual de férias: mês previsto, datas exactas, aprovação (que regista as férias no livro de ponto como
// ausência do tipo Férias), guia de férias numerada e subsídio de férias (processamento do tipo «férias»).
import { db } from '@/bibliotecas/bd';
import { diasDoPlano, estadoEfectivo, type PlanoFerias } from '@/bibliotecas/rh/ferias';
import { HORARIO_OMISSAO } from '@/bibliotecas/rh/ponto';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { auditoriaRH, ServicoRH, type ActorRH } from './ServicoRH';
import { ServicoTempoRH } from './ServicoTempoRH';
import { ServicoSalariosRH } from './ServicoSalariosRH';

export type PlanoFeriasRH = PlanoFerias & { pedido_funcionario?: number; observacoes: string | null; aprovado_por_nome: string | null; aprovado_em: string | null; criado_por_nome: string | null };
const TIPO_FERIAS = 'ausencia-FE';
const agora = () => new Date().toISOString();

export class ServicoFeriasRH {
    static planos(ano?: number) {
        return ano
            ? db.all<PlanoFeriasRH>('SELECT * FROM rh_plano_ferias WHERE ano IN (?, ?) ORDER BY data_inicio', [ano, ano - 1]).catch(() => [] as PlanoFeriasRH[])
            : db.all<PlanoFeriasRH>('SELECT * FROM rh_plano_ferias ORDER BY data_inicio').catch(() => [] as PlanoFeriasRH[]);
    }

    private static async diasUteis(funcionarioId: string, inicio: string, fim: string) {
        const [f, horarios, feriados] = await Promise.all([ServicoRH.funcionario(funcionarioId), ServicoTempoRH.horarios(), ServicoTempoRH.feriados()]);
        const horario = horarios.find(h => h.id === f?.horario_id) || horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
        return diasDoPlano(inicio, fim, horario, feriados);
    }

    /** Planeia (mês previsto e, se já conhecidas, as datas) ou altera um plano ainda não aprovado. */
    static async guardar(input: { id?: string; funcionario_id: string; ano: number; mes_previsto: number | null; data_inicio?: string | null; data_fim?: string | null; observacoes?: string }, actor: ActorRH) {
        if (!input.funcionario_id || !Number.isInteger(input.ano)) throw new Error('Escolha o funcionário e o ano.');
        const inicio = input.data_inicio || null;
        const fim = input.data_fim || null;
        if ((inicio && !fim) || (!inicio && fim)) throw new Error('Indique o início e o fim, ou deixe ambos vazios (só o mês previsto).');
        if (inicio && fim && fim < inicio) throw new Error('O fim tem de ser depois do início.');
        if (inicio && Number(inicio.slice(0, 4)) !== input.ano) throw new Error('As férias têm de começar no ano do plano.');
        const dias = inicio && fim ? await this.diasUteis(input.funcionario_id, inicio, fim) : 0;
        const mes = input.mes_previsto || (inicio ? Number(inicio.slice(5, 7)) : null);
        const when = agora();
        if (input.id) {
            await db.transaction([
                { sql: `UPDATE rh_plano_ferias SET mes_previsto = ?, data_inicio = ?, data_fim = ?, dias = ?, observacoes = ?, actualizado_em = ? WHERE id = ? AND estado = 'planeado'`,
                    params: [mes, inicio, fim, dias, input.observacoes?.trim() || null, when, input.id], expectChanges: 1 },
                auditoriaRH(actor, 'update', `Alterou o plano de férias ${input.ano} de ${input.funcionario_id}`, { planoId: input.id }, undefined, input, when),
            ]);
            return input.id;
        }
        const id = crypto.randomUUID();
        await db.transaction([
            { sql: `INSERT INTO rh_plano_ferias (id, funcionario_id, ano, mes_previsto, data_inicio, data_fim, dias, estado, observacoes, criado_em, criado_por, criado_por_nome)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'planeado', ?, ?, ?, ?)`,
                params: [id, input.funcionario_id, input.ano, mes, inicio, fim, dias, input.observacoes?.trim() || null, when, actor.id, actor.name], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Planeou férias ${input.ano} para ${input.funcionario_id}`, { planoId: id }, undefined, input, when),
        ]);
        return id;
    }

    /** Aprova o plano (com datas): regista as férias como ausência aprovada do tipo Férias, para o livro de ponto marcar Fé. */
    static async aprovar(p: PlanoFeriasRH, actor: ActorRH) {
        if (p.estado !== 'planeado') throw new Error('Só se aprova um plano planeado.');
        if (!p.data_inicio || !p.data_fim) throw new Error('Indique as datas exactas antes de aprovar.');
        await ServicoTempoRH.registarAusencias({ funcionarios: [p.funcionario_id], tipo_id: TIPO_FERIAS, data_inicio: p.data_inicio, data_fim: p.data_fim, motivo: `Férias ${p.ano} (plano aprovado)` }, actor);
        const ausencia = (await ServicoTempoRH.ausencias()).find(a => a.funcionario_id === p.funcionario_id && a.tipo_id === TIPO_FERIAS && a.data_inicio === p.data_inicio && a.estado === 'aprovada');
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_plano_ferias SET estado = 'aprovado', ausencia_id = ?, aprovado_por = ?, aprovado_por_nome = ?, aprovado_em = ?, actualizado_em = ? WHERE id = ? AND estado = 'planeado'`,
                params: [ausencia?.id || null, actor.id, actor.name, when, when, p.id], expectChanges: 1 },
            auditoriaRH(actor, 'approve', `Aprovou as férias de ${p.data_inicio} a ${p.data_fim}`, { planoId: p.id, funcionarioId: p.funcionario_id }, undefined, undefined, when),
        ]);
    }

    /** Anula um plano (e a ausência de férias no livro de ponto, se já estava aprovado). */
    static async anular(p: PlanoFeriasRH, motivo: string, actor: ActorRH) {
        if (!['planeado', 'aprovado'].includes(estadoEfectivo(p, luandaTodayKey()))) throw new Error('Férias em gozo ou gozadas não se anulam.');
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
     * Acerta os estados pelas datas (aprovado → em gozo → gozado) e marca o subsídio como processado quando o
     * processamento de férias ligado ao plano foi aprovado, pago ou fechado. Corre na tarefa diária (com hr_manage).
     */
    static async sincronizar(actor: ActorRH) {
        const hoje = luandaTodayKey();
        const [planos, processamentos] = await Promise.all([this.planos(), ServicoSalariosRH.processamentos()]);
        const when = agora();
        const statements = [];
        for (const p of planos) {
            const efectivo = estadoEfectivo(p, hoje);
            if (efectivo !== p.estado && ['em_gozo', 'gozado'].includes(efectivo))
                statements.push({ sql: `UPDATE rh_plano_ferias SET estado = ?, actualizado_em = ? WHERE id = ? AND estado IN ('aprovado', 'em_gozo')`, params: [efectivo, when, p.id] });
            if (!p.subsidio_processado && processamentos.some(x => x.id === p.processamento_id && ['aprovado', 'pago', 'fechado'].includes(x.estado)))
                statements.push({ sql: 'UPDATE rh_plano_ferias SET subsidio_processado = 1, actualizado_em = ? WHERE id = ? AND subsidio_processado = 0', params: [when, p.id] });
        }
        if (statements.length) await db.transaction([...statements, auditoriaRH(actor, 'update', `Tarefa diária: ${statements.length} actualização(ões) do plano de férias`, {}, undefined, undefined, when)]);
        return statements.length;
    }
}
