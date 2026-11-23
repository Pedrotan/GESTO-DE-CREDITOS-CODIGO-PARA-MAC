// Monitorização de operações e detecção de fraude (fase 3).
// Lê os registos financeiros (créditos, pagamentos, reforços, anulações, alterações manuais da taxa), aplica as regras
// da versão activa do modelo e grava só os alertas novos (id determinístico, INSERT OR IGNORE). Nada aqui altera
// saldos, prestações ou lançamentos. A triagem segue o ciclo NEW → IN_REVIEW ⇄ INFORMATION_REQUESTED →
// SUBSTANTIATED / NOT_SUBSTANTIATED → CLOSED, com histórico imutável de cada passo.
import { db } from '@/bibliotecas/bd';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import {
    detectarAlertas, transicaoPermitida, ROTULO_ESTADO_ALERTA,
    type AlertaDetectado, type CategoriaAlerta, type ControloClienteMon, type EstadoAlerta, type Gravidade, type RegraId,
} from '@/bibliotecas/compliance/monitorizacao';
import { lerConfiguracao } from '@/bibliotecas/compliance/motor-risco';
import {
    SQL_ALERTA_ANALISAR, SQL_ALERTA_CONCLUIR, SQL_ALERTA_ENCERRAR, SQL_ALERTA_HISTORICO, SQL_ALERTA_PEDIR_INFO, SQL_ALERTA_REGISTAR,
} from '@/bibliotecas/compliance/permissoes-compliance';
import { podeCompliance, ServicoCompliance, type ActorCompliance } from './ServicoCompliance';
import { ServicoScreening, estadosPorCliente } from './ServicoScreening';

type Statement = { sql: string; params?: unknown[]; expectChanges?: number };

export type AlertaRegisto = {
    id: string; regra: RegraId; categoria: CategoriaAlerta; gravidade: Gravidade; client_id: string | null; operacao_tabela: string | null; operacao_id: string | null;
    titulo: string; descricao: string; evidencias: string; modelo_versao: number | null; data_operacao: string | null;
    detectado_em: string; detectado_por: string | null; detectado_por_nome: string | null; estado: EstadoAlerta;
    responsavel_id: string | null; responsavel_nome: string | null; actualizado_em: string | null;
    resultado: 'SUBSTANTIATED' | 'NOT_SUBSTANTIATED' | null; conclusao: string | null; concluido_por: string | null; concluido_por_nome: string | null; concluido_em: string | null;
    medidas: string | null; encerrado_por_nome: string | null; encerrado_em: string | null;
};
export type HistoricoAlerta = { id: string; alerta_id: string; estado_anterior: string | null; estado_novo: string; comentario: string | null; por_nome: string | null; em: string };
export type DadosAlertas = { alertas: AlertaRegisto[]; historico: HistoricoAlerta[] };
export const DADOS_ALERTAS_VAZIOS: DadosAlertas = { alertas: [], historico: [] };

const SQL_AUDITORIA = `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, ?, 'compliance', ?, ?, ?, ?)`;
const auditoria = (actor: ActorCompliance, action: string, details: string, metadata: Record<string, unknown>, when: string, antes?: unknown, depois?: unknown): Statement => ({
    sql: SQL_AUDITORIA, params: [crypto.randomUUID(), when, actor.id, actor.name, action, details,
        antes === undefined ? null : JSON.stringify(antes), depois === undefined ? null : JSON.stringify(depois), JSON.stringify(metadata)],
});
const historico = (alertaId: string, de: EstadoAlerta | null, para: EstadoAlerta, comentario: string | null, actor: ActorCompliance, when: string): Statement => ({
    sql: SQL_ALERTA_HISTORICO, params: [crypto.randomUUID(), alertaId, de, para, comentario, actor.id, actor.name, when],
});
const lista = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
const texto = (v: unknown) => { const s = String(v ?? '').trim(); return s ? s : null; };
const exigir = (actor: ActorCompliance, permissao: Parameters<typeof podeCompliance>[1], accao: string) => {
    if (!podeCompliance(actor, permissao)) throw new Error(`Sem permissão para ${accao}.`);
};
const minorParaKz = (v: unknown) => (Number(v) || 0) / 100;
const lerJsonSeguro = <T>(v: string | null | undefined, padrao: T): T => { try { return v ? JSON.parse(v) as T : padrao; } catch { return padrao; } };

let aAnalisar: Promise<unknown> | null = null;

export class ServicoMonitorizacao {
    static async carregar(): Promise<DadosAlertas> {
        const [alertas, historicoAlertas] = await Promise.all([
            lista(db.query<AlertaRegisto>('SELECT * FROM compliance_alerta ORDER BY detectado_em DESC')),
            lista(db.query<HistoricoAlerta>('SELECT * FROM compliance_alerta_historico ORDER BY em')),
        ]);
        return { alertas, historico: historicoAlertas };
    }

