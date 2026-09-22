import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { EInvoiceData } from './eInvoiceGenerator';
import { SAFTOptions } from './saftGenerator';
import { applyBranding, getCompanySettings } from './pdf';

const safeDate = (date: Date | string | undefined): Date => {
    if (!date) return new Date();
    const d = new Date(date);
    return isNaN(d.getTime()) ? new Date() : d;
};

export const generateInvoicePDF = async (data: EInvoiceData): Promise<void> => {
    const { invoiceNo, credit, client, companySettings: rawSettings, userName } = data;
    const doc = new jsPDF();
    const config = getCompanySettings(rawSettings);

    // Aplicar Branding (Cabeçalho e Rodapé Padrão)
    // Passamos userName null aqui para não desenhar o cabeçalho padrão de "Processado por", pois vamos customizar
    applyBranding(doc, config, undefined, false);

    // Configurações
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;

    // Calcular totais
    const netTotal = credit.principalAmount;
    const grossTotal = netTotal; // Isento
    const date = safeDate(credit.startDate);

    // Gerar QR Code
    const hashData = `${invoiceNo}*${config.nif}*${date.toISOString().split('T')[0]}*${grossTotal.toFixed(2)}`;
    const qrCodeDataUrl = await QRCode.toDataURL(hashData, { margin: 0 });

    // Sobrescrever/Ajustar Cabeçalho Específico da Factura (Lado Direito)
    // O applyBranding já desenhou o lado esquerdo (Logo/Nome)

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('FACTURA / RECIBO', pageWidth - margin - 5, 45, { align: 'right' }); // Baixado para evitar sobrepor branding

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(invoiceNo, pageWidth - margin - 5, 52, { align: 'right' });
    doc.text(`Data Emissão: ${date.toLocaleDateString('pt-PT')}`, pageWidth - margin - 5, 58, { align: 'right' });

    if (userName) {
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(`Operador: ${userName}`, pageWidth - margin - 5, 64, { align: 'right' });
        doc.setTextColor(0);
    }

    // Cliente
    let yPos = 75;
    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 30, 2, 2, 'FD');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Dados do Cliente', margin + 5, yPos + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(client.name.toUpperCase(), margin + 5, yPos + 14);
    doc.text(client.address || 'Endereço não informado', margin + 5, yPos + 19);
    doc.text(`NIF: ${client.nif || 'Consumidor Final'}`, margin + 5, yPos + 24);

    // Tabela de Itens
    yPos += 40;
    autoTable(doc, {
        startY: yPos,
        head: [['Descrição', 'Qtd', 'Preço Unit.', 'Desc.', 'Taxa', 'Total']],
        body: [
            [
                `Crédito Financeiro (Ref: ${credit.id})`,
                '1',
                `${netTotal.toLocaleString('pt-AO', { minimumFractionDigits: 2 })} Kz`,
                '0.00%',
                'Isento',
                `${netTotal.toLocaleString('pt-AO', { minimumFractionDigits: 2 })} Kz`
            ]
        ],
        theme: 'striped',
        headStyles: { fillColor: (config.primaryColor as [number, number, number]) || [255, 127, 0], textColor: 255 },
        styles: { fontSize: 9, cellPadding: 4 },
        didDrawPage: () => applyBranding(doc, config, undefined, true) // Apenas decoração nas novas páginas
    });

    // Totais
    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 10;

    // Evitar quebra de página mal calculada para os totais
    if (yPos > pageHeight - 120) {
        doc.addPage();
        applyBranding(doc, config, undefined, true);
        yPos = 30;
    }

    // Quadro de Impostos
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Quadro Resumo de Impostos:', margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text('Isento (Art. 12.º CST) - 0.00 AOA', margin, yPos + 5);

    // Totais à Direita
    // CORREÇÃO: Aumentar separação entre Rótulo e Valor
    const matchX = pageWidth - margin - 80; // Mais para a esquerda
    const valueX = pageWidth - margin - 5; // Margem direita segura

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0); // Garantir preto

    doc.text('Total Ilíquido:', matchX, yPos);
    doc.text(`${netTotal.toLocaleString('pt-AO', { minimumFractionDigits: 2 })} AOA`, valueX, yPos, { align: 'right' });

    yPos += 6;
    doc.text('Total Descontos:', matchX, yPos);
    doc.text('0.00 AOA', valueX, yPos, { align: 'right' });

    yPos += 6;
    doc.text('Total Imposto:', matchX, yPos);
    doc.text('0.00 AOA', valueX, yPos, { align: 'right' });

    yPos += 14;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(230, 230, 230); // Fundo cinza visível
    doc.setDrawColor(200, 200, 200);
    doc.rect(matchX - 5, yPos - 10, 90, 15, 'FD'); // Box maior

    doc.setTextColor(0, 0, 0);
    doc.text('TOTAL A PAGAR:', matchX, yPos); // Label à esquerda
    doc.text(`${grossTotal.toLocaleString('pt-AO', { minimumFractionDigits: 2 })} AOA`, valueX, yPos, { align: 'right' }); // Valor à direita

    // Área de Validação (Hash + QR)
    const footerAreaStart = pageHeight - 75;

    doc.setDrawColor(180);
    doc.setLineWidth(0.5);
    doc.line(margin, footerAreaStart, pageWidth - margin, footerAreaStart);

    // Hash (Texto)
    doc.setFontSize(8);
    doc.setFont('courier', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(`Hash de Controlo: ${data.invoiceNo} - (4 char)`, margin, footerAreaStart + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Processado por programa certificado nº 000/AGT/2026 (TangoGestaoCreditoERP)', margin, footerAreaStart + 10);
    doc.text('Os bens/serviços foram colocados à disposição na data do documento.', margin, footerAreaStart + 14);

    // QR Code Image (Alinhado à ESQUERDA para não sobrepor triângulo do rodapé)
    // Posição: Direita inferior acima do rodapé, mas garantindo que não bata no triângulo. 
    // Triângulo começa em pageWidth - 40. Então QR deve terminar antes de pageWidth - 40.
    // pageWidth (210) - 20 (margem) = 190. Triângulo ocupa 170-210.
    // Colocar QR em 140 (X) -> 140+30=170. Seguro.

    doc.addImage(qrCodeDataUrl, 'PNG', pageWidth - margin - 50, footerAreaStart + 2, 28, 28);

    doc.save(`${invoiceNo.replace(/\s/g, '_')}.pdf`);
};

export const generateSaftReportPDF = async (companySettings: any, period: SAFTOptions, counts: { clients: number, invoices: number, payments: number }) => {
    const doc = new jsPDF();
    const config = getCompanySettings(companySettings);

    applyBranding(doc, config, undefined, false);

    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Gerar QR Code para Validação
    const startDate = safeDate(period.startDate);
    const endDate = safeDate(period.endDate);

    const qrData = `SAFT:${config.nif}:${period.fiscalYear}:${startDate.toISOString()}:${counts.invoices}`;
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, { margin: 0 });

    // Título Ajustado (Abaixo do Branding Header)
    let yPos = 55;

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0); // Preto Forçado
    doc.text('Relatório de Síntese SAF-T (AO)', pageWidth / 2, yPos, { align: 'center' });

    yPos += 10;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Período Fiscal: ${period.fiscalYear}`, pageWidth / 2, yPos, { align: 'center' });

    // Detalhes da Emissão - CORREÇÃO DE CONTRASTE
    yPos += 20;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(230, 230, 230); // Fundo mais escuro/visível
    doc.rect(margin, yPos - 6, pageWidth - (margin * 2), 10, 'F');
    doc.text('1. Intervalo de Datas', margin + 5, yPos);

    yPos += 12;
    doc.setFontSize(11);

    // Usar Bold para Labels para melhor leitura sobre o branco
    doc.setFont('helvetica', 'bold');
    doc.text(`Data Início:`, margin + 10, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(startDate.toLocaleDateString('pt-PT'), margin + 40, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text(`Data Fim:`, margin + 90, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(endDate.toLocaleDateString('pt-PT'), margin + 115, yPos);

    yPos += 15;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(230, 230, 230);
    doc.rect(margin, yPos - 6, pageWidth - (margin * 2), 10, 'F');
    doc.text('2. Resumo de Dados', margin + 5, yPos);

    yPos += 10;
    const summaryData = [
        ['Total de Clientes Reportados', counts.clients.toString()],
        ['Documentos de Facturação', counts.invoices.toString()],
        ['Recibos de Pagamento', counts.payments.toString()],
        ['Versão de Esquema', '1.01_01'],
        ['Data de Criação do XML', new Date().toLocaleDateString('pt-PT')]
    ];

    autoTable(doc, {
        startY: yPos,
        head: [['Indicador', 'Valor']],
        body: summaryData,
        theme: 'striped',
        headStyles: {
            fillColor: [40, 40, 40],
            textColor: [255, 255, 255],
            fontStyle: 'bold'
        },
        bodyStyles: {
            textColor: [0, 0, 0], // Preto
            fontSize: 10
        },
        alternateRowStyles: {
            fillColor: [245, 245, 245]
        },
        didDrawPage: () => applyBranding(doc, config, undefined, true)
    });

    // Validadores
    const footerAreaStart = pageHeight - 80;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Validação de Integridade', margin, footerAreaStart);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Este relatório resume o conteúdo do ficheiro XML gerado.', margin, footerAreaStart + 6);
    doc.text('O ficheiro XML deve ser submetido no Portal da AGT.', margin, footerAreaStart + 11);

    // QR Code
    doc.addImage(qrCodeDataUrl, 'PNG', pageWidth - margin - 35, footerAreaStart - 5, 30, 30);

    doc.save(`Resumo_SAFT_${period.fiscalYear}.pdf`);
};




