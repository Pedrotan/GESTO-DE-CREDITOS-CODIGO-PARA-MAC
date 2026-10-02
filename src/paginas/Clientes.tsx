import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { formatCurrency, formatDate } from '@/bibliotecas/formatters';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
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
import {
    Search,
    Plus,
    MoreVertical,
    Eye,
    Edit,
    Trash2,
    Phone,
    Mail,
    MessageSquare,
    History,
    FileText,
    Download,
    Upload,
    CreditCard,
    TrendingUp,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    Users,
    UserCheck,
    UserX,
    Wallet,
    ArrowUpRight,
    Receipt
} from 'lucide-react';
import { generateExcelTemplate, parseExcelFile } from '@/bibliotecas/ExcelHelper';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/componentes/ui/dropdown-menu';
import { ClientForm } from '@/componentes/forms/ClientForm';
import { CreditForm } from '@/componentes/forms/CreditForm';
import { CREDIT_DIALOG_CONTENT_CLASS, CREDIT_DIALOG_HEADER_CLASS } from '@/componentes/forms/credit-dialog-styles';
import { Client, Credit } from '@/tipos/credito';
import { generateClientInfoSheetPDF, generateClientProfilePDF } from '@/bibliotecas/pdf';
import { ServicoEmail } from '@/servicos/ServicoEmail';

import { useToast } from "@/componentes/ui/use-toast";
import { v4 as uuidv4 } from 'uuid';
import { ClientDetailsModal } from '@/componentes/modals/ClientDetailsModal';
import { AlertModal, AlertModalType } from '@/componentes/ui/AlertModal';

type BadgeVariant = 'default' | 'primary' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info' | 'outline';

const statusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
    active: { label: 'Activo', variant: 'success' },
    blocked: { label: 'Bloqueado', variant: 'destructive' },
    inactive: { label: 'Suspenso', variant: 'warning' },
};

const riskConfig: Record<string, { label: string; variant: BadgeVariant }> = {
    low: { label: 'Baixo', variant: 'success' },
    medium: { label: 'Médio', variant: 'warning' },
    high: { label: 'Alto', variant: 'destructive' },
};

type ClientCategory = 'COMUM' | 'APOSENTADO' | 'ESTRANGEIRO';

interface ClientsProps {
    /** Carteira apresentada nesta página. Define a lista e o que é gravado ao cadastrar. */
    category?: ClientCategory;
}

/** Textos que mudam consoante a carteira apresentada. */
const CATEGORY_LABELS: Record<ClientCategory, { singular: string; plural: string; novo: string }> = {
    COMUM: { singular: 'Cliente', plural: 'clientes', novo: 'Novo Cliente' },
    APOSENTADO: { singular: 'Aposentado', plural: 'aposentados', novo: 'Novo Aposentado' },
    ESTRANGEIRO: { singular: 'Cliente Estrangeiro', plural: 'clientes estrangeiros', novo: 'Novo Estrangeiro' },
};

