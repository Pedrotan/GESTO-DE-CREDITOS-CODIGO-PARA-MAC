// Monitorização de operações e detecção de fraude (especificação, secções 3.4 a 3.6).
//
// O monitor LÊ os registos financeiros já gravados (créditos, pagamentos, reforços, anulações e a auditoria da taxa)
// e devolve alertas com identificador determinístico (regra + operação): repetir a análise, noutro momento ou noutro
// computador, nunca duplica alertas, e nada aqui altera saldos ou lançamentos. Cada alerta guarda a ligação ao
// registo original e as evidências usadas. Um alerta não prova nada: é triado e concluído por uma pessoa.
// A liquidação antecipada, por si só, nunca gera alerta.

export type Gravidade = 'baixa' | 'media' | 'alta';
export type CategoriaAlerta = 'operacao' | 'fraude' | 'controlo';
export type EstadoAlerta = 'NEW' | 'IN_REVIEW' | 'INFORMATION_REQUESTED' | 'SUBSTANTIATED' | 'NOT_SUBSTANTIATED' | 'CLOSED';

export const ROTULO_ESTADO_ALERTA: Record<EstadoAlerta, string> = {
    NEW: 'Novo', IN_REVIEW: 'Em análise', INFORMATION_REQUESTED: 'Informação pedida', SUBSTANTIATED: 'Fundamentado',
    NOT_SUBSTANTIATED: 'Não confirmado', CLOSED: 'Encerrado',
};
export const ROTULO_GRAVIDADE: Record<Gravidade, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
export const ROTULO_CATEGORIA_ALERTA: Record<CategoriaAlerta, string> = { operacao: 'Operação atípica', fraude: 'Possível fraude', controlo: 'Falha de controlo' };

/** Transições permitidas do ciclo de vida do alerta (as conclusões não se alteram depois). */
export const TRANSICOES: Record<EstadoAlerta, EstadoAlerta[]> = {
    NEW: ['IN_REVIEW'],
    IN_REVIEW: ['INFORMATION_REQUESTED', 'SUBSTANTIATED', 'NOT_SUBSTANTIATED'],
    INFORMATION_REQUESTED: ['IN_REVIEW', 'SUBSTANTIATED', 'NOT_SUBSTANTIATED'],
    SUBSTANTIATED: ['CLOSED'],
    NOT_SUBSTANTIATED: ['CLOSED'],
    CLOSED: [],
};
export const transicaoPermitida = (de: EstadoAlerta, para: EstadoAlerta) => TRANSICOES[de].includes(para);
export const ESTADOS_ABERTOS: EstadoAlerta[] = ['NEW', 'IN_REVIEW', 'INFORMATION_REQUESTED'];

export type RegraId =
    | 'desembolso_rendimento' | 'desembolso_sem_rendimento' | 'numerario_elevado' | 'fraccionamento' | 'pagamentos_rendimento'
    | 'liquidacao_rapida_numerario' | 'reforcos_sucessivos' | 'anulacoes_utilizador' | 'anulacao_propria' | 'pagamento_sem_confirmacao'
    | 'taxa_manual' | 'credito_duplicado' | 'desembolso_sem_controlos';

