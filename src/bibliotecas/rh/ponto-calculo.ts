// Motor do Livro de ponto (especificação, secção 10). Funções puras e determinísticas: os mesmos dados dão
// sempre o mesmo resultado. Cada dia de cada funcionário recebe um estado (pela prioridade da secção 3) e os
// minutos trabalhados, de atraso, de saída antecipada, extra e nocturnos, calculados a partir das marcações.
// Horas em hora local de Angola, no formato «aaaa-mm-ddTHH:MM» (sem fuso: o dia de trabalho é o calendário local).
import { valorNumerico, valorTexto, type ParametroRH } from './parametros-rh.ts';
import { diaSemana, diasTrabalho, feriadoNaData, minutosPrevistos, somarDias, type Feriado, type Horario, type TipoAusencia } from './ponto.ts';

export type TipoMarcacao = 'entrada' | 'saida' | 'inicio_pausa' | 'fim_pausa';
export type OrigemMarcacao = 'manual' | 'csv' | 'relogio' | 'app' | 'quiosque';
export type Marcacao = {
    id: string; funcionario_id: string; data: string; data_hora: string; tipo: TipoMarcacao | null; origem: OrigemMarcacao;
    anulada?: number; pendente_validacao?: number; criado_por_nome?: string | null;
};

/** Estado principal da célula. FORA = antes da admissão ou depois da saída; FUTURO = data posterior a hoje. */
export type EstadoDia = 'FR' | 'FS' | 'Fe' | 'L' | 'D' | 'FJ' | 'F' | 'P' | 'SEM_REGISTO' | 'FUTURO' | 'FORA';

export type ConfigPonto = {
    tolerancia_entrada_min: number; tolerancia_saida_min: number; tolerancia_cumulativa: boolean; minimo_extra_min: number;
    arredondamento_min: number; pausa_almoco_auto_min: number; inicio_noturno: string; fim_noturno: string;
    limite_extra_diario_min: number; limite_extra_anual_min: number; hora_alerta_sem_marcacao: string; lancar_falta_automatica: boolean;
    exigir_fecho_para_salarios: boolean; autoregisto_app: boolean; exigir_geolocalizacao: boolean; raio_permitido_m: number;
    local_latitude: number | null; local_longitude: number | null; exigir_selfie: boolean; alerta_atrasos_mes: number;
    banco_horas_activo: boolean; banco_validade_meses: number; alertas_email: boolean; email_rh: string; notificacoes_ambiente: boolean;
};

/** Valores por omissão da especificação (secção 4.6). Os valores legais confirmam-se com a LGT e o contabilista. */
export const CONFIG_PONTO_OMISSAO: ConfigPonto = {
    tolerancia_entrada_min: 10, tolerancia_saida_min: 5, tolerancia_cumulativa: false, minimo_extra_min: 15, arredondamento_min: 0,
    pausa_almoco_auto_min: 60, inicio_noturno: '20:00', fim_noturno: '06:00', limite_extra_diario_min: 120, limite_extra_anual_min: 12_000,
    hora_alerta_sem_marcacao: '08:30', lancar_falta_automatica: false, exigir_fecho_para_salarios: true, autoregisto_app: false,
    exigir_geolocalizacao: false, raio_permitido_m: 200, local_latitude: null, local_longitude: null, exigir_selfie: false, alerta_atrasos_mes: 3,
    banco_horas_activo: false, banco_validade_meses: 6, alertas_email: false, email_rh: '', notificacoes_ambiente: true,
};

/** Chave do parâmetro (rh_parametro) de cada opção: o ponto usa os parâmetros com vigência do módulo de RH. */
export const chaveParametroPonto = (campo: keyof ConfigPonto) => `ponto_${campo}`;

export function configDosParametros(parametros: ParametroRH[], data: string): ConfigPonto {
    const config = { ...CONFIG_PONTO_OMISSAO } as Record<string, unknown>;
    for (const [campo, omissao] of Object.entries(CONFIG_PONTO_OMISSAO)) {
        const chave = chaveParametroPonto(campo as keyof ConfigPonto);
        if (typeof omissao === 'boolean') config[campo] = ['1', 'true', 'sim'].includes(valorTexto(parametros, chave, data, omissao ? '1' : '0').toLowerCase());
        else if (typeof omissao === 'string') config[campo] = valorTexto(parametros, chave, data, omissao);
        else {
            const texto = valorTexto(parametros, chave, data, '');
            config[campo] = texto.trim() === '' ? omissao : valorNumerico(parametros, chave, data, Number(omissao ?? 0));
        }
    }
    return config as ConfigPonto;
}

