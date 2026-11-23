// Calendário laboral: feriados nacionais de Angola (Lei n.º 11/18, que altera a Lei n.º 10/11) gerados por ano,
// com o Carnaval e a Sexta-Feira Santa pela Páscoa, as pontes (feriado à terça → segunda; à quinta → sexta), as datas
// internacionais que não são folga e o que o RH acrescenta ou desactiva (tolerâncias de ponto, feriados locais,
// pontes que o Governo não confirmou). É a fonte única para o ecrã de férias, o portal, o livro de ponto e o
// processamento salarial: estes recebem a lista de folgas como `Feriado[]` (folgasComoFeriados).
import { diaSemana, somarDias, type Feriado } from './ponto.ts';

export type TipoDiaCalendario = 'nacional' | 'ponte' | 'tolerancia' | 'local' | 'empresa' | 'data_internacional';
export type DiaCalendario = {
    data: string; nome: string; tipo: TipoDiaCalendario;
    /** Conta como dia sem trabalho (feriado, ponte activa, tolerância, local, dia da empresa). */
    folga: boolean;
    /** Desactivado pelo RH (uma ponte não confirmada ou um feriado que a empresa não guarda). */
    activo: boolean;
    /** Feriado nacional que também é data internacional (1/1, 8/3, 1/5, Sexta-Feira Santa, 25/12). */
    internacional?: boolean;
    origem: 'gerado' | 'manual';
    /** Linha de rh_feriado que define ou altera o dia (para editar). */
    registoId?: string;
    local?: string | null;
};

/** Linha guardada em rh_feriado (as colunas categoria e local foram acrescentadas depois). */
export type FeriadoRegistado = Feriado & { categoria?: string | null; local?: string | null };

const pad = (n: number) => String(n).padStart(2, '0');
const chave = (ano: number, mes: number, dia: number) => `${ano}-${pad(mes)}-${pad(dia)}`;

