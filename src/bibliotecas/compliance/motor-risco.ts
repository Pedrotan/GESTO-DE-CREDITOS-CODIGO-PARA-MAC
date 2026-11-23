// Motor de avaliação de risco de Compliance (prevenção do branqueamento de capitais). É outra coisa que o scoring
// de crédito: mede o risco do cliente para a conformidade, não a capacidade de pagar.
//
// A pontuação (0–100) é a média ponderada de cinco factores, cada um de 0 a 100. Os pesos, limiares e listas são
// parametrizáveis e cada configuração é uma versão: a avaliação guarda a versão, os factores e as regras que a
// fundamentaram. Situações com regra própria (PEP, país de risco elevado, documento expirado, duplicado por resolver)
// NÃO se diluem na média: impõem um nível mínimo e/ou a revisão humana. Uma pontuação alta não prova nada — serve
// para decidir o grau de diligência e quem tem de olhar para o caso.

import { PARAMETROS_MONITORIZACAO_INICIAIS, lerParametrosMonitorizacao, validarParametrosMonitorizacao, type ParametrosMonitorizacao } from './monitorizacao.ts';

export type NivelRisco = 'baixo' | 'medio' | 'elevado';
export type DecisaoRisco = 'diligencia_normal' | 'verificacao_complementar' | 'diligencia_reforcada';
export type FactorId = 'identificacao' | 'actividade' | 'financeiro' | 'pep_sancoes' | 'historico';

export type ConfiguracaoRisco = {
    pesos: Record<FactorId, number>;
    /** Pontuação a partir da qual o nível é médio e elevado (0–29 baixo, 30–59 médio, 60–100 elevado). */
    limiares: { medio: number; elevado: number };
    /** Meses até à próxima revisão do perfil, por nível. */
    revisaoMeses: Record<NivelRisco, number>;
    /** Países (ISO 3166-1 alfa-2) tratados como de risco elevado (ex.: lista «call for action» do GAFI). */
    paisesRiscoElevado: string[];
    /** Palavras que identificam actividades de risco acrescido (comparadas com a profissão e o sector). */
    actividadesRiscoElevado: string[];
    /** Exposição (saldo em dívida) a partir da qual o factor financeiro sobe, em meses de rendimento declarado. */
    exposicaoMesesRendimento: { atencao: number; elevada: number };
    /** Parâmetros das regras de monitorização de operações (versionados com o modelo). */
    monitorizacao: ParametrosMonitorizacao;
};

export const ROTULO_FACTOR: Record<FactorId, string> = {
    identificacao: 'Identificação e documentação',
    actividade: 'Actividade e origem dos rendimentos',
    financeiro: 'Perfil financeiro e operações',
    pep_sancoes: 'PEP e exposição a sanções',
    historico: 'Histórico e comportamento',
};
export const FACTORES: FactorId[] = ['identificacao', 'actividade', 'financeiro', 'pep_sancoes', 'historico'];

export const ROTULO_NIVEL: Record<NivelRisco, string> = { baixo: 'Baixo', medio: 'Médio', elevado: 'Elevado' };
export const ROTULO_DECISAO: Record<DecisaoRisco, string> = {
    diligencia_normal: 'Diligência normal e monitorização regular',
    verificacao_complementar: 'Verificação complementar e acompanhamento reforçado',
    diligencia_reforcada: 'Diligência reforçada e revisão por responsável autorizado',
};

/** Configuração inicial: pesos e escalões propostos na especificação (para testes; a validar pela empresa). */
export const CONFIGURACAO_RISCO_INICIAL: ConfiguracaoRisco = {
    pesos: { identificacao: 20, actividade: 20, financeiro: 25, pep_sancoes: 20, historico: 15 },
    limiares: { medio: 30, elevado: 60 },
    revisaoMeses: { baixo: 24, medio: 12, elevado: 6 },
    paisesRiscoElevado: ['KP', 'IR', 'MM'],
    actividadesRiscoElevado: ['câmbio', 'cambista', 'casino', 'jogo', 'diamante', 'ouro', 'pedras preciosas', 'criptomoeda', 'remessas'],
    exposicaoMesesRendimento: { atencao: 6, elevada: 12 },
    monitorizacao: PARAMETROS_MONITORIZACAO_INICIAIS,
};

