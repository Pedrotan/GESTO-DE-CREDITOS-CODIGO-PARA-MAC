// Importação de marcações de relógios biométricos (especificação F3.5): ler o CSV, escolher as colunas (mapeamento
// guardado por modelo de relógio), pré-visualizar cada linha com o seu estado e inferir entrada/saída quando o
// relógio não as indica. Puro e testado: o serviço só grava as linhas válidas.
import { inferirTipos, type TipoMarcacao } from './ponto-calculo.ts';
import { somarDias, type Horario } from './ponto.ts';

/** Uma marcação por linha (relógios biométricos) ou entrada e saída na mesma linha (formato da versão anterior). */
export type ModoCsv = 'marcacoes' | 'entrada_saida';
export type MapeamentoCsv = {
    modo: ModoCsv;
    /** Índices das colunas (0 = primeira). `data_hora` é usado quando a data e a hora vêm na mesma coluna. */
    numero: number; data: number | null; hora: number | null; data_hora: number | null; tipo: number | null;
    entrada: number | null; saida: number | null;
    cabecalho: boolean;
};

export const MAPEAMENTO_ANTERIOR: MapeamentoCsv = { modo: 'entrada_saida', numero: 0, data: 1, hora: null, data_hora: null, tipo: null, entrada: 2, saida: 3, cabecalho: true };

export type EstadoLinha = 'valida' | 'duplicada' | 'funcionario_desconhecido' | 'data_invalida';
export type LinhaPrevia = {
    linha: number; numero: string; funcionario_id: string | null; nome: string | null; data: string | null; data_hora: string | null;
    tipo: TipoMarcacao | null; estado: EstadoLinha; detalhe: string;
};

const SEPARADORES = [';', ',', '\t'];