const HORA = /^(\d{1,2}):(\d{2})$/u;
const DATA_HORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/u;
const minutosDaHora = (hora: string) => {
    const m = HORA.exec(hora.trim());
    if (!m) throw new Error(`Hora inválida: ${hora}`);
    return Number(m[1]) * 60 + Number(m[2]);
};
/** Minutos absolutos de «aaaa-mm-ddTHH:MM» (relógio local, sem fuso). */
export const minutosAbsolutos = (dataHora: string) => {
    const m = DATA_HORA.exec(dataHora);
    if (!m) throw new Error(`Data e hora inválidas: ${dataHora}`);
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) / 60_000;
};
const inicioDoDia = (data: string) => Date.parse(`${data}T00:00:00Z`) / 60_000;
export const horaDe = (dataHora: string | null | undefined) => (dataHora ? dataHora.slice(11, 16) : null);
/** «aaaa-mm-ddTHH:MM» a partir de minutos absolutos. */
export const dataHoraDe = (minutos: number) => new Date(minutos * 60_000).toISOString().slice(0, 16);

export type AusenciaDoDia = {
    id: string; tipo: TipoAusencia | undefined; estado: 'pendente' | 'aprovada' | 'anulada';
    /** Ausência de meio dia (manhã ou tarde). */
    meio_dia?: 'manha' | 'tarde' | null;
    /** Ausência por horas num só dia (fracção do dia). */
    horas?: number;
    /** Pedido de justificação do funcionário à espera de decisão. */
    justificacao_pendente?: boolean;
};

export type DiaPonto = {
    data: string;
    estado: EstadoDia;
    /** Dia útil no horário, sem feriado. */
    util: boolean;
    feriado: string | null;
    entrada_prevista: string | null;
    saida_prevista: string | null;
    primeira_entrada: string | null;
    ultima_saida: string | null;
    minutos_trabalhados: number;
    minutos_pausa: number;
    minutos_atraso: number;
    minutos_saida_antecipada: number;
    minutos_extra: number;
    /** Tipo das horas extra, para o processamento: dia útil, descanso ou feriado. */
    tipo_extra: 'util' | 'descanso' | 'feriado' | null;
    minutos_noturnos: number;
    incompleto: boolean;
    /** Fracção do dia em falta (1, 0,5 ou horas ÷ horas do dia) e se é injustificada ou justificada. */
    falta_fraccao: number;
    falta_tipo: 'F' | 'FJ' | null;
    /** Fracção que desconta no salário (ausência aprovada de um tipo que desconta). */
    desconto_fraccao: number;
    ausencia_id: string | null;
    ausencia_pendente: boolean;
    /** Marcações ignoradas (repetidas em menos de 2 minutos). */
    ignoradas: string[];
    /** Pares de trabalho e de pausa, para o painel do dia. */
    segmentos: Array<{ inicio: string; fim: string | null; tipo: 'trabalho' | 'pausa' }>;
    aviso: string | null;
};

const vazio = (data: string, estado: EstadoDia, extra: Partial<DiaPonto> = {}): DiaPonto => ({
    data, estado, util: false, feriado: null, entrada_prevista: null, saida_prevista: null, primeira_entrada: null, ultima_saida: null,
    minutos_trabalhados: 0, minutos_pausa: 0, minutos_atraso: 0, minutos_saida_antecipada: 0, minutos_extra: 0, tipo_extra: null,
    minutos_noturnos: 0, incompleto: false, falta_fraccao: 0, falta_tipo: null, desconto_fraccao: 0, ausencia_id: null, ausencia_pendente: false,
    ignoradas: [], segmentos: [], aviso: null, ...extra,
});

/** Código da ausência no livro de ponto (secção 3). */
export function estadoDaAusencia(tipo: TipoAusencia | undefined): 'Fe' | 'L' | 'D' | 'FJ' | 'F' {
    if (!tipo) return 'F';
    if (tipo.desconta_ferias || tipo.codigo === 'FE') return 'Fe';
    if (tipo.codigo === 'L' || /licen/iu.test(tipo.nome)) return 'L';
    if (tipo.codigo === 'D') return 'D';
    return tipo.justificada ? 'FJ' : 'F';
}

