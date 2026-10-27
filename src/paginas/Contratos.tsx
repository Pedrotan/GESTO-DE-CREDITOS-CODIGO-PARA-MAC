import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { hasFullAuthority } from '@/bibliotecas/conta-principal';
import { contractNumbers } from '@/bibliotecas/pagamentos-analise';
import { saveContractPrefix } from '@/bibliotecas/eliminacao-dados';
import { ModalEliminarDados } from '@/componentes/modals/ModalEliminarDados';
import type { DataRemovalOptions } from '@/contextos/ContextoDados';
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
    PencilLine,
    RotateCcw,
    Braces,
    PanelLeftClose,
    Users,
    BarChart3,
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
    mergePromessaTerms,
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
import { useNavigate } from 'react-router-dom';
import { openWhatsApp } from '@/bibliotecas/whatsapp';
import { renderReportExcel, renderReportPdf } from '@/bibliotecas/relatorios-pagamentos';
import {
    CONTRACT_STATES, EMPTY_CONTRACT_FILTERS, QUICK_FILTERS, attentionItems, buildContractsReport, contractKpis, kz,
    matchesContractFilters, matchesQuick, quickCounts, type AttentionItem, type ContractFilters, type ContractRow, type QuickFilter,
} from '@/bibliotecas/contratos-analise';
import { useContratos } from '@/componentes/contratos/useContratos';
import { IndicadoresContratos } from '@/componentes/contratos/IndicadoresContratos';
import { RequerAtencao } from '@/componentes/contratos/RequerAtencao';
import { TabelaContratos } from '@/componentes/contratos/TabelaContratos';
import { DetalheContrato } from '@/componentes/contratos/DetalheContrato';
import { RelatoriosContratos } from '@/componentes/contratos/RelatoriosContratos';

type BadgeVariant = 'default' | 'primary' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info' | 'outline';

const statusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
    active: { label: 'Activo', variant: 'success' },
    expired: { label: 'Expirado', variant: 'warning' },
    terminated: { label: 'Terminado', variant: 'destructive' },
    draft: { label: 'Rascunho', variant: 'secondary' },
    paid: { label: 'Encerrado por pagamento total', variant: 'success' },
};

type EditorState = { open: boolean; title: string; clauses: string; dirty: boolean; edited: boolean };

// Data de celebração (quando o contrato foi feito, na aprovação). A data de início do crédito pode ser anterior (ex.:
// um mês antes da 1.ª prestação) e punha um contrato aprovado em Outubro no mês de Setembro.
const contractDate = (contract: any) => contract.createdAt || contract.startDate;

