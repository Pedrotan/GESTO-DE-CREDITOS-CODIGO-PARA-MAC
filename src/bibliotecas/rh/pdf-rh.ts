// Documentos de RH em PDF com a marca da empresa (applyBranding): dispensa, recibo de vencimento e folha de salários.
import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from '@/bibliotecas/pdf-tabela';
import { applyBranding, brandingHeaderBottom, getCompanySettings, resolveBrandPrimary, writeClosingNote } from '@/bibliotecas/pdf';
import { formatCurrency } from '@/bibliotecas/formatters';

export type SaidaPdf = 'save' | 'datauri';
export type FicheiroPdf = { fileName: string; dataUrl: string };
const dataPt = (v?: string | null) => (v ? v.slice(0, 10).split('-').reverse().join('/') : '—');

function terminar(doc: jsPDF, fileName: string, saida: SaidaPdf): FicheiroPdf {
    if (saida === 'save') doc.save(fileName);
    return { fileName, dataUrl: doc.output('datauristring') };
}

function assinaturas(doc: jsPDF, y: number, rotulos: string[]) {
    const largura = doc.internal.pageSize.getWidth();
    const passo = (largura - 40) / rotulos.length;
    doc.setDrawColor(148, 163, 184);
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    rotulos.forEach((rotulo, i) => {
        const x = 20 + i * passo + 6;
        doc.line(x, y, x + passo - 12, y);
        doc.text(rotulo, x + (passo - 12) / 2, y + 4, { align: 'center' });
    });
}

export type DadosDispensa = {
    numero: string; emitidoEm: string; funcionario: { nome: string; numero: string; cargo?: string; departamento?: string; bi?: string | null };
    tipo: string; inicio: string; fim: string; dias: number; horas: number; remunerada: boolean; motivo?: string | null; aprovadoPor?: string | null;
};

/** Dispensa numerada: período, dias ou horas, se é remunerada, motivo e campos de assinatura. */
export function gerarDispensaPdf(d: DadosDispensa, settings: unknown, userName: string, saida: SaidaPdf = 'save'): FicheiroPdf {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const cor = resolveBrandPrimary(config.primaryColor);
    applyBranding(doc, config, userName);
    let y = brandingHeaderBottom(doc) + 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text('DISPENSA DE SERVIÇO', 105, y, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(cor[0], cor[1], cor[2]);
    doc.text(`N.º ${d.numero}`, 105, y + 7, { align: 'center' });
    y += 16;
    autoTable(doc, {
        startY: y,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2.4 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, fillColor: [248, 250, 252] } },
        body: [
            ['Funcionário', `${d.funcionario.nome} (n.º ${d.funcionario.numero})`],
            ['Cargo / departamento', [d.funcionario.cargo, d.funcionario.departamento].filter(Boolean).join(' · ') || '—'],
            ['BI', d.funcionario.bi || '—'],
            ['Tipo', d.tipo],
            ['Período', d.horas > 0 ? `${dataPt(d.inicio)} — ${d.horas} hora(s)` : `${dataPt(d.inicio)} a ${dataPt(d.fim)} (${d.dias} dia(s) útil(eis))`],
            ['Remunerada', d.remunerada ? 'Sim' : 'Não (desconta no salário)'],
            ['Motivo', d.motivo || '—'],
            ['Aprovada por', d.aprovadoPor || '—'],
            ['Emitida em', dataPt(d.emitidoEm)],
        ],
        didDrawPage: () => applyBranding(doc, config, userName, true),
    });
    const fim = (doc as any).lastAutoTable?.finalY || y + 60;
    assinaturas(doc, fim + 32, ['O funcionário', 'O chefe', 'Recursos Humanos']);
    writeClosingNote(doc, `Documento ${d.numero} emitido pelo sistema; a ausência fica registada no livro de ponto.`, fim + 40, config, userName, { line: false });
    return terminar(doc, `Dispensa-${d.numero.replace(/[^\w]+/gu, '-')}.pdf`, saida);
}


const kz = (minor: number) => formatCurrency((Number(minor) || 0) / 100);
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const periodoPt = (ano: number, mes: number) => `${MESES[mes - 1]} de ${ano}`;

