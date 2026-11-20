// Banco de horas (F3.11). Horas extra podem ir para o banco em vez de serem pagas (por funcionário, no fecho do mês,
// ou dia a dia); saídas antecipadas e folgas compensatórias descontam. O saldo usa as horas mais antigas primeiro e
// as que passam do prazo de validade expiram. Puro: usado pela grelha, pelo portal, pelo relatório e pelos salários.
import type { DiaPonto } from './ponto-calculo.ts';

export type TipoMovimentoBanco = 'extra' | 'saida_antecipada' | 'folga' | 'ajuste';
export type MovimentoBanco = {
    id: string; funcionario_id: string; data: string; minutos: number; tipo: TipoMovimentoBanco;
    tipo_extra?: string | null; origem?: string | null; descricao?: string | null; anulado?: number | null;
    criado_por_nome?: string | null; criado_em?: string;
};
export type SaldoBanco = {
    saldo: number; creditos: number; debitos: number; expirados: number;
    /** Minutos que expiram nos próximos 30 dias, se não forem compensados. */
    a_expirar_30d: number;
};

export const ROTULO_MOVIMENTO: Record<TipoMovimentoBanco, string> = {
    extra: 'Horas extra para o banco', saida_antecipada: 'Saída antecipada', folga: 'Folga compensatória', ajuste: 'Ajuste',
};

/** Data limite de um crédito (fim do prazo de validade). */
export const fimValidade = (data: string, meses: number) => {
    const d = new Date(`${data}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + meses);
    return d.toISOString().slice(0, 10);
};

/** Saldo de um funcionário numa data, com expiração FIFO dos créditos (validade 0 = não expira). */
export function saldoBanco(movimentos: MovimentoBanco[], ate: string, validadeMeses: number): SaldoBanco {
    const validos = movimentos.filter(m => !m.anulado && m.data <= ate).sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
    const creditos: Array<{ data: string; restante: number }> = [];
    let divida = 0;
    let expirados = 0;
    let totalCreditos = 0;
    let totalDebitos = 0;
    const expirar = (data: string) => {
        if (validadeMeses <= 0) return;
        for (const c of creditos) {
            if (c.restante > 0 && fimValidade(c.data, validadeMeses) < data) { expirados += c.restante; c.restante = 0; }
        }
    };
    for (const m of validos) {
        expirar(m.data);
        if (m.minutos > 0) {
            totalCreditos += m.minutos;
            // Um crédito novo paga primeiro o que estava em dívida.
            const paga = Math.min(divida, m.minutos);
            divida -= paga;
            creditos.push({ data: m.data, restante: m.minutos - paga });
        } else if (m.minutos < 0) {
            let falta = -m.minutos;
            totalDebitos += falta;
            for (const c of creditos) {
                if (!falta) break;
                const usa = Math.min(c.restante, falta);
                c.restante -= usa;
                falta -= usa;
            }
            divida += falta;
        }
    }
    expirar(ate);
    const disponivel = creditos.reduce((s, c) => s + c.restante, 0);
    const limite30 = new Date(Date.parse(`${ate}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
    const aExpirar = validadeMeses > 0 ? creditos.filter(c => c.restante > 0 && fimValidade(c.data, validadeMeses) <= limite30).reduce((s, c) => s + c.restante, 0) : 0;
    return { saldo: disponivel - divida, creditos: totalCreditos, debitos: totalDebitos, expirados, a_expirar_30d: aExpirar };
}

export const idMovimentoExtra = (funcionarioId: string, data: string) => `banco:extra:${funcionarioId}:${data}`;
export const idMovimentoSaida = (funcionarioId: string, data: string) => `banco:saida:${funcionarioId}:${data}`;
export const idMovimentoFolga = (funcionarioId: string, data: string) => `banco:folga:${funcionarioId}:${data}`;

/**
 * Movimentos automáticos do fecho do mês para um funcionário com banco de horas: cada dia com horas extra vira
 * crédito e cada saída antecipada vira débito. Dias que já têm movimento (lançados à mão) não se repetem.
 */
export function movimentosDoFecho(funcionarioId: string, dias: DiaPonto[], existentes: Set<string>): MovimentoBanco[] {
    const novos: MovimentoBanco[] = [];
    for (const d of dias) {
        if (d.minutos_extra > 0 && !existentes.has(idMovimentoExtra(funcionarioId, d.data)))
            novos.push({ id: idMovimentoExtra(funcionarioId, d.data), funcionario_id: funcionarioId, data: d.data, minutos: d.minutos_extra, tipo: 'extra', tipo_extra: d.tipo_extra, origem: 'fecho' });
        if (d.minutos_saida_antecipada > 0 && !existentes.has(idMovimentoSaida(funcionarioId, d.data)))
            novos.push({ id: idMovimentoSaida(funcionarioId, d.data), funcionario_id: funcionarioId, data: d.data, minutos: -d.minutos_saida_antecipada, tipo: 'saida_antecipada', origem: 'fecho' });
    }
    return novos;
}

/** Minutos extra de um mês que foram para o banco, por tipo (não se pagam no salário). */
export function extraNoBanco(movimentos: MovimentoBanco[], funcionarioId: string, mes: string) {
    const r = { util: 0, descanso: 0, feriado: 0 };
    for (const m of movimentos) {
        if (m.anulado || m.tipo !== 'extra' || m.funcionario_id !== funcionarioId || !m.data.startsWith(mes) || m.minutos <= 0) continue;
        const tipo = m.tipo_extra === 'descanso' || m.tipo_extra === 'feriado' ? m.tipo_extra : 'util';
        r[tipo] += m.minutos;
    }
    return r;
}