export default function Clients({ category = 'COMUM' }: ClientsProps) {
    const labels = CATEGORY_LABELS[category];
    const { user } = useAuth();
    const { toast } = useToast();
    const { clients, addClient, updateClient, deleteClient, credits, payments, companySettings, addCredit } = useData();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
    const [isNewCreditDialogOpen, setIsNewCreditDialogOpen] = useState(false);

    const [editingClient, setEditingClient] = useState<Client | undefined>(undefined);
    const [selectedClient, setSelectedClient] = useState<Client | undefined>(undefined);
    const [isLimitsModalOpen, setIsLimitsModalOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Estados para Download da Ficha
    const [isDownloadOptionsOpen, setIsDownloadOptionsOpen] = useState(false);
    const [includeInterest, setIncludeInterest] = useState(true);
    const [clientForDownload, setClientForDownload] = useState<Client | undefined>(undefined);

    const [creditPrefillAmount, setCreditPrefillAmount] = useState<number | undefined>(undefined);
    const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
    const [newLimitInput, setNewLimitInput] = useState<string>('');
    const [decisionType, setDecisionType] = useState<'A' | 'B' | null>(null);

    useEffect(() => {
        const query = searchParams.get('search');
        if (query) {
            setSearchTerm(query);
        }
    }, [searchParams]);

    // Estado da Modal de Alerta
    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        type: AlertModalType;
    }>({
        isOpen: false,
        title: '',
        description: '',
        type: 'success'
    });

    const [isMovementsModalOpen, setIsMovementsModalOpen] = useState(false);
    const [movementsSearchTerm, setMovementsSearchTerm] = useState('');
    const [movementsStartDate, setMovementsStartDate] = useState('');
    const [movementsEndDate, setMovementsEndDate] = useState('');

    // Filtragem estrita dos clientes pertencentes à categoria ativa (COMUM, APOSENTADO, ESTRANGEIRO)
    const categoryClients = useMemo(() => {
        return clients.filter(c => (c.clientCategory || 'COMUM') === category);
    }, [clients, category]);

    const allMovements = useMemo(() => {
        const movementsList: Array<{
            id: string;
            clientId: string;
            clientName: string;
            clientNif: string;
            clientCadastro: string;
            type: 'disbursement' | 'payment';
            date: Date;
            amount: number;
            description: string;
            creditId: string;
            method?: string;
        }> = [];

        // 1. Add credit disbursements with consolidated payments summary (apenas clientes desta categoria)
        credits.forEach(credit => {
            const client = categoryClients.find(c => c.id === credit.clientId);
            if (client) {
                const creditPayments = payments.filter(p => p.creditId === credit.id);
                const totalPaid = creditPayments.reduce((sum, p) => sum + p.amount, 0);
                const paymentMethods = Array.from(new Set(creditPayments.filter(p => p.method).map(p => {
                    if (p.method === 'cash') return 'Numerário';
                    if (p.method === 'transfer') return 'Transferência';
                    if (p.method === 'reference') return 'Referência';
                    return p.method;
                }))).join(', ');

                let payDetail = '';
                if (totalPaid > 0) {
                    payDetail = ` | Pago: ${formatCurrency(totalPaid)}${paymentMethods ? ` via ${paymentMethods}` : ''}`;
                }

                movementsList.push({
                    id: credit.id,
                    clientId: credit.clientId,
                    clientName: client.name,
                    clientNif: client.nif,
                    clientCadastro: client.id,
                    type: 'disbursement',
                    date: new Date(credit.startDate || credit.createdAt),
                    amount: credit.principalAmount,
                    description: `Crédito Concedido - Ciclo ${credit.creditNumber || 1} (${credit.id})${payDetail} | Saldo: ${formatCurrency(credit.currentBalance)}`,
                    creditId: credit.id
                });
            }
        });

        // Sort movements by date descending
        return movementsList.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [credits, payments, categoryClients]);

    const filteredMovements = useMemo(() => {
        return allMovements.filter(movement => {
            // Search filter
            if (movementsSearchTerm.trim() !== '') {
                const term = movementsSearchTerm.toLowerCase();
                const matchName = movement.clientName.toLowerCase().includes(term);
                const matchNif = movement.clientNif.toLowerCase().includes(term);
                const matchCadastro = movement.clientCadastro.toLowerCase().includes(term);
                if (!matchName && !matchNif && !matchCadastro) {
                    return false;
                }
            }

            // Date filter
            if (movementsStartDate) {
                const start = new Date(movementsStartDate);
                start.setHours(0, 0, 0, 0);
                if (movement.date < start) return false;
            }

            if (movementsEndDate) {
                const end = new Date(movementsEndDate);
                end.setHours(23, 59, 59, 999);
                if (movement.date > end) return false;
            }

            return true;
        });
    }, [allMovements, movementsSearchTerm, movementsStartDate, movementsEndDate]);

    const handleViewClientDetailsFromMovement = (clientId: string) => {
        const client = clients.find(c => c.id === clientId);
        if (client) {
            setSelectedClient(client);
            setIsDetailsOpen(true);
        }
    };

    const filteredClients = useMemo(() => {
        return categoryClients.filter(
            (client) =>
                ((client.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                    (client.nif || '').includes(searchTerm)) &&
                (statusFilter === 'all' ? true : client.status === statusFilter)
        );
    }, [categoryClients, searchTerm, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredClients.length / itemsPerPage));
    const paginatedClients = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredClients.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredClients, currentPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter]);

    // Calcular estatísticas estritas da categoria atual (Normal, Aposentado, Estrangeiro)
    const totalClients = categoryClients.length;
    const activeClients = categoryClients.filter(client => client.status === 'active').length;
    const blockedClients = categoryClients.filter(client => client.status === 'blocked').length;
    const totalLimit = useMemo(() => categoryClients
        .filter(client => client.status === 'active')
        .reduce((acc, client) => acc + (client.usedCredit || 0), 0), [categoryClients]);

    const handleAddNew = () => {
        setEditingClient(undefined);
        setIsDialogOpen(true);
    };

    const confirmDownload = () => {
        if (clientForDownload) {
            const clientCredits = credits.filter(c => c.clientId === clientForDownload.id);
            const creditIds = clientCredits.map(c => c.id);
            const clientPayments = payments.filter(p => creditIds.includes(p.creditId));

            generateClientProfilePDF(
                clientForDownload,
                clientCredits,
                clientPayments,
                companySettings,
                user?.name,
                { includeInterest }
            );
            setIsDownloadOptionsOpen(false);
            setClientForDownload(undefined);
        }
    };

    const confirmDelete = async () => {
        if (selectedClient) {
            const hasActiveCredits = credits.some(c => c.clientId === selectedClient.id && c.status === 'active');

            if (hasActiveCredits) {
                setAlertConfig({
                    isOpen: true,
                    title: "Atenção!",
                    description: "Este cliente possui créditos ativos. Finalize os créditos antes de excluir.",
                    type: "warning"
                });
            } else {
                await deleteClient(selectedClient.id, user ? { id: user.id, name: user.name } : undefined);
                setAlertConfig({
                    isOpen: true,
                    title: "Excluído!",
                    description: "O cliente foi removido com sucesso do sistema.",
                    type: "success"
                });
            }
            setIsDeleteAlertOpen(false);
            setSelectedClient(undefined);
        }
    };

    const handleDownloadTemplate = () => {
        generateExcelTemplate(
            ['Nome', 'NIF', 'Telefone', 'Email', 'Morada', 'Limite de Crédito'],
            'Modelo_Importacao_Clientes'
        );
        setAlertConfig({
            isOpen: true,
            title: "Modelo baixado",
            description: "O modelo Excel foi salvo no seu computador.",
            type: "success"
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
                    if (!row['Nome'] || !row['NIF']) continue;
                    const exists = clients.some(c => c.nif === row['NIF']);
                    if (exists) {
                        errorCount++;
                        continue;
                    }

                    await addClient({
                        id: uuidv4(),
                        name: row['Nome'],
                        nif: String(row['NIF']),
                        phone: String(row['Telefone'] || ''),
                        email: row['Email'] || '',
                        address: row['Morada'] || '',
                        creditLimit: Number(row['Limite de Crédito']) || 0,
                        usedCredit: 0,
                        availableCredit: Number(row['Limite de Crédito']) || 0,
                        defaultInterestRate: 0,
                        lateInterestRate: 0,
                        toleranceDays: 0,
                        status: 'active',
                        riskLevel: 'medium',
                        documents: [],
                        bankCoordinates: [],
                        receiveMethod: 'transfer',
                        createdAt: new Date(),
                    }, user ? { id: user.id, name: user.name } : undefined);
                    importedCount++;
                } catch (e) {
                    errorCount++;
                }
            }

            setAlertConfig({
                isOpen: true,
                title: "Importação Concluída",
                description: `${importedCount} clientes importados com sucesso. ${errorCount} erros/ duplicados ignorados.`,
                type: importedCount > 0 ? 'success' : 'warning'
            });

        } catch (error) {
            setAlertConfig({
                isOpen: true,
                title: "Erro na Importação",
                description: "Falha ao ler o arquivo Excel.",
                type: 'error'
            });
        }
        e.target.value = '';
    };

    const handleEdit = (client: Client) => {
        setEditingClient(client);
        setIsDialogOpen(true);
    };

    const handleDetails = (client: Client) => {
        setSelectedClient(client);
        setIsDetailsOpen(true);
    };

    const handleViewHistory = (name: string) => {
        navigate(`/pagamentos?search=${encodeURIComponent(name)}`);
    };

    const handleDeleteClick = (client: Client) => {
        setSelectedClient(client);
        setIsDeleteAlertOpen(true);
    };

    const handleDownloadClick = (client: Client) => {
        setClientForDownload(client);
        setIsDownloadOptionsOpen(true);
    };

    const handleNewCredit = (client: Client) => {
        setSelectedClient(client);
        setCreditPrefillAmount(undefined);
        setDecisionType(null);
        setNewLimitInput(String(client.creditLimit));
        setIsDecisionModalOpen(true);
    };

    const handleGrantRemaining = (client: Client) => {
        setSelectedClient(client);
        setCreditPrefillAmount(client.availableCredit);
        setIsNewCreditDialogOpen(true);
    };

    const handleDecisionConfirm = async () => {
        if (!selectedClient) return;

        try {
            if (decisionType === 'A') {
                const limitVal = parseFloat(newLimitInput.replace(/\s/g, '').replace(',', '.'));
                if (isNaN(limitVal) || limitVal <= 0) {
                    toast({
                        title: "Valor Inválido",
                        description: "Por favor insira um limite de crédito válido.",
                        variant: "destructive"
                    });
                    return;
                }
                const used = selectedClient.usedCredit || 0;
                const newAvailable = Math.max(0, limitVal - used);
                await updateClient(selectedClient.id, {
                    creditLimit: limitVal,
                    availableCredit: newAvailable,
                }, user ? { id: user.id, name: user.name } : undefined);
            } else if (decisionType === 'B') {
                await updateClient(selectedClient.id, {
                    availableCredit: selectedClient.creditLimit,
                    usedCredit: 0
                }, user ? { id: user.id, name: user.name } : undefined);
            } else {
                toast({
                    title: "Opção Obrigatória",
                    description: "Por favor escolha uma das opções.",
                    variant: "destructive"
                });
                return;
            }

            setIsDecisionModalOpen(false);
            setDecisionType(null);
            setIsNewCreditDialogOpen(true);
        } catch (error: any) {
            toast({
                title: "Erro ao atualizar limites",
                description: error.message || "Não foi possível atualizar os limites do cliente.",
                variant: "destructive"
            });
        }
    };

    const isFullyPaid = (clientId: string) => {
        const clientCredits = credits.filter(c => c.clientId === clientId && c.status !== 'rejected');
        if (clientCredits.length === 0) return true;

        const hasUnpaid = clientCredits.some(c => c.status !== 'paid' && (Number(c.currentBalance) || 0) > 0.1);
        return !hasUnpaid;
    };

    const handleSendEmail = async (client: Client) => {
        try {
            const doc = generateClientInfoSheetPDF(client, companySettings, user?.name);
            const pdfBase64 = doc.output('datauristring');
            await ServicoEmail.sendWelcomeEmail(client, companySettings, pdfBase64);
            setAlertConfig({
                isOpen: true,
                title: "Email Enviado",
                description: "A ficha do cliente foi enviada com sucesso.",
                type: 'success'
            });
        } catch (error) {
            console.error("Erro ao preparar email:", error);
            toast({
                title: "Erro ao enviar email",
                description: "Não foi possível enviar o email de boas-vindas.",
                variant: "destructive"
            });
        }
    };

    const handleSubmit = async (data: any) => {
        try {
            if (editingClient) {
                await updateClient(editingClient.id, data, user ? { id: user.id, name: user.name } : undefined);
                setAlertConfig({
                    isOpen: true,
                    title: "Atualizado!",
                    description: "Os dados do cliente foram atualizados com sucesso.",
                    type: "success"
                });
            } else {
                const newClient = {
                    ...data,
                    id: uuidv4(),
                    clientCategory: category,
                    usedCredit: 0,
                    availableCredit: data.creditLimit,
                    createdAt: new Date(),
                };
                await addClient(newClient, user ? { id: user.id, name: user.name } : undefined);
                try {
                    generateClientProfilePDF(newClient, [], [], companySettings, user?.name);
                } catch (e) {
                    console.error("Erro ao gerar PDF:", e);
                }
                if (newClient.phone) {
                    const cleanPhone = newClient.phone.replace(/\D/g, '');
                    const message = encodeURIComponent(`Olá ${newClient.name}, seja bem-vindo à ${companySettings.name}! O seu cadastro foi realizado com sucesso.`);
                    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
                }
                setAlertConfig({
                    isOpen: true,
                    title: "Sucesso!",
                    description: "Novo cliente cadastrado com sucesso. A ficha PDF foi gerada e o WhatsApp aberto para boas-vindas.",
                    type: "success"
                });
            }
            setIsDialogOpen(false);
            setEditingClient(undefined);
        } catch (error: any) {
            toast({
                title: "Erro",
                description: error.message || "Ocorreu um erro ao salvar o cliente.",
                variant: "destructive"
            });
        }
    };

    const handleNewCreditSubmit = async (data: any) => {
        if (!selectedClient) return;

        try {
            const clientCredits = credits.filter(c => c.clientId === selectedClient.id);
            const nextCycle = clientCredits.length + 1;

            const totalInterest = (data.principalAmount * data.interestRate) / 100;
            const totalToReturn = data.principalAmount + totalInterest;
            const generatedId = `CR-${crypto.randomUUID()}`;

            await addCredit({
                ...data,
                id: generatedId,
                clientName: selectedClient.name,
                currentBalance: data.principalAmount,
                paidInstallments: 0,
                daysOverdue: 0,
                accruedInterest: totalInterest,
                lateInterest: 0,
                totalDue: totalToReturn,
                createdAt: new Date(),
                status: 'active',
                requestedBy: user?.name || 'Sistema',
                creditNumber: nextCycle
            }, user ? { id: user.id, name: user.name } : undefined);

            setAlertConfig({
                isOpen: true,
                title: "Crédito Registado!",
                description: `O ${nextCycle}º ciclo de crédito para ${selectedClient.name} foi iniciado com sucesso.`,
                type: "success"
            });
            setIsNewCreditDialogOpen(false);
            setSelectedClient(undefined);
        } catch (error: any) {
            setAlertConfig({
                isOpen: true,
                title: "Erro!",
                description: error.message || "Ocorreu um erro inesperado ao salvar o cliente.",
                type: "error"
            });
        }
    };

    return (
        <MainLayout title="Clientes" subtitle="Gestão de clientes e limites de crédito">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:w-96">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Pesquisar por nome ou NIF..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="gap-2" onClick={handleDownloadTemplate}>
                        <Download className="h-4 w-4" />
                        Modelo
                    </Button>
                    <div className="relative">
                        <Button variant="outline" className="gap-2 pointer-events-none">
                            <Upload className="h-4 w-4" />
                            Importar
                        </Button>
                        <Input
                            type="file"
                            accept=".xlsx, .xls"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={handleImportExcel}
                        />
                    </div>
                    <Button className="gap-2" onClick={handleAddNew}>
                        <Plus className="h-4 w-4" />
                        {labels.novo}
                    </Button>
                </div>
            </div>

            {/* KPI Cards Estilo Modelo Colorido Arredondado */}
            <div className="mb-6 grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                {/* Card 1: Total de Clientes (Azul Pastel #82C9FF) */}
                <div 
                    onClick={() => { setStatusFilter('all'); setIsLimitsModalOpen(true); }}
                    className="card-kpi-sky cursor-pointer hover:scale-[1.02] active:scale-[0.99] group"
                >
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0 group-hover:scale-105 transition-transform">
                                <Users className="h-5 w-5" />
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                Total de Clientes
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setStatusFilter('all');
                                setIsLimitsModalOpen(true);
                            }}
                            title="Ver Todos os Clientes"
                            className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-2xs shrink-0"
                        >
                            <Eye className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {totalClients}
                        </p>
                    </div>

                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Base geral de registos no sistema
                    </p>
                </div>

                {/* Card 2: Clientes Activos (Verde Menta Pastel #86EFAC) */}
                <div 
                    onClick={() => { setStatusFilter('active'); setIsLimitsModalOpen(true); }}
                    className="card-kpi-mint cursor-pointer hover:scale-[1.02] active:scale-[0.99] group"
                >
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0 group-hover:scale-105 transition-transform">
                                <UserCheck className="h-5 w-5" />
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                Clientes Activos
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setStatusFilter('active');
                                setIsLimitsModalOpen(true);
                            }}
                            title="Ver Clientes Activos"
                            className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-2xs shrink-0"
                        >
                            <Eye className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {activeClients}
                        </p>
                    </div>

                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        {totalClients > 0 ? Math.round((activeClients / totalClients) * 100) : 0}% da carteira total activa
                    </p>
                </div>

                {/* Card 3: Clientes Bloqueados (Coral / Rosa Pastel #FDA4AF) */}
                <div 
                    onClick={() => { setStatusFilter('blocked'); setIsLimitsModalOpen(true); }}
                    className="card-kpi-coral cursor-pointer hover:scale-[1.02] active:scale-[0.99] group"
                >
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0 group-hover:scale-105 transition-transform">
                                <UserX className="h-5 w-5" />
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                Bloqueados
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setStatusFilter('blocked');
                                setIsLimitsModalOpen(true);
                            }}
                            title="Ver Clientes Bloqueados"
                            className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-2xs shrink-0"
                        >
                            <Eye className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                            {blockedClients}
                        </p>
                    </div>

                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        {blockedClients === 0 ? 'Nenhum cliente com restrição' : 'Contas bloqueadas ou suspensas'}
                    </p>
                </div>

                {/* Card 4: Valor Total Concedido (Dourado / Âmbar Pastel #FED771) */}
                <div 
                    onClick={() => setIsMovementsModalOpen(true)}
                    className="card-kpi-amber cursor-pointer hover:scale-[1.02] active:scale-[0.99] group"
                >
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0 group-hover:scale-105 transition-transform">
                                <Wallet className="h-5 w-5" />
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                Crédito Concedido
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsMovementsModalOpen(true);
                            }}
                            title="Ver Detalhes por Cliente"
                            className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-2xs shrink-0"
                        >
                            <Eye className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="my-2">
                        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(totalLimit)}>
                            {formatCurrency(totalLimit)}
                        </p>
                    </div>

                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                        Total em crédito para {labels.plural} activos
                    </p>
                </div>
            </div>

            <Dialog open={isLimitsModalOpen} onOpenChange={setIsLimitsModalOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>
                            {statusFilter === 'all' && `Todos os ${labels.plural}`}
                            {statusFilter === 'active' && `${labels.plural} Activos`}
                            {statusFilter === 'blocked' && `${labels.plural} Bloqueados`}
                        </DialogTitle>
                        <DialogDescription>
                            {statusFilter === 'all' && `Lista de ${labels.plural} registados no sistema e seus limites.`}
                            {statusFilter === 'active' && `Lista de ${labels.plural} com acesso activo ao crédito.`}
                            {statusFilter === 'blocked' && `Lista de ${labels.plural} com acesso ao crédito bloqueado.`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto pr-2">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead className="text-right">Limite Total</TableHead>
                                    <TableHead className="text-right">Usado</TableHead>
                                    <TableHead className="text-right">Disponível</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {categoryClients
                                    .filter(c => statusFilter === 'all' ? true : c.status === statusFilter)
                                    .sort((a, b) => b.creditLimit - a.creditLimit)
                                    .map((c) => (
                                        <TableRow key={c.id}>
                                            <TableCell className="font-medium">
                                                <div>
                                                    <p>{c.name}</p>
                                                    <p className="text-[10px] text-muted-foreground uppercase">{c.status === 'active' ? 'Activo' : 'Bloqueado'}</p>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-foreground">{formatCurrency(c.creditLimit)}</TableCell>
                                            <TableCell className="text-right text-muted-foreground">{formatCurrency(c.usedCredit)}</TableCell>
                                            <TableCell className="text-right text-success font-medium">{formatCurrency(c.availableCredit)}</TableCell>
                                        </TableRow>
                                    ))}
                                <TableRow className="bg-muted/50 font-bold">
                                    <TableCell>TOTAL DA SELECÇÃO</TableCell>
                                    <TableCell className="text-right text-primary text-lg">
                                        {formatCurrency(categoryClients.filter(c => statusFilter === 'all' ? true : c.status === statusFilter).reduce((acc, c) => acc + c.creditLimit, 0))}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatCurrency(categoryClients.filter(c => statusFilter === 'all' ? true : c.status === statusFilter).reduce((acc, c) => acc + c.usedCredit, 0))}
                                    </TableCell>
                                    <TableCell className="text-right text-success">
                                        {formatCurrency(categoryClients.filter(c => statusFilter === 'all' ? true : c.status === statusFilter).reduce((acc, c) => acc + c.availableCredit, 0))}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isMovementsModalOpen} onOpenChange={setIsMovementsModalOpen}>
                <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>Movimentos de Créditos e Pagamentos</DialogTitle>
                        <DialogDescription>
                            Consulte aqui o histórico detalhado de concessão de créditos e pagamentos dos clientes.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Barra de Filtros */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 items-end bg-slate-50/50 p-4 rounded-xl border border-slate-100 mb-2">
                        <div className="sm:col-span-2">
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Pesquisar Cliente</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Nome, BI, NIF ou Nº Cadastro..."
                                    value={movementsSearchTerm}
                                    onChange={(e) => setMovementsSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Data Inicial</label>
                            <Input
                                type="date"
                                value={movementsStartDate}
                                onChange={(e) => setMovementsStartDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Data Final</label>
                            <Input
                                type="date"
                                value={movementsEndDate}
                                onChange={(e) => setMovementsEndDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 mt-2">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-100/50">
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Movimento</TableHead>
                                    <TableHead>Data</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="text-right">Acções</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredMovements.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground italic">
                                            Nenhum movimento encontrado para os filtros selecionados.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredMovements.map((mov) => (
                                        <TableRow key={mov.id} className="hover:bg-slate-50/50">
                                            <TableCell className="font-medium">
                                                <div>
                                                    <p className="text-slate-900 font-semibold">{mov.clientName}</p>
                                                    <p className="text-[10px] text-muted-foreground font-mono">CADASTRO: {mov.clientCadastro} | NIF/BI: {mov.clientNif}</p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {mov.type === 'disbursement' ? (
                                                    <Badge variant="success" className="font-bold text-xs uppercase tracking-wide px-2 py-0.5">
                                                        Crédito Concedido
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="info" className="font-bold text-xs uppercase tracking-wide px-2 py-0.5">
                                                        Pagamento
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-slate-600 font-medium">{formatDate(mov.date)}</TableCell>
                                            <TableCell className={`text-right font-bold ${mov.type === 'disbursement' ? 'text-slate-900' : 'text-success'}`}>
                                                {mov.type === 'disbursement' ? '-' : '+'}{formatCurrency(mov.amount)}
                                            </TableCell>
                                            <TableCell className="text-slate-600 text-xs">{mov.description}</TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-xs gap-1 border-primary/20 text-primary hover:bg-primary/5 font-semibold"
                                                    onClick={() => handleViewClientDetailsFromMovement(mov.clientId)}
                                                >
                                                    <Eye className="h-3 w-3" />
                                                    Ver Limites
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="card-elevated overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-primary/10 hover:bg-primary/10 border-b-2 border-primary/20">
                            <TableHead className="text-primary font-bold text-xs uppercase tracking-wider">Cliente</TableHead>
                            <TableHead className="text-primary font-bold text-xs uppercase tracking-wider">BI/NIF</TableHead>
                            <TableHead className="text-primary font-bold text-xs uppercase tracking-wider">Contacto</TableHead>
                            <TableHead className="text-right text-primary font-bold text-xs uppercase tracking-wider">Limite</TableHead>
                            <TableHead className="text-right text-primary font-bold text-xs uppercase tracking-wider">Utilizado</TableHead>
                            <TableHead className="text-right text-primary font-bold text-xs uppercase tracking-wider">Disponível</TableHead>
                            <TableHead className="text-primary font-bold text-xs uppercase tracking-wider">Status</TableHead>
                            <TableHead className="text-primary font-bold text-xs uppercase tracking-wider">Risco</TableHead>
                            {companySettings.enableScoringModule !== false && <TableHead className="text-right text-primary font-bold text-xs uppercase tracking-wider">Score</TableHead>}
                            <TableHead className="w-12"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredClients.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                    Nenhum cliente encontrado.
                                </TableCell>
                            </TableRow>
                        ) : paginatedClients.map((client, index) => (
                            <TableRow key={client.id} className="animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
                                <TableCell>
                                    <div>
                                        <p className="font-medium text-foreground">{client.name}</p>
                                        <p className="text-sm text-muted-foreground">{client.address}</p>
                                    </div>
                                </TableCell>
                                <TableCell><span className="font-mono text-sm">{client.nif}</span></TableCell>
                                <TableCell>
                                    <div className="flex gap-1">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                            <a href={`tel:${client.phone}`}><Phone className="h-4 w-4" /></a>
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" asChild>
                                            <a
                                                href={`https://wa.me/244${(client.phone || '').replace(/\D/g, '').slice(-9)}?text=${encodeURIComponent(`Olá ${client.name}, seja bem-vindo à ${companySettings.name}! O seu cadastro no nosso sistema de crédito foi realizado com sucesso. Estamos à sua disposição.`)}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                title="Enviar WhatsApp"
                                            >
                                                <svg
                                                    viewBox="0 0 24 24"
                                                    className="h-5 w-5 fill-current"
                                                    xmlns="http://www.w3.org/2000/svg"
                                                >
                                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                                </svg>
                                            </a>
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => handleSendEmail(client)} title="Enviar Email de Boas-Vindas">
                                            <Mail className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(client.creditLimit)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(client.usedCredit)}</TableCell>
                                <TableCell className="text-right font-medium text-success">{formatCurrency(client.availableCredit)}</TableCell>
                                <TableCell><Badge variant={statusConfig[client.status]?.variant || 'default'}>{statusConfig[client.status]?.label || client.status}</Badge></TableCell>
                                <TableCell><Badge variant={riskConfig[client.riskLevel]?.variant || 'default'}>{riskConfig[client.riskLevel]?.label || client.riskLevel}</Badge></TableCell>
                                {companySettings.enableScoringModule !== false && (
                                    <TableCell className="text-right">
                                        <div className="flex flex-col items-end">
                                            {(() => {
                                                let score = 50;
                                                if (client.riskLevel === 'low') score = 85;
                                                else if (client.riskLevel === 'high') score = 25;
                                                if (client.status === 'blocked') score = 0;

                                                const colorClass = score >= 70 ? 'text-success' : score >= 40 ? 'text-warning' : 'text-destructive';
                                                const bgClass = score >= 70 ? 'bg-success/10' : score >= 40 ? 'bg-warning/10' : 'bg-destructive/10';

                                                return (
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorClass} ${bgClass}`}>
                                                        {score} pts
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </TableCell>
                                )}
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem className="gap-2" onClick={() => handleDetails(client)}><Eye className="h-4 w-4" />Ver Detalhes</DropdownMenuItem>
                                            <DropdownMenuItem
                                                className="gap-2"
                                                onClick={() => handleNewCredit(client)}
                                                disabled={!isFullyPaid(client.id)}
                                            >
                                                <Plus className="h-4 w-4" />Novo Crédito
                                            </DropdownMenuItem>
                                            {client.availableCredit > 0 && (
                                                <DropdownMenuItem
                                                    className="gap-2 text-success focus:text-success"
                                                    onClick={() => handleGrantRemaining(client)}
                                                >
                                                    <CreditCard className="h-4 w-4" />Conceder Restante
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuItem className="gap-2" onClick={() => handleViewHistory(client.name)}><History className="h-4 w-4" />Ver Histórico</DropdownMenuItem>
                                            <DropdownMenuItem className="gap-2 text-emerald-600 focus:text-emerald-600 font-semibold" onClick={() => handleDetails(client)}><Receipt className="h-4 w-4" />Ficha & Extrato de Pagamentos</DropdownMenuItem>
                                            <DropdownMenuItem className="gap-2" onClick={() => handleEdit(client)}><Edit className="h-4 w-4" />Editar</DropdownMenuItem>
                                            <DropdownMenuItem className="gap-2" onClick={() => handleDownloadClick(client)}><Download className="h-4 w-4" />Baixar Ficha (PDF)</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="gap-2 text-destructive" onClick={() => handleDeleteClick(client)}><Trash2 className="h-4 w-4" />Excluir</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                {/* Controles de Paginação */}
                <div className="flex items-center justify-between border-t border-muted px-4 py-4 bg-muted/20">
                    <div className="text-sm text-muted-foreground">
                        Mostrando <span className="font-medium">{filteredClients.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span> a <span className="font-medium">{Math.min(filteredClients.length, currentPage * itemsPerPage)}</span> de <span className="font-medium">{filteredClients.length}</span> {labels.plural}
                    </div>
                    <div className="flex items-center space-x-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="h-8 w-8 p-0"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm font-medium">
                            Página {currentPage} de {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className="h-8 w-8 p-0"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) setEditingClient(undefined);
            }}>
                <DialogContent className="max-w-[96vw] w-full xl:max-w-7xl 2xl:max-w-[1440px] h-[92vh] max-h-[96vh] flex flex-col overflow-hidden p-0 gap-0 border-slate-200 shadow-2xl rounded-2xl bg-white">
                    <DialogHeader className="px-8 py-5 bg-[#0B1527] text-white border-b border-slate-800 shrink-0 m-0 relative">
                        <DialogTitle className="text-2xl font-bold tracking-tight text-white">
                            {editingClient ? `Editar ${labels.singular}` : `Cadastrar ${labels.singular}`}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-300 mt-1">
                            Preencha os dados abaixo para {editingClient ? 'atualizar' : 'registar'} um cliente.
                        </DialogDescription>
                    </DialogHeader>
                    <ClientForm
                        category={category}
                        onSubmit={handleSubmit}
                        initialData={editingClient || undefined}
                        onCancel={() => setIsDialogOpen(false)}
                        submitLabel={editingClient ? 'Atualizar Dados' : 'Cadastrar Cliente'}
                    />
                </DialogContent>
            </Dialog>

            <ClientDetailsModal 
                client={selectedClient} 
                open={isDetailsOpen} 
                onOpenChange={(open) => { 
                    setIsDetailsOpen(open); 
                    if (!open) setSelectedClient(undefined); 
                }} 
                onGrantRemaining={handleGrantRemaining} 
            />

            <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Tem certeza absoluta?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita. Isso excluirá permanentemente o cliente <strong> {selectedClient?.name} </strong> e removerá seus dados do servidor local.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setSelectedClient(undefined)}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Confirmar Exclusão</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertModal isOpen={alertConfig.isOpen} onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })} title={alertConfig.title} description={alertConfig.description} type={alertConfig.type} />

            <Dialog open={isDownloadOptionsOpen} onOpenChange={setIsDownloadOptionsOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Opções de Download</DialogTitle>
                        <DialogDescription>Escolha o que deseja incluir na ficha do cliente.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-muted/50 cursor-pointer" onClick={() => setIncludeInterest(!includeInterest)}>
                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${includeInterest ? 'bg-primary border-primary' : 'bg-background border-input'}`}>{includeInterest && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}</div>
                            <div className="flex-1">
                                <p className="text-sm font-medium leading-none">Incluir Informações de Juros</p>
                                <p className="text-xs text-muted-foreground mt-1">Exibe taxa de juro padrão e de mora.</p>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDownloadOptionsOpen(false)}>Cancelar</Button>
                        <Button onClick={confirmDownload}>Gerar PDF</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isNewCreditDialogOpen} onOpenChange={(open) => {
                setIsNewCreditDialogOpen(open);
                if (!open) {
                    setSelectedClient(undefined);
                    setCreditPrefillAmount(undefined);
                }
            }}>
                <DialogContent className={CREDIT_DIALOG_CONTENT_CLASS}>
                    <DialogHeader className={CREDIT_DIALOG_HEADER_CLASS}>
                        <DialogTitle className="text-xl font-bold tracking-tight text-white">
                            {creditPrefillAmount !== undefined ? 'Conceder Restante do Valor' : 'Novo Ciclo de Crédito'}
                        </DialogTitle>
                        <DialogDescription className="mt-1 text-sm text-white/75">
                            {creditPrefillAmount !== undefined
                                ? `Concedendo o restante do valor disponível (${formatCurrency(creditPrefillAmount)}) para ${selectedClient?.name}.`
                                : `Iniciando o ${credits.filter(c => c.clientId === selectedClient?.id).length + 1}º ciclo de crédito para ${selectedClient?.name}.`
                            }
                        </DialogDescription>
                    </DialogHeader>
                    {selectedClient && (
                        <CreditForm
                            onSubmit={handleNewCreditSubmit}
                            clients={[selectedClient]}
                            credits={credits}
                            prefillData={{
                                clientId: selectedClient.id,
                                principalAmount: creditPrefillAmount
                            }}
                            onCancel={() => setIsNewCreditDialogOpen(false)}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={isDecisionModalOpen} onOpenChange={setIsDecisionModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-primary font-bold">
                            <TrendingUp className="h-5 w-5" />
                            Ajuste de Plafom e Novo Ciclo
                        </DialogTitle>
                        <DialogDescription>
                            Para iniciar um novo ciclo de crédito para <strong>{selectedClient?.name}</strong>, escolha uma das opções de limite abaixo:
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        {/* Option A Card */}
                        <div
                            onClick={() => setDecisionType('A')}
                            className={`flex flex-col p-4 border rounded-xl cursor-pointer transition-all hover:bg-muted/50 ${
                                decisionType === 'A' ? "border-primary bg-primary/5 shadow-sm" : "border-slate-200 bg-white"
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <input
                                    type="radio"
                                    name="decisionOption"
                                    checked={decisionType === 'A'}
                                    onChange={() => setDecisionType('A')}
                                    className="text-primary focus:ring-primary h-4 w-4 mt-1"
                                />
                                <div className="flex-1">
                                    <p className="font-bold text-slate-900 flex items-center gap-1.5">
                                        Opção A: Aumentar Limite
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Defina um novo limite global de crédito para o cliente neste novo ciclo.
                                    </p>
                                </div>
                            </div>

                            {decisionType === 'A' && (
                                <div className="mt-3 pl-7 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
                                        Novo Limite (AOA/Kz)
                                    </label>
                                    <Input
                                        type="text"
                                        placeholder="Ex: 500 000"
                                        value={newLimitInput}
                                        onChange={(e) => setNewLimitInput(e.target.value)}
                                        className="h-10 text-sm font-semibold"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Option B Card */}
                        <div
                            onClick={() => setDecisionType('B')}
                            className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all hover:bg-muted/50 ${
                                decisionType === 'B' ? "border-primary bg-primary/5 shadow-sm" : "border-slate-200 bg-white"
                            }`}
                        >
                            <input
                                type="radio"
                                name="decisionOption"
                                checked={decisionType === 'B'}
                                onChange={() => setDecisionType('B')}
                                className="text-primary focus:ring-primary h-4 w-4 mt-1"
                            />
                            <div className="flex-1">
                                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                                    Opção B: Manter Limite Anterior
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Mantém o limite atual de {selectedClient ? formatCurrency(selectedClient.creditLimit) : '0,00 AOA'} e redefine o saldo utilizado para 0.
                                </p>
                             </div>
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => { setIsDecisionModalOpen(false); setSelectedClient(undefined); }} className="h-11">
                            Cancelar
                        </Button>
                        <Button onClick={handleDecisionConfirm} className="h-11 bg-primary font-bold">
                            Confirmar e Continuar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}
