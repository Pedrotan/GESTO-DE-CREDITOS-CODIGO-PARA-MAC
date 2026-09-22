import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Client, Credit, Payment } from '@/tipos/credito';
import { applyBranding, getCompanySettings } from './pdf';

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

    // 1. APLICAR BRANDING PADRÃO DO SISTEMA (Cabeçalho, Rodapé, Marca d'água)
    // Isso adiciona automaticamente o Logo, Nome da Empresa, NIF, e o rodapé padrão.
    applyBranding(doc, config, userName);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Ajustar posição inicial para não sobrepor o cabeçalho padrão
    let yPos = 55;

    // Título do Relatório (Abaixo do cabeçalho da empresa)
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 50, 100); // Azul profissional
    doc.text('RELATÓRIO ECONÓMICO GLOBAL', pageWidth / 2, yPos, { align: 'center' });

    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-PT')} às ${new Date().toLocaleTimeString('pt-PT')}`, pageWidth / 2, yPos, { align: 'center' });

    yPos += 15;

    // Helper para adicionar nova página se necessário
    const checkPageBreak = (requiredSpace: number = 20) => {
        if (yPos + requiredSpace > pageHeight - 30) { // Margem inferior maior por causa do rodapé
            doc.addPage();
            applyBranding(doc, config, undefined, true); // Reaplicar apenas decoração nas novas páginas
            yPos = 40; // Margem superior segura na nova página
            return true;
        }
        return false;
    };

    // Helper para desenhar barra de progresso/gráfico
    const drawBar = (label: string, value: number, maxValue: number, color: [number, number, number], y: number) => {
        const barMaxWidth = 100;
        const barWidth = maxValue > 0 ? (value / maxValue) * barMaxWidth : 0;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(50, 50, 50);
        doc.text(label, 25, y);

        // Fundo da barra
        doc.setFillColor(240, 240, 240);
        doc.rect(80, y - 3, barMaxWidth, 4, 'F');

        // Barra de valor
        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(80, y - 3, barWidth, 4, 'F');

        // Valor numérico
        doc.text(value.toString(), 190, y, { align: 'right' });
    };

    // ========== 1. RESUMO FINANCEIRO ==========
    checkPageBreak(50);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 50, 100);
    doc.setFillColor(235, 242, 250);
    doc.rect(20, yPos - 6, pageWidth - 40, 9, 'F');
    doc.text('1. RESUMO FINANCEIRO', 25, yPos);
    yPos += 15;

    // Cálculos
    const totalCreditsIssued = credits.reduce((sum, c) => sum + c.principalAmount, 0);
    const totalExpected = credits.reduce((sum, c) => sum + c.totalDue, 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalOutstanding = credits.reduce((sum, c) => sum + c.currentBalance, 0);

    // Cards simulados
    const drawCard = (x: number, y: number, title: string, value: string, color: [number, number, number]) => {
        doc.setDrawColor(220, 220, 220);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(x, y, 80, 22, 2, 2, 'FD');

        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'bold');
        doc.text(title.toUpperCase(), x + 5, y + 7);

        doc.setFontSize(12);
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(value, x + 5, y + 16);
    };

    drawCard(20, yPos, 'Capital Emprestado', `${totalCreditsIssued.toLocaleString('pt-AO', { maximumFractionDigits: 0 })} AOA`, [0, 102, 204]);
    drawCard(110, yPos, 'Total Recebido', `${totalPaid.toLocaleString('pt-AO', { maximumFractionDigits: 0 })} AOA`, [46, 125, 50]);
    yPos += 45;
    drawCard(20, yPos, 'Expectativa de Retorno', `${totalExpected.toLocaleString('pt-AO', { maximumFractionDigits: 0 })} AOA`, [100, 100, 100]);
    drawCard(110, yPos, 'Saldo em Dívida', `${totalOutstanding.toLocaleString('pt-AO', { maximumFractionDigits: 0 })} AOA`, [198, 40, 40]);
    yPos += 30;

    // ========== 2. ANÁLISE DE CARTEIRA ==========
    checkPageBreak(80);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 50, 100);
    doc.setFillColor(235, 242, 250);
    doc.rect(20, yPos - 6, pageWidth - 40, 9, 'F');
    doc.text('2. ANÁLISE DE CARTEIRA (GRÁFICOS)', 25, yPos);
    yPos += 15;

    const activeCredits = credits.filter(c => c.status === 'active').length;
    const paidCredits = credits.filter(c => c.status === 'paid').length;
    const overdueCredits = credits.filter(c => c.status === 'overdue').length;
    const maxCount = Math.max(activeCredits, paidCredits, overdueCredits, 1);

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('Distribuição por Estado de Crédito', 20, yPos);
    yPos += 10;

    drawBar('Projectos Activos', activeCredits, maxCount, [0, 102, 204], yPos); yPos += 8;
    drawBar('Finalizados / Pagos', paidCredits, maxCount, [46, 125, 50], yPos); yPos += 8;
    drawBar('Em Incumprimento', overdueCredits, maxCount, [198, 40, 40], yPos); yPos += 12;

    // Gráfico de Clientes Top 5
    checkPageBreak(60);
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('Top 5 Clientes (Volume)', 20, yPos);
    yPos += 10;

    const topClients = clients.map(client => {
        const vol = credits.filter(c => c.clientId === client.id).reduce((s, c) => s + c.principalAmount, 0);
        return { name: client.name, volume: vol };
    }).sort((a, b) => b.volume - a.volume).slice(0, 5);

    const maxVol = topClients[0]?.volume || 1;

    topClients.forEach(client => {
        const barMaxWidth = 80;
        const barWidth = (client.volume / maxVol) * barMaxWidth;

        doc.setFontSize(8);
        doc.setTextColor(50, 50, 50);
        const name = client.name.length > 20 ? client.name.substring(0, 18) + '..' : client.name;
        doc.text(name, 25, yPos);

        doc.setFillColor(240, 240, 240);
        doc.rect(80, yPos - 3, barMaxWidth, 4, 'F');
        doc.setFillColor(0, 102, 204);
        doc.rect(80, yPos - 3, barWidth, 4, 'F');

        doc.text(`${(client.volume / 1000).toFixed(1)}k`, 170, yPos, { align: 'right' });
        yPos += 8;
    });

    // ========== 3. MÉTRICAS OPERACIONAIS ==========
    yPos += 10;
    checkPageBreak(40);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 50, 100);
    doc.setFillColor(235, 242, 250);
    doc.rect(20, yPos - 6, pageWidth - 40, 9, 'F');
    doc.text('3. MÉTRICAS OPERACIONAIS', 25, yPos);
    yPos += 15;

    const metrics = [
        ['Total Clientes', clients.length.toString()],
        ['Total Créditos', credits.length.toString()],
        ['Total Transações', payments.length.toString()],
        ['Ticket Médio', `${(credits.length > 0 ? totalCreditsIssued / credits.length : 0).toLocaleString('pt-AO', { maximumFractionDigits: 0 })} AOA`]
    ];

    autoTable(doc, {
        startY: yPos,
        head: [['Métrica', 'Valor']],
        body: metrics,
        theme: 'striped',
        headStyles: { fillColor: (config.primaryColor as any) || [0, 50, 100] },
        styles: { fontSize: 9 },
        margin: { left: 20, right: 20 },
        didDrawPage: () => applyBranding(doc, config, undefined, true)
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    // ========== 4. REGISTO DE ATIVIDADE RECENTE (LOGS) ==========
    if (logs && logs.length > 0) {
        checkPageBreak(60);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 50, 100);
        doc.setFillColor(235, 242, 250);
        doc.rect(20, yPos - 6, pageWidth - 40, 9, 'F');
        doc.text('4. REGISTO DE ATIVIDADE RECENTE (LOGS)', 25, yPos);
        yPos += 15;

        // Pegar últimos 30 logs e traduzir
        const recentLogs = logs.slice(0, 30).map(log => [
            new Date(log.timestamp).toLocaleString('pt-PT'),
            log.userName || log.userId,
            actionTranslation[log.action.toLowerCase()] || log.action.toUpperCase(), // Tradução aplicada aqui
            log.details ? (log.details.length > 60 ? log.details.substring(0, 60) + '...' : log.details) : '-'
        ]);

        autoTable(doc, {
            startY: yPos,
            head: [['Data/Hora', 'Utilizador', 'Ação', 'Detalhes']],
            body: recentLogs,
            theme: 'grid',
            headStyles: { fillColor: [80, 80, 80] },
            styles: { fontSize: 7, cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: 35 },
                1: { cellWidth: 30 },
                2: { cellWidth: 25 },
                3: { cellWidth: 'auto' }
            },
            margin: { left: 20, right: 20 },
            didDrawPage: () => applyBranding(doc, config, undefined, true)
        });
    }

    // O rodapé já é tratado pelo applyBranding chamado no início e no didDrawPage

    const filename = `Relatorio_Economico_Completo_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
};




