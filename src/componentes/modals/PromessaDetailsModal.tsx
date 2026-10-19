import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Credit } from '@/tipos/credito';
import { CONTRACT_PLACEHOLDERS, generatePromessaContractPDF, parsePromessaTerms } from '@/bibliotecas/pdf';
import { PROMESSA_CLAUSES_TEMPLATE, PROMESSA_CONTRACT_TITLE, PROMESSA_PLACEHOLDERS } from '@/bibliotecas/contrato-promessa';
import { CompanySettings } from '@/tipos/base-dados';
import { Braces, Download, Loader2, RotateCcw, Save } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { PdfCanvasViewer } from '@/componentes/ui/PdfCanvasViewer';

interface PromessaDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    credit: Credit | null;
    client: any | null; // Cliente do contrato, para pré-preencher a identificação.
    companySettings: CompanySettings;
    userName?: string;
    /** Guarda o título e o texto editados neste contrato (usados nos PDF seguintes). */
    onSaveTerms?: (terms: { title: string; clauses: string }) => Promise<void>;
}

const MARITAL_STATUS: Record<string, string> = {
    SOLTEIRO: 'Solteiro(a)',
    CASADO: 'Casado(a)',
    DIVORCIADO: 'Divorciado(a)',
    VIUVO: 'Viúvo(a)',
    UNIAO_DE_FACTO: 'União de Facto',
};

const PLACEHOLDERS = [...CONTRACT_PLACEHOLDERS, ...PROMESSA_PLACEHOLDERS];

type Details = { maritalStatus: string; documentNumber: string; nif: string; address: string; phone: string; email: string };

const detailsFromClient = (client: any): Details => {
    const isBi = !client?.documentType || client.documentType === 'BI';
    return {
        maritalStatus: client?.maritalStatus || '',
        documentNumber: isBi ? (client?.nif || '') : '',
        nif: client?.nif || '',
        address: client?.address || '',
        phone: client?.phone || '',
        email: client?.email || '',
    };
};

