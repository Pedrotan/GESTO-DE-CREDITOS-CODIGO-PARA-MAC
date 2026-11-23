// Documentos de RH em PDF com a marca da empresa (applyBranding): dispensa, recibo de vencimento e folha de salários.
import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from '@/bibliotecas/pdf-tabela';
import { applyBranding, brandingHeaderBottom, getCompanySettings, resolveBrandPrimary, writeClosingNote } from '@/bibliotecas/pdf';
import { formatCurrency } from '@/bibliotecas/formatters';
import { formatLuandaDateTime } from '@/bibliotecas/fuso-angola';
import { scopedStorageKey } from '@/bibliotecas/contas';

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

/** Enquadramento do funcionário impresso na linha «Cargo:» / «Vinc.:» da folha. */
export type EnquadramentoFolha = { vinculo?: string | null; carreira?: string | null; categoria?: string | null; escalao?: string | null; unidade_organica?: string | null };
export type ItemFolha = { recibo: ReciboPdf; linhas: LinhaPdf[]; enquadramento?: EnquadramentoFolha };

/** 60943560 → «609.435,60» (como na folha de conferência, sem símbolo da moeda). */
const valorFolha = (minor: number) => {
    const n = Math.round(Number(minor) || 0);
    const inteiro = Math.floor(Math.abs(n) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/gu, '.');
    return `${n < 0 ? '-' : ''}${inteiro},${String(Math.abs(n) % 100).padStart(2, '0')}`;
};
/** Descrição da rubrica como na folha («Vencimento Base», «Falta(S) (2)»). */
const descricaoFolha = (l: LinhaPdf) => {
    if (l.codigo === 'SAL_BASE') return 'Vencimento Base';
    if (l.codigo === 'FALTAS') return `Falta(S) (${Number(l.quantidade).toLocaleString('pt-PT', { maximumFractionDigits: 2 })})`;
    return l.descricao;
};
const imagemValida = (v: unknown): v is string => typeof v === 'string' && (v.startsWith('data:image/') || (v.length > 100 && /^[A-Za-z0-9+/=]+$/u.test(v.slice(0, 200))));
const comoDataUrl = (v: string) => (v.startsWith('data:') ? v : `data:image/png;base64,${v}`);
/** Logótipo da empresa carregado nas definições (ou a cópia guardada neste computador). */
function logotipoEmpresa(config: ReturnType<typeof getCompanySettings>): string | null {
    for (const v of [config.logo, config.reportLogo]) if (imagemValida(v)) return comoDataUrl(v);
    try {
        for (const chave of ['company_logo_backup', 'company_report_logo_backup']) {
            const guardado = localStorage.getItem(scopedStorageKey(chave));
            if (imagemValida(guardado)) return comoDataUrl(guardado);
        }
    } catch { /* sem armazenamento local */ }
    return null;
}

/**
 * Folha de salários no modelo «Remunerações para Conferência Por Unidade Pagadora»: cabeçalho com o logótipo da empresa,
 * exercício, emissão e paginação; um bloco por funcionário (número, nome, IBAN, cargo/vínculo, abonos, descontos e líquido);
 * totais por unidade orgânica, total geral e número de agentes. O mês e o ano são os do processamento.
 */
/**
 * Folha de salário. `marca`: «correcao» (marca de água CORREÇÃO, para conferir) ou «final» (sem marca: só depois de
 * aprovada); sem marca indicada, os meses por aprovar levam RASCUNHO.
 */