/** Domingo de Páscoa (algoritmo gregoriano anónimo de Meeus/Jones/Butcher), em AAAA-MM-DD. */
export function pascoa(ano: number): string {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return chave(ano, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
}

/** Feriados nacionais fixos (mês, dia, nome, também internacional). */
export const FERIADOS_FIXOS: Array<[number, number, string, boolean]> = [
    [1, 1, 'Dia do Ano Novo', true],
    [2, 4, 'Dia do Início da Luta Armada de Libertação Nacional', false],
    [3, 8, 'Dia Internacional da Mulher', true],
    [3, 23, 'Dia da Libertação da África Austral', false],
    [4, 4, 'Dia da Paz e da Reconciliação Nacional', false],
    [5, 1, 'Dia Internacional do Trabalhador', true],
    [9, 17, 'Dia do Fundador da Nação e do Herói Nacional', false],
    [11, 2, 'Dia dos Finados', false],
    [11, 11, 'Dia da Independência Nacional', false],
    [12, 25, 'Dia de Natal e da Família', true],
];

/** Datas internacionais mostradas só para informação (não são folga); o RH acrescenta outras. */
export const DATAS_INTERNACIONAIS: Array<[number, number, string]> = [
    [5, 25, 'Dia de África'],
    [6, 1, 'Dia Internacional da Criança'],
];

/** Feriados nacionais do ano (fixos + Carnaval e Sexta-Feira Santa), por data. */
export function feriadosNacionais(ano: number): DiaCalendario[] {
    const p = pascoa(ano);
    const lista: DiaCalendario[] = FERIADOS_FIXOS.map(([mes, dia, nome, internacional]) => ({
        data: chave(ano, mes, dia), nome, tipo: 'nacional', folga: true, activo: true, internacional, origem: 'gerado',
    }));
    lista.push({ data: somarDias(p, -47), nome: 'Dia do Carnaval', tipo: 'nacional', folga: true, activo: true, origem: 'gerado' });
    lista.push({ data: somarDias(p, -2), nome: 'Sexta-Feira Santa', tipo: 'nacional', folga: true, activo: true, internacional: true, origem: 'gerado' });
    return lista.sort((a, b) => a.data.localeCompare(b.data));
}

/** Ponte de um feriado: à terça → a segunda anterior; à quinta → a sexta seguinte (null nos outros dias). */
export function ponteDe(data: string): string | null {
    const dia = diaSemana(data);
    if (dia === 2) return somarDias(data, -1);
    if (dia === 4) return somarDias(data, 1);
    return null;
}

/** Data em que uma linha de rh_feriado cai no ano (as recorrentes repetem o dia e o mês). */
const dataNoAno = (r: FeriadoRegistado, ano: number) => {
    if (r.recorrente) {
        const md = r.data.slice(5, 10);
        // 29 de Fevereiro só nos anos bissextos.
        return md === '02-29' && new Date(Date.UTC(ano, 1, 29)).getUTCMonth() !== 1 ? null : `${ano}-${md}`;
    }
    return r.data.slice(0, 4) === String(ano) ? r.data.slice(0, 10) : null;
};

/** Categoria de uma linha: as antigas não a têm (nacional ou dia da empresa pelo tipo). */
export const categoriaDe = (r: FeriadoRegistado): TipoDiaCalendario => {
    const c = String(r.categoria || '');
    if (['nacional', 'ponte', 'tolerancia', 'local', 'empresa', 'data_internacional'].includes(c)) return c as TipoDiaCalendario;
    return r.tipo === 'nacional' ? 'nacional' : 'empresa';
};

export type OpcoesCalendario = {
    /** Gerar pontes a partir deste ano (os anos anteriores ficam como estavam no livro de ponto). */
    pontesDesde?: number;
    /** Local de trabalho do funcionário: os feriados locais de outros locais não contam para ele. */
    local?: string | null;
};

/**
 * Calendário de um ano: um dia por data (feriado, ponte, tolerância, local, dia da empresa ou data internacional).
 * O que o RH regista em rh_feriado prevalece sobre o gerado na mesma data (ex.: desactivar uma ponte).
 */
export function calendarioDoAno(ano: number, registados: FeriadoRegistado[] = [], opcoes: OpcoesCalendario = {}): Map<string, DiaCalendario> {
    const dias = new Map<string, DiaCalendario>();
    for (const f of feriadosNacionais(ano)) dias.set(f.data, f);
    const pontesDesligadas = new Map<string, FeriadoRegistado>();
    const pontesManuais: FeriadoRegistado[] = [];
    for (const r of registados) {
        const data = dataNoAno(r, ano);
        if (!data) continue;
        const categoria = categoriaDe(r);
        const activo = r.activo !== 0;
        if (categoria === 'ponte') {
            if (!activo) pontesDesligadas.set(data, r); else pontesManuais.push({ ...r, data });
            continue;
        }
        if (categoria === 'local' && opcoes.local !== undefined && r.local && r.local !== opcoes.local) continue;
        const existente = dias.get(data);
        if (existente?.origem === 'gerado' && categoria === 'nacional') {
            // A linha nacional antiga (semente) só serve para desactivar o feriado; o nome fica o da lei.
            dias.set(data, { ...existente, activo, folga: true, registoId: r.id });
            continue;
        }
        if (existente && existente.activo && existente.folga && !activo) continue;
        dias.set(data, {
            data, nome: r.nome, tipo: categoria, folga: categoria !== 'data_internacional', activo, origem: 'manual', registoId: r.id, local: r.local ?? null,
        });
    }
    if (ano >= (opcoes.pontesDesde ?? -Infinity)) {
        for (const f of feriadosNacionais(ano)) {
            const nacional = dias.get(f.data);
            if (!nacional?.activo) continue;
            const ponte = ponteDe(f.data);
            if (!ponte || ponte.slice(0, 4) !== String(ano)) continue;
            const ocupado = dias.get(ponte);
            if (ocupado && ocupado.folga && ocupado.activo) continue;
            const desligada = pontesDesligadas.get(ponte);
            dias.set(ponte, { data: ponte, nome: `Ponte (${nacional.nome})`, tipo: 'ponte', folga: true, activo: !desligada, origem: 'gerado', registoId: desligada?.id });
        }
    }
    for (const r of pontesManuais) {
        if (!dias.get(r.data)?.activo) dias.set(r.data, { data: r.data, nome: r.nome, tipo: 'ponte', folga: true, activo: true, origem: 'manual', registoId: r.id });
    }
    for (const [mes, dia, nome] of DATAS_INTERNACIONAIS) {
        const data = chave(ano, mes, dia);
        if (!dias.has(data)) dias.set(data, { data, nome, tipo: 'data_internacional', folga: false, activo: true, origem: 'gerado' });
    }
    return new Map([...dias.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/** Dias sem trabalho de um ano (folgas activas), por data. */
export function folgasDoAno(ano: number, registados: FeriadoRegistado[] = [], opcoes: OpcoesCalendario = {}): DiaCalendario[] {
    return [...calendarioDoAno(ano, registados, opcoes).values()].filter(d => d.folga && d.activo);
}

/**
 * Lista no formato do livro de ponto (`Feriado[]`, datas exactas) para os anos indicados, mais as linhas recorrentes
 * activas (para datas fora desses anos). Datas internacionais e pontes desligadas não entram.
 */
export function folgasComoFeriados(anos: number[], registados: FeriadoRegistado[] = [], opcoes: OpcoesCalendario = {}): Feriado[] {
    const lista: Feriado[] = [];
    for (const ano of [...new Set(anos)].sort()) {
        for (const d of folgasDoAno(ano, registados, opcoes)) {
            lista.push({ id: d.registoId || `cal-${d.data}`, data: d.data, nome: d.nome, tipo: d.tipo === 'nacional' || d.tipo === 'ponte' ? 'nacional' : 'empresa', recorrente: 0, activo: 1 });
        }
    }
    for (const r of registados) {
        const categoria = categoriaDe(r);
        if (r.activo === 0 || !r.recorrente || categoria === 'data_internacional' || categoria === 'ponte') continue;
        if (categoria === 'local' && opcoes.local !== undefined && r.local && r.local !== opcoes.local) continue;
        lista.push(r);
    }
    return lista;
}

/** Anos que o livro de ponto e os cálculos precisam: do ano anterior a dois anos à frente (atravessa o ano). */
export const anosDoCalendario = (hoje: string) => {
    const ano = Number(hoje.slice(0, 4));
    return [ano - 2, ano - 1, ano, ano + 1, ano + 2];
};
