import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { applyBranding, getCompanySettings } from './pdf';

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

    // Apply branding
    applyBranding(doc, config, userName);

    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 85;

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text('RELATÓRIO DE ITENS ELIMINADOS (LIXEIRA)', pageWidth / 2, yPos, { align: 'center' });

    yPos += 12;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Emitido em: ${format(new Date(), "dd 'de' MMMM 'de' yyyy', às' HH:mm", { locale: ptBR })}`, pageWidth / 2, yPos, { align: 'center' });

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

    // Combine all deleted items for a summary table or separate sections
    // I'll go with separate sections for clarity as per "all details" request

    const sections = [
        { title: 'CLIENTES ELIMINADOS', data: deletedClients, headers: ['Nome', 'NIF/BI', 'Eliminado Em', 'Por'] },
        { title: 'CRÉDITOS ELIMINADOS', data: deletedCredits, headers: ['ID/Cliente', 'Montante', 'Eliminado Em', 'Por'] },
        { title: 'PAGAMENTOS ELIMINADOS', data: deletedPayments, headers: ['ID/Cliente', 'Valor', 'Eliminado Em', 'Por'] },
        { title: 'PROCESSOS LEGAIS ELIMINADOS', data: deletedLegalCases, headers: ['ID Processo', 'ID Crédito', 'Eliminado Em', 'Por'] },
        { title: 'GARANTIAS ELIMINADAS', data: deletedWarranties, headers: ['Descrição', 'Tipo', 'Eliminado Em', 'Por'] },
    ];

    sections.forEach(section => {
        if (section.data.length > 0) {
            if (yPos > 240) {
                doc.addPage();
                applyBranding(doc, config, undefined, true);
                yPos = 40;
            }

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(section.title, 20, yPos);
            yPos += 5;

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
                headStyles: { fillColor: [30, 41, 59], fontSize: 9 },
                styles: { fontSize: 8 },
                margin: { left: 20, right: 20 },
            });

            yPos = (doc as any).lastAutoTable.finalY + 15;
        }
    });

    if (yPos > 250) {
        doc.addPage();
        applyBranding(doc, config, undefined, true);
        yPos = 40;
    }

    // Summary footer inside PDF
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text('Nota: Este relatório contém registos de itens em estado de retenção temporária (30 dias).', 20, yPos);

    const filename = `Relatorio_Lixeira_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;
    doc.save(filename);
};