    /**
     * Analisa as operações e grava os alertas novos. Devolve quantos foram criados (por gravidade).
     * Só uma análise de cada vez neste computador.
     */
    static async analisar(actor: ActorCompliance): Promise<{ novos: AlertaDetectado[]; total: number }> {
        exigir(actor, 'compliance_manage', 'analisar operações');
        if (aAnalisar) return aAnalisar as Promise<{ novos: AlertaDetectado[]; total: number }>;
        aAnalisar = this.analisarAgora(actor).finally(() => { aAnalisar = null; });
        return aAnalisar as Promise<{ novos: AlertaDetectado[]; total: number }>;
    }

    private static async analisarAgora(actor: ActorCompliance) {
        const hoje = luandaTodayKey();
        const [base, scr, existentes, activacao] = await Promise.all([
            ServicoCompliance.carregar(), ServicoScreening.carregar(),
            lista(db.query<{ id: string }>('SELECT id FROM compliance_alerta')),
            db.get<{ appliedAt: string }>('SELECT appliedAt FROM schema_migrations WHERE version = 2026112401').catch(() => undefined),
        ]);
        const modelo = ServicoCompliance.modeloActivo(base.modelos);
        const p = lerConfiguracao(modelo?.configuracao).monitorizacao;
        // Margem para as janelas (fraccionamento, reforços, anulações) que começam antes do período analisado.
        const desde = new Date(Date.parse(`${hoje}T00:00:00Z`) - (p.diasRetroactivos + 120) * 86_400_000).toISOString();
        const [clientes, creditos, pagamentos, reforcos, taxas] = await Promise.all([
            lista(db.query<{ id: string; name: string; monthlyIncome: number | null }>('SELECT id, name, monthlyIncome FROM clients WHERE deletedAt IS NULL')),
            lista(db.query<{ id: string; clientId: string; clientName: string; principalAmount: number; status: string; createdAt: string; startDate: string | null; paidAt: string | null; requestedBy: string | null; approvedBy: string | null; interestRate: number | null; deletedAt: string | null }>(
                'SELECT id, clientId, clientName, principalAmount, status, createdAt, startDate, paidAt, requestedBy, approvedBy, interestRate, deletedAt FROM credits')),
            lista(db.query<{ id: string; creditId: string; amount: number; amountMinor: number | null; paymentDate: string; method: string; status: string; processedBy: string | null; registeredAt: string | null; validatedAt: string | null; cancelledAt: string | null; cancelledBy: string | null; cancelReason: string | null; deletedAt: string | null }>(
                "SELECT id, creditId, amount, amountMinor, paymentDate, method, status, processedBy, registeredAt, validatedAt, cancelledAt, cancelledBy, cancelReason, deletedAt FROM payments WHERE paymentDate >= ? OR cancelledAt >= ? OR status = 'pending'", [desde, desde])),
            lista(db.query<{ id: string; creditId: string; amountMinor: number; createdAt: string; createdBy: string | null }>(
                'SELECT id, creditId, amountMinor, createdAt, createdBy FROM credit_reinforcements WHERE createdAt >= ?', [desde])),
            lista(db.query<{ id: string; timestamp: string; userName: string | null; previousState: string | null; newState: string | null }>(
                "SELECT id, timestamp, userName, previousState, newState FROM audit_logs WHERE entity = 'credit' AND details LIKE 'Taxa do crédito % alterada manualmente%' AND timestamp >= ?", [desde])),
        ]);
        const estadoScr = estadosPorCliente(scr);
        const perfis = new Map(base.perfis.map(x => [x.client_id, x]));
        const controlos = new Map<string, ControloClienteMon>(clientes.map(c => [c.id, { kycVerificado: perfis.get(c.id)?.estado_kyc === 'verificado', screening: estadoScr(c.id).estado }]));
        const detectados = detectarAlertas({
            hoje, parametros: p, clientes, controlos, controlosDesde: activacao?.appliedAt || null,
            creditos: creditos.map(c => ({ ...c, principalAmount: Number(c.principalAmount) || 0 })),
            pagamentos: pagamentos.map(x => ({ ...x, amount: x.amountMinor != null ? minorParaKz(x.amountMinor) : Number(x.amount) || 0 })),
            reforcos: reforcos.map(r => ({ id: r.id, creditId: r.creditId, amount: minorParaKz(r.amountMinor), createdAt: r.createdAt, createdBy: r.createdBy })),
            taxasManuais: taxas.map(a => {
                const antes = lerJsonSeguro<{ termRate?: number | null }>(a.previousState, {});
                const depois = lerJsonSeguro<{ termRate?: number; creditId?: string }>(a.newState, {});
                return { auditId: a.id, creditId: depois.creditId || '', taxaTabela: antes.termRate ?? null, taxaUsada: Number(depois.termRate) || 0, em: a.timestamp, por: a.userName };
            }).filter(x => x.creditId),
        });
        const ja = new Set(existentes.map(x => x.id));
        const novos = detectados.filter(a => !ja.has(a.id));
        const when = new Date().toISOString();
        for (let i = 0; i < novos.length; i += 400) {
            const lote = novos.slice(i, i + 400);
            await db.transaction([
                ...lote.map((a): Statement => ({
                    sql: SQL_ALERTA_REGISTAR, params: [a.id, a.regra, a.categoria, a.gravidade, a.clientId, a.operacaoTabela, a.operacaoId, a.titulo, a.descricao,
                        JSON.stringify(a.evidencias), modelo?.versao ?? null, a.dataOperacao, when, actor.id, `Monitorização automática (${actor.name})`],
                })),
                auditoria(actor, 'create', `Monitorização de operações: ${lote.length} alerta(s) novo(s)`,
                    { alertas: lote.map(a => a.id), modeloVersao: modelo?.versao ?? null }, when),
            ]);
        }
        return { novos, total: detectados.length };
    }

