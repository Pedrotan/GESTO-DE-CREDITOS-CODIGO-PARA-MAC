import { KzIcon } from '@/componentes/ui/KzIcon';
import { BankLogo } from '@/componentes/BankLogo';
import { ANGOLAN_BANKS } from '@/bibliotecas/ibanHelper';
import { useState, useEffect, useRef, useMemo } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { Client, Credit } from '@/tipos/credito';
import { formatCurrency, formatDate } from '@/bibliotecas/formatters';
import { generatePermanentTransferLetterPDF, companyBankAccount } from '@/bibliotecas/pdf';
import { ServicoCartasTransferencia, CartaTransferencia, ModeloCarta } from '@/servicos/ServicoCartasTransferencia';
import { printPdfFromUrl } from '@/bibliotecas/pdfPrint';
import { HistoricoCartas } from '@/componentes/cartas/HistoricoCartas';
import { useToast } from '@/ganchos/usar-toast';
import { cn } from '@/bibliotecas/utils';
import { sanitizeRichHtml } from '@/bibliotecas/sanitizar-html';
import {
    Search,
    Save,
    Download,
    Printer,
    FileText,
    Bold,
    Italic,
    Underline,
    Highlighter,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    List,
    ListOrdered,
    RotateCcw,
    Plus,
    History,
    Edit3,
    Trash2,
    Eye,
    Landmark,
    Calendar,    UserCheck,
    ScrollText,
    Check,
    Building,
    BadgeCheck,
    ChevronDown,
    Layers,
    ZoomIn,
    ZoomOut,
    Sparkles,
    FileCheck2,
    ChevronsUpDown,
    Maximize2
} from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Badge } from '@/componentes/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/componentes/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/componentes/ui/dialog';