export function gerarFolhaPdf(itens: ItemFolha[], p: CabecalhoProcessamento, settings: unknown, userName: string, saida: SaidaPdf = 'save', marca?: 'correcao' | 'final'): FicheiroPdf {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const config = getCompanySettings(settings);
    const largura = doc.internal.pageSize.getWidth();
    const altura = doc.internal.pageSize.getHeight();
    const esq = 5;
    const dir = largura - 12;
    const limite = altura - 16;
    const logo = logotipoEmpresa(config);
    const empresa = (config.name || 'Empresa').toUpperCase();
    const mesAno = `${MESES[p.mes - 1]}/${p.ano}`;
    const emissao = formatLuandaDateTime(new Date()).replace(' ', ' - ');
    const rascunho = !marca && (p.estado === 'aberto' || p.estado === 'calculado');
    if (marca === 'final' && !['aprovado', 'pago', 'fechado'].includes(String(p.estado))) throw new Error('A folha final só existe depois de a folha ser aprovada.');

    const unidadeDe = (i: ItemFolha) => i.enquadramento?.unidade_organica?.trim() || i.recibo.departamento || config.name || 'Sem unidade orgânica';
    const unidades = [...new Set(itens.map(unidadeDe))].sort((a, b) => a.localeCompare(b, 'pt'));
    // Todos os funcionários numa só lista, por ordem alfabética (sem acentos nem maiúsculas a pesar): a página só
    // muda quando enche. A unidade orgânica vai no bloco de cada funcionário e os totais por unidade no fim.
    const ordenados = [...itens].sort((a, b) => a.recibo.nome.localeCompare(b.recibo.nome, 'pt', { sensitivity: 'base' }));
    const variasUnidades = unidades.length > 1;

    const cabecalho = (unidade: string) => {
        if (logo) {
            try {
                const prop = doc.getImageProperties(logo);
                const escala = Math.min(13 / prop.width, 13 / prop.height);
                const w = prop.width * escala;
                const h = prop.height * escala;
                doc.addImage(logo, prop.fileType || 'PNG', 7 + (13 - w) / 2, 4 + (13 - h) / 2, w, h, undefined, 'FAST');
            } catch { /* logótipo ilegível: segue sem ele */ }
        }
        doc.setTextColor(0, 0, 0);
        doc.setFont('times', 'bold'); doc.setFontSize(7.5);
        doc.text('REPÚBLICA DE ANGOLA', 23, 8.6);
        doc.setFontSize(9.5);
        doc.text(doc.splitTextToSize(empresa, 112)[0] as string, 23, 12.8);
        doc.setFontSize(7.2);
        doc.text('Exercício :', 145, 7.6); doc.text(String(p.ano), 160, 7.6);
        doc.text('Emissão', 145, 11.2); doc.text(`:   ${emissao}`, 157, 11.2);
        doc.text('Página', 145, 14.8);
        doc.setLineWidth(0.45); doc.setDrawColor(0, 0, 0);
        doc.line(esq, 18.6, dir, 18.6);
        doc.setFontSize(9.5);
        doc.text(`Remunerações para Conferência Por Unidade Pagadora - ${mesAno}`, (esq + dir) / 2, 22.6, { align: 'center' });
        doc.line(esq, 24.4, dir, 24.4);
        doc.setFontSize(6.8);
        doc.text('Unidade Pagadora', esq + 1, 28.6);
        doc.text(doc.splitTextToSize(config.name || '', 58)[0] as string, 33, 28.6);
        doc.text('Unidade Orgânica:', 96, 28.6);
        doc.text(doc.splitTextToSize(unidade, 72)[0] as string, 120, 28.6);
        doc.setFont('times', 'italic'); doc.setFontSize(5.5); doc.setTextColor(120, 120, 120);
        doc.text('Fonte: Tango ERP - Sistema Integrado de Gestão de Recursos Humanos', esq, altura - 6);
        doc.text(`Utilizador: ${userName}`, dir, altura - 6, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        if (marca === 'correcao') {
            doc.saveGraphicsState();
            try { doc.setGState(new (doc.GState as unknown as { new (o: { opacity: number }): any })({ opacity: 0.13 })); } catch { /* sem transparência */ }
            doc.setFont('helvetica', 'bold'); doc.setFontSize(84); doc.setTextColor(234, 88, 12);
            doc.text('CORREÇÃO', largura / 2, altura / 2 + 20, { align: 'center', angle: 28 });
            doc.restoreGraphicsState();
            doc.setTextColor(0, 0, 0);
        }
        if (rascunho) {
            doc.saveGraphicsState();
            try { doc.setGState(new (doc.GState as unknown as { new (o: { opacity: number }): any })({ opacity: 0.12 })); } catch { /* sem transparência */ }
            doc.setFont('helvetica', 'bold'); doc.setFontSize(78); doc.setTextColor(30, 120, 60);
            doc.text('RASCUNHO', largura / 2, altura / 2 + 20, { align: 'center', angle: 28 });
            doc.restoreGraphicsState();
            doc.setTextColor(0, 0, 0);
        }
    };

    const ALTURA_LINHA = 2.45;
    const descontosDe = (i: ItemFolha): Array<[string, number]> => [
        ...i.linhas.filter(l => l.tipo === 'desconto').map(l => [descricaoFolha(l), l.valor_minor] as [string, number]),
        ...(i.recibo.inss_minor > 0 ? [['Seg Soc INSS', i.recibo.inss_minor] as [string, number]] : []),
        ...(i.recibo.irt_minor > 0 ? [['Imposto Rendimento Trabalho', i.recibo.irt_minor] as [string, number]] : []),
    ];
    const alturaBloco = (i: ItemFolha) => 12.2 + Math.max(i.linhas.filter(l => l.tipo === 'abono').length, descontosDe(i).length, 1) * ALTURA_LINHA;

    const bloco = (i: ItemFolha, y0: number) => {
        const r = i.recibo;
        const e = i.enquadramento || {};
        const abonos = i.linhas.filter(l => l.tipo === 'abono');
        const descontos = descontosDe(i);
        const totalAbonos = abonos.reduce((s, l) => s + l.valor_minor, 0);
        const totalDescontos = totalAbonos - r.liquido_minor;
        const h = alturaBloco(i);

        doc.setLineWidth(0.2); doc.setDrawColor(0, 0, 0);
        doc.rect(esq, y0, dir - esq, h);
        // Linha 1: número - nome, IBAN e espaço para a rubrica do funcionário.
        doc.setFont('times', 'bold'); doc.setFontSize(7.2);
        doc.text(doc.splitTextToSize(`${r.numero_mecanografico || '—'}  -  ${r.nome.toUpperCase()}`, 104)[0] as string, esq + 1, y0 + 3.1);
        doc.text('IBAN:', 112, y0 + 3.1);
        doc.setFont('times', 'normal');
        doc.text(r.iban ? r.iban.replace(/\s+/gu, '').replace(/(.{4})(?=.)/gu, '$1.') : '—', 120, y0 + 3.1);
        doc.setLineWidth(0.15);
        doc.line(174, y0 + 3.6, dir - 0.5, y0 + 3.6);
        // Linha 2: Cargo / Vinc. e total líquido.
        const rotulo = /quadro/iu.test(e.vinculo || '') && !/tempor/iu.test(e.vinculo || '') ? 'Vinc.:' : 'Cargo:';
        const enquadramento = [e.vinculo, e.carreira, r.cargo, e.categoria, e.escalao, variasUnidades ? `U.O.: ${unidadeDe(i)}` : ''].map(x => (x || '').trim()).filter(Boolean).join('   ') || '—';
        doc.setFont('times', 'bold'); doc.setFontSize(6.8);
        doc.text(rotulo, esq + 1, y0 + 6.6);
        doc.setFont('times', 'normal');
        doc.text(doc.splitTextToSize(enquadramento, 135)[0] as string, esq + 9.5, y0 + 6.6);
        doc.setFont('times', 'bold'); doc.setFontSize(7.2);
        doc.text('Total Liq.:', 152, y0 + 6.8);
        doc.setFontSize(7.6);
        doc.text(valorFolha(r.liquido_minor), dir - 1, y0 + 6.8, { align: 'right' });
        // Faixa Abonos / Descontos.
        doc.setFillColor(236, 236, 236);
        doc.rect(esq + 0.15, y0 + 8.1, dir - esq - 0.3, 2.9, 'F');
        doc.setFontSize(6.9);
        doc.text('Abonos', esq + 1, y0 + 10.2);
        doc.text(valorFolha(totalAbonos), 98, y0 + 10.2, { align: 'right' });
        doc.text('Descontos', 112, y0 + 10.2);
        doc.text(valorFolha(totalDescontos), dir - 1, y0 + 10.2, { align: 'right' });
        // Rubricas.
        doc.setFont('times', 'normal'); doc.setFontSize(6.6);
        abonos.forEach((l, k) => {
            const y = y0 + 12.6 + k * ALTURA_LINHA;
            doc.text(doc.splitTextToSize(descricaoFolha(l), 68)[0] as string, esq + 2, y);
            doc.text(valorFolha(l.valor_minor), 98, y, { align: 'right' });
        });
        descontos.forEach(([descricao, valor], k) => {
            const y = y0 + 12.6 + k * ALTURA_LINHA;
            doc.text(doc.splitTextToSize(descricao, 60)[0] as string, 112, y);
            doc.text(valorFolha(valor), dir - 1, y, { align: 'right' });
        });
        return { h, totalAbonos, totalDescontos, liquido: r.liquido_minor };
    };

    const linhaTotal = (rotulo: string, y: number, a: number, d: number, l: number) => {
        doc.setFont('times', 'bold'); doc.setFontSize(7.4);
        doc.text(rotulo, esq + 2, y);
        doc.text(valorFolha(a), 80, y, { align: 'right' });
        doc.text(valorFolha(d), 140, y, { align: 'right' });
        doc.text(valorFolha(l), dir - 1, y, { align: 'right' });
    };

    const geral = { a: 0, d: 0, l: 0 };
    if (!itens.length) {
        cabecalho(config.name || '—');
        doc.setFont('times', 'italic'); doc.setFontSize(9);
        doc.text('Sem funcionários neste processamento.', largura / 2, 45, { align: 'center' });
    }
    if (itens.length) {
        const rotuloUnidade = variasUnidades ? 'Todas (por ordem alfabética)' : unidades[0];
        cabecalho(rotuloUnidade);
        let y = 31;
        const porUnidade = new Map<string, { a: number; d: number; l: number; n: number }>();
        for (const item of ordenados) {
            if (y + alturaBloco(item) > limite) { doc.addPage(); cabecalho(rotuloUnidade); y = 31; }
            const t = bloco(item, y);
            y += t.h;
            geral.a += t.totalAbonos; geral.d += t.totalDescontos; geral.l += t.liquido;
            const u = porUnidade.get(unidadeDe(item)) || { a: 0, d: 0, l: 0, n: 0 };
            porUnidade.set(unidadeDe(item), { a: u.a + t.totalAbonos, d: u.d + t.totalDescontos, l: u.l + t.liquido, n: u.n + 1 });
        }
        // Resumo por unidade orgânica (só com mais de uma) e o total geral.
        const linhasResumo = variasUnidades ? unidades.length + 1 : 0;
        if (y + 22 + linhasResumo * 5 > limite) { doc.addPage(); cabecalho(rotuloUnidade); y = 31; }
        if (variasUnidades) {
            doc.setFont('times', 'bold'); doc.setFontSize(7.2);
            doc.text('Totais por Unidade Orgânica', esq + 2, y + 5);
            doc.text('Abonos', 80, y + 5, { align: 'right' }); doc.text('Descontos', 140, y + 5, { align: 'right' }); doc.text('Líquido', dir - 1, y + 5, { align: 'right' });
            y += 5;
            for (const u of unidades) {
                const t = porUnidade.get(u)!;
                y += 4.6;
                doc.setFont('times', 'normal'); doc.setFontSize(7);
                doc.text(doc.splitTextToSize(`${u} (${t.n})`, 56)[0] as string, esq + 4, y);
                doc.text(valorFolha(t.a), 80, y, { align: 'right' }); doc.text(valorFolha(t.d), 140, y, { align: 'right' }); doc.text(valorFolha(t.l), dir - 1, y, { align: 'right' });
            }
            y += 2;
        }
        linhaTotal('Total Geral:', y + 6, geral.a, geral.d, geral.l);
        doc.text('Total de Agentes:', esq + 2, y + 13.5);
        doc.text(String(itens.length), 80, y + 12.5, { align: 'right' });
    }

    // «Página : n de N» em todas as páginas.
    const total = doc.getNumberOfPages();
    for (let n = 1; n <= total; n++) {
        doc.setPage(n);
        doc.setFont('times', 'bold'); doc.setFontSize(7.2); doc.setTextColor(0, 0, 0);
        doc.text(`:   ${n}  de ${total}`, 157, 14.8);
    }
    const nomeEmpresa = (config.name || 'Empresa').normalize('NFD').replace(/[̀-ͯ]/gu, '').replace(/[^\w]+/gu, '_').replace(/^_+|_+$/gu, '');
    const tipoFolha = marca === 'correcao' ? 'Folha de correcao' : marca === 'final' ? 'Folha final' : 'Folha de salario';
    return terminar(doc, `${tipoFolha}_${MESES[p.mes - 1]}_${p.ano}_${nomeEmpresa}.pdf`, saida);
}

export type DadosDeclaracao = {
    numero: string; modelo: 'servico' | 'rendimentos';
    funcionario: { nome: string; numero: string; bi?: string | null; nif?: string | null; cargo?: string; departamento?: string; admissao: string; salarioBaseMinor?: number; tipoContrato?: string };
    ano?: number; rendimentos?: { brutoMinor: number; inssMinor: number; irtMinor: number; liquidoMinor: number; recibos: number }; finalidade?: string;
    /** Texto já preenchido a partir de um modelo de declaração (substitui o texto fixo) e o seu título. */
    texto?: string; titulo?: string;
};

/** Declaração de serviço/salário (vínculo, cargo, antiguidade e salário) ou de rendimentos (ano). */
export function gerarDeclaracaoPdf(d: DadosDeclaracao, settings: unknown, userName: string, saida: SaidaPdf = 'save'): FicheiroPdf {
    if (d.texto) return declaracaoDeModelo(d, settings, userName, saida);
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

/** Declaração a partir de um modelo editável: título, número, o texto do modelo, local e data, e assinatura. */
function declaracaoDeModelo(d: DadosDeclaracao, settings: unknown, userName: string, saida: SaidaPdf): FicheiroPdf {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const cor = resolveBrandPrimary(config.primaryColor);
    applyBranding(doc, config, userName);
    let y = brandingHeaderBottom(doc) + 16;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(15, 23, 42);
    doc.text((d.titulo || 'DECLARAÇÃO').toUpperCase(), 105, y, { align: 'center' });
    doc.setFontSize(9); doc.setTextColor(cor[0], cor[1], cor[2]);
    doc.text(`N.º ${d.numero}`, 105, y + 6, { align: 'center' });
    y += 18;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(30, 41, 59);
    for (const paragrafo of d.texto!.split(/\n{2,}/u)) {
        const linhas = doc.splitTextToSize(paragrafo.replace(/\n/gu, ' ').trim(), 170) as string[];
        if (y + linhas.length * 6.5 > 250) { doc.addPage(); applyBranding(doc, config, userName, true); y = brandingHeaderBottom(doc) + 12; }
        doc.text(linhas, 20, y, { lineHeightFactor: 1.6 });
        y += linhas.length * 6.5 + 5;
    }
    doc.setFontSize(10);
    doc.text(`${config.address || config.location || ''}, ${dataPt(new Date().toISOString())}`, 20, y + 6);
    assinaturas(doc, y + 34, ['Recursos Humanos / Direcção']);
    return terminar(doc, `Declaracao-${d.numero.replace(/[^\w]+/gu, '-')}.pdf`, saida);
}

export type DadosDeclaracaoEmpresa = {
    /** Título (ex.: DECLARAÇÃO DE SERVIÇO E SALÁRIO ou MODELO DE DECLARAÇÃO). */
    titulo: string; subtitulo?: string | null; referencia?: string | null;
    /** Destinatário (modelo para outras instituições). */
    destinatario?: { instituicao?: string | null; ac?: string | null; assunto?: string | null } | null;
    /** Texto final (parágrafos separados por linha em branco), já editado. */
    texto: string; local: string; dataExtenso: string;
    representante?: string | null; cargoRepresentante?: string | null;
};

/**
 * Declaração no layout dos modelos da empresa: cabeçalho com logótipo, nome, NIF e contactos; título, referência,
 * destinatário (quando há), o texto, local e data, «Pela EMPRESA», linha de assinatura, cargo e carimbo.
 */
export function gerarDeclaracaoEmpresaPdf(d: DadosDeclaracaoEmpresa, settings: unknown, userName: string, saida: SaidaPdf = 'save'): FicheiroPdf {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const config = getCompanySettings(settings) as ReturnType<typeof getCompanySettings> & { phone?: string; email?: string };
    const largura = doc.internal.pageSize.getWidth();
    const altura = doc.internal.pageSize.getHeight();
    const esq = 22; const dir = largura - 22; const util = dir - esq;
    const empresa = (config.name || 'Empresa').toUpperCase();
    const logo = logotipoEmpresa(config);
    let y = 18;
    if (logo) {
        try {
            const prop = doc.getImageProperties(logo);
            const escala = Math.min(18 / prop.width, 18 / prop.height);
            doc.addImage(logo, prop.fileType || 'PNG', largura / 2 - (prop.width * escala) / 2, y - 4, prop.width * escala, prop.height * escala, undefined, 'FAST');
            y += 18;
        } catch { /* logótipo ilegível: segue sem ele */ }
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5);
    doc.text(empresa, largura / 2, y, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    if (config.nif) doc.text(`NIF ${config.nif}`, largura / 2, y + 5, { align: 'center' });
    const contactos = [config.phone ? `Tel.: ${config.phone}` : '', config.email ? `E-mail: ${config.email}` : ''].filter(Boolean).join('  |  ');
    if (contactos) doc.text(contactos, largura / 2, y + 10, { align: 'center' });
    y += 14;
    doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.4); doc.line(esq, y, dir, y);
    y += 12;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(d.titulo.toUpperCase(), largura / 2, y, { align: 'center' });
    y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    if (d.subtitulo) { doc.text(d.subtitulo, largura / 2, y, { align: 'center' }); y += 6; }
    if (d.referencia) { doc.text(`Referência: ${d.referencia}`, largura / 2, y, { align: 'center' }); y += 6; }
    y += 6;
    if (d.destinatario) {
        doc.setFontSize(10.5);
        const linhas: Array<[string, string | null | undefined]> = [['À(ao): ', d.destinatario.instituicao], ['A/C: ', d.destinatario.ac], ['Assunto: ', d.destinatario.assunto]];
        for (const [rotulo, valor] of linhas) {
            if (!valor || !valor.trim()) continue;
            doc.setFont('helvetica', 'bold'); doc.text(rotulo, esq, y);
            doc.setFont('helvetica', 'normal');
            const texto = doc.splitTextToSize(valor.trim(), util - doc.getTextWidth(rotulo)) as string[];
            doc.text(texto, esq + doc.getTextWidth(rotulo), y);
            y += texto.length * 5.2 + 1;
        }
        y += 5;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    for (const paragrafo of d.texto.split(/\n{2,}/u).map(t => t.replace(/\n/gu, ' ').trim()).filter(Boolean)) {
        const linhas = doc.splitTextToSize(paragrafo, util) as string[];
        if (y + linhas.length * 6 > altura - 70) { doc.addPage(); y = 25; }
        doc.text(linhas, esq, y, { align: 'justify', maxWidth: util, lineHeightFactor: 1.5 });
        y += linhas.length * 6 + 5;
    }
    if (y > altura - 75) { doc.addPage(); y = 30; }
    y += 4;
    doc.text(`${d.local}, ${d.dataExtenso}.`, esq, y);
    y += 14;
    doc.text(`Pela ${empresa}`, largura / 2, y, { align: 'center' });
    y += 20;
    doc.setLineWidth(0.3); doc.line(largura / 2 - 45, y, largura / 2 + 45, y);
    y += 5;
    doc.setFontSize(10);
    doc.text(d.representante?.trim() || 'Nome e assinatura do representante autorizado', largura / 2, y, { align: 'center' });
    y += 5;
    doc.text(d.cargoRepresentante?.trim() ? d.cargoRepresentante.trim() : 'Cargo: __________________________________', largura / 2, y, { align: 'center' });
    y += 10;
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5); doc.setTextColor(100, 116, 139);
    doc.text('Carimbo da empresa', largura / 2, y, { align: 'center' });
    doc.setFontSize(6.5);
    doc.text(`Emitido no Tango ERP por ${userName}`, esq, altura - 10);
    const nome = (d.referencia || d.titulo).replace(/[^\w]+/gu, '-').replace(/^-+|-+$/gu, '');
    return terminar(doc, `Declaracao-${nome}.pdf`, saida);
}

/** Ficheiro de transferências (CSV): IBAN, nome, valor e descrição, um funcionário por linha. */
export function ficheiroTransferencias(recibos: ReciboPdf[], descricao: string) {
    const linhas = [['IBAN', 'Beneficiario', 'Valor', 'Descricao', 'NumeroRecibo'].join(';'),
        ...recibos.filter(r => r.liquido_minor > 0).map(r => [r.iban || 'SEM IBAN', `"${r.nome.replace(/"/gu, "'")}"`, (r.liquido_minor / 100).toFixed(2), `"${descricao}"`, r.numero_recibo].join(';'))];
    return `\uFEFF${linhas.join('\r\n')}\r\n`;
}

export type DadosGuiaFerias = {
    numero: string; emitidoEm: string; funcionario: { nome: string; numero: string; cargo?: string; departamento?: string; bi?: string | null; admissao?: string | null };
    ano: number; inicio: string; fim: string; dias: number; regresso: string; saldoRestante: number; aprovadoPor?: string | null;
    /** Dias úteis de férias a que tem direito no ano (contrato ou parâmetro; 22 por omissão). */
    direito?: number;
    /** Subsídio de férias: salário base e percentagem em vigor (parâmetro subsidio_ferias_pct). */
    salarioBaseMinor?: number | null; subsidioPct?: number | null;
};

/**
 * Guia de férias segundo a Lei Geral do Trabalho de Angola (Lei n.º 12/23, de 27 de Dezembro): identificação do
 * trabalhador, período de gozo em dias úteis, data de regresso, saldo, subsídio de férias, enquadramento legal,
 * tomada de conhecimento e assinaturas do trabalhador, do chefe directo e dos Recursos Humanos.
 */
export function gerarGuiaFeriasPdf(d: DadosGuiaFerias, settings: unknown, userName: string, saida: SaidaPdf = 'save'): FicheiroPdf {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const cor = resolveBrandPrimary(config.primaryColor);
    applyBranding(doc, config, userName);
    const direito = d.direito || 22;
    let y = brandingHeaderBottom(doc) + 12;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(15, 23, 42);
    doc.text('GUIA DE FÉRIAS', 105, y, { align: 'center' });
    doc.setFontSize(9.5); doc.setTextColor(cor[0], cor[1], cor[2]);
    doc.text(`N.º ${d.numero} · Férias referentes a ${d.ano}`, 105, y + 6, { align: 'center' });
    y += 12;
    const tabela = (titulo: string, linhas: Array<[string, string]>) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
        doc.text(titulo.toUpperCase(), 20, y + 4);
        autoTable(doc, {
            startY: y + 6, theme: 'grid', styles: { fontSize: 8.6, cellPadding: 1.35 }, margin: { left: 20, right: 20 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 58, fillColor: [248, 250, 252] } }, body: linhas,
            didDrawPage: () => applyBranding(doc, config, userName, true),
        });
        y = ((doc as any).lastAutoTable?.finalY || y + 30) + 4;
    };
    tabela('1. Identificação do trabalhador', [
        ['Nome', d.funcionario.nome],
        ['N.º mecanográfico', d.funcionario.numero],
        ...(d.funcionario.bi ? [['Bilhete de Identidade', d.funcionario.bi] as [string, string]] : []),
        ['Cargo / departamento', [d.funcionario.cargo, d.funcionario.departamento].filter(Boolean).join(' · ') || '—'],
        ...(d.funcionario.admissao ? [['Data de admissão', dataPt(d.funcionario.admissao)] as [string, string]] : []),
    ]);
    tabela('2. Período de férias', [
        ['Direito anual', `${direito} dias úteis`],
        ['Período de gozo', `De ${dataPt(d.inicio)} a ${dataPt(d.fim)}`],
        ['Dias úteis gozados nesta guia', String(d.dias)],
        ['Apresentação ao serviço', dataPt(d.regresso)],
        ['Saldo de férias restante', `${d.saldoRestante} dia(s) útil(eis)`],
        ['Aprovado por', d.aprovadoPor || '—'],
    ]);
    if (d.salarioBaseMinor && d.subsidioPct) {
        tabela('3. Subsídio de férias', [
            ['Salário base mensal', kz(d.salarioBaseMinor)],
            ['Percentagem', `${(d.subsidioPct * 100).toLocaleString('pt-PT', { maximumFractionDigits: 2 })}% do salário base`],
            ['Valor do subsídio', kz(Math.round(d.salarioBaseMinor * d.subsidioPct))],
        ]);
    }
    const legal = [
        `Nos termos da Lei Geral do Trabalho (Lei n.º 12/23, de 27 de Dezembro), o trabalhador tem direito, em cada ano civil, a um período de férias remuneradas, que nesta empresa é de ${direito} dias úteis. Durante as férias mantém a remuneração que receberia se estivesse ao serviço e recebe o subsídio de férias, que não pode ser inferior a 50% do salário base.`,
        'As férias são gozadas de forma efectiva e não podem ser substituídas por compensação económica, salvo nos casos previstos na lei. O período foi marcado por acordo com a entidade empregadora, tendo em conta as necessidades do serviço.',
        `O trabalhador deve apresentar-se ao serviço no dia ${dataPt(d.regresso)}. A falta de apresentação nessa data, sem motivo justificado, é tratada como falta injustificada.`,
    ];
    if (y > 200) { doc.addPage(); applyBranding(doc, config, userName, true); y = brandingHeaderBottom(doc) + 10; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
    doc.text(`${d.salarioBaseMinor && d.subsidioPct ? '4' : '3'}. ENQUADRAMENTO LEGAL`, 20, y + 4);
    y += 9;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(30, 41, 59);
    for (const paragrafo of legal) {
        const linhas = doc.splitTextToSize(paragrafo, 170) as string[];
        doc.text(linhas, 20, y, { lineHeightFactor: 1.45 });
        y += linhas.length * 4.6 + 2.5;
    }
    if (y > 235) { doc.addPage(); applyBranding(doc, config, userName, true); y = brandingHeaderBottom(doc) + 10; }
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.8);
    doc.text('Tomei conhecimento do período de férias acima indicado e da data em que devo apresentar-me ao serviço.', 20, y + 3);
    doc.setFont('helvetica', 'normal');
    doc.text(`${config.address || config.location || ''}, ${dataPt(d.emitidoEm)}`, 20, y + 10);
    assinaturas(doc, y + 30, ['O trabalhador', 'O chefe directo', 'Recursos Humanos']);
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
export function gerarFichaIndividualPdf(nome: string, seccoes: SeccaoFicha[], settings: unknown, userName: string, saida: SaidaPdf = 'save', titulo = 'FICHA INDIVIDUAL DO FUNCIONÁRIO', prefixo = 'Ficha'): FicheiroPdf {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const cor = resolveBrandPrimary(config.primaryColor);
    applyBranding(doc, config, userName);
    let y = brandingHeaderBottom(doc) + 10;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(15, 23, 42);
    doc.text(titulo, 105, y, { align: 'center' });
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
    return terminar(doc, `${prefixo}-${nome.replace(/[^\w]+/gu, '_')}.pdf`, saida);
}

export type DadosAcessoPortal = {
    motivo: 'criacao' | 'reposicao';
    funcionario: { nome: string; numero: string; cargo?: string; departamento?: string; seccao?: string; email?: string | null };
    utilizador: string; senha: string; endereco: string; emitidoPor: string;
};

/**
 * Ficha de acesso ao portal do funcionário: credenciais (utilizador e senha temporária), endereço, passos do primeiro
 * acesso, regras da senha, o que o portal permite e cuidados de segurança, com recibo assinado. Não é arquivada no
 * sistema (a senha só existe neste documento).
 */
export function gerarFichaAcessoPortalPdf(d: DadosAcessoPortal, settings: unknown, userName: string, saida: SaidaPdf = 'save'): FicheiroPdf {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const cor = resolveBrandPrimary(config.primaryColor);
    const rodape = () => applyBranding(doc, config, userName, true);
    applyBranding(doc, config, userName);
    let y = brandingHeaderBottom(doc) + 12;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(15, 23, 42);
    doc.text('FICHA DE ACESSO AO PORTAL DO FUNCIONÁRIO', 105, y, { align: 'center' });
    doc.setFontSize(9); doc.setTextColor(cor[0], cor[1], cor[2]);
    doc.text(d.motivo === 'criacao' ? 'Criação do acesso · Documento pessoal e confidencial' : 'Reposição da senha · Documento pessoal e confidencial', 105, y + 6, { align: 'center' });
    y += 12;
    const f = d.funcionario;
    const tabela = (titulo: string, linhas: Array<[string, string]>, destaque = false) => {
        autoTable(doc, {
            startY: y, theme: 'grid', styles: { fontSize: 9, cellPadding: 2.2 }, headStyles: { fillColor: cor },
            head: [[{ content: titulo, colSpan: 2 }]], body: linhas,
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, fillColor: [248, 250, 252] }, ...(destaque ? { 1: { font: 'courier', fontStyle: 'bold', fontSize: 12 } } : {}) },
            didDrawPage: rodape,
        });
        y = ((doc as any).lastAutoTable?.finalY || y + 20) + 5;
    };
    tabela('Funcionário', [
        ['Nome', f.nome],
        ['N.º mecanográfico', f.numero || '—'],
        ['Cargo', f.cargo || '—'],
        ['Departamento / secção', [f.departamento, f.seccao].filter(Boolean).join(' · ') || '—'],
        ['Email na ficha', f.email || '—'],
    ]);
    tabela('Credenciais de acesso', [
        ['Endereço', d.endereco],
        ['Utilizador', d.utilizador],
        ['Senha temporária', d.senha],
    ], true);
    tabela('Emissão', [
        ['Emitida em', formatLuandaDateTime(new Date().toISOString())],
        ['Emitida por', d.emitidoPor],
        ['Motivo', d.motivo === 'criacao' ? 'Criação do acesso ao portal' : 'Reposição da senha (a anterior deixou de funcionar)'],
    ]);
    const blocos: Array<[string, string[]]> = [
        ['Primeiro acesso', [
            `1. Abra ${d.endereco} no navegador (computador ou telemóvel).`,
            '2. Num dispositivo novo, o sistema pode pedir a ligação à empresa (NIF e Código de Acesso): peça-a aos Recursos Humanos.',
            `3. Em «Iniciar sessão», escreva o utilizador ${d.utilizador} e a senha temporária desta ficha.`,
            '4. O sistema pede logo uma senha nova: só depois de a definir pode usar o portal. A senha temporária deixa de funcionar.',
        ]],
        ['Regras da senha nova', [
            '• Pelo menos 8 caracteres, com letras maiúsculas e minúsculas, números e um símbolo (ex.: @ # $ % & * ! ?).',
            '• Não use o nome, a data de nascimento, o BI nem senhas de outros serviços.',
        ]],
        ['O que pode fazer no portal', [
            '• Consultar e descarregar os recibos de vencimento e confirmar a recepção do salário.',
            '• Ver a folha de salários, o INSS, o IRT e os subsídios; apresentar reclamações.',
            '• Pedir férias, justificar faltas e acompanhar os seus pedidos e o registo de ponto.',
            '• Trocar mensagens com os Recursos Humanos pelo correio interno.',
            '• O portal mostra só os seus dados: não dá acesso aos créditos nem à gestão da empresa.',
        ]],
        ['Segurança', [
            '• A senha é pessoal e intransmissível. Os Recursos Humanos nunca lhe pedem a senha.',
            '• Se a esquecer ou suspeitar que alguém a conhece, peça aos Recursos Humanos a reposição da senha.',
            '• Depois de definir a senha nova, guarde esta ficha em local seguro ou destrua-a.',
        ]],
    ];
    const altura = doc.internal.pageSize.getHeight();
    for (const [titulo, linhas] of blocos) {
        const texto = linhas.flatMap(linha => doc.splitTextToSize(linha, 168) as string[]);
        if (y + 8 + texto.length * 4.6 > altura - 40) { doc.addPage(); rodape(); y = brandingHeaderBottom(doc) + 10; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(cor[0], cor[1], cor[2]);
        doc.text(titulo, 20, y + 4);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 41, 59);
        doc.text(texto, 22, y + 10, { lineHeightFactor: 1.45 });
        y += 10 + texto.length * 4.6 + 3;
    }
    if (y + 30 > altura - 20) { doc.addPage(); rodape(); y = brandingHeaderBottom(doc) + 10; }
    doc.setFontSize(8.5); doc.setTextColor(71, 85, 105);
    doc.text('Recebi esta ficha e as credenciais de acesso, que guardarei em segurança.', 20, y + 4);
    assinaturas(doc, y + 24, ['O funcionário', 'Recursos Humanos']);
    const nome = f.nome.normalize('NFD').replace(/[̀-ͯ]/gu, '').replace(/[^\w]+/gu, '_');
    return terminar(doc, `Acesso_Portal_${nome}.pdf`, saida);
}