/** Remove marcações do mesmo tipo repetidas em menos de 2 minutos (picagem dupla no relógio). */
function semRepetidas(marcacoes: Marcacao[]) {
    const ordenadas = marcacoes.filter(m => !m.anulada).sort((a, b) => a.data_hora.localeCompare(b.data_hora) || a.id.localeCompare(b.id));
    const ficam: Marcacao[] = [];
    const ignoradas: string[] = [];
    for (const m of ordenadas) {
        const anterior = ficam[ficam.length - 1];
        if (anterior && anterior.tipo === m.tipo && minutosAbsolutos(m.data_hora) - minutosAbsolutos(anterior.data_hora) < 2) ignoradas.push(m.id);
        else ficam.push(m);
    }
    return { ficam, ignoradas };
}

/**
 * Emparelha as marcações em segmentos de trabalho e de pausa. Com tipos: entrada abre o trabalho, início de pausa
 * fecha-o e abre a pausa, fim de pausa volta ao trabalho, saída fecha. Sem tipos (relógio simples): alterna
 * entrada/saída pela ordem. Uma entrada a seguir a outra entrada deixa o dia incompleto.
 */
function emparelhar(marcacoes: Marcacao[]) {
    const segmentos: Array<{ inicio: number; fim: number | null; tipo: 'trabalho' | 'pausa' }> = [];
    let aberto: { inicio: number; tipo: 'trabalho' | 'pausa' } | null = null;
    let incoerente = false;
    const semTipo = marcacoes.every(m => !m.tipo);
    marcacoes.forEach((m, indice) => {
        const t = minutosAbsolutos(m.data_hora);
        const tipo: TipoMarcacao = semTipo ? (indice % 2 === 0 ? 'entrada' : 'saida') : (m.tipo || (aberto ? 'saida' : 'entrada'));
        if (tipo === 'entrada') {
            if (aberto) { incoerente = true; segmentos.push({ ...aberto, fim: null }); }
            aberto = { inicio: t, tipo: 'trabalho' };
        } else if (tipo === 'inicio_pausa') {
            if (aberto?.tipo === 'trabalho') segmentos.push({ inicio: aberto.inicio, fim: t, tipo: 'trabalho' });
            else incoerente = true;
            aberto = { inicio: t, tipo: 'pausa' };
        } else if (tipo === 'fim_pausa') {
            if (aberto?.tipo === 'pausa') segmentos.push({ inicio: aberto.inicio, fim: t, tipo: 'pausa' });
            else incoerente = true;
            aberto = { inicio: t, tipo: 'trabalho' };
        } else {
            if (aberto?.tipo === 'trabalho') segmentos.push({ inicio: aberto.inicio, fim: t, tipo: 'trabalho' });
            else incoerente = true;
            aberto = null;
        }
    });
    if (aberto) segmentos.push({ ...(aberto as { inicio: number; tipo: 'trabalho' | 'pausa' }), fim: null });
    return { segmentos, aberto: Boolean(aberto) || incoerente, comPausas: segmentos.some(s => s.tipo === 'pausa') };
}

/** Minutos de um segmento dentro da janela nocturna (que atravessa a meia-noite). */
function minutosNoturnos(inicio: number, fim: number, config: ConfigPonto) {
    const ini = minutosDaHora(config.inicio_noturno);
    const fimJanela = minutosDaHora(config.fim_noturno);
    let total = 0;
    for (let dia = Math.floor(inicio / 1440) - 1; dia <= Math.floor(fim / 1440); dia += 1) {
        const base = dia * 1440;
        const janelas = ini > fimJanela ? [[base + ini, base + 1440 + fimJanela]] : [[base + ini, base + fimJanela]];
        for (const [a, b] of janelas) total += Math.max(0, Math.min(fim, b) - Math.max(inicio, a));
    }
    return total;
}

const arredondar = (minutos: number, passo: number) => (passo > 0 ? Math.floor(minutos / passo) * passo : minutos);

export type EntradaDia = {
    data: string; hoje: string; agora?: string; horario: Horario; feriados: Feriado[]; config: ConfigPonto;
    marcacoes: Marcacao[]; ausencia?: AusenciaDoDia | null; admissao?: string | null; saida?: string | null;
};