export type ReciboPdf = {
    numero_recibo: string; nome: string; numero_mecanografico: string | null; cargo: string | null; departamento: string | null; nif: string | null;
    numero_inss: string | null; iban: string | null; banco: string | null; salario_base_minor: number; dias_trabalhados: number; bruto_minor: number;
    base_inss_minor: number; inss_minor: number; isento_irt_minor: number; base_irt_minor: number; irt_minor: number; escalao_irt: number | null;
    outros_descontos_minor: number; liquido_minor: number; inss_emp_minor: number;
};
export type LinhaPdf = { descricao: string; tipo: 'abono' | 'desconto'; quantidade: number; valor_minor: number; codigo: string };
export type CabecalhoProcessamento = { ano: number; mes: number; tipoRotulo: string; estado: string; irtTabela?: string | null };

function desenharRecibo(doc: jsPDF, r: ReciboPdf, linhas: LinhaPdf[], p: CabecalhoProcessamento, config: ReturnType<typeof getCompanySettings>, userName: string) {
    const cor = resolveBrandPrimary(config.primaryColor);
    applyBranding(doc, config, userName);
    let y = brandingHeaderBottom(doc) + 10;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(15, 23, 42);
    doc.text('RECIBO DE VENCIMENTO', 105, y, { align: 'center' });
    doc.setFontSize(9); doc.setTextColor(cor[0], cor[1], cor[2]);
    doc.text(`${p.tipoRotulo} · ${periodoPt(p.ano, p.mes)} · N.º ${r.numero_recibo}`, 105, y + 6, { align: 'center' });
    y += 11;
    autoTable(doc, {
        startY: y, theme: 'grid', styles: { fontSize: 8, cellPadding: 1.6 },
        columnStyles: { 0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 32 }, 2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 32 } },
        body: [
            ['Funcionário', `${r.nome} (n.º ${r.numero_mecanografico || '—'})`, 'Cargo', r.cargo || '—'],
            ['NIF', r.nif || '—', 'N.º INSS', r.numero_inss || '—'],
            ['Departamento', r.departamento || '—', 'Dias trabalhados', String(r.dias_trabalhados)],
            ['Salário base', kz(r.salario_base_minor), 'IBAN', r.iban ? `${r.iban}${r.banco ? ` (${r.banco})` : ''}` : '—'],
        ],
        didDrawPage: () => applyBranding(doc, config, userName, true),
    });
    y = ((doc as any).lastAutoTable?.finalY || y + 30) + 4;
    autoTable(doc, {
        startY: y, theme: 'striped', styles: { fontSize: 8, cellPadding: 1.6 }, headStyles: { fillColor: cor },
        head: [['Rubrica', 'Qtd.', 'Abonos', 'Descontos']],
        body: [
            ...linhas.map(l => [l.descricao, l.quantidade === 1 ? '' : String(l.quantidade), l.tipo === 'abono' ? kz(l.valor_minor) : '', l.tipo === 'desconto' ? kz(l.valor_minor) : '']),
            ['Segurança Social (INSS) do trabalhador', '', '', kz(r.inss_minor)],
            [`IRT${r.escalao_irt ? ` (${r.escalao_irt}.º escalão)` : ''}`, '', '', kz(r.irt_minor)],
        ],
        columnStyles: { 1: { halign: 'center', cellWidth: 16 }, 2: { halign: 'right', cellWidth: 34 }, 3: { halign: 'right', cellWidth: 34 } },
        didDrawPage: () => applyBranding(doc, config, userName, true),
    });
    y = ((doc as any).lastAutoTable?.finalY || y + 40) + 4;
    autoTable(doc, {
        startY: y, theme: 'grid', styles: { fontSize: 8, cellPadding: 1.6 },
        columnStyles: { 0: { fontStyle: 'bold', fillColor: [248, 250, 252] }, 1: { halign: 'right' }, 2: { fontStyle: 'bold', fillColor: [248, 250, 252] }, 3: { halign: 'right' } },
        body: [
            ['Remuneração bruta', kz(r.bruto_minor), 'Base de INSS', kz(r.base_inss_minor)],
            ['Parte isenta de IRT', kz(r.isento_irt_minor), 'Matéria colectável IRT', kz(r.base_irt_minor)],
            ['Outros descontos', kz(r.outros_descontos_minor), 'INSS da entidade empregadora', kz(r.inss_emp_minor)],
        ],
        didDrawPage: () => applyBranding(doc, config, userName, true),
    });
    y = ((doc as any).lastAutoTable?.finalY || y + 20) + 6;
    doc.setFillColor(cor[0], cor[1], cor[2]);
    doc.roundedRect(120, y, 70, 11, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(`LÍQUIDO: ${kz(r.liquido_minor)}`, 155, y + 7.2, { align: 'center' });
    doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    if (p.irtTabela) doc.text(`Tabela do IRT: ${p.irtTabela}`, 20, y + 5, { maxWidth: 95 });
    assinaturas(doc, y + 30, ['A entidade empregadora', 'O funcionário (recebi)']);
    if (p.estado === 'calculado' || p.estado === 'aberto') {
        doc.setTextColor(220, 38, 38); doc.setFontSize(8);
        doc.text('RASCUNHO — processamento ainda não aprovado', 105, y + 40, { align: 'center' });
    }
}

