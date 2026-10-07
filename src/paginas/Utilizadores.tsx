import { useState, useEffect, useCallback, useMemo } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { cn, getFileUrl } from '@/bibliotecas/utils';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { ROLES, User, Role } from '@/tipos/autenticacao';
import {
    PerfilAcesso, MODULOS_SISTEMA, ROTULOS_AREAS, DESCRICOES_ACOES,
    AcaoModulo, ExcecaoPermissao, ConfiguracaoAlcada, AmbitoDados,
    comporPermissao
} from '@/tipos/controlo-acesso';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import { Button } from '@/componentes/ui/button';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/componentes/ui/table';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/componentes/ui/dialog';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/componentes/ui/select';
import { Badge } from '@/componentes/ui/badge';
import { Checkbox } from '@/componentes/ui/checkbox';
import { Switch } from '@/componentes/ui/switch';
import {
    Trash2, UserPlus, ShieldAlert, KeyRound, Lock, Download, Upload,
    FileText, Bell, Eye, EyeOff, ShieldCheck, ShieldX, Users as UsersIcon,
    Search, Sliders, ChevronDown, ChevronRight, AlertTriangle, Clock,
    Building2, Shield, CheckCircle2, XCircle, ArrowRight, RefreshCw, Calendar
} from 'lucide-react';
import { toast } from '@/ganchos/usar-toast';
import { generateExcelTemplate, parseExcelFile } from '@/bibliotecas/ExcelHelper';
import { AlertModal } from '@/componentes/ui/AlertModal';
import { generateUserProfilePDF, generateGenericReportPDF, generateNotificationsReportPDF } from '@/bibliotecas/pdf';
import { PasswordStrengthIndicator } from '@/componentes/ui/PasswordStrengthIndicator';
import { validatePasswordStrength } from '@/bibliotecas/password-validator';
import { useNavigate } from 'react-router-dom';
import { MatrizPermissoes, LegendaPermissoes, type PermissionOrigin } from '@/componentes/permissoes/MatrizPermissoes';
import { criticalPermissions, describePermission, diffPermissions } from '@/bibliotecas/permissoes-analise';
import { validateJustification } from '@/bibliotecas/justificacao';
import { ServicoAuditoriaAvancada } from '@/servicos/ServicoAuditoriaAvancada';
import { formatAuditTimestamp, toAuditEvent, type AuditEvent } from '@/bibliotecas/auditoria-analise';
import { generateUsersPermissionsMatrixPDF } from '@/bibliotecas/matriz-permissoes-pdf';

interface PasswordResetRequest {
    id: string;
    userId: string;
    userName: string;
    email: string;
    timestamp: string;
}

type TabEditor = 'matriz' | 'efetivas' | 'alcadas' | 'dados' | 'seguranca' | 'temporarias' | 'historico';
type FiltroCard = 'todos' | 'ativos' | 'pendentes' | 'bloqueados' | 'sem_2fa' | 'temporarias';