/** Algoritmo da secção 10.1: estado do dia e minutos, a partir do horário, do calendário, das ausências e das marcações. */
export function calcularDiaPonto(e: EntradaDia): DiaPonto {
    const { data, horario, config } = e;
    if ((e.admissao && data < e.admissao) || (e.saida && data > e.saida)) return vazio(data, 'FORA');

    const feriado = feriadoNaData(e.feriados, data)?.nome || null;
    const trabalha = diasTrabalho(horario).has(diaSemana(data));
    const util = trabalha && !feriado;
    // Horário flexível: o previsto é o mínimo diário e as referências de atraso e saída são a faixa obrigatória.
    const flexivel = horario.tipo === 'flexivel' && Boolean(horario.faixa_inicio && horario.faixa_fim);
    const previsto = flexivel && Number(horario.minimo_diario_min) > 0 ? Number(horario.minimo_diario_min) : minutosPrevistos(horario);
    const ausencia = e.ausencia && e.ausencia.estado !== 'anulada' ? e.ausencia : null;
    const estadoAusencia = ausencia ? estadoDaAusencia(ausencia.tipo) : null;
    const horasDia = previsto / 60 || 8;
    const parcial = ausencia ? (ausencia.meio_dia ? 0.5 : ausencia.horas && ausencia.horas > 0 ? Math.min(1, ausencia.horas / horasDia) : 1) : 0;

    // 1–2. Estado base pela prioridade: feriado, descanso, férias, licença, dispensa, falta justificada, falta.
    let base: EstadoDia | null = feriado ? 'FR' : !trabalha ? 'FS' : null;
    if (!base && estadoAusencia) base = estadoAusencia;
    // Previsto do dia, deslocado para a metade que se trabalha quando há meio dia de ausência.
    const entradaHorario = minutosDaHora(horario.entrada);
    let saidaHorario = minutosDaHora(horario.saida);
    if (saidaHorario <= entradaHorario) saidaHorario += 1440;
    const meioDia = ausencia?.meio_dia || null;
    const metade = Math.round(previsto / 2);
    const fimDoDiaMin = inicioDoDia(data) + saidaHorario;
    let entradaPrevistaMin = inicioDoDia(data) + (meioDia === 'manha' ? saidaHorario - metade : entradaHorario);
    let saidaPrevistaMin = inicioDoDia(data) + (meioDia === 'tarde' ? entradaHorario + metade : saidaHorario);
    if (flexivel && !meioDia) {
        const inicioFaixa = minutosDaHora(horario.faixa_inicio!);
        let fimFaixa = minutosDaHora(horario.faixa_fim!);
        if (fimFaixa <= inicioFaixa) fimFaixa += 1440;
        entradaPrevistaMin = inicioDoDia(data) + inicioFaixa;
        saidaPrevistaMin = inicioDoDia(data) + fimFaixa;
    }
    const previstoDia = meioDia ? previsto - metade : previsto;

    const { ficam, ignoradas } = semRepetidas(e.marcacoes.filter(m => m.data === data));
    const comum = {
        util, feriado, ignoradas,
        entrada_prevista: util ? dataHoraDe(entradaPrevistaMin) : null,
        saida_prevista: util ? dataHoraDe(saidaPrevistaMin) : null,
        ausencia_id: ausencia?.id || null,
        ausencia_pendente: Boolean(ausencia && (ausencia.estado === 'pendente' || ausencia.justificacao_pendente)),
    };
    const faltaDoDia = (fraccao: number) => {
        if (!ausencia || (estadoAusencia !== 'F' && estadoAusencia !== 'FJ') || !util) return { falta_fraccao: 0, falta_tipo: null, desconto_fraccao: 0 };
        return {
            falta_fraccao: fraccao, falta_tipo: estadoAusencia,
            desconto_fraccao: ausencia.estado === 'aprovada' && ausencia.tipo?.desconta_salario ? fraccao : 0,
        };
    };

    // 4. Sem marcações.
    if (ficam.length === 0) {
        if (base) {
            const falta = faltaDoDia(parcial);
            const descontoOutro = ausencia && util && ausencia.estado === 'aprovada' && ausencia.tipo?.desconta_salario && !falta.falta_tipo ? parcial : 0;
            return vazio(data, base, { ...comum, ...falta, desconto_fraccao: falta.desconto_fraccao || descontoOutro });
        }
        if (data > e.hoje) return vazio(data, 'FUTURO', comum);
        return vazio(data, 'SEM_REGISTO', comum);
    }

    // 8. Emparelhar as marcações.
    const { segmentos, aberto, comPausas } = emparelhar(ficam);
    const diaTerminou = data < e.hoje || (data === e.hoje && Boolean(e.agora) && minutosAbsolutos(e.agora!) > Math.max(saidaPrevistaMin, fimDoDiaMin) + 120);
    const incompleto = aberto && (diaTerminou || segmentos.some((s, i) => s.fim === null && i < segmentos.length - 1));
    const trabalho = segmentos.filter(s => s.tipo === 'trabalho' && s.fim !== null) as Array<{ inicio: number; fim: number; tipo: 'trabalho' }>;
    const pausas = segmentos.filter(s => s.tipo === 'pausa' && s.fim !== null) as Array<{ inicio: number; fim: number; tipo: 'pausa' }>;
    const presenca = trabalho.reduce((soma, s) => soma + (s.fim - s.inicio), 0);
    // 9. Pausa automática: sem marcações de pausa, um só bloco de presença com mais de 6 horas e horário com almoço.
    const intervalo = Number(horario.intervalo_min) > 0 ? Number(horario.intervalo_min) : 0;
    const pausaAuto = !comPausas && trabalho.length === 1 && presenca > 360 && intervalo > 0 ? Math.min(intervalo, config.pausa_almoco_auto_min || intervalo) : 0;
    const trabalhados = Math.max(0, presenca - pausaAuto);
    const minutosPausa = pausas.reduce((soma, s) => soma + (s.fim - s.inicio), 0) + pausaAuto;
    const primeira = minutosAbsolutos(ficam[0].data_hora);
    const ultimaSaida = trabalho.length ? trabalho[trabalho.length - 1].fim : null;

    // 5. Trabalho em dia de descanso ou feriado: o estado mantém-se e todas as horas contam como extra.
    // Férias, licença ou dispensa de dia inteiro com marcações: a ausência prevalece (inconsistência a avisar).
    const ausenciaInteira = base && ['Fe', 'L', 'D'].includes(base) && parcial >= 1;
    const descanso = base === 'FR' || base === 'FS';
    const estado: EstadoDia = descanso || ausenciaInteira ? base! : base && ['F', 'FJ'].includes(base) && parcial >= 1 ? base : 'P';
    const aviso = ausenciaInteira ? 'Há marcações num dia de ausência de dia inteiro: confirme qual está certo.'
        : base && ['F', 'FJ'].includes(base) && parcial >= 1 ? 'Há marcações num dia com falta lançada: confirme qual está certo.'
        : ignoradas.length ? `${ignoradas.length} marcação(ões) repetida(s) ignorada(s).` : null;

    // 10–11. Atraso e saída antecipada (só em dias úteis com presença; nunca em dia incompleto para a saída).
    const conta = (bruto: number, tolerancia: number) => (bruto <= tolerancia ? 0 : config.tolerancia_cumulativa ? bruto : bruto - tolerancia);
    const atraso = util && estado === 'P' ? conta(Math.max(0, primeira - entradaPrevistaMin), config.tolerancia_entrada_min) : 0;
    const antecipada = util && estado === 'P' && !incompleto && ultimaSaida !== null
        ? conta(Math.max(0, saidaPrevistaMin - ultimaSaida), config.tolerancia_saida_min) : 0;

    // 12. Horas extra.
    let extra = 0;
    let tipoExtra: DiaPonto['tipo_extra'] = null;
    if (!incompleto && !ausenciaInteira) {
        if (descanso) {
            extra = arredondar(trabalhados, config.arredondamento_min);
            tipoExtra = base === 'FR' ? 'feriado' : 'descanso';
        } else if (estado === 'P') {
            const bruto = Math.max(0, trabalhados - previstoDia);
            extra = bruto < config.minimo_extra_min ? 0 : arredondar(bruto, config.arredondamento_min);
            tipoExtra = extra > 0 ? 'util' : null;
        }
    }
    // 13. Trabalho nocturno.
    const noturnos = trabalho.reduce((soma, s) => soma + minutosNoturnos(s.inicio, s.fim, config), 0);

    const falta = faltaDoDia(estado === 'P' ? parcial : parcial >= 1 ? 1 : parcial);
    return {
        ...vazio(data, estado), ...comum, ...falta,
        primeira_entrada: dataHoraDe(primeira), ultima_saida: ultimaSaida !== null ? dataHoraDe(ultimaSaida) : null,
        minutos_trabalhados: trabalhados, minutos_pausa: minutosPausa, minutos_atraso: atraso, minutos_saida_antecipada: antecipada,
        minutos_extra: extra, tipo_extra: extra > 0 ? tipoExtra : null, minutos_noturnos: noturnos, incompleto, aviso,
        segmentos: segmentos.map(s => ({ inicio: dataHoraDe(s.inicio), fim: s.fim === null ? null : dataHoraDe(s.fim), tipo: s.tipo })),
    };
}

