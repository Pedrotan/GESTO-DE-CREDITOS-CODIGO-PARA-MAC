import { useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { formatDate } from '@/bibliotecas/formatters';
import { Button } from '@/componentes/ui/button';
import { Card } from '@/componentes/ui/card';
import { Label } from '@/componentes/ui/label';
import { Input } from '@/componentes/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/componentes/ui/select';
import { FileText, Download, FileCheck, Receipt, ShieldAlert, Calendar, TrendingUp, Printer } from 'lucide-react';
import { generateSAFT, downloadSAFT } from '@/bibliotecas/saftGenerator';
import { generateEInvoice, downloadEInvoice } from '@/bibliotecas/eInvoiceGenerator';
import { generateEconomicReport } from '@/bibliotecas/economicReportGenerator';
import { generateInvoicePDF, generateSaftReportPDF } from '@/bibliotecas/fiscalPdfGenerator';
import { AlertModal } from '@/componentes/ui/AlertModal';
import { Badge } from '@/componentes/ui/badge';

export default function FiscalReports() {
    const { user } = useAuth();
    const { clients, credits, payments, logs, companySettings } = useData();

    const [saftYear, setSaftYear] = useState(new Date().getFullYear());
    const [saftPeriod, setSaftPeriod] = useState<'annual' | 'monthly' | 'quarterly'>('annual');
    const [saftMonth, setSaftMonth] = useState(new Date().getMonth() + 1);
    const [saftQuarter, setSaftQuarter] = useState(1);

    const [selectedCreditId, setSelectedCreditId] = useState<string>('');

    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        type: 'success' | 'error' | 'warning';
    }>({
        isOpen: false,
        title: '',
        description: '',
        type: 'success'
    });

    // Verificação de permissão
    if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
        return (
            <MainLayout title="Acesso Negado" subtitle="Sem permissão">
                <div className="flex flex-col items-center justify-center h-[50vh] gap-4 text-destructive">
                    <ShieldAlert className="h-16 w-16" />
                    <h2 className="text-2xl font-bold">Acesso Restrito</h2>
                    <p className="text-muted-foreground">
                        Apenas Super Administradores e Administradores podem acessar esta página.
                    </p>
                </div>
            </MainLayout>
        );
    }

    const handleGenerateSAFT = () => {
        try {
            let startDate: Date;
            let endDate: Date;

            if (saftPeriod === 'annual') {
                startDate = new Date(saftYear, 0, 1);
                endDate = new Date(saftYear, 11, 31);
            } else if (saftPeriod === 'monthly') {
                startDate = new Date(saftYear, saftMonth - 1, 1);
                endDate = new Date(saftYear, saftMonth, 0);
            } else {
                // Quarterly
                const startMonth = (saftQuarter - 1) * 3;
                startDate = new Date(saftYear, startMonth, 1);
                endDate = new Date(saftYear, startMonth + 3, 0);
            }

            const xml = generateSAFT(companySettings, clients, credits, payments, {
                fiscalYear: saftYear,
                startDate,
                endDate
            });

            const filename = `SAFT_AO_${saftYear}_${saftPeriod === 'annual' ? 'ANUAL' : saftPeriod === 'monthly' ? `MES_${saftMonth}` : `T${saftQuarter}`}.xml`;
            downloadSAFT(xml, filename);

            setAlertConfig({
                isOpen: true,
                title: 'SAF-T Gerado com Sucesso',
                description: `O ficheiro ${filename} foi baixado. Valide o ficheiro antes de submeter à AGT.`,
                type: 'success'
            });
        } catch (error) {
            console.error('Erro ao gerar SAF-T:', error);
            setAlertConfig({
                isOpen: true,
                title: 'Erro ao Gerar SAF-T',
                description: `Ocorreu um erro ao gerar o ficheiro SAF-T. ${error instanceof Error ? error.message : 'Verifique os dados e tente novamente.'}`,
                type: 'error'
            });
        }
    };

    const handleGenerateEInvoice = () => {
        if (!selectedCreditId) {
            setAlertConfig({
                isOpen: true,
                title: 'Selecione um Crédito',
                description: 'Por favor, selecione um crédito para gerar a factura electrónica.',
                type: 'warning'
            });
            return;
        }

        try {
            const credit = credits.find(c => c.id === selectedCreditId);
            const client = clients.find(c => c.id === credit?.clientId);

            if (!credit || !client) {
                throw new Error('Crédito ou cliente não encontrado');
            }

            const invoiceNo = `FT ${new Date().getFullYear()}/${String(credits.indexOf(credit) + 1).padStart(6, '0')}`;

            const xml = generateEInvoice({
                invoiceNo,
                credit,
                client,
                companySettings,
                userName: user.name
            });

            const filename = `Factura_${invoiceNo.replace(/\s/g, '_')}_${client.name.replace(/\s/g, '_')}.xml`;
            downloadEInvoice(xml, filename);

            setAlertConfig({
                isOpen: true,
                title: 'Factura Electrónica Gerada',
                description: `A factura ${invoiceNo} foi gerada e baixada com sucesso.`,
                type: 'success'
            });
        } catch (error) {
            console.error('Erro ao gerar factura:', error);
            setAlertConfig({
                isOpen: true,
                title: 'Erro ao Gerar Factura',
                description: `Ocorreu um erro ao gerar a factura electrónica. ${error instanceof Error ? error.message : 'Verifique os dados e tente novamente.'}`,
                type: 'error'
            });
        }
    };

    const handleGenerateEconomicReport = () => {
        try {
            generateEconomicReport({
                clients,
                credits,
                payments,
                logs,
                companySettings,
                userName: user?.name
            });

            setAlertConfig({
                isOpen: true,
                title: 'Relatório Económico Gerado',
                description: 'O relatório económico completo foi gerado e baixado com sucesso.',
                type: 'success'
            });
        } catch (error) {
            console.error('Erro ao gerar relatório económico:', error);
            setAlertConfig({
                isOpen: true,
                title: 'Erro ao Gerar Relatório',
                description: 'Ocorreu um erro ao gerar o relatório económico. Tente novamente mais tarde.',
                type: 'error'
            });
        }
    };

    const handleGenerateSaftPDF = () => {
        try {
            let startDate: Date;
            let endDate: Date;

            if (saftPeriod === 'annual') {
                startDate = new Date(saftYear, 0, 1);
                endDate = new Date(saftYear, 11, 31);
            } else if (saftPeriod === 'monthly') {
                startDate = new Date(saftYear, saftMonth - 1, 1);
                endDate = new Date(saftYear, saftMonth, 0);
            } else {
                const startMonth = (saftQuarter - 1) * 3;
                startDate = new Date(saftYear, startMonth, 1);
                endDate = new Date(saftYear, startMonth + 3, 0);
            }

            generateSaftReportPDF(companySettings, {
                fiscalYear: saftYear,
                startDate,
                endDate
            }, {
                clients: clients.length,
                invoices: credits.length,
                payments: payments.length
            });

            setAlertConfig({
                isOpen: true,
                title: 'Relatório SAF-T (PDF) Gerado',
                description: 'O relatório de síntese do SAF-T foi baixado com sucesso.',
                type: 'success'
            });
        } catch (error) {
            console.error('Erro ao gerar relatório PDF SAF-T:', error);
            setAlertConfig({
                isOpen: true,
                title: 'Erro ao Gerar PDF',
                description: 'Ocorreu um erro ao gerar o relatório PDF.',
                type: 'error'
            });
        }
    };

    const handleGenerateInvoicePDF = async () => {
        if (!selectedCreditId) return;

        try {
            const credit = credits.find(c => c.id === selectedCreditId);
            const client = clients.find(c => c.id === credit?.clientId);

            if (!credit || !client) throw new Error('Dados não encontrados');

            const invoiceNo = `FT ${new Date().getFullYear()}/${String(credits.indexOf(credit) + 1).padStart(6, '0')}`;

            await generateInvoicePDF({
                invoiceNo,
                credit,
                client,
                companySettings,
                userName: user?.name || 'Sistema'
            });

            setAlertConfig({
                isOpen: true,
                title: 'Factura (PDF) Gerada',
                description: 'A factura em formato PDF foi gerada com sucesso.',
                type: 'success'
            });
        } catch (error) {
            console.error('Erro ao gerar factura PDF:', error);
            setAlertConfig({
                isOpen: true,
                title: 'Erro ao Gerar PDF',
                description: 'Ocorreu um erro ao gerar a factura em PDF.',
                type: 'error'
            });
        }
    };

    const activeCredits = credits.filter(c => c.status === 'active' || c.status === 'overdue');

    return (
        <MainLayout title="Relatórios Fiscais" subtitle="Geração de SAF-T (AO) e Facturas Electrónicas">
            {/* Info Cards Estilo Pastel Arredondado */}
            <div className="mb-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {/* 1. Total de Clientes (Azul Céu #82C9FF) */}
                <div className="card-kpi-sky">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <FileText className="h-5 w-5" />
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                Total de Clientes
                            </p>
                        </div>
                    </div>

                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {clients.length}
                        </p>
                    </div>

                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Titulares com cadastro na base fiscal
                    </p>
                </div>

                {/* 2. Créditos Activos (Verde Menta #86EFAC) */}
                <div className="card-kpi-mint">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <Receipt className="h-5 w-5" />
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                Créditos Activos
                            </p>
                        </div>
                    </div>

                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {activeCredits.length}
                        </p>
                    </div>

                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Contratos sujeitos a tributação e juros
                    </p>
                </div>

                {/* 3. Pagamentos Registados (Dourado / Âmbar #FED771) */}
                <div className="card-kpi-amber">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <FileCheck className="h-5 w-5" />
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                Pagamentos Registados
                            </p>
                        </div>
                    </div>

                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {payments.length}
                        </p>
                    </div>

                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Movimentos e recibos processados
                    </p>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Economic Report Generation */}
                <Card className="p-6 lg:col-span-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-100 dark:border-blue-900/40">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                            <TrendingUp className="h-8 w-8 text-blue-700 dark:text-blue-300" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-blue-900 dark:text-blue-200">Relatório Económico Global</h3>
                            <p className="text-blue-700 dark:text-blue-300">Análise completa de performance, lucros, perdas e métricas operacionais.</p>
                        </div>
                        <Button
                            onClick={handleGenerateEconomicReport}
                            className="ml-auto bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white gap-2 shadow-lg hover:shadow-xl transition-all"
                            size="lg"
                        >
                            <Download className="h-5 w-5" />
                            Baixar Relatório Completo (PDF)
                        </Button>
                    </div>
                </Card>

                {/* SAF-T Generation */}
                <Card className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-primary/10 rounded-lg">
                            <FileText className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">Ficheiro SAF-T (AO)</h3>
                            <p className="text-sm text-muted-foreground">Standard Audit File for Tax Purposes</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <Label>Ano Fiscal</Label>
                            <Input
                                type="number"
                                value={saftYear}
                                onChange={(e) => setSaftYear(parseInt(e.target.value))}
                                min={2020}
                                max={new Date().getFullYear()}
                            />
                        </div>

                        <div>
                            <Label>Período</Label>
                            <Select value={saftPeriod} onValueChange={(v: any) => setSaftPeriod(v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="annual">Anual</SelectItem>
                                    <SelectItem value="monthly">Mensal</SelectItem>
                                    <SelectItem value="quarterly">Trimestral</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {saftPeriod === 'monthly' && (
                            <div>
                                <Label>Mês</Label>
                                <Select value={String(saftMonth)} onValueChange={(v) => setSaftMonth(parseInt(v))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                            <SelectItem key={m} value={String(m)}>
                                                {new Date(2000, m - 1).toLocaleDateString('pt-AO', { month: 'long' })}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {saftPeriod === 'quarterly' && (
                            <div>
                                <Label>Trimestre</Label>
                                <Select value={String(saftQuarter)} onValueChange={(v) => setSaftQuarter(parseInt(v))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">1º Trimestre (Jan-Mar)</SelectItem>
                                        <SelectItem value="2">2º Trimestre (Abr-Jun)</SelectItem>
                                        <SelectItem value="3">3º Trimestre (Jul-Set)</SelectItem>
                                        <SelectItem value="4">4º Trimestre (Out-Dez)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="pt-4 border-t flex flex-col gap-2">
                            <Button onClick={handleGenerateSAFT} className="w-full gap-2">
                                <Download className="h-4 w-4" />
                                Gerar e Baixar SAF-T (XML)
                            </Button>
                            <Button onClick={handleGenerateSaftPDF} variant="outline" className="w-full gap-2">
                                <Printer className="h-4 w-4" />
                                Baixar Relatório Síntese (PDF)
                            </Button>
                            <p className="text-xs text-muted-foreground mt-2 text-center">
                                Valide o ficheiro em <a href="https://saft.ao" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">SAFT.AO</a> antes de submeter
                            </p>
                        </div>
                    </div>
                </Card>

                {/* E-Invoice Generation */}
                <Card className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-success/10 rounded-lg">
                            <Receipt className="h-6 w-6 text-success" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">Factura Electrónica</h3>
                            <p className="text-sm text-muted-foreground">Documento Fiscal Digital (Obrigatório desde 01/01/2026)</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <Label>Selecionar Crédito</Label>
                            <Select value={selectedCreditId} onValueChange={setSelectedCreditId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Escolha um crédito..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {activeCredits.map(credit => {
                                        const client = clients.find(c => c.id === credit.clientId);
                                        return (
                                            <SelectItem key={credit.id} value={credit.id}>
                                                {client?.name} - {credit.principalAmount.toLocaleString('pt-AO', { style: 'currency', currency: 'AOA' })}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>

                        {selectedCreditId && (
                            <div className="p-4 bg-muted/30 rounded-lg border">
                                <h4 className="text-sm font-semibold mb-2">Pré-visualização</h4>
                                {(() => {
                                    const credit = credits.find(c => c.id === selectedCreditId);
                                    const client = clients.find(c => c.id === credit?.clientId);
                                    if (!credit || !client) return null;

                                    return (
                                        <div className="space-y-1 text-sm">
                                            <p><span className="font-medium">Cliente:</span> {client.name}</p>
                                            <p><span className="font-medium">NIF:</span> {client.nif || 'N/A'}</p>
                                            <p><span className="font-medium">Valor:</span> {credit.principalAmount.toLocaleString('pt-AO', { style: 'currency', currency: 'AOA' })}</p>
                                            <p><span className="font-medium">Data:</span> {formatDate(credit.startDate)}</p>
                                            <Badge variant={credit.status === 'active' ? 'success' : credit.status === 'overdue' ? 'destructive' : 'default'} className="mt-2">
                                                {credit.status === 'active' ? 'Activo' : credit.status === 'overdue' ? 'Em Atraso' : 'Pago'}
                                            </Badge>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        <div className="pt-4 border-t flex flex-col gap-2">
                            <Button onClick={handleGenerateEInvoice} className="w-full gap-2" disabled={!selectedCreditId}>
                                <Download className="h-4 w-4" />
                                Gerar Factura Electrónica (XML)
                            </Button>
                            <Button onClick={handleGenerateInvoicePDF} variant="outline" className="w-full gap-2" disabled={!selectedCreditId}>
                                <Printer className="h-4 w-4" />
                                Baixar Factura (PDF) + QR Code
                            </Button>
                            <p className="text-xs text-muted-foreground mt-2 text-center">
                                A factura será assinada electronicamente e incluirá QR Code
                            </p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Info Section */}
            <Card className="p-6 mt-6 bg-amber-50 border-amber-200">
                <div className="flex gap-4">
                    <ShieldAlert className="h-6 w-6 text-amber-600 shrink-0 mt-1" />
                    <div className="space-y-2">
                        <h4 className="font-bold text-amber-900">Informações Importantes</h4>
                        <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                            <li>O ficheiro SAF-T deve ser validado antes da submissão à AGT</li>
                            <li>Facturas electrónicas são obrigatórias desde 1 de Janeiro de 2026</li>
                            <li>Mantenha cópias de segurança de todos os ficheiros gerados</li>
                            <li>Em caso de dúvidas, consulte a legislação fiscal angolana ou um contabilista certificado</li>
                        </ul>
                    </div>
                </div>
            </Card>

            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
                title={alertConfig.title}
                description={alertConfig.description}
                type={alertConfig.type}
            />
        </MainLayout>
    );
}




