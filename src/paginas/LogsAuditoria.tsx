import { useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { generateAuditLogPDF } from '@/bibliotecas/pdf';
import { formatDateSafe } from '@/bibliotecas/utils';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/componentes/ui/table';
import { Badge } from '@/componentes/ui/badge';
import { Input } from '@/componentes/ui/input';
import { Button } from '@/componentes/ui/button';
import { Search, Download, User, Box, Eye, ChevronLeft, ChevronRight, Trash2, AlertTriangle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/componentes/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/componentes/ui/alert-dialog";

export default function AuditLogs() {
    const { user } = useAuth();
    const { logs, companySettings, users, clearAllLogs } = useData();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState('all');
    const [selectedEntity, setSelectedEntity] = useState('all');
    const [selectedLog, setSelectedLog] = useState<any>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isClearModalOpen, setIsClearModalOpen] = useState(false);
    const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Get unique users and entities for filters
    const validLogs = Array.isArray(logs) ? logs : [];
    const Utilizadores = Array.from(new Set(validLogs.map(l => l.userName || l.userId)));
    const entities = Array.from(new Set(validLogs.map(l => l.entity)));

    const entityTranslation: Record<string, string> = {
        'client': 'Cliente',
        'credit': 'Crédito',
        'payment': 'Pagamento',
        'user': 'Usuário',
        'system': 'Sistema',
        'auth': 'Autenticação',
        'accounting': 'Contabilidade',
        'contract': 'Contrato',
        'settings': 'Configurações'
    };

    const actionTranslation: Record<string, string> = {
        'create': 'Criação',
        'update': 'Edição',
        'delete': 'Exclusão',
        'login': 'Login',
        'logout': 'Logout',
        'system': 'Sistema',
        'approve': 'Aprovação',
        'reject': 'Rejeição',
        'freeze': 'Bloqueio'
    };

    const handleExportPDF = () => {
        try {
            generateAuditLogPDF(filteredLogs, companySettings, { name: user?.name || 'Administrador', role: user?.role || 'Super Admin' });
        } catch (error) {
            console.error("Export error", error);
        }
    };

    const handleClearLogs = async () => {
        try {
            await clearAllLogs({ id: user?.id || 'system', name: user?.name || 'Sistema' });
            setIsConfirmClearOpen(false);
            setIsClearModalOpen(false);
        } catch (error) {
            console.error("Failed to clear logs", error);
        }
    };

    const filteredLogs = validLogs.filter(log => {
        const entityLower = log.entity?.toLowerCase() || '';
        const actionLower = log.action?.toLowerCase() || '';
        const detailsLower = log.details?.toLowerCase() || '';
        const searchLower = searchTerm.toLowerCase();

        const matchesSearch = detailsLower.includes(searchLower) ||
            log.userId?.toLowerCase().includes(searchLower) ||
            actionLower.includes(searchLower) ||
            (entityTranslation[entityLower] || entityLower).toLowerCase().includes(searchLower) ||
            (actionTranslation[actionLower] || actionLower).toLowerCase().includes(searchLower);

        const matchesUser = selectedUser === 'all' || log.userId === selectedUser || log.userName === selectedUser;
        const matchesEntity = selectedEntity === 'all' || log.entity === selectedEntity;

        return matchesSearch && matchesUser && matchesEntity;
    });

    // Pagination logic
    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
    const paginatedLogs = filteredLogs.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };

    // Calculate stats
    const totalLogs = validLogs.length;
    const creates = validLogs.filter(l => l.action === 'create').length;
    const updates = validLogs.filter(l => l.action === 'update').length;
    const deletions = validLogs.filter(l => l.action === 'delete').length;

    const getActionColor = (action: string) => {
        switch (action) {
            case 'create': return 'success';
            case 'update': return 'warning';
            case 'delete': return 'destructive';
            case 'login': return 'default';
            case 'logout': return 'secondary';
            default: return 'outline';
        }
    };

    return (
        <MainLayout title="Auditoria" subtitle="Histórico de ações do sistema">
            {/* Stats Cards Estilo Pastel Arredondado */}
            <div className="mb-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                <div className="card-kpi-sky">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <Box className="h-5 w-5" />
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                Total de Registros
                            </p>
                        </div>
                    </div>
                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {totalLogs}
                        </p>
                    </div>
                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Ações auditadas no sistema
                    </p>
                </div>

                <div className="card-kpi-mint">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <Box className="h-5 w-5" />
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                Criações
                            </p>
                        </div>
                    </div>
                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {creates}
                        </p>
                    </div>
                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Novos lançamentos e cadastros
                    </p>
                </div>

                <div className="card-kpi-amber">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <Eye className="h-5 w-5" />
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                Edições
                            </p>
                        </div>
                    </div>
                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {updates}
                        </p>
                    </div>
                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Alterações de dados existentes
                    </p>
                </div>

                <div className="card-kpi-coral">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <Trash2 className="h-5 w-5" />
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                Exclusões
                            </p>
                        </div>
                    </div>
                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {deletions}
                        </p>
                    </div>
                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Registros removidos
                    </p>
                </div>
            </div>

            <div className="mb-6 flex flex-wrap items-center gap-4">
                <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-2 h-10">
                    <Download className="h-4 w-4" />
                    Exportar PDF
                </Button>

                {user?.role === 'super_admin' && (
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setIsClearModalOpen(true)}
                        className="gap-2 h-10"
                    >
                        <Trash2 className="h-4 w-4" />
                        Limpar Logs
                    </Button>
                )}

                <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger className="w-[180px] h-10">
                        <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <SelectValue placeholder="Utilizador" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos Utilizadores</SelectItem>
                        {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name || u.username}</SelectItem>)}
                    </SelectContent>
                </Select>

                <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                    <SelectTrigger className="w-[180px] h-10">
                        <div className="flex items-center gap-2">
                            <Box className="h-4 w-4 text-muted-foreground" />
                            <SelectValue placeholder="Entidade" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas Entidades</SelectItem>
                        {entities.map(e => <SelectItem key={e} value={e}>{entityTranslation[e] || e}</SelectItem>)}
                    </SelectContent>
                </Select>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Pesquisar detalhes..."
                        className="pl-9 w-[250px] h-10"
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setCurrentPage(1); // Reset to first page on search
                        }}
                    />
                </div>
            </div>

            <div className="card-elevated overflow-hidden">
                <Table className="table-fixed">
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="w-[120px]">Data/Hora</TableHead>
                            <TableHead className="w-[180px]">Usuário</TableHead>
                            <TableHead className="w-[100px]">Ação</TableHead>
                            <TableHead className="w-[120px]">Entidade</TableHead>
                            <TableHead>Detalhes</TableHead>
                            <TableHead className="w-12"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedLogs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    Nenhum registro de auditoria encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedLogs.map((log) => (
                                <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                                    <TableCell className="whitespace-nowrap tabular-nums text-sm font-medium">
                                        {formatDateSafe(log.timestamp)}
                                    </TableCell>
                                    <TableCell className="min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="h-7 w-7 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary uppercase">
                                                {(log.userName || log.userId || "SI").substring(0, 2)}
                                            </div>
                                            <span className="text-xs font-semibold truncate">{log.userName || log.userId}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={getActionColor(log.action?.toLowerCase()) as any} className="text-[10px] py-0 px-2 h-5 font-bold uppercase">
                                            {actionTranslation[log.action?.toLowerCase()] || log.action}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="capitalize">
                                        <span className="text-xs font-medium px-2 py-1 bg-slate-100 rounded text-slate-600 truncate inline-block max-w-full">
                                            {entityTranslation[log.entity?.toLowerCase()] || log.entity}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-600" title={log.details}>
                                        <div className="line-clamp-2 leading-relaxed">
                                            {log.details}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                                            onClick={() => {
                                                setSelectedLog(log);
                                                setIsDetailsOpen(true);
                                            }}
                                        >
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 py-2 border-t pt-6">
                        <p className="text-sm text-muted-foreground font-medium">
                            Mostrando <span className="text-foreground font-bold">{(currentPage - 1) * itemsPerPage + 1}</span> a <span className="text-foreground font-bold">{Math.min(currentPage * itemsPerPage, filteredLogs.length)}</span> de <span className="text-foreground font-bold">{filteredLogs.length}</span> registros
                        </p>
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage === 1}
                                onClick={() => handlePageChange(currentPage - 1)}
                                className="h-9 w-9 p-0"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>

                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNumber;
                                if (totalPages <= 5) {
                                    pageNumber = i + 1;
                                } else if (currentPage <= 3) {
                                    pageNumber = i + 1;
                                } else if (currentPage >= totalPages - 2) {
                                    pageNumber = totalPages - 4 + i;
                                } else {
                                    pageNumber = currentPage - 2 + i;
                                }

                                return (
                                    <Button
                                        key={pageNumber}
                                        variant={currentPage === pageNumber ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => handlePageChange(pageNumber)}
                                        className={`h-9 w-9 p-0 font-bold ${currentPage === pageNumber ? 'shadow-md' : ''}`}
                                    >
                                        {pageNumber}
                                    </Button>
                                );
                            })}

                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage === totalPages}
                                onClick={() => handlePageChange(currentPage + 1)}
                                className="h-9 w-9 p-0"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>


            {/* Detailed Log Modal */}
            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-5xl gap-0 overflow-hidden p-0">
                    <DialogHeader className="mx-0 mb-0 mt-0 px-6 pb-6 pt-10 sm:px-8">
                        <DialogTitle className="flex items-center gap-2">
                            <Box className="h-5 w-5 text-primary" />
                            Detalhes da Operação
                        </DialogTitle>
                        <DialogDescription>
                            Informações completas registadas pelo sistema de auditoria.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedLog && (
                        <div className="max-h-[calc(100vh-15rem)] space-y-4 overflow-y-auto px-6 py-5 sm:px-8">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="min-w-0 space-y-1">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase">Data e Hora</p>
                                    <p className="text-sm font-mono">{formatDateSafe(selectedLog.timestamp)}</p>
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase">Utilizador</p>
                                    <p className="break-words text-sm">{selectedLog.userName || selectedLog.userId}</p>
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase">Ação</p>
                                    <Badge variant={getActionColor(selectedLog.action) as any}>
                                        {actionTranslation[selectedLog.action] || selectedLog.action}
                                    </Badge>
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase">Entidade</p>
                                    <p className="break-words text-sm font-medium capitalize">{entityTranslation[selectedLog.entity] || selectedLog.entity}</p>
                                </div>
                            </div>

                            <div className="space-y-1 pt-2 border-t">
                                <p className="text-xs font-semibold text-muted-foreground uppercase">ID da Transação</p>
                                <p className="text-xs font-mono break-all bg-muted p-2 rounded">{selectedLog.id}</p>
                            </div>

                            <div className="space-y-4 pt-2 border-t">
                                <p className="text-xs font-semibold text-muted-foreground uppercase">Alterações (Antes vs Depois)</p>

                                {selectedLog.previousState && selectedLog.newState ? (
                                    <div className="max-w-full overflow-hidden rounded-lg border text-xs">
                                        <div className="grid grid-cols-2 gap-0 border-b bg-muted/50 font-medium">
                                            <div className="p-2 border-r">Antes</div>
                                            <div className="p-2">Depois</div>
                                        </div>
                                        <div className="max-h-[300px] overflow-y-auto">
                                            {(() => {
                                                try {
                                                    const prev = JSON.parse(selectedLog.previousState);
                                                    const next = JSON.parse(selectedLog.newState);
                                                    const allKeys = Array.from(new Set([...Object.keys(prev), ...Object.keys(next)]));

                                                    // Filter out keys that haven't changed or are irrelevant (like timestamps if not important)
                                                    const changedKeys = allKeys.filter(key => JSON.stringify(prev[key]) !== JSON.stringify(next[key]));

                                                    if (changedKeys.length === 0) {
                                                        return <div className="p-4 text-center text-muted-foreground">Nenhuma alteração detectada nos dados estruturados.</div>;
                                                    }

                                                    return changedKeys.map((key) => (
                                                        <div key={key} className="grid grid-cols-2 gap-0 border-b last:border-0 hover:bg-slate-50">
                                                            <div className="min-w-0 break-all border-r bg-red-50/30 p-2 font-mono text-red-600">
                                                                <span className="font-bold text-slate-500 block text-[10px] uppercase mb-1">{key}</span>
                                                                {JSON.stringify(prev[key])}
                                                            </div>
                                                            <div className="min-w-0 break-all bg-green-50/30 p-2 font-mono text-green-600">
                                                                <span className="font-bold text-slate-500 block text-[10px] uppercase mb-1">{key}</span>
                                                                {JSON.stringify(next[key])}
                                                            </div>
                                                        </div>
                                                    ));
                                                } catch (e) {
                                                    return <div className="p-4 text-red-500">Erro ao processar dados de comparação.</div>;
                                                }
                                            })()}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-sm text-muted-foreground italic">
                                        Nenhum detalhe estruturado disponível para esta operação.
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2 pt-2 border-t">
                                <p className="text-xs font-semibold text-muted-foreground uppercase">Descrição Detalhada</p>
                                <div className="rounded-lg border bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 break-words">
                                    {selectedLog.details}
                                </div>
                            </div>

                            {selectedLog.metadata && (
                                <div className="space-y-2 pt-2 border-t">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase">Metadados Técnicos</p>
                                    <pre className="max-w-full whitespace-pre-wrap break-words rounded-lg border bg-slate-900 p-4 text-xs text-slate-50">
                                        {(() => {
                                            try {
                                                return JSON.stringify(JSON.parse(selectedLog.metadata), null, 2);
                                            } catch (e) { return selectedLog.metadata; }
                                        })()}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="border-t bg-background px-6 py-4 sm:px-8">
                        <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Fechar</Button>
                        <Button className="gap-2" onClick={() => {
                            if (selectedLog) {
                                const content = [
                                    `# Registro de Auditoria: ${selectedLog.id}`,
                                    `Data: ${formatDateSafe(selectedLog.timestamp)}`,
                                    `Usuário: ${selectedLog.userName || selectedLog.userId}`,
                                    `Ação: ${actionTranslation[selectedLog.action] || selectedLog.action}`,
                                    `Entidade: ${entityTranslation[selectedLog.entity] || selectedLog.entity}`,
                                    `---`,
                                    `## Descrição da Operação`,
                                    selectedLog.details
                                ];
                                import('@/bibliotecas/pdf').then(({ generateGenericReportPDF }) => {
                                    generateGenericReportPDF(`Operacao_${selectedLog.id}`, content, companySettings, user?.name);
                                });
                            }
                        }}>
                            <Download className="h-4 w-4" />
                            Baixar Detalhes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Clear Logs Warning Modal */}
            <AlertDialog open={isClearModalOpen} onOpenChange={setIsClearModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-red-600 flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            Atenção: Limpeza de Histórico
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-700">
                            Esta ação irá <strong>apagar permanentemente</strong> todos os logs de auditoria do sistema.
                            <br /><br />
                            Isso inclui o histórico de acessos, criações, edições e exclusões realizadas por todos os usuários.
                            Esta ação é irreversível e geralmente só deve ser executada para manutenção de banco de dados ou por ordem superior.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700"
                            onClick={(e) => {
                                e.preventDefault();
                                setIsConfirmClearOpen(true);
                            }}
                        >
                            Compreendo e Quero Continuar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Final Confirmation Modal */}
            <AlertDialog open={isConfirmClearOpen} onOpenChange={setIsConfirmClearOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmação Final</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza absoluta que deseja eliminar todo o histórico de auditoria?
                            <br />
                            Uma entrada de log será criada indicando que você realizou esta ação.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setIsClearModalOpen(false)}>Cancelar Tudo</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700 font-bold"
                            onClick={handleClearLogs}
                        >
                            Sim, Eliminar Histórico
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </MainLayout>
    );
}
