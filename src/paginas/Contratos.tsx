import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { formatCurrency, formatDate } from '@/bibliotecas/formatters';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/componentes/ui/table';
import {
    Search,
    Plus,
    MoreVertical,
    Eye,
    FileText,
    Download,
    Upload,
    Trash2,
    Save,
    PenTool,
    X,
    Printer,
    FileCheck2,
    FileX2,
    BadgeCheck,
    PencilLine,
    RotateCcw,
    Braces,
    PanelLeftClose,
    Users,
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/componentes/ui/dialog';
import { CreditForm } from '@/componentes/forms/CreditForm';
import { CREDIT_DIALOG_CONTENT_CLASS, CREDIT_DIALOG_HEADER_CLASS } from '@/componentes/forms/credit-dialog-styles';
import { PromessaDetailsModal } from '@/componentes/modals/PromessaDetailsModal';
import { AlertModal } from '@/componentes/ui/AlertModal';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/componentes/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/componentes/ui/select';
import {
    CONTRACT_PLACEHOLDERS,
    DEFAULT_CONTRACT_TITLE,
    generateContractPDF,
    parseContractTerms,
    resolveContractClauses,
} from '@/bibliotecas/pdf';
import { printPdfFromUrl } from '@/bibliotecas/pdfPrint';
import { useToast } from '@/componentes/ui/use-toast';
import { ClientDocument } from '@/tipos/credito';
import { v4 as uuidv4 } from 'uuid';
import { PdfCanvasViewer } from '@/componentes/ui/PdfCanvasViewer';
import { SeletorPeriodo } from '@/componentes/comum/SeletorPeriodo';
import { defaultPeriod, isInPeriod, periodRange, type PeriodSelection } from '@/bibliotecas/periodos';
import { ServicoAuditoria } from '@/servicos/ServicoAuditoria';

type BadgeVariant = 'default' | 'primary' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info' | 'outline';

const statusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
    active: { label: 'Activo', variant: 'success' },
    expired: { label: 'Expirado', variant: 'warning' },
    terminated: { label: 'Terminado', variant: 'destructive' },
    draft: { label: 'Rascunho', variant: 'secondary' },
    paid: { label: 'Encerrado por pagamento total', variant: 'success' },
};

type StatusFilter = 'all' | 'active' | 'paid' | 'closed';

type EditorState = { open: boolean; title: string; clauses: string; dirty: boolean; edited: boolean };

const contractDate = (contract: any) => contract.startDate || contract.createdAt;

