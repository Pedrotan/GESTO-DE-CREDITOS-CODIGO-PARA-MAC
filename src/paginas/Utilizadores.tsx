import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { cn, getFileUrl } from '@/bibliotecas/utils';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { ROLES, User, Role, AVAILABLE_PERMISSIONS } from '@/tipos/autenticacao';
import { Button } from '@/componentes/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/componentes/ui/table';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/componentes/ui/dialog';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/componentes/ui/select';
import { Badge } from '@/componentes/ui/badge';
import { Checkbox } from '@/componentes/ui/checkbox';
import { Trash2, UserPlus, ShieldAlert, KeyRound, Lock, Download, Upload, FileText, Bell, Eye, EyeOff, ShieldCheck, ShieldX, Users as UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { generateExcelTemplate, parseExcelFile } from '@/bibliotecas/ExcelHelper';
import { AlertModal } from '@/componentes/ui/AlertModal';
import { generateUserProfilePDF, generateGenericReportPDF, generateNotificationsReportPDF } from '@/bibliotecas/pdf';
import { PasswordStrengthIndicator } from '@/componentes/ui/PasswordStrengthIndicator';
import { validatePasswordStrength } from '@/bibliotecas/password-validator';

interface PasswordResetRequest {
    id: string;
    userId: string;
    userName: string;
    email: string;
    timestamp: string;
}

export default function Users() {
    const { users, addUser, deleteUser, user: currentUser, getResetRequests, handleResetRequest, updateUser } = useAuth();
    const { addLog, notifications, companySettings } = useData();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [resetRequests, setResetRequests] = useState<PasswordResetRequest[]>([]);
    const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<PasswordResetRequest | null | { id: string; userId: string; userName: string }>(null);
    const [newPassword, setNewPassword] = useState('Mudar@123');
    const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
    const [createdUserInfo, setCreatedUserInfo] = useState<Partial<User> | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        username: '',
        password: '',
        role: 'manager' as Role,
        permissions: [] as string[]
    });
    const [showPassword, setShowPassword] = useState(false);

    // Estado para o novo Modal de Sucesso Premium Unificado
    const [alertModal, setAlertModal] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        type: 'success_premium' | 'success' | 'warning' | 'error';
        onConfirm?: () => void;
        showCancel?: boolean;
        actionLabel?: string;
        cancelLabel?: string;
    }>({
        isOpen: false,
        title: '',
        description: '',
        type: 'success_premium'
    });

    // Estado da Modal de Permissões
    const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false);
    const [selectedUserForPermissions, setSelectedUserForPermissions] = useState<User | null>(null);
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

    const handleDownloadAllUsersPDF = () => {
        const content = [
            '# RELATÓRIO GERAL DE UTILIZADORES',
            `Data de Emissão: ${new Date().toLocaleString()}`,
            '---',
            ...(users || []).map(u => `## ${u.name || 'Utilizador'}\n- **Email:** ${u.email || 'N/A'}\n- **Cargo:** ${ROLES[u.role]?.label || u.role || 'Colaborador'}\n- **IP:** ${u.ip || 'N/A'}\n- **Status:** ${u.status === 'active' ? 'Ativo' : u.status === 'blocked' ? 'Bloqueado' : 'Offline'}\n- **Permissões:** ${(u.permissions || []).map(pId => AVAILABLE_PERMISSIONS.find(ap => ap.id === pId)?.label || pId).join(', ') || 'Nenhuma'}\n`)
        ];
        generateGenericReportPDF('Relatório Geral de Usuários', content, null, currentUser?.name);
        setAlertModal({
            isOpen: true,
            title: 'Relatório Gerado',
            description: 'Relatório geral de usuários gerado com sucesso.',
            type: 'success_premium'
        });
    };

    const loadRequests = useCallback(async () => {
        try {
            const reqs = await getResetRequests();
            setResetRequests(reqs || []);
        } catch (e) {
            setResetRequests([]);
        }
    }, [getResetRequests]);

    useEffect(() => {
        loadRequests();
    }, [loadRequests]);

    const filteredUsersList = (users || []).filter(u => {
        if (!u) return false;
        if (currentUser?.role === 'super_admin') return true;
        if (currentUser?.role === 'admin') return u.role === 'manager' || u.id === currentUser.id;
        return u.id === currentUser?.id;
    });

    const totalUsers = filteredUsersList.length;
    const superAdmins = filteredUsersList.filter(u => u.role === 'super_admin').length;
    const managers = filteredUsersList.filter(u => u.role === 'manager').length;
    const admins = filteredUsersList.filter(u => u.role === 'admin').length;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Validate password strength
            const passwordToUse = formData.password || 'Mudar@123';
            const passwordStrength = validatePasswordStrength(passwordToUse);

            if (formData.password && passwordStrength.score < 60) {
                setAlertModal({
                    isOpen: true,
                    title: 'Senha Fraca',
                    description: 'A senha deve ter pelo menos 8 caracteres, incluindo maiúsculas, minúsculas, números e caracteres especiais.',
                    type: 'warning'
                });
                return;
            }

            const newUser = {
                name: formData.name,
                email: formData.email,
                username: formData.username || undefined,
                password: passwordToUse,
                role: formData.role,
                avatar: formData.name.substring(0, 2).toUpperCase(),
                permissions: formData.permissions
            };
            await addUser(newUser);
            await addLog('create', 'user', `Criou novo utilizador: ${newUser.name} (${newUser.role})`, currentUser?.id, currentUser?.name);
            setCreatedUserInfo(newUser);
            setIsDialogOpen(false);
            setFormData({ name: '', email: '', username: '', password: '', role: 'manager', permissions: [] });
            setIsSuccessDialogOpen(true);
        } catch (error) {
            setAlertModal({
                isOpen: true,
                title: 'Erro de Registo',
                description: 'Não foi possível adicionar o novo usuário. Verifique se o e-mail já existe ou tente novamente.',
                type: 'error'
            });
        }
    };

    const handleOpenPermissions = (user: User) => {
        setSelectedUserForPermissions(user);
        setSelectedPermissions(user.permissions || []);
        setIsPermissionsDialogOpen(true);
    };

    const handleSavePermissions = async () => {
        if (!selectedUserForPermissions) return;

        const performUpdate = async () => {
            try {
                await updateUser(selectedUserForPermissions.id, { permissions: selectedPermissions });
                await addLog('update', 'user', `Atualizou permissões de ${selectedUserForPermissions.name}`, currentUser?.id, currentUser?.name);
                setAlertModal({
                    isOpen: true,
                    title: 'Permissões Atualizadas',
                    description: `Os privilégios de ${selectedUserForPermissions.name} foram sincronizados com sucesso.`,
                    type: 'success_premium'
                });
                setIsPermissionsDialogOpen(false);
            } catch (error) {
                setAlertModal({
                    isOpen: true,
                    title: 'Falha na Operação',
                    description: 'Ocorreu um erro técnico ao tentar atualizar as permissões do usuário.',
                    type: 'error'
                });
            }
        };

        // Alerta se estivermos a aumentar permissões
        const currentCount = selectedUserForPermissions.permissions?.length || 0;
        const newCount = selectedPermissions.length;

        if (newCount > currentCount) {
            setAlertModal({
                isOpen: true,
                title: 'Aumentar Nível de Acesso?',
                description: `Está prestes a conceder privilégios adicionais a ${selectedUserForPermissions.name}. Confirma esta alteração de segurança?`,
                type: 'warning',
                showCancel: true,
                actionLabel: 'Atribuir Permissões',
                cancelLabel: 'Cancelar',
                onConfirm: performUpdate
            });
        } else {
            await performUpdate();
        }
    };

    const togglePermission = (permissionId: string) => {
        setSelectedPermissions(prev =>
            prev.includes(permissionId)
                ? prev.filter(p => p !== permissionId)
                : [...prev, permissionId]
        );
    };

    const handleDownloadTemplate = () => {
        generateExcelTemplate(
            ['Nome', 'Email', 'Função (manager, admin, super_admin)'],
            'Modelo_Importação_Usuários'
        );
        setAlertModal({
            isOpen: true,
            title: 'Modelo Descarregado',
            description: 'O ficheiro Excel de modelo para importação foi gerado com sucesso.',
            type: 'success_premium'
        });
    };

    const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const data = await parseExcelFile(file);
            let importedCount = 0;
            let errorCount = 0;

            for (const row of data) {
                try {
                    if (!row['Nome'] || !row['Email']) continue;

                    // Verificar se existe
                    const exists = users.some(u => u.email === row['Email']);
                    if (exists) {
                        errorCount++;
                        continue;
                    }

                    // Validar Cargo
                    let role: Role = 'manager';
                    const importedRole = row['Função (manager, admin, super_admin)']?.toLowerCase();
                    if (importedRole && ['manager', 'admin', 'super_admin'].includes(importedRole)) {
                        role = importedRole as Role;
                    }

                    await addUser({
                        name: row['Nome'],
                        email: row['Email'],
                        password: 'Mudar@123',
                        role: role,
                        avatar: row['Nome'].substring(0, 2).toUpperCase(),
                        permissions: []
                    });
                    await addLog('create', 'user', `Importou utilizador via Excel: ${row['Nome']} (${role})`, currentUser?.id, currentUser?.name);
                    importedCount++;
                } catch (e) {
                    errorCount++;
                }
            }

            if (importedCount > 0) {
                setAlertModal({
                    isOpen: true,
                    title: 'Importação Concluída',
                    description: `${importedCount} usuários importados com sucesso. ${errorCount} duplicados ou ignorados.`,
                    type: 'success_premium'
                });
            } else {
                setAlertModal({
                    isOpen: true,
                    title: 'Nenhum Usuário Importado',
                    description: `Todos os registos no ficheiro já existiam ou são inválidos. (${errorCount} ignorados)`,
                    type: 'warning'
                });
            }

        } catch (error) {
            setAlertModal({
                isOpen: true,
                title: 'Erro de Leitura',
                description: 'O ficheiro Excel fornecido é inválido ou está corrompido.',
                type: 'error'
            });
        }

        // Limpar input
        e.target.value = '';
    };

    // Verificação de proteção
    if (currentUser?.role !== 'super_admin' && currentUser?.role !== 'admin') {
        return (
            <MainLayout title="Acesso Negado" subtitle="Sem permissão">
                <div className="flex flex-col items-center justify-center h-[50vh] gap-4 text-destructive">
                    <ShieldAlert className="h-16 w-16" />
                    <h2 className="text-2xl font-bold">Acesso Restrito</h2>
                    <p className="text-muted-foreground">
                        Apenas Super Administradores podem acessar esta página.
                    </p>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout title="Gestão de Usuários" subtitle="Controle de acesso e permissões">
            {/* Stats Cards com Estilo e Paleta Idênticos aos Cards da Tela de Login */}
            <div className="mb-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                {/* 1. Total de Utilizadores (Azul Primário #2563eb / Login Style) */}
                <div className="card-kpi-sky">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <UsersIcon className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                                    Total de Contas
                                </p>
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                                    Utilizadores
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {totalUsers}
                        </p>
                    </div>

                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Contas registadas no sistema
                    </p>
                </div>

                {/* 2. Super Administradores (Índigo / Azul Escuro Login Style) */}
                <div className="card-kpi-purple">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <ShieldAlert className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                                    Nível Máximo
                                </p>
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                                    Super Admins
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {superAdmins}
                        </p>
                    </div>

                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Acesso total e configurações
                    </p>
                </div>

                {/* 3. Gerentes de Crédito (Âmbar / Dourado Login Style) */}
                <div className="card-kpi-amber">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                                    Operação
                                </p>
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                                    Gestores Crédito
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {managers}
                        </p>
                    </div>

                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Supervisão e aprovações
                    </p>
                </div>

                {/* 4. Administradores (Esmeralda / Menta Login Style) */}
                <div className="card-kpi-mint">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <UsersIcon className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                                    Gestão
                                </p>
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                                    Administradores
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {admins}
                        </p>
                    </div>

                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Operadores e analistas ativos
                    </p>
                </div>
            </div>

            <div className="mb-6 flex justify-end gap-3">
                <Button
                    variant="outline"
                    className="h-11 px-5 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold shadow-sm transition-all hover:scale-[1.01] gap-2"
                    onClick={handleDownloadAllUsersPDF}
                >
                    <FileText className="h-4 w-4 text-slate-500" />
                    Relatório Geral (PDF)
                </Button>
                <Button
                    onClick={() => setIsDialogOpen(true)}
                    className="h-11 px-6 rounded-xl bg-gradient-to-r from-blue-600 via-[#2563eb] to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] gap-2"
                >
                    <UserPlus className="h-4 w-4" />
                    Novo Usuário
                </Button>
            </div>

            {resetRequests.length > 0 && (
                <div className="mb-8 animate-fade-in">
                    <div className="flex items-center gap-2 mb-4">
                        <Badge variant="destructive" className="animate-pulse">Pendentes</Badge>
                        <h3 className="text-lg font-bold">Solicitações de Redefinição de Senha</h3>
                    </div>
                    <div className="card-elevated border-danger/20 overflow-hidden bg-danger/5">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Usuário</TableHead>
                                    <TableHead>Email Informado</TableHead>
                                    <TableHead>Data/Hora</TableHead>
                                    <TableHead className="text-right">Ação</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {resetRequests.map((req) => (
                                    <TableRow key={req.id}>
                                        <TableCell className="font-bold">{req.userName}</TableCell>
                                        <TableCell>{req.email}</TableCell>
                                        <TableCell>
                                            {new Date(req.timestamp).toLocaleString('pt-AO')}
                                        </TableCell>
                                        <TableCell className="text-right flex justify-end gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleResetRequest(req.id, undefined, 'cancel').then(loadRequests)}
                                            >
                                                Ignorar
                                            </Button>
                                            <Button
                                                size="sm"
                                                className="bg-danger hover:bg-danger/90"
                                                onClick={() => {
                                                    setSelectedRequest(req);
                                                    setIsResetDialogOpen(true);
                                                }}
                                            >
                                                Redefinir Agora
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            <div className="card-elevated overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/70 dark:bg-slate-800/40">
                        <TableRow>
                            <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">Nome</TableHead>
                            <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">Email</TableHead>
                            <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">Função</TableHead>
                            <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">Permissões</TableHead>
                            <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">Último Acesso</TableHead>
                            <TableHead className="w-32 text-right font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredUsersList.map((u) => (
                            <TableRow key={u.id}>
                                <TableCell className="font-medium">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-white overflow-hidden shadow-sm">
                                            {u.avatar ? (
                                                <img
                                                    src={getFileUrl(u.avatar)}
                                                    alt={u.name}
                                                    className="h-full w-full object-cover"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            ) : (
                                                <span>{(u.name || 'US').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
                                            )}
                                        </div>
                                        <span className="truncate font-semibold text-slate-900 dark:text-white">{u.name}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-slate-600 dark:text-slate-300 font-medium">{u.email}</TableCell>
                                <TableCell>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <Badge variant={u.role === 'super_admin' ? 'destructive' : 'secondary'} className="w-fit font-bold rounded-lg px-2.5 py-0.5">
                                                {ROLES[u.role]?.label || u.role || 'Utilizador'}
                                            </Badge>
                                            {(() => {
                                                const isOnline = u.status === 'active' && u.lastSeen && (new Date().getTime() - new Date(u.lastSeen).getTime() < 3 * 60 * 1000);
                                                return isOnline ? (
                                                    <div className="flex items-center gap-1.5 bg-success/10 px-2 py-0.5 rounded-full" title="Online Agora">
                                                        <span className="relative flex h-2 w-2">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                                                        </span>
                                                        <span className="text-[10px] font-bold text-success uppercase">Online</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 bg-muted/30 px-2 py-0.5 rounded-full opacity-60">
                                                        <span className="h-2 w-2 rounded-full bg-muted-foreground"></span>
                                                        <span className="text-[10px] font-medium text-muted-foreground uppercase">Offline</span>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        {u.status === 'blocked' && (
                                            <Badge variant="outline" className="text-destructive border-destructive w-fit text-[10px]">
                                                Bloqueado
                                            </Badge>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1 max-w-[280px]">
                                        {(u.role === 'super_admin' ? AVAILABLE_PERMISSIONS.map(p => p.id) : (u.permissions || [])).length > 0 ? (
                                            (u.role === 'super_admin' ? AVAILABLE_PERMISSIONS.map(p => p.id) : (u.permissions || [])).map(pId => {
                                                const perm = AVAILABLE_PERMISSIONS.find(ap => ap.id === pId);
                                                return perm ? (
                                                    <Badge key={pId} variant="outline" className="text-[10px] py-0 px-1 border-primary/20 text-primary bg-primary/5">
                                                        {perm.label}
                                                    </Badge>
                                                ) : null;
                                            })
                                        ) : (
                                            <span className="text-[10px] text-muted-foreground italic">Sem permissões específicas</span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {u.lastLogin ? new Date(u.lastLogin).toLocaleString('pt-AO') : 'Nunca'}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                        {currentUser?.role === 'super_admin' && u.role !== 'super_admin' && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                                title="Gerir Permissões"
                                                onClick={() => handleOpenPermissions(u)}
                                            >
                                                <Lock className="h-4 w-4" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                            title="Baixar Ficha PDF"
                                            onClick={() => {
                                                generateUserProfilePDF(u, null, currentUser?.name);
                                                setAlertModal({
                                                    isOpen: true,
                                                    title: 'Ficha Gerada',
                                                    description: `Ficha de ${u.name} gerada com sucesso.`,
                                                    type: 'success_premium'
                                                });
                                            }}
                                        >
                                            <FileText className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                            title="Baixar Notificações"
                                            onClick={() => {
                                                const userNotifications = (notifications || []).filter(n => n.userId === u.id || (n.source !== 'chat' && (n.title.toLowerCase().includes(u.name.toLowerCase()) || n.message.toLowerCase().includes(u.name.toLowerCase()))));
                                                generateNotificationsReportPDF(userNotifications, companySettings, currentUser?.name, `RELATÓRIO DE NOTIFICAÇÕES - ${u.name}`);
                                                setAlertModal({
                                                    isOpen: true,
                                                    title: 'Relatório Gerado',
                                                    description: `O histórico de notificações de ${u.name} foi gerado com sucesso.`,
                                                    type: 'success_premium'
                                                });
                                            }}
                                        >
                                            <Bell className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-orange-500 hover:text-orange-500 hover:bg-orange-500/10"
                                            title="Redefinir Senha"
                                            onClick={() => {
                                                setSelectedRequest({ id: 'manual', userId: u.id, userName: u.name });
                                                setIsResetDialogOpen(true);
                                            }}
                                        >
                                            <KeyRound className="h-4 w-4" />
                                        </Button>

                                        {/* Botão de Desativar 2FA (Recuperação) */}
                                        {currentUser?.role === 'super_admin' && u.id !== currentUser?.id && u.twoFactorEnabled && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                title="Desativar 2FA (Recuperação)"
                                                onClick={async () => {
                                                    setAlertModal({
                                                        isOpen: true,
                                                        title: "Desativar 2FA?",
                                                        description: `Tem a certeza que deseja desativar a proteção 2FA de ${u.name}? Esta ação deve ser realizada apenas em caso de perda de acesso do utilizador.`,
                                                        type: "warning",
                                                        showCancel: true,
                                                        onConfirm: async () => {
                                                            try {
                                                                await updateUser(u.id, {
                                                                    twoFactorEnabled: false,
                                                                    twoFactorSecret: undefined
                                                                });
                                                                addLog('update', 'user', `Desativou 2FA de ${u.name} (Modo Recuperação)`, currentUser?.id, currentUser?.name);
                                                                setAlertModal({
                                                                    isOpen: true,
                                                                    title: "2FA Desativado",
                                                                    description: `A proteção de dois fatores de ${u.name} foi removida com sucesso.`,
                                                                    type: "success_premium"
                                                                });
                                                            } catch (err: any) {
                                                                toast.error("Erro ao desativar 2FA: " + err.message);
                                                            }
                                                        }
                                                    });
                                                }}
                                            >
                                                <ShieldX className="h-4 w-4" />
                                            </Button>
                                        )}

                                        {/* Block/Unblock Button */}
                                        {u.id !== currentUser?.id && u.role !== 'super_admin' && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className={`h-8 w-8 ${u.status === 'blocked' ? 'text-success hover:text-success' : 'text-danger hover:text-danger'} hover:bg-muted`}
                                                title={u.status === 'blocked' ? "Desbloquear" : "Bloquear Acesso"}
                                                onClick={async () => {
                                                    const newStatus = u.status === 'blocked' ? 'active' : 'blocked';
                                                    await updateUser(u.id, { status: newStatus });
                                                    await addLog('update', 'user', `${newStatus === 'blocked' ? 'Bloqueou' : 'Desbloqueou'} acesso de ${u.name}`, currentUser?.id, currentUser?.name);
                                                    setAlertModal({
                                                        isOpen: true,
                                                        title: newStatus === 'blocked' ? 'Utilizador Bloqueado' : 'Utilizador Desbloqueado',
                                                        description: `A conta de ${u.name} agora está ${newStatus === 'blocked' ? 'bloqueada' : 'ativa'} no sistema.`,
                                                        type: newStatus === 'active' ? 'success_premium' : 'warning'
                                                    });
                                                }}
                                            >
                                                {u.status === 'blocked' ? <ShieldAlert className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4 opacity-50" />}
                                            </Button>
                                        )}

                                        {u.id !== currentUser?.id && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={async () => {
                                                    await deleteUser(u.id);
                                                    await addLog('delete', 'user', `Eliminou utilizador: ${u.name}`, currentUser?.id, currentUser?.name);
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Adicionar Novo Usuário</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Nome</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="username">Nome de Utilizador (Opcional)</Label>
                            <Input
                                id="username"
                                type="text"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                placeholder="admin, gestor, etc."
                            />
                            <p className="text-xs text-muted-foreground">Pode ser usado para login em vez do email</p>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="password">Palavra-passe Inicial</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    placeholder="Padrão: Mudar@123"
                                    className="pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                    )}
                                </Button>
                            </div>
                            <PasswordStrengthIndicator password={formData.password} showRequirements={true} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="role">Função</Label>
                            <Select
                                value={formData.role}
                                onValueChange={(v: Role) => setFormData({ ...formData, role: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(ROLES) as Role[])
                                        .filter(role => {
                                            if (currentUser?.role === 'super_admin') return true;
                                            if (currentUser?.role === 'admin') return role === 'manager';
                                            return false;
                                        })
                                        .map((role) => (
                                            <SelectItem key={role} value={role}>
                                                {ROLES[role].label}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit">Adicionar</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Redefinir Senha de Usuário</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                            <p className="text-sm font-medium">Usuário: <span className="font-bold">{selectedRequest?.userName}</span></p>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="new-password">Nova Palavra-passe</Label>
                            <Input
                                id="new-password"
                                type="text"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                            <p className="text-[10px] text-muted-foreground italic">
                                Informe esta nova senha ao usuário. Ele poderá alterá-la depois no perfil.
                            </p>
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                            <Button variant="outline" onClick={() => setIsResetDialogOpen(false)}>
                                Cancelar
                            </Button>
                            <Button
                                className="bg-danger hover:bg-danger/90"
                                onClick={async () => {
                                    if (selectedRequest?.id === 'manual') {
                                        await updateUser(selectedRequest.userId, { password: newPassword });
                                        await addLog('update', 'user', `Redefiniu palavra-passe de ${selectedRequest.userName} (Manual)`, currentUser?.id, currentUser?.name);
                                    } else {
                                        await handleResetRequest(selectedRequest.id, newPassword);
                                        await addLog('update', 'user', `Processou pedido de recuperação de senha para ${selectedRequest.userName}`, currentUser?.id, currentUser?.name);
                                    }
                                    setIsResetDialogOpen(false);
                                    loadRequests();
                                    setNewPassword('Mudar@123');
                                    setAlertModal({
                                        isOpen: true,
                                        title: 'Senha Redefinida',
                                        description: 'A nova palavra-passe foi aplicada com sucesso para este utilizador.',
                                        type: 'success_premium'
                                    });
                                }}
                            >
                                Confirmar Redefinição
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isPermissionsDialogOpen} onOpenChange={setIsPermissionsDialogOpen}>
                <DialogContent className="max-w-2xl p-0 overflow-hidden border-none shadow-2xl">
                    <DialogHeader className="p-6 bg-gradient-to-r from-primary/10 to-transparent">
                        <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
                                <Lock className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-bold">Gerir Permissões</DialogTitle>
                                <DialogDescription className="text-sm">
                                    Defina o nível de acesso detalhado para <span className="font-bold text-foreground">{selectedUserForPermissions?.name}</span>
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                        <div className="grid gap-4 sm:grid-cols-2">
                            {AVAILABLE_PERMISSIONS.map((permission) => {
                                const isChecked = selectedPermissions.includes(permission.id);
                                return (
                                    <div
                                        key={permission.id}
                                        className={cn(
                                            "relative flex flex-col gap-2 p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer group",
                                            isChecked
                                                ? "border-primary bg-primary/[0.03] shadow-md shadow-primary/5"
                                                : "border-border hover:border-primary/30 hover:bg-muted/30"
                                        )}
                                        onClick={() => togglePermission(permission.id)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className={cn(
                                                "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
                                                isChecked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                                            )}>
                                                {isChecked ? <ShieldAlert className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                                            </div>
                                            <Checkbox
                                                id={permission.id}
                                                checked={isChecked}
                                                onCheckedChange={() => togglePermission(permission.id)}
                                                className="h-5 w-5 rounded-full border-2"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label
                                                htmlFor={permission.id}
                                                className="text-sm font-bold leading-tight cursor-pointer"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {permission.label}
                                            </Label>
                                            <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                                                {permission.description}
                                            </p>
                                        </div>
                                        {isChecked && (
                                            <div className="absolute top-2 right-10">
                                                <Badge variant="primary" className="text-[9px] py-0 px-1 bg-primary/10 text-primary border-none">Ativo</Badge>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="p-6 bg-muted/30 flex justify-end gap-3 border-t">
                        <Button variant="outline" className="h-11 px-6 font-bold" onClick={() => setIsPermissionsDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button className="h-11 px-8 font-bold shadow-lg shadow-primary/20" onClick={handleSavePermissions}>
                            Salvar Alterações
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Registration Success Dialog */}
            <Dialog open={isSuccessDialogOpen} onOpenChange={setIsSuccessDialogOpen}>
                <DialogContent className="max-w-md text-center p-8 bg-gradient-to-b from-white to-emerald-50/50 border-emerald-100/50 overflow-hidden">
                    <div className="flex flex-col items-center gap-4 animate-in slide-in-from-bottom-5 duration-500">
                        <div className="relative h-24 w-24 flex items-center justify-center mb-2">
                            <div className="absolute inset-0 bg-success/10 rounded-full animate-ping duration-1000" />
                            <div className="h-20 w-20 rounded-full bg-gradient-to-tr from-success to-emerald-400 flex items-center justify-center shadow-lg shadow-success/20">
                                <UserPlus className="h-10 w-10 text-white" />
                            </div>
                        </div>
                        <DialogTitle className="text-2xl font-black text-success uppercase tracking-tight">Registo Concluído!</DialogTitle>
                        <DialogDescription className="text-base font-medium text-slate-600">
                            O colaborador <span className="font-bold text-slate-900 border-b-2 border-success/20 pb-0.5">{createdUserInfo?.name}</span> foi integrado no sistema.
                        </DialogDescription>

                        <div className="w-full bg-white/80 backdrop-blur-sm border border-success/20 p-5 rounded-2xl text-left space-y-3 my-2 shadow-sm animate-in fade-in slide-in-from-top-2 duration-700 delay-200">
                            <p className="text-[10px] font-black text-success uppercase tracking-widest flex items-center gap-2">
                                <span className="h-1 w-4 bg-success rounded-full" /> Credenciais de Acesso
                            </p>
                            <div className="space-y-1.5">
                                <p className="text-sm flex justify-between">
                                    <span className="text-muted-foreground">E-mail:</span>
                                    <span className="font-bold text-slate-800">{createdUserInfo?.email}</span>
                                </p>
                                <p className="text-sm flex justify-between">
                                    <span className="text-muted-foreground">Palavra-passe:</span>
                                    <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 rounded">{formData.password || 'Mudar@123'}</span>
                                </p>
                            </div>
                            <div className="pt-2 border-t border-emerald-100/50">
                                <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                                    * Recomenda-se a alteração da senha no primeiro acesso para garantir a segurança da conta.
                                </p>
                            </div>
                        </div>

                        <Button className="w-full mt-4 h-12 text-base font-bold bg-success hover:bg-success/90 shadow-xl shadow-success/20" onClick={() => setIsSuccessDialogOpen(false)}>
                            Concluir e Voltar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Modal de Alerta Premium Unificado */}
            <AlertModal
                isOpen={alertModal.isOpen}
                onClose={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
                title={alertModal.title}
                description={alertModal.description}
                type={alertModal.type as any}
                showCancel={alertModal.showCancel}
                actionLabel={alertModal.actionLabel}
                cancelLabel={alertModal.cancelLabel}
                onConfirm={alertModal.onConfirm}
            />
        </MainLayout>
    );
}
