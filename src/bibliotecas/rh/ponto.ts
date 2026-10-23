// Regras do livro de ponto: horas trabalhadas, atrasos, horas extra, dias úteis e resumo mensal que alimenta o
// processamento salarial. Funções puras (datas aaaa-mm-dd, horas HH:MM), testadas sem base de dados.

export type Horario = { id: string; nome: string; entrada: string; saida: string; intervalo_min: number; dias_semana: string; tolerancia_min: number; activo?: number };
export type Feriado = { id: string; data: string; nome: string; tipo: 'nacional' | 'empresa'; recorrente: number; activo?: number };
export type RegistoPonto = { id?: string; funcionario_id: string; data: string; entrada: string | null; saida: string | null; horas_trabalhadas: number; horas_extra: number; minutos_atraso: number };
export type TipoAusencia = { id: string; codigo: string; nome: string; justificada: number; remunerada: number; desconta_salario: number; desconta_ferias: number; exige_documento: number; sistema?: number; activo?: number };
export type Ausencia = {
    id: string; funcionario_id: string; tipo_id: string; data_inicio: string; data_fim: string; dias: number; horas: number;
    estado: 'pendente' | 'aprovada' | 'anulada'; motivo?: string | null; pedido_dispensa?: number;
};

export const HORARIO_OMISSAO: Horario = { id: 'horario-normal', nome: 'Horário normal', entrada: '08:00', saida: '17:00', intervalo_min: 60, dias_semana: '1,2,3,4,5', tolerancia_min: 10 };

