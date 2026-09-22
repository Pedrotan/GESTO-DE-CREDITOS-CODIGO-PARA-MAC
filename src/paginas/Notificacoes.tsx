import { useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { formatDate, formatDateTime } from '@/bibliotecas/formatters';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/componentes/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/componentes/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Bell, Check, Info, AlertTriangle, AlertCircle, CheckCircle2, Filter, Eye, Download, Trash2, Search, X } from 'lucide-react';
import { generateNotificationPDF, generateNotificationsReportPDF } from '@/bibliotecas/pdf';
import { useToast } from '@/componentes/ui/use-toast';
import { Notification } from '@/tipos/credito';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/componentes/ui/table';
import { Input } from '@/componentes/ui/input';
import { AlertModal, AlertModalType } from '@/componentes/ui/AlertModal';

const typeConfig = {
    info: { icon: Info, color: 'text-info', bg: 'bg-info/10' },
    warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
    error: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
    success: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
};

export default function Notifications() {
    const { user } = useAuth();
    const { notifications, markNotificationAsRead, markAllAsRead, deleteNotification, clearNotifications, clients, companySettings } = useData();
    const [clientFilter, setClientFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const { toast } = useToast();

    // Estado da Modal de Alerta (Sucesso/Erro/Confirmação)
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
        type: 'success',
        showCancel: false,
        actionLabel: 'OK',
        variant: 'default'
    });

    const handleConfirmClear = () => {
        setAlertConfig({
            isOpen: true,
            title: "Limpar Notificações?",
            description: "Tem a certeza que deseja limpar todas as notificações de sistema? Esta ação não pode ser desfeita.",
            type: "warning",
            showCancel: true,
            actionLabel: "Limpar Tudo",
            variant: 'destructive',
            onConfirm: async () => {
                await clearNotifications('system');
                setAlertConfig({
                    isOpen: true,
                    title: "Limpeza Concluída",
                    description: "Todas as notificações de sistema foram eliminadas.",
                    type: "success",
                    showCancel: false,
                    actionLabel: "OK"
                });
            }
        });
    };

    const handleConfirmDelete = (id: string) => {
        setAlertConfig({
            isOpen: true,
            title: "Eliminar Notificação?",
            description: "Deseja remover esta notificação permanentemente?",
            type: "warning",
            showCancel: true,
            actionLabel: "Eliminar",
            variant: 'destructive',
            onConfirm: async () => {
                await deleteNotification(id);
                setAlertConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const filteredNotifications = notifications
        .filter(n => n.source !== 'chat') // Apenas notificações de sistema
        .filter(n => {
            const matchesClient = clientFilter === 'all' || n.title.includes(clientFilter) || n.message.includes(clientFilter);
            const matchesSearch = searchTerm === '' ||
                n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                n.message.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesClient && matchesSearch;
        });

    const unreadCount = filteredNotifications.filter((n) => !n.read).length;

    // Calcular estatísticas
    const totalNotifications = notifications.length;
    const warningCount = notifications.filter(n => n.type === 'warning' || n.type === 'error').length;
    const successCount = notifications.filter(n => n.type === 'success' || n.type === 'info').length;

    // Obter clientes únicos para o filtro
    const clientNames = clients.map(client => client.name);

    // Pagination Logic
    const totalPages = Math.ceil(filteredNotifications.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedNotifications = filteredNotifications.slice(startIndex, startIndex + itemsPerPage);

    return (
        <MainLayout title="Notificações" subtitle="Centro de alertas e mensagens">
            {/* Stats Cards Estilo Pastel Arredondado */}
            <div className="mb-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                {/* 1. Total de Alertas (Azul Céu #82C9FF) */}
                <div className="card-kpi-sky">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <Bell className="h-5 w-5" />
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                Total de Alertas
                            </p>
                        </div>
                    </div>

                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {totalNotifications}
                        </p>
                    </div>

                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Histórico completo de avisos
                    </p>
                </div>

                {/* 2. Não Lidas (Púrpura / Lavanda #E99EFE) */}
                <div className="card-kpi-purple">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <Info className="h-5 w-5" />
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                Não Lidas
                            </p>
                        </div>
                    </div>

                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {unreadCount}
                        </p>
                    </div>

                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Requerem visualização
                    </p>
                </div>

                {/* 3. Avisos e Erros (Coral / Rosa #FDA4AF) */}
                <div className="card-kpi-coral">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                Avisos e Erros
                            </p>
                        </div>
                    </div>

                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {warningCount}
                        </p>
                    </div>

                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Alertas críticos e pendências
                    </p>
                </div>

                {/* 4. Sucesso e Info (Verde Menta #86EFAC) */}
                <div className="card-kpi-mint">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <CheckCircle2 className="h-5 w-5" />
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                Sucesso e Info
                            </p>
                        </div>
                    </div>

                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {successCount}
                        </p>
                    </div>

                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Operações concluídas com êxito
                    </p>
                </div>
            </div>

            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 items-center gap-4">
                    <div className="relative w-full lg:w-80">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Pesquisar notificações..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <div className="w-[200px]">
                        <Select value={clientFilter} onValueChange={setClientFilter}>
                            <SelectTrigger>
                                <Filter className="mr-2 h-4 w-4" />
                                <SelectValue placeholder="Filtrar Cliente" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos os Clientes</SelectItem>
                                {clients.map((c) => (
                                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={async () => await markAllAsRead()}
                        disabled={unreadCount === 0}
                    >
                        <Check className="h-4 w-4" />
                        Lidas
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        className="gap-2"
                        onClick={handleConfirmClear}
                        disabled={filteredNotifications.length === 0}
                    >
                        <Trash2 className="h-4 w-4" />
                        Limpar Tudo
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 border-primary/20 text-primary hover:bg-primary/5"
                        onClick={() => {
                            generateNotificationsReportPDF(filteredNotifications, companySettings, user?.name);
                            toast({ title: "Relatório Baixado", description: "O PDF com as notificações filtradas foi gerado." });
                        }}
                        disabled={filteredNotifications.length === 0}
                    >
                        <Download className="h-4 w-4" />
                        Baixar Relatório (PDF)
                    </Button>
                </div>
            </div>

            <div className="card-elevated overflow-hidden flex flex-col">
                <div className="flex-1">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead className="w-10"></TableHead>
                                <TableHead>Título</TableHead>
                                <TableHead>Mensagem</TableHead>
                                <TableHead>Data</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedNotifications.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center">
                                            <Bell className="mb-4 h-12 w-12 opacity-20" />
                                            <p>Não há notificações que correspondam aos filtros</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedNotifications.map((notification) => {
                                    const config = typeConfig[notification.type as keyof typeof typeConfig] || typeConfig.info;
                                    const Icon = config.icon;

                                    return (
                                        <TableRow
                                            key={notification.id}
                                            className={!notification.read ? 'bg-primary/5 border-l-2 border-l-primary' : ''}
                                        >
                                            <TableCell>
                                                <div className={`${config.color}`}>
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {notification.title}
                                            </TableCell>
                                            <TableCell className="max-w-[400px] truncate">
                                                {notification.message}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                                {formatDateTime(notification.timestamp)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => setSelectedNotification(notification)}
                                                        title="Ver Detalhes"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    {!notification.read && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-primary"
                                                            onClick={async () => await markNotificationAsRead(notification.id)}
                                                            title="Lida"
                                                        >
                                                            <Check className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                                        onClick={() => handleConfirmDelete(notification.id)}
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination Controls */}
                {filteredNotifications.length > itemsPerPage && (
                    <div className="p-4 border-t flex items-center justify-between bg-muted/20">
                        <div className="text-sm text-muted-foreground">
                            Mostrando {startIndex + 1} a {Math.min(startIndex + itemsPerPage, filteredNotifications.length)} de {filteredNotifications.length} resultados
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                Anterior
                            </Button>
                            <div className="text-sm font-medium">
                                Página {currentPage} de {totalPages}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                            >
                                Próxima
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <Dialog open={!!selectedNotification} onOpenChange={(open) => !open && setSelectedNotification(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Detalhes da Notificação</DialogTitle>
                        <DialogDescription>
                            Recebida em {selectedNotification && formatDateTime(selectedNotification.timestamp)}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedNotification && (
                        <div className="space-y-4">
                            <div className="p-4 rounded-lg bg-muted/30 border">
                                <h4 className="font-semibold text-foreground mb-1">{selectedNotification.title}</h4>
                                <Badge variant={(typeConfig[selectedNotification.type as keyof typeof typeConfig] || typeConfig.info).color.replace('text-', '') as any} className="mb-3">
                                    {selectedNotification.type === 'warning' ? 'AVISO' :
                                        selectedNotification.type === 'error' ? 'ERRO' :
                                            selectedNotification.type === 'success' ? 'SUCESSO' :
                                                selectedNotification.type === 'info' ? 'INFORMAÇÃO' :
                                                    String(selectedNotification.type || '').toUpperCase()}
                                </Badge>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    {selectedNotification.message}
                                </p>
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setSelectedNotification(null)}>
                                    Fechar
                                </Button>
                                <Button
                                    onClick={() => {
                                        generateNotificationPDF(selectedNotification, companySettings, user?.name);
                                        toast({ title: "Relatório Baixado", description: "O PDF da notificação foi gerado." });
                                    }}
                                    className="gap-2"
                                >
                                    <Download className="h-4 w-4" />
                                    Baixar Relatório
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
                onConfirm={alertConfig.onConfirm}
                title={alertConfig.title}
                description={alertConfig.description}
                type={alertConfig.type}
                showCancel={alertConfig.showCancel}
                actionLabel={alertConfig.actionLabel}
                variant={alertConfig.variant}
            />
        </MainLayout >
    );
}