export type TotaisFuncionario = {
    presencas: number; faltas: number; faltas_just: number; minutos_trabalhados: number; minutos_atraso: number; minutos_saida_antecipada: number;
    minutos_extra: number; minutos_extra_util: number; minutos_extra_descanso: number; minutos_extra_feriado: number; minutos_noturnos: number;
    pendentes: number; incompletos: number; atrasos: number; dias_uteis: number; faltas_descontaveis: number; dias_trabalho_efectivo: number;
    ausencias_pendentes: number;
};

/** Totais de um funcionário num conjunto de dias (colunas de resumo e valores enviados ao processamento salarial). */
export function totaisDosDias(dias: DiaPonto[], hoje: string): TotaisFuncionario {
    const t: TotaisFuncionario = {
        presencas: 0, faltas: 0, faltas_just: 0, minutos_trabalhados: 0, minutos_atraso: 0, minutos_saida_antecipada: 0, minutos_extra: 0,
        minutos_extra_util: 0, minutos_extra_descanso: 0, minutos_extra_feriado: 0, minutos_noturnos: 0, pendentes: 0, incompletos: 0, atrasos: 0,
        dias_uteis: 0, faltas_descontaveis: 0, dias_trabalho_efectivo: 0, ausencias_pendentes: 0,
    };
    const pendentesAusencia = new Set<string>();
    for (const d of dias) {
        if (d.util) t.dias_uteis += 1;
        if (d.estado === 'P') t.presencas += 1;
        if (d.minutos_trabalhados > 0) t.dias_trabalho_efectivo += 1;
        if (d.falta_tipo === 'F') t.faltas += d.falta_fraccao;
        if (d.falta_tipo === 'FJ') t.faltas_just += d.falta_fraccao;
        t.faltas_descontaveis += d.desconto_fraccao;
        t.minutos_trabalhados += d.minutos_trabalhados;
        t.minutos_atraso += d.minutos_atraso;
        if (d.minutos_atraso > 0) t.atrasos += 1;
        t.minutos_saida_antecipada += d.minutos_saida_antecipada;
        t.minutos_extra += d.minutos_extra;
        if (d.tipo_extra === 'util') t.minutos_extra_util += d.minutos_extra;
        if (d.tipo_extra === 'descanso') t.minutos_extra_descanso += d.minutos_extra;
        if (d.tipo_extra === 'feriado') t.minutos_extra_feriado += d.minutos_extra;
        t.minutos_noturnos += d.minutos_noturnos;
        if (d.estado === 'SEM_REGISTO' && d.data < hoje) t.pendentes += 1;
        if (d.incompleto) t.incompletos += 1;
        if (d.ausencia_pendente && d.ausencia_id) pendentesAusencia.add(d.ausencia_id);
    }
    t.ausencias_pendentes = pendentesAusencia.size;
    t.faltas = Math.round(t.faltas * 100) / 100;
    t.faltas_just = Math.round(t.faltas_just * 100) / 100;
    t.faltas_descontaveis = Math.round(t.faltas_descontaveis * 100) / 100;
    return t;
}