export default function Utilizadores() {
    const { users, addUser, deleteUser, user: currentUser, getResetRequests, handleResetRequest, updateUser, reloadUsers } = useAuth();
    const { addLog, notifications, companySettings } = useData();
    const navigate = useNavigate();

    // Sincronização periódica em tempo real dos utilizadores e estados de ligação
    useEffect(() => {
        if (reloadUsers) {
            void reloadUsers();
            const interval = setInterval(() => {
                void reloadUsers();
            }, 25000);
            return () => clearInterval(interval);
        }
    }, [reloadUsers]);

    const perfis = useMemo(() => ServicoControloAcesso.obterPerfis(), []);

    // Estados de diálogo e filtros
    const [filtroCardAtivo, setFiltroCardAtivo] = useState<FiltroCard>('todos');
    const [pesquisa, setPesquisa] = useState('');
    const [filtroPerfil, setFiltroPerfil] = useState<string>('todos');
    const [filtroEstado, setFiltroEstado] = useState<string>('todos');

    // Dialogo Novo Utilizador
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        username: '',
        password: '',
        role: 'manager' as Role,
        dataScope: 'todos' as AmbitoDados,
        branchName: '',
        status: 'active' as 'active' | 'pending_activation'
    });
    const [showPassword, setShowPassword] = useState(false);

    // Dialogo Redefinir Senha
    const [resetRequests, setResetRequests] = useState<PasswordResetRequest[]>([]);
    const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<PasswordResetRequest | null | { id: string; userId: string; userName: string }>(null);
    const [newPassword, setNewPassword] = useState('Mudar@123');

    // Dialogo Sucesso Criação
    const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
    const [createdUserInfo, setCreatedUserInfo] = useState<Partial<User> | null>(null);

    // Modal de Alerta
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

    // ==============================================================
    // EDITOR LATERAL / MODAL LARGO DE PERMISSÕES E GOVERNAÇÃO
    // ==============================================================
    const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false);
    const [selectedUserForPermissions, setSelectedUserForPermissions] = useState<User | null>(null);
    const [tabAtivaEditor, setTabAtivaEditor] = useState<TabEditor>('matriz');

    // Estados editáveis do utilizador no editor
    const [perfilSelecionado, setPerfilSelecionado] = useState<Role>('manager');
    const [excecoesAtuais, setExcecoesAtuais] = useState<ExcecaoPermissao[]>([]);
    const [alcadasAtuais, setAlcadasAtuais] = useState<ConfiguracaoAlcada>({
        aprovacaoCreditoKz: 500_000,
        requerDuplaAprovacaoAcimaKz: 5_000_000,
        desembolsoKz: 500_000,
        perdaoJurosPct: 10,
        perdaoJurosKz: 50_000,
        anulacaoPagamentoKz: 0,
        abateCreditoKz: 0
    });
    const [ambitoDadosAtual, setAmbitoDadosAtual] = useState<AmbitoDados>('todos');
    const [agenciaAtual, setAgenciaAtual] = useState('');
    const [mascararSensiveisAtual, setMascararSensiveisAtual] = useState(true);
    const [podeExportarAtual, setPodeExportarAtual] = useState(true);
    const [exige2faAtual, setExige2faAtual] = useState(false);
    const [dataFimTemporaria, setDataFimTemporaria] = useState('');

    // Governação: Motivo obrigatório e aprovação dupla
    const [motivoAlteracao, setMotivoAlteracao] = useState('');
    const [precisaAprovacaoDupla, setPrecisaAprovacaoDupla] = useState(false);
    const [pesquisaMatriz, setPesquisaMatriz] = useState('');
    const [areasExpandidas, setAreasExpandidas] = useState<Record<string, boolean>>({
        comercial: true,
        credito: true,
        cobranca: true,
        financeiro: false,
        fiscal: false,
        relatorios: false,
        administracao: false
    });

    // Permissões originais do utilizador antes das alterações (para cálculo do Diff)
    const [permissoesOriginais, setPermissoesOriginais] = useState<string[]>([]);

    const loadRequests = useCallback(async () => {
        try {
            const reqs = await getResetRequests();
            setResetRequests(reqs || []);
        } catch {
            setResetRequests([]);
        }
    }, [getResetRequests]);

    useEffect(() => {
        loadRequests();
    }, [loadRequests]);

    // Cálculo das permissões efetivas em tempo real no editor
    const permissoesEfetivasEditor = useMemo(() => {
        return ServicoControloAcesso.calcularPermissoesEfetivas({
            role: perfilSelecionado,
            permissionExceptions: excecoesAtuais
        }, perfis);
    }, [perfilSelecionado, excecoesAtuais, perfis]);

    const [erroMotivo, setErroMotivo] = useState('');
    const [historicoGovernacao, setHistoricoGovernacao] = useState<AuditEvent[] | null>(null);
    const originaisSet = useMemo(() => new Set(permissoesOriginais), [permissoesOriginais]);
    const efetivasSet = useMemo(() => new Set(permissoesEfetivasEditor.permissoes), [permissoesEfetivasEditor.permissoes]);
    const origemPermissao = useCallback((id: string): PermissionOrigin | undefined => {
        const exc = excecoesAtuais.find(e => e.permissionId === id);
        return exc?.tipo === 'conceder' ? 'concedida' : exc?.tipo === 'retirar' ? 'revogada' : undefined;
    }, [excecoesAtuais]);
    // Histórico real de governação: alterações de perfil e permissões deste utilizador na auditoria.
    useEffect(() => {
        if (!isPermissionsDialogOpen || tabAtivaEditor !== 'historico' || !selectedUserForPermissions) return;
        setHistoricoGovernacao(null);
        ServicoAuditoriaAvancada.entityHistory(selectedUserForPermissions.id, [selectedUserForPermissions.name])
            .then(rows => setHistoricoGovernacao(rows.map(row => toAuditEvent(row)).filter(event => event.module === 'utilizadores' || event.action === 'permission_change' || event.module === 'seguranca')))
            .catch(() => setHistoricoGovernacao([]));
    }, [isPermissionsDialogOpen, tabAtivaEditor, selectedUserForPermissions]);
    // Resumo de diferenças em tempo real (Diff)
    const diffPermissoes = useMemo(() => {
        return ServicoControloAcesso.calcularDiffPermissoes(
            permissoesOriginais,
            permissoesEfetivasEditor.permissoes
        );
    }, [permissoesOriginais, permissoesEfetivasEditor.permissoes]);

    // Verificação de conflitos de segregação de funções no editor
    const conflitosDetetados = useMemo(() => {
        const perms = permissoesEfetivasEditor.permissoes;
        return [
            {
                id: 'credito_criar_aprovar',
                nome: 'Criar Crédito + Aprovar Crédito',
                conflito: perms.includes('creditos.criar') && perms.includes('creditos.aprovar')
            },
            {
                id: 'credito_aprovar_desembolsar',
                nome: 'Aprovar Crédito + Desembolsar Capital',
                conflito: perms.includes('creditos.aprovar') && perms.includes('creditos.desembolsar')
            },
            {
                id: 'pagamento_criar_anular',
                nome: 'Registar Pagamento + Anular Pagamento',
                conflito: perms.includes('pagamentos.criar') && perms.includes('pagamentos.anular_pagamento')
            },
            {
                id: 'contabilidade_criar_estornar',
                nome: 'Lançar Diário + Estornar Lançamento',
                conflito: perms.includes('contabilidade.criar') && perms.includes('contabilidade.estornar_lancamento')
            }
        ].filter(c => c.conflito);
    }, [permissoesEfetivasEditor.permissoes]);

    // Filtragem geral da lista de utilizadores
    const filteredUsersList = useMemo(() => {
        return (users || []).filter(u => {
            if (!u) return false;

            // Filtro por privilégio do utilizador atual
            if (currentUser?.role === 'admin' && u.role === 'super_admin') return false;

            // Filtro por Cards interativos
            if (filtroCardAtivo === 'ativos' && u.status !== 'active') return false;
            if (filtroCardAtivo === 'pendentes' && u.status !== 'pending_activation') return false;
            if (filtroCardAtivo === 'bloqueados' && u.status !== 'blocked') return false;
            if (filtroCardAtivo === 'sem_2fa' && u.twoFactorEnabled) return false;
            if (filtroCardAtivo === 'temporarias' && !u.temporaryRoleExpiry && !(u.permissionExceptions || []).some(e => e.dataExpiracao)) return false;

            // Filtro por Perfil
            if (filtroPerfil !== 'todos' && u.role !== filtroPerfil) return false;

            // Filtro por Estado
            if (filtroEstado !== 'todos' && u.status !== filtroEstado) return false;

            // Pesquisa de texto
            if (pesquisa.trim()) {
                const termo = pesquisa.toLowerCase();
                const matchNome = u.name?.toLowerCase().includes(termo);
                const matchEmail = u.email?.toLowerCase().includes(termo);
                const matchUsername = u.username?.toLowerCase().includes(termo);
                const matchRole = (ROLES[u.role]?.label || u.role).toLowerCase().includes(termo);
                if (!matchNome && !matchEmail && !matchUsername && !matchRole) return false;
            }

            return true;
        });
    }, [users, currentUser, filtroCardAtivo, filtroPerfil, filtroEstado, pesquisa]);

    // Contadores para os Cards Interativos
    const stats = useMemo(() => {
        const todos = users || [];
        return {
            total: todos.length,
            ativos: todos.filter(u => u.status === 'active').length,
            pendentes: todos.filter(u => u.status === 'pending_activation').length,
            bloqueados: todos.filter(u => u.status === 'blocked').length,
            sem2fa: todos.filter(u => !u.twoFactorEnabled).length,
            temporarias: todos.filter(u => u.temporaryRoleExpiry || (u.permissionExceptions || []).some(e => e.dataExpiracao)).length,
            superAdmins: todos.filter(u => u.role === 'super_admin').length,
            administradores: todos.filter(u => u.role === 'admin' || u.role === 'system_admin').length,
            gestores: todos.filter(u => u.role === 'manager' || u.role === 'credit_director').length
        };
    }, [users]);

    // Abrir Editor de Permissões
    const handleOpenPermissions = (u: User) => {
        // Regra de Governação: Ninguém pode alterar as suas próprias permissões nem o seu perfil
        if (currentUser?.id === u.id) {
            setAlertModal({
                isOpen: true,
                title: 'Operação Bloqueada',
                description: 'Por conformidade bancária e regras de auditoria, nenhum utilizador pode alterar as suas próprias permissões ou o seu próprio perfil. Esta ação deve ser efetuada por outro administrador.',
                type: 'warning'
            });
            return;
        }

        setSelectedUserForPermissions(u);
        setPerfilSelecionado(u.role || 'manager');
        setExcecoesAtuais(u.permissionExceptions || []);

        const perfilBase = perfis.find(p => p.id === u.role) || perfis[3];
        setAlcadasAtuais({
            ...perfilBase.alcadasPadrao,
            ...(u.approvalLimits || {})
        });

        setAmbitoDadosAtual(u.dataScope || 'todos');
        setAgenciaAtual(u.branchName || '');
        setMascararSensiveisAtual(u.canViewSensitiveData !== false);
        setPodeExportarAtual(u.canExportData !== false);
        setExige2faAtual(Boolean(u.twoFactorEnabled));
        setDataFimTemporaria(u.temporaryRoleExpiry || '');

        // Calcular permissões iniciais para histórico de Diff
        const iniciais = ServicoControloAcesso.calcularPermissoesEfetivas(u, perfis);
        setPermissoesOriginais(iniciais.permissoes);

        setMotivoAlteracao('');
        setErroMotivo('');
        setTabAtivaEditor('matriz');
        setPrecisaAprovacaoDupla(false);
        setIsPermissionsDialogOpen(true);
    };

    // Alternar Permissão na Matriz (Cria ou revoga exceção sobre o perfil)
    const togglePermissaoNaMatriz = (permId: string) => {
        const perfilObj = perfis.find(p => p.id === perfilSelecionado);
        const permNoPerfil = perfilObj?.permissoesBase.includes(permId) || false;

        setExcecoesAtuais(prev => {
            const excecaoExistente = prev.find(e => e.permissionId === permId);

            if (permNoPerfil) {
                // Se a permissão está no perfil:
                // Se já tem exceção de 'retirar', remove a exceção (volta a ficar ativa)
                // Se não tem exceção, cria uma exceção de 'retirar'
                if (excecaoExistente && excecaoExistente.tipo === 'retirar') {
                    return prev.filter(e => e.permissionId !== permId);
                } else {
                    return [...prev.filter(e => e.permissionId !== permId), {
                        id: `exc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        permissionId: permId,
                        tipo: 'retirar',
                        motivo: motivoAlteracao.trim() || 'Revogação de permissão base do perfil',
                        atribuidoPor: currentUser?.name || 'Administrador',
                        atribuidoEm: new Date().toISOString()
                    }];
                }
            } else {
                // Se a permissão NÃO está no perfil:
                // Se já tem exceção de 'conceder', remove a exceção
                // Se não tem exceção, cria uma exceção de 'conceder'
                if (excecaoExistente && excecaoExistente.tipo === 'conceder') {
                    return prev.filter(e => e.permissionId !== permId);
                } else {
                    return [...prev.filter(e => e.permissionId !== permId), {
                        id: `exc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        permissionId: permId,
                        tipo: 'conceder',
                        motivo: motivoAlteracao.trim() || 'Concessão individual de privilégio',
                        atribuidoPor: currentUser?.name || 'Administrador',
                        atribuidoEm: new Date().toISOString(),
                        dataExpiracao: dataFimTemporaria || undefined
                    }];
                }
            }
        });
    };

    // Marcar/Desmarcar Área Inteira na Matriz
    const toggleAreaNaMatriz = (areaId: string, concederTodas: boolean) => {
        const modulos = MODULOS_SISTEMA.filter(m => m.area === areaId);
        const permsArea = modulos.flatMap(m => m.acoesDisponiveis.map(a => comporPermissao(m.id, a)));
        permsArea.forEach(pId => {
            const estaAtiva = permissoesEfetivasEditor.permissoes.includes(pId);
            if (concederTodas && !estaAtiva) {
                togglePermissaoNaMatriz(pId);
            } else if (!concederTodas && estaAtiva) {
                togglePermissaoNaMatriz(pId);
            }
        });
    };

    // Salvar Alterações de Permissões
    const handleSavePermissions = async () => {
        if (!selectedUserForPermissions) return;

        // Justificação válida (20+ caracteres, 3+ palavras, sem repetições e diferente das anteriores).
        const erroJustificacao = await ServicoAuditoriaAvancada.checkJustification(motivoAlteracao, currentUser?.id);
        if (erroJustificacao) {
            setErroMotivo(erroJustificacao);
            setAlertModal({ isOpen: true, title: 'Justificação inválida', description: erroJustificacao, type: 'warning' });
            return;
        }

        // Validação de alteração de último Super Administrador
        try {
            ServicoControloAcesso.verificarUltimoSuperAdmin(
                users,
                selectedUserForPermissions.id,
                selectedUserForPermissions.status,
                perfilSelecionado
            );
        } catch (e: any) {
            setAlertModal({
                isOpen: true,
                title: 'Operação Bloqueada',
                description: e.message,
                type: 'error'
            });
            return;
        }

        // Confirmação de aprovação dupla para perfis críticos (Super Administrador, Diretor de Crédito, Contabilista)
        const perfisCriticos = ['super_admin', 'credit_director', 'accountant'];
        if (perfisCriticos.includes(perfilSelecionado) && selectedUserForPermissions.role !== perfilSelecionado) {
            const outroSuperAdmin = users.find(u => u.role === 'super_admin' && u.id !== currentUser?.id && u.status === 'active');
            if (outroSuperAdmin && !precisaAprovacaoDupla) {
                setAlertModal({
                    isOpen: true,
                    title: 'Exigência de Aprovação Dupla',
                    description: `A atribuição do perfil de ${ROLES[perfilSelecionado]?.label} exige confirmação formal de controlo interno. Deseja prosseguir com o registo de autorização de ${currentUser?.name}?`,
                    type: 'warning',
                    showCancel: true,
                    actionLabel: 'Confirmar e Assinar',
                    cancelLabel: 'Cancelar',
                    onConfirm: () => {
                        setPrecisaAprovacaoDupla(true);
                        executarGravacaoPermissoes();
                    }
                });
                return;
            }
        }

        await executarGravacaoPermissoes();
    };

    const executarGravacaoPermissoes = async () => {
        if (!selectedUserForPermissions) return;

        try {
            const novasPermissoes = permissoesEfetivasEditor.permissoes;

            await updateUser(selectedUserForPermissions.id, {
                role: perfilSelecionado,
                permissions: novasPermissoes,
                permissionExceptions: excecoesAtuais,
                approvalLimits: alcadasAtuais,
                dataScope: ambitoDadosAtual,
                branchName: agenciaAtual,
                canViewSensitiveData: mascararSensiveisAtual,
                canExportData: podeExportarAtual,
                temporaryRoleExpiry: dataFimTemporaria || undefined
            });

            // Registo detalhado na auditoria bancária com valores antes e depois
            const diferencas = diffPermissions(permissoesOriginais, novasPermissoes);
            const perfilAntes = ROLES[selectedUserForPermissions.role]?.label || selectedUserForPermissions.role;
            const perfilDepois = ROLES[perfilSelecionado]?.label || perfilSelecionado;
            await addLog(
                'update',
                'user',
                `Alterou as permissões de ${selectedUserForPermissions.name}. Perfil: ${perfilAntes} → ${perfilDepois} (+${diferencas.added.length} / -${diferencas.removed.length}). Motivo: ${motivoAlteracao.trim()}`,
                currentUser?.id,
                currentUser?.name,
                { role: perfilAntes, dataScope: selectedUserForPermissions.dataScope || 'todos', approvalLimits: selectedUserForPermissions.approvalLimits || null, canExportData: selectedUserForPermissions.canExportData !== false },
                { role: perfilDepois, dataScope: ambitoDadosAtual, approvalLimits: alcadasAtuais, canExportData: podeExportarAtual },
                { targetUserId: selectedUserForPermissions.id, targetUserName: selectedUserForPermissions.name, added: diferencas.added, removed: diferencas.removed, reason: motivoAlteracao.trim() }
            );

            toast({
                title: 'Permissões guardadas com sucesso',
                description: `Os privilégios de ${selectedUserForPermissions.name} foram sincronizados no sistema.`,
            });

            setIsPermissionsDialogOpen(false);
        } catch (error: any) {
            setAlertModal({
                isOpen: true,
                title: 'Falha na Gravação',
                description: error.message || 'Ocorreu um erro ao gravar as alterações.',
                type: 'error'
            });
        }
    };

    // Submissão de Novo Utilizador
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const passwordToUse = formData.password || 'Mudar@123';
            const passwordStrength = validatePasswordStrength(passwordToUse);

            if (formData.password && passwordStrength.score < 60) {
                setAlertModal({
                    isOpen: true,
                    title: 'Palavra-passe Fraca',
                    description: 'A palavra-passe deve ter pelo menos 8 caracteres, incluindo maiúsculas, minúsculas, números e caracteres especiais.',
                    type: 'warning'
                });
                return;
            }

            const perfilObj = perfis.find(p => p.id === formData.role) || perfis[3];

            const newUser: any = {
                name: formData.name,
                email: formData.email,
                username: formData.username || undefined,
                password: passwordToUse,
                role: formData.role,
                avatar: formData.name.substring(0, 2).toUpperCase(),
                permissions: perfilObj.permissoesBase,
                permissionExceptions: [],
                status: formData.status,
                dataScope: formData.dataScope,
                branchName: formData.branchName,
                approvalLimits: perfilObj.alcadasPadrao,
                mustChangePassword: true
            };

            await addUser(newUser);
            await addLog('create', 'user', `Criou novo utilizador: ${newUser.name} (${newUser.role}). Estado: ${newUser.status}`, currentUser?.id, currentUser?.name);

            setCreatedUserInfo(newUser);
            setIsDialogOpen(false);
            setFormData({
                name: '', email: '', username: '', password: '',
                role: 'manager', dataScope: 'todos', branchName: '', status: 'active'
            });
            setIsSuccessDialogOpen(true);
        } catch (error) {
            setAlertModal({
                isOpen: true,
                title: 'Erro de Registo',
                description: 'Não foi possível adicionar o novo utilizador. Verifique se o e-mail ou username já existe.',
                type: 'error'
            });
        }
    };

    // Download da Matriz Completa de Utilizadores × Permissões em PDF
    const handleDownloadAllUsersPDF = () => {
        generateUsersPermissionsMatrixPDF((users || []).filter(Boolean), u => ServicoControloAcesso.calcularPermissoesEfetivas(u, perfis), companySettings, currentUser?.name);
        void addLog('export', 'user', `Exportou a matriz geral de utilizadores e permissões (${(users || []).length} utilizadores)`, currentUser?.id, currentUser?.name, undefined, undefined, { count: (users || []).length });
        setAlertModal({
            isOpen: true,
            title: 'Relatório Gerado',
            description: 'A matriz oficial de acessos em PDF foi descarregada com sucesso.',
            type: 'success_premium'
        });
    };

    return (
        <MainLayout title="Gestão de Utilizadores" subtitle="Controlo de acessos bancário, governação e permissões granulares">
            <div className="flex flex-col gap-6">

                {/* ============================================================== */}
                {/* 1. CARDS INTERATIVOS (CLICAR FILTRA A TABELA DINAMICAMENTE)   */}
                {/* ============================================================== */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6">
                    {/* Card 1: Total */}
                    <div
                        onClick={() => setFiltroCardAtivo('todos')}
                        className={cn(
                            "card-kpi-sky cursor-pointer transition-all hover:scale-[1.02]",
                            filtroCardAtivo === 'todos' && "ring-2 ring-primary ring-offset-2"
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-900/70 dark:text-slate-400">Total</span>
                            <UsersIcon className="h-4 w-4 text-primary" />
                        </div>
                        <p className="font-display text-2xl sm:text-3xl font-black mt-2">{stats.total}</p>
                        <p className="text-[11px] font-semibold text-slate-900/75 dark:text-slate-400 mt-1">Utilizadores</p>
                    </div>

                    {/* Card 2: Ativos */}
                    <div
                        onClick={() => setFiltroCardAtivo('ativos')}
                        className={cn(
                            "card-kpi-mint cursor-pointer transition-all hover:scale-[1.02]",
                            filtroCardAtivo === 'ativos' && "ring-2 ring-emerald-500 ring-offset-2"
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-900/70 dark:text-slate-400">Ativos</span>
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </div>
                        <p className="font-display text-2xl sm:text-3xl font-black mt-2 text-emerald-950 dark:text-emerald-100">{stats.ativos}</p>
                        <p className="text-[11px] font-semibold text-slate-900/75 dark:text-slate-400 mt-1">Operacionais</p>
                    </div>

                    {/* Card 3: Pendentes de Ativação */}
                    <div
                        onClick={() => setFiltroCardAtivo('pendentes')}
                        className={cn(
                            "card-kpi-amber cursor-pointer transition-all hover:scale-[1.02]",
                            filtroCardAtivo === 'pendentes' && "ring-2 ring-amber-500 ring-offset-2"
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-900/70 dark:text-slate-400">Pendentes</span>
                            <Clock className="h-4 w-4 text-amber-600" />
                        </div>
                        <p className="font-display text-2xl sm:text-3xl font-black mt-2 text-amber-950 dark:text-amber-100">{stats.pendentes}</p>
                        <p className="text-[11px] font-semibold text-slate-900/75 dark:text-slate-400 mt-1">Aguardam 1º acesso</p>
                    </div>

                    {/* Card 4: Bloqueados / Suspensos */}
                    <div
                        onClick={() => setFiltroCardAtivo('bloqueados')}
                        className={cn(
                            "rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-500/10 p-4 cursor-pointer transition-all hover:scale-[1.02]",
                            filtroCardAtivo === 'bloqueados' && "ring-2 ring-red-500 ring-offset-2"
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">Bloqueados</span>
                            <XCircle className="h-4 w-4 text-red-600" />
                        </div>
                        <p className="font-display text-2xl sm:text-3xl font-black mt-2 text-red-950 dark:text-red-100">{stats.bloqueados}</p>
                        <p className="text-[11px] font-semibold text-red-700/80 dark:text-red-400 mt-1">Acesso suspenso</p>
                    </div>

                    {/* Card 5: Sem 2FA */}
                    <div
                        onClick={() => setFiltroCardAtivo('sem_2fa')}
                        className={cn(
                            "card-kpi-purple cursor-pointer transition-all hover:scale-[1.02]",
                            filtroCardAtivo === 'sem_2fa' && "ring-2 ring-purple-500 ring-offset-2"
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-900/70 dark:text-slate-400">Sem 2FA</span>
                            <ShieldAlert className="h-4 w-4 text-purple-600" />
                        </div>
                        <p className="font-display text-2xl sm:text-3xl font-black mt-2 text-purple-950 dark:text-purple-100">{stats.sem2fa}</p>
                        <p className="text-[11px] font-semibold text-slate-900/75 dark:text-slate-400 mt-1">Vulneráveis</p>
                    </div>

                    {/* Card 6: Com Permissões Temporárias */}
                    <div
                        onClick={() => setFiltroCardAtivo('temporarias')}
                        className={cn(
                            "rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-blue-500/10 p-4 cursor-pointer transition-all hover:scale-[1.02]",
                            filtroCardAtivo === 'temporarias' && "ring-2 ring-blue-500 ring-offset-2"
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">Temporárias</span>
                            <Calendar className="h-4 w-4 text-blue-600" />
                        </div>
                        <p className="font-display text-2xl sm:text-3xl font-black mt-2 text-blue-950 dark:text-blue-100">{stats.temporarias}</p>
                        <p className="text-[11px] font-semibold text-blue-700/80 dark:text-blue-400 mt-1">Com data de fim</p>
                    </div>
                </div>

                {/* ============================================================== */}
                {/* 2. BARRA DE PESQUISA, FILTROS E AÇÕES RÁPIDAS                 */}
                {/* ============================================================== */}
                <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative w-full sm:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Pesquisar nome, email, perfil..."
                                value={pesquisa}
                                onChange={(e) => setPesquisa(e.target.value)}
                                className="pl-9 h-10 rounded-xl"
                            />
                        </div>

                        <Select value={filtroPerfil} onValueChange={setFiltroPerfil}>
                            <SelectTrigger className="h-10 w-44 rounded-xl text-xs font-bold">
                                <SelectValue placeholder="Perfil" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos os Perfis</SelectItem>
                                {perfis.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                            <SelectTrigger className="h-10 w-36 rounded-xl text-xs font-bold">
                                <SelectValue placeholder="Estado" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos os Estados</SelectItem>
                                <SelectItem value="active">Ativos</SelectItem>
                                <SelectItem value="pending_activation">Pendentes</SelectItem>
                                <SelectItem value="blocked">Bloqueados</SelectItem>
                            </SelectContent>
                        </Select>

                        {filtroCardAtivo !== 'todos' && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setFiltroCardAtivo('todos')}
                                className="h-8 text-xs font-bold text-muted-foreground hover:text-foreground"
                            >
                                Limpar Filtro ({filtroCardAtivo})
                            </Button>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => navigate('/perfis')}
                            className="h-10 px-4 rounded-xl font-bold text-xs gap-2"
                        >
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            Gerir Perfis (RBAC)
                        </Button>

                        <Button
                            variant="outline"
                            onClick={handleDownloadAllUsersPDF}
                            className="h-10 px-4 rounded-xl font-bold text-xs gap-2"
                        >
                            <FileText className="h-4 w-4 text-slate-500" />
                            Matriz em PDF
                        </Button>

                        <Button
                            onClick={() => setIsDialogOpen(true)}
                            className="h-10 px-5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 gap-2"
                        >
                            <UserPlus className="h-4 w-4" />
                            Novo Utilizador
                        </Button>
                    </div>
                </div>

                {/* Solicitações Pendentes de Recuperação de Senha */}
                {resetRequests.length > 0 && (
                    <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <Badge variant="destructive" className="animate-pulse">Pendentes</Badge>
                            <h3 className="text-sm font-bold text-destructive">Solicitações de Redefinição de Palavra-passe</h3>
                        </div>
                        <div className="divide-y divide-destructive/10">
                            {resetRequests.map((req) => (
                                <div key={req.id} className="py-2 flex items-center justify-between text-xs">
                                    <div>
                                        <span className="font-bold">{req.userName}</span> ({req.email})
                                        <span className="text-muted-foreground ml-2">· {new Date(req.timestamp).toLocaleString('pt-AO')}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleResetRequest(req.id, undefined, 'cancel').then(loadRequests)}
                                        >
                                            Ignorar
                                        </Button>
                                        <Button
                                            size="sm"
                                            className="bg-destructive hover:bg-destructive/90"
                                            onClick={() => {
                                                setSelectedRequest(req);
                                                setIsResetDialogOpen(true);
                                            }}
                                        >
                                            Redefinir Agora
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ============================================================== */}
                {/* 3. TABELA DE UTILIZADORES (DATATABLE COM RESUMO DE PERFIL)     */}
                {/* ============================================================== */}
                <div className="card-elevated overflow-hidden">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-50/70 dark:bg-slate-800/40">
                                <TableRow>
                                    <TableHead className="font-bold text-xs uppercase tracking-wider">Utilizador</TableHead>
                                    <TableHead className="font-bold text-xs uppercase tracking-wider">Perfil & Exceções</TableHead>
                                    <TableHead className="font-bold text-xs uppercase tracking-wider">Alçada</TableHead>
                                    <TableHead className="font-bold text-xs uppercase tracking-wider">Estado</TableHead>
                                    <TableHead className="font-bold text-xs uppercase tracking-wider">2FA</TableHead>
                                    <TableHead className="font-bold text-xs uppercase tracking-wider">Último Acesso</TableHead>
                                    <TableHead className="w-36 text-right font-bold text-xs uppercase tracking-wider">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsersList.map((u) => {
                                    const excecoesCount = (u.permissionExceptions || []).length;
                                    const isSuperAdmin = u.role === 'super_admin';
                                    const alcadaValor = isSuperAdmin
                                        ? 'Ilimitada'
                                        : `${(u.approvalLimits?.aprovacaoCreditoKz || 0).toLocaleString('pt-AO')} Kz`;

                                    const isOnline = (u.id === currentUser?.id) || (u.status === 'active' && !!u.lastSeen && (new Date().getTime() - new Date(u.lastSeen).getTime() < 5 * 60 * 1000));

                                    return (
                                        <TableRow key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                            {/* Coluna Utilizador */}
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-white shadow-xs overflow-hidden">
                                                        {u.avatar ? (
                                                            <img
                                                                src={getFileUrl(u.avatar)}
                                                                alt={u.name}
                                                                className="h-full w-full object-cover"
                                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                            />
                                                        ) : (
                                                            <span>{(u.name || 'US').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                                                {u.name}
                                                            </span>
                                                            {isOnline && (
                                                                <span className="relative flex h-2 w-2 shrink-0" title="Ligado agora">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                                                    </div>
                                                </div>
                                            </TableCell>

                                            {/* Coluna Perfil & Resumo de Exceções */}
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className={ROLES[u.role]?.badgeColor || 'border-slate-200'}>
                                                            {ROLES[u.role]?.label || u.role}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-xs">
                                                        {isSuperAdmin ? (
                                                            <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[11px]">
                                                                <ShieldCheck className="h-3 w-3" /> Acesso total
                                                            </span>
                                                        ) : excecoesCount > 0 ? (
                                                            <span className="font-semibold text-amber-600 dark:text-amber-400 text-[11px]">
                                                                +{excecoesCount} {excecoesCount === 1 ? 'exceção' : 'exceções'}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground text-[11px]">
                                                                Permissões padrão
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>

                                            {/* Coluna Alçada */}
                                            <TableCell className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                {alcadaValor}
                                            </TableCell>

                                            {/* Coluna Estado */}
                                            <TableCell>
                                                {u.status === 'blocked' ? (
                                                    <Badge variant="destructive" className="text-[10px]">Bloqueado</Badge>
                                                ) : u.status === 'pending_activation' ? (
                                                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-300">Pendente</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-300">Ativo</Badge>
                                                )}
                                            </TableCell>

                                            {/* Coluna 2FA */}
                                            <TableCell>
                                                {u.twoFactorEnabled ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                                                        <ShieldCheck className="h-3.5 w-3.5" /> Ativo
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] text-muted-foreground">
                                                        Desativado
                                                    </span>
                                                )}
                                            </TableCell>

                                            {/* Coluna Último Acesso */}
                                            <TableCell className="text-xs text-muted-foreground">
                                                {u.lastLogin ? new Date(u.lastLogin).toLocaleString('pt-AO') : 'Nunca'}
                                            </TableCell>

                                            {/* Coluna Ações Rápidas */}
                                            <TableCell className="text-right">
                                                <div className="flex justify-end items-center gap-1">
                                                    {/* Botão Gerir Permissões (Editor RBAC) */}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-primary hover:bg-primary/10"
                                                        title="Gerir Permissões e Alçadas (RBAC)"
                                                        onClick={() => handleOpenPermissions(u)}
                                                    >
                                                        <Lock className="h-4 w-4" />
                                                    </Button>

                                                    {/* Ficha PDF */}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                        title="Ficha do Utilizador (PDF)"
                                                        onClick={() => {
                                                            generateUserProfilePDF(u, companySettings, currentUser?.name);
                                                        }}
                                                    >
                                                        <FileText className="h-4 w-4" />
                                                    </Button>

                                                    {/* Redefinir Palavra-passe */}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                                        title="Redefinir Palavra-passe"
                                                        onClick={() => {
                                                            setSelectedRequest({ id: 'manual', userId: u.id, userName: u.name });
                                                            setIsResetDialogOpen(true);
                                                        }}
                                                    >
                                                        <KeyRound className="h-4 w-4" />
                                                    </Button>

                                                    {/* Bloquear / Desbloquear */}
                                                    {u.id !== currentUser?.id && u.role !== 'super_admin' && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className={cn(
                                                                "h-8 w-8",
                                                                u.status === 'blocked' ? "text-emerald-600 hover:bg-emerald-50" : "text-destructive hover:bg-destructive/10"
                                                            )}
                                                            title={u.status === 'blocked' ? "Desbloquear Utilizador" : "Bloquear Utilizador"}
                                                            onClick={async () => {
                                                                const novoEstado = u.status === 'blocked' ? 'active' : 'blocked';
                                                                await updateUser(u.id, { status: novoEstado });
                                                                await addLog('update', 'user', `${novoEstado === 'blocked' ? 'Bloqueou' : 'Desbloqueou'} acesso de ${u.name}`, currentUser?.id, currentUser?.name);
                                                                toast({
                                                                    title: novoEstado === 'blocked' ? 'Utilizador bloqueado' : 'Utilizador ativado',
                                                                    description: `A conta de ${u.name} está agora ${novoEstado === 'blocked' ? 'bloqueada' : 'ativa'}.`
                                                                });
                                                            }}
                                                        >
                                                            {u.status === 'blocked' ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>

            {/* ============================================================== */}
            {/* 4. MODAL / EDITOR LARGO DE PERMISSÕES E GOVERNAÇÃO (RBAC)      */}
            {/* ============================================================== */}
            <Dialog open={isPermissionsDialogOpen} onOpenChange={setIsPermissionsDialogOpen}>
                <DialogContent className="flex h-[94vh] w-[97vw] max-w-[1500px] flex-col gap-0 overflow-hidden border-none p-0 shadow-2xl">
                    {/* Cabeçalho do editor: nome, email, perfil e avatar (texto claro sobre o fundo escuro) */}
                    <DialogHeader className="mx-0 mb-0 mt-0 shrink-0 px-6 pb-4 pt-6 pr-16 sm:px-8">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3.5">
                                <div className="h-12 w-12 rounded-2xl bg-white/15 text-white flex items-center justify-center font-black text-base shadow-md">
                                    {(selectedUserForPermissions?.name || 'US').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <DialogTitle className="text-xl font-black text-white flex flex-wrap items-center gap-2">
                                        {selectedUserForPermissions?.name}
                                        <Badge variant="outline" className={ROLES[selectedUserForPermissions?.role || 'manager']?.badgeColor}>
                                            {ROLES[selectedUserForPermissions?.role || 'manager']?.label}
                                        </Badge>
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-white/75 flex flex-wrap items-center gap-2 mt-0.5">
                                        <span>{selectedUserForPermissions?.email}</span>
                                        <span>·</span>
                                        <span>ID: {selectedUserForPermissions?.id}</span>
                                    </DialogDescription>
                                </div>
                            </div>

                            {/* Seletor de Perfil Base no Topo */}
                            <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 p-2">
                                <Label htmlFor="seletor-perfil" className="text-xs font-bold text-white/80 shrink-0">
                                    Perfil Base:
                                </Label>
                                <Select
                                    value={perfilSelecionado}
                                    onValueChange={(val: Role) => {
                                        setPerfilSelecionado(val);
                                        // Atualizar alçadas padrão conforme o novo perfil
                                        const novoPerfilObj = perfis.find(p => p.id === val);
                                        if (novoPerfilObj) {
                                            setAlcadasAtuais(novoPerfilObj.alcadasPadrao);
                                        }
                                    }}
                                >
                                    <SelectTrigger id="seletor-perfil" className="h-8 w-56 rounded-lg bg-white text-xs font-bold text-slate-900">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {perfis.map(p => (
                                            <SelectItem key={p.id} value={p.id} className="text-xs">
                                                {p.nome}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Barra de Separadores do Editor */}
                        <div className="mt-3 grid grid-cols-2 gap-2 text-white sm:grid-cols-5">
                            {[
                                ['Permissões efetivas', String(permissoesEfetivasEditor.permissoes.length)],
                                ['Exceções individuais', String(excecoesAtuais.length)],
                                ['Ações críticas', String(criticalPermissions(permissoesEfetivasEditor.permissoes).length)],
                                ['Alterações por guardar', String(diffPermissoes.length)],
                                ['Conflitos de segregação', String(conflitosDetetados.length)],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-xl border border-white/15 bg-white/10 px-3 py-1.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">{label}</p>
                                    <p className="text-base font-black">{value}</p>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center gap-1 overflow-x-auto pt-3 mt-3 border-t border-white/10">
                            {[
                                { id: 'matriz', label: 'Matriz de Permissões', icon: Sliders },
                                { id: 'efetivas', label: 'Permissões Efetivas', icon: CheckCircle2 },
                                { id: 'alcadas', label: 'Alçadas de Aprovação', icon: ShieldCheck },
                                { id: 'dados', label: 'Âmbito dos Dados', icon: Building2 },
                                { id: 'seguranca', label: 'Segurança & 2FA', icon: Lock },
                                { id: 'temporarias', label: 'Permissões Temporárias', icon: Calendar },
                                { id: 'historico', label: 'Histórico de Governação', icon: Clock },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setTabAtivaEditor(tab.id as TabEditor)}
                                    className={cn(
                                        "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0",
                                        tabAtivaEditor === tab.id
                                            ? "bg-white text-slate-900 shadow-xs"
                                            : "text-white/75 hover:bg-white/10 hover:text-white"
                                    )}
                                >
                                    <tab.icon className="h-3.5 w-3.5" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </DialogHeader>

                    {/* Conteúdo dos Separadores */}
                    <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar space-y-6 p-5 sm:p-6">

                        {/* Alerta de Conflitos de Segregação de Funções */}
                        {conflitosDetetados.length > 0 && (
                            <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-500/10 p-3.5 space-y-1.5 animate-fade-in">
                                <div className="flex items-center gap-2 text-xs font-black text-amber-800 dark:text-amber-300">
                                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                                    <span>Alerta de Segregação de Funções (Princípio dos Quatro Olhos)</span>
                                </div>
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                    Foram detetadas permissões mutuamente incompatíveis: {conflitosDetetados.map(c => c.nome).join('; ')}. A atribuição requer justificação de segurança fundamentada.
                                </p>
                            </div>
                        )}

                        {/* SEPARADOR 1: MATRIZ DE PERMISSÕES */}
                        {tabAtivaEditor === 'matriz' && (
                            <div className="space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Pesquisar módulo ou ação na matriz..."
                                            value={pesquisaMatriz}
                                            onChange={(e) => setPesquisaMatriz(e.target.value)}
                                            className="pl-9 h-9 rounded-xl text-xs"
                                        />
                                    </div>

                                    <LegendaPermissoes showOrigin />
                                </div>
                                <p className="text-xs text-muted-foreground">As permissões vêm do perfil base. Ao marcar ou desmarcar, cria-se uma exceção individual só para este utilizador (verde = concedida, vermelho = revogada).</p>
                                <MatrizPermissoes selected={efetivasSet} baseline={originaisSet} search={pesquisaMatriz} origin={origemPermissao}
                                    onToggle={togglePermissaoNaMatriz}
                                    onSetMany={(ids, ativar) => ids.forEach(id => { if (efetivasSet.has(id) !== ativar) togglePermissaoNaMatriz(id); })} />
                            </div>
                        )}

                        {/* SEPARADOR 2: PERMISSÕES EFETIVAS (ORIGEM DO PERFIL VS EXCEÇÃO) */}
                        {tabAtivaEditor === 'efetivas' && (
                            <div className="space-y-4">
                                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
                                    <div>
                                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                                            Resultado Final de Permissões Efetivas
                                        </h4>
                                        <p className="text-xs text-muted-foreground">
                                            {permissoesEfetivasEditor.permissoes.length} permissões ativas ({permissoesEfetivasEditor.totalExcecoesAtivas} exceções aplicadas)
                                        </p>
                                    </div>
                                    <Badge variant="outline" className={ROLES[perfilSelecionado]?.badgeColor}>
                                        Perfil: {ROLES[perfilSelecionado]?.label}
                                    </Badge>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {permissoesEfetivasEditor.permissoes.map(permId => {
                                        const [modId, acao] = permId.split('.');
                                        const modulo = MODULOS_SISTEMA.find(m => m.id === modId);
                                        const infoAcao = DESCRICOES_ACOES[acao as AcaoModulo];
                                        const origem = permissoesEfetivasEditor.origemPorPermissao[permId];

                                        return (
                                            <div
                                                key={permId}
                                                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-start justify-between gap-2 shadow-2xs"
                                            >
                                                <div className="min-w-0">
                                                    <p className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                                        {modulo?.nome || modId}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {infoAcao?.nome || acao}
                                                    </p>
                                                </div>

                                                {origem?.origem === 'excecao_concedida' ? (
                                                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-300 shrink-0 font-bold">
                                                        + Exceção
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-600 border-slate-200 shrink-0">
                                                        Perfil
                                                    </Badge>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* SEPARADOR 3: ALÇADAS DE APROVAÇÃO BANCÁRIAS */}
                        {tabAtivaEditor === 'alcadas' && (
                            <div className="space-y-4">
                                <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                                    <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>
                                        As alçadas definem os montantes máximos de decisão que este utilizador pode aprovar ou movimentar autonomamente. Operações acima do limite são encaminhadas automaticamente ao escalão seguinte.
                                    </span>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-1.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                        <Label className="text-xs font-bold">Alçada Máxima de Aprovação de Crédito (Kz)</Label>
                                        <Input
                                            type="number"
                                            value={alcadasAtuais.aprovacaoCreditoKz}
                                            onChange={(e) => setAlcadasAtuais({ ...alcadasAtuais, aprovacaoCreditoKz: Number(e.target.value) || 0 })}
                                        />
                                        <p className="text-[11px] text-muted-foreground">ex.: 500.000 Kz para Gestor, 5.000.000 Kz para Diretor</p>
                                    </div>

                                    <div className="space-y-1.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                        <Label className="text-xs font-bold">Exigir Dupla Aprovação Acima de (Kz)</Label>
                                        <Input
                                            type="number"
                                            value={alcadasAtuais.requerDuplaAprovacaoAcimaKz || 5_000_000}
                                            onChange={(e) => setAlcadasAtuais({ ...alcadasAtuais, requerDuplaAprovacaoAcimaKz: Number(e.target.value) || 0 })}
                                        />
                                        <p className="text-[11px] text-muted-foreground">Exige parecer conjunto de dois aprovadores diferentes</p>
                                    </div>

                                    <div className="space-y-1.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                        <Label className="text-xs font-bold">Limite de Desembolso Financeiro (Kz)</Label>
                                        <Input
                                            type="number"
                                            value={alcadasAtuais.desembolsoKz}
                                            onChange={(e) => setAlcadasAtuais({ ...alcadasAtuais, desembolsoKz: Number(e.target.value) || 0 })}
                                        />
                                    </div>

                                    <div className="space-y-1.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                        <Label className="text-xs font-bold">Limite de Perdão de Juros e Mora (Kz)</Label>
                                        <Input
                                            type="number"
                                            value={alcadasAtuais.perdaoJurosKz}
                                            onChange={(e) => setAlcadasAtuais({ ...alcadasAtuais, perdaoJurosKz: Number(e.target.value) || 0 })}
                                        />
                                    </div>

                                    <div className="space-y-1.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                        <Label className="text-xs font-bold">Limite de Anulação de Pagamentos (Kz)</Label>
                                        <Input
                                            type="number"
                                            value={alcadasAtuais.anulacaoPagamentoKz}
                                            onChange={(e) => setAlcadasAtuais({ ...alcadasAtuais, anulacaoPagamentoKz: Number(e.target.value) || 0 })}
                                        />
                                    </div>

                                    <div className="space-y-1.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                        <Label className="text-xs font-bold">Limite de Abate de Crédito / Write-Off (Kz)</Label>
                                        <Input
                                            type="number"
                                            value={alcadasAtuais.abateCreditoKz}
                                            onChange={(e) => setAlcadasAtuais({ ...alcadasAtuais, abateCreditoKz: Number(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SEPARADOR 4: ÂMBITO DOS DADOS & MASCARAMENTO */}
                        {tabAtivaEditor === 'dados' && (
                            <div className="space-y-4">
                                <div className="space-y-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                    <Label className="text-xs font-bold">Visibilidade de Clientes e Carteiras</Label>
                                    <div className="grid gap-2 sm:grid-cols-3">
                                        {[
                                            { id: 'todos', label: 'Todos os Clientes', desc: 'Acesso transversal a toda a base bancária' },
                                            { id: 'agencia', label: 'Apenas Agência / Balcão', desc: 'Restrito aos clientes do seu balcão físico' },
                                            { id: 'carteira_propria', label: 'Apenas Carteira Própria', desc: 'Vê apenas os clientes que registou/gere' },
                                        ].map(amb => (
                                            <div
                                                key={amb.id}
                                                onClick={() => setAmbitoDadosAtual(amb.id as AmbitoDados)}
                                                className={cn(
                                                    "p-3 rounded-xl border cursor-pointer transition-all",
                                                    ambitoDadosAtual === amb.id
                                                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                                                        : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                                                )}
                                            >
                                                <p className="font-bold text-xs">{amb.label}</p>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">{amb.desc}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {ambitoDadosAtual === 'agencia' && (
                                        <div className="pt-2">
                                            <Label htmlFor="agencia" className="text-xs">Nome da Agência / Balcão</Label>
                                            <Input
                                                id="agencia"
                                                value={agenciaAtual}
                                                onChange={(e) => setAgenciaAtual(e.target.value)}
                                                placeholder="ex.: Balcão Luanda Centro"
                                                className="mt-1"
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-bold text-xs text-slate-900 dark:text-white">Ver Dados Sensíveis Desmascarados</p>
                                            <p className="text-[11px] text-muted-foreground">
                                                Quando desativado, dados como NIF, BI, telefone, rendimento e IBAN aparecem mascarados (ex.: 0034****LA042).
                                            </p>
                                        </div>
                                        <Switch
                                            checked={mascararSensiveisAtual}
                                            onCheckedChange={setMascararSensiveisAtual}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                                        <div>
                                            <p className="font-bold text-xs text-slate-900 dark:text-white">Permissão de Exportação (Excel / PDF)</p>
                                            <p className="text-[11px] text-muted-foreground">
                                                Autoriza o utilizador a transferir ficheiros de dados externos com registo em auditoria.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={podeExportarAtual}
                                            onCheckedChange={setPodeExportarAtual}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SEPARADOR 5: SEGURANÇA E 2FA */}
                        {tabAtivaEditor === 'seguranca' && (
                            <div className="space-y-4">
                                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-bold text-xs text-slate-900 dark:text-white">Autenticação de Dois Fatores (2FA)</p>
                                            <p className="text-[11px] text-muted-foreground">
                                                Obrigatória por política bancária para perfis de aprovação, contabilidade e administração.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={exige2faAtual}
                                            onCheckedChange={setExige2faAtual}
                                        />
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                                    <p className="font-bold text-xs">Política de Sessão e Inatividade</p>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        O encerramento automático por inatividade está configurado globalmente em 15 minutos. As sessões ativas deste operador podem ser revogadas a qualquer momento no menu de Sessões Ativas.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* SEPARADOR 6: PERMISSÕES TEMPORÁRIAS */}
                        {tabAtivaEditor === 'temporarias' && (
                            <div className="space-y-4">
                                <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5">
                                    <Calendar className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>
                                        Conceda privilégios temporários para substituições de férias ou projetos especiais. Na data de fim definida, os privilégios expiram automaticamente sem necessidade de intervenção manual.
                                    </span>
                                </div>

                                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                                    <Label htmlFor="data-fim" className="text-xs font-bold">Data e Hora de Expiração do Perfil/Exceções</Label>
                                    <Input
                                        id="data-fim"
                                        type="datetime-local"
                                        value={dataFimTemporaria}
                                        onChange={(e) => setDataFimTemporaria(e.target.value)}
                                        className="w-full sm:w-72"
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        Deixe em branco para acesso permanente sem expiração automática.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* SEPARADOR 7: HISTÓRICO DE GOVERNAÇÃO (registos reais da auditoria) */}
                        {tabAtivaEditor === 'historico' && (
                            <div className="space-y-3">
                                <div className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
                                    Alterações de perfil, permissões e segurança deste utilizador, lidas dos registos de auditoria imutáveis.
                                </div>
                                {historicoGovernacao === null ? <p className="py-6 text-center text-sm text-muted-foreground">A carregar...</p>
                                    : !historicoGovernacao.length ? <p className="py-6 text-center text-sm text-muted-foreground">Sem alterações registadas para este utilizador.</p>
                                    : historicoGovernacao.slice().reverse().map(event => (
                                        <div key={event.id} className="rounded-xl border bg-background p-3 text-xs">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="font-bold">{event.userName}</span>
                                                <span className="font-mono text-muted-foreground">{formatAuditTimestamp(event.timestamp)}</span>
                                            </div>
                                            <p className="mt-1">{event.summary}</p>
                                            {event.changes.slice(0, 8).map(change => <p key={change.field} className="text-[11px]"><b>{change.label}:</b> <span className="text-red-600">{change.before}</span> → <span className="text-emerald-600">{change.after}</span></p>)}
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>

                    {/* BARRA INFERIOR FIXA COM DIFF E MOTIVO OBRIGATÓRIO (REQUISITOS 11 & 9) */}
                    <div className="shrink-0 space-y-3 border-t bg-muted/40 px-5 py-4 sm:px-6">
                        {/* Resumo das Diferenças em Tempo Real */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-white">Resumo de Alterações:</span>
                                {diffPermissoes.length > 0 ? (
                                    <span className="font-bold text-primary">
                                        {diffPermissoes.length} {diffPermissoes.length === 1 ? 'diferença detetada' : 'diferenças detetadas'}
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground">Nenhuma alteração às permissões</span>
                                )}
                            </div>
                            {diffPermissoes.length > 0 && (
                                <div className="flex max-h-16 max-w-3xl flex-wrap gap-1 overflow-y-auto">
                                    {diffPermissoes.map((d, i) => (
                                        <span key={i} className={cn("px-2 py-0.5 rounded text-[10px] font-bold", d.startsWith('+') ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800")}>
                                            {d}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Campo Obrigatório de Motivo de Auditoria */}
                        <div className="space-y-1.5">
                            <Label htmlFor="motivo-governance" className="text-xs font-bold flex items-center gap-1.5 text-primary">
                                <ShieldAlert className="h-3.5 w-3.5" />
                                Justificação / Motivo Obrigatório (Registo de Auditoria):
                            </Label>
                            <Input
                                id="motivo-governance"
                                value={motivoAlteracao}
                                onChange={(e) => { setMotivoAlteracao(e.target.value); setErroMotivo(''); }}
                                placeholder="ex.: Atribuição do perfil aprovada pela Direção de Crédito na reunião de 06/10"
                                className={cn("h-9 bg-background text-xs", erroMotivo && "border-destructive")}
                            />
                            <p className={cn("text-[11px]", erroMotivo || (motivoAlteracao && validateJustification(motivoAlteracao)) ? "font-semibold text-destructive" : "text-muted-foreground")}>
                                {erroMotivo || (motivoAlteracao && validateJustification(motivoAlteracao)) || 'Pelo menos 20 caracteres e 3 palavras, sem caracteres repetidos e diferente das suas justificações anteriores.'}
                            </p>
                        </div>

                        {/* Botões Cancelar e Guardar */}
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <Button
                                variant="outline"
                                onClick={() => setIsPermissionsDialogOpen(false)}
                                className="h-10 px-5 font-bold text-xs"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleSavePermissions}
                                className="h-10 px-6 font-bold text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20"
                            >
                                Guardar Alterações
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ============================================================== */}
            {/* 5. MODAL NOVO UTILIZADOR                                      */}
            {/* ============================================================== */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UserPlus className="h-5 w-5 text-primary" />
                            Novo Utilizador
                        </DialogTitle>
                        <DialogDescription>
                            Crie um novo colaborador no sistema bancário com perfil e alçada associados.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="name">Nome Completo</Label>
                            <Input
                                id="name"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="ex.: Manuel António dos Santos"
                            />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="email">E-mail Corporativo</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="manuel.santos@tango.ao"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="username">Nome de Utilizador (Opcional)</Label>
                                <Input
                                    id="username"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    placeholder="msantos"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="password">Palavra-passe Inicial</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    placeholder="Deixar em branco para padrão 'Mudar@123'"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                            <PasswordStrengthIndicator password={formData.password} showRequirements={false} />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="role">Perfil Bancário</Label>
                                <Select
                                    value={formData.role}
                                    onValueChange={(v: Role) => setFormData({ ...formData, role: v })}
                                >
                                    <SelectTrigger id="role">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {perfis.map(p => (
                                            <SelectItem key={p.id} value={p.id}>
                                                {p.nome}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="status">Estado Inicial</Label>
                                <Select
                                    value={formData.status}
                                    onValueChange={(s: any) => setFormData({ ...formData, status: s })}
                                >
                                    <SelectTrigger id="status">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Ativo Imediatamente</SelectItem>
                                        <SelectItem value="pending_activation">Pendente de Ativação (1º Acesso)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <DialogFooter className="pt-3">
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit" className="font-bold">
                                Criar Utilizador
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Dialogo Redefinir Senha */}
            <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Redefinir Palavra-passe</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="p-3 bg-primary/5 rounded-xl border border-primary/10 text-xs">
                            Utilizador: <span className="font-bold text-slate-900 dark:text-white">{selectedRequest?.userName}</span>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="new-pwd">Nova Palavra-passe Provisória</Label>
                            <Input
                                id="new-pwd"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                            <p className="text-[11px] text-muted-foreground">
                                O colaborador será obrigado a alterar esta senha no próximo início de sessão.
                            </p>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsResetDialogOpen(false)}>Cancelar</Button>
                            <Button
                                className="bg-destructive hover:bg-destructive/90 font-bold"
                                onClick={async () => {
                                    if (selectedRequest?.id === 'manual') {
                                        await updateUser(selectedRequest.userId, { password: newPassword, mustChangePassword: true });
                                        await addLog('update', 'user', `Redefiniu palavra-passe de ${selectedRequest.userName}`, currentUser?.id, currentUser?.name);
                                    } else if (selectedRequest) {
                                        await handleResetRequest(selectedRequest.id, newPassword);
                                        await addLog('update', 'user', `Processou pedido de recuperação para ${selectedRequest.userName}`, currentUser?.id, currentUser?.name);
                                    }
                                    setIsResetDialogOpen(false);
                                    loadRequests();
                                    setAlertModal({
                                        isOpen: true,
                                        title: 'Palavra-passe Redefinida',
                                        description: 'A nova palavra-passe foi aplicada com sucesso.',
                                        type: 'success_premium'
                                    });
                                }}
                            >
                                Confirmar Redefinição
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialogo Sucesso de Registo */}
            <Dialog open={isSuccessDialogOpen} onOpenChange={setIsSuccessDialogOpen}>
                <DialogContent className="max-w-md text-center p-6">
                    <div className="flex flex-col items-center gap-3">
                        <div className="h-16 w-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                            <CheckCircle2 className="h-8 w-8" />
                        </div>
                        <DialogTitle className="text-xl font-black text-slate-900 dark:text-white">
                            Utilizador Criado com Sucesso!
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            O colaborador <span className="font-bold text-foreground">{createdUserInfo?.name}</span> foi registado no sistema bancário.
                        </DialogDescription>
                        <div className="w-full bg-slate-50 dark:bg-slate-900 p-4 rounded-xl text-left text-xs space-y-2 border">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">E-mail:</span>
                                <span className="font-bold">{createdUserInfo?.email}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Palavra-passe Inicial:</span>
                                <span className="font-mono font-bold text-emerald-600">{createdUserInfo?.password || 'Mudar@123'}</span>
                            </div>
                        </div>
                        <Button className="w-full font-bold" onClick={() => setIsSuccessDialogOpen(false)}>
                            Concluir
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Modal de Alerta Premium */}
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