/** Recibo de vencimento de um funcionário. */
export function gerarReciboPdf(r: ReciboPdf, linhas: LinhaPdf[], p: CabecalhoProcessamento, settings: unknown, userName: string, saida: SaidaPdf = 'save'): FicheiroPdf {
    const doc = new jsPDF();
    desenharRecibo(doc, r, linhas, p, getCompanySettings(settings), userName);
    return terminar(doc, `Recibo-${r.numero_recibo}-${r.nome.replace(/[^\w]+/gu, '_')}.pdf`, saida);
}

/** Todos os recibos de um processamento num único PDF (uma página por funcionário). */
export function gerarRecibosPdf(recibos: Array<{ recibo: ReciboPdf; linhas: LinhaPdf[] }>, p: CabecalhoProcessamento, settings: unknown, userName: string, saida: SaidaPdf = 'save'): FicheiroPdf {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    recibos.forEach((item, i) => { if (i > 0) doc.addPage(); desenharRecibo(doc, item.recibo, item.linhas, p, config, userName); });
    return terminar(doc, `Recibos-${p.ano}-${String(p.mes).padStart(2, '0')}-${p.tipoRotulo.replace(/[^\w]+/gu, '_')}.pdf`, saida);
}

/** Folha de salários mensal: todos os funcionários e totais por departamento. */
export function gerarFolhaPdf(recibos: ReciboPdf[], p: CabecalhoProcessamento, settings: unknown, userName: string, saida: SaidaPdf = 'save'): FicheiroPdf {
    const doc = new jsPDF({ orientation: 'landscape' });
    const config = getCompanySettings(settings);
    const cor = resolveBrandPrimary(config.primaryColor);
    applyBranding(doc, config, userName);
    const y = brandingHeaderBottom(doc) + 9;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(15, 23, 42);
    doc.text(`FOLHA DE SALÁRIOS — ${p.tipoRotulo.toUpperCase()} — ${periodoPt(p.ano, p.mes).toUpperCase()}`, 148, y, { align: 'center' });
    const soma = (lista: ReciboPdf[], k: keyof ReciboPdf) => lista.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const departamentos = [...new Set(recibos.map(r => r.departamento || 'Sem departamento'))].sort();
    const corpo: string[][] = [];
    for (const d of departamentos) {
        const lista = recibos.filter(r => (r.departamento || 'Sem departamento') === d);
        lista.forEach(r => corpo.push([r.numero_mecanografico || '', r.nome, r.cargo || '', kz(r.salario_base_minor), kz(r.bruto_minor), kz(r.inss_minor), kz(r.irt_minor), kz(r.outros_descontos_minor), kz(r.liquido_minor), kz(r.inss_emp_minor)]));
        corpo.push(['', `Total ${d}`, '', '', kz(soma(lista, 'bruto_minor')), kz(soma(lista, 'inss_minor')), kz(soma(lista, 'irt_minor')), kz(soma(lista, 'outros_descontos_minor')), kz(soma(lista, 'liquido_minor')), kz(soma(lista, 'inss_emp_minor'))]);
    }
    autoTable(doc, {
        startY: y + 5, theme: 'striped', styles: { fontSize: 7.5, cellPadding: 1.4 }, headStyles: { fillColor: cor },
        head: [['N.º', 'Funcionário', 'Cargo', 'Base', 'Bruto', 'INSS 3%', 'IRT', 'Outros', 'Líquido', 'INSS empresa']],
        body: corpo,
        foot: [['', `TOTAL (${recibos.length})`, '', kz(soma(recibos, 'salario_base_minor')), kz(soma(recibos, 'bruto_minor')), kz(soma(recibos, 'inss_minor')), kz(soma(recibos, 'irt_minor')), kz(soma(recibos, 'outros_descontos_minor')), kz(soma(recibos, 'liquido_minor')), kz(soma(recibos, 'inss_emp_minor'))]],
        footStyles: { fillColor: [15, 23, 42] },
        columnStyles: Object.fromEntries([3, 4, 5, 6, 7, 8, 9].map(i => [i, { halign: 'right' as const }])),
        didParseCell: (data: any) => { if (data.section === 'body' && String((data.row.raw as string[])?.[1] || '').startsWith('Total ')) data.cell.styles.fontStyle = 'bold'; },
        didDrawPage: () => applyBranding(doc, config, userName, true),
    });
    const fim = (doc as any).lastAutoTable?.finalY || y + 40;
    writeClosingNote(doc, `Estado do processamento: ${p.estado}. Custo total para a empresa: ${kz(soma(recibos, 'bruto_minor') + soma(recibos, 'inss_emp_minor'))}.`, fim, config, userName, { line: false });
    return terminar(doc, `Folha-salarios-${p.ano}-${String(p.mes).padStart(2, '0')}.pdf`, saida);
}

