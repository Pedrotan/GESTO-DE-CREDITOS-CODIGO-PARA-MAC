// Motor de cálculo salarial. Funções puras, em cêntimos (inteiros), com arredondamento ao cêntimo em cada passo.
// Ordem fixa de oito passos: rubricas → valores de referência → faltas e atrasos → bruto → INSS → IRT →
// outros descontos → líquido e custo da empresa. Nenhuma taxa está escrita aqui: chegam dos parâmetros em vigor.

export type EscalaoIRT = { limiteInferior: number; limiteSuperior: number | null; parcelaFixa: number; taxa: number };

/** IRT do Grupo A sobre a matéria colectável (valores em Kz, como na especificação). */
export function calcularIRT(materiaColectavel: number, escaloes: EscalaoIRT[]): number {
    const e = escaloes.find(x => materiaColectavel > x.limiteInferior && (x.limiteSuperior === null || materiaColectavel <= x.limiteSuperior));
    if (!e || e.taxa === 0) return 0; // 1.º escalão: isento
    const irt = e.parcelaFixa + (materiaColectavel - e.limiteInferior) * e.taxa;
    return Math.round(irt * 100) / 100;
}

/** O mesmo cálculo em cêntimos; devolve também o escalão usado. */
export function irtMinor(materiaMinor: number, escaloes: Array<{ limite_inferior_minor: number; limite_superior_minor: number | null; parcela_fixa_minor: number; taxa: number; ordem?: number }>) {
    const lista = [...escaloes].sort((a, b) => a.limite_inferior_minor - b.limite_inferior_minor);
    const indice = lista.findIndex(x => materiaMinor > x.limite_inferior_minor && (x.limite_superior_minor === null || materiaMinor <= x.limite_superior_minor));
    const e = lista[indice];
    if (!e || e.taxa === 0) return { irt: 0, escalao: indice >= 0 ? indice + 1 : 1, taxa: 0 };
    return { irt: Math.round(e.parcela_fixa_minor + (materiaMinor - e.limite_inferior_minor) * e.taxa), escalao: indice + 1, taxa: e.taxa };
}

export type TipoProcessamento = 'normal' | 'ferias' | 'natal' | 'acerto';
export type RubricaMotor = {
    id: string; codigo: string; nome: string; tipo: 'abono' | 'desconto'; forma: 'fixo' | 'percentagem' | 'quantidade'; percentagem: number;
    incide_inss: number; incide_irt: number; limite_isento_irt_minor: number; limite_isento_irt_pct: number; ordem_no_recibo: number;
};
/** Rubrica do funcionário (fixa) ou do mês (pontual): valor em cêntimos, ou % do salário base, ou quantidade × valor. */
export type LinhaEntrada = { rubrica: RubricaMotor; valorMinor: number; quantidade?: number; descricao?: string };

export type EntradaRecibo = {
    tipo: TipoProcessamento;
    salarioBaseMinor: number;
    horasSemanais: number;
    /** 30, ou o número de dias úteis do mês quando a empresa escolhe esse divisor. */
    divisorDia: number;
    /** Dias de calendário do mês fora do contrato (admissão ou saída a meio do mês). */
    diasForaContrato?: number;
    faltasDescontaveis: number;
    minutosAtraso: number;
    horasExtra: number;
    horasExtraFeriado: number;
    acrescimoHorasExtra: number;
    acrescimoHorasExtraFeriado: number;
    /** Subsídio de férias/Natal: fracção do salário base (0.5) e meses de serviço no ano (proporcional). */
    subsidioPct?: number;
    mesesServico?: number;
    rubricas: LinhaEntrada[];
    sistema: Record<'SAL_BASE' | 'FALTAS' | 'ATRASOS' | 'HORAS_EXTRA' | 'SUB_FERIAS' | 'SUB_NATAL', RubricaMotor>;
    taxaInssTrabalhador: number;
    taxaInssEmpresa: number;
    escaloes: Array<{ limite_inferior_minor: number; limite_superior_minor: number | null; parcela_fixa_minor: number; taxa: number }>;
};

export type LinhaRecibo = {
    rubrica_id: string; codigo: string; descricao: string; tipo: 'abono' | 'desconto'; quantidade: number; valor_unitario_minor: number;
    valor_minor: number; incide_inss: number; incide_irt: number; isento_irt_minor: number; ordem: number;
};