/** Dados de um cliente no momento da avaliação (montados a partir do cadastro, do perfil KYC e dos créditos). */
export type EntradaRisco = {
    particular: boolean;
    /** Estado do documento de identificação. */
    documento: 'valido' | 'a_expirar' | 'expirado' | 'sem_data';
    /** Requisitos KYC em falta (rótulos). */
    kycEmFalta: string[];
    /** Estado do processo KYC (verificação decidida por um responsável). */
    kycEstado: 'pendente' | 'em_verificacao' | 'verificado' | 'recusado';
    /** Possíveis duplicados ainda não revistos (motivos). */
    duplicadosPorRever: string[];
    estrangeiro: boolean;
    pais: string | null;
    rendimentoMensal: number | null;
    origemFundos: string | null;
    profissao: string | null;
    sector: string | null;
    /** null = pergunta PEP ainda sem resposta. */
    pep: boolean | null;
    /** Estado do screening de PEP e sanções (listas ONU, OFAC e interna). */
    screening: 'sem_correspondencia' | 'possivel' | 'confirmada' | 'erro' | 'nao_verificado' | 'desactualizado';
    /** PEP confirmado por um responsável a partir da lista interna (mesmo que o cliente não o tenha declarado). */
    pepLista: boolean;
    /** Saldo em dívida dos créditos activos/em atraso (Kz). */
    exposicao: number;
    creditosActivos: number;
    /** Maior montante pedido nos créditos ainda não decididos ou activos (Kz). */
    maiorCredito: number;
    maiorAtrasoDias: number;
    creditoIncumprido: boolean;
    clienteBloqueado: boolean;
    /** Alertas de operações concluídos como fundamentados (monitorização). */
    alertasFundamentados?: number;
    /** Meses desde o cadastro (null = desconhecido). */
    antiguidadeMeses: number | null;
};

export type Contributo = { motivo: string; pontos: number };
export type ResultadoFactor = { id: FactorId; rotulo: string; peso: number; valor: number; contributos: Contributo[]; notas: string[] };
export type RegraDisparada = { id: string; descricao: string; nivelMinimo?: NivelRisco; revisao?: boolean };
export type ResultadoRisco = {
    pontuacao: number;
    pontuacaoPonderada: number;
    nivel: NivelRisco;
    decisao: DecisaoRisco;
    requerRevisao: boolean;
    factores: ResultadoFactor[];
    regras: RegraDisparada[];
};

