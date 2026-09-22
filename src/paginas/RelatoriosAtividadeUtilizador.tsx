import { useState, useEffect, useMemo, useCallback } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { formatCurrency, formatDate, formatDateTimeFull } from '@/bibliotecas/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/componentes/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/componentes/ui/table';
import { User, Activity, CheckCircle, XCircle, FileText, Filter, FileDown, Eye, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Button } from '@/componentes/ui/button';
import { useToast } from '@/componentes/ui/use-toast';
import { AlertModal, AlertModalType } from '@/componentes/ui/AlertModal';
import { generateUserActivityPDF } from '@/bibliotecas/pdf';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/componentes/ui/dialog";
import { AuditLog } from '@/tipos/credito';

export default function UserActivityReports() {
    const { user } = useAuth();
    const { users, logs, credits, clients, companySettings, getUserActivityReport, deleteLog, clearUserLogs } = useData();
    const [roleFilter, setRoleFilter] = useState('all');
    const [selectedUserId, setSelectedUserId] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [reportLogs, setReportLogs] = useState<AuditLog[]>([]);
    const { toast } = useToast();

    // Estado da Modal de Alerta
    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        type: AlertModalType;
        onConfirm?: () => void;
        showCancel?: boolean;
        actionLabel?: string;
        variant?: 'default' | 'destructive';
    }>({
        isOpen: false,
        title: '',
        description: '',
        type: 'success'
    });

    const [viewUserLogs, setViewUserLogs] = useState<{ isOpen: boolean; userId: string; userName: string }>({
        isOpen: false,
        userId: '',
        userName: ''
    });

    const fetchReportData = useCallback(async () => {
        setIsLoading(true);
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate + 'T23:59:59') : undefined;

        const logs = await getUserActivityReport(selectedUserId, start, end);
        setReportLogs(logs);
        setIsLoading(false);
    }, [endDate, getUserActivityReport, selectedUserId, startDate]);

    useEffect(() => {
        fetchReportData();
    }, [fetchReportData, logs]);

    const filteredLogs = useMemo(() => {
        let result = reportLogs;
        if (roleFilter !== 'all') {
            // Se filtrarmos por cargo, precisamos cruzar com a lista de users
            const usersInRole = users.filter(u => u.role === roleFilter).map(u => u.id);
            result = result.filter(log => usersInRole.includes(log.userId));
        }
        return result;
    }, [reportLogs, roleFilter, users]);

    const handleViewLogs = (userId: string, userName: string) => {
        setViewUserLogs({ isOpen: true, userId, userName });
    };

    const handleDeleteLog = async (logId: string) => {
        try {
            await deleteLog(logId);
            toast({ title: "Registro Apagado", description: "O registro de atividade foi removido." });
            // Atualizar relatório? O hook fetchReportData depende de 'logs' (context), 
            // se getUserActivityReport buscar do banco, e deleteLog apagar do banco e atualizar state logs -> deve atualizar.
        } catch (error) {
            toast({ title: "Erro", description: "Não foi possível apagar o registro.", variant: "destructive" });
        }
    };

    const handleClearHistory = (userId: string, userName: string) => {
        setAlertConfig({
            isOpen: true,
            title: `Apagar Histórico de ${userName}`,
            description: "Tem certeza que deseja apagar TODO o histórico de atividades deste utilizador? Esta ação não pode ser desfeita.",
            type: "warning",
            variant: "destructive",
            showCancel: true,
            actionLabel: "Sim, Apagar Tudo",
            onConfirm: async () => {
                try {
                    await clearUserLogs(userId);
                    toast({ title: "Histórico Apagado", description: `Todos os registros de ${userName} foram removidos.` });
                } catch (error) {
                    toast({ title: "Erro", description: "Falha ao limpar histórico.", variant: "destructive" });
                }
            }
        });
    };

    const handleDownloadUserReport = (userId: string, userName: string) => {
        const userLogs = filteredLogs.filter(l => l.userId === userId);
        if (userLogs.length === 0) {
            setAlertConfig({
                isOpen: true,
                title: "Sem dados",
                description: "Este utilizador não possui atividades no período selecionado.",
                type: "warning"
            });
            return;
        }
        generateUserActivityPDF(userId, userName, userLogs, companySettings, user?.name);
        setAlertConfig({
            isOpen: true,
            title: "Sucesso",
            description: `Relatório de ${userName} gerado com sucesso.`,
            type: "success"
        });
    };

    const userStats = useMemo(() => {
        const stats: Record<string, any> = {};

        // Processar logs filtrados para atividade
        filteredLogs.forEach(log => {
            // Apenas pular se não houver userId válido
            if (!log.userId) return;

            if (!stats[log.userId]) {
                stats[log.userId] = {
                    id: log.userId,
                    name: log.userName || 'Utilizador Desconhecido',
                    actions: 0,
                    clientsCreated: 0,
                    creditsCreated: 0,
                    creditsApproved: 0,
                    creditsRejected: 0,
                    lastActive: log.timestamp
                };
            }

            stats[log.userId].actions++;
            if (log.action === 'create' && log.entity === 'client') stats[log.userId].clientsCreated++;
            if (log.action === 'create' && log.entity === 'credit') stats[log.userId].creditsCreated++;
            if (log.details.includes('Aprovou crédito')) stats[log.userId].creditsApproved++;
            if (log.details.includes('Rejeitou crédito')) stats[log.userId].creditsRejected++;

            if (new Date(log.timestamp) > new Date(stats[log.userId].lastActive)) {
                stats[log.userId].lastActive = log.timestamp;
            }
        });

        return Object.values(stats);
    }, [filteredLogs]);

    if (user?.role !== 'super_admin') {
        return (
            <MainLayout title="Relatórios de Atividade" subtitle="Acesso restrito">
                <div className="flex items-center justify-center h-[60vh]">
                    <p className="text-muted-foreground">Acesso restrito ao Super Administrador.</p>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout title="Relatórios de Atividade" subtitle="Performance e auditoria de pessoal">
            <div className="space-y-6">
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Relatórios de Atividade</h1>
                        <p className="text-muted-foreground">Monitorize a performance e as ações de toda a equipa administrativa.</p>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">De:</span>
                            <input
                                type="date"
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Até:</span>
                            <input
                                type="date"
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                                <SelectTrigger className="w-52">
                                    <SelectValue placeholder="Utilizador" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os Utilizadores</SelectItem>
                                    {users.map(u => (
                                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-2">
                            <Select value={roleFilter} onValueChange={setRoleFilter}>
                                <SelectTrigger className="w-40">
                                    <SelectValue placeholder="Cargo" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os Cargos</SelectItem>
                                    <SelectItem value="admin">Administradores</SelectItem>
                                    <SelectItem value="manager">Gestores</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total de Ações</CardTitle>
                            <Activity className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{logs.length}</div>
                            <p className="text-xs text-muted-foreground">Registadas no sistema</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Créditos Processados</CardTitle>
                            <FileText className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{credits.length}</div>
                            <p className="text-xs text-muted-foreground">Vitalício do sistema</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Aprovações</CardTitle>
                            <CheckCircle className="h-4 w-4 text-success" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{credits.filter(c => c.approvedBy).length}</div>
                            <p className="text-xs text-muted-foreground">Pelas mãos de Admins</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Rejeições</CardTitle>
                            <XCircle className="h-4 w-4 text-danger" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{credits.filter(c => c.status === 'rejected').length}</div>
                            <p className="text-xs text-muted-foreground">Solicitações negadas</p>
                        </CardContent>
                    </Card>
                </div>

                <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead>Colaborador</TableHead>
                                <TableHead className="text-center">Ações</TableHead>
                                <TableHead className="text-center">Créditos Criados</TableHead>
                                <TableHead className="text-center">Aprov./Rejeit.</TableHead>
                                <TableHead className="text-center">Clientes</TableHead>
                                <TableHead className="text-right">Última Atividade</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-10">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                            <p className="text-sm text-muted-foreground">A carregar atividades...</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : userStats.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                        Nenhuma atividade encontrada no período selecionado.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                userStats.map((stat) => (
                                    <TableRow key={stat.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                                                    <User className="h-4 w-4" />
                                                </div>
                                                <span className="font-medium">{stat.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center font-bold text-muted-foreground">{stat.actions}</TableCell>
                                        <TableCell className="text-center font-medium">{stat.creditsCreated}</TableCell>
                                        <TableCell className="text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <span className="text-success">{stat.creditsApproved}</span>
                                                <span className="text-muted-foreground">/</span>
                                                <span className="text-danger">{stat.creditsRejected}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center font-medium">{stat.clientsCreated}</TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground">
                                            {formatDate(stat.lastActive)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleViewLogs(stat.id, stat.name)}
                                                    title="Ver todas as atividades"
                                                >
                                                    <Eye className="h-4 w-4 text-primary" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDownloadUserReport(stat.id, stat.name)}
                                                    title="Baixar Relatório PDF"
                                                >
                                                    <FileDown className="h-4 w-4 text-muted-foreground" />
                                                </Button>
                                                {user?.role === 'super_admin' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => handleClearHistory(stat.id, stat.name)}
                                                        title="Apagar Histórico Completo"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
            <AlertModal
                onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                {...alertConfig}
            />

            <Dialog open={viewUserLogs.isOpen} onOpenChange={(open) => !open && setViewUserLogs({ ...viewUserLogs, isOpen: false })}>
                <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Histórico de Atividades - {viewUserLogs.userName}</DialogTitle>
                        <DialogDescription>
                            Lista completa de ações realizadas por este utilizador no sistema.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-auto mt-4 border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[180px]">Data/Hora</TableHead>
                                    <TableHead>Ação</TableHead>
                                    <TableHead>Entidade</TableHead>
                                    <TableHead>Detalhes</TableHead>
                                    <TableHead className="text-right w-[80px]">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportLogs.filter(l => l.userId === viewUserLogs.userId).length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            Nenhum registro encontrado.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    reportLogs
                                        .filter(l => l.userId === viewUserLogs.userId)
                                        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                                        .map(log => (
                                            <TableRow key={log.id}>
                                                <TableCell className="text-xs">
                                                    {formatDateTimeFull(new Date(log.timestamp))}
                                                </TableCell>
                                                <TableCell className="capitalize text-xs font-medium">
                                                    {log.action === 'create' ? 'Criação' :
                                                        log.action === 'update' ? 'Atualização' :
                                                            log.action === 'delete' ? 'Exclusão' :
                                                                log.action === 'login' ? 'Login' :
                                                                    log.action === 'logout' ? 'Logout' :
                                                                        log.action}
                                                </TableCell>
                                                <TableCell className="capitalize text-xs text-muted-foreground">
                                                    {log.entity === 'client' ? 'Cliente' :
                                                        log.entity === 'credit' ? 'Crédito' :
                                                            log.entity === 'payment' ? 'Pagamento' :
                                                                log.entity === 'user' ? 'Utilizador' :
                                                                    log.entity === 'system' ? 'Sistema' :
                                                                        log.entity === 'garantia' ? 'Garantia' :
                                                                            log.entity === 'contencioso' ? 'Contencioso' :
                                                                                log.entity}
                                                </TableCell>
                                                <TableCell className="text-xs">{log.details}</TableCell>
                                                <TableCell className="text-right">
                                                    {user?.role === 'super_admin' && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-destructive/50 hover:text-destructive"
                                                            onClick={() => handleDeleteLog(log.id)}
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}




