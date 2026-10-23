// Validade do Bilhete de Identidade dos clientes (e dos funcionários). Datas em texto aaaa-mm-dd, contadas no
// calendário (sem horas), para o resultado não mudar com o fuso horário do computador.

export type EstadoBI = 'valido' | 'a_expirar' | 'expirado' | 'sem_data';

export type SituacaoBI = { estado: EstadoBI; dias: number | null; texto: string; validade: string | null };

const DIA_MS = 86_400_000;
const chave = (valor: string | null | undefined) => (valor || '').slice(0, 10);
const valida = (valor: string) => /^\d{4}-\d{2}-\d{2}$/u.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));
const utc = (valor: string) => Date.parse(`${valor}T00:00:00Z`);
const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Soma meses a uma data, ajustando o dia ao fim do mês (31/01 + 1 mês = 28/02). */
function somarMeses(dataChave: string, meses: number) {
    const [a, m, d] = dataChave.split('-').map(Number);
    const total = a * 12 + (m - 1) + meses;
    const ano = Math.floor(total / 12);
    const mes = (total % 12) + 1;
    return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(Math.min(d, diasNoMes(ano, mes))).padStart(2, '0')}`;
}

/** Diferença no calendário entre duas datas (de <= ate): anos e meses completos e os dias que sobram. */
export function diferencaCalendario(de: string, ate: string) {
    const [a1, m1] = de.split('-').map(Number);
    const [a2, m2] = ate.split('-').map(Number);
    let meses = (a2 - a1) * 12 + (m2 - m1);
    if (somarMeses(de, meses) > ate) meses -= 1;
    const dias = Math.round((utc(ate) - utc(somarMeses(de, meses))) / DIA_MS);
    return { anos: Math.floor(meses / 12), meses: meses % 12, dias };
}

/**
 * Estado do BI numa data: «expirado» no dia seguinte à validade, «a expirar» quando faltam `diasAviso` dias
 * ou menos, «válido» nos restantes casos.
 */
export function estadoBI(validade: string | null | undefined, hoje: string, diasAviso = 90): SituacaoBI {
    const fim = chave(validade);
    if (!valida(fim)) return { estado: 'sem_data', dias: null, texto: 'Validade do BI não registada', validade: null };
    const dias = Math.round((utc(fim) - utc(chave(hoje))) / DIA_MS);
    if (dias < 0) return { estado: 'expirado', dias, texto: `BI expirado há ${plural(-dias, 'dia', 'dias')}`, validade: fim };
    const { anos, meses, dias: d } = diferencaCalendario(chave(hoje), fim);
    const partes = [anos ? plural(anos, 'ano', 'anos') : '', meses ? plural(meses, 'mês', 'meses') : '', d || (!anos && !meses) ? plural(d, 'dia', 'dias') : '']
        .filter(Boolean);
    const lista = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}` : partes[0];
    const estado: EstadoBI = dias <= diasAviso ? 'a_expirar' : 'valido';
    const texto = dias === 0 ? 'BI expira hoje' : `${estado === 'valido' ? 'BI válido' : 'BI a expirar'} — faltam ${lista}`;
    return { estado, dias, texto, validade: fim };
}

/** Validade sugerida quando o campo fica vazio: emissão + N anos (a data inscrita no documento prevalece). */
export function validadeSugerida(emissao: string | null | undefined, anos: number): string | null {
    const inicio = chave(emissao);
    if (!valida(inicio) || !Number.isFinite(anos) || anos <= 0) return null;
    const [a, m, d] = inicio.split('-').map(Number);
    const dia = Math.min(d, diasNoMes(a + anos, m));
    return `${String(a + anos).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Erros das datas do BI: emissão não pode ser futura; validade tem de ser posterior à emissão. */
export function validarDatasBI(emissao: string | null | undefined, validade: string | null | undefined, hoje: string): string[] {
    const erros: string[] = [];
    const e = chave(emissao);
    const v = chave(validade);
    if (e && !valida(e)) erros.push('A data de emissão do BI é inválida.');
    if (v && !valida(v)) erros.push('A data de validade do BI é inválida.');
    if (valida(e) && e > chave(hoje)) erros.push('A data de emissão do BI não pode ser futura.');
    if (valida(e) && valida(v) && v <= e) erros.push('A validade do BI tem de ser posterior à data de emissão.');
    return erros;
}

export const ROTULO_ESTADO_BI: Record<EstadoBI, string> = {
    valido: 'Válido', a_expirar: 'A expirar', expirado: 'Expirado', sem_data: 'Sem validade',
};
