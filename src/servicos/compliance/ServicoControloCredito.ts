// Controlo do crédito pelo Compliance (fase 5): avaliação do cliente antes de conceder, desembolsar ou reforçar,
// autorizações de Compliance e levantamento de medidas de bloqueio. A mesma regra é imposta no processo principal
// (Electron) na transacção que concede, aprova ou reforça o crédito.
import { db } from '@/bibliotecas/bd';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { isPrimaryOwner } from '@/bibliotecas/conta-principal';
import {
    avaliarControloCredito, mensagemControlo, ROTULO_DECISAO_CONTROLO, type LeitorBd, type ResultadoControlo,
} from '@/bibliotecas/compliance/controlo-credito';
import { CONTROLOS, type CodigoControlo } from '@/bibliotecas/compliance/politica-bloqueio';
import { SQL_AUTORIZACAO_REGISTAR, SQL_LEVANTAMENTO_REGISTAR } from '@/bibliotecas/compliance/permissoes-compliance';
import { podeCompliance, type ActorCompliance } from './ServicoCompliance';

type Statement = { sql: string; params: unknown[]; expectChanges?: number };

export type AutorizacaoRegisto = {
    id: string; client_id: string; decisao: 'autorizado' | 'recusado'; montante_maximo_minor: number; valido_ate: string; motivos: string; fundamento: string;
    autorizado_em: string; autorizado_por: string | null; autorizado_por_nome: string | null;
};
export type LevantamentoRegisto = { id: string; decisao_id: string; client_id: string; fundamento: string; levantado_em: string; levantado_por_nome: string | null };

const SQL_AUDITORIA = `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, ?, 'compliance', ?, ?, ?, ?)`;
const auditoria = (actor: { id: string; name: string }, action: string, details: string, metadata: Record<string, unknown>, when = new Date().toISOString()): Statement => ({
    sql: SQL_AUDITORIA, params: [crypto.randomUUID(), when, actor.id, actor.name, action, details, null, null, JSON.stringify(metadata)],
});
const leitor: LeitorBd = { todos: (sql, params) => db.query(sql, params as unknown[]), um: (sql, params) => db.get(sql, params as unknown[]) };
const texto = (v: unknown) => { const s = String(v ?? '').trim(); return s ? s : null; };
const exigirPermissao = (actor: ActorCompliance, accao: string) => { if (!podeCompliance(actor, 'compliance_approve')) throw new Error(`Sem permissão para ${accao}.`); };

export class ServicoControloCredito {
    /** Resultado do controlo para um cliente e montante (Kz). */
    static avaliar(clientId: string, montante: number): Promise<ResultadoControlo> {
        return avaliarControloCredito(leitor, clientId, montante, luandaTodayKey());
    }

    /**
     * Antes de conceder, aprovar ou reforçar: lança erro se a política (modo «bloqueio») impedir; em modo «aviso»
     * devolve a instrução de auditoria a juntar à transacção da operação (fica registado que avançou com avisos).
     */
    static async exigir(clientId: string, montante: number, operacao: string, actor: { id: string; name: string } | null, creditoId?: string): Promise<{ resultado: ResultadoControlo; auditoria: Statement[] }> {
        const resultado = await this.avaliar(clientId, montante);
        if (resultado.impede) throw new Error(mensagemControlo(resultado, operacao));
        const avisos = resultado.motivos.filter(m => !m.autorizado);
        const registo = resultado.modo !== 'desligado' && (avisos.length || resultado.autorizacao) && actor ? [auditoria(actor, 'update',
            resultado.decisao === 'permitido'
                ? `Compliance: ${operacao} com autorização de Compliance${creditoId ? ` (crédito ${creditoId})` : ''}`
                : `Compliance (só aviso): ${operacao} com «${ROTULO_DECISAO_CONTROLO[resultado.decisao]}»${creditoId ? ` (crédito ${creditoId})` : ''} — ${avisos.map(m => m.texto).join('; ')}`,
            { clientId, creditoId, montante, decisao: resultado.decisao, modo: resultado.modo, motivos: resultado.motivos.map(m => m.codigo), autorizacaoId: resultado.autorizacao?.id ?? null })] : [];
        return { resultado, auditoria: registo };
    }