export const REGRAS_MONITORIZACAO: Record<RegraId, { titulo: string; categoria: CategoriaAlerta; descricao: string }> = {
    desembolso_rendimento: { titulo: 'Crédito desproporcionado face ao rendimento', categoria: 'operacao', descricao: 'Montante concedido acima de N vezes o rendimento mensal declarado.' },
    desembolso_sem_rendimento: { titulo: 'Crédito sem rendimento declarado', categoria: 'operacao', descricao: 'Crédito acima do limite sem rendimento mensal no cadastro.' },
    numerario_elevado: { titulo: 'Pagamento em numerário de valor elevado', categoria: 'operacao', descricao: 'Pagamento em numerário igual ou superior ao limite configurado.' },
    fraccionamento: { titulo: 'Possível fraccionamento de pagamentos', categoria: 'operacao', descricao: 'Vários pagamentos em numerário, cada um abaixo do limite, que somados o ultrapassam num curto período.' },
    pagamentos_rendimento: { titulo: 'Pagamentos incompatíveis com o rendimento', categoria: 'operacao', descricao: 'Pagamentos num período acima de N vezes o rendimento mensal declarado (pode ser liquidação antecipada legítima: confirmar a origem dos fundos).' },
    liquidacao_rapida_numerario: { titulo: 'Liquidação rápida em numerário', categoria: 'operacao', descricao: 'Crédito liquidado pouco depois do desembolso com pagamentos elevados em numerário (a liquidação antecipada em si não é suspeita).' },
    reforcos_sucessivos: { titulo: 'Reforços sucessivos', categoria: 'operacao', descricao: 'Vários reforços de capital no mesmo crédito num curto período.' },
    anulacoes_utilizador: { titulo: 'Muitas anulações de pagamentos pelo mesmo utilizador', categoria: 'fraude', descricao: 'Número de pagamentos anulados por um utilizador num período acima do limite.' },
    anulacao_propria: { titulo: 'Pagamento anulado por quem o registou', categoria: 'fraude', descricao: 'O mesmo utilizador registou e anulou o pagamento.' },
    pagamento_sem_confirmacao: { titulo: 'Pagamento registado sem confirmação financeira', categoria: 'fraude', descricao: 'Transferência ou depósito pendente de validação há mais dias do que o limite.' },
    taxa_manual: { titulo: 'Taxa do crédito alterada manualmente', categoria: 'fraude', descricao: 'A taxa usada difere da tabela do produto (registada na auditoria).' },
    credito_duplicado: { titulo: 'Possível crédito duplicado', categoria: 'fraude', descricao: 'Dois créditos do mesmo cliente com o mesmo montante em poucos dias.' },
    desembolso_sem_controlos: { titulo: 'Crédito concedido sem os controlos de Compliance', categoria: 'controlo', descricao: 'Crédito activo de cliente com identidade não verificada ou com correspondência em listas por decidir/confirmada.' },
};

export type ParametrosMonitorizacao = {
    /** Só se analisam operações dos últimos N dias (evita inundar com o histórico). */
    diasRetroactivos: number;
    desembolsoMultiploRendimento: number;
    semRendimentoLimiteKz: number;
    numerarioElevadoKz: number;
    fraccionamento: { dias: number; minPagamentos: number; totalKz: number };
    pagamentosRendimento: { dias: number; multiplo: number };
    liquidacaoRapidaDias: number;
    reforcos: { dias: number; minimo: number };
    anulacoes: { dias: number; minimo: number };
    pendenteDias: number;
    reducaoTaxaPct: number;
    duplicadoDias: number;
};

/** Valores iniciais (indicativos, a validar pela avaliação de risco da empresa). */
export const PARAMETROS_MONITORIZACAO_INICIAIS: ParametrosMonitorizacao = {
    diasRetroactivos: 90,
    desembolsoMultiploRendimento: 12,
    semRendimentoLimiteKz: 1_000_000,
    numerarioElevadoKz: 5_000_000,
    fraccionamento: { dias: 7, minPagamentos: 3, totalKz: 5_000_000 },
    pagamentosRendimento: { dias: 30, multiplo: 3 },
    liquidacaoRapidaDias: 30,
    reforcos: { dias: 90, minimo: 2 },
    anulacoes: { dias: 30, minimo: 3 },
    pendenteDias: 3,
    reducaoTaxaPct: 20,
    duplicadoDias: 2,
};

export function lerParametrosMonitorizacao(v: Partial<ParametrosMonitorizacao> | null | undefined): ParametrosMonitorizacao {
    const b = PARAMETROS_MONITORIZACAO_INICIAIS;
    const x = v || {};
    return {
        ...b, ...x,
        fraccionamento: { ...b.fraccionamento, ...(x.fraccionamento || {}) },
        pagamentosRendimento: { ...b.pagamentosRendimento, ...(x.pagamentosRendimento || {}) },
        reforcos: { ...b.reforcos, ...(x.reforcos || {}) },
        anulacoes: { ...b.anulacoes, ...(x.anulacoes || {}) },
    };
}