const minutos = (hora: string) => {
    const m = /^(\d{1,2}):(\d{2})$/u.exec(hora.trim());
    if (!m) throw new Error(`Hora inválida: ${hora}`);
    const valor = Number(m[1]) * 60 + Number(m[2]);
    if (Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`Hora inválida: ${hora}`);
    return valor;
};
const arred2 = (n: number) => Math.round(n * 100) / 100;
const diaUtc = (data: string) => Date.parse(`${data}T00:00:00Z`);
export const somarDias = (data: string, dias: number) => new Date(diaUtc(data) + dias * 86_400_000).toISOString().slice(0, 10);
/** Dia da semana ISO: 1 = segunda … 7 = domingo. */
export const diaSemana = (data: string) => ((new Date(diaUtc(data)).getUTCDay() + 6) % 7) + 1;
export const diasDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
export const chaveMes = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`;
export const datasDoMes = (ano: number, mes: number) =>
    Array.from({ length: diasDoMes(ano, mes) }, (_, i) => `${chaveMes(ano, mes)}-${String(i + 1).padStart(2, '0')}`);

/** Minutos de trabalho previstos num dia do horário (saída − entrada − intervalo). */
export const minutosPrevistos = (h: Horario) => Math.max(0, minutos(h.saida) - minutos(h.entrada) - (Number(h.intervalo_min) || 0));
/** Horas semanais do horário (para o valor-hora). */
export const horasSemanais = (h: Horario) => arred2((minutosPrevistos(h) / 60) * diasTrabalho(h).size);
export const diasTrabalho = (h: Horario) => new Set(String(h.dias_semana || '').split(',').map(Number).filter(n => n >= 1 && n <= 7));

/** Feriados activos que caem numa data (os recorrentes contam todos os anos no mesmo dia e mês). */
export function feriadoNaData(feriados: Feriado[], data: string): Feriado | undefined {
    return feriados.find(f => f.activo !== 0 && (f.recorrente ? f.data.slice(5, 10) === data.slice(5, 10) : f.data.slice(0, 10) === data));
}

export const ehDiaUtil = (data: string, horario: Horario, feriados: Feriado[]) => diasTrabalho(horario).has(diaSemana(data)) && !feriadoNaData(feriados, data);

/** Dias úteis entre duas datas (inclusive), sem fins-de-semana do horário nem feriados. */
export function diasUteis(inicio: string, fim: string, horario: Horario, feriados: Feriado[]): number {
    let total = 0;
    for (let d = inicio; d <= fim; d = somarDias(d, 1)) if (ehDiaUtil(d, horario, feriados)) total += 1;
    return total;
}

/**
 * Calcula um dia de ponto a partir da entrada e da saída. O intervalo só é descontado em dias com mais
 * de 6 horas de presença. Atraso: minutos depois da hora de entrada, contados só quando passam a tolerância.
 * Horas extra: o que excede o previsto num dia útil; em feriado ou dia de descanso, todas as horas.
 */
export function calcularDia(entrada: string, saida: string, horario: Horario, diaUtil: boolean) {
    const ini = minutos(entrada);
    let fim = minutos(saida);
    if (fim <= ini) fim += 24 * 60; // turno que passa a meia-noite
    const presenca = fim - ini;
    const intervalo = presenca > 6 * 60 ? Number(horario.intervalo_min) || 0 : 0;
    const trabalhados = Math.max(0, presenca - intervalo);
    const atraso = diaUtil ? Math.max(0, ini - minutos(horario.entrada)) : 0;
    const minutosAtraso = atraso > (Number(horario.tolerancia_min) || 0) ? atraso : 0;
    const extra = diaUtil ? Math.max(0, trabalhados - minutosPrevistos(horario)) : trabalhados;
    return { horas_trabalhadas: arred2(trabalhados / 60), horas_extra: arred2(extra / 60), minutos_atraso: minutosAtraso };
}

/** Código de cada dia no livro de ponto (P, F, FJ, Fé, D, L, FR, FS; «?» = dia útil passado sem registo) e a cor. */
export type CodigoDia = 'P' | 'F' | 'FJ' | 'Fé' | 'D' | 'L' | 'FR' | 'FS' | '?' | '';
export const CORES_CODIGO: Record<CodigoDia, string> = {
    P: 'bg-emerald-100 text-emerald-800', F: 'bg-red-100 text-red-700', FJ: 'bg-amber-100 text-amber-800', 'Fé': 'bg-sky-100 text-sky-800',
    D: 'bg-violet-100 text-violet-800', L: 'bg-fuchsia-100 text-fuchsia-800', FR: 'bg-slate-200 text-slate-700', FS: 'bg-slate-100 text-slate-400', '?': 'bg-white text-amber-600 ring-1 ring-amber-200', '': '',
};

export function codigoAusencia(tipo: TipoAusencia | undefined): CodigoDia {
    if (!tipo) return 'F';
    if (tipo.desconta_ferias || tipo.codigo === 'FE') return 'Fé';
    if (tipo.codigo === 'D') return 'D';
    if (tipo.codigo === 'L' || /licen/iu.test(tipo.nome)) return 'L';
    return tipo.justificada ? 'FJ' : 'F';
}

/** Ausência aprovada (ou pendente, para mostrar) que cobre a data. As anuladas não contam. */
export const ausenciaNaData = (ausencias: Ausencia[], funcionarioId: string, data: string) =>
    ausencias.find(a => a.funcionario_id === funcionarioId && a.estado !== 'anulada' && a.data_inicio <= data && a.data_fim >= data);

export function codigoDia(p: { funcionarioId: string; data: string; horario: Horario; feriados: Feriado[]; pontos: Map<string, RegistoPonto>; ausencias: Ausencia[]; tipos: Map<string, TipoAusencia>; admissao?: string | null; saida?: string | null; hoje: string }): CodigoDia {
    const { funcionarioId, data } = p;
    if ((p.admissao && data < p.admissao) || (p.saida && data > p.saida)) return '';
    const ausencia = ausenciaNaData(p.ausencias, funcionarioId, data);
    const util = ehDiaUtil(data, p.horario, p.feriados);
    if (ausencia && (util || ausencia.horas > 0)) return codigoAusencia(p.tipos.get(ausencia.tipo_id));
    const registo = p.pontos.get(`${funcionarioId}:${data}`);
    if (registo?.entrada) return 'P';
    if (feriadoNaData(p.feriados, data)) return 'FR';
    if (!util) return 'FS';
    return data < p.hoje ? '?' : '';
}

export type ResumoMes = {
    diasUteis: number; diasPresenca: number; faltasInjustificadas: number; faltasDescontaveis: number; faltasJustificadas: number;
    diasSemRegisto: number; minutosAtraso: number; horasExtra: number; horasExtraFeriado: number; ausenciasPendentes: number;
};

/**
 * Resumo do mês de um funcionário para o processamento. Conta como falta descontável cada dia útil coberto
 * por uma ausência aprovada cujo tipo desconta salário. Dias úteis passados sem registo nem ausência
 * aparecem em `diasSemRegisto` (aviso), mas não descontam: o salário corrige-se no ponto, não à mão.
 * Ausências por horas descontam a fracção do dia (horas ÷ horas do dia).
 */
export function resumoMes(p: { funcionarioId: string; ano: number; mes: number; horario: Horario; feriados: Feriado[]; pontos: RegistoPonto[]; ausencias: Ausencia[]; tipos: TipoAusencia[]; admissao?: string | null; saida?: string | null; hoje: string }): ResumoMes {
    const tipos = new Map(p.tipos.map(t => [t.id, t]));
    const pontos = new Map(p.pontos.filter(r => r.funcionario_id === p.funcionarioId).map(r => [r.data, r]));
    const horasDia = minutosPrevistos(p.horario) / 60 || 8;
    const r: ResumoMes = { diasUteis: 0, diasPresenca: 0, faltasInjustificadas: 0, faltasDescontaveis: 0, faltasJustificadas: 0, diasSemRegisto: 0, minutosAtraso: 0, horasExtra: 0, horasExtraFeriado: 0, ausenciasPendentes: 0 };
    for (const data of datasDoMes(p.ano, p.mes)) {
        if ((p.admissao && data < p.admissao) || (p.saida && data > p.saida)) continue;
        const util = ehDiaUtil(data, p.horario, p.feriados);
        const registo = pontos.get(data);
        if (registo) {
            r.minutosAtraso += Number(registo.minutos_atraso) || 0;
            if (util) r.horasExtra += Number(registo.horas_extra) || 0;
            else r.horasExtraFeriado += Number(registo.horas_extra) || 0;
            if (registo.entrada && util) r.diasPresenca += 1;
        }
        if (!util) continue;
        r.diasUteis += 1;
        const ausencia = p.ausencias.find(a => a.funcionario_id === p.funcionarioId && a.estado === 'aprovada' && a.data_inicio <= data && a.data_fim >= data);
        if (ausencia) {
            const tipo = tipos.get(ausencia.tipo_id);
            const fraccao = ausencia.horas > 0 && ausencia.data_inicio === ausencia.data_fim ? Math.min(1, ausencia.horas / horasDia) : 1;
            if (tipo?.desconta_salario) r.faltasDescontaveis += fraccao;
            if (tipo && !tipo.justificada) r.faltasInjustificadas += fraccao;
            else r.faltasJustificadas += fraccao;
        } else if (!registo?.entrada && data < p.hoje) {
            r.diasSemRegisto += 1;
        }
    }
    r.ausenciasPendentes = p.ausencias.filter(a => a.funcionario_id === p.funcionarioId && a.estado === 'pendente' &&
        a.data_inicio <= `${chaveMes(p.ano, p.mes)}-31` && a.data_fim >= `${chaveMes(p.ano, p.mes)}-01`).length;
    for (const k of ['faltasInjustificadas', 'faltasDescontaveis', 'faltasJustificadas', 'horasExtra', 'horasExtraFeriado'] as const) r[k] = arred2(r[k]);
    return r;
}

/**
 * Lê um ficheiro CSV de relógio biométrico: n.º mecanográfico; data; entrada; saída (separador ; ou , e
 * datas aaaa-mm-dd ou dd/mm/aaaa). Devolve as linhas válidas e os erros por linha.
 */
export function lerCsvPonto(texto: string) {
    const linhas: Array<{ numero: string; data: string; entrada: string; saida: string }> = [];
    const erros: string[] = [];
    texto.split(/\r?\n/u).forEach((linha, i) => {
        if (!linha.trim()) return;
        const partes = linha.split(/[;,\t]/u).map(p => p.trim().replace(/^"|"$/gu, ''));
        if (i === 0 && /n[uú]mero|data/iu.test(partes.join(' '))) return; // cabeçalho
        const [numero, dataBruta, entrada, saida] = partes;
        const data = /^\d{2}\/\d{2}\/\d{4}$/u.test(dataBruta || '') ? dataBruta.split('/').reverse().join('-') : dataBruta;
        if (!numero || !/^\d{4}-\d{2}-\d{2}$/u.test(data || '') || !/^\d{1,2}:\d{2}$/u.test(entrada || '') || !/^\d{1,2}:\d{2}$/u.test(saida || '')) {
            erros.push(`Linha ${i + 1}: formato inválido («${linha.slice(0, 60)}»).`);
            return;
        }
        linhas.push({ numero, data, entrada: entrada.padStart(5, '0'), saida: saida.padStart(5, '0') });
    });
    return { linhas, erros };
}
