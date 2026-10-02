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
import { generateContractPDF, generatePromessaContractPDF } from '@/bibliotecas/pdf';
import { printPdfFromUrl } from '@/bibliotecas/pdfPrint';
import { useToast } from '@/componentes/ui/use-toast';
import { ClientDocument } from '@/tipos/credito';
import { v4 as uuidv4 } from 'uuid';
import { PdfCanvasViewer } from '@/componentes/ui/PdfCanvasViewer';

type BadgeVariant = 'default' | 'primary' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info' | 'outline';

const statusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
    active: { label: 'Activo', variant: 'success' },
    expired: { label: 'Expirado', variant: 'warning' },
    terminated: { label: 'Terminado', variant: 'destructive' },
    draft: { label: 'Rascunho', variant: 'secondary' },
    paid: { label: 'Contrato Encerrado por Pagamento Total', variant: 'success' },
};

export default function Contracts() {
    const { contracts, companySettings, clients, credits, addCredit, addContract, updateCompanySettings, addDocumentToClient, deleteDocumentFromClient, updateCredit } = useData();
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<any>(null);
    const [prefillContractData, setPrefillContractData] = useState<any>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);
    const [contractModalSearch, setContractModalSearch] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [customClauses, setCustomClauses] = useState(companySettings.customClauses || '');
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

    // Agrupar contratos por cliente
    const groupedContracts = useMemo(() => {
        const groups: Record<string, {
            clientName: string;
            clientId: string;
            total: number;
            active: number;
            contracts: any[];
        }> = {};

        contracts.forEach(contract => {
            const key = contract.clientId || contract.clientName;
            if (!groups[key]) {
                groups[key] = {
                    clientName: contract.clientName,
                    clientId: contract.clientId,
                    total: 0,
                    active: 0,
                    contracts: []
                };
            }
            groups[key].total++;
            if (getContractStatusKey(contract) === 'active') groups[key].active++;
            groups[key].contracts.push(contract);
        });

        return Object.values(groups).sort((a, b) => a.clientName.localeCompare(b.clientName));
    }, [contracts, getContractStatusKey]);

    const filteredGroups = groupedContracts.filter(
        (group) =>
            group.clientName.toLowerCase().includes(searchTerm.toLowerCase())
    );

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

    const handleViewContract = (contract: any, templateId?: string) => {
        try {
            const credit = credits.find(c => c.id === contract.id);
            const dataToUse = credit || contract;

            let signatureToPass: string | undefined = undefined;
            if (user && companySettings.digitalSignatureEnabled) {
                try {
                    let authorizedIds: string[] = [];
                    try {
                        const rawSigners = companySettings.authorizedSigners;
                        authorizedIds = Array.isArray(rawSigners)
                            ? rawSigners
                            : (typeof rawSigners === 'string' && rawSigners.length > 0 ? JSON.parse(rawSigners) : []);
                    } catch (e) {
                        authorizedIds = [];
                    }

                    if (Array.isArray(authorizedIds) && authorizedIds.includes(user.id) && user.signature) {
                        signatureToPass = user.signature;
                    }
                } catch (e) { }
            }

            // Revoke old URL to prevent memory leaks and ensure clean load
            if (previewPdfUrl) {
                try { URL.revokeObjectURL(previewPdfUrl); } catch (e) { }
            }

            const url = generateContractPDF(dataToUse, companySettings, [], 'blob', user?.name, signatureToPass, { templateId: templateId || selectedTemplateId });
            if (url) {
                setPreviewPdfUrl(url as any);
                setSelectedContract(contract);
                if (templateId) setSelectedTemplateId(templateId);
            }
        } catch (error) {
            toast({
                title: "Erro",
                description: "Falha ao gerar contrato.",
                variant: 'destructive',
            });
        }
    };

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (previewPdfUrl) {
                try { URL.revokeObjectURL(previewPdfUrl); } catch (e) { }
            }
        };
    }, [previewPdfUrl]);

    const handleViewDetails = (contract: any) => {
        setSelectedContract(contract);
        setIsDetailsOpen(true);
    };

    const handleEdit = (contract: any) => {
        setAlertConfig({
            isOpen: true,
            title: "Edição Indisponível",
            description: "Para editar este contrato, altere o Crédito associado na página de Créditos.",
            type: "info"
        });
    };

    const handleRenewSubmit = async (data: any) => {
        void data;
        toast({ title: 'Renovação indisponível', description: 'É necessária uma política aprovada de reestruturação.', variant: 'destructive' });
    };

    const handleSaveClauses = async () => {
        await updateCompanySettings({ customClauses });
        toast({ title: "Cláusulas Salvas", description: "O modelo padrão foi atualizado." });
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
                toast({ title: "Documento Anexado", description: "Documento salvo no perfil do cliente." });
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

    return (
        <MainLayout title="Contratos" subtitle="Gestão de contratos e documentos">
            {/* Stats Cards */}
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="card-elevated p-4">
                    <p className="text-sm text-muted-foreground">Total de Contratos</p>
                    <p className="font-display text-2xl font-bold text-foreground">{contracts.length}</p>
                </div>
                <div className="card-elevated p-4">
                    <p className="text-sm text-muted-foreground">Contratos Ativos</p>
                    <p className="font-display text-2xl font-bold text-success">{contracts.filter(c => getContractStatusKey(c) === 'active').length}</p>
                </div>
                <div className="card-elevated p-4">
                    <p className="text-sm text-muted-foreground">Clientes com Contratos</p>
                    <p className="font-display text-2xl font-bold text-indigo-600 dark:text-indigo-400">{groupedContracts.length}</p>
                </div>
                <div className="card-elevated p-4">
                    <p className="text-sm text-muted-foreground">Valor Global</p>
                    <p className="font-display text-2xl font-bold text-foreground">
                        {formatCurrency(contracts.reduce((acc, c) => acc + c.value, 0))}
                    </p>
                </div>
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
                            Lista de todos os contratos associados a este cliente.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="mt-4 space-y-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={contractModalSearch}
                                onChange={(e) => setContractModalSearch(e.target.value)}
                                placeholder="Pesquisar por valor, Nº do contrato, título, data ou status..."
                                className="h-10 pl-10"
                            />
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Título</TableHead>
                                    <TableHead>Período</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Ação</TableHead>
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
                                    filteredClientContracts.map((contract) => {
                                        const statusKey = getContractStatusKey(contract);
                                        return (
                                            <TableRow key={contract.id}>
                                                <TableCell className="font-medium">
                                                    <div>{contract.title}</div>
                                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Nº {contract.id}</div>
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {formatDate(contract.startDate)} - {formatDate(contract.endDate)}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">{formatCurrency(contract.value)}</TableCell>
                                                <TableCell>
                                                    <Badge variant={statusConfig[statusKey]?.variant || 'outline'}>
                                                        {statusConfig[statusKey]?.label || statusKey}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-8 px-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                                                            title="Visualizar Detalhes"
                                                            onClick={() => handleViewDetails(contract)}
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-8 px-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                                                            title="Baixar Contrato"
                                                            onClick={() => {
                                                                generateContractPDF(contract, companySettings, [], 'save', user?.name);
                                                            }}
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
                                                                <DropdownMenuItem className="gap-2" onClick={() => handleViewContract(contract)}>
                                                                    <FileText className="h-4 w-4" />
                                                                    Visualizar PDF
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
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
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
                                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                                    <Badge variant={statusConfig[getContractStatusKey(selectedContract)]?.variant || 'default'}>
                                        {statusConfig[getContractStatusKey(selectedContract)]?.label || getContractStatusKey(selectedContract)}
                                    </Badge>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Data Início</p>
                                    <p>{formatDate(selectedContract.startDate)}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Data Fim</p>
                                    <p>{formatDate(selectedContract.endDate)}</p>
                                </div>
                            </div>

                            <div className="pt-4 border-t">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold">Documentos Anexados (Cliente)</h3>
                                    <div>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={handleFileUpload}
                                        />
                                        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                                            <Upload className="mr-2 h-4 w-4" /> Anexar Documento
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
                                    <Eye className="mr-2 h-4 w-4" /> Visualizar Contrato
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
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
                    <TabsList>
                        <TabsTrigger value="list">Contratos por Cliente</TabsTrigger>
                        <TabsTrigger value="models">Modelos e Cláusulas</TabsTrigger>
                    </TabsList>

                    <div className="flex gap-2">
                        <div className="relative w-full sm:w-80">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Pesquisar cliente..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-9"
                            />
                        </div>
                    </div>
                </div>

                <TabsContent value="list" className="mt-0">
                    <div className="card-elevated overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead>Cliente</TableHead>
                                    <TableHead className="text-center">Total Contratos</TableHead>
                                    <TableHead className="text-center">Ativos</TableHead>
                                    <TableHead className="text-right">Valor em Contratos</TableHead>
                                    <TableHead className="text-right">Ação</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredGroups.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-10 text-muted-foreground italic">
                                            Nenhum contrato encontrado.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredGroups.map((group, index) => (
                                        <TableRow
                                            key={group.clientId || group.clientName}
                                            className="animate-fade-in"
                                            style={{ animationDelay: `${index * 50}ms` }}
                                        >
                                            <TableCell>
                                                <p className="font-bold text-foreground text-base">{group.clientName}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{group.clientId}</p>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="secondary" className="font-bold">
                                                    {group.total}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="success" className="font-bold">
                                                    {group.active}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className="font-black text-indigo-600 dark:text-indigo-400">
                                                    {formatCurrency(group.contracts.reduce((sum, c) => sum + c.value, 0))}
                                                </span>
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

                <TabsContent value="models">
                    <div className="space-y-4">
                        <div className="bg-card p-6 rounded-xl border shadow-sm">
                            <div className="mb-4">
                                <h3 className="text-lg font-semibold">Cláusulas Personalizadas do Contrato</h3>
                                <p className="text-sm text-muted-foreground">
                                    Edite as cláusulas que aparecerão em todos os novos contratos gerados. O sistema insere automaticamente os dados das partes.
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
                                    Salvar Alterações
                                </Button>
                            </div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            {/* PDF Preview Dialog */}
            <Dialog open={!!previewPdfUrl} onOpenChange={(open) => !open && setPreviewPdfUrl(null)}>
                <DialogContent className="max-w-[98vw] w-full h-[96vh] p-0 gap-0 overflow-hidden bg-slate-100 border border-white/10 shadow-2xl rounded-2xl flex flex-col">
                    <div className="flex min-h-0 flex-1 flex-col">
                        {/* Header Toolbar */}
                        <div className="min-h-[82px] px-6 py-4 pr-16 bg-slate-950 text-white border-b border-white/10 flex flex-row items-center justify-between gap-4 shrink-0 shadow-lg z-10">
                            <div className="min-w-0 flex flex-col gap-1">
                                <DialogTitle className="text-xl font-bold text-white flex items-center gap-2 truncate">
                                    <FileText className="h-5 w-5 text-blue-300 shrink-0" />
                                    {selectedContract?.title || 'Visualizar Contrato'}
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

                                <div className="flex gap-2">
                                    {companySettings.digitalSignatureEnabled && user?.signature && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-2 border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 shadow-sm h-10"
                                            onClick={() => {
                                                if (selectedContract) {
                                                    const contract = credits.find(c => c.id === selectedContract.id);
                                                    if (contract) {
                                                        const url = generateContractPDF(contract, companySettings, [], 'blob', user?.name, user.signature, { templateId: selectedTemplateId });
                                                        if (url) {
                                                            console.log("[Contratos] Signed PDF generated:", url);
                                                            setPreviewPdfUrl(url as any);
                                                        }
                                                        toast({
                                                            title: 'Assinatura Aplicada',
                                                            description: 'O documento foi assinado eletronicamente.',
                                                            className: "bg-emerald-50 border-emerald-200 text-emerald-800"
                                                        });
                                                    }
                                                }
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
                                        disabled={isPrinting}
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
                                        onClick={() => setPreviewPdfUrl(null)}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">Fechar</span>
                                    </Button>

                                </div>
                            </div>
                        </div>

                        {/* PDF Viewer Area */}
                        <div className="min-h-0 flex-1 w-full relative bg-slate-200/70 flex flex-col items-center justify-center p-6 overflow-hidden">
                            {previewPdfUrl ? (
                                <div className="w-full h-full bg-white shadow-xl rounded-sm overflow-hidden border border-zinc-300 max-w-7xl mx-auto flex flex-col">
                                    <PdfCanvasViewer source={previewPdfUrl} />
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400 animate-pulse">
                                    <div className="h-12 w-12 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                    <p className="text-sm font-medium">Gerando documento...</p>
                                </div>
                            )}
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