export function validarParametrosMonitorizacao(p: ParametrosMonitorizacao): string[] {
    const erros: string[] = [];
    const pos = (v: number) => Number.isFinite(v) && v > 0;
    if (![p.diasRetroactivos, p.desembolsoMultiploRendimento, p.semRendimentoLimiteKz, p.numerarioElevadoKz, p.fraccionamento.dias, p.fraccionamento.minPagamentos,
        p.fraccionamento.totalKz, p.pagamentosRendimento.dias, p.pagamentosRendimento.multiplo, p.liquidacaoRapidaDias, p.reforcos.dias, p.reforcos.minimo,
        p.anulacoes.dias, p.anulacoes.minimo, p.pendenteDias, p.reducaoTaxaPct, p.duplicadoDias].every(pos)) erros.push('Os parâmetros de monitorização têm de ser números positivos.');
    if (p.fraccionamento.minPagamentos < 2) erros.push('O fraccionamento precisa de pelo menos 2 pagamentos.');
    if (p.diasRetroactivos > 730) erros.push('A análise retroactiva está limitada a 730 dias.');
    return erros;
}

// ── Dados de entrada (lidos da base; valores em Kz) ─────────────────────────────
export type ClienteMon = { id: string; name: string; monthlyIncome?: number | null };
export type CreditoMon = {
    id: string; clientId: string; clientName?: string | null; principalAmount: number; status: string; createdAt: string; startDate?: string | null;
    paidAt?: string | null; requestedBy?: string | null; approvedBy?: string | null; interestRate?: number | null; deletedAt?: string | null;
};
export type PagamentoMon = {
    id: string; creditId: string; amount: number; paymentDate: string; method: string; status: string; processedBy?: string | null; registeredAt?: string | null;
    validatedAt?: string | null; cancelledAt?: string | null; cancelledBy?: string | null; cancelReason?: string | null; deletedAt?: string | null;
};
export type ReforcoMon = { id: string; creditId: string; amount: number; createdAt: string; createdBy?: string | null };
export type TaxaManualMon = { auditId: string; creditId: string; taxaTabela: number | null; taxaUsada: number; em: string; por: string | null };
export type ControloClienteMon = { kycVerificado: boolean; screening: string };

export type AlertaDetectado = {
    id: string; regra: RegraId; categoria: CategoriaAlerta; gravidade: Gravidade; clientId: string | null; operacaoTabela: string | null; operacaoId: string | null;
    titulo: string; descricao: string; evidencias: Record<string, unknown>; dataOperacao: string;
};

const DIA = 86_400_000;
const t = (d: string | null | undefined) => (d ? Date.parse(d.length === 10 ? `${d}T12:00:00Z` : d) : NaN);
const kz = (v: number) => `${Math.round(v).toLocaleString('pt-PT')} Kz`;
const dia = (d: string) => d.slice(0, 10).split('-').reverse().join('/');
const NUMERARIO = new Set(['cash']);
const COM_VALIDACAO = new Set(['transfer', 'deposit']);
const CONCEDIDO = new Set(['active', 'overdue', 'paid', 'defaulted', 'renegotiated']);