    static async autorizacoes(clientId: string) {
        return db.query<AutorizacaoRegisto>('SELECT * FROM compliance_autorizacao WHERE client_id = ? ORDER BY autorizado_em DESC', [clientId]).catch(() => [] as AutorizacaoRegisto[]);
    }
    static async levantamentos(clientId: string) {
        return db.query<LevantamentoRegisto>('SELECT * FROM compliance_bloqueio_levantamento WHERE client_id = ? ORDER BY levantado_em DESC', [clientId]).catch(() => [] as LevantamentoRegisto[]);
    }

    /** Autoriza (ou recusa) operações de crédito de um cliente até um montante e uma data, cobrindo os motivos indicados. */
    static async autorizar(input: {
        clienteId: string; nomeCliente: string; decisao: 'autorizado' | 'recusado'; montanteMaximo: number; validoAte: string; motivos: CodigoControlo[]; fundamento: string;
    }, actor: ActorCompliance) {
        exigirPermissao(actor, 'autorizar operações de crédito');
        const fundamento = texto(input.fundamento);
        if (!fundamento || fundamento.length < 20) throw new Error('Fundamente a decisão (pelo menos 20 caracteres): o que foi analisado e em que condições.');
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.validoAte) || input.validoAte < luandaTodayKey()) throw new Error('Indique até quando é válida (data de hoje ou futura).');
        const motivos = input.motivos.filter(m => m in CONTROLOS && !CONTROLOS[m].fixo);
        if (input.decisao === 'autorizado') {
            if (!(input.montanteMaximo > 0)) throw new Error('Indique o montante máximo autorizado.');
            if (!motivos.length) throw new Error('Não há motivos de revisão a autorizar para este cliente.');
        }
        const id = crypto.randomUUID();
        const when = new Date().toISOString();
        await db.transaction([
            { sql: SQL_AUTORIZACAO_REGISTAR, params: [id, input.clienteId, input.decisao, Math.round((Number(input.montanteMaximo) || 0) * 100), input.validoAte,
                JSON.stringify(motivos), fundamento, when, actor.id, actor.name], expectChanges: 1 },
            auditoria(actor, 'approve', `Compliance ${input.decisao === 'autorizado' ? 'autorizou' : 'recusou'} operações de crédito de ${input.nomeCliente}${input.decisao === 'autorizado' ? ` até ${input.montanteMaximo.toLocaleString('pt-PT')} Kz` : ''} (válido até ${input.validoAte.split('-').reverse().join('/')})`,
                { clientId: input.clienteId, autorizacaoId: id, decisao: input.decisao, motivos }, when),
        ]);
        return id;
    }

    /** Levanta uma medida de bloqueio decidida numa investigação (por pessoa diferente de quem a decidiu). */
    static async levantarBloqueio(decisao: { id: string; client_id: string; decidido_por: string | null }, nomeCliente: string, fundamento: string, actor: ActorCompliance) {
        exigirPermissao(actor, 'levantar bloqueios');
        const f = texto(fundamento);
        if (!f || f.length < 20) throw new Error('Fundamente o levantamento (pelo menos 20 caracteres).');
        if (decisao.decidido_por === actor.id && actor.role !== 'super_admin' && !isPrimaryOwner(actor)) throw new Error('Quem decidiu o bloqueio não o pode levantar: tem de ser outro responsável.');
        const when = new Date().toISOString();
        await db.transaction([
            { sql: SQL_LEVANTAMENTO_REGISTAR, params: [crypto.randomUUID(), decisao.id, decisao.client_id, f, when, actor.id, actor.name], expectChanges: 1 },
            auditoria(actor, 'approve', `Levantou a medida de bloqueio de ${nomeCliente}`, { clientId: decisao.client_id, decisaoId: decisao.id, fundamento: f }, when),
        ]);
    }
}