export default function Contracts() {
    const { contracts, companySettings, clients, credits, deletedCredits, updateCompanySettings, addDocumentToClient, deleteDocumentFromClient, updateContract, deleteCredit, refreshData } = useData();
    const { user } = useAuth();
    // Número do contrato (BV-CRT/2026/001): conta todos os créditos que já existiram, para nunca se repetir.
    const [numberingVersion, setNumberingVersion] = useState(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const numbers = useMemo(() => contractNumbers([...credits, ...(deletedCredits || [])]), [credits, deletedCredits, numberingVersion]);
    const numberOf = (contract: any) => numbers.get(contract.id) || contract.id;
    const prefixSample = (numbers.values().next().value as string | undefined)?.split('-CRT/')[0] || '';
    const [prefixDraft, setPrefixDraft] = useState('');
    const [contractToDelete, setContractToDelete] = useState<any>(null);
    const canForceDelete = hasFullAuthority(user);
    const savePrefix = async () => {
        try {
            const value = await saveContractPrefix(prefixDraft, user?.id);
            if (!value) throw new Error('Indique um prefixo com letras ou números (ex.: BV).');
            await refreshData();
            setNumberingVersion(version => version + 1);
            setPrefixDraft('');
            setAlertConfig({ isOpen: true, title: 'Prefixo guardado', description: `Os contratos passam a ser numerados como ${value}-CRT/${new Date().getFullYear()}/001.`, type: 'success' });
        } catch (error) {
            setAlertConfig({ isOpen: true, title: 'Não foi possível guardar', description: error instanceof Error ? error.message : String(error), type: 'destructive' });
        }
    };
    const confirmContractDelete = async (options: DataRemovalOptions) => {
        if (!contractToDelete || !user) return;
        try {
            await deleteCredit(contractToDelete.id, { id: user.id, name: user.name }, 'Eliminação manual na página de Contratos', options);
            setAlertConfig({ isOpen: true, title: 'Contrato eliminado', description: options.purge ? 'O contrato e os dados marcados foram apagados definitivamente.' : 'O contrato e os dados marcados foram para a lixeira.', type: 'success' });
            setContractToDelete(null);
        } catch (error) {
            setAlertConfig({ isOpen: true, title: 'Não foi possível eliminar', description: error instanceof Error ? error.message : String(error), type: 'destructive' });
            throw error;
        }
    };
    const [filters, setFilters] = useState<ContractFilters>(EMPTY_CONTRACT_FILTERS);
    const [period, setPeriod] = useState<PeriodSelection>(() => defaultPeriod(new Date(), 'month'));
    const [quick, setQuick] = useState<QuickFilter>('todos');
    const [soonDays, setSoonDays] = useState(() => { try { return Number(localStorage.getItem('contratos:dias-aviso')) || 7; } catch { return 7; } });
    const [detailId, setDetailId] = useState<string | null>(null);
    const [reportsOpen, setReportsOpen] = useState(false);
    const navigate = useNavigate();
    const data = useContratos(contracts, numbers);
    useEffect(() => { try { localStorage.setItem('contratos:dias-aviso', String(soonDays)); } catch { /* preferência local */ } }, [soonDays]);
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
    const monthsWithContracts = useMemo(() => new Set(contracts
        .filter(contract => new Date(contractDate(contract)).getFullYear() === period.year)
        .map(contract => new Date(contractDate(contract)).getMonth())), [contracts, period.year]);

    // Linhas com os valores do plano de prestações: período → filtros (pesquisa, produto, gestor, risco) → filtro rápido.
    const periodRows = useMemo(() => data.rows.filter(row => isInPeriod(contractDate(row.contract), range)), [data.rows, range]);
    const filteredRows = useMemo(() => periodRows.filter(row => matchesContractFilters(row, filters)), [periodRows, filters]);
    const counts = useMemo(() => quickCounts(filteredRows, soonDays), [filteredRows, soonDays]);
    const tableRows = useMemo(() => filteredRows.filter(row => matchesQuick(row, quick, soonDays))
        .sort((a, b) => b.startKey.localeCompare(a.startKey) || b.number.localeCompare(a.number)), [filteredRows, quick, soonDays]);
    const kpis = useMemo(() => contractKpis(periodRows, data.installments, data.today, soonDays), [periodRows, data.installments, data.today, soonDays]);
    // «Requer atenção» olha para toda a carteira em vigor (um atraso de um contrato antigo não pode ficar escondido pelo período).
    const attention = useMemo(() => attentionItems(data.rows, soonDays), [data.rows, soonDays]);
    const detailRow = useMemo(() => data.rows.find(row => row.id === detailId) || null, [data.rows, detailId]);
    const filterOptions = useMemo(() => ({
        products: [...new Set(data.rows.map(row => row.product).filter(item => item && item !== '—'))].sort(),
        managers: [...new Map(data.rows.filter(row => row.managerId).map(row => [row.managerId, row.managerName])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    }), [data.rows]);
    const hasFilters = quick !== 'todos' || Object.values(filters).some(Boolean);
    const clearFilters = () => { setQuick('todos'); setFilters(EMPTY_CONTRACT_FILTERS); };
    const setFilter = (changes: Partial<ContractFilters>) => setFilters(previous => ({ ...previous, ...changes }));

    // Agrupar contratos (já filtrados) por cliente
    const groupedContracts = useMemo(() => {
        const groups: Record<string, { clientName: string; clientId: string; total: number; active: number; value: number; outstanding: number; overdue: number; nextDue: string | null; contracts: any[] }> = {};
        tableRows.forEach(row => {
            const key = row.clientId || row.clientName;
            if (!groups[key]) groups[key] = { clientName: row.clientName, clientId: row.clientId, total: 0, active: 0, value: 0, outstanding: 0, overdue: 0, nextDue: null, contracts: [] };
            const group = groups[key];
            group.total++;
            group.value += row.amountMinor;
            group.outstanding += row.outstandingMinor;
            group.overdue += row.overdueMinor;
            if (row.state === 'em_dia' || row.state === 'atraso') group.active++;
            if (row.nextDueKey && (!group.nextDue || row.nextDueKey < group.nextDue)) group.nextDue = row.nextDueKey;
            group.contracts.push(row.contract);
        });
        return Object.values(groups).sort((a, b) => a.clientName.localeCompare(b.clientName));
    }, [tableRows]);

    const reminderText = (row: ContractRow, kind: 'overdue' | 'due_soon' | 'contract') => {
        const company = companySettings.name || 'a nossa empresa';
        if (kind === 'overdue') return `Olá ${row.clientName}, o contrato ${row.number} com ${company} tem ${kz(row.overdueMinor)} em atraso há ${row.daysOverdue} dia(s). Por favor regularize o pagamento ou contacte-nos.`;
        if (kind === 'due_soon') return `Olá ${row.clientName}, lembramos que a próxima prestação do contrato ${row.number}, no valor de ${kz(row.nextDueMinor)}, vence a ${formatDate(row.nextDueKey)}.`;
        return `Olá ${row.clientName}, segue a informação do seu contrato ${row.number} com ${company}: montante ${kz(row.amountMinor)}, saldo em dívida ${kz(row.outstandingMinor)}.`;
    };
    const sendWhatsApp = (row: ContractRow, kind: 'overdue' | 'due_soon' | 'contract') => {
        if (!row.phone) { toast({ title: 'Sem telefone', description: `O cliente ${row.clientName} não tem telefone registado.`, variant: 'destructive' }); return; }
        openWhatsApp(row.phone, reminderText(row, kind));
    };
    const handleAttention = (item: AttentionItem) => {
        if (item.kind === 'overdue' || item.kind === 'due_soon') sendWhatsApp(item.row, item.kind);
        else if (item.kind === 'missing_contract') setDetailId(item.row.id);
        else navigate(`/clientes?search=${encodeURIComponent(item.row.nif || item.row.clientName)}`);
    };
    const exportRows = async (rows: ContractRow[], format: 'pdf' | 'xlsx', label: string) => {
        try {
            const def = buildContractsReport(rows, { periodLabel: range.label, filters: [label], title: 'Lista de Contratos', fileBase: 'lista-contratos' });
            const file = format === 'pdf' ? renderReportPdf(def, companySettings, user?.name || 'Sistema', 'save') : renderReportExcel(def, companySettings, user?.name || 'Sistema', 'save');
            if (user) await ServicoAuditoria.addLog('export', 'report', `Lista de contratos (${format.toUpperCase()}) · ${rows.length} contrato(s)`, user.id, user.name,
                null, null, { report: 'lista-contratos', format, periodo: range.label, filtro: label, fileName: file.fileName }).catch(() => undefined);
        } catch (error) {
            toast({ title: 'Não foi possível exportar', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
        }
    };

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
            // Os termos do contrato-promessa (chave "promessa") ficam no mesmo campo e não se perdem.
            let promessa: unknown;
            try { const raw = selectedContract.terms; promessa = (typeof raw === "string" ? JSON.parse(raw || "{}") : raw)?.promessa; } catch { promessa = undefined; }
            const terms = JSON.stringify({ title: editor.title.trim(), clauses: editor.clauses, updatedAt: new Date().toISOString(), updatedBy: user?.name || null, ...(promessa ? { promessa } : {}) });
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

    const promessaCredit = useMemo(() => promessaModal.contract ? contractPdfData(promessaModal.contract) : null, [promessaModal.contract, contractPdfData]);

    const handleSavePromessaTerms = async ({ title, clauses }: { title: string; clauses: string }) => {
        const contract = promessaModal.contract;
        if (!contract) return;
        const current = contracts.find(item => item.id === contract.id)?.terms ?? contract.terms;
        const terms = mergePromessaTerms(current, { title, clauses, updatedAt: new Date().toISOString(), updatedBy: user?.name || null });
        await updateContract(contract.id, { terms });
        setPromessaModal(prev => prev.contract ? { ...prev, contract: { ...prev.contract, terms } } : prev);
        if (user) {
            await ServicoAuditoria.addLog("update", "credit", `Texto do contrato-promessa ${contract.id} editado`, user.id, user.name,
                null, { title, clauses }, { contractId: contract.id, origin: "promessa_editor" }).catch(() => undefined);
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
                    {canForceDelete && (
                        <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => setContractToDelete(contract)}>
                            <Trash2 className="h-4 w-4" />
                            Eliminar contrato
                        </DropdownMenuItem>
                    )}
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

    return (
        <MainLayout title="Contratos" subtitle="Gestão de contratos e documentos">
            {/* Cabeçalho: caminho e acções da página */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold text-muted-foreground">Gestão de crédito / Contratos</p>
                    <p className="text-xs text-muted-foreground">{data.loading ? 'A calcular saldos e atrasos a partir do plano de prestações…' : `Saldos e atrasos calculados a partir do plano de prestações · ${data.rows.length} contrato(s) na carteira`}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2"><Download className="h-4 w-4" /> Exportar lista</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem className="gap-2" onClick={() => void exportRows(tableRows, 'pdf', 'Lista filtrada')}><FileText className="h-4 w-4" /> PDF ({tableRows.length})</DropdownMenuItem>
                            <DropdownMenuItem className="gap-2" onClick={() => void exportRows(tableRows, 'xlsx', 'Lista filtrada')}><FileCheck2 className="h-4 w-4" /> Excel ({tableRows.length})</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button size="sm" className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => setReportsOpen(true)}>
                        <BarChart3 className="h-4 w-4" /> Relatórios
                    </Button>
                </div>
            </div>

            {/* Período: o mesmo seletor da página de Créditos (dia, semana, mês, trimestre, semestre, ano, personalizado) */}
            <div className="mb-4">
                <SeletorPeriodo value={period} onChange={setPeriod} kinds={['day', 'week', 'month', 'quarter', 'semester', 'year', 'custom', 'all']} monthsWithData={monthsWithContracts} />
            </div>

            {/* Indicadores do período (clicáveis: filtram a tabela) */}
            <IndicadoresContratos kpis={kpis} periodLabel={range.label} soonDays={soonDays} active={quick} onSelect={setQuick} />

            <RequerAtencao items={attention} soonDays={soonDays} onSoonDaysChange={setSoonDays} onAction={handleAttention} onOpen={item => setDetailId(item.row.id)} />

            <RelatoriosContratos open={reportsOpen} onOpenChange={setReportsOpen} rows={data.rows} settings={companySettings} user={user} />
            <DetalheContrato
                row={detailRow}
                installments={data.installments}
                documents={data.documents}
                today={data.today}
                actor={user ? { id: user.id, name: user.name, role: String(user.role) } : null}
                onClose={() => setDetailId(null)}
                onPreview={row => handleViewContract(row.contract)}
                onDownload={row => generateContractPDF(contractPdfData(row.contract), companySettings, [], 'save', user?.name)}
                onWhatsApp={row => sendWhatsApp(row, 'contract')}
                onChanged={data.reload}
            />

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
                credit={promessaCredit}
                client={promessaModal.client}
                companySettings={companySettings}
                userName={user?.name}
                onSaveTerms={handleSavePromessaTerms}
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
                                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground" title={contract.id}>N.º {numberOf(contract)}</div>
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

            <Tabs defaultValue="all" className="w-full">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between mb-3">
                    <TabsList>
                        <TabsTrigger value="all">Todos os Contratos</TabsTrigger>
                        <TabsTrigger value="list">Por Cliente</TabsTrigger>
                        <TabsTrigger value="models">Modelos e Cláusulas</TabsTrigger>
                    </TabsList>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative w-full sm:w-80">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Pesquisar por cliente, NIF/BI, telefone ou n.º do contrato..."
                                value={filters.search}
                                onChange={(e) => setFilter({ search: e.target.value })}
                                className="pl-10 h-9"
                            />
                        </div>
                        {filterOptions.products.length > 0 && (
                            <Select value={filters.product || 'all'} onValueChange={(value) => setFilter({ product: value === 'all' ? '' : value })}>
                                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os produtos</SelectItem>
                                    {filterOptions.products.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        )}
                        {filterOptions.managers.length > 0 && (
                            <Select value={filters.managerId || 'all'} onValueChange={(value) => setFilter({ managerId: value === 'all' ? '' : value })}>
                                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os gestores</SelectItem>
                                    {filterOptions.managers.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        )}
                        <Select value={filters.risk || 'all'} onValueChange={(value) => setFilter({ risk: value === 'all' ? '' : value })}>
                            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todo o risco</SelectItem>
                                <SelectItem value="A">Risco A</SelectItem>
                                <SelectItem value="B">Risco B</SelectItem>
                                <SelectItem value="C">Risco C</SelectItem>
                            </SelectContent>
                        </Select>
                        {hasFilters && (
                            <Button variant="ghost" size="sm" onClick={clearFilters}>
                                <X className="mr-1 h-4 w-4" /> Limpar filtros
                            </Button>
                        )}
                    </div>
                </div>

                {/* Filtros rápidos com contagem (dentro do período e dos filtros acima) */}
                <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtros rápidos">
                    {QUICK_FILTERS.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            aria-pressed={quick === item.id}
                            onClick={() => setQuick(quick === item.id && item.id !== 'todos' ? 'todos' : item.id)}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${quick === item.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'bg-background hover:bg-muted'}`}
                        >
                            {item.id === 'vence7' ? `Vence em ${soonDays} dias` : item.label} <span className="ml-1 opacity-75">{counts[item.id]}</span>
                        </button>
                    ))}
                    {quick === 'vigor' && <span className="rounded-full border border-indigo-600 bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">Em vigor <span className="ml-1 opacity-75">{tableRows.length}</span></span>}
                </div>

                <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {groupedContracts.length} {groupedContracts.length === 1 ? 'cliente' : 'clientes'} · {tableRows.length} {tableRows.length === 1 ? 'contrato' : 'contratos'} em {range.label}
                </p>

                <TabsContent value="all" className="mt-0">
                    <TabelaContratos
                        rows={tableRows}
                        onOpen={row => setDetailId(row.id)}
                        renderActions={row => contractActions(row.contract)}
                        onClearFilters={clearFilters}
                        hasFilters={hasFilters}
                        onExport={(rows, format) => void exportRows(rows, format, `Selecção de ${rows.length} contrato(s)`)}
                    />
                </TabsContent>

                <TabsContent value="list" className="mt-0">
                    <div className="card-elevated overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead>Cliente</TableHead>
                                    <TableHead className="text-center">Contratos · em vigor</TableHead>
                                    <TableHead className="text-right">Valor contratado</TableHead>
                                    <TableHead className="text-right">Saldo em dívida</TableHead>
                                    <TableHead>Próximo vencimento</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acção</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {groupedContracts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground italic">
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
                                            <TableCell className="text-center whitespace-nowrap">
                                                <Badge variant="secondary" className="font-bold">{group.total}</Badge>
                                                <span className="mx-1 text-muted-foreground">·</span>
                                                <Badge variant="success" className="font-bold">{group.active}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right whitespace-nowrap">
                                                <span className="font-black text-indigo-600 dark:text-indigo-400">{kz(group.value)}</span>
                                            </TableCell>
                                            <TableCell className="text-right whitespace-nowrap font-semibold">{kz(group.outstanding)}</TableCell>
                                            <TableCell className="whitespace-nowrap text-xs">{group.nextDue ? formatDate(group.nextDue) : '—'}</TableCell>
                                            <TableCell>
                                                {group.overdue > 0
                                                    ? <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${CONTRACT_STATES.atraso.badge}`}>Em atraso · {kz(group.overdue)}</span>
                                                    : group.active > 0
                                                        ? <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${CONTRACT_STATES.em_dia.badge}`}>Em dia</span>
                                                        : <span className="text-xs text-muted-foreground">Sem contratos em vigor</span>}
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
                            <h3 className="font-bold">Numeração dos contratos</h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Cada contrato recebe automaticamente o número seguinte do ano: <span className="font-mono font-bold">{prefixSample || 'BV'}-CRT/{new Date().getFullYear()}/001</span>, 002, 003…
                                Os números nunca se repetem (contam também os contratos eliminados) e só recomeçam se a base de dados for zerada.
                            </p>
                            {canForceDelete && (
                                <div className="mt-3 flex flex-wrap items-end gap-2">
                                    <div>
                                        <label className="text-xs font-bold" htmlFor="contract-prefix">Prefixo da empresa</label>
                                        <Input id="contract-prefix" className="mt-1 h-9 w-36 font-mono uppercase" maxLength={6} placeholder={prefixSample || 'BV'}
                                            value={prefixDraft} onChange={event => setPrefixDraft(event.target.value.toUpperCase())} />
                                    </div>
                                    <Button size="sm" disabled={!prefixDraft.trim()} onClick={() => void savePrefix()}>Guardar prefixo</Button>
                                </div>
                            )}
                        </div>
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

            <ModalEliminarDados
                open={Boolean(contractToDelete)}
                onOpenChange={open => { if (!open) setContractToDelete(null); }}
                kind="contract"
                name={contractToDelete ? `${numberOf(contractToDelete)} · ${contractToDelete.clientName || ''}` : ''}
                activeCredits={contractToDelete && credits.some(c => c.id === contractToDelete.id && ['active', 'overdue', 'renegotiated'].includes(c.status)) ? 1 : 0}
                onConfirm={confirmContractDelete}
            />
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