export function CartasTransferencia() {
    const { clients, credits, companySettings } = useData();
    const { user } = useAuth();
    const { toast } = useToast();

    // Editor State
    const [currentLetterId, setCurrentLetterId] = useState<string>(() => `carta_${Date.now()}`);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);

    // Select2 Combobox State
    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [isSelect2Open, setIsSelect2Open] = useState(false);
    const select2Ref = useRef<HTMLDivElement>(null);

    // Templates State
    const [templates, setTemplates] = useState<ModeloCarta[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('modelo_ordem_permanente');
    const [isNewTemplateDialogOpen, setIsNewTemplateDialogOpen] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [newTemplateDesc, setNewTemplateDesc] = useState('');

    // Form fields
    const [bankDestinationName, setBankDestinationName] = useState('Banco Angolano de Investimentos (BAI)');
    const [destinationBranch, setDestinationBranch] = useState('Balcão Central');
    const [dayOfMonth, setDayOfMonth] = useState<number>(28);
    const [installmentAmount, setInstallmentAmount] = useState<number>(50000);
    const [creditRef, setCreditRef] = useState<string>('Ref. Contrato');
    const [subject, setSubject] = useState('ASSUNTO: ORDEM DE TRANSFERÊNCIA BANCÁRIA PERMANENTE');

    // Rich Text Editor Content & Sync
    const [bodyHtml, setBodyHtml] = useState<string>('');
    const editorRef = useRef<HTMLDivElement>(null);
    const previewEditableRef = useRef<HTMLDivElement>(null);

    // Zoom state para Folha A4
    const [a4Zoom, setA4Zoom] = useState<number>(100);

    // Modo de altura do editor (normal: 820px, expanded: 980px, full: 100% sem limites)
    const [editorHeightMode, setEditorHeightMode] = useState<'normal' | 'expanded' | 'full'>('expanded');

    // Saved Letters History
    const [savedLetters, setSavedLetters] = useState<CartaTransferencia[]>([]);
    const [activeTab, setActiveTab] = useState<'editor' | 'history'>('editor');
    const initNewLetterRef = useRef<(client?: Client | null, credit?: Credit | null, templateId?: string) => void>(() => undefined);

    // O conteúdo editável pertence ao estado e deve ser reposto quando o separador remonta.
    useEffect(() => {
        if (activeTab === 'editor' && editorRef.current) {
            const html = sanitizeRichHtml(bodyHtml);
            if (editorRef.current.innerHTML !== html) editorRef.current.innerHTML = html;
        }
    }, [activeTab, bodyHtml]);
    // Fechar dropdown Select2 ao clicar fora
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (select2Ref.current && !select2Ref.current.contains(e.target as Node)) {
                setIsSelect2Open(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Load initial letters history & templates
    useEffect(() => {
        loadLetters();
        loadTemplates();
        initNewLetterRef.current();
    }, []);

    const loadLetters = () => {
        const list = ServicoCartasTransferencia.getLetters();
        setSavedLetters(list);
    };

    const loadTemplates = () => {
        const list = ServicoCartasTransferencia.getTemplates();
        setTemplates(list);
    };

    const initNewLetter = (client?: Client | null, credit?: Credit | null, templateId: string = selectedTemplateId) => {
        const resolvedBank = ServicoCartasTransferencia.resolveClientBank(client);
        const templ = ServicoCartasTransferencia.getDefaultLetterTemplate(client, credit, companySettings, templateId);
        
        setCurrentLetterId(`carta_${Date.now()}`);
        setSelectedClient(client || null);
        setBankDestinationName(resolvedBank);
        setDestinationBranch(templ.destinationBranch);
        setDayOfMonth(templ.dayOfMonth);
        setInstallmentAmount(templ.installmentAmount);
        setSubject(templ.subject);
        setCreditRef(credit?.id || 'Ref. Contrato');
        const safeBodyHtml = sanitizeRichHtml(templ.bodyHtml);
        setBodyHtml(safeBodyHtml);

        if (editorRef.current) {
            editorRef.current.innerHTML = safeBodyHtml;
        }
    };
    initNewLetterRef.current = initNewLetter;

    // Client filtering for Select2 instant search
    const filteredClients = useMemo(() => {
        const q = clientSearchQuery.trim().toLowerCase();
        if (!q) return clients || [];
        return (clients || []).filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.nif && c.nif.toLowerCase().includes(q)) ||
            (c.phone && c.phone.includes(q)) ||
            (c.address && c.address.toLowerCase().includes(q))
        );
    }, [clients, clientSearchQuery]);

    // Handle selecting a client from Select2
    const handleSelectClient = (client: Client) => {
        setSelectedClient(client);
        setClientSearchQuery('');
        setIsSelect2Open(false);

        // Auto-detectar banco do cliente
        const resolvedBank = ServicoCartasTransferencia.resolveClientBank(client);
        setBankDestinationName(resolvedBank);

        // Encontrar crédito ativo do cliente se existir
        const clientCredits = (credits || []).filter(c => c.clientId === client.id && c.status === 'active');
        const activeCredit = clientCredits[0] || (credits || []).filter(c => c.clientId === client.id)[0] || null;

        initNewLetter(client, activeCredit, selectedTemplateId);

        toast({
            title: "Cliente Selecionado!",
            description: `${client.name} carregado. Banco identificado: ${resolvedBank}.`
        });
    };

    // Alternar Modelo de Carta
    const handleTemplateChange = (templateId: string) => {
        setSelectedTemplateId(templateId);
        const activeCredit = selectedClient 
            ? (credits || []).find(c => c.clientId === selectedClient.id && c.status === 'active') || null 
            : null;
        initNewLetter(selectedClient, activeCredit, templateId);
        toast({
            title: "Modelo Carregado",
            description: `Modelo de carta atualizado com sucesso.`
        });
    };

    // Criar Novo Modelo Personalizado
    const handleCreateCustomTemplate = () => {
        if (!newTemplateName.trim()) {
            toast({ title: "Nome obrigatório", description: "Informe um nome para o novo modelo." });
            return;
        }

        const newModel: ModeloCarta = {
            id: `custom_modelo_${Date.now()}`,
            name: newTemplateName.trim(),
            description: newTemplateDesc.trim() || 'Modelo personalizado criado pelo utilizador.',
            subject: subject,
            bodyHtmlTemplate: bodyHtml,
            isDefault: false
        };

        ServicoCartasTransferencia.saveCustomTemplate(newModel);
        loadTemplates();
        setSelectedTemplateId(newModel.id);
        setIsNewTemplateDialogOpen(false);
        setNewTemplateName('');
        setNewTemplateDesc('');

        toast({
            title: "Modelo Salvo!",
            description: `O modelo "${newModel.name}" foi salvo e pode ser reutilizado a qualquer momento.`
        });
    };

    // Rich Text Toolbar Actions
    const executeCommand = (cmd: string, val: any = null) => {
        if (editorRef.current) {
            editorRef.current.focus();
            document.execCommand(cmd, false, val);
            setBodyHtml(sanitizeRichHtml(editorRef.current.innerHTML));
        }
    };

    const handleHighlightText = (color: string) => {
        executeCommand('hiliteColor', color);
    };

    const insertPlaceholder = (text: string) => {
        if (editorRef.current) {
            editorRef.current.focus();
            document.execCommand('insertHTML', false, `<strong><mark class="bg-yellow-200 px-1 rounded">${text}</mark></strong> `);
            setBodyHtml(sanitizeRichHtml(editorRef.current.innerHTML));
        }
    };

    // Sincronização em tempo real quando digita no editor Word
    const handleEditorInput = () => {
        if (editorRef.current) {
            setBodyHtml(sanitizeRichHtml(editorRef.current.innerHTML));
        }
    };

    // Sincronização em tempo real quando digita direto na folha A4
    const handlePreviewEditableInput = () => {
        if (previewEditableRef.current) {
            const html = sanitizeRichHtml(previewEditableRef.current.innerHTML);
            setBodyHtml(html);
            if (editorRef.current && editorRef.current.innerHTML !== html) {
                editorRef.current.innerHTML = html;
            }
        }
    };

    // Salvar carta atual no histórico
    const handleSaveLetter = () => {
        const letter: CartaTransferencia = {
            id: currentLetterId,
            clientId: selectedClient?.id,
            clientName: selectedClient?.name || 'Cliente Particular',
            clientNif: selectedClient?.nif,
            clientPhone: selectedClient?.phone,
            clientBank: bankDestinationName,
            clientIban: ServicoCartasTransferencia.resolveClientIBAN(selectedClient),
            bankDestinationName,
            destinationBranch,
            companyAccountName: companySettings?.name || 'Tango Créditos, Lda.',
            companyIban: companyBankAccount(companySettings)?.iban || '',
            companyBank: companyBankAccount(companySettings)?.bankName || '',
            installmentAmount,
            creditReference: creditRef,
            startDate: new Date().toISOString(),
            dayOfMonth,
            subject,
            bodyHtml,
            templateId: selectedTemplateId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        ServicoCartasTransferencia.saveLetter(letter);
        loadLetters();

        toast({
            title: "Carta Salva com Sucesso!",
            description: `A carta para ${letter.clientName} foi registada no histórico.`
        });
    };

    const buildCurrentLetter = (): CartaTransferencia => ({
            id: currentLetterId,
            clientId: selectedClient?.id,
            clientName: selectedClient?.name || 'Nome do Cliente',
            clientNif: selectedClient?.nif,
            clientPhone: selectedClient?.phone,
            clientBank: bankDestinationName,
            clientIban: ServicoCartasTransferencia.resolveClientIBAN(selectedClient),
            bankDestinationName,
            destinationBranch,
            companyAccountName: companySettings?.name || 'Tango Créditos, Lda.',
            companyIban: companyBankAccount(companySettings)?.iban || '',
            companyBank: companyBankAccount(companySettings)?.bankName || '',
            installmentAmount,
            creditReference: creditRef,
            startDate: new Date().toISOString(),
            dayOfMonth,
            subject,
            bodyHtml,
            templateId: selectedTemplateId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
    });

    // Download PDF com dados atuais
    const handleDownloadPDF = async (letterToDownload?: CartaTransferencia) => {
        const letter: CartaTransferencia = letterToDownload || buildCurrentLetter();

        try {
            await generatePermanentTransferLetterPDF(letter, companySettings, user?.name || 'Operador');
        } catch {
            toast({ title: 'Erro ao gerar a carta', description: 'Não foi possível gerar o PDF da carta bancária.', variant: 'destructive' });
            return;
        }
        toast({
            title: "Gerando PDF",
            description: "O documento formal A4 está pronto para download."
        });
    };

    const handlePrint = async (letterToPrint?: CartaTransferencia) => {
        const letter: CartaTransferencia = letterToPrint || buildCurrentLetter();
        let url: string | void;
        try {
            url = await generatePermanentTransferLetterPDF(letter, companySettings, user?.name || 'Operador', 'blob');
        } catch {
            toast({ title: 'Erro ao gerar a carta', description: 'Não foi possível preparar a carta para impressão.', variant: 'destructive' });
            return;
        }
        if (!url) return;
        const pdfUrl = url;
        toast({ title: 'A preparar a impressão', description: `Carta de ${letter.clientName} (exemplar do banco e do cliente).` });
        await printPdfFromUrl(pdfUrl,
            message => toast({ title: 'Impressão indisponível', description: message || 'Não foi possível imprimir a carta.', variant: 'destructive' }),
            printerName => toast({ title: 'Carta enviada para impressão', description: printerName ? `Impressora: ${printerName}` : undefined }),
            `Carta_${(letter.clientName || 'Cliente').replace(/\s+/g, '_')}.pdf`);
        window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
    };

    const handleLoadFromHistory = (letter: CartaTransferencia) => {
        setCurrentLetterId(letter.id);
        const cli = clients.find(c => c.id === letter.clientId || c.name === letter.clientName);
        setSelectedClient(cli || null);
        setBankDestinationName(letter.bankDestinationName);
        setDestinationBranch(letter.destinationBranch || 'Balcão Central');
        setDayOfMonth(letter.dayOfMonth || 28);
        setInstallmentAmount(letter.installmentAmount || 50000);
        setSubject(letter.subject || 'ASSUNTO: ORDEM DE TRANSFERÊNCIA BANCÁRIA PERMANENTE');
        const safeBodyHtml = sanitizeRichHtml(letter.bodyHtml);
        setBodyHtml(safeBodyHtml);

        if (editorRef.current) {
            editorRef.current.innerHTML = safeBodyHtml;
        }

        setActiveTab('editor');

        toast({
            title: "Carta Carregada",
            description: `Documento de ${letter.clientName} pronto para edição.`
        });
    };

    const handleDeleteLetter = (id: string) => {
        ServicoCartasTransferencia.deleteLetter(id);
        loadLetters();
        toast({
            title: "Carta Excluída",
            description: "O registo foi removido do histórico."
        });
    };

    return (
        <MainLayout title="Cartas de Transferência" subtitle="Emissão e gestão formal de ordens de transferência bancária contínua">
            <div className="space-y-6 pb-16">
                {/* Header Superior */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
                    <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                            <ScrollText className="h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
                                Cartas de Transferência Bancária Permanente
                            </h1>
                            <p className="text-xs text-muted-foreground">
                                Emissão e edição formal de ordens de transferência bancária contínua para o banco de domicílio do cliente
                            </p>
                        </div>
                    </div>

                    {/* Botões de Ação Principais */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => initNewLetter()}
                            className="gap-1.5 text-xs font-semibold rounded-xl"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Nova Carta
                        </Button>

                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleSaveLetter}
                            className="gap-1.5 text-xs font-semibold rounded-xl"
                        >
                            <Save className="h-3.5 w-3.5 text-primary" />
                            Guardar no Histórico
                        </Button>

                        <Button
                            size="sm"
                            onClick={() => handleDownloadPDF()}
                            className="gap-1.5 text-xs font-bold bg-primary text-primary-foreground shadow-xs rounded-xl"
                        >
                            <Download className="h-3.5 w-3.5" />
                            Baixar em PDF
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handlePrint()}
                            className="h-9 px-2 text-xs rounded-xl"
                            title="Imprimir a carta (exemplar do banco e do cliente)"
                        >
                            <Printer className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Seletor de Abas: Editor vs Histórico */}
                <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
                    <TabsList className="grid w-full sm:w-[350px] grid-cols-2 rounded-xl">
                        <TabsTrigger value="editor" className="gap-2 text-xs rounded-lg">
                            <Edit3 className="h-3.5 w-3.5" />
                            Editor & Pré-visualização
                        </TabsTrigger>
                        <TabsTrigger value="history" className="gap-2 text-xs rounded-lg">
                            <History className="h-3.5 w-3.5" />
                            Histórico ({savedLetters.length})
                        </TabsTrigger>
                    </TabsList>

                    {/* ABA 1: EDITOR WYSIWYG WORD-STYLE + A4 PREVIEW */}
                    <TabsContent value="editor" className="space-y-5 mt-4">
                        
                        {/* --- SELECT 2: PESQUISA AUTOMÁTICA DE CLIENTE --- */}
                        <div ref={select2Ref} className="relative p-4 rounded-2xl bg-card border border-border/80 shadow-xs space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wide">
                                    <UserCheck className="h-4 w-4 text-primary" />
                                    Pesquisa Automática de Cliente:
                                </span>
                                {selectedClient && (
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[11px] bg-emerald-500/10 text-emerald-600 border-emerald-300 font-bold px-2.5 py-0.5">
                                            ✓ {selectedClient.name} (NIF: {selectedClient.nif || 'Não informado'})
                                        </Badge>
                                        <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-300 font-semibold">
                                            Banco: {bankDestinationName}
                                        </Badge>
                                    </div>
                                )}
                            </div>

                            {/* Campo Dropdown Searchable Estilo Select2 */}
                            <div className="relative">
                                <div 
                                    onClick={() => setIsSelect2Open(!isSelect2Open)}
                                    className="flex items-center justify-between w-full h-11 px-3.5 bg-background border rounded-xl cursor-pointer hover:border-primary/60 transition-colors shadow-2xs"
                                >
                                    <div className="flex items-center gap-2.5 truncate">
                                        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                                        {selectedClient ? (
                                            <span className="font-semibold text-xs text-foreground truncate">
                                                {selectedClient.name} — NIF: {selectedClient.nif || 'S/NIF'} | Banco: {bankDestinationName}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">
                                                Clique para buscar e selecionar qualquer cliente cadastrado no sistema...
                                            </span>
                                        )}
                                    </div>
                                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0", isSelect2Open && "rotate-180")} />
                                </div>

                                {/* Menu Flutuante Select2 */}
                                {isSelect2Open && (
                                    <div className="absolute z-50 left-0 right-0 top-12 mt-1 bg-popover text-popover-foreground border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                        <div className="p-2 border-b bg-muted/30">
                                            <div className="relative">
                                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    autoFocus
                                                    value={clientSearchQuery}
                                                    onChange={(e) => setClientSearchQuery(e.target.value)}
                                                    placeholder="Digite para pesquisar por nome, NIF, telefone ou banco..."
                                                    className="pl-9 h-9 text-xs bg-background rounded-lg"
                                                />
                                            </div>
                                        </div>

                                        <div className="max-h-60 overflow-y-auto divide-y divide-border/50">
                                            {filteredClients.length === 0 ? (
                                                <div className="p-4 text-center text-xs text-muted-foreground">
                                                    Nenhum cliente encontrado com "{clientSearchQuery}".
                                                </div>
                                            ) : (
                                                filteredClients.map(c => {
                                                    const bank = ServicoCartasTransferencia.resolveClientBank(c);
                                                    const iban = ServicoCartasTransferencia.resolveClientIBAN(c);
                                                    return (
                                                        <div
                                                            key={c.id}
                                                            onClick={() => handleSelectClient(c)}
                                                            className="p-3 text-xs hover:bg-primary/5 cursor-pointer flex items-center justify-between transition-colors group"
                                                        >
                                                            <div className="space-y-0.5">
                                                                <strong className="block text-foreground text-xs group-hover:text-primary transition-colors">
                                                                    {c.name}
                                                                </strong>
                                                                <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                                                    <span>NIF: <strong>{c.nif || 'N/D'}</strong></span>
                                                                    <span>•</span>
                                                                    <span>Tel: <strong>{c.phone || 'N/D'}</strong></span>
                                                                    <span>•</span>
                                                                    <span className="text-blue-600 dark:text-blue-400 font-semibold">Banco: {bank}</span>
                                                                </div>
                                                            </div>
                                                            <Badge variant="outline" className="text-[10px] font-bold group-hover:bg-primary group-hover:text-primary-foreground transition-all shrink-0">
                                                                Preencher Auto
                                                            </Badge>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Parâmetros Rápidos de Referência Bancária */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-muted/20 border text-xs">
<datalist id="bancos-carta">{ANGOLAN_BANKS.map(bank => <option key={bank.code} value={bank.name} />)}</datalist>                            <div className="space-y-1">
                                <Label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                                    <Landmark className="h-3.5 w-3.5 text-primary" />
                                    <BankLogo name={bankDestinationName} /> Banco de Domicílio
                                </Label>
                                <Input
                                    value={bankDestinationName}
                                    onChange={(e) => setBankDestinationName(e.target.value)}
                                    list="bancos-carta" placeholder="Selecione ou escreva o banco"
                                    className="h-9 text-xs bg-background font-semibold rounded-xl"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                                    <Building className="h-3.5 w-3.5 text-primary" />
                                    Balcão / Agência
                                </Label>
                                <Input
                                    value={destinationBranch}
                                    onChange={(e) => setDestinationBranch(e.target.value)}
                                    placeholder="Ex: Balcão Central Luanda"
                                    className="h-9 text-xs bg-background rounded-xl"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                                    <KzIcon className="h-3.5 w-3.5 text-primary" />
                                    Prestação ({companySettings.currency})
                                </Label>
                                <Input
                                    type="number"
                                    value={installmentAmount}
                                    onChange={(e) => setInstallmentAmount(Number(e.target.value))}
                                    className="h-9 text-xs font-black text-emerald-600 bg-background rounded-xl"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                                    <Calendar className="h-3.5 w-3.5 text-primary" />
                                    Dia Mensal de Débito
                                </Label>
                                <Input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={dayOfMonth}
                                    onChange={(e) => setDayOfMonth(Number(e.target.value))}
                                    className="h-9 text-xs font-bold bg-background rounded-xl"
                                />
                            </div>
                        </div>

                        {/* --- LAYOUT DIVIDIDO: EDITOR DESTACADO (ESQUERDA) VS FOLHA A4 REAL (DIREITA) --- */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                            
                            {/* 1. PAINEL DO EDITOR WORD-STYLE COM COR DE DESTAQUE EM VOLTA */}
                            <div className="space-y-3">
                                
                                {/* CONTAINER COM COR EM VOLTA PARA DISTINGUIR */}
                                <div className="border-2 border-indigo-600/70 dark:border-indigo-400/60 rounded-2xl shadow-xl ring-4 ring-indigo-500/10 overflow-hidden bg-card">
                                    
                                    {/* Cabeçalho Colorido do Editor */}
                                    <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-800 text-white p-3.5 flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-xs">
                                                <Edit3 className="h-4 w-4 text-white" />
                                            </div>
                                            <div>
                                                <span className="font-bold text-sm tracking-tight block text-white">
                                                    Editor de Texto
                                                </span>
                                                <span className="text-[10px] text-blue-200">
                                                    Edição direta de termos, cláusulas e formatação
                                                </span>
                                            </div>
                                        </div>

                                        {/* Gerenciador de Modelos de Cartas e Controle de Altura */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <div className="w-48 sm:w-56">
                                                <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                                                    <SelectTrigger className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white border-white/20 rounded-lg">
                                                        <SelectValue placeholder="Modelo de Carta" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {templates.map(m => (
                                                            <SelectItem key={m.id} value={m.id}>
                                                                {m.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => setIsNewTemplateDialogOpen(true)}
                                                className="h-8 px-2.5 text-xs bg-white/20 hover:bg-white/30 text-white font-semibold rounded-lg"
                                                title="Criar novo modelo de carta a partir deste texto"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                                Novo Modelo
                                            </Button>

                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => setEditorHeightMode(prev => prev === 'full' ? 'expanded' : prev === 'expanded' ? 'normal' : 'full')}
                                                className="h-8 px-2.5 text-xs bg-white/15 hover:bg-white/25 text-white font-medium rounded-lg gap-1.5"
                                                title="Alternar altura do editor (Expandida, Completa ou Padrão)"
                                            >
                                                <ChevronsUpDown className="h-3.5 w-3.5" />
                                                <span className="hidden sm:inline">
                                                    Altura: {editorHeightMode === 'full' ? 'Sem Limite (100%)' : editorHeightMode === 'expanded' ? 'Expandida' : 'Padrão'}
                                                </span>
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Barra de Ferramentas / Word Toolbar */}
                                    <div className="p-2 bg-slate-100 dark:bg-slate-800/90 border-b flex flex-wrap items-center gap-1">
                                        {/* Estilos de Texto */}
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => executeCommand('bold')}
                                            className="h-7 w-7 p-0 font-black hover:bg-slate-200 dark:hover:bg-slate-700"
                                            title="Negrito (Ctrl+B)"
                                        >
                                            <Bold className="h-3.5 w-3.5" />
                                        </Button>

                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => executeCommand('italic')}
                                            className="h-7 w-7 p-0 italic hover:bg-slate-200 dark:hover:bg-slate-700"
                                            title="Itálico (Ctrl+I)"
                                        >
                                            <Italic className="h-3.5 w-3.5" />
                                        </Button>

                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => executeCommand('underline')}
                                            className="h-7 w-7 p-0 underline hover:bg-slate-200 dark:hover:bg-slate-700"
                                            title="Sublinhado (Ctrl+U)"
                                        >
                                            <Underline className="h-3.5 w-3.5" />
                                        </Button>

                                        <div className="w-[1px] h-5 bg-border mx-1" />

                                        {/* Destaque / Realce de Texto */}
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleHighlightText('#fef08a')}
                                            className="h-7 px-2 text-[11px] gap-1 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-200 font-semibold"
                                            title="Destacar Amarelo"
                                        >
                                            <Highlighter className="h-3 w-3" />
                                            Amarelo
                                        </Button>

                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleHighlightText('#bbf7d0')}
                                            className="h-7 px-2 text-[11px] gap-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 font-semibold"
                                            title="Destacar Verde"
                                        >
                                            <Highlighter className="h-3 w-3" />
                                            Verde
                                        </Button>

                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => executeCommand('removeFormat')}
                                            className="h-7 w-7 p-0 text-muted-foreground hover:bg-slate-200 dark:hover:bg-slate-700"
                                            title="Limpar Formatação"
                                        >
                                            <RotateCcw className="h-3 w-3" />
                                        </Button>

                                        <div className="w-[1px] h-5 bg-border mx-1" />

                                        {/* Alinhamento */}
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => executeCommand('justifyLeft')}
                                            className="h-7 w-7 p-0 hover:bg-slate-200 dark:hover:bg-slate-700"
                                            title="Alinhar à Esquerda"
                                        >
                                            <AlignLeft className="h-3.5 w-3.5" />
                                        </Button>

                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => executeCommand('justifyCenter')}
                                            className="h-7 w-7 p-0 hover:bg-slate-200 dark:hover:bg-slate-700"
                                            title="Centralizar"
                                        >
                                            <AlignCenter className="h-3.5 w-3.5" />
                                        </Button>

                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => executeCommand('justifyRight')}
                                            className="h-7 w-7 p-0 hover:bg-slate-200 dark:hover:bg-slate-700"
                                            title="Alinhar à Direita"
                                        >
                                            <AlignRight className="h-3.5 w-3.5" />
                                        </Button>

                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => executeCommand('justifyFull')}
                                            className="h-7 w-7 p-0 hover:bg-slate-200 dark:hover:bg-slate-700"
                                            title="Justificar"
                                        >
                                            <AlignJustify className="h-3.5 w-3.5" />
                                        </Button>

                                        <div className="w-[1px] h-5 bg-border mx-1" />

                                        {/* Listas */}
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => executeCommand('insertUnorderedList')}
                                            className="h-7 w-7 p-0 hover:bg-slate-200 dark:hover:bg-slate-700"
                                            title="Lista com Marcadores"
                                        >
                                            <List className="h-3.5 w-3.5" />
                                        </Button>

                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => executeCommand('insertOrderedList')}
                                            className="h-7 w-7 p-0 hover:bg-slate-200 dark:hover:bg-slate-700"
                                            title="Lista Numerada"
                                        >
                                            <ListOrdered className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>

                                    {/* Editor ContentEditable Word com Altura Aumentada e Confortável */}
                                    <div
                                        ref={editorRef}
                                        contentEditable
                                        onInput={handleEditorInput}
                                        className="p-8 sm:p-10 pb-28 bg-background text-foreground font-serif text-[12.5px] leading-relaxed focus:outline-hidden overflow-y-auto transition-all duration-200 shadow-inner"
                                        style={{
                                            minHeight: editorHeightMode === 'full' ? '1050px' : editorHeightMode === 'expanded' ? '980px' : '820px',
                                            maxHeight: editorHeightMode === 'full' ? 'none' : editorHeightMode === 'expanded' ? '1350px' : '920px'
                                        }}
                                    />
                                </div>

                                {/* Tags de Inserção Rápida */}
                                <div className="p-3 rounded-2xl border bg-muted/20 space-y-1.5">
                                    <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                                        Inserir Variável no Cursor:
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => insertPlaceholder(selectedClient?.name || 'Nome do Cliente')}
                                            className="h-6 text-[10px] px-2 rounded-lg font-semibold"
                                        >
                                            + Nome Cliente
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => insertPlaceholder(ServicoCartasTransferencia.resolveClientIBAN(selectedClient))}
                                            className="h-6 text-[10px] px-2 rounded-lg font-semibold"
                                        >
                                            + IBAN Cliente
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => insertPlaceholder(bankDestinationName)}
                                            className="h-6 text-[10px] px-2 rounded-lg font-semibold"
                                        >
                                            + Banco Cliente
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => insertPlaceholder(formatCurrency(installmentAmount, companySettings.currency))}
                                            className="h-6 text-[10px] px-2 rounded-lg font-semibold"
                                        >
                                            + Valor Prestação
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => insertPlaceholder(`Dia ${dayOfMonth} de cada mês`)}
                                            className="h-6 text-[10px] px-2 rounded-lg font-semibold"
                                        >
                                            + Dia Débito
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => insertPlaceholder(companySettings?.name || 'Tango Créditos')}
                                            className="h-6 text-[10px] px-2 rounded-lg font-semibold"
                                        >
                                            + Nome Empresa
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* 2. PAINEL DE PRÉ-VISUALIZAÇÃO EM FOLHA A4 REAL */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold flex items-center gap-1.5 text-foreground uppercase tracking-wide">
                                        <Eye className="h-3.5 w-3.5 text-primary" />
                                        Pré-visualização em Tempo Real (Folha A4):
                                    </span>
                                    
                                    {/* Controles de Zoom e Proporção */}
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[10px] font-bold">
                                            A4 • 210 × 297 mm
                                        </Badge>
                                        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 border">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setA4Zoom(prev => Math.max(70, prev - 10))}
                                                className="h-6 w-6 p-0"
                                                title="Reduzir Zoom"
                                            >
                                                <ZoomOut className="h-3 w-3" />
                                            </Button>
                                            <span className="text-[10px] font-bold px-1">{a4Zoom}%</span>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setA4Zoom(prev => Math.min(130, prev + 10))}
                                                className="h-6 w-6 p-0"
                                                title="Aumentar Zoom"
                                            >
                                                <ZoomIn className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Container Exterior com Fundo Neutro e Sombra */}
                                <div className="p-4 rounded-2xl bg-slate-200/80 dark:bg-slate-900 border flex justify-center overflow-x-auto shadow-inner min-h-[980px]">
                                    
                                    {/* FOLHA A4 AUTÊNTICA (210mm x 297mm) */}
                                    <div
                                        style={{
                                            width: `${(210 * (a4Zoom / 100)).toFixed(1)}mm`,
                                            minHeight: `${(297 * (a4Zoom / 100)).toFixed(1)}mm`,
                                            boxShadow: '0 15px 35px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
                                            transformOrigin: 'top center'
                                        }}
                                        className="bg-white text-slate-900 p-10 sm:p-12 rounded-xs font-serif text-[11px] leading-relaxed relative flex flex-col justify-between select-text"
                                    >
                                        {/* Marca d'Água Oficial de Fundo */}
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.035] select-none rotate-[-30deg]">
                                            <span className="text-7xl font-black uppercase tracking-widest text-slate-950">
                                                DOCUMENTO
                                            </span>
                                        </div>

                                        <div>
                                            {/* Cabeçalho Oficial da Carta com Logotipo da Empresa */}
                                            <div className="border-b pb-4 mb-5 flex items-start justify-between gap-4">
                                                <div className="flex items-center gap-3">
                                                    {/* Logotipo da Empresa */}
                                                    {companySettings?.logo || companySettings?.reportLogo ? (
                                                        <img
                                                            src={companySettings.logo || companySettings.reportLogo}
                                                            alt={companySettings.name}
                                                            className="h-14 max-h-16 max-w-[160px] object-contain shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="h-12 w-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-sans font-black text-lg shrink-0">
                                                            {(companySettings?.name || 'T')[0]}
                                                        </div>
                                                    )}

                                                    <div>
                                                        <h3 className="font-sans font-bold text-sm text-slate-950 uppercase tracking-tight">
                                                            {companySettings?.name || 'DIGITAL NORTE COMERCIO E PRESTAÇÃO SE DE SERVIÇOS'}
                                                        </h3>
                                                        <p className="font-sans text-[9px] text-slate-500">
                                                            NIF: {companySettings?.nif || '0055445788'} | Registo Comercial
                                                        </p>
                                                        <p className="font-sans text-[9px] text-slate-500">
                                                            {companySettings?.address || 'Luanda, Angola'}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="text-right shrink-0">
                                                    <span className="font-sans font-black text-[11px] text-amber-600 block uppercase tracking-wider">
                                                        ORDEM BANCÁRIA
                                                    </span>
                                                    <span className="font-sans text-[9.5px] text-slate-400">
                                                        {formatDate(new Date())}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Conteúdo HTML editável em tempo real na própria folha A4 */}
                                            <div
                                                ref={previewEditableRef}
                                                contentEditable
                                                suppressContentEditableWarning
                                                onInput={handlePreviewEditableInput}
                                                className="carta-preview-html text-slate-900 leading-normal focus:outline-hidden focus:ring-1 focus:ring-blue-300 rounded p-1"
                                                dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(bodyHtml) }}
                                            />
                                        </div>

                                        {/* Rodapé da Folha A4 */}
                                        <div className="border-t pt-3 mt-8 flex items-center justify-between text-[8.5px] text-slate-400 font-sans">
                                            <span>Documento de Instrução Bancária emitido digitalmente pelo sistema Tango Gestão de Créditos ERP</span>
                                            <span>Pág. 1 / 1</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    {/* ABA 2: HISTÓRICO DE CARTAS GUARDADAS */}
                    <TabsContent value="history" className="mt-4">
                        <div className="p-4 rounded-2xl bg-card border shadow-xs space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                                        <History className="h-4 w-4 text-primary" />
                                        Cartas Salvas no Histórico
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        Uma linha por cliente com o número de cartas emitidas. "Ver histórico" mostra todas as cartas do cliente para editar, baixar, imprimir ou excluir.
                                    </p>
                                </div>
                            </div>

                            <HistoricoCartas
                                letters={savedLetters}
                                currency={companySettings.currency}
                                onEdit={handleLoadFromHistory}
                                onDownload={letter => void handleDownloadPDF(letter)}
                                onPrint={letter => void handlePrint(letter)}
                                onDelete={letter => handleDeleteLetter(letter.id)}
                            />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* DIALOG PARA CRIAR NOVO MODELO DE CARTA */}
            <Dialog open={isNewTemplateDialogOpen} onOpenChange={setIsNewTemplateDialogOpen}>
                <DialogContent className="max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileCheck2 className="h-5 w-5 text-primary" />
                            Salvar como Novo Modelo de Carta
                        </DialogTitle>
                        <DialogDescription>
                            O texto e estrutura atualmente presentes no editor serão salvos como um novo modelo reutilizável.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Nome do Modelo *</Label>
                            <Input
                                value={newTemplateName}
                                onChange={(e) => setNewTemplateName(e.target.value)}
                                placeholder="Ex: Modelo BAI - Crédito Salário..."
                                className="h-9 text-xs rounded-xl"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Descrição / Observações</Label>
                            <Input
                                value={newTemplateDesc}
                                onChange={(e) => setNewTemplateDesc(e.target.value)}
                                placeholder="Ex: Modelo específico para funcionários públicos com domiciliação no BAI..."
                                className="h-9 text-xs rounded-xl"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsNewTemplateDialogOpen(false)}
                            className="text-xs rounded-xl"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleCreateCustomTemplate}
                            className="text-xs font-bold rounded-xl gap-1.5"
                        >
                            <Save className="h-3.5 w-3.5" />
                            Salvar Modelo
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}