export type ResultadoRecibo = {
    linhas: LinhaRecibo[];
    valorDiaMinor: number; valorHoraMinor: number; diasTrabalhados: number;
    totalAbonosMinor: number; totalDescontosMinor: number; brutoMinor: number;
    baseInssMinor: number; inssTrabalhadorMinor: number; inssEmpresaMinor: number;
    isentoIrtMinor: number; materiaColectavelMinor: number; irtMinor: number; escalaoIrt: number; taxaIrt: number;
    outrosDescontosMinor: number; liquidoMinor: number; custoEmpresaMinor: number;
};

const r = (n: number) => Math.round(n);

export function calcularRecibo(e: EntradaRecibo): ResultadoRecibo {
    const linhas: LinhaRecibo[] = [];
    const base = Math.max(0, r(e.salarioBaseMinor));
    const linha = (rub: RubricaMotor, descricao: string, quantidade: number, unitario: number, valor: number) => {
        if (!valor) return;
        const isento = rub.tipo === 'abono' && rub.incide_irt
            ? Math.min(valor, rub.limite_isento_irt_pct > 0 ? r(base * rub.limite_isento_irt_pct) : rub.limite_isento_irt_minor || 0)
            : 0;
        linhas.push({ rubrica_id: rub.id, codigo: rub.codigo, descricao, tipo: rub.tipo, quantidade, valor_unitario_minor: unitario, valor_minor: valor,
            incide_inss: rub.incide_inss ? 1 : 0, incide_irt: rub.incide_irt ? 1 : 0, isento_irt_minor: Math.max(0, isento), ordem: rub.ordem_no_recibo });
    };

    // 2. Valores de referência: valor-dia (÷ 30 ou dias úteis) e valor-hora (× 12 ÷ (52 × horas semanais)).
    const valorDia = base / (e.divisorDia > 0 ? e.divisorDia : 30);
    const valorHora = e.horasSemanais > 0 ? (base * 12) / (52 * e.horasSemanais) : 0;

    // 1. Rubricas: salário base, subsídios do tipo de processamento, rubricas fixas e do mês.
    if (e.tipo === 'normal') linha(e.sistema.SAL_BASE, e.sistema.SAL_BASE.nome, 1, base, base);
    if (e.tipo === 'ferias' || e.tipo === 'natal') {
        const rub = e.tipo === 'ferias' ? e.sistema.SUB_FERIAS : e.sistema.SUB_NATAL;
        const meses = Math.min(12, Math.max(0, e.mesesServico ?? 12));
        const valor = r(base * (e.subsidioPct ?? 0.5) * (meses / 12));
        linha(rub, meses < 12 ? `${rub.nome} (${meses}/12 meses)` : rub.nome, meses / 12, base, valor);
    }
    for (const item of e.rubricas) {
        const q = item.quantidade ?? 1;
        const valor = item.rubrica.forma === 'percentagem' ? r(base * item.rubrica.percentagem * q)
            : item.rubrica.forma === 'quantidade' ? r(item.valorMinor * q) : r(item.valorMinor);
        linha(item.rubrica, item.descricao || item.rubrica.nome, q, item.rubrica.forma === 'percentagem' ? base : item.valorMinor, valor);
    }

    // 3. Faltas, atrasos e horas extra (só no processamento normal), lidos do livro de ponto e das ausências.
    let diasTrabalhados = e.divisorDia > 0 ? e.divisorDia : 30;
    if (e.tipo === 'normal') {
        const fora = Math.min(diasTrabalhados, Math.max(0, e.diasForaContrato || 0));
        if (fora) linha({ ...e.sistema.FALTAS, nome: 'Dias fora do contrato' }, `Dias fora do contrato (admissão/saída)`, fora, r(valorDia), Math.min(base, r(valorDia * fora)));
        if (e.faltasDescontaveis > 0) linha(e.sistema.FALTAS, e.sistema.FALTAS.nome, e.faltasDescontaveis, r(valorDia), r(valorDia * e.faltasDescontaveis));
        if (e.minutosAtraso > 0) linha(e.sistema.ATRASOS, `${e.sistema.ATRASOS.nome} (${e.minutosAtraso} min)`, Math.round((e.minutosAtraso / 60) * 100) / 100, r(valorHora), r((valorHora * e.minutosAtraso) / 60));
        if (e.horasExtra > 0) linha(e.sistema.HORAS_EXTRA, `${e.sistema.HORAS_EXTRA.nome} (+${Math.round(e.acrescimoHorasExtra * 100)}%)`, e.horasExtra, r(valorHora * (1 + e.acrescimoHorasExtra)), r(valorHora * e.horasExtra * (1 + e.acrescimoHorasExtra)));
        if (e.horasExtraFeriado > 0) linha(e.sistema.HORAS_EXTRA, `${e.sistema.HORAS_EXTRA.nome} em feriado/descanso (+${Math.round(e.acrescimoHorasExtraFeriado * 100)}%)`, e.horasExtraFeriado, r(valorHora * (1 + e.acrescimoHorasExtraFeriado)), r(valorHora * e.horasExtraFeriado * (1 + e.acrescimoHorasExtraFeriado)));
        diasTrabalhados = Math.max(0, Math.round((diasTrabalhados - fora - e.faltasDescontaveis) * 100) / 100);
    }

    linhas.sort((a, b) => a.ordem - b.ordem);
    const abonos = linhas.filter(l => l.tipo === 'abono');
    // Descontos que reduzem a remuneração (faltas, atrasos e outros que incidem INSS/IRT) e os restantes (após impostos).
    const descontosBrutos = linhas.filter(l => l.tipo === 'desconto' && (l.incide_inss || l.incide_irt));
    const outros = linhas.filter(l => l.tipo === 'desconto' && !l.incide_inss && !l.incide_irt);
    const soma = (ls: LinhaRecibo[]) => ls.reduce((s, l) => s + l.valor_minor, 0);

    // 4. Remuneração bruta.
    const totalAbonos = soma(abonos);
    const bruto = totalAbonos - soma(descontosBrutos);
    // 5. INSS.
    const baseInss = Math.max(0, soma(abonos.filter(l => l.incide_inss)) - soma(descontosBrutos.filter(l => l.incide_inss)));
    const inssTrab = r(baseInss * e.taxaInssTrabalhador);
    const inssEmp = r(baseInss * e.taxaInssEmpresa);
    // 6. IRT: rubricas sujeitas − partes isentas − descontos que incidem IRT − INSS do trabalhador.
    const isento = abonos.reduce((s, l) => s + (l.incide_irt ? l.isento_irt_minor : 0), 0);
    const materia = Math.max(0, soma(abonos.filter(l => l.incide_irt)) - isento - soma(descontosBrutos.filter(l => l.incide_irt)) - inssTrab);
    const irt = irtMinor(materia, e.escaloes);
    // 7. Outros descontos (adiantamentos, quotas, prestações de crédito interno).
    const outrosDescontos = soma(outros);
    // 8. Líquido e custo da empresa.
    const liquido = bruto - inssTrab - irt.irt - outrosDescontos;
    return {
        linhas, valorDiaMinor: r(valorDia), valorHoraMinor: r(valorHora), diasTrabalhados,
        totalAbonosMinor: totalAbonos, totalDescontosMinor: soma(descontosBrutos) + inssTrab + irt.irt + outrosDescontos, brutoMinor: bruto,
        baseInssMinor: baseInss, inssTrabalhadorMinor: inssTrab, inssEmpresaMinor: inssEmp,
        isentoIrtMinor: isento, materiaColectavelMinor: materia, irtMinor: irt.irt, escalaoIrt: irt.escalao, taxaIrt: irt.taxa,
        outrosDescontosMinor: outrosDescontos, liquidoMinor: liquido, custoEmpresaMinor: bruto + inssEmp,
    };
}