/** Separa um CSV em linhas e colunas (aspas simples ou duplas, separador detectado na primeira linha). */
export function lerTabelaCsv(texto: string): string[][] {
    const linhas = texto.replace(/^\uFEFF/u, '').split(/\r?\n/u).filter(l => l.trim());
    if (!linhas.length) return [];
    const separador = SEPARADORES.map(s => [s, linhas[0].split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
    return linhas.map(linha => linha.split(separador).map(celula => celula.trim().replace(/^["']|["']$/gu, '').trim()));
}

/** Data em aaaa-mm-dd a partir de aaaa-mm-dd, dd/mm/aaaa, dd-mm-aaaa ou dd.mm.aaaa. */
export function normalizarData(valor: string): string | null {
    const v = valor.trim();
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/u.exec(v);
    if (m) return valida(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/u.exec(v);
    if (m) return valida(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    return null;
}
const valida = (data: string) => {
    const [a, mes, d] = data.split('-').map(Number);
    const dt = new Date(Date.UTC(a, mes - 1, d));
    return dt.getUTCFullYear() === a && dt.getUTCMonth() === mes - 1 && dt.getUTCDate() === d ? data : null;
};

/** Hora em HH:MM (aceita segundos e um dígito na hora). */
export function normalizarHora(valor: string): string | null {
    const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/u.exec(valor.trim());
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
    return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Tipo indicado pelo relógio (palavras ou códigos comuns), ou null para inferir. */
export function normalizarTipo(valor: string | undefined): TipoMarcacao | null {
    const v = String(valor || '').trim().toLowerCase();
    if (!v) return null;
    if (/^(e|in|entrada|check[- ]?in|0|i)$/u.test(v)) return 'entrada';
    if (/^(s|out|saida|saída|check[- ]?out|1|o)$/u.test(v)) return 'saida';
    if (/pausa.*(inicio|início)|break[- ]?out|^2$/u.test(v)) return 'inicio_pausa';
    if (/pausa.*fim|fim.*pausa|break[- ]?in|^3$/u.test(v)) return 'fim_pausa';
    return null;
}

type FuncionarioCsv = { id: string; nome: string; numero_mecanografico: string; horario: Horario };
type Existente = { funcionario_id: string; data_hora: string; tipo: TipoMarcacao | null };

/**
 * Pré-visualização: cada linha com o funcionário, o dia de trabalho, a hora e o estado. As marcações sem tipo
 * de um mesmo dia recebem-no por ordem (primeira entrada, última saída, intermédias pausas). Num horário que
 * passa a meia-noite, uma marcação até 2 h depois da saída prevista pertence ao turno do dia anterior.
 */
export function previsualizarCsv(texto: string, mapa: MapeamentoCsv, funcionarios: FuncionarioCsv[], existentes: Existente[]): LinhaPrevia[] {
    const tabela = lerTabelaCsv(texto);
    const porNumero = new Map<string, FuncionarioCsv>();
    for (const f of funcionarios) {
        porNumero.set(f.numero_mecanografico, f);
        porNumero.set(f.numero_mecanografico.replace(/^0+/u, ''), f);
    }
    const linhas: LinhaPrevia[] = [];
    tabela.forEach((colunas, indice) => {
        if (indice === 0 && mapa.cabecalho) return;
        const numero = colunas[mapa.numero] || '';
        const f = porNumero.get(numero) || porNumero.get(numero.replace(/^0+/u, ''));
        const base = { linha: indice + 1, numero, funcionario_id: f?.id || null, nome: f?.nome || null };
        let data: string | null = null;
        const horas: Array<[string | null, TipoMarcacao | null]> = [];
        if (mapa.data_hora !== null) {
            const [d, h] = String(colunas[mapa.data_hora] || '').split(/[ T]/u);
            data = normalizarData(d || '');
            horas.push([normalizarHora(h || ''), mapa.tipo !== null ? normalizarTipo(colunas[mapa.tipo]) : null]);
        } else {
            data = mapa.data !== null ? normalizarData(colunas[mapa.data] || '') : null;
            if (mapa.modo === 'entrada_saida') {
                horas.push([mapa.entrada !== null ? normalizarHora(colunas[mapa.entrada] || '') : null, 'entrada']);
                if (mapa.saida !== null && (colunas[mapa.saida] || '').trim()) horas.push([normalizarHora(colunas[mapa.saida] || ''), 'saida']);
            } else {
                horas.push([mapa.hora !== null ? normalizarHora(colunas[mapa.hora] || '') : null, mapa.tipo !== null ? normalizarTipo(colunas[mapa.tipo]) : null]);
            }
        }
        for (const [hora, tipo] of horas) {
            if (!data || !hora) { linhas.push({ ...base, data, data_hora: null, tipo, estado: 'data_invalida', detalhe: 'Data ou hora em formato inválido.' }); continue; }
            if (!f) { linhas.push({ ...base, data, data_hora: `${data}T${hora}`, tipo, estado: 'funcionario_desconhecido', detalhe: `N.º ${numero || '(vazio)'} não corresponde a nenhum funcionário.` }); continue; }
            // Turno nocturno: a saída depois da meia-noite pertence ao dia da entrada.
            const turnoNocturno = f.horario.saida <= f.horario.entrada;
            let dia = data;
            let dataHora = `${data}T${hora}`;
            if (turnoNocturno && hora <= addHoras(f.horario.saida, 2) && tipo !== 'entrada') dia = somarDias(data, -1);
            if (mapa.modo === 'entrada_saida' && tipo === 'saida' && horas[0][0] && hora <= horas[0][0]) dataHora = `${somarDias(data, 1)}T${hora}`;
            linhas.push({ ...base, data: dia, data_hora: dataHora, tipo, estado: 'valida', detalhe: '' });
        }
    });

    // Inferência dos tipos em falta, por funcionário e dia.
    const grupos = new Map<string, LinhaPrevia[]>();
    for (const l of linhas.filter(x => x.estado === 'valida' && !x.tipo)) {
        const chave = `${l.funcionario_id}:${l.data}`;
        grupos.set(chave, [...(grupos.get(chave) || []), l]);
    }
    for (const grupo of grupos.values()) {
        for (const comTipo of inferirTipos(grupo.map(l => ({ ...l, data_hora: l.data_hora! })))) {
            const original = grupo.find(l => l.linha === comTipo.linha && l.data_hora === comTipo.data_hora);
            if (original) original.tipo = comTipo.tipo;
        }
    }

    // Duplicados: já existentes (mesmo funcionário, hora e tipo) ou repetidos no próprio ficheiro.
    const vistos = new Set(existentes.map(e => `${e.funcionario_id}|${e.data_hora}|${e.tipo || ''}`));
    for (const l of linhas) {
        if (l.estado !== 'valida') continue;
        const chave = `${l.funcionario_id}|${l.data_hora}|${l.tipo || ''}`;
        if (vistos.has(chave)) { l.estado = 'duplicada'; l.detalhe = 'Já existe esta marcação: será ignorada.'; continue; }
        vistos.add(chave);
    }
    return linhas;
}

const addHoras = (hora: string, horas: number) => {
    const [h, m] = hora.split(':').map(Number);
    const total = Math.min(23 * 60 + 59, h * 60 + m + horas * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** Identificador estável de uma marcação importada: o mesmo ficheiro importado em dois computadores não duplica. */
export const idMarcacaoImportada = (funcionarioId: string, dataHora: string, tipo: TipoMarcacao | null) => `csv:${funcionarioId}:${dataHora}:${tipo || 'x'}`;

/** Relatório de erros da importação (CSV para descarregar). */
export function relatorioErros(linhas: LinhaPrevia[]) {
    const cabecalho = 'linha;numero;data;hora;estado;detalhe';
    const corpo = linhas.filter(l => l.estado !== 'valida').map(l => [l.linha, l.numero, l.data || '', l.data_hora?.slice(11) || '', l.estado, l.detalhe.replace(/;/gu, ',')].join(';'));
    return [cabecalho, ...corpo].join('\n');
}