export type DadosMapaFerias = {
    ano: number;
    /** Dias do calendário laboral do ano (feriados, pontes, datas internacionais). */
    calendario: Array<{ data: string; nome: string; tipo: string; folga: boolean; activo: boolean }>;
    /** Funcionários de férias em cada dia (só aprovadas e em gozo). */
    ferias: Map<string, number>;
    linhas: Array<{ nome: string; departamento: string; periodos: string; dias: number; regresso: string; saldo: number; estado: string }>;
};
const MESES_MAPA = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const CORES_MAPA: Array<[number, number, number]> = [[232, 163, 23], [217, 65, 43], [68, 102, 170], [14, 159, 110], [14, 159, 110], [68, 102, 170], [232, 163, 23], [217, 65, 43], [217, 65, 43], [232, 163, 23], [14, 159, 110], [68, 102, 170]];

/** Mapa de férias em A4 horizontal: o calendário anual (como o de parede) e a lista das férias da equipa. */
export function gerarMapaFeriasPdf(d: DadosMapaFerias, settings: unknown, userName: string, saida: SaidaPdf = 'save'): FicheiroPdf {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
    const config = getCompanySettings(settings);
    const cor = resolveBrandPrimary(config.primaryColor);
    applyBranding(doc, config, userName);
    const largura = doc.internal.pageSize.getWidth();
    let y = brandingHeaderBottom(doc) + 6;
    // Ano grande ao centro com quatro linhas coloridas de cada lado.
    doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(27, 38, 69);
    doc.text(String(d.ano), largura / 2, y + 7, { align: 'center' });
    [[232, 163, 23], [217, 65, 43], [68, 102, 170], [14, 159, 110]].forEach(([r, g, b], i) => {
        doc.setDrawColor(r, g, b); doc.setLineWidth(0.8);
        doc.line(14, y + 1 + i * 2, largura / 2 - 22, y + 1 + i * 2);
        doc.line(largura / 2 + 22, y + 1 + i * 2, largura - 14, y + 1 + i * 2);
    });
    y += 13;
    const dias = new Map(d.calendario.map(x => [x.data, x]));
    // Os 12 meses cabem entre o cabeçalho e o rodapé da marca (que ocupa os últimos ~22 mm da página).
    const limite = doc.internal.pageSize.getHeight() - 24;
    const colunas = 4, gap = 3, largMes = (largura - 28 - gap * (colunas - 1)) / colunas, altMes = Math.min(50, (limite - 5 - y - gap * 2) / 3);
    const passoLinha = Math.min(6.3, (altMes - 12) / 6);
    for (let m = 0; m < 12; m++) {
        const x0 = 14 + (m % colunas) * (largMes + gap), y0 = y + Math.floor(m / colunas) * (altMes + gap);
        const [r, g, b] = CORES_MAPA[m];
        doc.setDrawColor(r, g, b); doc.setLineWidth(0.7); doc.roundedRect(x0, y0, largMes, altMes, 3, 3);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(r, g, b);
        doc.text(MESES_MAPA[m], x0 + largMes / 2, y0 + 5, { align: 'center' });
        const passo = (largMes - 6) / 7;
        doc.setFontSize(5.5);
        ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].forEach((s, i) => { doc.setTextColor(i === 0 ? 217 : 100, i === 0 ? 45 : 116, i === 0 ? 32 : 139); doc.text(s, x0 + 3 + passo * i + passo / 2, y0 + 9.5, { align: 'center' }); });
        const desloc = new Date(Date.UTC(d.ano, m, 1)).getUTCDay();
        const total = new Date(Date.UTC(d.ano, m + 1, 0)).getUTCDate();
        for (let dia = 1; dia <= total; dia++) {
            const pos = desloc + dia - 1, cx = x0 + 3 + passo * (pos % 7), cy = y0 + 11 + Math.floor(pos / 7) * passoLinha;
            const data = `${d.ano}-${String(m + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const info = dias.get(data);
            const n = d.ferias.get(data) || 0;
            let fundo: [number, number, number] | null = null, texto: [number, number, number] = pos % 7 === 0 ? [217, 45, 32] : [16, 24, 40];
            if (info?.tipo === 'data_internacional') { fundo = [224, 234, 255]; texto = [45, 71, 168]; }
            else if (info?.activo && info.tipo === 'ponte') { fundo = [254, 240, 199]; texto = [147, 55, 13]; }
            else if (info?.activo && info.folga) { fundo = [253, 227, 224]; texto = [180, 35, 24]; }
            if (n > 0 && !(info?.activo && info.folga) && pos % 7 !== 0 && pos % 7 !== 6) { fundo = [18, 183, 106]; texto = [255, 255, 255]; }
            if (fundo) { doc.setFillColor(...fundo); doc.roundedRect(cx + 0.4, cy - 0.2, passo - 0.8, passoLinha - 0.6, 1, 1, 'F'); }
            doc.setFont('helvetica', fundo ? 'bold' : 'normal'); doc.setFontSize(6.5); doc.setTextColor(...texto);
            doc.text(String(dia), cx + passo / 2, cy + passoLinha * 0.6, { align: 'center' });
            if (n > 1) { doc.setFontSize(4.2); doc.text(String(n), cx + passo - 1, cy + 1.6, { align: 'right' }); }
        }
    }
    y += 3 * (altMes + gap) + 1;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(71, 85, 105);
    doc.text('Verde: funcionários de férias (o número indica quantos) · Vermelho: feriado · Amarelo: ponte · Azul: data internacional (não é folga)', largura / 2, Math.min(y + 1, limite + 1), { align: 'center' });
    doc.addPage('a4', 'landscape');
    applyBranding(doc, config, userName, true);
    const y2 = brandingHeaderBottom(doc) + 8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42);
    doc.text(`MAPA DE FÉRIAS ${d.ano}`, largura / 2, y2, { align: 'center' });
    autoTable(doc, {
        startY: y2 + 5, theme: 'striped', styles: { fontSize: 7.5, cellPadding: 1.4 }, headStyles: { fillColor: cor },
        head: [['Funcionário', 'Departamento', 'Períodos', 'Dias úteis', 'Regresso', 'Estado', 'Saldo']],
        body: d.linhas.length ? d.linhas.map(l => [l.nome, l.departamento, l.periodos, String(l.dias), l.regresso, l.estado, String(l.saldo)]) : [[{ content: `Ainda não há férias planeadas em ${d.ano}.`, colSpan: 7 }]],
        columnStyles: { 3: { halign: 'right' }, 6: { halign: 'right' } },
        didDrawPage: () => applyBranding(doc, config, userName, true),
    });
    return terminar(doc, `Mapa-de-ferias-${d.ano}.pdf`, saida);
}

export type DadosContratoPdf = {
    titulo: string; referencia?: string | null;
    /** Texto do contrato (parágrafos separados por linha em branco; a 1.ª linha de «CLÁUSULA …» sai a negrito). */
    texto: string; local: string; dataExtenso: string;
    empregador: { representante?: string | null; cargo?: string | null };
    trabalhador: { nome: string; bi?: string | null };
    /** Marca de água «MINUTA» na pré-visualização. */
    minuta?: boolean;
};

/** Contrato de trabalho em A4: cabeçalho da empresa, título, cláusulas, local e data e as assinaturas das duas partes. */
export function gerarContratoTrabalhoPdf(d: DadosContratoPdf, settings: unknown, userName: string, saida: SaidaPdf = 'save'): FicheiroPdf {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const config = getCompanySettings(settings) as ReturnType<typeof getCompanySettings> & { phone?: string; email?: string };
    const largura = doc.internal.pageSize.getWidth();
    const altura = doc.internal.pageSize.getHeight();
    const esq = 22; const dir = largura - 22; const util = dir - esq;
    const empresa = (config.name || 'Empresa').toUpperCase();
    const logo = logotipoEmpresa(config);
    const rodape = () => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(100, 116, 139);
        doc.text(`${d.referencia ? `${d.referencia} · ` : ''}Emitido no Tango ERP por ${userName}`, esq, altura - 10);
        doc.text(`Página ${doc.getNumberOfPages()}`, dir, altura - 10, { align: 'right' });
        if (d.minuta) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(60); doc.setTextColor(226, 232, 240);
            doc.text('MINUTA', largura / 2, altura / 2, { align: 'center', angle: 30 });
        }
        doc.setTextColor(15, 23, 42);
    };
    let y = 18;
    if (logo) {
        try {
            const prop = doc.getImageProperties(logo);
            const escala = Math.min(16 / prop.width, 16 / prop.height);
            doc.addImage(logo, prop.fileType || 'PNG', largura / 2 - (prop.width * escala) / 2, y - 4, prop.width * escala, prop.height * escala, undefined, 'FAST');
            y += 16;
        } catch { /* logótipo ilegível: segue sem ele */ }
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(empresa, largura / 2, y, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    if (config.nif) doc.text(`NIF ${config.nif}`, largura / 2, y + 5, { align: 'center' });
    y += 10;
    doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.4); doc.line(esq, y, dir, y);
    y += 11;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13.5);
    for (const linha of doc.splitTextToSize(d.titulo.toUpperCase(), util) as string[]) { doc.text(linha, largura / 2, y, { align: 'center' }); y += 6; }
    if (d.referencia) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text(`N.º ${d.referencia}`, largura / 2, y, { align: 'center' }); y += 5; }
    y += 5;
    const quebra = (precisa: number) => { if (y + precisa > altura - 22) { rodape(); doc.addPage(); y = 22; } };
    for (const paragrafo of d.texto.split(/\n{2,}/u).map(t => t.trim()).filter(Boolean)) {
        const [primeira, ...resto] = paragrafo.split('\n');
        const clausula = /^CL[ÁA]USULA\b/iu.test(primeira) && resto.length > 0;
        if (clausula) {
            quebra(14);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
            doc.text(primeira.trim(), esq, y); y += 5.5;
        }
        const corpo = (clausula ? resto.join(' ') : paragrafo.replace(/\n/gu, ' ')).trim();
        if (!corpo) continue;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
        const linhas = doc.splitTextToSize(corpo, util) as string[];
        for (let i = 0; i < linhas.length; i += 1) {
            quebra(5.6);
            doc.text(linhas[i], esq, y, i < linhas.length - 1 ? { align: 'justify', maxWidth: util } : undefined);
            y += 5.6;
        }
        y += 3.5;
    }
    quebra(60);
    y += 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
    doc.text(`${d.local}, ${d.dataExtenso}.`, esq, y);
    y += 22;
    const meio = largura / 2;
    const colunas: Array<[number, string, string, string]> = [
        [esq + util / 4, 'O EMPREGADOR', d.empregador.representante?.trim() || empresa, d.empregador.cargo?.trim() || ''],
        [meio + util / 4, 'O TRABALHADOR', d.trabalhador.nome, d.trabalhador.bi ? `BI ${d.trabalhador.bi}` : ''],
    ];
    doc.setLineWidth(0.3);
    for (const [x, papel, nome, extra] of colunas) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
        doc.text(papel, x, y - 14, { align: 'center' });
        doc.line(x - 35, y, x + 35, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        doc.text(doc.splitTextToSize(nome, 72) as string[], x, y + 5, { align: 'center' });
        if (extra) { doc.setFontSize(8.5); doc.setTextColor(71, 85, 105); doc.text(extra, x, y + 10, { align: 'center' }); doc.setTextColor(15, 23, 42); }
    }
    rodape();
    const nome = (d.referencia || d.trabalhador.nome).normalize('NFD').replace(/[̀-ͯ]/gu, '').replace(/[^\w]+/gu, '-').replace(/^-+|-+$/gu, '');
    return terminar(doc, `Contrato-${nome}.pdf`, saida);
}
