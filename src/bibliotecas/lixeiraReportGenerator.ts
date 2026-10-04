import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { applyBranding, getCompanySettings, BRAND_ORANGE, BRAND_CHARCOAL, resolveBrandPrimary } from './pdf';

interface LixeiraReportData {
    deletedClients: any[];
    deletedCredits: any[];
    deletedPayments: any[];
    deletedLegalCases: any[];
    deletedWarranties: any[];
    users: any[];
    companySettings: any;
    userName?: string;
}

export const generateLixeiraReport = (data: LixeiraReportData) => {
    const {
        deletedClients,
        deletedCredits,
        deletedPayments,
        deletedLegalCases,
        deletedWarranties,
        users,
        companySettings,
        userName
    } = data;

    const doc = new jsPDF();
    const config = getCompanySettings(companySettings);
    const primary = resolveBrandPrimary(config.primaryColor);
    const dark = BRAND_CHARCOAL;

    // 1. Aplica o branding institucional completo
    applyBranding(doc, config, userName);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 2. Título Executivo com Acento Vertical Laranja (Conforme Imagem de Referência)
    let yPos = 52;
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.roundedRect(16, yPos, 3.5, 11, 0.8, 0.8, 'F');

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text('RELATÓRIO DE ITENS ELIMINADOS (LIXEIRA)', 22, yPos + 5);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Emitido em: ${format(new Date(), "dd 'de' MMMM 'de' yyyy', às' HH:mm", { locale: ptBR })}   |   Responsável: ${(userName || 'Sistema').toUpperCase()}`, 22, yPos + 9.5);

    yPos += 20;

    const getUserName = (userId: string) => {
        const u = users.find(u => u.id === userId);
        return u ? u.name : 'Sistema/Desconhecido';
    };

    const formatDate = (date: any) => {
        if (!date) return 'Desconhecido';
        const d = new Date(date);
        if (isNaN(d.getTime())) return 'Inválido';
        return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
    };

    const sections = [
        { title: 'CLIENTES ELIMINADOS', data: deletedClients, headers: ['Nome', 'NIF/BI', 'Eliminado Em', 'Por'] },
        { title: 'CRÉDITOS ELIMINADOS', data: deletedCredits, headers: ['ID/Cliente', 'Montante', 'Eliminado Em', 'Por'] },
        { title: 'PAGAMENTOS ELIMINADOS', data: deletedPayments, headers: ['ID/Cliente', 'Valor', 'Eliminado Em', 'Por'] },
        { title: 'PROCESSOS LEGAIS ELIMINADOS', data: deletedLegalCases, headers: ['ID Processo', 'ID Crédito', 'Eliminado Em', 'Por'] },
        { title: 'GARANTIAS ELIMINADAS', data: deletedWarranties, headers: ['Descrição', 'Tipo', 'Eliminado Em', 'Por'] },
    ];

    sections.forEach(section => {
        if (section.data.length > 0) {
            if (yPos > pageHeight - 50) {
                doc.addPage();
                applyBranding(doc, config, undefined, true);
                yPos = 38;
            }

            // Acento de Seção Laranja
            doc.setFillColor(primary[0], primary[1], primary[2]);
            doc.rect(16, yPos - 3, 2.5, 7, 'F');

            doc.setFontSize(10.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(dark[0], dark[1], dark[2]);
            doc.text(section.title, 22, yPos + 2);
            yPos += 7;

            autoTable(doc, {
                startY: yPos,
                head: [section.headers],
                body: section.data.map((item: any) => {
                    if (section.title.includes('CLIENTES')) {
                        return [item.name, item.nif || 'N/A', formatDate(item.deletedAt), getUserName(item.deletedBy)];
                    }
                    if (section.title.includes('CRÉDITOS')) {
                        return [item.clientName || item.id, `${item.principalAmount?.toLocaleString()} AOA`, formatDate(item.deletedAt), getUserName(item.deletedBy)];
                    }
                    if (section.title.includes('PAGAMENTOS')) {
                        return [item.clientName || item.id, `${item.amount?.toLocaleString()} AOA`, formatDate(item.deletedAt), getUserName(item.deletedBy)];
                    }
                    if (section.title.includes('PROCESSOS')) {
                        return [item.id, item.creditId, formatDate(item.deletedAt), getUserName(item.deletedBy)];
                    }
                    if (section.title.includes('GARANTIAS')) {
                        return [item.description, item.type, formatDate(item.deletedAt), getUserName(item.deletedBy)];
                    }
                    return [];
                }),
                theme: 'striped',
                headStyles: { fillColor: dark, textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [250, 250, 252] },
                styles: { fontSize: 8, cellPadding: 2.5, textColor: dark },
                margin: { left: 16, right: 14 },
                didDrawPage: () => applyBranding(doc, config, undefined, true)
            });

            yPos = (doc as any).lastAutoTable.finalY + 14;
        }
    });

    if (yPos > pageHeight - 35) {
        doc.addPage();
        applyBranding(doc, config, undefined, true);
        yPos = 38;
    }

    // Nota de rodapé sutil
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text('Nota: Este relatório contém registos de itens em estado de retenção temporária (30 dias).', 16, yPos);

    const filename = `Relatorio_Lixeira_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;
    doc.save(filename);
};
