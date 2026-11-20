// Relatório geral de um utilizador eliminado: tudo o que fez desde que foi registado (créditos que lançou, se estão
// pagos e em que percentagem, quanto arrecadou, com quantos clientes trabalhou e o histórico completo da auditoria).
// As operações não se apagam com o utilizador: continuam no sistema; este relatório fica como registo da saída.
import type { ReportDef } from './relatorios-pagamentos.ts';
import { activityLabel, entityLabel } from './atividade-utilizador.ts';

export type CreditoUtilizador = {
    id: string; clientId: string; clientName: string; creditNumber?: number | null; principalAmount: number; totalDue: number; currentBalance: number;
    installments: number; paidInstallments: number; status: string; createdAt: string; dueDate?: string | null; paidAt?: string | null;
};
export type PagamentoUtilizador = { id: string; creditId: string; clientName: string; amount: number; paymentDate: string; method: string; status?: string | null };
export type ClienteUtilizador = { id: string; name: string; nif?: string | null; createdAt?: string | null };
export type RegistoAuditoria = { id: string; timestamp: string; action: string; entity: string; details?: string | null; metadata?: string | null; userName?: string | null };

export type LevantamentoUtilizador = {
    utilizador: { id: string; name: string; email?: string | null; role?: string | null; roleLabel?: string; createdAt?: string | null };
    creditos: CreditoUtilizador[];
    pagamentosRecebidos: PagamentoUtilizador[];
    /** Pagamentos dos créditos que lançou (recebidos por qualquer utilizador): o que já se arrecadou da sua carteira. */
    pagamentosDosCreditos: PagamentoUtilizador[];
    clientes: ClienteUtilizador[];
    auditoria: RegistoAuditoria[];
};

const ACTIVOS = new Set(['active', 'overdue', 'defaulted', 'renegotiated']);
export const ESTADO_CREDITO: Record<string, string> = {
    active: 'Activo', paid: 'Pago', overdue: 'Em atraso', defaulted: 'Incumprimento', cancelled: 'Anulado', renegotiated: 'Renegociado',
    pending_approval: 'Por aprovar', rejected: 'Rejeitado',
};
const valido = (p: PagamentoUtilizador) => (p.status || 'confirmed') !== 'cancelled';

/** Percentagem paga de um crédito (o que já se pagou do total a pagar). */
export const percentagemPaga = (c: CreditoUtilizador) => {
    if (c.status === 'paid') return 100;
    const total = Number(c.totalDue) || 0;
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((total - (Number(c.currentBalance) || 0)) / total) * 1000) / 10));
};

/** Operações ainda em curso em nome do utilizador (avisadas antes de eliminar). */
export const operacoesActivas = (l: LevantamentoUtilizador) => {
    const activos = l.creditos.filter(c => ACTIVOS.has(c.status));
    const porAprovar = l.creditos.filter(c => c.status === 'pending_approval');
    return {
        creditosActivos: activos.length,
        porAprovar: porAprovar.length,
        emDivida: activos.reduce((s, c) => s + (Number(c.currentBalance) || 0), 0),
        total: activos.length + porAprovar.length,
    };
};

export const resumoUtilizador = (l: LevantamentoUtilizador) => {
    const pagos = l.pagamentosDosCreditos.filter(valido);
    const recebidos = l.pagamentosRecebidos.filter(valido);
    const clientes = new Set([...l.clientes.map(c => c.id), ...l.creditos.map(c => c.clientId)]);
    const concedido = l.creditos.filter(c => !['rejected', 'cancelled', 'pending_approval'].includes(c.status));
    return {
        creditos: l.creditos.length,
        pagosNaTotalidade: l.creditos.filter(c => c.status === 'paid').length,
        montanteConcedido: concedido.reduce((s, c) => s + (Number(c.principalAmount) || 0), 0),
        arrecadadoDaCarteira: pagos.reduce((s, p) => s + (Number(p.amount) || 0), 0),
        recebidoPeloUtilizador: recebidos.reduce((s, p) => s + (Number(p.amount) || 0), 0),
        emDivida: l.creditos.filter(c => ACTIVOS.has(c.status)).reduce((s, c) => s + (Number(c.currentBalance) || 0), 0),
        clientes: clientes.size,
        registosAuditoria: l.auditoria.length,
    };
};

