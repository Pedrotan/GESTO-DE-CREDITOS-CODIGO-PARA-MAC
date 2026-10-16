import React, { useState, useMemo } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useData } from '@/contextos/ContextoDados';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import { Progress } from '@/componentes/ui/progress';
import {
    Activity,
    TrendingUp,
    TrendingDown,
    Minus,
    Search,
    Download,
    AlertTriangle,
    CheckCircle,
    Star,
    Users,
    Target,
    BarChart as BarChartIcon,
    PieChart,
    Filter,
    Eye,
    ArrowUpDown
} from 'lucide-react';
import {
    PieChart as RechartsPie,
    Pie,
    Cell,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
    LineChart,
    Line
} from 'recharts';
import { jsPDF } from '@/bibliotecas/pdf-documento';
import autoTable from '@/bibliotecas/pdf-tabela';
import { calculateClientScore, getRatingColor, ClientScore } from '@/bibliotecas/clientScoring';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { format } from 'date-fns';
import { formatCurrency } from '@/bibliotecas/formatters';
import { applyBranding, fitPdfText, getCompanySettings, BRAND_ORANGE, BRAND_CHARCOAL, resolveBrandPrimary } from '@/bibliotecas/pdf';
import { exportToExcel } from '@/bibliotecas/ExcelHelper';
import { cn } from '@/bibliotecas/utils';
import {
    computePortfolioRisk, paymentTrend, agingBucketFor, type ClientRisk, type PaymentTrend,
} from '@/bibliotecas/risco-carteira';
import { Layers, Siren, FileSpreadsheet, Scale } from 'lucide-react';

const RATING_COLORS = {
    'Excelente': '#22c55e',
    'Bom': '#3b82f6',
    'Regular': '#eab308',
    'Fraco': '#f97316',
    'Muito Fraco': '#ef4444'
};

const RISK_BASED_PRICING = {
    'Excelente': { rate: '2% - 5%', approval: 'Automática' },
    'Bom': { rate: '5% - 10%', approval: 'Simplificada' },
    'Regular': { rate: '10% - 18%', approval: 'Manual' },
    'Fraco': { rate: '18% - 25%', approval: 'Com Garantia' },
    'Muito Fraco': { rate: '> 25%', approval: 'Negado' }
};

interface ClientWithScore {
    id: string;
    name: string;
    nif: string;
    score: ClientScore;
    trend: PaymentTrend;
    /** Exposição actual, atraso e cobertura (ausente se o cliente não tiver créditos em aberto). */
    risk?: ClientRisk;
}

/** Escalões condensados para a matriz Rating × Atraso. */
const MATRIX_COLUMNS = [
    { key: 'em_dia', label: 'Em dia', match: (d: number) => d === 0 },
    { key: '1_30', label: '1–30 d', match: (d: number) => d >= 1 && d <= 30 },
    { key: '31_90', label: '31–90 d', match: (d: number) => d >= 31 && d <= 90 },
    { key: '90', label: '+90 d', match: (d: number) => d > 90 },
];
const RATINGS: ClientScore['rating'][] = ['Excelente', 'Bom', 'Regular', 'Fraco', 'Muito Fraco'];