/** Datas de «aaaa-mm-dd» a «aaaa-mm-dd» (inclusive). */
export function intervaloDatas(inicio: string, fim: string) {
    const datas: string[] = [];
    for (let d = inicio; d <= fim; d = somarDias(d, 1)) datas.push(d);
    return datas;
}

/** «hh:mm» a partir de minutos (para as colunas de horas). */
export const formatarMinutos = (minutos: number) => {
    const sinal = minutos < 0 ? '-' : '';
    const m = Math.abs(Math.round(minutos));
    return `${sinal}${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

/** Infere o tipo das marcações sem tipo de um dia (relógio simples): primeira = entrada, última = saída, intermédias = pausas. */
export function inferirTipos<T extends { data_hora: string }>(marcacoes: T[]): Array<T & { tipo: TipoMarcacao }> {
    const ordenadas = [...marcacoes].sort((a, b) => a.data_hora.localeCompare(b.data_hora));
    return ordenadas.map((m, i) => ({
        ...m,
        tipo: i === 0 ? 'entrada' : i === ordenadas.length - 1 ? 'saida' : i % 2 === 1 ? 'inicio_pausa' : 'fim_pausa',
    }));
}

/** Distância em metros entre dois pontos (fórmula de Haversine), para a área permitida da marcação na app. */
export function distanciaMetros(lat1: number, lon1: number, lat2: number, lon2: number) {
    const raio = 6_371_000;
    const rad = (graus: number) => (graus * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * raio * Math.asin(Math.min(1, Math.sqrt(a)));
}
