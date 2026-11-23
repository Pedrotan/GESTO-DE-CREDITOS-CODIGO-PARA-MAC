// Investigações (casos) de Compliance: ciclo de vida, prazos, decisões e regras de encerramento (especificação,
// secções 3.6 e endpoint 12). A conclusão interna do caso é uma decisão; a comunicação (ou não) à UIF é OUTRA
// decisão, registada à parte, com o seu próprio fundamento e referência. Nada aqui comunica com entidades externas.
// Sigilo: o cliente não pode ser informado de que está a ser investigado nem de uma eventual comunicação à UIF.

export type EstadoCaso = 'aberto' | 'em_investigacao' | 'aguarda_decisao' | 'encerrado';
export type TipoCaso = 'actividade_suspeita' | 'fraude' | 'kyc' | 'sancoes' | 'outro';
export type Prioridade = 'baixa' | 'media' | 'alta' | 'critica';
export type TipoDecisao = 'conclusao' | 'medida' | 'uif';
export type DecisaoConclusao = 'suspeita_fundamentada' | 'sem_fundamento' | 'inconclusivo';
export type DecisaoMedida = 'diligencia_reforcada' | 'monitorizacao_reforcada' | 'actualizacao_kyc' | 'recusa_operacao' | 'bloqueio_operacoes' | 'encerramento_relacao' | 'nenhuma';
export type DecisaoUif = 'comunicar' | 'nao_comunicar';

export const ROTULO_ESTADO_CASO: Record<EstadoCaso, string> = { aberto: 'Aberto', em_investigacao: 'Em investigação', aguarda_decisao: 'Aguarda decisão', encerrado: 'Encerrado' };
export const ROTULO_TIPO_CASO: Record<TipoCaso, string> = {
    actividade_suspeita: 'Actividade suspeita', fraude: 'Fraude', kyc: 'Identificação (KYC)', sancoes: 'Sanções / PEP', outro: 'Outro',
};
export const ROTULO_PRIORIDADE: Record<Prioridade, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
export const ROTULO_TIPO_DECISAO: Record<TipoDecisao, string> = { conclusao: 'Conclusão interna', medida: 'Medida', uif: 'Comunicação à UIF' };
export const ROTULO_DECISAO: Record<DecisaoConclusao | DecisaoMedida | DecisaoUif, string> = {
    suspeita_fundamentada: 'Suspeita fundamentada', sem_fundamento: 'Sem fundamento', inconclusivo: 'Inconclusivo',
    diligencia_reforcada: 'Diligência reforçada', monitorizacao_reforcada: 'Monitorização reforçada', actualizacao_kyc: 'Actualizar a identificação (KYC)',
    recusa_operacao: 'Recusar a operação', bloqueio_operacoes: 'Bloquear novas operações', encerramento_relacao: 'Encerrar a relação de negócio', nenhuma: 'Nenhuma medida',
    comunicar: 'Comunicar à UIF', nao_comunicar: 'Não comunicar à UIF',
};
export const DECISOES_POR_TIPO: Record<TipoDecisao, string[]> = {
    conclusao: ['suspeita_fundamentada', 'sem_fundamento', 'inconclusivo'],
    medida: ['diligencia_reforcada', 'monitorizacao_reforcada', 'actualizacao_kyc', 'recusa_operacao', 'bloqueio_operacoes', 'encerramento_relacao', 'nenhuma'],
    uif: ['comunicar', 'nao_comunicar'],
};

/** Dias para concluir a investigação, por prioridade (indicativos). */
export const PRAZO_DIAS: Record<Prioridade, number> = { critica: 2, alta: 5, media: 15, baixa: 30 };

export const TRANSICOES_CASO: Record<EstadoCaso, EstadoCaso[]> = {
    aberto: ['em_investigacao'],
    em_investigacao: ['aguarda_decisao'],
    aguarda_decisao: ['em_investigacao', 'encerrado'],
    encerrado: [],
};
export const transicaoCasoPermitida = (de: EstadoCaso, para: EstadoCaso) => TRANSICOES_CASO[de].includes(para);

/** Número legível do caso (estável em todos os computadores): CS-aaaammdd-XXXX. */
export const numeroCaso = (abertoEm: string, id: string) => `CS-${abertoEm.slice(0, 10).replace(/-/gu, '')}-${id.replace(/[^a-z0-9]/giu, '').slice(0, 4).toUpperCase()}`;