/** Analisa as operações e devolve os alertas (ids determinísticos; quem grava ignora os que já existem). */
export function detectarAlertas(input: {
    hoje: string; parametros: ParametrosMonitorizacao; clientes: ClienteMon[]; creditos: CreditoMon[]; pagamentos: PagamentoMon[];
    reforcos: ReforcoMon[]; taxasManuais: TaxaManualMon[]; controlos: Map<string, ControloClienteMon>;
    /** Data em que o Compliance foi activado (a regra «sem controlos» só vale para créditos posteriores). */
    controlosDesde: string | null;
}): AlertaDetectado[] {
    const p = input.parametros;
    const agora = t(input.hoje);
    const desde = agora - p.diasRetroactivos * DIA;
    const recente = (d: string | null | undefined) => t(d) >= desde;
    const cliente = new Map(input.clientes.map(c => [c.id, c]));
    const creditos = input.creditos.filter(c => !c.deletedAt);
    const credito = new Map(creditos.map(c => [c.id, c]));
    const pagamentos = input.pagamentos.filter(x => !x.deletedAt && credito.has(x.creditId));
    const alertas: AlertaDetectado[] = [];
    const add = (regra: RegraId, gravidade: Gravidade, chave: string, a: Omit<AlertaDetectado, 'id' | 'regra' | 'categoria' | 'gravidade' | 'titulo'> & { titulo?: string }) => {
        const r = REGRAS_MONITORIZACAO[regra];
        alertas.push({ id: `${regra}:${chave}`, regra, categoria: r.categoria, gravidade, titulo: a.titulo || r.titulo, ...a });
    };
    const rendimento = (clientId: string) => Number(cliente.get(clientId)?.monthlyIncome) || 0;
    const nome = (clientId: string) => cliente.get(clientId)?.name || credito.get(clientId)?.clientName || clientId;

    // ── Créditos concedidos ────────────────────────────────────────────────────
    for (const c of creditos) {
        if (!CONCEDIDO.has(c.status) || !recente(c.createdAt)) continue;
        const r = rendimento(c.clientId);
        const base = { clientId: c.clientId, operacaoTabela: 'credits', operacaoId: c.id, dataOperacao: c.createdAt };
        if (r > 0 && c.principalAmount > r * p.desembolsoMultiploRendimento) {
            add('desembolso_rendimento', c.principalAmount > r * p.desembolsoMultiploRendimento * 2 ? 'alta' : 'media', c.id, {
                ...base, descricao: `Crédito de ${kz(c.principalAmount)} para ${nome(c.clientId)}: ${(c.principalAmount / r).toFixed(1)} vezes o rendimento mensal declarado (${kz(r)}).`,
                evidencias: { montante: c.principalAmount, rendimentoMensal: r, multiplo: Math.round((c.principalAmount / r) * 10) / 10, limite: p.desembolsoMultiploRendimento },
            });
        }
        if (r <= 0 && c.principalAmount >= p.semRendimentoLimiteKz) {
            add('desembolso_sem_rendimento', 'media', c.id, { ...base, descricao: `Crédito de ${kz(c.principalAmount)} para ${nome(c.clientId)} sem rendimento mensal declarado no cadastro.`,
                evidencias: { montante: c.principalAmount, limite: p.semRendimentoLimiteKz } });
        }
        // Só créditos concedidos depois de o Compliance estar activo (os anteriores não passaram por estes controlos).
        const ctl = input.controlos.get(c.clientId);
        const depoisDaActivacao = !!input.controlosDesde && t(c.createdAt) >= t(input.controlosDesde);
        if (ctl && depoisDaActivacao && c.status !== 'paid' && (!ctl.kycVerificado || ['possivel', 'confirmada'].includes(ctl.screening))) {
            const falhas = [!ctl.kycVerificado ? 'identidade (KYC) não verificada' : '', ctl.screening === 'confirmada' ? 'correspondência CONFIRMADA em lista de sanções' : ctl.screening === 'possivel' ? 'possível correspondência em lista por decidir' : ''].filter(Boolean);
            add('desembolso_sem_controlos', ctl.screening === 'confirmada' ? 'alta' : 'media', `${c.id}:${ctl.kycVerificado ? 'kyc' : 'sem-kyc'}:${ctl.screening}`, {
                ...base, descricao: `Crédito de ${kz(c.principalAmount)} concedido a ${nome(c.clientId)} com ${falhas.join(' e ')}.`, evidencias: { falhas, kycVerificado: ctl.kycVerificado, screening: ctl.screening },
            });
        }
    }

    // Possível crédito duplicado: mesmo cliente, mesmo montante, poucos dias de diferença.
    const porCliente = new Map<string, CreditoMon[]>();
    for (const c of creditos.filter(x => !['rejected', 'cancelled'].includes(x.status))) porCliente.set(c.clientId, [...(porCliente.get(c.clientId) || []), c]);
    for (const lista of porCliente.values()) {
        const ord = [...lista].sort((a, b) => t(a.createdAt) - t(b.createdAt));
        for (let i = 1; i < ord.length; i++) {
            const a = ord[i - 1], b = ord[i];
            if (!recente(b.createdAt) || Math.abs(a.principalAmount - b.principalAmount) > 0.5 || t(b.createdAt) - t(a.createdAt) > p.duplicadoDias * DIA) continue;
            add('credito_duplicado', 'media', `${a.id}|${b.id}`, { clientId: b.clientId, operacaoTabela: 'credits', operacaoId: b.id, dataOperacao: b.createdAt,
                descricao: `Dois créditos de ${kz(b.principalAmount)} para ${nome(b.clientId)} em ${dia(a.createdAt)} e ${dia(b.createdAt)}.`,
                evidencias: { creditos: [a.id, b.id], montante: b.principalAmount, pedidoPor: [a.requestedBy, b.requestedBy] } });
        }
    }

    // ── Pagamentos ─────────────────────────────────────────────────────────────
    const validos = pagamentos.filter(x => x.status !== 'cancelled');
    for (const x of validos) {
        if (!recente(x.paymentDate)) continue;
        const c = credito.get(x.creditId)!;
        if (NUMERARIO.has(x.method) && x.amount >= p.numerarioElevadoKz) {
            add('numerario_elevado', x.amount >= p.numerarioElevadoKz * 3 ? 'alta' : 'media', x.id, { clientId: c.clientId, operacaoTabela: 'payments', operacaoId: x.id, dataOperacao: x.paymentDate,
                descricao: `Pagamento em numerário de ${kz(x.amount)} de ${nome(c.clientId)} em ${dia(x.paymentDate)}.`, evidencias: { montante: x.amount, limite: p.numerarioElevadoKz, registadoPor: x.processedBy } });
        }
        if (COM_VALIDACAO.has(x.method) && x.status === 'pending') {
            const dias = Math.floor((agora - t(x.registeredAt || x.paymentDate)) / DIA);
            if (dias >= p.pendenteDias) add('pagamento_sem_confirmacao', dias >= p.pendenteDias * 3 ? 'media' : 'baixa', x.id, { clientId: c.clientId, operacaoTabela: 'payments', operacaoId: x.id,
                dataOperacao: x.registeredAt || x.paymentDate, descricao: `Pagamento de ${kz(x.amount)} (${x.method === 'deposit' ? 'depósito' : 'transferência'}) de ${nome(c.clientId)} registado há ${dias} dias sem confirmação no banco.`,
                evidencias: { montante: x.amount, dias, registadoPor: x.processedBy } });
        }
    }

    // Por cliente: fraccionamento em numerário e volume face ao rendimento.
    const pagPorCliente = new Map<string, PagamentoMon[]>();
    for (const x of validos) { const c = credito.get(x.creditId)!; pagPorCliente.set(c.clientId, [...(pagPorCliente.get(c.clientId) || []), x]); }
    for (const [clientId, lista] of pagPorCliente) {
        const ord = [...lista].sort((a, b) => t(a.paymentDate) - t(b.paymentDate));
        const numerario = ord.filter(x => NUMERARIO.has(x.method) && x.amount < p.numerarioElevadoKz);
        for (let i = 0; i < numerario.length; i++) {
            const inicio = numerario[i];
            const janela = numerario.filter(x => t(x.paymentDate) >= t(inicio.paymentDate) && t(x.paymentDate) - t(inicio.paymentDate) <= p.fraccionamento.dias * DIA);
            const total = janela.reduce((s, x) => s + x.amount, 0);
            if (janela.length >= p.fraccionamento.minPagamentos && total >= p.fraccionamento.totalKz && recente(janela[janela.length - 1].paymentDate)) {
                add('fraccionamento', 'media', `${clientId}:${inicio.id}`, { clientId, operacaoTabela: 'payments', operacaoId: janela[janela.length - 1].id, dataOperacao: janela[janela.length - 1].paymentDate,
                    descricao: `${janela.length} pagamentos em numerário de ${nome(clientId)} entre ${dia(inicio.paymentDate)} e ${dia(janela[janela.length - 1].paymentDate)}, cada um abaixo de ${kz(p.numerarioElevadoKz)}, num total de ${kz(total)}.`,
                    evidencias: { pagamentos: janela.map(x => ({ id: x.id, data: x.paymentDate.slice(0, 10), montante: x.amount })), total, limite: p.numerarioElevadoKz } });
                i += janela.length - 1; // a janela seguinte começa depois desta
            }
        }
        const r = rendimento(clientId);
        if (r > 0) {
            for (let i = 0; i < ord.length; i++) {
                const inicio = ord[i];
                const janela = ord.filter(x => t(x.paymentDate) >= t(inicio.paymentDate) && t(x.paymentDate) - t(inicio.paymentDate) <= p.pagamentosRendimento.dias * DIA);
                const total = janela.reduce((s, x) => s + x.amount, 0);
                if (total > r * p.pagamentosRendimento.multiplo && recente(janela[janela.length - 1].paymentDate)) {
                    add('pagamentos_rendimento', 'baixa', `${clientId}:${inicio.id}`, { clientId, operacaoTabela: 'payments', operacaoId: janela[janela.length - 1].id, dataOperacao: janela[janela.length - 1].paymentDate,
                        descricao: `${nome(clientId)} pagou ${kz(total)} em ${p.pagamentosRendimento.dias} dias, ${(total / r).toFixed(1)} vezes o rendimento mensal declarado (${kz(r)}). Confirmar a origem dos fundos (pode ser liquidação antecipada legítima).`,
                        evidencias: { total, rendimentoMensal: r, pagamentos: janela.map(x => x.id) } });
                    break; // um alerta por cliente e janela inicial
                }
            }
        }
    }

    // Liquidação rápida em numerário (a liquidação antecipada em si não gera alerta).
    for (const c of creditos) {
        if (c.status !== 'paid' || !c.paidAt || !recente(c.paidAt)) continue;
        if (t(c.paidAt) - t(c.startDate || c.createdAt) > p.liquidacaoRapidaDias * DIA) continue;
        const emNumerario = validos.filter(x => x.creditId === c.id && NUMERARIO.has(x.method)).reduce((s, x) => s + x.amount, 0);
        if (emNumerario < p.numerarioElevadoKz) continue;
        add('liquidacao_rapida_numerario', 'baixa', c.id, { clientId: c.clientId, operacaoTabela: 'credits', operacaoId: c.id, dataOperacao: c.paidAt,
            descricao: `Crédito de ${kz(c.principalAmount)} de ${nome(c.clientId)} liquidado ${Math.round((t(c.paidAt) - t(c.startDate || c.createdAt)) / DIA)} dias depois, com ${kz(emNumerario)} em numerário.`,
            evidencias: { montante: c.principalAmount, numerario: emNumerario, inicio: c.startDate || c.createdAt, liquidado: c.paidAt } });
    }

    // ── Reforços sucessivos ────────────────────────────────────────────────────
    const refPorCredito = new Map<string, ReforcoMon[]>();
    for (const r of input.reforcos) if (credito.has(r.creditId)) refPorCredito.set(r.creditId, [...(refPorCredito.get(r.creditId) || []), r]);
    for (const [creditId, lista] of refPorCredito) {
        const ord = [...lista].sort((a, b) => t(a.createdAt) - t(b.createdAt));
        for (let i = 0; i + p.reforcos.minimo - 1 < ord.length; i++) {
            const janela = ord.slice(i).filter(r => t(r.createdAt) - t(ord[i].createdAt) <= p.reforcos.dias * DIA);
            if (janela.length < p.reforcos.minimo || !recente(janela[janela.length - 1].createdAt)) continue;
            const c = credito.get(creditId)!;
            add('reforcos_sucessivos', 'media', `${creditId}:${ord[i].id}`, { clientId: c.clientId, operacaoTabela: 'credit_reinforcements', operacaoId: janela[janela.length - 1].id,
                dataOperacao: janela[janela.length - 1].createdAt, descricao: `${janela.length} reforços no crédito de ${nome(c.clientId)} em ${p.reforcos.dias} dias (total ${kz(janela.reduce((s, r) => s + r.amount, 0))}).`,
                evidencias: { reforcos: janela.map(r => ({ id: r.id, data: r.createdAt.slice(0, 10), montante: r.amount, por: r.createdBy })) } });
            break;
        }
    }

    // ── Anulações de pagamentos (fraude interna) ───────────────────────────────
    const anulados = pagamentos.filter(x => x.status === 'cancelled' && x.cancelledAt && recente(x.cancelledAt));
    for (const x of anulados) {
        if (x.cancelledBy && x.processedBy && x.cancelledBy === x.processedBy) {
            const c = credito.get(x.creditId)!;
            add('anulacao_propria', 'baixa', x.id, { clientId: c.clientId, operacaoTabela: 'payments', operacaoId: x.id, dataOperacao: x.cancelledAt!,
                descricao: `Pagamento de ${kz(x.amount)} de ${nome(c.clientId)} registado e anulado pelo mesmo utilizador (${x.cancelledBy}). Motivo: ${x.cancelReason || '—'}.`,
                evidencias: { montante: x.amount, utilizador: x.cancelledBy, motivo: x.cancelReason } });
        }
    }
    const porUtilizador = new Map<string, PagamentoMon[]>();
    for (const x of anulados) if (x.cancelledBy) porUtilizador.set(x.cancelledBy, [...(porUtilizador.get(x.cancelledBy) || []), x]);
    for (const [utilizador, lista] of porUtilizador) {
        const ord = [...lista].sort((a, b) => t(a.cancelledAt) - t(b.cancelledAt));
        for (let i = 0; i < ord.length; i++) {
            const janela = ord.filter(x => t(x.cancelledAt) >= t(ord[i].cancelledAt) && t(x.cancelledAt) - t(ord[i].cancelledAt) <= p.anulacoes.dias * DIA);
            if (janela.length < p.anulacoes.minimo) continue;
            add('anulacoes_utilizador', 'media', `${utilizador}:${ord[i].id}`, { clientId: null, operacaoTabela: 'payments', operacaoId: janela[janela.length - 1].id, dataOperacao: janela[janela.length - 1].cancelledAt!,
                descricao: `${janela.length} pagamentos anulados por ${utilizador} em ${p.anulacoes.dias} dias (total ${kz(janela.reduce((s, x) => s + x.amount, 0))}).`,
                evidencias: { utilizador, pagamentos: janela.map(x => ({ id: x.id, montante: x.amount, motivo: x.cancelReason })) } });
            i += janela.length - 1;
        }
    }

    // ── Taxa alterada manualmente (auditoria do crédito) ───────────────────────
    for (const m of input.taxasManuais) {
        if (!recente(m.em)) continue;
        const c = credito.get(m.creditId);
        const reducao = m.taxaTabela && m.taxaTabela > 0 ? ((m.taxaTabela - m.taxaUsada) / m.taxaTabela) * 100 : 0;
        add('taxa_manual', reducao >= p.reducaoTaxaPct ? 'media' : 'baixa', m.auditId, { clientId: c?.clientId ?? null, operacaoTabela: 'credits', operacaoId: m.creditId, dataOperacao: m.em,
            descricao: `Taxa do crédito${c ? ` de ${nome(c.clientId)}` : ''} alterada manualmente${m.por ? ` por ${m.por}` : ''}: ${m.taxaTabela === null ? 'sem taxa na tabela' : `${m.taxaTabela}%`} → ${m.taxaUsada}%${reducao > 0 ? ` (redução de ${Math.round(reducao)}%)` : ''}.`,
            evidencias: { taxaTabela: m.taxaTabela, taxaUsada: m.taxaUsada, reducaoPct: Math.round(reducao), por: m.por } });
    }

    return alertas;
}