export type DadosDeclaracao = {
    numero: string; modelo: 'servico' | 'rendimentos';
    funcionario: { nome: string; numero: string; bi?: string | null; nif?: string | null; cargo?: string; departamento?: string; admissao: string; salarioBaseMinor?: number; tipoContrato?: string };
    ano?: number; rendimentos?: { brutoMinor: number; inssMinor: number; irtMinor: number; liquidoMinor: number; recibos: number }; finalidade?: string;
};

/** Declaração de serviço/salário (vínculo, cargo, antiguidade e salário) ou de rendimentos (ano). */
export function gerarDeclaracaoPdf(d: DadosDeclaracao, settings: unknown, userName: string, saida: SaidaPdf = 'save'): FicheiroPdf {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const cor = resolveBrandPrimary(config.primaryColor);
    applyBranding(doc, config, userName);
    let y = brandingHeaderBottom(doc) + 16;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(15, 23, 42);
    doc.text(d.modelo === 'servico' ? 'DECLARAÇÃO DE SERVIÇO E SALÁRIO' : `DECLARAÇÃO DE RENDIMENTOS ${d.ano}`, 105, y, { align: 'center' });
    doc.setFontSize(9); doc.setTextColor(cor[0], cor[1], cor[2]);
    doc.text(`N.º ${d.numero}`, 105, y + 6, { align: 'center' });
    y += 18;
    const f = d.funcionario;
    const empresa = config.name || 'a empresa';
    const texto = d.modelo === 'servico'
        ? `Para os devidos efeitos${d.finalidade ? ` (${d.finalidade})` : ''}, declara-se que ${f.nome}, portador(a) do BI n.º ${f.bi || '—'}, NIF ${f.nif || '—'}, presta serviço em ${empresa} desde ${dataPt(f.admissao)}, com o n.º mecanográfico ${f.numero}, exercendo as funções de ${f.cargo || '—'}${f.departamento ? ` no departamento ${f.departamento}` : ''}, com contrato ${f.tipoContrato || '—'} e o salário base mensal de ${kz(f.salarioBaseMinor || 0)}.`
        : `Declara-se que ${f.nome}, portador(a) do BI n.º ${f.bi || '—'}, NIF ${f.nif || '—'}, auferiu em ${empresa}, no ano de ${d.ano}, os rendimentos do trabalho e as retenções abaixo indicados, conforme os ${d.rendimentos?.recibos || 0} recibo(s) processado(s).`;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(30, 41, 59);
    const linhas = doc.splitTextToSize(texto, 170) as string[];
    doc.text(linhas, 20, y, { lineHeightFactor: 1.6 });
    y += linhas.length * 6.5 + 6;
    if (d.modelo === 'rendimentos' && d.rendimentos) {
        autoTable(doc, {
            startY: y, theme: 'grid', styles: { fontSize: 9.5, cellPadding: 2.4 }, columnStyles: { 0: { fontStyle: 'bold', fillColor: [248, 250, 252] }, 1: { halign: 'right' } },
            body: [['Rendimentos brutos', kz(d.rendimentos.brutoMinor)], ['Segurança Social (INSS) retida', kz(d.rendimentos.inssMinor)], ['IRT retido', kz(d.rendimentos.irtMinor)], ['Valor líquido pago', kz(d.rendimentos.liquidoMinor)]],
            didDrawPage: () => applyBranding(doc, config, userName, true),
        });
        y = ((doc as any).lastAutoTable?.finalY || y + 30) + 8;
    }
    doc.setFontSize(10);
    doc.text('Por ser verdade, passa-se a presente declaração, que vai assinada e autenticada.', 20, y + 4);
    doc.text(`${config.address || config.location || ''}, ${dataPt(new Date().toISOString())}`, 20, y + 12);
    assinaturas(doc, y + 40, ['Recursos Humanos / Direcção']);
    return terminar(doc, `Declaracao-${d.numero.replace(/[^\w]+/gu, '-')}.pdf`, saida);
}