/** Prazo (aaaa-mm-dd) a partir da data de abertura e da prioridade. */
export function prazoCaso(abertoEm: string, prioridade: Prioridade): string {
    const d = new Date(Date.parse(`${abertoEm.slice(0, 10)}T12:00:00Z`) + PRAZO_DIAS[prioridade] * 86_400_000);
    return d.toISOString().slice(0, 10);
}

export type DecisaoCaso = { tipo: TipoDecisao; decisao: string };

/** Requisitos em falta para encerrar o caso (vazio = pode encerrar). */
export function faltaParaEncerrar(estado: EstadoCaso, decisoes: DecisaoCaso[]): string[] {
    const falta: string[] = [];
    if (estado !== 'aguarda_decisao') falta.push('O caso tem de estar em «Aguarda decisão».');
    const conclusao = decisoes.find(d => d.tipo === 'conclusao');
    if (!conclusao) falta.push('Registar a conclusão interna.');
    if (conclusao?.decisao === 'suspeita_fundamentada') {
        if (!decisoes.some(d => d.tipo === 'uif')) falta.push('Registar a decisão sobre a comunicação à UIF (comunicar ou não, com fundamento).');
        if (!decisoes.some(d => d.tipo === 'medida')) falta.push('Registar pelo menos uma medida (mesmo que «Nenhuma medida», fundamentada).');
    }
    return falta;
}

/** Prioridade sugerida a partir da gravidade dos alertas ligados. */
export const prioridadeSugerida = (gravidades: string[]): Prioridade =>
    gravidades.includes('alta') ? 'alta' : gravidades.includes('media') ? 'media' : 'baixa';

// ── Indicadores (especificação, secção 10) ─────────────────────────────────────
export type EntradaIndicadores = {
    hoje: string;
    clientes: Array<{ kycCompleto: boolean; nivel: string | null }>;
    alertas: Array<{ estado: string; resultado: string | null; detectado_em: string; concluido_em: string | null }>;
    casos: Array<{ estado: EstadoCaso; aberto_em: string; prazo: string | null; encerrado_em: string | null }>;
    decisoesScreening: Array<{ decisao: string }>;
    decisoesCasos: Array<{ tipo: TipoDecisao; decisao: string }>;
};
const DIA = 86_400_000;
const media = (v: number[]) => (v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null);
const pct = (n: number, t: number) => (t ? Math.round((n / t) * 1000) / 10 : null);

export function calcularIndicadores(e: EntradaIndicadores) {
    const alertasConcluidos = e.alertas.filter(a => a.resultado);
    const abertos = e.alertas.filter(a => ['NEW', 'IN_REVIEW', 'INFORMATION_REQUESTED'].includes(a.estado));
    const porNivel = { baixo: 0, medio: 0, elevado: 0, sem: 0 } as Record<string, number>;
    for (const c of e.clientes) porNivel[c.nivel || 'sem'] = (porNivel[c.nivel || 'sem'] || 0) + 1;
    const casosAbertos = e.casos.filter(c => c.estado !== 'encerrado');
    return {
        kycCompletoPct: pct(e.clientes.filter(c => c.kycCompleto).length, e.clientes.length),
        clientesPorNivel: porNivel,
        alertasPendentes: abertos.length,
        alertasPendentesMais7Dias: abertos.filter(a => Date.parse(`${e.hoje}T23:59:59Z`) - Date.parse(a.detectado_em) > 7 * DIA).length,
        tempoMedioAlertaDias: media(alertasConcluidos.filter(a => a.concluido_em).map(a => (Date.parse(a.concluido_em!) - Date.parse(a.detectado_em)) / DIA)),
        alertasFalsosPositivosPct: pct(alertasConcluidos.filter(a => a.resultado === 'NOT_SUBSTANTIATED').length, alertasConcluidos.length),
        screeningFalsosPositivosPct: pct(e.decisoesScreening.filter(d => d.decisao === 'falso_positivo').length, e.decisoesScreening.length),
        casosAbertos: casosAbertos.length,
        casosForaDoPrazo: casosAbertos.filter(c => c.prazo && c.prazo < e.hoje).length,
        tempoMedioCasoDias: media(e.casos.filter(c => c.encerrado_em).map(c => (Date.parse(c.encerrado_em!) - Date.parse(c.aberto_em)) / DIA)),
        comunicacoesUif: e.decisoesCasos.filter(d => d.tipo === 'uif' && d.decisao === 'comunicar').length,
        suspeitasFundamentadas: e.decisoesCasos.filter(d => d.tipo === 'conclusao' && d.decisao === 'suspeita_fundamentada').length,
    };
}
