/**
 * PDF de um documento fiscal electrónico (FR, FT, NC, RG…) com o QR Code da AGT.
 * Imprime exactamente o que foi assinado e comunicado (payload guardado), nunca valores recalculados.
 */
import QRCode from 'qrcode';
import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from '@/bibliotecas/pdf-tabela';
import { applyBranding, getCompanySettings } from '@/bibliotecas/pdf';
import { formatCurrency } from '@/bibliotecas/formatters';
import { urlQrAgt } from './regras';
import type { AgtDocumento, DadosSoftware } from './tipos';
import { AGT_TIPOS_DOCUMENTO } from './tipos';

/** Os 4 caracteres do hash (posições 1, 11, 21 e 31), como nos documentos certificados. */
const quatroCaracteres = (hash: string) => [0, 10, 20, 30].map(i => hash.charAt(i)).join('');

export async function gerarPdfDocumentoFiscal(p: {
  documento: AgtDocumento; saftHash: string; nifEmissor: string; software: DadosSoftware; simulado: boolean;
  morada?: string | null; empresa: any; operador?: string | null; estadoAgt?: string;
}) {
  const { documento: d } = p;
  const doc = new jsPDF();
  const config = getCompanySettings(p.empresa);
  applyBranding(doc, config, undefined, false);
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const m = 20;

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(AGT_TIPOS_DOCUMENTO[d.documentType].toUpperCase(), largura - m, 45, { align: 'right' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(d.documentNo, largura - m, 51, { align: 'right' });
  doc.text(`Data: ${d.documentDate.split('-').reverse().join('/')}`, largura - m, 56, { align: 'right' });
  if (d.documentStatus === 'C' && d.rejectedDocumentNo) doc.text(`Correcção de ${d.rejectedDocumentNo}`, largura - m, 61, { align: 'right' });
  if (p.simulado) {
    doc.setTextColor(200, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('SIMULAÇÃO — SEM VALIDADE FISCAL', largura - m, 67, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  let y = 74;
  doc.setFillColor(245, 245, 245);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(m, y, largura - 2 * m, 26, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Cliente', m + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(d.companyName.toUpperCase(), m + 4, y + 12);
  doc.text(p.morada || 'Morada não indicada', m + 4, y + 17);
  doc.text(`NIF: ${d.customerTaxID === '999999999' ? 'Consumidor final' : d.customerTaxID}`, m + 4, y + 22);
  y += 34;

  const corpo = d.lines?.length
    ? d.lines.map(l => {
        const t = l.taxes?.[0];
        const valor = l.creditAmount ?? l.debitAmount ?? 0;
        const taxa = t ? (t.taxBase != null ? `${t.taxType} ${t.taxPercentage ?? 0}% s/ ${formatCurrency(t.taxBase)}` : `${t.taxType} ${t.taxPercentage ?? 0}%${t.taxExemptionCode ? ` (${t.taxExemptionCode})` : ''}`) : '';
        return [l.productDescription, String(l.quantity), formatCurrency(l.unitPriceBase), formatCurrency(l.settlementAmount), taxa, formatCurrency(valor)];
      })
    : (d.paymentReceipt?.sourceDocuments ?? []).map(s => [`Liquidação de ${s.sourceDocumentID.OriginatingON}`, '1', '', '', '', formatCurrency(s.creditAmount ?? s.debitAmount ?? 0)]);

  autoTable(doc, {
    startY: y,
    head: [['Descrição', 'Qtd', 'Preço', 'Desc.', 'Imposto', 'Valor']],
    body: corpo,
    theme: 'striped',
    headStyles: { fillColor: (config.primaryColor as [number, number, number]) || [19, 33, 74], textColor: 255 },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 70 }, 5: { halign: 'right' } },
    didDrawPage: () => applyBranding(doc, config, undefined, true),
  });
  // @ts-ignore — propriedade do plugin autotable
  y = doc.lastAutoTable.finalY + 8;
  if (y > altura - 110) { doc.addPage(); applyBranding(doc, config, undefined, true); y = 30; }

  const xRotulo = largura - m - 80, xValor = largura - m;
  doc.setFontSize(9);
  const linha = (rotulo: string, valor: number) => { doc.text(rotulo, xRotulo, y); doc.text(formatCurrency(valor), xValor, y, { align: 'right' }); y += 6; };
  linha('Total sem imposto:', d.documentTotals.netTotal);
  linha('Total de imposto:', d.documentTotals.taxPayable);
  for (const w of d.withholdingTaxList ?? []) linha(`Retenção ${w.withholdingTaxType}:`, -w.withholdingTaxAmount);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const aPagar = d.documentTotals.grossTotal - (d.withholdingTaxList ?? []).reduce((s, w) => s + w.withholdingTaxAmount, 0);
  doc.text('TOTAL:', xRotulo, y + 2);
  doc.text(formatCurrency(aPagar), xValor, y + 2, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  // Isenções: motivo legal obrigatório quando não há imposto
  const isencoes = [...new Set((d.lines ?? []).flatMap(l => (l.taxes ?? []).filter(t => t.taxExemptionCode).map(t => t.taxExemptionCode!)))];
  if (isencoes.length) { doc.setFontSize(8); doc.text(`Motivo de isenção: ${isencoes.join(', ')}`, m, y + 2); }
  const referencia = d.lines?.[0]?.referenceInfo;
  if (referencia) { doc.setFontSize(8); doc.text(`Documento de origem: ${referencia.reference}${referencia.reason ? ` — ${referencia.reason}` : ''}`, m, y + 7); }

  // Rodapé de validação: QR Code AGT, 4 caracteres do hash e certificação
  const base = altura - 72;
  doc.setDrawColor(180);
  doc.line(m, base, largura - m, base);
  const qr = await QRCode.toDataURL(urlQrAgt(p.nifEmissor, d.documentNo), { errorCorrectionLevel: 'M', margin: 1, width: 350 });
  doc.addImage(qr, 'PNG', m, base + 3, 30, 30);
  doc.setFontSize(8);
  doc.setFont('courier', 'normal');
  const certificacao = p.software.softwareValidationNumber
    ? `${quatroCaracteres(p.saftHash)}-Processado por programa válido n.º ${p.software.softwareValidationNumber}`
    : `${quatroCaracteres(p.saftHash)}-Software em processo de certificação AGT`;
  doc.text(certificacao, m + 34, base + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Leia o QR Code para confirmar este documento no Quiosque AGT.', m + 34, base + 13);
  if (p.estadoAgt) doc.text(`Estado na AGT: ${p.estadoAgt}`, m + 34, base + 18);
  if (p.operador) doc.text(`Emitido por: ${p.operador}`, m + 34, base + 23);

  doc.save(`${d.documentNo.replace(/[\s/]/g, '_')}.pdf`);
}