/** Ficheiro de transferências (CSV): IBAN, nome, valor e descrição, um funcionário por linha. */
export function ficheiroTransferencias(recibos: ReciboPdf[], descricao: string) {
    const linhas = [['IBAN', 'Beneficiario', 'Valor', 'Descricao', 'NumeroRecibo'].join(';'),
        ...recibos.filter(r => r.liquido_minor > 0).map(r => [r.iban || 'SEM IBAN', `"${r.nome.replace(/"/gu, "'")}"`, (r.liquido_minor / 100).toFixed(2), `"${descricao}"`, r.numero_recibo].join(';'))];
    return `\uFEFF${linhas.join('\r\n')}\r\n`;
}

export type DadosGuiaFerias = {
    numero: string; emitidoEm: string; funcionario: { nome: string; numero: string; cargo?: string; departamento?: string };
    ano: number; inicio: string; fim: string; dias: number; regresso: string; saldoRestante: number; aprovadoPor?: string | null;
};

/** Guia de férias numerada: período de gozo, dias úteis, data de regresso, saldo restante e assinaturas. */
export function gerarGuiaFeriasPdf(d: DadosGuiaFerias, settings: unknown, userName: string, saida: SaidaPdf = 'save'): FicheiroPdf {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const cor = resolveBrandPrimary(config.primaryColor);
    applyBranding(doc, config, userName);
    let y = brandingHeaderBottom(doc) + 14;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(15, 23, 42);
    doc.text('GUIA DE FÉRIAS', 105, y, { align: 'center' });
    doc.setFontSize(10); doc.setTextColor(cor[0], cor[1], cor[2]);
    doc.text(`N.º ${d.numero}`, 105, y + 7, { align: 'center' });
    y += 16;
    autoTable(doc, {
        startY: y, theme: 'grid', styles: { fontSize: 9.5, cellPadding: 2.4 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60, fillColor: [248, 250, 252] } },
        body: [
            ['Funcionário', `${d.funcionario.nome} (n.º ${d.funcionario.numero})`],
            ['Cargo / departamento', [d.funcionario.cargo, d.funcionario.departamento].filter(Boolean).join(' · ') || '—'],
            ['Férias do ano', String(d.ano)],
            ['Período de gozo', `${dataPt(d.inicio)} a ${dataPt(d.fim)}`],
            ['Dias úteis', String(d.dias)],
            ['Data de regresso', dataPt(d.regresso)],
            ['Saldo restante', `${d.saldoRestante} dia(s) útil(eis)`],
            ['Aprovado por', d.aprovadoPor || '—'],
            ['Emitida em', dataPt(d.emitidoEm)],
        ],
        didDrawPage: () => applyBranding(doc, config, userName, true),
    });
    const fim = (doc as any).lastAutoTable?.finalY || y + 70;
    assinaturas(doc, fim + 32, ['O funcionário', 'O chefe', 'Recursos Humanos']);
    writeClosingNote(doc, `Guia ${d.numero} emitida pelo sistema; os dias ficam marcados como férias no livro de ponto.`, fim + 40, config, userName, { line: false });
    return terminar(doc, `Guia-ferias-${d.numero.replace(/[^\w]+/gu, '-')}.pdf`, saida);
}

type ColunaRel = { titulo: string; tipo: 'texto' | 'kz' | 'numero' | 'data' | 'pct' };
type TabelaRel = { titulo: string; subtitulo: string; colunas: ColunaRel[]; linhas: Array<Array<string | number | null>>; totais?: Array<string | number | null>; nota?: string };

/** Formata uma célula de relatório para o ecrã e o PDF. */
export function formatarCelula(valor: string | number | null, tipo: ColunaRel['tipo']) {
    if (valor === null || valor === undefined || valor === '') return '';
    if (tipo === 'kz' && typeof valor === 'number') return formatCurrency(valor);
    if (tipo === 'pct' && typeof valor === 'number') return `${valor.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%`;
    if (tipo === 'numero' && typeof valor === 'number') return valor.toLocaleString('pt-PT', { maximumFractionDigits: 2 });
    if (tipo === 'data' && typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(valor)) return dataPt(valor);
    return String(valor);
}