const ORDEM: Record<NivelRisco, number> = { baixo: 0, medio: 1, elevado: 2 };
const maior = (a: NivelRisco, b: NivelRisco): NivelRisco => (ORDEM[a] >= ORDEM[b] ? a : b);
const kz = (v: number) => `${Math.round(v).toLocaleString('pt-PT')} Kz`;
const normalizar = (v: string | null | undefined) => String(v || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Erros de uma configuração (pesos que não somam 100, limiares fora de ordem, prazos inválidos). */
export function validarConfiguracao(c: ConfiguracaoRisco): string[] {
    const erros: string[] = [];
    const soma = FACTORES.reduce((s, f) => s + Number(c.pesos[f] || 0), 0);
    if (FACTORES.some(f => !(Number.isFinite(c.pesos[f]) && c.pesos[f] >= 0))) erros.push('Os pesos têm de ser números iguais ou superiores a 0.');
    if (Math.round(soma) !== 100) erros.push(`Os pesos têm de somar 100% (somam ${soma}%).`);
    const { medio, elevado } = c.limiares;
    if (!(Number.isInteger(medio) && Number.isInteger(elevado) && medio > 0 && medio < elevado && elevado <= 100)) {
        erros.push('Os limiares têm de ser inteiros com 0 < médio < elevado ≤ 100.');
    }
    for (const n of ['baixo', 'medio', 'elevado'] as NivelRisco[]) {
        if (!(Number.isInteger(c.revisaoMeses[n]) && c.revisaoMeses[n] >= 1 && c.revisaoMeses[n] <= 60)) erros.push(`O prazo de revisão do nível ${ROTULO_NIVEL[n].toLowerCase()} tem de ser de 1 a 60 meses.`);
    }
    if (c.revisaoMeses.elevado > c.revisaoMeses.medio || c.revisaoMeses.medio > c.revisaoMeses.baixo) erros.push('Quanto maior o risco, mais curto (ou igual) tem de ser o prazo de revisão.');
    const { atencao, elevada } = c.exposicaoMesesRendimento;
    if (!(atencao > 0 && elevada > atencao)) erros.push('A exposição «elevada» tem de ser maior que a de «atenção» (em meses de rendimento).');
    if (c.paisesRiscoElevado.some(p => !/^[A-Z]{2}$/u.test(p))) erros.push('Os países de risco elevado indicam-se pelo código de duas letras (ex.: KP).');
    erros.push(...validarParametrosMonitorizacao(c.monitorizacao));
    return erros;
}

/** Completa uma configuração guardada (versões antigas ganham os campos novos com os valores iniciais). */
export function lerConfiguracao(texto: string | null | undefined): ConfiguracaoRisco {
    const base = CONFIGURACAO_RISCO_INICIAL;
    let lida: Partial<ConfiguracaoRisco> = {};
    try { lida = texto ? JSON.parse(texto) as Partial<ConfiguracaoRisco> : {}; } catch { lida = {}; }
    return {
        pesos: { ...base.pesos, ...(lida.pesos || {}) },
        limiares: { ...base.limiares, ...(lida.limiares || {}) },
        revisaoMeses: { ...base.revisaoMeses, ...(lida.revisaoMeses || {}) },
        paisesRiscoElevado: Array.isArray(lida.paisesRiscoElevado) ? lida.paisesRiscoElevado : base.paisesRiscoElevado,
        actividadesRiscoElevado: Array.isArray(lida.actividadesRiscoElevado) ? lida.actividadesRiscoElevado : base.actividadesRiscoElevado,
        exposicaoMesesRendimento: { ...base.exposicaoMesesRendimento, ...(lida.exposicaoMesesRendimento || {}) },
        monitorizacao: lerParametrosMonitorizacao(lida.monitorizacao),
    };
}

export function nivelDaPontuacao(pontuacao: number, c: ConfiguracaoRisco): NivelRisco {
    if (pontuacao >= c.limiares.elevado) return 'elevado';
    if (pontuacao >= c.limiares.medio) return 'medio';
    return 'baixo';
}

export const decisaoDoNivel = (nivel: NivelRisco): DecisaoRisco =>
    nivel === 'elevado' ? 'diligencia_reforcada' : nivel === 'medio' ? 'verificacao_complementar' : 'diligencia_normal';

/** Grau de diligência do perfil para cada nível (a simplificada nunca é atribuída automaticamente). */
export const diligenciaDoNivel = (nivel: NivelRisco): 'normal' | 'reforcada' => (nivel === 'elevado' ? 'reforcada' : 'normal');

function factor(id: FactorId, c: ConfiguracaoRisco, contributos: Contributo[], notas: string[] = []): ResultadoFactor {
    const valor = Math.min(100, contributos.reduce((s, x) => s + x.pontos, 0));
    return { id, rotulo: ROTULO_FACTOR[id], peso: c.pesos[id], valor, contributos, notas };
}

export function calcularRisco(e: EntradaRisco, c: ConfiguracaoRisco): ResultadoRisco {
    const regras: RegraDisparada[] = [];

    // 1. Identificação e documentação
    const ident: Contributo[] = [];
    if (e.documento === 'expirado') ident.push({ motivo: 'Documento de identificação expirado', pontos: 60 });
    else if (e.documento === 'sem_data') ident.push({ motivo: 'Validade do documento não registada', pontos: 30 });
    else if (e.documento === 'a_expirar') ident.push({ motivo: 'Documento de identificação a expirar', pontos: 15 });
    if (e.kycEmFalta.length) ident.push({ motivo: `Dados KYC em falta: ${e.kycEmFalta.join(', ')}`, pontos: Math.min(40, e.kycEmFalta.length * 10) });
    if (e.kycEstado === 'recusado') ident.push({ motivo: 'Verificação de identidade recusada', pontos: 60 });
    else if (e.kycEstado !== 'verificado') ident.push({ motivo: 'Identidade ainda não verificada por um responsável', pontos: 20 });
    if (e.duplicadosPorRever.length) ident.push({ motivo: `Possível duplicado por rever (${e.duplicadosPorRever.join(', ')})`, pontos: 40 });

    // 2. Actividade e origem dos rendimentos
    const activ: Contributo[] = [];
    if (!(Number(e.rendimentoMensal) > 0)) activ.push({ motivo: 'Rendimento mensal não declarado', pontos: 50 });
    if (!String(e.origemFundos || '').trim()) activ.push({ motivo: 'Origem dos fundos não declarada', pontos: 30 });
    if (!String(e.profissao || '').trim() && !String(e.sector || '').trim()) activ.push({ motivo: 'Profissão ou actividade não declarada', pontos: 20 });
    const textoActividade = normalizar(`${e.profissao || ''} ${e.sector || ''}`);
    const actividadeRisco = c.actividadesRiscoElevado.find(a => normalizar(a) && textoActividade.includes(normalizar(a)));
    if (actividadeRisco) activ.push({ motivo: `Actividade de risco acrescido («${actividadeRisco}»)`, pontos: 40 });

    // 3. Perfil financeiro e operações
    const finan: Contributo[] = [];
    const notasFinan: string[] = [];
    const rendimento = Number(e.rendimentoMensal) || 0;
    if (rendimento > 0) {
        const meses = e.exposicao / rendimento;
        if (meses >= c.exposicaoMesesRendimento.elevada) finan.push({ motivo: `Dívida em curso de ${kz(e.exposicao)} (≈ ${meses.toFixed(1)} meses de rendimento)`, pontos: 50 });
        else if (meses >= c.exposicaoMesesRendimento.atencao) finan.push({ motivo: `Dívida em curso de ${kz(e.exposicao)} (≈ ${meses.toFixed(1)} meses de rendimento)`, pontos: 25 });
        const pedido = e.maiorCredito / rendimento;
        if (pedido >= c.exposicaoMesesRendimento.elevada) finan.push({ motivo: `Crédito de ${kz(e.maiorCredito)} desproporcionado face ao rendimento declarado`, pontos: 30 });
    } else if (e.exposicao > 0 || e.maiorCredito > 0) {
        notasFinan.push('Sem rendimento declarado não é possível comparar a dívida com o rendimento.');
    }
    if (e.creditosActivos >= 3) finan.push({ motivo: `${e.creditosActivos} créditos em curso em simultâneo`, pontos: 20 });

    // 4. PEP e exposição a sanções
    const pep: Contributo[] = [];
    const notasPep: string[] = [];
    if (e.pep === true) pep.push({ motivo: 'Pessoa politicamente exposta (declarada)', pontos: 100 });
    else if (e.pepLista) pep.push({ motivo: 'Pessoa politicamente exposta (confirmada na lista interna)', pontos: 100 });
    else if (e.pep === null) pep.push({ motivo: 'Declaração PEP por preencher', pontos: 30 });
    if (e.screening === 'confirmada') pep.push({ motivo: 'Correspondência confirmada com lista de sanções', pontos: 100 });
    else if (e.screening === 'possivel') pep.push({ motivo: 'Possível correspondência em lista de sanções/PEP por decidir', pontos: 60 });
    else if (e.screening === 'erro') { pep.push({ motivo: 'Screening com erro (lista indisponível)', pontos: 20 }); notasPep.push('Uma falha do screening nunca conta como «sem correspondência».'); }
    else if (e.screening === 'nao_verificado') { pep.push({ motivo: 'Screening de PEP e sanções por fazer', pontos: 20 }); notasPep.push('Listas de sanções não verificadas para este cliente.'); }
    else if (e.screening === 'desactualizado') pep.push({ motivo: 'Screening desactualizado (as listas mudaram depois)', pontos: 10 });
    const pais = String(e.pais || '').toUpperCase();
    if (pais && c.paisesRiscoElevado.includes(pais)) pep.push({ motivo: `País de risco elevado (${pais})`, pontos: 80 });
    else if (e.estrangeiro) pep.push({ motivo: 'Cliente estrangeiro', pontos: 15 });

    // 5. Histórico e comportamento
    const hist: Contributo[] = [];
    if (e.creditoIncumprido) hist.push({ motivo: 'Crédito em incumprimento', pontos: 60 });
    if (e.maiorAtrasoDias > 90) hist.push({ motivo: `Atraso de ${e.maiorAtrasoDias} dias`, pontos: 50 });
    else if (e.maiorAtrasoDias > 30) hist.push({ motivo: `Atraso de ${e.maiorAtrasoDias} dias`, pontos: 30 });
    else if (e.maiorAtrasoDias > 0) hist.push({ motivo: `Atraso de ${e.maiorAtrasoDias} dia(s)`, pontos: 15 });
    if (e.clienteBloqueado) hist.push({ motivo: 'Cliente bloqueado no cadastro', pontos: 40 });
    if (e.alertasFundamentados) hist.push({ motivo: `${e.alertasFundamentados} alerta(s) de operações fundamentado(s)`, pontos: 50 });
    if (e.antiguidadeMeses !== null && e.antiguidadeMeses < 6) hist.push({ motivo: 'Cliente recente (menos de 6 meses de relação)', pontos: 20 });

    const factores = [
        factor('identificacao', c, ident),
        factor('actividade', c, activ),
        factor('financeiro', c, finan, notasFinan),
        factor('pep_sancoes', c, pep, notasPep),
        factor('historico', c, hist),
    ];
    const pontuacaoPonderada = Math.round(factores.reduce((s, f) => s + (f.valor * f.peso) / 100, 0));
    let nivel = nivelDaPontuacao(pontuacaoPonderada, c);

    // Regras próprias: não se diluem na média.
    if (e.screening === 'confirmada') regras.push({ id: 'sancao_confirmada', descricao: 'Correspondência confirmada com lista de sanções: bloquear novas operações e aplicar as medidas restritivas (decisão separada da comunicação à UIF)', nivelMinimo: 'elevado', revisao: true });
    if (e.screening === 'possivel') regras.push({ id: 'screening_possivel', descricao: 'Possível correspondência em lista: decidir antes de novas operações', nivelMinimo: 'medio', revisao: true });
    if (e.screening === 'erro') regras.push({ id: 'screening_erro', descricao: 'Screening com erro: repetir quando a lista estiver disponível', revisao: true });
    if (e.pep === true || e.pepLista) regras.push({ id: 'pep', descricao: 'PEP: diligência reforçada e decisão de um responsável autorizado', nivelMinimo: 'elevado', revisao: true });
    if (pais && c.paisesRiscoElevado.includes(pais)) regras.push({ id: 'pais_risco', descricao: `Ligação a país de risco elevado (${pais})`, nivelMinimo: 'elevado', revisao: true });
    if (e.kycEstado === 'recusado') regras.push({ id: 'kyc_recusado', descricao: 'Verificação de identidade recusada', nivelMinimo: 'elevado', revisao: true });
    if (e.documento === 'expirado') regras.push({ id: 'documento_expirado', descricao: 'Documento expirado: actualizar antes de novas operações', nivelMinimo: 'medio', revisao: true });
    if (e.duplicadosPorRever.length) regras.push({ id: 'duplicado', descricao: 'Possível duplicado por rever', nivelMinimo: 'medio', revisao: true });
    if (e.alertasFundamentados) regras.push({ id: 'alertas_fundamentados', descricao: 'Operações atípicas ou fraude fundamentadas pela monitorização', nivelMinimo: 'medio', revisao: true });
    if (actividadeRisco) regras.push({ id: 'actividade_risco', descricao: `Actividade de risco acrescido («${actividadeRisco}»)`, nivelMinimo: 'medio' });
    for (const r of regras) if (r.nivelMinimo) nivel = maior(nivel, r.nivelMinimo);

    // A pontuação final nunca fica abaixo do escalão do nível imposto pelas regras (para os números baterem certo).
    const minimo = nivel === 'elevado' ? c.limiares.elevado : nivel === 'medio' ? c.limiares.medio : 0;
    const pontuacao = Math.max(pontuacaoPonderada, minimo);
    const requerRevisao = nivel === 'elevado' || regras.some(r => r.revisao);
    return { pontuacao, pontuacaoPonderada, nivel, decisao: decisaoDoNivel(nivel), requerRevisao, factores, regras };
}

/** Data (aaaa-mm-dd) da próxima revisão do perfil, a partir de hoje e do nível. */
export function proximaRevisao(hoje: string, nivel: NivelRisco, c: ConfiguracaoRisco): string {
    const [a, m, d] = hoje.slice(0, 10).split('-').map(Number);
    const total = a * 12 + (m - 1) + c.revisaoMeses[nivel];
    const ano = Math.floor(total / 12);
    const mes = (total % 12) + 1;
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    return `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}
