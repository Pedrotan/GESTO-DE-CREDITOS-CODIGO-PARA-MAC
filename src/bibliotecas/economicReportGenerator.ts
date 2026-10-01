import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Client, Credit, Payment } from '@/tipos/credito';
import { applyBranding, getCompanySettings, BRAND_ORANGE, BRAND_CHARCOAL, resolveBrandPrimary } from './pdf';

type CompanySettings = {
    name: string;
    nif?: string;
    address?: string;
    phone?: string;
    email?: string;
    currency?: string;
    logo?: string;
    [key: string]: any;
};

interface EconomicReportData {
    clients: Client[];
    credits: Credit[];
    payments: Payment[];
    logs?: any[];
    companySettings: CompanySettings;
    userName?: string;
}

const actionTranslation: Record<string, string> = {
    'create': 'CRIAÇÃO',
    'update': 'ATUALIZAÇÃO',
    'delete': 'ELIMINAÇÃO',
    'login': 'LOGIN',
    'logout': 'LOGOUT',
    'system': 'SISTEMA'
};

export const generateEconomicReport = (data: EconomicReportData) => {
    const { clients, credits, payments, logs = [], companySettings: rawSettings, userName } = data;
    const doc = new jsPDF();
    const config = getCompanySettings(rawSettings);
    const primary = resolveBrandPrimary(config.primaryColor);
    const dark = BRAND_CHARCOAL;

    // 1. Aplica branding institucional completo conforme modelo de referência
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
    doc.text('RELATÓRIO ECONÓMICO GLOBAL', 22, yPos + 5);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-PT')} às ${new Date().toLocaleTimeString('pt-PT')}   |   Operador: ${(userName || 'Sistema').toUpperCase()}`, 22, yPos + 9.5);

    yPos += 18;

    // Helper para quebras de página suaves
    const checkPageBreak = (requiredSpace: number = 25) => {
        if (yPos + requiredSpace > pageHeight - 30) {
            doc.addPage();
            applyBranding(doc, config, undefined, true);
            yPos = 38;
            return true;
        }
        return false;
    };

    // Helper para desenhar barra de progresso/gráfico
    const drawBar = (label: string, value: number, maxValue: number, color: [number, number, number], y: number) => {
        const barMaxWidth = 95;
        const barWidth = maxValue > 0 ? (value / maxValue) * barMaxWidth : 0;

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text(label, 22, y);

        // Fundo da barra
        doc.setFillColor(243, 244, 246);
        doc.rect(85, y - 3, barMaxWidth, 4, 'F');

        // Barra de valor
        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(85, y - 3, barWidth, 4, 'F');

        // Valor numérico
        doc.setFont('helvetica', 'bold');
        doc.text(value.toString(), 190, y, { align: 'right' });
    };

    // ========== 1. RESUMO FINANCEIRO ==========
    checkPageBreak(50);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.rect(16, yPos - 3.5, 2.5, 7.5, 'F');
    doc.text('1. RESUMO FINANCEIRO', 22, yPos + 2);
    yPos += 10;

    // Cálculos
    const totalCreditsIssued = credits.reduce((sum, c) => sum + c.principalAmount, 0);
    const totalExpected = credits.reduce((sum, c) => sum + c.totalDue, 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalOutstanding = credits.reduce((sum, c) => sum + c.currentBalance, 0);

    // Cards executivos com friso superior laranja
    const drawCard = (x: number, y: number, title: string, value: string, valueColor: [number, number, number] = dark) => {
        const cardW = 84;
        const cardH = 18;
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'FD');

        // Friso Laranja
        doc.setFillColor(primary[0], primary[1], primary[2]);
        doc.rect(x + 1.5, y, cardW - 3, 1.0, 'F');

        doc.setFontSize(6.8);
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'bold');
        doc.text(title.toUpperCase(), x + 4, y + 6);

        doc.setFontSize(10.5);
        doc.setTextColor(valueColor[0], valueColor[1], valueColor[2]);
        doc.text(value, x + 4, y + 14);
    };

    drawCard(16, yPos, 'Capital Concedido (Total)', `${totalCreditsIssued.toLocaleString('pt-AO', { maximumFractionDigits: 0 })} AOA`, dark);
    drawCard(106, yPos, 'Total Arrecadado (Caixa)', `${totalPaid.toLocaleString('pt-AO', { maximumFractionDigits: 0 })} AOA`, [22, 101, 52]);
    yPos += 22;
    drawCard(16, yPos, 'Expectativa de Retorno Global', `${totalExpected.toLocaleString('pt-AO', { maximumFractionDigits: 0 })} AOA`, dark);
    drawCard(106, yPos, 'Saldo Pendente em Carteira', `${totalOutstanding.toLocaleString('pt-AO', { maximumFractionDigits: 0 })} AOA`, [220, 38, 38]);
    yPos += 26;

    // ========== 2. ANÁLISE DE CARTEIRA ==========
    checkPageBreak(65);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.rect(16, yPos - 3.5, 2.5, 7.5, 'F');
    doc.text('2. ANÁLISE DA CARTEIRA DE CRÉDITO', 22, yPos + 2);
    yPos += 12;

    const activeCredits = credits.filter(c => c.status === 'active').length;
    const paidCredits = credits.filter(c => c.status === 'paid').length;
    const overdueCredits = credits.filter(c => c.status === 'overdue').length;
    const maxCount = Math.max(activeCredits, paidCredits, overdueCredits, 1);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('DISTRIBUIÇÃO POR ESTADO', 22, yPos);
    yPos += 8;

    drawBar('Operações Ativas', activeCredits, maxCount, primary, yPos); yPos += 7.5;
    drawBar('Liquidadas / Pagas', paidCredits, maxCount, [22, 101, 52], yPos); yPos += 7.5;
    drawBar('Em Atraso / Incumprimento', overdueCredits, maxCount, [220, 38, 38], yPos); yPos += 12;

    // Gráfico de Clientes Top 5
    checkPageBreak(50);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('TOP 5 CLIENTES POR VOLUME DE CRÉDITO', 22, yPos);
    yPos += 8;

    const topClients = clients.map(client => {
        const vol = credits.filter(c => c.clientId === client.id).reduce((s, c) => s + c.principalAmount, 0);
        return { name: client.name, volume: vol };
    }).sort((a, b) => b.volume - a.volume).slice(0, 5);

    const maxVol = topClients[0]?.volume || 1;

    topClients.forEach(client => {
        const barMaxWidth = 80;
        const barWidth = (client.volume / maxVol) * barMaxWidth;

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(dark[0], dark[1], dark[2]);
        const name = client.name.length > 22 ? client.name.substring(0, 20) + '..' : client.name;
        doc.text(name, 22, yPos);

        doc.setFillColor(243, 244, 246);
        doc.rect(85, yPos - 3, barMaxWidth, 4, 'F');
        doc.setFillColor(primary[0], primary[1], primary[2]);
        doc.rect(85, yPos - 3, barWidth, 4, 'F');

        doc.setFont('helvetica', 'bold');
        doc.text(`${(client.volume / 1000).toFixed(1)}k AOA`, 190, yPos, { align: 'right' });
        yPos += 7.5;
    });

    // ========== 3. MÉTRICAS OPERACIONAIS ==========
    yPos += 8;
    checkPageBreak(45);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.rect(16, yPos - 3.5, 2.5, 7.5, 'F');
    doc.text('3. MÉTRICAS OPERACIONAIS', 22, yPos + 2);
    yPos += 10;

    const metrics = [
        ['Total de Clientes Cadastrados', clients.length.toString()],
        ['Total de Contratos de Crédito', credits.length.toString()],
        ['Total de Pagamentos Registados', payments.length.toString()],
        ['Ticket Médio de Empréstimo', `${(credits.length > 0 ? totalCreditsIssued / credits.length : 0).toLocaleString('pt-AO', { maximumFractionDigits: 0 })} AOA`]
    ];

    autoTable(doc, {
        startY: yPos,
        head: [['Indicador de Performance', 'Valor']],
        body: metrics,
        theme: 'striped',
        headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 250, 252] },
        styles: { fontSize: 8.5, cellPadding: 3, textColor: dark },
        margin: { left: 16, right: 14 },
        didDrawPage: () => applyBranding(doc, config, undefined, true)
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 12;

    // ========== 4. REGISTO DE ATIVIDADE RECENTE (LOGS) ==========
    if (logs && logs.length > 0) {
        checkPageBreak(60);
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.setFillColor(primary[0], primary[1], primary[2]);
        doc.rect(16, yPos - 3.5, 2.5, 7.5, 'F');
        doc.text('4. REGISTO DE ATIVIDADE RECENTE (AUDITORIA)', 22, yPos + 2);
        yPos += 10;

        const recentLogs = logs.slice(0, 30).map(log => [
            new Date(log.timestamp).toLocaleString('pt-PT'),
            log.userName || log.userId,
            actionTranslation[log.action.toLowerCase()] || log.action.toUpperCase(),
            log.details ? (log.details.length > 60 ? log.details.substring(0, 60) + '...' : log.details) : '-'
        ]);

        autoTable(doc, {
            startY: yPos,
            head: [['Data/Hora', 'Utilizador', 'Ação', 'Detalhes']],
            body: recentLogs,
            theme: 'striped',
            headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [250, 250, 252] },
            styles: { fontSize: 7, cellPadding: 2, textColor: dark },
            columnStyles: {
                0: { cellWidth: 35 },
                1: { cellWidth: 30 },
                2: { cellWidth: 25 },
                3: { cellWidth: 'auto' }
            },
            margin: { left: 16, right: 14, bottom: 25 },
            didDrawPage: () => applyBranding(doc, config, undefined, true)
        });
    }

    const filename = `Relatorio_Economico_Completo_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
};