    // ── Triagem ───────────────────────────────────────────────────────────────────
    static async mudarEstado(a: AlertaRegisto, para: EstadoAlerta, dados: { comentario?: string; conclusao?: string; medidas?: string }, actor: ActorCompliance) {
        if (!transicaoPermitida(a.estado, para)) throw new Error(`Não é possível passar de «${ROTULO_ESTADO_ALERTA[a.estado]}» para «${ROTULO_ESTADO_ALERTA[para]}».`);
        const when = new Date().toISOString();
        const comentario = texto(dados.comentario);
        let principal: Statement;
        if (para === 'IN_REVIEW') {
            exigir(actor, 'compliance_manage', 'analisar alertas');
            principal = { sql: SQL_ALERTA_ANALISAR, params: [actor.id, actor.name, actor.id, when, a.id], expectChanges: 1 };
        } else if (para === 'INFORMATION_REQUESTED') {
            exigir(actor, 'compliance_manage', 'pedir informação');
            if (!comentario || comentario.length < 10) throw new Error('Indique que informação foi pedida e a quem (pelo menos 10 caracteres).');
            principal = { sql: SQL_ALERTA_PEDIR_INFO, params: [actor.id, when, a.id], expectChanges: 1 };
        } else if (para === 'SUBSTANTIATED' || para === 'NOT_SUBSTANTIATED') {
            exigir(actor, 'compliance_approve', 'concluir alertas');
            const conclusao = texto(dados.conclusao);
            if (!conclusao || conclusao.length < 20) throw new Error('Fundamente a conclusão (pelo menos 20 caracteres): o que foi analisado e porquê.');
            principal = { sql: SQL_ALERTA_CONCLUIR, params: [para, para, conclusao, actor.id, actor.name, when, actor.id, when, a.id], expectChanges: 1 };
        } else {
            exigir(actor, 'compliance_approve', 'encerrar alertas');
            const medidas = texto(dados.medidas);
            if (a.estado === 'SUBSTANTIATED' && (!medidas || medidas.length < 10)) throw new Error('Indique as medidas tomadas (pelo menos 10 caracteres).');
            principal = { sql: SQL_ALERTA_ENCERRAR, params: [medidas || 'Sem medidas: alerta não confirmado.', actor.id, actor.name, when, actor.id, when, a.id], expectChanges: 1 };
        }
        const nota = para === 'SUBSTANTIATED' || para === 'NOT_SUBSTANTIATED' ? texto(dados.conclusao) : para === 'CLOSED' ? texto(dados.medidas) : comentario;
        await db.transaction([
            principal,
            historico(a.id, a.estado, para, nota, actor, when),
            auditoria(actor, para === 'SUBSTANTIATED' || para === 'NOT_SUBSTANTIATED' || para === 'CLOSED' ? 'approve' : 'update',
                `Alerta «${a.titulo}»: ${ROTULO_ESTADO_ALERTA[a.estado]} → ${ROTULO_ESTADO_ALERTA[para]}`, { alertaId: a.id, clientId: a.client_id }, when, { estado: a.estado }, { estado: para }),
        ]);
    }

    /** Comentário sem mudar o estado (fica no histórico). */
    static async comentar(a: AlertaRegisto, comentario: string, actor: ActorCompliance) {
        exigir(actor, 'compliance_manage', 'comentar alertas');
        const c = texto(comentario);
        if (!c) throw new Error('Escreva o comentário.');
        if (a.estado === 'CLOSED') throw new Error('O alerta está encerrado.');
        const when = new Date().toISOString();
        await db.transaction([historico(a.id, a.estado, a.estado, c, actor, when)]);
    }
}