export default function Contracts() {
    const { contracts, companySettings, clients, credits, updateCompanySettings, addDocumentToClient, deleteDocumentFromClient, updateContract } = useData();
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [period, setPeriod] = useState<PeriodSelection>(() => defaultPeriod(new Date(), 'month'));
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<any>(null);
    const [prefillContractData, setPrefillContractData] = useState<any>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const [contractModalSearch, setContractModalSearch] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [customClauses, setCustomClauses] = useState(companySettings.customClauses || '');
    const [previewSignature, setPreviewSignature] = useState<string | undefined>(undefined);
    const [editor, setEditor] = useState<EditorState>({ open: false, title: DEFAULT_CONTRACT_TITLE, clauses: '', dirty: false, edited: false });
    const [isSavingTerms, setIsSavingTerms] = useState(false);
    const clausesRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    // Estado para controle de qual cliente estamos vendo os contratos
    const [clientContractView, setClientContractView] = useState<{
        isOpen: boolean;
        clientName: string;
        contracts: any[];
    }>({
        isOpen: false,
        clientName: '',
        contracts: []
    });

    const [promessaModal, setPromessaModal] = useState<{
        isOpen: boolean;
        contract: any | null;
        client: any | null;
    }>({
        isOpen: false,
        contract: null,
        client: null
    });

    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        type: 'success' | 'destructive' | 'warning' | 'info';
    }>({
        isOpen: false,
        title: '',
        description: '',
        type: 'info'
    });

    const getContractStatusKey = useCallback((contract: any) => {
        const linkedCredit = credits.find(c => c.id === contract.id || contract.title?.includes(c.id));
        if (contract.status === 'terminated') return 'terminated';
        if (contract.status === 'paid' || linkedCredit?.status === 'paid') return 'paid';
        return contract.status;
    }, [credits]);

    const clientById = useMemo(() => new Map(clients.map(client => [client.id, client])), [clients]);

    // Contratos do período seleccionado (os cartões e as tabelas usam sempre o mesmo período).
    const range = useMemo(() => periodRange(period), [period]);
    const periodContracts = useMemo(() => contracts.filter(contract => isInPeriod(contractDate(contract), range)), [contracts, range]);
    const monthsWithContracts = useMemo(() => new Set(contracts
        .filter(contract => new Date(contractDate(contract)).getFullYear() === period.year)
        .map(contract => new Date(contractDate(contract)).getMonth())), [contracts, period.year]);

    const matchesStatus = useCallback((contract: any, filter: StatusFilter) => {
        const key = getContractStatusKey(contract);
        if (filter === 'all') return true;
        if (filter === 'closed') return key === 'terminated' || key === 'expired';
        return key === filter;
    }, [getContractStatusKey]);

    const periodTotals = useMemo(() => {
        const sum = (filter: StatusFilter) => {
            const list = periodContracts.filter(contract => matchesStatus(contract, filter));
            return { count: list.length, value: list.reduce((total, contract) => total + (Number(contract.value) || 0), 0) };
        };
        return { all: sum('all'), active: sum('active'), paid: sum('paid'), closed: sum('closed') };
    }, [periodContracts, matchesStatus]);

    const visibleContracts = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        return periodContracts.filter(contract => {
            if (!matchesStatus(contract, statusFilter)) return false;
            if (!query) return true;
            const client = clientById.get(contract.clientId);
            return [contract.clientName, contract.id, contract.title, client?.nif, client?.phone]
                .filter(Boolean).join(' ').toLowerCase().includes(query);
        });
    }, [periodContracts, statusFilter, searchTerm, clientById, matchesStatus]);

    // Agrupar contratos (já filtrados) por cliente
    const groupedContracts = useMemo(() => {
        const groups: Record<string, { clientName: string; clientId: string; total: number; active: number; value: number; contracts: any[] }> = {};
        visibleContracts.forEach(contract => {
            const key = contract.clientId || contract.clientName;
            if (!groups[key]) groups[key] = { clientName: contract.clientName, clientId: contract.clientId, total: 0, active: 0, value: 0, contracts: [] };
            groups[key].total++;
            groups[key].value += Number(contract.value) || 0;
            if (getContractStatusKey(contract) === 'active') groups[key].active++;
            groups[key].contracts.push(contract);
        });
        return Object.values(groups).sort((a, b) => a.clientName.localeCompare(b.clientName));
    }, [visibleContracts, getContractStatusKey]);

    const handleRenew = (contract: any) => {
        setAlertConfig({
            isOpen: true,
            title: 'Renovação indisponível',
            description: `A renovação do contrato ${contract.id} exige uma política aprovada de reestruturação e um novo plano com aprovação. Os valores do contrato original permanecem protegidos.`,
            type: 'info'
        });
    };

    const handleViewPromessaContract = (contract: any) => {
        const client = clients.find(c => c.id === contract.clientId);
        setPromessaModal({
            isOpen: true,
            contract,
            client: client || null
        });
    };

    /** Dados usados no PDF: o crédito ligado (valores, prazos) mais os termos guardados no contrato. */
    const contractPdfData = useCallback((contract: any) => {
        const credit = credits.find(c => c.id === contract.id);
        const client = clientById.get(contract.clientId);
        return { ...(credit || contract), terms: contract.terms, clientNif: (credit as any)?.clientNif || contract.clientNif || client?.nif };
    }, [credits, clientById]);

    const renderPreview = useCallback((contract: any, options: { templateId?: string; title?: string; clauses?: string; signature?: string }) => {
        const url = generateContractPDF(contractPdfData(contract), companySettings, [], 'blob', user?.name, options.signature, {
            templateId: options.templateId,
            title: options.title,
            clauses: options.clauses,
        });
        if (url) setPreviewPdfUrl(url as string);
        return url;
    }, [contractPdfData, companySettings, user?.name]);

    const authorizedSignature = useCallback(() => {
        if (!user || !companySettings.digitalSignatureEnabled || !user.signature) return undefined;
        try {
            const rawSigners = companySettings.authorizedSigners as any;
            const authorizedIds: string[] = Array.isArray(rawSigners)
                ? rawSigners
                : (typeof rawSigners === 'string' && rawSigners.length > 0 ? JSON.parse(rawSigners) : []);
            return Array.isArray(authorizedIds) && authorizedIds.includes(user.id) ? user.signature : undefined;
        } catch {
            return undefined;
        }
    }, [user, companySettings.digitalSignatureEnabled, companySettings.authorizedSigners]);

    const handleViewContract = (contract: any, templateId?: string) => {
        try {
            const data = contractPdfData(contract);
            const saved = parseContractTerms(contract.terms);
            const effectiveTemplate = templateId || selectedTemplateId;
            // Ao trocar de modelo usa-se o texto do modelo; ao abrir, a versão editada guardada (se existir).
            const useSaved = !templateId && saved;
            const title = (useSaved && saved?.title) || DEFAULT_CONTRACT_TITLE;
            const clauses = (useSaved && saved?.clauses) || resolveContractClauses(data, companySettings, effectiveTemplate);
            const signature = authorizedSignature();

            setPreviewSignature(signature);
            setEditor(prev => ({ open: prev.open, title, clauses, dirty: false, edited: Boolean(useSaved) }));
            setSelectedContract(contract);
            if (templateId) setSelectedTemplateId(templateId);
            renderPreview(contract, { templateId: effectiveTemplate, title, clauses, signature });
        } catch (error) {
            console.error('[Contratos] Falha ao gerar contrato:', error);
            toast({
                title: "Erro",
                description: "Falha ao gerar contrato.",
                variant: 'destructive',
            });
        }
    };

    // Liberta o URL anterior sempre que a pré-visualização muda ou o modal fecha.
    useEffect(() => {
        return () => {
            if (previewPdfUrl) {
                try { URL.revokeObjectURL(previewPdfUrl); } catch (e) { }
            }
        };
    }, [previewPdfUrl]);

    // Edição em tempo real: regenera a pré-visualização 600 ms depois da última alteração.
    useEffect(() => {
        if (!editor.dirty || !selectedContract || !previewPdfUrl) return;
        const timer = window.setTimeout(() => {
            try {
                renderPreview(selectedContract, { templateId: selectedTemplateId, title: editor.title, clauses: editor.clauses, signature: previewSignature });
            } catch (error) {
                console.error('[Contratos] Falha ao actualizar a pré-visualização:', error);
            }
        }, 600);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor.title, editor.clauses, editor.dirty]);

    const updateEditor = (changes: Partial<EditorState>) => setEditor(prev => ({ ...prev, ...changes, dirty: true }));

    const insertPlaceholder = (token: string) => {
        const textarea = clausesRef.current;
        const start = textarea?.selectionStart ?? editor.clauses.length;
        const end = textarea?.selectionEnd ?? editor.clauses.length;
        const next = editor.clauses.slice(0, start) + token + editor.clauses.slice(end);
        updateEditor({ clauses: next });
        requestAnimationFrame(() => {
            textarea?.focus();
            textarea?.setSelectionRange(start + token.length, start + token.length);
        });
    };

    const handleResetTemplate = () => {
        if (!selectedContract) return;
        updateEditor({
            title: DEFAULT_CONTRACT_TITLE,
            clauses: resolveContractClauses(contractPdfData(selectedContract), companySettings, selectedTemplateId),
        });
    };

    const handleSaveTerms = async () => {
        if (!selectedContract) return;
        if (editor.clauses.trim().length < 20) {
            toast({ title: 'Texto insuficiente', description: 'As cláusulas do contrato não podem ficar vazias.', variant: 'destructive' });
            return;
        }
        setIsSavingTerms(true);
        try {
            const previous = parseContractTerms(selectedContract.terms);
            const terms = JSON.stringify({ title: editor.title.trim(), clauses: editor.clauses, updatedAt: new Date().toISOString(), updatedBy: user?.name || null });
            await updateContract(selectedContract.id, { terms });
            setSelectedContract((prev: any) => prev ? { ...prev, terms } : prev);
            setEditor(prev => ({ ...prev, edited: true }));
            if (user) {
                await ServicoAuditoria.addLog('update', 'credit', `Termos do contrato ${selectedContract.id} editados`, user.id, user.name,
                    previous, { title: editor.title.trim(), clauses: editor.clauses }, { contractId: selectedContract.id, origin: 'contract_editor' }).catch(() => undefined);
            }
            toast({ title: 'Contrato actualizado', description: 'O texto editado fica guardado neste contrato e é usado em todos os PDF seguintes.' });
        } catch (error) {
            console.error('[Contratos] Falha ao guardar os termos:', error);
            toast({ title: 'Não foi possível guardar', description: 'Verifique as permissões e tente novamente.', variant: 'destructive' });
        } finally {
            setIsSavingTerms(false);
        }
    };

    const closePreview = () => {
        setPreviewPdfUrl(null);
        setEditor(prev => ({ ...prev, dirty: false }));
    };

    const handleViewDetails = (contract: any) => {
        setSelectedContract(contract);
        setIsDetailsOpen(true);
    };

    const handleRenewSubmit = async (data: any) => {
        void data;
        toast({ title: 'Renovação indisponível', description: 'É necessária uma política aprovada de reestruturação.', variant: 'destructive' });
    };

    const handleSaveClauses = async () => {
        await updateCompanySettings({ customClauses });
        toast({ title: "Cláusulas guardadas", description: "O modelo padrão foi actualizado." });
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedContract) return;

        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64String = reader.result as string;
            const client = clients.find(client => (client.id === selectedContract.clientId) || (client.name === selectedContract.clientName));
            if (client) {
                const newDoc: ClientDocument = {
                    id: uuidv4(),
                    title: file.name,
                    type: file.type.includes('pdf') ? 'pdf' : 'image',
                    data: base64String,
                    createdAt: new Date(),
                };
                await addDocumentToClient(client.id, newDoc);
                toast({ title: "Documento anexado", description: "Documento guardado no perfil do cliente." });
            } else {
                toast({ title: "Erro", description: "Cliente não encontrado.", variant: "destructive" });
            }
        };
        reader.readAsDataURL(file);
    };

    const getContractDocuments = () => {
        if (!selectedContract) return [];
        const client = clients.find(client => (client.id === selectedContract.clientId) || (client.name === selectedContract.clientName));
        return client?.documents || [];
    };

    const documents = getContractDocuments();

    const filteredClientContracts = useMemo(() => {
        const query = contractModalSearch.trim().toLowerCase();
        if (!query) return clientContractView.contracts;

        return clientContractView.contracts.filter((contract) => {
            const statusKey = getContractStatusKey(contract);
            const statusLabel = statusConfig[statusKey]?.label || statusKey;
            const searchable = [
                contract.id,
                contract.title,
                contract.clientName,
                String(contract.value || ''),
                formatCurrency(contract.value || 0),
                formatDate(contract.startDate),
                formatDate(contract.endDate),
                statusLabel
            ].join(' ').toLowerCase();

            return searchable.includes(query);
        });
    }, [clientContractView.contracts, contractModalSearch, getContractStatusKey]);

    useEffect(() => {
        if (clientContractView.isOpen) setContractModalSearch('');
    }, [clientContractView.isOpen, clientContractView.clientName]);

    const contractActions = (contract: any) => (
        <div className="flex justify-end gap-1">
            <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                title="Visualizar e editar o contrato"
                onClick={() => handleViewContract(contract)}
            >
                <Eye className="h-4 w-4" />
            </Button>
            <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                title="Baixar contrato"
                onClick={() => generateContractPDF(contractPdfData(contract), companySettings, [], 'save', user?.name)}
            >
                <Download className="h-4 w-4" />
            </Button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem className="gap-2" onClick={() => handleViewDetails(contract)}>
                        <FileText className="h-4 w-4" />
                        Detalhes e documentos
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onClick={() => { setEditor(prev => ({ ...prev, open: true })); handleViewContract(contract); }}>
                        <PencilLine className="h-4 w-4" />
                        Editar contrato
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onClick={() => handleViewPromessaContract(contract)}>
                        <PenTool className="h-4 w-4" />
                        Contrato-Promessa
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onClick={() => handleRenew(contract)}>
                        <Plus className="h-4 w-4" />
                        Renovar
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );

    const statusBadge = (contract: any) => {
        const statusKey = getContractStatusKey(contract);
        return (
            <div className="flex flex-wrap items-center gap-1">
                <Badge variant={statusConfig[statusKey]?.variant || 'outline'}>{statusConfig[statusKey]?.label || statusKey}</Badge>
                {parseContractTerms(contract.terms) && <Badge variant="outline" className="gap-1 text-[10px]"><PencilLine className="h-3 w-3" /> Editado</Badge>}
            </div>
        );
    };

    const cards = [
        { key: 'all' as const, css: 'card-kpi-sky', icon: FileText, overline: `Contratos de ${range.label}`, title: 'Total de Contratos', totals: periodTotals.all },
        { key: 'active' as const, css: 'card-kpi-mint', icon: FileCheck2, overline: 'Em vigor', title: 'Contratos Activos', totals: periodTotals.active },
        { key: 'paid' as const, css: 'card-kpi-purple', icon: BadgeCheck, overline: 'Liquidados', title: 'Encerrados por Pagamento', totals: periodTotals.paid },
        { key: 'closed' as const, css: 'card-kpi-coral', icon: FileX2, overline: 'Sem efeito', title: 'Terminados / Expirados', totals: periodTotals.closed },
    ];

    return (
        <MainLayout title="Contratos" subtitle="Gestão de contratos e documentos">
            {/* Período: o mesmo seletor da página de Créditos (dia, semana, mês, semestre, ano, personalizado) */}
            <div className="mb-4">
                <SeletorPeriodo value={period} onChange={setPeriod} monthsWithData={monthsWithContracts} />
            </div>

            {/* Cartões do período (clicáveis: filtram as tabelas) */}
            <div className="mb-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map(card => {
                    const Icon = card.icon;
                    const active = statusFilter === card.key && card.key !== 'all';
                    return (
                        <button
                            key={card.key}
                            type="button"
                            onClick={() => setStatusFilter(statusFilter === card.key ? 'all' : card.key)}
                            aria-pressed={active}
                            title={card.key === 'all' ? 'Mostrar todos os contratos do período' : `Mostrar só: ${card.title.toLowerCase()}`}
                            className={`${card.css} cursor-pointer text-left transition-transform hover:scale-[1.02] active:scale-[0.99] ${active ? 'ring-4 ring-primary/60 ring-offset-2 ring-offset-background' : ''}`}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">{card.overline}</p>
                                    <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">{card.title}</p>
                                </div>
                            </div>
                            <div className="my-2 flex items-baseline gap-2 min-w-0">
                                <p className="font-display text-3xl font-black tracking-tight text-slate-950 dark:text-white">{card.totals.count}</p>
                                <p className="text-xs font-semibold text-slate-900/70 dark:text-slate-400">{card.totals.count === 1 ? 'contrato' : 'contratos'}</p>
                            </div>
                            <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate" title={formatCurrency(card.totals.value)}>
                                {active ? 'A filtrar as tabelas · clique para limpar' : `Valor: ${formatCurrency(card.totals.value)}`}
                            </p>
                        </button>
                    );
                })}
            </div>

            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent className={CREDIT_DIALOG_CONTENT_CLASS}>
                    <DialogHeader className={CREDIT_DIALOG_HEADER_CLASS}>
                        <DialogTitle className="text-xl font-bold tracking-tight text-white">Renovar Contrato</DialogTitle>
                        <DialogDescription className="mt-1 text-sm text-white/75">
                            Ajuste as condições para renovar este contrato existente.
                        </DialogDescription>
                    </DialogHeader>
                    <CreditForm
                        onSubmit={handleRenewSubmit}
                        onCancel={() => {
                            setIsCreateDialogOpen(false);
                            setPrefillContractData(null);
                        }}
                        clients={clients}
                        credits={credits}
                        prefillData={prefillContractData}
                        submitLabel="Confirmar Renovação"
                    />
                </DialogContent>
            </Dialog>

            <PromessaDetailsModal
                isOpen={promessaModal.isOpen}
                onClose={() => setPromessaModal({ isOpen: false, contract: null, client: null })}
                credit={promessaModal.contract}
                client={promessaModal.client}
                companySettings={companySettings}
                userName={user?.name}
            />

            {/* Modal de Detalhes dos Contratos do Cliente */}
            <Dialog open={clientContractView.isOpen} onOpenChange={(open) => setClientContractView(prev => ({ ...prev, isOpen: open }))}>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-indigo-500" />
                            Contratos de {clientContractView.clientName}
                        </DialogTitle>
                        <DialogDescription>
                            Contratos deste cliente no período e filtros seleccionados.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="mt-4 space-y-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={contractModalSearch}
                                onChange={(e) => setContractModalSearch(e.target.value)}
                                placeholder="Pesquisar por valor, n.º do contrato, título, data ou estado..."
                                className="h-10 pl-10"
                            />
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Título</TableHead>
                                    <TableHead>Período</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acção</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredClientContracts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                            Nenhum contrato encontrado para este filtro.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredClientContracts.map((contract) => (
                                        <TableRow key={contract.id}>
                                            <TableCell className="font-medium">
                                                <div>{contract.title}</div>
                                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">N.º {contract.id}</div>
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {formatDate(contract.startDate)} - {formatDate(contract.endDate)}
                                            </TableCell>
                                            <TableCell className="text-right font-semibold">{formatCurrency(contract.value)}</TableCell>
                                            <TableCell>{statusBadge(contract)}</TableCell>
                                            <TableCell className="text-right">{contractActions(contract)}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Detalhes do Contrato</DialogTitle>
                    </DialogHeader>
                    {selectedContract && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Título</p>
                                    <p className="font-semibold">{selectedContract.title}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Cliente</p>
                                    <p>{selectedContract.clientName}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Valor</p>
                                    <p>{formatCurrency(selectedContract.value)}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Estado</p>
                                    {statusBadge(selectedContract)}
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Data de início</p>
                                    <p>{formatDate(selectedContract.startDate)}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Data de fim</p>
                                    <p>{formatDate(selectedContract.endDate)}</p>
                                </div>
                            </div>

                            <div className="pt-4 border-t">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold">Documentos anexados (cliente)</h3>
                                    <div>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={handleFileUpload}
                                        />
                                        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                                            <Upload className="mr-2 h-4 w-4" /> Anexar documento
                                        </Button>
                                    </div>
                                </div>

                                {documents.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4 bg-muted/20 rounded-lg">Nenhum documento anexado.</p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {documents.map((doc) => (
                                            <div key={doc.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                                <div className="h-10 w-10 flex items-center justify-center bg-primary/10 rounded-lg text-primary">
                                                    <FileText className="h-5 w-5" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate" title={doc.title}>{doc.title}</p>
                                                    <p className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</p>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500" onClick={() => {
                                                        const win = window.open(doc.data, '_blank');
                                                        if (!win) {
                                                            toast({ title: "Pré-visualização bloqueada", description: "Permita pop-ups para abrir este documento." });
                                                        }
                                                    }}>
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={async () => {
                                                        const client = clients.find(client => (client.id === selectedContract.clientId) || (client.name === selectedContract.clientName));
                                                        if (client) {
                                                            await deleteDocumentFromClient(client.id, doc.id);
                                                            toast({ title: "Excluído", description: "Documento removido." });
                                                        }
                                                    }}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 flex justify-end gap-2 border-t">
                                <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Fechar</Button>
                                <Button onClick={() => handleViewContract(selectedContract)}>
                                    <Eye className="mr-2 h-4 w-4" /> Visualizar contrato
                                </Button>
                                <Button variant="secondary" onClick={() => handleViewPromessaContract(selectedContract)}>
                                    <PenTool className="mr-2 h-4 w-4" /> Contrato-Promessa
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Tabs defaultValue="list" className="w-full">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-4">
                    <TabsList>
                        <TabsTrigger value="list">Por Cliente</TabsTrigger>
                        <TabsTrigger value="all">Todos os Contratos</TabsTrigger>
                        <TabsTrigger value="models">Modelos e Cláusulas</TabsTrigger>
                    </TabsList>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative w-full sm:w-80">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Pesquisar por nome, NIF, telefone ou n.º do contrato..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-9"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                            <SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos os estados</SelectItem>
                                <SelectItem value="active">Activos</SelectItem>
                                <SelectItem value="paid">Encerrados por pagamento</SelectItem>
                                <SelectItem value="closed">Terminados / Expirados</SelectItem>
                            </SelectContent>
                        </Select>
                        {(statusFilter !== 'all' || searchTerm) && (
                            <Button variant="ghost" size="sm" onClick={() => { setStatusFilter('all'); setSearchTerm(''); }}>
                                <X className="mr-1 h-4 w-4" /> Limpar filtros
                            </Button>
                        )}
                    </div>
                </div>

                <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {groupedContracts.length} {groupedContracts.length === 1 ? 'cliente' : 'clientes'} · {visibleContracts.length} {visibleContracts.length === 1 ? 'contrato' : 'contratos'} em {range.label}
                </p>

                <TabsContent value="list" className="mt-0">
                    <div className="card-elevated overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead>Cliente</TableHead>
                                    <TableHead className="text-center">Contratos</TableHead>
                                    <TableHead className="text-center">Activos</TableHead>
                                    <TableHead className="text-right">Valor em contratos</TableHead>
                                    <TableHead className="text-right">Acção</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {groupedContracts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-10 text-muted-foreground italic">
                                            Nenhum contrato em {range.label} com estes filtros.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    groupedContracts.map((group, index) => (
                                        <TableRow
                                            key={group.clientId || group.clientName}
                                            className="animate-fade-in"
                                            style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
                                        >
                                            <TableCell>
                                                <p className="font-bold text-foreground text-base">{group.clientName}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{clientById.get(group.clientId)?.nif || group.clientId}</p>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="secondary" className="font-bold">{group.total}</Badge>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="success" className="font-bold">{group.active}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className="font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(group.value)}</span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    size="sm"
                                                    className="gap-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white shadow-md font-bold"
                                                    onClick={() => setClientContractView({
                                                        isOpen: true,
                                                        clientName: group.clientName,
                                                        contracts: group.contracts
                                                    })}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                    Ver Contratos
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                <TabsContent value="all" className="mt-0">
                    <div className="card-elevated overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead>Data</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Contrato</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                    <TableHead>Vigência</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acção</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visibleContracts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground italic">
                                            Nenhum contrato em {range.label} com estes filtros.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    [...visibleContracts]
                                        .sort((a, b) => new Date(contractDate(b)).getTime() - new Date(contractDate(a)).getTime())
                                        .map(contract => (
                                            <TableRow key={contract.id}>
                                                <TableCell className="whitespace-nowrap text-xs">{formatDate(contractDate(contract))}</TableCell>
                                                <TableCell>
                                                    <p className="font-semibold">{contract.clientName}</p>
                                                    <p className="text-[10px] text-muted-foreground">{clientById.get(contract.clientId)?.nif || '—'}</p>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs" title={contract.id}>{contract.id}</TableCell>
                                                <TableCell className="text-right font-semibold whitespace-nowrap">{formatCurrency(contract.value)}</TableCell>
                                                <TableCell className="whitespace-nowrap text-xs">{formatDate(contract.startDate)} - {formatDate(contract.endDate)}</TableCell>
                                                <TableCell>{statusBadge(contract)}</TableCell>
                                                <TableCell className="text-right">{contractActions(contract)}</TableCell>
                                            </TableRow>
                                        ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                <TabsContent value="models">
                    <div className="space-y-4">
                        <div className="bg-card p-6 rounded-xl border shadow-sm">
                            <div className="mb-4">
                                <h3 className="text-lg font-semibold">Cláusulas personalizadas do contrato</h3>
                                <p className="text-sm text-muted-foreground">
                                    Edite as cláusulas que aparecerão em todos os novos contratos gerados. O sistema insere automaticamente os dados das partes.
                                    Pode usar os campos {CONTRACT_PLACEHOLDERS.slice(0, 4).map(item => item.token).join(', ')}… que são substituídos pelos dados de cada contrato.
                                </p>
                            </div>
                            <Textarea
                                value={customClauses}
                                onChange={(e) => setCustomClauses(e.target.value)}
                                className="min-h-[400px] font-mono text-sm leading-relaxed"
                                placeholder="Digite aqui as cláusulas contratuais..."
                            />
                            <div className="mt-4 flex justify-end">
                                <Button onClick={handleSaveClauses} className="gap-2">
                                    <Save className="h-4 w-4" />
                                    Guardar alterações
                                </Button>
                            </div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Pré-visualização do contrato com edição em tempo real */}
            <Dialog open={!!previewPdfUrl} onOpenChange={(open) => !open && closePreview()}>
                <DialogContent className="max-w-[98vw] w-full h-[96vh] p-0 gap-0 overflow-hidden bg-slate-100 border border-white/10 shadow-2xl rounded-2xl flex flex-col">
                    <div className="flex min-h-0 flex-1 flex-col">
                        {/* Barra de ferramentas */}
                        <div className="min-h-[82px] px-6 py-4 pr-16 bg-slate-950 text-white border-b border-white/10 flex flex-row flex-wrap items-center justify-between gap-4 shrink-0 shadow-lg z-10">
                            <div className="min-w-0 flex flex-col gap-1">
                                <DialogTitle className="text-xl font-bold text-white flex items-center gap-2 truncate">
                                    <FileText className="h-5 w-5 text-blue-300 shrink-0" />
                                    {selectedContract?.title || 'Visualizar Contrato'}
                                    {editor.edited && <Badge variant="outline" className="ml-1 border-amber-300/60 text-amber-200 text-[10px]">Texto editado</Badge>}
                                </DialogTitle>
                                <DialogDescription className="text-xs text-white/70 font-medium truncate">
                                    {selectedContract?.clientName} • {formatDate(selectedContract?.startDate)}
                                </DialogDescription>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-3">
                                <div className="hidden md:flex items-center gap-2 bg-white/10 px-3 py-2 rounded-lg border border-white/15">
                                    <span className="text-xs font-medium text-white/80 whitespace-nowrap">Modelo:</span>
                                    <Select
                                        value={selectedTemplateId}
                                        onValueChange={(value) => {
                                            setSelectedTemplateId(value);
                                            handleViewContract(selectedContract, value);
                                        }}
                                    >
                                        <SelectTrigger className="w-[170px] h-9 text-xs bg-white text-slate-900 border-white/20 focus:ring-0 focus:ring-offset-0">
                                            <SelectValue placeholder="Modelo Padrão" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="default" className="text-xs">Modelo Padrão</SelectItem>
                                            {(() => {
                                                try {
                                                    const raw = companySettings.contractTemplates as any;
                                                    const templates = Array.isArray(raw)
                                                        ? raw
                                                        : (typeof raw === 'string' && raw ? JSON.parse(raw) : []);
                                                    return templates.map((t: any) => (
                                                        <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                                                    ));
                                                } catch (e) { return null; }
                                            })()}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="h-8 w-px bg-white/20 mx-1 hidden md:block" />

                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className={`gap-2 h-10 shadow-sm ${editor.open ? 'border-amber-300 bg-amber-400 text-slate-950 hover:bg-amber-300' : 'border-amber-200 bg-white text-amber-700 hover:bg-amber-50'}`}
                                        onClick={() => setEditor(prev => ({ ...prev, open: !prev.open }))}
                                        aria-pressed={editor.open}
                                    >
                                        {editor.open ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PencilLine className="h-3.5 w-3.5" />}
                                        <span className="hidden sm:inline">{editor.open ? 'Fechar editor' : 'Editar em tempo real'}</span>
                                    </Button>

                                    {companySettings.digitalSignatureEnabled && user?.signature && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-2 border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 shadow-sm h-10"
                                            onClick={() => {
                                                if (!selectedContract) return;
                                                setPreviewSignature(user.signature);
                                                renderPreview(selectedContract, { templateId: selectedTemplateId, title: editor.title, clauses: editor.clauses, signature: user.signature });
                                                toast({
                                                    title: 'Assinatura aplicada',
                                                    description: 'O documento foi assinado electronicamente.',
                                                    className: "bg-emerald-50 border-emerald-200 text-emerald-800"
                                                });
                                            }}
                                        >
                                            <PenTool className="h-3.5 w-3.5" />
                                            <span className="hidden sm:inline">Assinar</span>
                                        </Button>
                                    )}

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-2 h-10 bg-white text-slate-900 hover:bg-slate-100"
                                        onClick={() => {
                                            if (!previewPdfUrl) return;
                                            printPdfFromUrl(previewPdfUrl, () => {
                                                toast({ title: "Impressão indisponível", description: "Não foi possível abrir a janela de impressão deste PDF." });
                                            });
                                        }}
                                    >
                                        <Printer className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">Imprimir</span>
                                    </Button>

                                    <Button
                                        size="sm"
                                        className="gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-sm h-10"
                                        onClick={() => {
                                            const link = document.createElement('a');
                                            link.href = previewPdfUrl || '';
                                            link.download = `Contrato-${selectedContract?.clientName || 'Doc'}-${formatDate(new Date())}.pdf`;
                                            link.click();
                                        }}
                                    >
                                        <Download className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">Baixar PDF</span>
                                    </Button>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-2 h-10 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                                        onClick={closePreview}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">Fechar</span>
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="flex min-h-0 flex-1">
                            {/* Editor em tempo real */}
                            {editor.open && (
                                <aside className="flex w-full max-w-[460px] shrink-0 flex-col border-r bg-background">
                                    <div className="border-b px-4 py-3">
                                        <p className="text-sm font-bold">Editar contrato em tempo real</p>
                                        <p className="text-xs text-muted-foreground">A pré-visualização actualiza-se enquanto escreve. Guarde para usar este texto em todos os PDF deste contrato.</p>
                                    </div>
                                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                                        <div className="space-y-1.5">
                                            <label htmlFor="contract-title" className="text-xs font-semibold text-muted-foreground">Título do documento</label>
                                            <Input
                                                id="contract-title"
                                                value={editor.title}
                                                onChange={(event) => updateEditor({ title: event.target.value })}
                                                className="h-9 font-semibold"
                                                maxLength={140}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Braces className="h-3.5 w-3.5" /> Inserir dados do contrato</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {CONTRACT_PLACEHOLDERS.map(item => (
                                                    <button
                                                        key={item.token}
                                                        type="button"
                                                        title={item.token}
                                                        onClick={() => insertPlaceholder(item.token)}
                                                        className="rounded-md border bg-muted/60 px-2 py-1 text-[11px] font-medium hover:bg-muted"
                                                    >
                                                        {item.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex min-h-[320px] flex-1 flex-col space-y-1.5">
                                            <label htmlFor="contract-clauses" className="text-xs font-semibold text-muted-foreground">
                                                Cláusulas (as linhas com "CLÁUSULA" saem a negrito)
                                            </label>
                                            <Textarea
                                                id="contract-clauses"
                                                ref={clausesRef}
                                                value={editor.clauses}
                                                onChange={(event) => updateEditor({ clauses: event.target.value })}
                                                className="min-h-[320px] flex-1 resize-none font-mono text-xs leading-relaxed"
                                                spellCheck
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
                                        <Button variant="ghost" size="sm" className="gap-2" onClick={handleResetTemplate}>
                                            <RotateCcw className="h-3.5 w-3.5" /> Repor modelo
                                        </Button>
                                        <Button size="sm" className="gap-2" onClick={handleSaveTerms} disabled={isSavingTerms}>
                                            <Save className="h-3.5 w-3.5" /> {isSavingTerms ? 'A guardar...' : 'Guardar no contrato'}
                                        </Button>
                                    </div>
                                </aside>
                            )}

                            {/* Área do PDF */}
                            <div className="min-h-0 flex-1 relative bg-slate-200/70 flex flex-col items-center justify-center p-6 overflow-hidden">
                                {previewPdfUrl ? (
                                    <div className="w-full h-full bg-white shadow-xl rounded-sm overflow-hidden border border-zinc-300 max-w-7xl mx-auto flex flex-col">
                                        <PdfCanvasViewer source={previewPdfUrl} />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400 animate-pulse">
                                        <div className="h-12 w-12 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                        <p className="text-sm font-medium">A gerar o documento...</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
                title={alertConfig.title}
                description={alertConfig.description}
                type={alertConfig.type as any}
            />
        </MainLayout >
    );
}