const kz = (v: number) => `${(Number(v) || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
const data = (v?: string | null) => (v ? new Date(v).toLocaleDateString('pt-AO') : '—');
const dataHora = (v?: string | null) => (v ? new Date(v).toLocaleString('pt-AO') : '—');

export function relatorioUtilizadorEliminado(l: LevantamentoUtilizador, eliminacao: { porNome: string; em: string; motivo: string }): ReportDef {
    const r = resumoUtilizador(l);
    const pagoPorCredito = new Map<string, number>();
    for (const p of l.pagamentosDosCreditos.filter(valido)) pagoPorCredito.set(p.creditId, (pagoPorCredito.get(p.creditId) || 0) + (Number(p.amount) || 0));
    const u = l.utilizador;
    return {
        key: 'utilizador-eliminado', title: `Relatório geral de ${u.name}`, orientation: 'landscape', fileBase: `utilizador-eliminado-${u.name}`,
        subtitle: `Todas as operações desde o registo (${data(u.createdAt)}) até à eliminação (${dataHora(eliminacao.em)})`,
        tagline: 'UTILIZADOR ELIMINADO · AS OPERAÇÕES CONTINUAM NO SISTEMA',
        summary: [
            ['Utilizador', `${u.name}${u.email ? ` (${u.email})` : ''}`], ['Perfil', u.roleLabel || u.role || '—'],
            ['Registado em', data(u.createdAt)], ['Eliminado por', `${eliminacao.porNome} em ${dataHora(eliminacao.em)}`], ['Motivo', eliminacao.motivo],
            ['Créditos lançados', String(r.creditos)], ['Pagos na totalidade', String(r.pagosNaTotalidade)], ['Montante concedido', kz(r.montanteConcedido)],
            ['Arrecadado dos seus créditos', kz(r.arrecadadoDaCarteira)], ['Em dívida', kz(r.emDivida)],
            ['Recebido por este utilizador (pagamentos que registou)', kz(r.recebidoPeloUtilizador)], ['Clientes com quem trabalhou', String(r.clientes)],
            ['Registos de auditoria', String(r.registosAuditoria)],
        ],
        sections: [
            {
                heading: 'Créditos lançados', head: ['N.º', 'Cliente', 'Data', 'Montante', 'Total a pagar', 'Pago', 'Em dívida', '% pago', 'Prestações', 'Estado'],
                money: [3, 4, 5, 6], numeric: [7],
                rows: l.creditos.map(c => [c.creditNumber ?? '—', c.clientName, data(c.createdAt), Number(c.principalAmount) || 0, Number(c.totalDue) || 0,
                    pagoPorCredito.get(c.id) || 0, ['paid', 'cancelled', 'rejected'].includes(c.status) ? 0 : Number(c.currentBalance) || 0,
                    `${percentagemPaga(c)}%`, `${c.paidInstallments || 0}/${c.installments}`, ESTADO_CREDITO[c.status] || c.status]),
                emptyText: 'Não lançou créditos.',
            },
            {
                heading: 'Pagamentos registados por este utilizador', head: ['Data', 'Cliente', 'Valor', 'Método', 'Estado'], money: [2],
                rows: l.pagamentosRecebidos.map(p => [data(p.paymentDate), p.clientName, Number(p.amount) || 0, p.method, valido(p) ? 'Confirmado' : 'Anulado']),
                emptyText: 'Não registou pagamentos.',
            },
            {
                heading: 'Clientes que registou', head: ['Cliente', 'NIF', 'Registado em'],
                rows: l.clientes.map(c => [c.name, c.nif || '—', data(c.createdAt)]),
                emptyText: 'Não registou clientes.',
            },
            {
                heading: 'Histórico completo (auditoria)', head: ['Data e hora', 'Tipo de acção', 'Área', 'Descrição'], widths: { 0: 34, 1: 34, 2: 34 },
                rows: [...l.auditoria].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).map(a => [dataHora(a.timestamp), activityLabel(a as never), entityLabel(a.entity), a.details || '—']),
                emptyText: 'Sem registos de auditoria.',
            },
        ],
    };
}