export default function Scoring() {
    const { clients, credits, payments, warranties, legalCases } = useData();
    const [searchTerm, setSearchTerm] = useState('');
    const [ratingFilter, setRatingFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'score' | 'name' | 'exposure' | 'dpd'>('score');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [selectedClient, setSelectedClient] = useState<ClientWithScore | null>(null);

    // Risco da carteira (exposição, atraso, garantias, concentração)
    const portfolio = useMemo(
        () => computePortfolioRisk({ credits: credits as any[], warranties: warranties as any[], legalCases: legalCases as any[], clients: clients as any[] }),
        [credits, warranties, legalCases, clients]
    );

    // Calcular scores para todos os clientes
    const clientsWithScores = useMemo<ClientWithScore[]>(() => {
        const today = new Date();
        const creditIdsByClient = new Map<string, Set<string>>();
        credits.forEach(c => {
            if (!creditIdsByClient.has(c.clientId)) creditIdsByClient.set(c.clientId, new Set());
            creditIdsByClient.get(c.clientId)!.add(c.id);
        });
        return clients.map(client => {
            const score = calculateClientScore(client, credits, payments);
            // Tendência real: pontualidade dos últimos 90 dias vs 90 dias anteriores
            const trend = paymentTrend(creditIdsByClient.get(client.id) || new Set(), payments as any[], today);

            return {
                id: client.id,
                name: client.name,
                nif: client.nif,
                score,
                trend,
                risk: portfolio.perClient.get(client.id),
            };
        });
    }, [clients, credits, payments, portfolio]);

    // Filtrar e ordenar
    const filteredClients = useMemo(() => {
        let filtered = clientsWithScores;

        // Filtro de pesquisa
        if (searchTerm) {
            filtered = filtered.filter(c =>
                c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.nif.includes(searchTerm)
            );
        }

        // Filtro de rating
        if (ratingFilter !== 'all') {
            filtered = filtered.filter(c => c.score.rating === ratingFilter);
        }

        // Ordenação (cópia: não altera a lista memorizada)
        filtered = [...filtered].sort((a, b) => {
            if (sortBy === 'exposure') {
                const diff = (b.risk?.exposure || 0) - (a.risk?.exposure || 0);
                return sortOrder === 'desc' ? diff : -diff;
            }
            if (sortBy === 'dpd') {
                const diff = (b.risk?.maxDpd || 0) - (a.risk?.maxDpd || 0);
                return sortOrder === 'desc' ? diff : -diff;
            }
            if (sortBy === 'score') {
                return sortOrder === 'desc'
                    ? b.score.score - a.score.score
                    : a.score.score - b.score.score;
            } else {
                return sortOrder === 'desc'
                    ? b.name.localeCompare(a.name)
                    : a.name.localeCompare(b.name);
            }
        });

        return filtered;
    }, [clientsWithScores, searchTerm, ratingFilter, sortBy, sortOrder]);

    // Estatísticas gerais
    const stats = useMemo(() => {
        const totalClients = clientsWithScores.length;
        const avgScore = totalClients > 0
            ? Math.round(clientsWithScores.reduce((sum, c) => sum + c.score.score, 0) / totalClients)
            : 0;

        const distribution = {
            'Excelente': clientsWithScores.filter(c => c.score.rating === 'Excelente').length,
            'Bom': clientsWithScores.filter(c => c.score.rating === 'Bom').length,
            'Regular': clientsWithScores.filter(c => c.score.rating === 'Regular').length,
            'Fraco': clientsWithScores.filter(c => c.score.rating === 'Fraco').length,
            'Muito Fraco': clientsWithScores.filter(c => c.score.rating === 'Muito Fraco').length,
        };

        const highRisk = clientsWithScores.filter(c =>
            c.score.rating === 'Fraco' || c.score.rating === 'Muito Fraco'
        ).length;

        const lowRisk = clientsWithScores.filter(c =>
            c.score.rating === 'Excelente' || c.score.rating === 'Bom'
        ).length;

        return {
            totalClients,
            avgScore,
            distribution,
            highRisk,
            lowRisk,
            highRiskPercentage: totalClients > 0 ? Math.round((highRisk / totalClients) * 100) : 0,
            lowRiskPercentage: totalClients > 0 ? Math.round((lowRisk / totalClients) * 100) : 0
        };
    }, [clientsWithScores]);

    // Dados para gráfico de pizza
    // Dados para gráfico de pizza (filtrado para remover zeros)
    const pieData = Object.entries(stats.distribution)
        .filter(([_, value]) => value > 0)
        .map(([name, value]) => ({
            name,
            value,
            color: RATING_COLORS[name as keyof typeof RATING_COLORS]
        }));

    // Dados para gráfico de barras (top 10 clientes)
    const topClientsData = [...clientsWithScores].sort((a, b) => b.score.score - a.score.score).slice(0, 10).map(c => ({
        name: c.name.split(' ')[0], // Primeiro nome apenas
        score: c.score.score,
        fill: RATING_COLORS[c.score.rating]
    }));

    // Matriz Rating × Atraso (nº de clientes e exposição) — só clientes com dívida em aberto
    const riskMatrix = useMemo(() => RATINGS.map(rating => ({
        rating,
        cells: MATRIX_COLUMNS.map(col => {
            const list = clientsWithScores.filter(c => c.risk && c.score.rating === rating && col.match(c.risk.maxDpd));
            return { key: col.key, count: list.length, exposure: list.reduce((s, c) => s + (c.risk?.exposure || 0), 0) };
        }),
    })), [clientsWithScores]);

    // Sinais de alerta precoce por cliente (só quem tem exposição)
    const earlyWarnings = useMemo(() => {
        return clientsWithScores
            .filter(c => c.risk && c.risk.exposure > 0)
            .map(c => {
                const r = c.risk!;
                const signals: { label: string; level: 'high' | 'medium' | 'low' }[] = [];
                if (r.maxDpd > 30) signals.push({ label: `${r.maxDpd} dias em atraso`, level: 'high' });
                else if (r.maxDpd > 0) signals.push({ label: `${r.maxDpd} dias em atraso`, level: 'medium' });
                if (r.overLimit) signals.push({ label: 'Acima do plafond', level: 'high' });
                if (c.trend === 'down') signals.push({ label: 'Pontualidade a piorar', level: 'medium' });
                if (c.score.score < 400) signals.push({ label: `Score ${c.score.score}`, level: 'high' });
                if (r.coverage < 0.3 && r.maxDpd > 0) signals.push({ label: 'Garantia insuficiente', level: 'medium' });
                if (r.openCredits > 2) signals.push({ label: `${r.openCredits} créditos em simultâneo`, level: 'low' });
                if (c.score.confidence === 'baixa') signals.push({ label: 'Histórico insuficiente', level: 'low' });
                if (r.share > 0.2 && portfolio.perClient.size > 1) signals.push({ label: `${(r.share * 100).toFixed(0)}% da carteira`, level: 'medium' });
                const weight = signals.reduce((s, x) => s + (x.level === 'high' ? 3 : x.level === 'medium' ? 2 : 1), 0);
                return { client: c, signals, weight };
            })
            .filter(x => x.signals.some(s => s.level !== 'low'))
            .sort((a, b) => b.weight - a.weight || (b.client.risk?.exposure || 0) - (a.client.risk?.exposure || 0));
    }, [clientsWithScores, portfolio]);

    const agingChartData = portfolio.aging.map(a => ({ name: a.label, exposure: a.exposure, count: a.count, fill: a.color }));

    const handleExportExcel = () => {
        exportToExcel(filteredClients.map((c, i) => ({
            '#': i + 1,
            'Cliente': c.name,
            'NIF': c.nif,
            'Score': c.score.score,
            'Rating': c.score.rating,
            'Confiança': c.score.confidence,
            'Penalização atraso': c.score.breakdown.delinquencyPenalty,
            'Exposição (Kz)': Math.round((c.risk?.exposure || 0) * 100) / 100,
            'Dias em atraso': c.risk?.maxDpd || 0,
            'Cobertura garantias': c.risk ? `${(c.risk.coverage * 100).toFixed(0)}%` : '',
            'Peso na carteira': c.risk ? `${(c.risk.share * 100).toFixed(1)}%` : '',
            'Pagamentos em dia': c.score.metrics.paymentsOnTime,
            'Pagamentos atrasados': c.score.metrics.latePayments,
            'Tendência': c.trend === 'up' ? 'A melhorar' : c.trend === 'down' ? 'A piorar' : c.trend === 'stable' ? 'Estável' : 'Sem histórico',
        })), `ranking_risco_${format(new Date(), 'yyyy-MM-dd')}`);
    };

    const selectedClientAnalysis = useMemo(() => {
        if (!selectedClient) return null;

        const client = clients.find(c => c.id === selectedClient.id);
        const monthlyIncome = Number(client?.monthlyIncome || 0);
        const baseLimit = monthlyIncome > 0 ? monthlyIncome * 0.35 * 6 : Number(client?.creditLimit || 0);
        const scoreMultiplier =
            selectedClient.score.rating === 'Excelente' ? 1.4 :
                selectedClient.score.rating === 'Bom' ? 1.15 :
                    selectedClient.score.rating === 'Regular' ? 0.8 :
                        selectedClient.score.rating === 'Fraco' ? 0.45 : 0.2;

        const suggestedLimit = Math.max(0, Math.round(baseLimit * scoreMultiplier));
        const activeExposure = selectedClient.score.metrics.activeCreditsCount;
        const punctuality = selectedClient.score.metrics.totalPayments > 0
            ? selectedClient.score.metrics.paymentsOnTime / selectedClient.score.metrics.totalPayments
            : 1;

        const hardRules = [
            { name: 'Cliente ativo', passed: client?.status === 'active' },
            { name: 'Sem atraso em curso', passed: (selectedClient.score.metrics.maxDaysOverdue || 0) === 0 },
            { name: 'Exposição dentro do plafond', passed: !selectedClient.risk?.overLimit },
            { name: 'Sem atraso recorrente', passed: selectedClient.score.metrics.latePayments <= 1 || punctuality >= 0.8 },
            { name: 'Exposição simultânea aceitável', passed: activeExposure <= 2 },
            { name: 'Score mínimo operacional', passed: selectedClient.score.score >= 400 }
        ];

        return {
            suggestedLimit,
            pricing: RISK_BASED_PRICING[selectedClient.score.rating],
            hardRules
        };
    }, [clients, selectedClient]);

    const renderStars = (stars: number) => {
        return (
            <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                        key={i}
                        className={`w-4 h-4 ${i < stars ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                    />
                ))}
            </div>
        );
    };

    const getTrendIcon = (trend: PaymentTrend) => {
        switch (trend) {
            case 'up':
                return <TrendingUp className="w-4 h-4 text-green-600" />;
            case 'down':
                return <TrendingDown className="w-4 h-4 text-red-600" />;
            case 'stable':
                return <Minus className="w-4 h-4 text-gray-600" />;
            default:
                return <Minus className="w-4 h-4 text-gray-300" />;
        }
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        const config = getCompanySettings();
        const primary = resolveBrandPrimary(config.primaryColor);
        const dark = BRAND_CHARCOAL;
        applyBranding(doc, config, undefined, false);

        // Cabeçalho Executivo com Acento Laranja
        const titleY = 48;
        doc.setFillColor(primary[0], primary[1], primary[2]);
        doc.roundedRect(16, titleY, 3.5, 11, 0.8, 0.8, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text('Relatório Geral de Scoring e Risco', 22, titleY + 5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`Total de Clientes Avaliados: ${stats.totalClients}   |   Data: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 22, titleY + 9.5);

        // Estatísticas
        let currentY = titleY + 18;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text('Resumo da Carteira', 16, currentY);

        const summaryData = [
            ['Métrica', 'Valor', 'Percentagem'],
            ['Score Médio', stats.avgScore.toString(), '-'],
            ['Baixo Risco', stats.lowRisk.toString(), `${stats.lowRiskPercentage}%`],
            ['Alto Risco', stats.highRisk.toString(), `${stats.highRiskPercentage}%`]
        ];

        autoTable(doc, {
            startY: currentY + 3.5,
            head: [summaryData[0]],
            body: summaryData.slice(1),
            theme: 'striped',
            headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [250, 250, 252] },
            styles: { fontSize: 8.5, cellPadding: 2.5, textColor: dark },
            margin: { left: 16, right: 14 },
            didDrawPage: () => applyBranding(doc, config, undefined, true)
        });

        // Tabela de Distribuição
        const distStartY = ((doc as any).lastAutoTable?.finalY || 100) + 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text('Distribuição por Rating', 16, distStartY);

        const distData = Object.entries(stats.distribution).map(([rating, count]) => [
            rating,
            count.toString(),
            `${Math.round((count / stats.totalClients) * 100)}%`
        ]);

        autoTable(doc, {
            startY: distStartY + 3.5,
            head: [['Rating', 'Quantidade', 'Percentagem']],
            body: distData,
            theme: 'striped',
            headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [250, 250, 252] },
            styles: { fontSize: 8.5, cellPadding: 2.5, textColor: dark },
            margin: { left: 16, right: 14 },
            didDrawPage: () => applyBranding(doc, config, undefined, true)
        });

        // Top 10 Clientes
        const topStartY = ((doc as any).lastAutoTable?.finalY || 160) + 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text('Top 10 Clientes (Melhores Scores)', 16, topStartY);

        const topData = filteredClients.slice(0, 10).map((c, i) => [
            (i + 1).toString(),
            c.name,
            c.nif,
            c.score.score.toString(),
            c.score.rating
        ]);

        autoTable(doc, {
            startY: topStartY + 3.5,
            head: [['#', 'Cliente', 'NIF', 'Score', 'Rating']],
            body: topData,
            theme: 'striped',
            headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [250, 250, 252] },
            styles: { fontSize: 8.5, cellPadding: 2.5, textColor: dark },
            margin: { left: 16, right: 14, bottom: 25 },
            didDrawPage: () => applyBranding(doc, config, undefined, true)
        });

        doc.save(`relatorio_scoring_geral_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    };

    const handleExportDetailedPDF = () => {
        if (!selectedClient) return;

        const doc = new jsPDF();
        const config = getCompanySettings();
        const primary = resolveBrandPrimary(config.primaryColor);
        const dark = BRAND_CHARCOAL;
        applyBranding(doc, config, undefined, false);
        const client = selectedClient;

        // Cabeçalho Executivo com Acento Laranja
        const titleY = 48;
        doc.setFillColor(primary[0], primary[1], primary[2]);
        doc.roundedRect(16, titleY, 3.5, 11, 0.8, 0.8, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text(fitPdfText(doc, `Relatório de Análise de Risco - ${client.name}`, doc.internal.pageSize.getWidth() - 22 - 16, 13, 9), 22, titleY + 5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`NIF: ${client.nif}   |   Emitido em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 22, titleY + 9.5);

        // Score Principal
        let curY = titleY + 18;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text('Avaliação Geral', 16, curY);

        doc.setFontSize(10);
        doc.setTextColor(RATING_COLORS[client.score.rating]);
        doc.text(`Score: ${client.score.score} / 1000 (${client.score.rating})`, 16, curY + 6);

        // Breakdown
        curY += 14;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text('Detalhamento do Score', 16, curY);

        const breakdownData = [
            ['Fator', 'Pontuação', 'Máximo'],
            ['Histórico de Pagamentos', client.score.breakdown.paymentHistory, '600'],
            ['Créditos Ativos', client.score.breakdown.activeCredits, '200'],
            ['Valor Emprestado', client.score.breakdown.borrowedAmount, '100'],
            ['Antiguidade', client.score.breakdown.tenure, '100'],
            ['Penalização por atraso actual', client.score.breakdown.delinquencyPenalty, '0']
        ];

        autoTable(doc, {
            startY: curY + 3.5,
            head: [breakdownData[0]],
            body: breakdownData.slice(1),
            theme: 'striped',
            headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [250, 250, 252] },
            styles: { fontSize: 8.5, cellPadding: 2.5, textColor: dark },
            margin: { left: 16, right: 14 },
            didDrawPage: () => applyBranding(doc, config, undefined, true)
        });

        // Métricas
        const metricsStartY = ((doc as any).lastAutoTable?.finalY || 135) + 8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text('Métricas Financeiras', 16, metricsStartY);

        const metricsData = [
            ['Métrica', 'Valor'],
            ['Total de Créditos', client.score.metrics.totalCredits],
            ['Pagamentos em Dia', client.score.metrics.paymentsOnTime],
            ['Pagamentos Atrasados', client.score.metrics.latePayments],
            ['Total Emprestado', formatCurrency(client.score.metrics.totalBorrowed)],
            ['Exposição Actual', formatCurrency(client.risk?.exposure || 0)],
            ['Atraso Actual (dias)', client.score.metrics.maxDaysOverdue || 0],
            ['Cobertura por Garantias', `${Math.round((client.risk?.coverage || 0) * 100)}%`],
            ['Taxa de Pontualidade', `${Math.round((client.score.metrics.paymentsOnTime / client.score.metrics.totalPayments) * 100 || 0)}%`]
        ];

        autoTable(doc, {
            startY: metricsStartY + 3.5,
            head: [metricsData[0]],
            body: metricsData.slice(1),
            theme: 'striped',
            headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [250, 250, 252] },
            styles: { fontSize: 8.5, cellPadding: 2.5, textColor: dark },
            margin: { left: 16, right: 14 },
            didDrawPage: () => applyBranding(doc, config, undefined, true)
        });

        // Recomendação
        const recStartY = ((doc as any).lastAutoTable?.finalY || 190) + 8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text('Recomendações do Sistema', 16, recStartY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);

        if (selectedClientAnalysis) {
            doc.text(`- Limite de Crédito Sugerido: ${formatCurrency(selectedClientAnalysis.suggestedLimit)}`, 16, recStartY + 6);
            doc.text(`- Taxa de Juros Recomendada: ${selectedClientAnalysis.pricing.rate}`, 16, recStartY + 11);
            doc.text(`- Aprovação: ${selectedClientAnalysis.pricing.approval}`, 16, recStartY + 16);
        }

        doc.save(`analise_risco_${client.nif}.pdf`);
    };

    return (
        <MainLayout title="Análise de Risco (Scoring)" subtitle="Inteligência de crédito e pontuação preditiva">
            <div className="p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800">Análise de Risco (Scoring)</h1>
                        <p className="text-slate-600 mt-1">Inteligência de crédito e pontuação preditiva</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" className="gap-2" onClick={handleExportExcel}>
                            <FileSpreadsheet className="w-4 h-4" />
                            Excel
                        </Button>
                        <Button variant="outline" className="gap-2" onClick={handleExportPDF}>
                            <Download className="w-4 h-4" />
                            Exportar Relatório
                        </Button>
                    </div>
                </div>

                {/* Estatísticas Principais Estilo Pastel Arredondado */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* 1. Total de Clientes (Azul Céu #82C9FF) */}
                    <div className="card-kpi-sky">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <Users className="h-5 w-5" />
                                </div>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                    Total de Clientes
                                </p>
                            </div>
                        </div>

                        <div className="my-2">
                            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                {stats.totalClients}
                            </p>
                        </div>

                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                            {portfolio.perClient.size} com dívida em aberto · {formatCurrency(portfolio.totalExposure)}
                        </p>
                    </div>

                    {/* 2. Score Médio (Púrpura / Lavanda #E99EFE) */}
                    <div className="card-kpi-purple">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <Target className="h-5 w-5" />
                                </div>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                    Score Médio
                                </p>
                            </div>
                        </div>

                        <div className="my-2">
                            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                {stats.avgScore} <span className="text-base font-medium opacity-70">/ 1000</span>
                            </p>
                        </div>

                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                            Pontuação média da carteira
                        </p>
                    </div>

                    {/* 3. Baixo Risco (Verde Menta #86EFAC) */}
                    <div className="card-kpi-mint">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <CheckCircle className="h-5 w-5" />
                                </div>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                    Baixo Risco
                                </p>
                            </div>
                        </div>

                        <div className="my-2">
                            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                {stats.lowRiskPercentage}%
                            </p>
                        </div>

                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                            {stats.lowRisk} clientes com rating favorável
                        </p>
                    </div>

                    {/* 4. Alto Risco (Coral / Rosa #FDA4AF) */}
                    <div className="card-kpi-coral">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <AlertTriangle className="h-5 w-5" />
                                </div>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                    Alto Risco
                                </p>
                            </div>
                        </div>

                        <div className="my-2">
                            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                {stats.highRiskPercentage}%
                            </p>
                        </div>

                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                            {stats.highRisk} clientes requerem atenção
                        </p>
                    </div>
                </div>

                {/* Tabs */}
                <Tabs defaultValue="overview" className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="overview" className="gap-2">
                            <PieChart className="w-4 h-4" />
                            Visão Geral
                        </TabsTrigger>
                        <TabsTrigger value="ranking" className="gap-2">
                            <BarChartIcon className="w-4 h-4" />
                            Ranking
                        </TabsTrigger>
                        <TabsTrigger value="portfolio" className="gap-2">
                            <Layers className="w-4 h-4" />
                            Carteira & Concentração
                        </TabsTrigger>
                        <TabsTrigger value="warnings" className="gap-2">
                            <Siren className="w-4 h-4" />
                            Alertas Precoces
                            {earlyWarnings.length > 0 && <span className="ml-1 rounded-full bg-rose-600 text-white text-[10px] font-bold px-1.5">{earlyWarnings.length}</span>}
                        </TabsTrigger>
                    </TabsList>

                    {/* Carteira & Concentração */}
                    <TabsContent value="portfolio" className="space-y-4">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {[
                                { label: 'PAR 30', value: `${(portfolio.par30 * 100).toFixed(1)}%`, hint: formatCurrency(portfolio.par30Amount), bad: portfolio.par30 >= 0.1 },
                                { label: 'NPL (+90 dias)', value: `${(portfolio.par90 * 100).toFixed(1)}%`, hint: formatCurrency(portfolio.nplAmount), bad: portfolio.par90 >= 0.07 },
                                { label: 'Provisões estimadas', value: formatCurrency(portfolio.provisionNet), hint: `após garantias · bruto ${formatCurrency(portfolio.provisionGross)}`, bad: false },
                                { label: 'Concentração', value: `${(portfolio.concentration.top5Share * 100).toFixed(1)}%`, hint: `top 5 · HHI ${(portfolio.concentration.hhi * 10000).toFixed(0)}`, bad: portfolio.concentration.top1Share > 0.2 && portfolio.perClient.size > 1 },
                            ].map(k => (
                                <Card key={k.label} className={cn(k.bad && 'border-rose-300 dark:border-rose-500/40')}>
                                    <CardContent className="p-4">
                                        <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{k.label}</p>
                                        <p className={cn('text-2xl font-black', k.bad && 'text-rose-600')}>{k.value}</p>
                                        <p className="text-xs text-muted-foreground truncate">{k.hint}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Envelhecimento da Dívida</CardTitle>
                                    <CardDescription>Exposição por escalão de atraso</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ResponsiveContainer width="100%" height={280}>
                                        <BarChart data={agingChartData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                                            <XAxis dataKey="name" fontSize={11} />
                                            <YAxis fontSize={11} tickFormatter={(v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v)} />
                                            <Tooltip formatter={(v: number, _n: string, item: any) => [`${formatCurrency(v)} · ${item?.payload?.count || 0} crédito(s)`, 'Exposição']} />
                                            <Bar dataKey="exposure" radius={[6, 6, 0, 0]}>
                                                {agingChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Matriz Rating × Atraso</CardTitle>
                                    <CardDescription>Clientes com dívida em aberto — os cantos inferiores direitos são o risco mais grave</CardDescription>
                                </CardHeader>
                                <CardContent className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr>
                                                <th className="text-left p-1.5 text-muted-foreground font-semibold">Rating</th>
                                                {MATRIX_COLUMNS.map(col => <th key={col.key} className="p-1.5 text-muted-foreground font-semibold">{col.label}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {riskMatrix.map((row, ri) => (
                                                <tr key={row.rating}>
                                                    <td className="p-1.5 font-semibold" style={{ color: RATING_COLORS[row.rating] }}>{row.rating}</td>
                                                    {row.cells.map((cell, ci) => {
                                                        const severity = ri + ci * 1.5; // pior rating e maior atraso = mais grave
                                                        const bg = cell.count === 0 ? 'bg-muted/30 text-muted-foreground' : severity >= 6 ? 'bg-rose-500 text-white' : severity >= 4 ? 'bg-orange-300 text-orange-950' : severity >= 2.5 ? 'bg-amber-200 text-amber-950' : 'bg-emerald-200 text-emerald-950';
                                                        return (
                                                            <td key={cell.key} className="p-1">
                                                                <div className={cn('rounded-md p-2 text-center', bg)} title={formatCurrency(cell.exposure)}>
                                                                    <p className="font-black text-sm">{cell.count}</p>
                                                                    {cell.count > 0 && <p className="text-[10px] opacity-90 truncate">{formatCurrency(cell.exposure)}</p>}
                                                                </div>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle>Maiores Exposições</CardTitle>
                                <CardDescription>10 maiores devedores — peso na carteira, atraso e cobertura por garantias</CardDescription>
                            </CardHeader>
                            <CardContent className="overflow-x-auto">
                                {portfolio.concentration.top.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-6">Sem créditos em aberto.</p>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-xs text-muted-foreground border-b">
                                                <th className="text-left p-2">Cliente</th>
                                                <th className="text-right p-2">Exposição</th>
                                                <th className="text-left p-2 w-[160px]">Peso</th>
                                                <th className="text-right p-2">Atraso</th>
                                                <th className="text-right p-2">Cobertura</th>
                                                <th className="text-left p-2">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {portfolio.concentration.top.map(r => {
                                                const scored = clientsWithScores.find(c => c.id === r.clientId);
                                                return (
                                                    <tr key={r.clientId} className="border-b last:border-0 hover:bg-muted/40 cursor-pointer" onClick={() => scored && setSelectedClient(scored)}>
                                                        <td className="p-2 font-medium">{r.name}</td>
                                                        <td className="p-2 text-right font-mono">{formatCurrency(r.exposure)}</td>
                                                        <td className="p-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${r.share * 100}%` }} /></div>
                                                                <span className="text-xs tabular-nums w-10 text-right">{(r.share * 100).toFixed(1)}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-2 text-right" style={{ color: agingBucketFor(r.maxDpd).color }}>{r.maxDpd > 0 ? `${r.maxDpd} d` : 'em dia'}</td>
                                                        <td className="p-2 text-right">{(r.coverage * 100).toFixed(0)}%</td>
                                                        <td className="p-2 text-xs">
                                                            {r.hasLegalCase && <Badge variant="destructive" className="text-[9px] mr-1">Contencioso</Badge>}
                                                            {r.overLimit && <Badge variant="warning" className="text-[9px] mr-1">Acima do plafond</Badge>}
                                                            {scored && <Badge className={cn('text-[9px]', getRatingColor(scored.score.rating))}>{scored.score.rating}</Badge>}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Alertas Precoces */}
                    <TabsContent value="warnings" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Siren className="w-5 h-5 text-rose-600" /> Sistema de Alerta Precoce</CardTitle>
                                <CardDescription>Clientes com sinais de deterioração antes de entrarem em incumprimento — actue primeiro nos de maior peso.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {earlyWarnings.length === 0 ? (
                                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/20 p-4 text-sm text-emerald-800 dark:text-emerald-200">
                                        <CheckCircle className="w-4 h-4" /> Nenhum cliente com sinais de alerta relevantes.
                                    </div>
                                ) : earlyWarnings.map(({ client, signals }) => (
                                    <div key={client.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/40">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold">{client.name}</span>
                                                <Badge className={getRatingColor(client.score.rating)}>{client.score.score} · {client.score.rating}</Badge>
                                                {client.risk?.hasLegalCase && <Badge variant="destructive" className="text-[9px] gap-1"><Scale className="w-3 h-3" />Contencioso</Badge>}
                                            </div>
                                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                {signals.map(s => (
                                                    <span key={s.label} className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                                        s.level === 'high' ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200' :
                                                            s.level === 'medium' ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200' :
                                                                'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>{s.label}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="text-right">
                                                <p className="font-bold font-mono text-sm">{formatCurrency(client.risk?.exposure || 0)}</p>
                                                <p className="text-[10px] text-muted-foreground">exposição</p>
                                            </div>
                                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSelectedClient(client)}><Eye className="w-4 h-4" /> Analisar</Button>
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </TabsContent>
                    {/* Visão Geral */}
                    <TabsContent value="overview" className="space-y-4">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Distribuição por Rating */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Distribuição por Rating</CardTitle>
                                    <CardDescription>Classificação da carteira de clientes</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <RechartsPie>
                                            <Pie
                                                data={pieData}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                                outerRadius={80}
                                                fill="#8884d8"
                                                dataKey="value"
                                            >
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </RechartsPie>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            {/* Top 10 Clientes */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Top 10 Clientes por Score</CardTitle>
                                    <CardDescription>Melhores pontuações da carteira</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={topClientsData}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" />
                                            <YAxis domain={[0, 1000]} />
                                            <Tooltip />
                                            <Bar dataKey="score" radius={[8, 8, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* Ranking */}
                    <TabsContent value="ranking" className="space-y-4">
                        {/* Filtros */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Filtros e Pesquisa</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="md:col-span-2">
                                        <Label>Pesquisar Cliente</Label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <Input
                                                placeholder="Nome ou NIF..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="pl-10"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <Label>Filtrar por Rating</Label>
                                        <Select value={ratingFilter} onValueChange={setRatingFilter}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Todos</SelectItem>
                                                <SelectItem value="Excelente">Excelente</SelectItem>
                                                <SelectItem value="Bom">Bom</SelectItem>
                                                <SelectItem value="Regular">Regular</SelectItem>
                                                <SelectItem value="Fraco">Fraco</SelectItem>
                                                <SelectItem value="Muito Fraco">Muito Fraco</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div>
                                        <Label>Ordenar por</Label>
                                        <div className="flex gap-2">
                                            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="score">Score</SelectItem>
                                                    <SelectItem value="name">Nome</SelectItem>
                                                    <SelectItem value="exposure">Exposição</SelectItem>
                                                    <SelectItem value="dpd">Dias em atraso</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                                            >
                                                <ArrowUpDown className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Tabela de Ranking */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Ranking de Clientes ({filteredClients.length})</CardTitle>
                                <CardDescription>Clique em um cliente para ver análise detalhada</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {filteredClients.length === 0 ? (
                                        <div className="text-center py-8 text-slate-500">
                                            Nenhum cliente encontrado
                                        </div>
                                    ) : (
                                        filteredClients.map((client, index) => (
                                            <div
                                                key={client.id}
                                                className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                                                onClick={() => setSelectedClient(client)}
                                            >
                                                <div className="flex items-center gap-4 flex-1">
                                                    <div className="text-2xl font-bold text-slate-400 w-8">
                                                        #{index + 1}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-semibold text-slate-800 dark:text-slate-100">{client.name}</div>
                                                        <div className="text-sm text-slate-500">
                                                            {client.nif}
                                                            {client.risk && (
                                                                <span className="ml-2 text-xs">
                                                                    · {formatCurrency(client.risk.exposure)}
                                                                    {client.risk.maxDpd > 0
                                                                        ? <span className={cn('ml-1 font-bold', client.risk.maxDpd > 30 ? 'text-rose-600' : 'text-amber-600')}>· {client.risk.maxDpd}d atraso</span>
                                                                        : <span className="ml-1 text-emerald-600">· em dia</span>}
                                                                </span>
                                                            )}
                                                            {client.score.confidence === 'baixa' && <span className="ml-2 text-[10px] rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">histórico insuficiente</span>}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6">
                                                    <div className="text-right">
                                                        <div className="text-2xl font-bold" style={{ color: RATING_COLORS[client.score.rating] }}>
                                                            {client.score.score}
                                                        </div>
                                                        <div className="text-xs text-slate-500">pontos</div>
                                                    </div>

                                                    <div className="flex flex-col items-center gap-1">
                                                        {renderStars(client.score.stars)}
                                                        <Badge className={getRatingColor(client.score.rating)}>
                                                            {client.score.rating}
                                                        </Badge>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        {getTrendIcon(client.trend)}
                                                        <Button variant="ghost" size="sm">
                                                            <Eye className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {/* Modal de Detalhes */}
                {selectedClient && (
                    <Dialog open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <div className="flex items-center justify-between">
                                    <DialogTitle className="flex items-center gap-3">
                                        <span>{selectedClient.name}</span>
                                        <Badge className={getRatingColor(selectedClient.score.rating)}>
                                            {selectedClient.score.rating}
                                        </Badge>
                                    </DialogTitle>
                                    <Button size="sm" variant="outline" className="gap-2 mr-6" onClick={handleExportDetailedPDF}>
                                        <Download className="h-4 w-4" />
                                        PDF Detalhado
                                    </Button>
                                </div>
                                <DialogDescription>
                                    Análise detalhada de risco e pontuação
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-6">
                                {/* Score Principal */}
                                <div className="text-center p-6 bg-slate-50 rounded-lg">
                                    <div className="text-6xl font-bold mb-2" style={{ color: RATING_COLORS[selectedClient.score.rating] }}>
                                        {selectedClient.score.score}
                                    </div>
                                    <div className="text-slate-600 mb-3">Score de Crédito</div>
                                    {renderStars(selectedClient.score.stars)}
                                </div>

                                {/* Situação actual (atraso, exposição, garantias) */}
                                <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-3 rounded-lg border p-4',
                                    (selectedClient.score.metrics.maxDaysOverdue || 0) > 30 ? 'border-rose-300 bg-rose-50/60 dark:bg-rose-500/10' : 'bg-slate-50/60 dark:bg-white/5')}>
                                    <div>
                                        <div className="text-xs text-slate-500">Exposição actual</div>
                                        <div className="font-bold">{formatCurrency(selectedClient.risk?.exposure || 0)}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-500">Atraso actual</div>
                                        <div className={cn('font-bold', (selectedClient.score.metrics.maxDaysOverdue || 0) > 0 && 'text-rose-600')}>
                                            {(selectedClient.score.metrics.maxDaysOverdue || 0) > 0 ? `${selectedClient.score.metrics.maxDaysOverdue} dias` : 'Em dia'}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-500">Cobertura por garantias</div>
                                        <div className="font-bold">{Math.round((selectedClient.risk?.coverage || 0) * 100)}%</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-500">Penalização no score</div>
                                        <div className={cn('font-bold', selectedClient.score.breakdown.delinquencyPenalty < 0 && 'text-rose-600')}>
                                            {selectedClient.score.breakdown.delinquencyPenalty} pts
                                        </div>
                                    </div>
                                    <div className="col-span-2 md:col-span-4 text-[11px] text-slate-500">
                                        Fiabilidade do score: <b>{selectedClient.score.confidence}</b>
                                        {selectedClient.score.confidence !== 'alta' && ' — poucos pagamentos registados; trate a pontuação como indicativa.'}
                                        {selectedClient.risk?.hasLegalCase && <span className="ml-2 text-rose-600 font-semibold">· Tem processo de contencioso aberto</span>}
                                    </div>
                                </div>

                                {/* Breakdown dos Fatores */}
                                <div className="grid grid-cols-2 gap-4">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-sm">Histórico de Pagamentos</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="text-2xl font-bold">{selectedClient.score.breakdown.paymentHistory}</div>
                                            <Progress value={(selectedClient.score.breakdown.paymentHistory / 600) * 100} className="mt-2" />
                                            <p className="text-xs text-slate-500 mt-2">Máximo: 600 pontos</p>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-sm">Créditos Ativos</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="text-2xl font-bold">{selectedClient.score.breakdown.activeCredits}</div>
                                            <Progress value={(selectedClient.score.breakdown.activeCredits / 200) * 100} className="mt-2" />
                                            <p className="text-xs text-slate-500 mt-2">Máximo: 200 pontos</p>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-sm">Valor Emprestado</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="text-2xl font-bold">{selectedClient.score.breakdown.borrowedAmount}</div>
                                            <Progress value={selectedClient.score.breakdown.borrowedAmount} className="mt-2" />
                                            <p className="text-xs text-slate-500 mt-2">Máximo: 100 pontos</p>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-sm">Antiguidade</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="text-2xl font-bold">{selectedClient.score.breakdown.tenure}</div>
                                            <Progress value={selectedClient.score.breakdown.tenure} className="mt-2" />
                                            <p className="text-xs text-slate-500 mt-2">Máximo: 100 pontos</p>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Métricas Detalhadas */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Métricas Detalhadas</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div>
                                                <div className="text-sm text-slate-600">Total de Créditos</div>
                                                <div className="text-xl font-bold">{selectedClient.score.metrics.totalCredits}</div>
                                            </div>
                                            <div>
                                                <div className="text-sm text-slate-600">Pagamentos em Dia</div>
                                                <div className="text-xl font-bold text-green-600">{selectedClient.score.metrics.paymentsOnTime}</div>
                                            </div>
                                            <div>
                                                <div className="text-sm text-slate-600">Pagamentos Atrasados</div>
                                                <div className="text-xl font-bold text-red-600">{selectedClient.score.metrics.latePayments}</div>
                                            </div>
                                            <div>
                                                <div className="text-sm text-slate-600">Créditos Ativos</div>
                                                <div className="text-xl font-bold">{selectedClient.score.metrics.activeCreditsCount}</div>
                                            </div>
                                            <div>
                                                <div className="text-sm text-slate-600">Total Emprestado</div>
                                                <div className="text-xl font-bold">{formatCurrency(selectedClient.score.metrics.totalBorrowed)}</div>
                                            </div>
                                            <div>
                                                <div className="text-sm text-slate-600">Meses como Cliente</div>
                                                <div className="text-xl font-bold">{selectedClient.score.metrics.monthsAsClient}</div>
                                            </div>
                                            <div>
                                                <div className="text-sm text-slate-600">Taxa de Pontualidade</div>
                                                <div className="text-xl font-bold">
                                                    {selectedClient.score.metrics.totalPayments > 0
                                                        ? Math.round((selectedClient.score.metrics.paymentsOnTime / selectedClient.score.metrics.totalPayments) * 100)
                                                        : 0}%
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-sm text-slate-600">Tendência</div>
                                                <div className="text-xl font-bold flex items-center gap-2">
                                                    {getTrendIcon(selectedClient.trend)}
                                                    {selectedClient.trend === 'up' ? 'A melhorar' : selectedClient.trend === 'down' ? 'A piorar' : selectedClient.trend === 'stable' ? 'Estável' : 'Sem histórico'}
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Análise Avançada (Novo) */}
                                {selectedClientAnalysis && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Card className="md:col-span-2 bg-slate-50 border-slate-200">
                                            <CardHeader>
                                                <CardTitle className="text-lg flex items-center gap-2">
                                                    <Target className="w-5 h-5 text-slate-700" />
                                                    Decisão de Crédito & Precificação
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                    <div>
                                                        <div className="text-sm font-medium text-slate-500 mb-1">Limite Sugerido</div>
                                                        <div className="text-2xl font-bold text-slate-800">
                                                            {formatCurrency(selectedClientAnalysis.suggestedLimit)}
                                                        </div>
                                                        <p className="text-xs text-slate-500 mt-1">
                                                            Baseado na capacidade de pagamento (Exposure at Default)
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-medium text-slate-500 mb-1">Taxa de Juros Recomendada</div>
                                                        <div className="text-2xl font-bold text-blue-600">
                                                            {selectedClientAnalysis.pricing.rate}
                                                        </div>
                                                        <p className="text-xs text-slate-500 mt-1">
                                                            Risk-based Pricing ({selectedClientAnalysis.pricing.approval})
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-medium text-slate-500 mb-1">Status Hard Rules</div>
                                                        <div className="flex flex-col gap-1 mt-1">
                                                            {selectedClientAnalysis.hardRules.map((rule, idx) => (
                                                                <div key={idx} className="flex items-center gap-2 text-sm">
                                                                    {rule.passed ? (
                                                                        <CheckCircle className="w-3 h-3 text-green-500" />
                                                                    ) : (
                                                                        <AlertTriangle className="w-3 h-3 text-red-500" />
                                                                    )}
                                                                    <span className={rule.passed ? 'text-slate-600' : 'text-red-600 font-medium'}>
                                                                        {rule.name}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                )}

                            </div>
                        </DialogContent>
                    </Dialog>
                )}
            </div>
        </MainLayout>
    );
}
