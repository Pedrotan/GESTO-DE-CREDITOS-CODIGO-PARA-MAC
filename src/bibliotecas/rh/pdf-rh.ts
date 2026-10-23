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

export { terminar as terminarPdfRH, assinaturas as assinaturasPdfRH, dataPt as dataPdfRH, formatCurrency as moedaPdfRH };