/** Relatório de RH em PDF (horizontal), com a marca da empresa, filtros no subtítulo e totais. */
export function gerarRelatorioPdf(t: TabelaRel, filtros: string, settings: unknown, userName: string, saida: SaidaPdf = 'save'): FicheiroPdf {
    const doc = new jsPDF({ orientation: 'landscape' });
    const config = getCompanySettings(settings);
    const cor = resolveBrandPrimary(config.primaryColor);
    applyBranding(doc, config, userName);
    const y = brandingHeaderBottom(doc) + 9;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(15, 23, 42);
    doc.text(t.titulo.toUpperCase(), 148, y, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139);
    doc.text(`${t.subtitulo}${filtros ? ` · ${filtros}` : ''}`, 148, y + 5, { align: 'center' });
    const direita = (tipo: ColunaRel['tipo']) => ['kz', 'numero', 'pct'].includes(tipo);
    autoTable(doc, {
        startY: y + 9, theme: 'striped', styles: { fontSize: 7.5, cellPadding: 1.4 }, headStyles: { fillColor: cor },
        head: [t.colunas.map(c => c.titulo)],
        body: t.linhas.length ? t.linhas.map(l => l.map((v, i) => formatarCelula(v, t.colunas[i].tipo))) : [[{ content: 'Sem dados para os filtros escolhidos.', colSpan: t.colunas.length }]],
        foot: t.totais ? [t.totais.map((v, i) => ({ content: formatarCelula(v, t.colunas[i].tipo), styles: { halign: direita(t.colunas[i].tipo) ? 'right' as const : 'left' as const } }))] : undefined,
        footStyles: { fillColor: [15, 23, 42] },
        columnStyles: Object.fromEntries(t.colunas.map((c, i) => [i, direita(c.tipo) ? { halign: 'right' as const } : {}])),
        didDrawPage: () => applyBranding(doc, config, userName, true),
    });
    const fim = (doc as any).lastAutoTable?.finalY || y + 30;
    if (t.nota) writeClosingNote(doc, t.nota, fim, config, userName, { line: false });
    return terminar(doc, `${t.titulo.normalize('NFD').replace(/[̀-ͯ]/gu, '').replace(/[^\w]+/gu, '-')}.pdf`, saida);
}

export type SeccaoFicha = { titulo: string; pares?: Array<[string, string]>; tabela?: { colunas: string[]; linhas: string[][] } };

/** Ficha individual do funcionário: dados, contrato, histórico salarial, ausências e documentos. */
export function gerarFichaIndividualPdf(nome: string, seccoes: SeccaoFicha[], settings: unknown, userName: string, saida: SaidaPdf = 'save'): FicheiroPdf {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const cor = resolveBrandPrimary(config.primaryColor);
    applyBranding(doc, config, userName);
    let y = brandingHeaderBottom(doc) + 10;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(15, 23, 42);
    doc.text('FICHA INDIVIDUAL DO FUNCIONÁRIO', 105, y, { align: 'center' });
    doc.setFontSize(10); doc.setTextColor(cor[0], cor[1], cor[2]);
    doc.text(nome, 105, y + 6, { align: 'center' });
    y += 12;
    for (const s of seccoes) {
        autoTable(doc, {
            startY: y, theme: s.pares ? 'grid' : 'striped', styles: { fontSize: 8, cellPadding: 1.6 }, headStyles: { fillColor: cor },
            head: s.pares ? [[{ content: s.titulo, colSpan: 2 }]] : [[{ content: s.titulo, colSpan: s.tabela!.colunas.length }], s.tabela!.colunas],
            body: s.pares ? s.pares : (s.tabela!.linhas.length ? s.tabela!.linhas : [[{ content: 'Sem registos.', colSpan: s.tabela!.colunas.length }]]),
            columnStyles: s.pares ? { 0: { fontStyle: 'bold', cellWidth: 55, fillColor: [248, 250, 252] } } : {},
            didDrawPage: () => applyBranding(doc, config, userName, true),
        });
        y = ((doc as any).lastAutoTable?.finalY || y + 20) + 5;
    }
    return terminar(doc, `Ficha-${nome.replace(/[^\w]+/gu, '_')}.pdf`, saida);
}
