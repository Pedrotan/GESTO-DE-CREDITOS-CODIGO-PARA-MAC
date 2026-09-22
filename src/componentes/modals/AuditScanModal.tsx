
import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Progress } from '@/componentes/ui/progress';
import { useData } from '@/contextos/ContextoDados';
import { runAuditScan, AuditFinding } from '@/bibliotecas/audit';
import { ShieldCheck, AlertTriangle, AlertOctagon, Lock, Play, Download, CheckCircle, FileText } from 'lucide-react';
import { Badge } from '@/componentes/ui/badge';
import { ScrollArea } from '@/componentes/ui/scroll-area';
import { useToast } from '@/ganchos/usar-toast';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { generateFinancialAuditPDF } from '@/bibliotecas/pdf';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';

interface AuditScanModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// @ts-ignore
import { Calendar } from 'lucide-react';
import { Input } from '@/componentes/ui/input';
import { formatCurrency, formatDate } from '@/bibliotecas/formatters';

export function AuditScanModal({ isOpen, onClose }: AuditScanModalProps) {
    const { accountingEntries, credits, payments, companySettings, updateCompanySettings } = useData();
    const { user } = useAuth();
    const [status, setStatus] = useState<'idle' | 'scanning' | 'complete'>('idle');
    const [progress, setProgress] = useState(0);
    const [scanStage, setScanStage] = useState('');
    const [findings, setFindings] = useState<AuditFinding[]>([]);
    const [metrics, setMetrics] = useState<any>(null);
    const { toast } = useToast();

    // Date Filters
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [activeTab, setActiveTab] = useState('scan');

    const handleStartScan = async () => {
        setStatus('scanning');
        setFindings([]);
        setMetrics(null);
        setProgress(0);

        // Convert strings to Date objects if present
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        if (end) end.setHours(23, 59, 59, 999); // End of day

        setScanStage('Calculando Métricas Financeiras...');
        setProgress(10);
        await new Promise(r => setTimeout(r, 600));

        setScanStage('Verificando Integridade (Hash/Blockchain)...');
        setProgress(30);
        await new Promise(r => setTimeout(r, 600));

        setScanStage('Conciliando Saldos por Contrato...');
        setProgress(60);
        await new Promise(r => setTimeout(r, 600));

        setScanStage('Analisando Despesas e Lucros...');
        setProgress(90);
        await new Promise(r => setTimeout(r, 600));

        try {
            const results = await runAuditScan(accountingEntries || [], credits || [], payments || [], start, end);
            setFindings(results.findings || []);
            setMetrics(results.metrics);
            setProgress(100);
            setScanStage('Concluído');
            setStatus('complete');
        } catch (error) {
            console.error(error);
            toast({ title: "Erro", description: "Falha ao executar auditoria.", variant: "destructive" });
            setStatus('idle');
        }
    };

    const handleFreezeSystem = async () => {
        try {
            await updateCompanySettings({
                financialLock: true
            });

            toast({
                title: "Sistema Congelado",
                description: "O módulo financeiro foi bloqueado para segurança.",
                variant: "destructive"
            });
            onClose();
        } catch (e) {
            toast({ title: "Erro", description: "Não foi possível bloquear o sistema." });
        }
    };

    const handleDownloadReport = () => {
        if (!metrics) return;

        try {
            generateFinancialAuditPDF(
                findings,
                metrics,
                companySettings,
                user?.name || 'Administrador',
                {
                    start: startDate ? formatDate(startDate) : undefined,
                    end: endDate ? formatDate(endDate) : undefined
                }
            );

            toast({
                title: "Relatório Gerado",
                description: "O PDF da auditoria foi baixado com sucesso."
            });
        } catch (error) {
            console.error("Erro ao baixar relatório:", error);
            toast({
                title: "Erro de Exportação",
                description: "Não foi possível gerar o PDF. Aceda ao console para detalhes.",
                variant: "destructive"
            });
        }
    };

    const getSeverityIcon = (level: string) => {
        switch (level) {
            case 'critical': return <AlertOctagon className="h-4 w-4 text-red-600" />;
            case 'high': return <AlertTriangle className="h-4 w-4 text-orange-500" />;
            case 'medium': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
            default: return <CheckCircle className="h-4 w-4 text-green-500" />;
        }
    };

    const getSeverityBadge = (level: string) => {
        switch (level) {
            case 'critical': return <Badge variant="destructive" className="animate-pulse">CRÍTICO</Badge>;
            case 'high': return <Badge className="bg-orange-500 hover:bg-orange-600">ALTO</Badge>;
            case 'medium': return <Badge className="bg-yellow-500 text-black hover:bg-yellow-600">MÉDIO</Badge>;
            default: return <Badge variant="outline">INFO</Badge>;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                <div className="p-6 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl dark:text-white">
                            <ShieldCheck className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                            Auditoria Financeira e Compliance
                        </DialogTitle>
                        <DialogDescription className="dark:text-slate-400">
                            Varredura de integridade e análise financeira do período.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                    <div className="px-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                        <TabsList className="grid w-[300px] grid-cols-2 bg-slate-100 dark:bg-slate-800">
                            <TabsTrigger value="scan" className="dark:data-[state=active]:bg-slate-700">Executar Auditoria</TabsTrigger>
                            <TabsTrigger value="guide" className="dark:data-[state=active]:bg-slate-700">Como Funciona</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="scan" className="flex-1 p-6 pt-4 flex flex-col min-h-0 data-[state=inactive]:hidden text-center sm:text-left">
                        <div className="flex-1 space-y-6 overflow-hidden flex flex-col">
                            {/* Status Area */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm font-medium">
                                    <span className={status === 'scanning' ? 'text-indigo-600 dark:text-indigo-400 animate-pulse' : 'text-slate-600 dark:text-slate-400'}>
                                        {scanStage || 'Aguardando Início...'}
                                    </span>
                                    <span className="dark:text-slate-400">{progress}%</span>
                                </div>
                                <Progress value={progress} className="h-2 dark:bg-slate-800" />
                            </div>

                            {status === 'idle' && (
                                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                                    <div className="bg-white dark:bg-slate-900 p-4 rounded-full shadow-sm mb-4">
                                        <ShieldCheck className="h-12 w-12 text-indigo-500 dark:text-indigo-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Configurar Varredura</h3>
                                    <p className="text-slate-500 dark:text-slate-400 max-w-md mb-6">
                                        Defina o período para análise de receitas, despesas e contratos.
                                        A verificação de integridade (Hash) será feita em todo o histórico.
                                    </p>

                                    <div className="grid grid-cols-2 gap-4 w-full max-w-md mb-6">
                                        <div className="space-y-2 text-left">
                                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400">Data Inicial</label>
                                            <Input
                                                type="date"
                                                className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                                value={startDate}
                                                onChange={e => setStartDate(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400">Data Final</label>
                                            <Input
                                                type="date"
                                                className="dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                                value={endDate}
                                                onChange={e => setEndDate(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <Button size="lg" onClick={handleStartScan} className="bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 shadow-lg">
                                        <Play className="h-4 w-4 mr-2" />
                                        Iniciar Auditoria
                                    </Button>
                                </div>
                            )}

                            {status === 'complete' && metrics && (
                                <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                    {/* Metrics Dashboard */}
                                    <div className="grid grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                                            <div className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">Receita Total</div>
                                            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                                                {formatCurrency(metrics.revenue, companySettings?.currency)}
                                            </div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                                            <div className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">Despesas</div>
                                            <div className="text-lg font-bold text-red-500 dark:text-red-400">
                                                {formatCurrency(metrics.expenses, companySettings?.currency)}
                                            </div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                                            <div className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">Lucro Líquido</div>
                                            <div className={`text-lg font-bold ${metrics.profit >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-600 dark:text-red-400'}`}>
                                                {formatCurrency(metrics.profit, companySettings?.currency)}
                                            </div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                                            <div className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">Novos Contratos</div>
                                            <div className="text-lg font-bold text-slate-700 dark:text-slate-300">
                                                {metrics.contractsCount}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center">
                                        <h4 className="font-bold flex items-center gap-2 dark:text-white">
                                            <FileText className="h-4 w-4 text-slate-400" />
                                            Apontamentos de Auditoria
                                        </h4>
                                        <div className="flex gap-2 text-xs font-bold">
                                            <Badge variant="outline" className="border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20">
                                                {findings.filter(f => f.severity === 'critical').length} Críticos
                                            </Badge>
                                            <Badge variant="outline" className="border-orange-200 dark:border-orange-900 text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20">
                                                {findings.filter(f => f.severity === 'high').length} Altos
                                            </Badge>
                                        </div>
                                    </div>

                                    <ScrollArea className="flex-1 p-0">
                                        {findings.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-48 text-emerald-600">
                                                <CheckCircle className="h-12 w-12 mb-3" />
                                                <p className="font-bold">Nenhuma irregularidade encontrada.</p>
                                                <p className="text-sm text-emerald-600/80">O sistema está íntegro e conciliado.</p>
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {findings.map((finding) => (
                                                    <div key={finding.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex gap-4">
                                                        <div className="mt-1">{getSeverityIcon(finding.severity)}</div>
                                                        <div className="flex-1">
                                                            <div className="flex justify-between items-start mb-1">
                                                                <h5 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{finding.type}</h5>
                                                                {getSeverityBadge(finding.severity)}
                                                            </div>
                                                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">{finding.description}</p>
                                                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 inline-block px-2 py-1 rounded">
                                                                Impacto: {finding.impact}
                                                            </p>
                                                            <div className="mt-2 text-[10px] text-slate-400 font-mono">
                                                                Ref: {finding.entityId}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </ScrollArea>
                                </div>
                            )}

                            <div className="mt-4 flex gap-2 sm:justify-between px-6 pb-6 pt-2 border-t border-slate-100 dark:border-slate-800">
                                <Button variant="ghost" className="dark:text-slate-400 dark:hover:bg-slate-800" onClick={onClose}>Fechar</Button>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    {status === 'complete' && (
                                        <Button variant="outline" onClick={handleDownloadReport} className="flex-1 sm:flex-none">
                                            <Download className="h-4 w-4 mr-2" />
                                            Baixar Relatório (PDF)
                                        </Button>
                                    )}
                                    {status === 'complete' && findings.some(f => f.severity === 'critical') && (
                                        <Button variant="destructive" onClick={handleFreezeSystem} className="flex-1 sm:flex-none animate-pulse">
                                            <Lock className="h-4 w-4 mr-2" />
                                            Congelar Movimentação (Pânico)
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="guide" className="flex-1 overflow-hidden data-[state=inactive]:hidden flex flex-col">
                        <ScrollArea className="flex-1 p-6">
                            <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                                <h3 className="text-indigo-800 dark:text-indigo-400 mt-0">Guia de Auditoria Financeira</h3>
                                <p className="dark:text-slate-400">Este módulo é o "cão de guarda" do sistema. Ele monitora a integridade dos dados e detecta anomalias.</p>

                                <h4 className="text-indigo-700 dark:text-indigo-300">1. Como funciona a Varredura?</h4>
                                <ul className="list-disc pl-4 space-y-1 dark:text-slate-400">
                                    <li><strong>Cálculo de Métricas:</strong> Soma receitas, despesas e lucro real.</li>
                                    <li><strong>Integridade Blockchain:</strong> Verifica se os registros sofreram alteração externa manual (Hash inválido).</li>
                                    <li><strong>Conciliação:</strong> Compara Saldo Devedor real vs esperado.</li>
                                    <li><strong>Anomalias:</strong> Detecta pagamentos em Domingos ou status inconsistentes.</li>
                                </ul>

                                <h4 className="text-indigo-700 dark:text-indigo-300 mt-4">2. Níveis de Severidade</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 not-prose">
                                    <div className="p-2 border rounded bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900">
                                        <div className="font-bold text-red-700 dark:text-red-400 flex items-center gap-2"><AlertOctagon className="h-4 w-4" /> CRÍTICO</div>
                                        <div className="text-xs text-red-600 dark:text-red-400/80">Fraude ou violação de dados (Hash). Requer congelamento.</div>
                                    </div>
                                    <div className="p-2 border rounded bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-900">
                                        <div className="font-bold text-orange-700 dark:text-orange-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> ALTO</div>
                                        <div className="text-xs text-orange-600 dark:text-orange-400/80">Dinheiro desapareceu (Divergência de Saldo).</div>
                                    </div>
                                    <div className="p-2 border rounded bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-900">
                                        <div className="font-bold text-yellow-700 dark:text-yellow-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> MÉDIO</div>
                                        <div className="text-xs text-yellow-600 dark:text-yellow-400/80">Erros operacionais (Datas estranhas).</div>
                                    </div>
                                </div>

                                <h4 className="text-indigo-700 dark:text-indigo-300 mt-4">3. Botão de Pânico</h4>
                                <p className="text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded dark:text-slate-400">
                                    Se houver alertas <strong>CRÍTICOS</strong>, o botão "Congelar Movimentação" aparecerá. Use-o para bloquear o sistema imediatamente e impedir novos danos até a análise técnica.
                                </p>
                            </div>
                        </ScrollArea>
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end">
                            <Button variant="outline" className="dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:hover:bg-slate-700" onClick={() => setActiveTab('scan')}>
                                Voltar para Auditoria
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