/** Meses de serviço no ano (para os subsídios proporcionais no ano de admissão ou de saída). */
export function mesesServicoNoAno(ano: number, admissao: string, saida?: string | null) {
    const inicio = admissao > `${ano}-01-01` ? admissao : `${ano}-01-01`;
    const fim = saida && saida < `${ano}-12-31` ? saida : `${ano}-12-31`;
    if (fim < inicio) return 0;
    const [, m1, d1] = inicio.split('-').map(Number);
    const [, m2] = fim.split('-').map(Number);
    // Conta o mês de admissão se entrou até dia 15.
    return Math.max(0, Math.min(12, m2 - m1 + (d1 <= 15 ? 1 : 0)));
}

/** Dias de calendário do mês fora do contrato, na escala do divisor (mês completo = divisor). */
export function diasForaDoContrato(ano: number, mes: number, admissao: string, saida: string | null | undefined, divisor: number) {
    const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const chave = `${ano}-${String(mes).padStart(2, '0')}`;
    let fora = 0;
    for (let d = 1; d <= dias; d++) {
        const dia = `${chave}-${String(d).padStart(2, '0')}`;
        if (dia < admissao || (saida && dia > saida)) fora += 1;
    }
    if (!fora) return 0;
    if (fora >= dias) return divisor;
    return Math.round((fora / dias) * divisor * 100) / 100;
}