export function PromessaDetailsModal({
    isOpen,
    onClose,
    credit,
    client,
    companySettings,
    userName,
    onSaveTerms,
}: PromessaDetailsModalProps) {
    const [details, setDetails] = useState<Details>(() => detailsFromClient(client));
    const [title, setTitle] = useState(PROMESSA_CONTRACT_TITLE);
    const [clauses, setClauses] = useState(PROMESSA_CLAUSES_TEMPLATE);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const clausesRef = useRef<HTMLTextAreaElement>(null);

    // Ao abrir: dados do cliente e o texto guardado neste contrato (ou o modelo padrão).
    useEffect(() => {
        if (!isOpen) return;
        const saved = parsePromessaTerms((credit as any)?.terms);
        setDetails(detailsFromClient(client));
        setTitle(saved?.title || PROMESSA_CONTRACT_TITLE);
        setClauses(saved?.clauses || PROMESSA_CLAUSES_TEMPLATE);
        setSaveMessage(null);
        // Só ao abrir ou ao trocar de contrato: guardar o texto não apaga o que está a ser editado.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, client?.id, credit?.id]);

    const pdfData = useCallback(() => ({
        ...credit,
        clientName: client?.name || credit?.clientName,
        clientNif: details.nif,
        clientDocumentNumber: details.documentNumber,
        clientMaritalStatus: MARITAL_STATUS[details.maritalStatus] || details.maritalStatus,
        clientAddress: details.address,
        clientPhone: details.phone,
        clientEmail: details.email,
        lateInterestRate: (credit as any)?.lateInterestRate ?? client?.lateInterestRate,
    }), [credit, client, details]);

    // Pré-visualização em tempo real: regenera 500 ms depois da última alteração.
    useEffect(() => {
        if (!isOpen || !credit) return;
        const timer = window.setTimeout(() => {
            try {
                const url = generatePromessaContractPDF(pdfData(), companySettings, userName, 'blob', { title, clauses });
                if (url) setPreviewUrl(url as string);
            } catch (error) {
                console.error('[PromessaDetailsModal] Falha ao gerar a pré-visualização:', error);
            }
        }, 500);
        return () => window.clearTimeout(timer);
    }, [isOpen, credit, pdfData, companySettings, userName, title, clauses]);

    useEffect(() => {
        return () => {
            if (previewUrl) {
                try { URL.revokeObjectURL(previewUrl); } catch (e) { }
            }
        };
    }, [previewUrl]);

    const insertPlaceholder = (token: string) => {
        const textarea = clausesRef.current;
        const start = textarea?.selectionStart ?? clauses.length;
        const end = textarea?.selectionEnd ?? clauses.length;
        setClauses(clauses.slice(0, start) + token + clauses.slice(end));
        requestAnimationFrame(() => {
            textarea?.focus();
            textarea?.setSelectionRange(start + token.length, start + token.length);
        });
    };

    const handleDownload = () => {
        if (!credit) return;
        try {
            generatePromessaContractPDF(pdfData(), companySettings, userName, 'save', { title, clauses });
        } catch (error) {
            console.error('[PromessaDetailsModal] Falha ao gerar o PDF:', error);
        }
    };

    const handleSave = async () => {
        if (!onSaveTerms) return;
        if (clauses.trim().length < 20) {
            setSaveMessage('O texto do contrato não pode ficar vazio.');
            return;
        }
        setIsSaving(true);
        try {
            await onSaveTerms({ title: title.trim() || PROMESSA_CONTRACT_TITLE, clauses });
            setSaveMessage('Texto guardado neste contrato.');
        } catch (error) {
            console.error('[PromessaDetailsModal] Falha ao guardar:', error);
            setSaveMessage('Não foi possível guardar. Verifique as permissões.');
        } finally {
            setIsSaving(false);
        }
    };

    const field = (key: keyof Details, label: string, placeholder = '') => (
        <div className="space-y-1">
            <Label className="text-xs">{label}</Label>
            <Input className="h-8 text-sm" value={details[key]} placeholder={placeholder}
                onChange={(e) => setDetails(prev => ({ ...prev, [key]: e.target.value }))} />
        </div>
    );

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="flex h-[96vh] w-[98vw] max-w-[98vw] flex-col gap-0 overflow-hidden p-0">
                <DialogHeader className="m-0 border-b px-6 py-4">
                    <DialogTitle>Contrato de Mútuo e Financiamento de Microcrédito</DialogTitle>
                    <DialogDescription>
                        Os dados da empresa, do cliente e do crédito são preenchidos automaticamente. Pode editar o texto; a pré-visualização actualiza-se enquanto escreve.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex min-h-0 flex-1">
                    <aside className="flex w-full max-w-[480px] shrink-0 flex-col border-r bg-background">
                        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                            <p className="text-sm font-bold">Identificação do mutuário</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs">Estado civil</Label>
                                    <Select value={details.maritalStatus || undefined} onValueChange={(v) => setDetails(prev => ({ ...prev, maritalStatus: v }))}>
                                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleccione" /></SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(MARITAL_STATUS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {field('documentNumber', 'N.º do B.I. / documento', '000000000XX000')}
                                {field('nif', 'NIF')}
                                {field('phone', 'Contacto')}
                            </div>
                            {field('address', 'Morada', 'Rua, bairro, município, província')}
                            {field('email', 'Email')}

                            <div className="mt-2 space-y-1">
                                <Label htmlFor="promessa-title" className="text-xs">Título do documento</Label>
                                <Input id="promessa-title" className="h-8 font-semibold" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Braces className="h-3.5 w-3.5" /> Inserir dados do contrato</p>
                                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                                    {PLACEHOLDERS.map(item => (
                                        <button key={item.token} type="button" title={item.token} onClick={() => insertPlaceholder(item.token)}
                                            className="rounded-md border bg-muted/60 px-2 py-1 text-[11px] font-medium hover:bg-muted">
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex min-h-[320px] flex-1 flex-col space-y-1">
                                <Label htmlFor="promessa-clauses" className="text-xs">
                                    Texto do contrato (linhas com "CLÁUSULA" e títulos em maiúsculas terminados em ":" saem a negrito; "•" cria uma alínea)
                                </Label>
                                <Textarea id="promessa-clauses" ref={clausesRef} value={clauses} spellCheck
                                    onChange={(e) => setClauses(e.target.value)}
                                    className="min-h-[320px] flex-1 resize-none font-mono text-xs leading-relaxed" />
                            </div>
                            {saveMessage && <p className="text-xs text-muted-foreground">{saveMessage}</p>}
                        </div>
                        <div className="flex flex-wrap gap-2 border-t p-3">
                            <Button variant="outline" size="sm" onClick={() => { setTitle(PROMESSA_CONTRACT_TITLE); setClauses(PROMESSA_CLAUSES_TEMPLATE); }}>
                                <RotateCcw className="mr-2 h-3.5 w-3.5" /> Repor modelo
                            </Button>
                            {onSaveTerms && (
                                <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving}>
                                    {isSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                                    Guardar texto
                                </Button>
                            )}
                            <Button size="sm" className="ml-auto" onClick={handleDownload}>
                                <Download className="mr-2 h-3.5 w-3.5" /> Baixar PDF
                            </Button>
                        </div>
                    </aside>
                    <div className="relative min-h-0 flex-1 bg-slate-100">
                        {previewUrl
                            ? <PdfCanvasViewer source={previewUrl} />
                            : <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> A gerar a pré-visualização…</div>}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
