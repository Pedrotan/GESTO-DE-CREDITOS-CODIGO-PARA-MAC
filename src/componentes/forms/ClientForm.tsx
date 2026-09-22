import { useEffect, useRef, useState } from 'react';
import { 
    CreditCard, 
    Landmark, 
    Plus, 
    Trash, 
    Upload, 
    Scan, 
    FileText, 
    Eye, 
    X, 
    Building, 
    CheckCircle2, 
    Loader2, 
    Search, 
    User, 
    FolderPlus, 
    Calendar, 
    MapPin, 
    ShieldAlert, 
    Briefcase,
    Users,
    Sparkles,
    Fingerprint
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useFormDraft } from '@/ganchos/usar-rascunho-formulario';
import { ServicoAngolaAPI } from '@/servicos/ServicoAngolaAPI';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { AutocompleteInput } from '@/componentes/ui/AutocompleteInput';
import { Label } from '@/componentes/ui/label';
import { Badge } from '@/componentes/ui/badge';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/componentes/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/componentes/ui/select';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/componentes/ui/dialog';
import { Client, ClientDocument, BankCoordinate } from '@/tipos/credito';
import { ScannerModal } from '@/componentes/modals/ScannerModal';
import { AlertModal } from '@/componentes/ui/AlertModal';
import { ANGOLAN_BANKS, formatAngolanIBAN, identifyBankFromIBAN, validateAngolanIBAN } from '@/bibliotecas/ibanHelper';
import { PdfCanvasViewer } from '@/componentes/ui/PdfCanvasViewer';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { cn } from '@/bibliotecas/utils';
import { formatAngolanPhone } from '@/bibliotecas/formatters';
import { detetarGeneroPorNome } from '@/bibliotecas/genero';
import { calcularIdade, validarBI, inferirProvinciaDoBI, normalizarDataISO } from '@/bibliotecas/formatadores';
import { SearchableSelect } from '@/componentes/ui/SearchableSelect';
import { PAISES, nacionalidadeDoPais } from '@/dados/paises';
import {
    validarPassaporte,
    normalizarPassaporte,
    EstadoPassaporte,
} from '@/servicos/ServicoPassaporte';

const clientSchema = z.object({
    name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
    nif: z.string().min(1, 'NIF é obrigatório'),
    phone: z.string().min(1, 'Telefone é obrigatório'),
    email: z.string().email('Email inválido').or(z.literal('')).optional(),
    address: z.string().optional(),
    birthDate: z.string().optional(),
    age: z.coerce.number().min(0).optional(),
    issueDate: z.string().optional(),
    expiryDate: z.string().optional(),
    gender: z.string().optional(),
    maritalStatus: z.string().optional(),
    // --- Dados do conjuge (so relevantes para casados/uniao de facto) ---
    spouseName: z.string().optional(),
    spouseBi: z.string().optional(),
    spouseNif: z.string().optional(),
    spousePhone: z.string().optional(),
    spouseEmail: z.string().email('Email do cônjuge inválido').or(z.literal('')).optional(),
    // --- Campos exclusivos da carteira de Aposentados ---
    workInstitution: z.string().optional(),
    socialSecurityNumber: z.string().optional(),
    // --- Identificacao do tipo de titular ---
    clientType: z.enum(['PARTICULAR', 'EMPRESA']).optional(),
    // --- Documento de identificação (nacional ou estrangeiro) ---
    documentType: z.enum(['BI', 'PASSAPORTE']).optional(),
    countryCode: z.string().optional(),
    nationality: z.string().optional(),
    passportFormatValidated: z.boolean().optional(),
    // --- Campos exclusivos de Pessoa Colectiva (Empresa) ---
    foundationDate: z.string().optional(),
    legalForm: z.string().optional(),
    businessSector: z.string().optional(),
    commercialRegistry: z.string().optional(),
    legalRepresentative: z.string().optional(),
    legalRepRole: z.string().optional(),
    creditLimit: z.coerce.number().min(0, 'Limite inválido'),
    monthlyIncome: z.coerce.number().min(0).optional(),
    defaultInterestRate: z.coerce.number().min(0, 'Taxa inválida'),
    lateInterestRate: z.coerce.number().min(0, 'Taxa por mora inválida'),
    toleranceDays: z.coerce.number().min(0, 'Dias inválidos'),
    status: z.enum(['active', 'blocked', 'inactive']),
    riskLevel: z.enum(['low', 'medium', 'high']),
    receiveMethod: z.enum(['transfer', 'cash']),
});

type ClientFormValues = z.infer<typeof clientSchema>;

interface ClientFormProps {
    onSubmit: (data: any) => void;
    initialData?: Client;
    onCancel: () => void;
    submitLabel?: string;
    /** Carteira em que o cadastro está a ser feito. Estrangeiros abrem já em passaporte. */
    category?: 'COMUM' | 'APOSENTADO' | 'ESTRANGEIRO';
}

/** Opções do select de países, já ordenadas por nome. */
const OPCOES_PAISES = PAISES.map((p) => ({
    value: p.codigo,
    label: p.nome,
    subLabel: p.nacionalidade,
}));

const detectClientType = (nif?: string): 'PARTICULAR' | 'EMPRESA' => {
    if (!nif) return 'PARTICULAR';
    if (nif.startsWith('SEM-') || nif === 'SEM IDENTIFICAÇÃO') return 'PARTICULAR';
    const clean = nif.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length === 14) return 'PARTICULAR';
    return 'EMPRESA';
};

/**
 * Deteta o tipo de titular a partir do documento que esta a ser digitado.
 * BI (particular): 9 digitos + 2 letras + 3 digitos.
 * NIF colectivo (empresa): 10 digitos.
 * Devolve null enquanto o valor ainda for ambiguo (menos de 10 caracteres).
 */
const detectTypeFromInput = (raw: string): 'PARTICULAR' | 'EMPRESA' | null => {
    const clean = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (clean.length < 10) return null;
    if (/^d{9}[A-Z]/.test(clean)) return 'PARTICULAR';
    if (/^d{10}/.test(clean)) return 'EMPRESA';
    return null;
};

const isSemNif = (nif?: string): boolean => {
    return !!nif && (nif.startsWith('SEM-') || nif === 'SEM IDENTIFICAÇÃO');
};

const formatNIF = (value: string, type: 'SINGULAR' | 'COLECTIVO') => {
    const cleanValue = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    if (type === 'COLECTIVO') {
        // 10 digits
        return cleanValue.slice(0, 10).replace(/[^0-9]/g, '');
    } else {
        // SINGULAR (BI): 000000000AA000 (14 chars)
        // 9 digits + 2 letters + 3 digits
        let formatted = '';
        for (let i = 0; i < cleanValue.length && i < 14; i++) {
            const char = cleanValue[i];
            if (i < 9) {
                if (/[0-9]/.test(char)) formatted += char;
            } else if (i < 11) {
                if (/[A-Z]/.test(char)) formatted += char;
            } else {
                if (/[0-9]/.test(char)) formatted += char;
            }
        }
        return formatted;
    }
};

const normalizeGender = (raw: any): string => {
    if (!raw) return "";
    const g = String(raw).trim().toUpperCase();
    if (g.startsWith("M") || g.includes("MASC") || g === "HOMEM" || g === "H") return "M";
    if (g.startsWith("F") || g.includes("FEM") || g === "MULHER") return "F";
    if (g === "OUTRO" || g === "OTHER") return "Outro";
    return g;
};

const normalizeMaritalStatus = (raw: any): string => {
    if (!raw) return "";
    const s = String(raw).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (s.includes("SOLTEIR")) return "SOLTEIRO";
    if (s.includes("CASAD")) return "CASADO";
    if (s.includes("DIVORC")) return "DIVORCIADO";
    if (s.includes("VIUV")) return "VIUVO";
    if (s.includes("UNIAO") || s.includes("FACTO")) return "UNIAO_DE_FACTO";
    return s;
};

function isPdfDocument(doc: ClientDocument): boolean {
    return doc.type === 'pdf' || doc.data?.startsWith('data:application/pdf');
}

export function ClientForm({ onSubmit, initialData, onCancel, submitLabel = 'Guardar', category = 'COMUM' }: ClientFormProps) {
    const [applyInterest, setApplyInterest] = useState(
        initialData ? (initialData.defaultInterestRate > 0 || initialData.lateInterestRate > 0) : false
    );
    const [bankCoordinates, setBankCoordinates] = useState<BankCoordinate[]>(
        initialData?.bankCoordinates || []
    );
    const [documents, setDocuments] = useState<ClientDocument[]>(
        initialData?.documents || []
    );
    const [previewDoc, setPreviewDoc] = useState<ClientDocument | null>(null);
    const [previewDocUrl, setPreviewDocUrl] = useState<string | null>(null);
    const [newIban, setNewIban] = useState<{ bankName: string; iban: string; holder: string }>({
        bankName: '',
        iban: '',
        holder: '',
    });
    const [isIbanModalOpen, setIsIbanModalOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [isAlertOpen, setIsAlertOpen] = useState(false);
    const [genericAlert, setGenericAlert] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        type: string;
    }>({ isOpen: false, title: '', description: '', type: 'info' });

    const [clientType, setClientType] = useState<'PARTICULAR' | 'EMPRESA'>(
        initialData?.nif ? detectClientType(initialData.nif) : 'PARTICULAR'
    );
    const [noNif, setNoNif] = useState(
        initialData?.nif ? isSemNif(initialData.nif) : false
    );
    /** Só a carteira de estrangeiros mostra passaporte, país e nacionalidade. */
    const ehEstrangeiro = category === 'ESTRANGEIRO';
    /** Só a carteira de aposentados mostra a instituição e o nº de segurança social. */
    const ehAposentado = category === 'APOSENTADO';
    const [documentType, setDocumentType] = useState<'BI' | 'PASSAPORTE'>(
        ehEstrangeiro ? (initialData?.documentType || 'PASSAPORTE') : 'BI'
    );
    const [estadoPassaporte, setEstadoPassaporte] = useState<EstadoPassaporte>('vazio');
    const [msgPassaporte, setMsgPassaporte] = useState<string>('');

    const [isSearchingNIF, setIsSearchingNIF] = useState(false);
    const [isNameAutoFilled, setIsNameAutoFilled] = useState(false);

    const form = useForm<ClientFormValues>({
        resolver: zodResolver(clientSchema),
        defaultValues: initialData
            ? {
                name: initialData.name || '',
                nif: initialData.nif || '',
                phone: initialData.phone || '',
                email: initialData.email || '',
                address: initialData.address || '',
                birthDate: initialData.birthDate || '',
                age: initialData.age ?? (initialData.birthDate ? calcularIdade(initialData.birthDate) : 0),
                issueDate: initialData.issueDate || '',
                expiryDate: initialData.expiryDate || '',
                gender: initialData.gender || '',
                maritalStatus: initialData.maritalStatus || '',
                spouseName: initialData.spouseName || '',
                spouseBi: initialData.spouseBi || '',
                spouseNif: initialData.spouseNif || '',
                spousePhone: initialData.spousePhone || '',
                spouseEmail: initialData.spouseEmail || '',
                workInstitution: initialData.workInstitution || '',
                socialSecurityNumber: initialData.socialSecurityNumber || '',
                clientType: initialData.clientType || detectClientType(initialData.nif),
                documentType: category === 'ESTRANGEIRO' ? (initialData.documentType || 'PASSAPORTE') : 'BI',
                countryCode: initialData.countryCode || '',
                nationality: initialData.nationality || '',
                passportFormatValidated: initialData.passportFormatValidated || false,
                foundationDate: initialData.foundationDate || '',
                legalForm: initialData.legalForm || '',
                businessSector: initialData.businessSector || '',
                commercialRegistry: initialData.commercialRegistry || '',
                legalRepresentative: initialData.legalRepresentative || '',
                legalRepRole: initialData.legalRepRole || '',
                creditLimit: initialData.creditLimit || 0,
                monthlyIncome: initialData.monthlyIncome || 0,
                defaultInterestRate: initialData.defaultInterestRate || 0,
                lateInterestRate: initialData.lateInterestRate || 0,
                toleranceDays: initialData.toleranceDays || 0,
                status: initialData.status || 'active',
                riskLevel: initialData.riskLevel || 'medium',
                receiveMethod: initialData.receiveMethod || 'transfer',
            }
            : {
                name: '',
                nif: '',
                phone: '',
                email: '',
                address: '',
                birthDate: '',
                age: 0,
                issueDate: '',
                expiryDate: '',
                gender: '',
                maritalStatus: '',
                workInstitution: '',
                socialSecurityNumber: '',
                creditLimit: 0,
                monthlyIncome: 0,
                defaultInterestRate: 0,
                lateInterestRate: 0,
                toleranceDays: 0,
                status: 'active',
                riskLevel: 'medium',
                receiveMethod: 'transfer',
            },
    });

    /**
     * Troca o tipo de titular e limpa os campos que deixam de fazer sentido,
     * para nao ficarem dados de pessoa singular guardados numa empresa (e vice-versa).
     */
    const applyClientType = (next: 'PARTICULAR' | 'EMPRESA') => {
        if (next === clientType) return;
        setClientType(next);
        form.setValue('clientType', next, { shouldDirty: true });
        const limpar = next === 'EMPRESA'
            ? ['birthDate', 'age', 'gender', 'maritalStatus', 'issueDate', 'expiryDate',
               'spouseName', 'spouseBi', 'spouseNif', 'spousePhone', 'spouseEmail',
               'workInstitution', 'socialSecurityNumber'] as const
            : ['foundationDate', 'legalForm', 'businessSector', 'commercialRegistry', 'legalRepresentative', 'legalRepRole'] as const;
        limpar.forEach((campo) => {
            form.setValue(campo as any, campo === 'age' ? undefined : '', { shouldDirty: true });
        });
    };

    /**
     * Valida o passaporte 500 ms depois de o utilizador sair do campo.
     * Nunca bloqueia a submissão: o pior resultado é ficar "não verificado".
     */
    const passaporteTimer = useRef<any>(null);
    const validarPassaporteComAtraso = (numero: string) => {
        if (passaporteTimer.current) clearTimeout(passaporteTimer.current);
        if (!numero) {
            setEstadoPassaporte('vazio');
            setMsgPassaporte('');
            return;
        }
        setEstadoPassaporte('a-validar');
        passaporteTimer.current = setTimeout(async () => {
            const pais = form.getValues('countryCode');
            const r = await validarPassaporte(numero, pais);
            setEstadoPassaporte(r.estado);
            setMsgPassaporte(r.mensagem || '');
            form.setValue('passportFormatValidated', r.estado === 'valido', { shouldDirty: true });
        }, 500);
    };

    /** Trocar de país repõe o gentílico e reavalia o passaporte já escrito. */
    const aoMudarPais = (codigo: string) => {
        form.setValue('countryCode', codigo, { shouldDirty: true, shouldValidate: true });
        const gentilico = nacionalidadeDoPais(codigo);
        // Só sobrepõe se o utilizador ainda não escreveu uma nacionalidade própria.
        const actual = form.getValues('nationality');
        const anterior = nacionalidadeDoPais(form.getValues('countryCode'));
        if (!actual || actual === anterior) {
            form.setValue('nationality', gentilico, { shouldDirty: true });
        }
        const passaporte = form.getValues('nif');
        if (documentType === 'PASSAPORTE' && passaporte) validarPassaporteComAtraso(passaporte);
    };

    /** Alterna entre BI e passaporte, limpando o que deixa de fazer sentido. */
    const aplicarTipoDocumento = (tipo: 'BI' | 'PASSAPORTE') => {
        if (tipo === documentType) return;
        setDocumentType(tipo);
        form.setValue('documentType', tipo, { shouldDirty: true });
        form.setValue('nif', '', { shouldDirty: true });
        setEstadoPassaporte('vazio');
        setMsgPassaporte('');
        setIsNameAutoFilled(false);
        if (tipo === 'BI') {
            form.setValue('countryCode', '', { shouldDirty: true });
            form.setValue('nationality', '', { shouldDirty: true });
            form.setValue('passportFormatValidated', false, { shouldDirty: true });
        }
    };

    const handleSearchNIF = async () => {
        const nifValue = form.getValues('nif');
        if (!nifValue || nifValue.length < 9) return;

        setIsSearchingNIF(true);
        try {
            const nifType = clientType === 'PARTICULAR' ? 'SINGULAR' : 'COLECTIVO';
            console.log(`🚀 [ClientForm] Pesquisando ${nifType}: ${nifValue}`);
            const data = await ServicoAngolaAPI.fetchBIData(nifValue, nifType);

            if (data && data.success && data.name) {
                // 1. Nome Completo / Razão Social
                form.setValue('name', data.name, { shouldValidate: true, shouldDirty: true, shouldTouch: true });

                // 2. Data de Nascimento & Idade
                if (data.birthDate) {
                    const normalizedBirth = normalizarDataISO(data.birthDate) || data.birthDate;
                    form.setValue('birthDate', normalizedBirth, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
                    const autoAge = calcularIdade(normalizedBirth);
                    if (autoAge !== null) {
                        form.setValue('age', autoAge, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
                    }
                } else if (data.age !== undefined && data.age !== null && Number(data.age) > 0) {
                    form.setValue('age', Number(data.age), { shouldValidate: true, shouldDirty: true, shouldTouch: true });
                }

                // 3. Género / Sexo (com inferência por dicionário angolano se não veio na API)
                const genderVal = (data.gender === 'M' || data.gender === 'F') 
                    ? data.gender 
                    : (detetarGeneroPorNome(data.name) || normalizeGender(data.gender));
                if (genderVal) {
                    form.setValue('gender', genderVal, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
                }

                // 4. Estado Civil
                if (data.maritalStatus) {
                    const normalizedMarital = normalizeMaritalStatus(data.maritalStatus);
                    if (normalizedMarital) {
                        form.setValue('maritalStatus', normalizedMarital, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
                    }
                }

                // 5. Data de Emissão e Expiração do Bilhete
                if (data.issueDate) {
                    const normalizedIssue = normalizarDataISO(data.issueDate) || data.issueDate;
                    form.setValue('issueDate', normalizedIssue, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
                }
                if (data.expiryDate) {
                    const normalizedExpiry = normalizarDataISO(data.expiryDate) || data.expiryDate;
                    form.setValue('expiryDate', normalizedExpiry, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
                }

                // 6. Morada / Endereço Completo (com dedução de província pelo BI se não veio na API)
                const addressVal = data.address || (clientType === 'PARTICULAR' ? inferirProvinciaDoBI(nifValue) : '');
                if (addressVal) {
                    form.setValue('address', addressVal, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
                }

                setIsNameAutoFilled(true);

                const avisoDatas = !data.issueDate && !data.expiryDate
                    ? " (Nota: o serviço de consulta não fornece as datas de emissão/validade — copie-as do próprio documento se necessário)."
                    : "";

                setGenericAlert({
                    isOpen: true,
                    title: "Dados Encontrados com Sucesso",
                    description: `O titular "${data.name}" e os dados de identificação foram preenchidos com sucesso.${avisoDatas}`,
                    type: "success"
                });
            } else {
                setGenericAlert({
                    isOpen: true,
                    title: clientType === 'PARTICULAR' ? "BI não encontrado" : "NIF não encontrado",
                    description: data?.message || "Não foi possível encontrar os dados para este documento. Verifique se está correto.",
                    type: "warning"
                });
            }
        } catch (error) {
            console.error("Erro na busca de NIF:", error);
            setGenericAlert({
                isOpen: true,
                title: "Erro na Pesquisa",
                description: "Ocorreu uma falha ao ligar aos serviços de validação de documentos.",
                type: "error"
            });
        } finally {
            setIsSearchingNIF(false);
        }
    };

    const draftKey = initialData?.id ? `client_edit_${initialData.id}` : 'client_create';
    const { clearDraft } = useFormDraft<ClientFormValues>(draftKey, form, {
        extraState: {
            bankCoordinates,
            documents,
            applyInterest,
            clientType,
            noNif
        },
        onRestoreExtraState: (extra) => {
            if (extra.bankCoordinates) setBankCoordinates(extra.bankCoordinates);
            if (extra.documents) setDocuments(extra.documents);
            if (extra.applyInterest !== undefined) setApplyInterest(extra.applyInterest);
            if (extra.clientType) setClientType(extra.clientType);
            if (extra.noNif !== undefined) setNoNif(extra.noNif);
        }
    });

    useEffect(() => {
        if (previewDoc && !isPdfDocument(previewDoc)) {
            setPreviewDocUrl(previewDoc.data);
        } else {
            setPreviewDocUrl(null);
        }
    }, [previewDoc]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            setGenericAlert({
                isOpen: true,
                title: 'Ficheiro muito grande',
                description: 'O ficheiro não pode exceder 5MB.',
                type: 'warning',
            });
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            const newDoc: ClientDocument = {
                id: crypto.randomUUID(),
                title: file.name,
                type: file.type === 'application/pdf' ? 'pdf' : 'image',
                data: base64,
                createdAt: new Date(),
            };
            setDocuments(prev => [...prev, newDoc]);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleScanDocument = () => {
        setIsScannerOpen(true);
    };

    const handleSaveScans = (images: string[]) => {
        const newDocs: ClientDocument[] = images.map((img, idx) => ({
            id: crypto.randomUUID(),
            title: `Digitalizacao_${new Date().toLocaleDateString('pt-PT').replace(/\//g, '-')}_${idx + 1}`,
            type: 'image',
            data: img,
            createdAt: new Date(),
        }));
        setDocuments(prev => [...prev, ...newDocs]);
        setIsScannerOpen(false);
    };

    const removeDocument = (id: string) => {
        setDocuments(prev => prev.filter(d => d.id !== id));
    };

    const addIban = () => {
        if (!newIban.bankName || !newIban.iban || !newIban.holder) {
            setGenericAlert({
                isOpen: true,
                title: 'Campos incompletos',
                description: 'Preencha todos os campos para adicionar um IBAN.',
                type: 'warning',
            });
            return;
        }
        if (!validateAngolanIBAN(newIban.iban)) {
            setGenericAlert({
                isOpen: true,
                title: 'IBAN Inválido',
                description: 'O IBAN introduzido não é válido. Verifique o formato.',
                type: 'error',
            });
            return;
        }
        const newCoord: BankCoordinate = {
            id: crypto.randomUUID(),
            bankName: newIban.bankName,
            iban: newIban.iban,
            holder: newIban.holder,
        };
        setBankCoordinates(prev => [...prev, newCoord]);
        setNewIban({ bankName: '', iban: '', holder: '' });
    };

    const removeIban = (id: string) => {
        setBankCoordinates(prev => prev.filter(i => i.id !== id));
    };

    const handleFormSubmit = (data: ClientFormValues) => {
        clearDraft();
        onSubmit({
            ...data,
            clientType,
            documentType,
            documents,
            bankCoordinates,
        });
    };

    const handleWhatsAppTest = () => {
        const phone = form.getValues('phone');
        if (!phone) {
            setGenericAlert({
                isOpen: true,
                title: 'Telefone em falta',
                description: 'Introduza um número de telefone antes de testar o WhatsApp.',
                type: 'warning',
            });
            return;
        }
        const cleanPhone = phone.replace(/\D/g, '');
        window.open(`https://wa.me/${cleanPhone}`, '_blank');
        setIsAlertOpen(true);
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50/50">
                <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6 min-h-0">
                    
                    {/* ========================================================================= */}
                    {/* SEÇÃO 1: DADOS PESSOAIS E IDENTIFICAÇÃO */}
                    {/* ========================================================================= */}
                    <div className="rounded-2xl border border-blue-200/80 bg-white overflow-hidden shadow-xs">
                        {/* Barra de Cabeçalho com Cor de Destaque */}
                        <div className="bg-blue-50/80 border-b border-blue-100 px-5 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center text-sm shadow-xs shrink-0">
                                    1
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-blue-900 flex items-center gap-2">
                                        {clientType === 'PARTICULAR'
                                            ? <User className="h-4.5 w-4.5 text-blue-600 shrink-0" />
                                            : <Building className="h-4.5 w-4.5 text-blue-600 shrink-0" />}
                                        {clientType === 'PARTICULAR'
                                            ? '1. Dados Pessoais e Identificação'
                                            : '1. Dados da Empresa e Identificação'}
                                    </h3>
                                    <p className="text-xs text-blue-700/80">
                                        {clientType === 'PARTICULAR'
                                            ? 'Identificação oficial, dados biométricos, datas do documento, contactos e morada.'
                                            : 'NIF, constituição, forma jurídica, representante legal, contactos e sede.'}
                                    </p>
                                </div>
                            </div>
                            <Badge variant="outline" className="bg-blue-100/70 text-blue-800 border-blue-300 text-xs px-3 py-1 font-semibold hidden sm:inline-flex">
                                {clientType === 'PARTICULAR' ? 'Pessoa Singular' : 'Pessoa Colectiva'}
                            </Badge>
                        </div>

                        {/* Campos da Seção 1 */}
                        <div className="p-5 md:p-6 space-y-4">
                            {/* Identificação estrangeira: só na carteira de estrangeiros. */}
                            {ehEstrangeiro && (
                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
                                    <div className="lg:col-span-4">
                                        <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                                <CreditCard className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                                Tipo de Documento
                                            </FormLabel>
                                            <Select
                                                value={documentType}
                                                onValueChange={(v) => aplicarTipoDocumento(v as 'BI' | 'PASSAPORTE')}
                                            >
                                                <FormControl>
                                                    <SelectTrigger className="h-10 rounded-xl border-slate-200 focus-visible:ring-blue-500 text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="BI">Bilhete de Identidade (nacional)</SelectItem>
                                                    <SelectItem value="PASSAPORTE">Passaporte (estrangeiro)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    </div>

                                    {documentType === 'PASSAPORTE' && (
                                        <>
                                            <div className="lg:col-span-4">
                                                <FormField
                                                    control={form.control}
                                                    name="countryCode"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                                                <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                                                País Emissor
                                                            </FormLabel>
                                                            <SearchableSelect
                                                                options={OPCOES_PAISES}
                                                                value={field.value || ''}
                                                                onValueChange={aoMudarPais}
                                                                placeholder="Selecione o país"
                                                                searchPlaceholder="Procurar país…"
                                                                emptyMessage="Nenhum país encontrado."
                                                                className="h-10 rounded-xl border-slate-200 text-sm"
                                                            />
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>

                                            <div className="lg:col-span-4">
                                                <FormField
                                                    control={form.control}
                                                    name="nationality"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                                                Nacionalidade
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    placeholder="Preenchida pelo país, editável"
                                                                    {...field}
                                                                    value={field.value || ''}
                                                                    className="h-10 rounded-xl border-slate-200 focus-visible:ring-blue-500 text-sm"
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Linha 1: NIF/BI com Busca Automática */}
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
                                <div className="lg:col-span-6">
                                    <FormField
                                        control={form.control}
                                        name="nif"
                                        render={({ field }) => (
                                            <FormItem>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <FormLabel className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                                        <CreditCard className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                                        {documentType === 'PASSAPORTE'
                                                            ? 'Número do Passaporte'
                                                            : clientType === 'PARTICULAR' ? 'NIF / Bilhete de Identidade' : 'NIF da Empresa'}
                                                    </FormLabel>
                                                    <div className={cn('flex items-center gap-1.5', documentType === 'PASSAPORTE' && 'hidden')}>
                                                        <button
                                                            type="button"
                                                            disabled={noNif || isNameAutoFilled}
                                                            onClick={() => {
                                                                applyClientType('PARTICULAR');
                                                                if (!noNif) form.setValue('nif', '');
                                                            }}
                                                            className={cn(
                                                                "text-[11px] font-bold px-3 py-0.5 rounded-full transition-all border",
                                                                clientType === 'PARTICULAR'
                                                                    ? "bg-amber-500 border-amber-500 text-slate-950 shadow-xs"
                                                                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50",
                                                                (noNif || isNameAutoFilled) && "opacity-60 cursor-not-allowed"
                                                            )}
                                                        >
                                                            Particular
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={noNif || isNameAutoFilled}
                                                            onClick={() => {
                                                                applyClientType('EMPRESA');
                                                                if (!noNif) form.setValue('nif', '');
                                                            }}
                                                            className={cn(
                                                                "text-[11px] font-bold px-3 py-0.5 rounded-full transition-all border",
                                                                clientType === 'EMPRESA'
                                                                    ? "bg-amber-500 border-amber-500 text-slate-950 shadow-xs"
                                                                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50",
                                                                (noNif || isNameAutoFilled) && "opacity-60 cursor-not-allowed"
                                                            )}
                                                        >
                                                            Empresa
                                                        </button>
                                                    </div>

                                                    {/* Estado da validação do passaporte (ponto 3.2 da especificação) */}
                                                    {documentType === 'PASSAPORTE' && estadoPassaporte !== 'vazio' && (
                                                        <Badge
                                                            variant="outline"
                                                            title={msgPassaporte}
                                                            className={cn(
                                                                'px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-xs',
                                                                estadoPassaporte === 'valido' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                                                                estadoPassaporte === 'invalido' && 'bg-red-50 text-red-700 border-red-200',
                                                                estadoPassaporte === 'formato-invalido' && 'bg-red-50 text-red-700 border-red-200',
                                                                estadoPassaporte === 'a-validar' && 'bg-slate-50 text-slate-600 border-slate-200',
                                                                estadoPassaporte === 'nao-verificado' && 'bg-slate-50 text-slate-600 border-slate-200'
                                                            )}
                                                        >
                                                            {estadoPassaporte === 'a-validar' && <Loader2 className="h-3 w-3 animate-spin" />}
                                                            {estadoPassaporte === 'valido' && <CheckCircle2 className="h-3 w-3" />}
                                                            {(estadoPassaporte === 'invalido' || estadoPassaporte === 'formato-invalido') && <X className="h-3 w-3" />}
                                                            {estadoPassaporte === 'nao-verificado' && <ShieldAlert className="h-3 w-3" />}
                                                            {estadoPassaporte === 'a-validar' && 'A validar'}
                                                            {estadoPassaporte === 'valido' && 'Válido'}
                                                            {estadoPassaporte === 'invalido' && 'Inválido'}
                                                            {estadoPassaporte === 'formato-invalido' && 'Formato inválido'}
                                                            {estadoPassaporte === 'nao-verificado' && 'Não verificado'}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <FormControl>
                                                    <div className="flex items-center gap-3 w-full">
                                                        <label className={cn(
                                                            "flex items-center gap-2 shrink-0 cursor-pointer select-none",
                                                            isNameAutoFilled && "opacity-60 cursor-not-allowed",
                                                            documentType === 'PASSAPORTE' && "hidden"
                                                        )}>
                                                            <input
                                                                type="checkbox"
                                                                id="noNif"
                                                                checked={noNif}
                                                                disabled={isNameAutoFilled}
                                                                onChange={(e) => {
                                                                    const checked = e.target.checked;
                                                                    setNoNif(checked);
                                                                    if (checked) {
                                                                        const randomHex = Math.random().toString(36).substring(2, 10).toUpperCase();
                                                                        form.setValue('nif', `SEM-${randomHex}`);
                                                                    } else {
                                                                        form.setValue('nif', '');
                                                                    }
                                                                }}
                                                                className="sr-only"
                                                            />
                                                            <div className={cn(
                                                                "h-5 w-5 rounded-full border border-slate-400 transition-all flex items-center justify-center bg-white",
                                                                noNif ? "border-amber-500 bg-amber-500" : "hover:border-slate-700"
                                                            )}>
                                                                {noNif && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                            </div>
                                                            <span className="text-xs font-semibold text-slate-600">
                                                                {clientType === 'PARTICULAR' ? 'Sem BI' : 'Sem NIF'}
                                                            </span>
                                                        </label>
                                                        <div className="relative flex-1 flex items-center gap-2">
                                                            <Input
                                                                placeholder={
                                                                    documentType === 'PASSAPORTE'
                                                                        ? "Ex: N1234566"
                                                                        : noNif
                                                                            ? "Cliente sem identificação oficial"
                                                                            : clientType === 'PARTICULAR'
                                                                                ? "Ex: 000000000AA000"
                                                                                : "54XXXXXXXXX"
                                                                }
                                                                disabled={noNif}
                                                                readOnly={isNameAutoFilled}
                                                                value={noNif ? "Sem Identificação" : field.value}
                                                                onBlur={() => {
                                                                    // Dispara a validação ao sair do campo (ponto 3.2).
                                                                    if (documentType === 'PASSAPORTE') {
                                                                        validarPassaporteComAtraso(form.getValues('nif') || '');
                                                                    }
                                                                }}
                                                                onChange={(e) => {
                                                                    if (noNif) return;

                                                                    // Passaporte não leva máscara angolana: o formato varia por país.
                                                                    if (documentType === 'PASSAPORTE') {
                                                                        field.onChange(normalizarPassaporte(e.target.value));
                                                                        setEstadoPassaporte('vazio');
                                                                        setMsgPassaporte('');
                                                                        return;
                                                                    }

                                                                    const raw = e.target.value;
                                                                    // Deteta pelo proprio documento se e particular ou empresa
                                                                    // e comuta os campos do formulario em conformidade.
                                                                    const detetado = detectTypeFromInput(raw);
                                                                    if (detetado) applyClientType(detetado);
                                                                    const tipoEfetivo = detetado ?? clientType;
                                                                    const formatted = formatNIF(raw, tipoEfetivo === 'PARTICULAR' ? 'SINGULAR' : 'COLECTIVO');
                                                                    field.onChange(formatted);
                                                                }}
                                                                className={cn(
                                                                    "h-10 w-full rounded-xl border-slate-200 focus-visible:ring-blue-500 font-mono text-sm transition-all",
                                                                    isNameAutoFilled && "bg-slate-50 text-slate-600 cursor-not-allowed border-slate-200 font-semibold"
                                                                )}
                                                            />
                                                            {!noNif && documentType !== 'PASSAPORTE' && (
                                                                isNameAutoFilled ? (
                                                                    <Button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            form.setValue('name', '');
                                                                            form.setValue('nif', '');
                                                                            form.setValue('address', '');
                                                                            form.setValue('birthDate', '');
                                                                            form.setValue('age', 0);
                                                                            form.setValue('issueDate', '');
                                                                            form.setValue('expiryDate', '');
                                                                            form.setValue('gender', '');
                                                                            form.setValue('maritalStatus', '');
                                                                            form.setValue('foundationDate', '');
                                                                            form.setValue('legalForm', '');
                                                                            form.setValue('businessSector', '');
                                                                            form.setValue('commercialRegistry', '');
                                                                            form.setValue('legalRepresentative', '');
                                                                            form.setValue('legalRepRole', '');
                                                                            setIsNameAutoFilled(false);
                                                                        }}
                                                                        title="Limpar e desbloquear campos"
                                                                        className="h-10 px-3 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl transition-colors shrink-0 flex items-center gap-1.5 text-xs font-semibold border border-red-200"
                                                                    >
                                                                        <X className="h-4 w-4" />
                                                                        <span className="hidden sm:inline">Limpar</span>
                                                                    </Button>
                                                                ) : (
                                                                    <Button
                                                                        type="button"
                                                                        disabled={isSearchingNIF || !field.value || field.value.length < 9}
                                                                        onClick={handleSearchNIF}
                                                                        title="Consultar dados oficiais na base de Angola"
                                                                        className="h-10 px-3.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold rounded-xl transition-all shrink-0 flex items-center gap-1.5 shadow-xs text-xs"
                                                                    >
                                                                        {isSearchingNIF ? (
                                                                            <>
                                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                                                <span className="hidden sm:inline">Consultando...</span>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <Search className="h-4 w-4" />
                                                                                <span className="hidden sm:inline">Consulta Online</span>
                                                                            </>
                                                                        )}
                                                                    </Button>
                                                                )
                                                            )}
                                                        </div>
                                                    </div>
                                                </FormControl>
                                                {documentType === 'PASSAPORTE' && msgPassaporte && (
                                                    <p className={cn(
                                                        'text-xs font-medium mt-1',
                                                        estadoPassaporte === 'valido' ? 'text-emerald-600'
                                                            : (estadoPassaporte === 'invalido' || estadoPassaporte === 'formato-invalido') ? 'text-red-600'
                                                                : 'text-slate-500'
                                                    )}>
                                                        {msgPassaporte}
                                                    </p>
                                                )}
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Nome Completo */}
                                <div className="lg:col-span-6">
                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <FormLabel className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                                        Nome Completo / Razão Social
                                                    </FormLabel>
                                                    {isNameAutoFilled && (
                                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-xs">
                                                            <Sparkles className="h-3 w-3 text-emerald-600" />
                                                            Validado Online
                                                        </Badge>
                                                    )}
                                                </div>
                                                <FormControl>
                                                    <AutocompleteInput 
                                                        placeholder="Nome completo do titular ou razão social" 
                                                        language="both"
                                                        {...field} 
                                                        readOnly={isNameAutoFilled}
                                                        className={cn(
                                                            "h-10 rounded-xl border-slate-200 focus-visible:ring-blue-500 transition-all text-sm font-medium",
                                                            isNameAutoFilled && "bg-slate-50 text-slate-700 cursor-not-allowed border-emerald-200 font-semibold"
                                                        )} 
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>

                            {/* Campos de identificação: mudam conforme o titular seja
                                pessoa singular (BI, nascimento, género...) ou
                                pessoa colectiva (constituição, forma jurídica, representante...) */}
                            {clientType === 'PARTICULAR' ? (
                                <>
                                {/* Linha 2: Datas Biográficas (Nascimento, Idade, Género, Estado Civil) */}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-1">
                                    <FormField
                                        control={form.control}
                                        name="birthDate"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                    <Calendar className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                                    Data de Nascimento
                                                </FormLabel>
                                                <FormControl>
                                                    <Input 
                                                        type="date" 
                                                        {...field} 
                                                        onChange={(e) => {
                                                            field.onChange(e.target.value);
                                                            const autoAge = calcularIdade(e.target.value);
                                                            if (autoAge !== null && autoAge !== undefined) {
                                                                form.setValue('age', autoAge, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
                                                            }
                                                        }}
                                                        className="h-10 rounded-xl border-slate-200 focus-visible:ring-blue-500 text-sm" 
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="age"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-bold text-slate-700">
                                                    Idade (Anos)
                                                </FormLabel>
                                                <FormControl>
                                                    <Input 
                                                        type="number" 
                                                        min="0"
                                                        max="130"
                                                        placeholder="Ex: 35" 
                                                        value={field.value || ''} 
                                                        onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                                        className="h-10 rounded-xl border-slate-200 focus-visible:ring-blue-500 text-sm font-semibold" 
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="gender"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-bold text-slate-700">
                                                    Género / Sexo
                                                </FormLabel>
                                                <Select
                                                    onValueChange={field.onChange}
                                                    value={field.value || ''}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger className="h-10 rounded-xl border-slate-200 focus-visible:ring-blue-500 text-sm">
                                                            <SelectValue placeholder="Selecione o género" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="M">Masculino (M)</SelectItem>
                                                        <SelectItem value="F">Feminino (F)</SelectItem>
                                                        <SelectItem value="Outro">Outro</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="maritalStatus"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-bold text-slate-700">
                                                    Estado Civil
                                                </FormLabel>
                                                <Select
                                                    onValueChange={field.onChange}
                                                    value={field.value || ''}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger className="h-10 rounded-xl border-slate-200 focus-visible:ring-blue-500 text-sm">
                                                            <SelectValue placeholder="Estado Civil" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="SOLTEIRO">Solteiro(a)</SelectItem>
                                                        <SelectItem value="CASADO">Casado(a)</SelectItem>
                                                        <SelectItem value="DIVORCIADO">Divorciado(a)</SelectItem>
                                                        <SelectItem value="VIUVO">Viúvo(a)</SelectItem>
                                                        <SelectItem value="UNIAO_DE_FACTO">União de Facto</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Linha 2a: Dados da Reforma — só na carteira de Aposentados,
                                    para identificar a entidade pagadora e o registo na Segurança Social */}
                                {ehAposentado && (
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1 bg-amber-50/50 p-3.5 rounded-xl border border-amber-100">
                                        <div className="sm:col-span-2 flex items-center gap-1.5">
                                            <Briefcase className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                                Dados da Reforma
                                            </p>
                                        </div>

                                        <FormField
                                            control={form.control}
                                            name="workInstitution"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                        <Briefcase className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                                        Instituição Onde Trabalhou
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="Ex: Ministério da Educação"
                                                            {...field}
                                                            value={field.value || ''}
                                                            className="h-10 rounded-xl border-slate-200 bg-white focus-visible:ring-blue-500 text-sm"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="socialSecurityNumber"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                        <Fingerprint className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                                        Número de Segurança Social
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="Ex: 00-0000000-00"
                                                            {...field}
                                                            value={field.value || ''}
                                                            className="h-10 rounded-xl border-slate-200 bg-white focus-visible:ring-blue-500 font-mono text-sm"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                )}

                                {/* Linha 2b: Cônjuge — só aparece para casados ou união de facto,
                                    porque em comunhão de bens responde solidariamente pela dívida */}
                                {['CASADO', 'UNIAO_DE_FACTO'].includes(form.watch('maritalStatus') || '') && (
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-1 bg-blue-50/50 p-3.5 rounded-xl border border-blue-100">
                                        <div className="lg:col-span-3 flex items-center gap-1.5">
                                            <Users className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                                Dados do Cônjuge
                                            </p>
                                        </div>

                                        <FormField
                                            control={form.control}
                                            name="spouseName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-bold text-slate-700">Nome do Cônjuge</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="Nome completo do cônjuge"
                                                            {...field}
                                                            value={field.value || ''}
                                                            className="h-10 rounded-xl border-slate-200 bg-white focus-visible:ring-blue-500 text-sm"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="spouseBi"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-bold text-slate-700">BI do Cônjuge</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="Ex: 000000000AA000"
                                                            {...field}
                                                            value={field.value || ''}
                                                            className="h-10 rounded-xl border-slate-200 bg-white focus-visible:ring-blue-500 text-sm"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="spouseNif"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-bold text-slate-700">NIF do Cônjuge</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="NIF do cônjuge"
                                                            {...field}
                                                            value={field.value || ''}
                                                            className="h-10 rounded-xl border-slate-200 bg-white focus-visible:ring-blue-500 text-sm"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="spousePhone"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-bold text-slate-700">Telefone do Cônjuge</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="+244 9XX XXX XXX"
                                                            value={field.value || ''}
                                                            onChange={(e) => field.onChange(formatAngolanPhone(e.target.value))}
                                                            className="h-10 rounded-xl border-slate-200 bg-white focus-visible:ring-blue-500 font-mono text-sm"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="spouseEmail"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-bold text-slate-700">Email do Cônjuge</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="conjuge@exemplo.com"
                                                            {...field}
                                                            value={field.value || ''}
                                                            type="email"
                                                            className="h-10 rounded-xl border-slate-200 bg-white focus-visible:ring-blue-500 text-sm"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                )}

                                {/* Linha 3: Datas do Documento de Identidade */}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                                    <FormField
                                        control={form.control}
                                        name="issueDate"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                    <Calendar className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                                    Data de Emissão do Bilhete
                                                </FormLabel>
                                                <FormControl>
                                                    <Input 
                                                        type="date" 
                                                        {...field} 
                                                        className="h-10 rounded-xl border-slate-200 bg-white focus-visible:ring-blue-500 text-sm" 
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="expiryDate"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                    <ShieldAlert className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                                    Data de Validade / Expiração do Bilhete
                                                </FormLabel>
                                                <FormControl>
                                                    <Input 
                                                        type="date" 
                                                        {...field} 
                                                        className="h-10 rounded-xl border-slate-200 bg-white focus-visible:ring-blue-500 text-sm" 
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                </>
                            ) : (
                                <>
                                    {/* Linha 2 (Empresa): Identificação da Pessoa Colectiva */}
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-1">
                                        <FormField
                                            control={form.control}
                                            name="foundationDate"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                        <Calendar className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                                        Data de Constituição
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="date"
                                                            {...field}
                                                            value={field.value || ''}
                                                            className="h-10 rounded-xl border-slate-200 focus-visible:ring-blue-500 text-sm"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="legalForm"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-bold text-slate-700">
                                                        Forma Jurídica
                                                    </FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value || ''}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-10 rounded-xl border-slate-200 focus-visible:ring-blue-500 text-sm">
                                                                <SelectValue placeholder="Selecione a forma" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="LDA">Sociedade por Quotas (Lda.)</SelectItem>
                                                            <SelectItem value="SU_LDA">Sociedade Unipessoal (SU, Lda.)</SelectItem>
                                                            <SelectItem value="SA">Sociedade Anónima (S.A.)</SelectItem>
                                                            <SelectItem value="ENI">Empresário em Nome Individual (ENI)</SelectItem>
                                                            <SelectItem value="COOPERATIVA">Cooperativa</SelectItem>
                                                            <SelectItem value="ASSOCIACAO">Associação / ONG</SelectItem>
                                                            <SelectItem value="PUBLICA">Empresa Pública</SelectItem>
                                                            <SelectItem value="OUTRA">Outra</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="businessSector"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                        <Briefcase className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                                        Sector de Actividade
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="Ex: Comércio a retalho"
                                                            {...field}
                                                            value={field.value || ''}
                                                            className="h-10 rounded-xl border-slate-200 focus-visible:ring-blue-500 text-sm"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="commercialRegistry"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                        <FileText className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                                        Nº Certidão Comercial
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="Ex: 1234/25"
                                                            {...field}
                                                            value={field.value || ''}
                                                            className="h-10 rounded-xl border-slate-200 focus-visible:ring-blue-500 text-sm font-mono"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {/* Linha 3 (Empresa): Representante Legal */}
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                                        <FormField
                                            control={form.control}
                                            name="legalRepresentative"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                        <User className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                                        Representante Legal
                                                    </FormLabel>
                                                    <FormControl>
                                                        <AutocompleteInput
                                                            placeholder="Nome de quem assina pela empresa"
                                                            language="both"
                                                            {...field}
                                                            value={field.value || ''}
                                                            className="h-10 rounded-xl border-slate-200 bg-white focus-visible:ring-blue-500 text-sm"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="legalRepRole"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                        <ShieldAlert className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                                        Cargo / Qualidade do Representante
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="Ex: Sócio-Gerente, Administrador"
                                                            {...field}
                                                            value={field.value || ''}
                                                            className="h-10 rounded-xl border-slate-200 bg-white focus-visible:ring-blue-500 text-sm"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </>
                            )}

                            {/* Linha 4: Contactos (Telefone e Email) */}
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 pt-1">
                                <FormField
                                    control={form.control}
                                    name="phone"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-700">Telefone / WhatsApp</FormLabel>
                                            <FormControl>
                                                <div className="flex gap-2">
                                                    <Input 
                                                        placeholder="+244 9XX XXX XXX" 
                                                        value={field.value}
                                                        onChange={(e) => {
                                                            const formatted = formatAngolanPhone(e.target.value);
                                                            field.onChange(formatted);
                                                        }}
                                                        className="h-10 rounded-xl border-slate-200 focus-visible:ring-blue-500 font-mono text-sm" 
                                                    />
                                                    <Button 
                                                        type="button" 
                                                        variant="outline" 
                                                        className="h-10 px-3 text-slate-600 border-slate-200 hover:bg-slate-100 rounded-xl shrink-0" 
                                                        onClick={handleWhatsAppTest} 
                                                        title="Testar WhatsApp"
                                                    >
                                                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-green-600 shrink-0" xmlns="http://www.w3.org/2000/svg">
                                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                                        </svg>
                                                    </Button>
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-700">Email</FormLabel>
                                            <FormControl>
                                                <Input type="email" placeholder="cliente@exemplo.com" {...field} className="h-10 rounded-xl border-slate-200 focus-visible:ring-blue-500 text-sm" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* Linha 5: Morada e Residência */}
                            <FormField
                                control={form.control}
                                name="address"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                            <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                            Morada / Endereço Completo
                                        </FormLabel>
                                        <FormControl>
                                            <AutocompleteInput 
                                                language="pt-AO" 
                                                placeholder="Ex: Rua Direita de Luanda, Bairro Maianga, Município de Luanda..." 
                                                {...field} 
                                                className="h-10 rounded-xl border-slate-200 focus-visible:ring-blue-500 text-sm" 
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </div>

                    {/* ========================================================================= */}
                    {/* SEÇÃO 2: INFORMAÇÕES FINANCEIRAS E RECEBIMENTO */}
                    {/* ========================================================================= */}
                    <div className="rounded-2xl border border-emerald-200/80 bg-white overflow-hidden shadow-xs">
                        {/* Barra de Cabeçalho com Cor de Destaque */}
                        <div className="bg-emerald-50/80 border-b border-emerald-100 px-5 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center text-sm shadow-xs shrink-0">
                                    2
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-emerald-900 flex items-center gap-2">
                                        <Landmark className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                                        2. Informações Financeiras e Recebimento
                                    </h3>
                                    <p className="text-xs text-emerald-700/80">
                                        Limites concedidos em Kwanza (AOA), taxas de juro, método de entrega e contas bancárias (IBAN).
                                    </p>
                                </div>
                            </div>
                            <Badge variant="outline" className="bg-emerald-100/70 text-emerald-800 border-emerald-300 text-xs px-3 py-1 font-semibold">
                                {bankCoordinates.length} {bankCoordinates.length === 1 ? 'Conta IBAN' : 'Contas IBAN'}
                            </Badge>
                        </div>

                        {/* Campos da Seção 2 */}
                        <div className="p-5 md:p-6 space-y-4">
                            {/* Limite de Crédito e Rendimento Mensal */}
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="creditLimit"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded shrink-0">Kz</span>
                                                Limite de Crédito Aprovado
                                            </FormLabel>
                                            <FormControl>
                                                <CurrencyInput
                                                    value={field.value}
                                                    onValueChange={field.onChange}
                                                    className="h-10 rounded-xl border-slate-200 focus-visible:ring-emerald-500 font-semibold"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="monthlyIncome"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded shrink-0">Kz</span>
                                                Rendimento Mensal Estimado
                                            </FormLabel>
                                            <FormControl>
                                                <CurrencyInput
                                                    value={field.value || 0}
                                                    onValueChange={field.onChange}
                                                    className="h-10 rounded-xl border-slate-200 focus-visible:ring-emerald-500"
                                                />
                                            </FormControl>
                                            <FormDescription className="text-[10px] text-slate-500">
                                                Usado para cálculo do rácio de endividamento (DTI).
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* Card de Juros e Multas */}
                            <div className="space-y-3 border border-slate-200 rounded-2xl p-4 bg-slate-50/60">
                                <div className="flex items-center space-x-3">
                                    <div
                                        className={`w-5 h-5 rounded-lg border cursor-pointer flex items-center justify-center transition-colors ${applyInterest ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300'}`}
                                        onClick={() => setApplyInterest(!applyInterest)}
                                    >
                                        {applyInterest && <div className="w-2 h-2 bg-white rounded-sm" />}
                                    </div>
                                    <div className="cursor-pointer" onClick={() => setApplyInterest(!applyInterest)}>
                                        <label className="text-sm font-bold text-slate-800 cursor-pointer">
                                            Cobrança Personalizada de Juros e Multas por Atraso
                                        </label>
                                        <p className="text-xs text-slate-500">
                                            Habilita juros mensais específicos e taxas de mora para este cliente.
                                        </p>
                                    </div>
                                </div>

                                {applyInterest && (
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2 animate-in fade-in slide-in-from-top-2">
                                        <FormField
                                            control={form.control}
                                            name="defaultInterestRate"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-semibold text-slate-700">Juro Mensal (%)</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" step="0.1" {...field} className="h-10 rounded-xl border-slate-200 bg-white" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="lateInterestRate"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-semibold text-slate-700">Juro de Mora (%)</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" step="0.1" {...field} className="h-10 rounded-xl border-slate-200 bg-white" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="toleranceDays"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-semibold text-slate-700">Dias de Tolerância</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" {...field} className="h-10 rounded-xl border-slate-200 bg-white" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Status e Nível de Risco */}
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="status"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-700">Status do Cliente</FormLabel>
                                            <Select
                                                onValueChange={field.onChange}
                                                defaultValue={field.value}
                                            >
                                                <FormControl>
                                                    <SelectTrigger className="h-10 rounded-xl border-slate-200 focus-visible:ring-emerald-500">
                                                        <SelectValue placeholder="Selecione o status" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="active">Activo (Operacional)</SelectItem>
                                                    <SelectItem value="blocked">Bloqueado (Inadimplente/Risco)</SelectItem>
                                                    <SelectItem value="inactive">Suspenso / Inactivo</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="riskLevel"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-700">Nível de Risco de Crédito</FormLabel>
                                            <Select
                                                onValueChange={field.onChange}
                                                defaultValue={field.value}
                                            >
                                                <FormControl>
                                                    <SelectTrigger className="h-10 rounded-xl border-slate-200 focus-visible:ring-emerald-500">
                                                        <SelectValue placeholder="Selecione o risco" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="low">Baixo Risco (Excelente)</SelectItem>
                                                    <SelectItem value="medium">Médio Risco (Padrão)</SelectItem>
                                                    <SelectItem value="high">Alto Risco (Atenção redobrada)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* Método de Recebimento & Coordenadas Bancárias */}
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 pt-1">
                                <FormField
                                    control={form.control}
                                    name="receiveMethod"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-bold text-slate-700">Método de Recebimento Preferencial</FormLabel>
                                            <Select
                                                onValueChange={field.onChange}
                                                defaultValue={field.value}
                                            >
                                                <FormControl>
                                                    <SelectTrigger className="h-10 rounded-xl border-slate-200 focus-visible:ring-emerald-500">
                                                        <SelectValue placeholder="Como o cliente recebe o crédito?" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="transfer">Transferência Bancária (IBAN)</SelectItem>
                                                    <SelectItem value="cash">Recebimento em Dinheiro (Com Assinatura)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormDescription className="text-[10px] text-slate-500">
                                                Forma padrão para desembolso de valores ao cliente.
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-slate-700">Coordenadas Bancárias (IBAN)</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-between border-dashed border-slate-300 h-10 rounded-xl hover:bg-slate-100 font-semibold text-slate-700"
                                        onClick={() => {
                                            if (!newIban.holder) setNewIban(prev => ({ ...prev, holder: form.getValues('name') }));
                                            setIsIbanModalOpen(true);
                                        }}
                                    >
                                        <span className="flex items-center gap-2 text-xs">
                                            <Plus className="h-4 w-4 text-emerald-600 shrink-0" />
                                            Gerir Contas Bancárias
                                        </span>
                                        <Badge variant="secondary" className="text-[10px] bg-slate-100">
                                            {bankCoordinates.length} {bankCoordinates.length === 1 ? 'IBAN' : 'IBANs'}
                                        </Badge>
                                    </Button>
                                </div>
                            </div>

                            {/* Lista de IBANs Cadastrados */}
                            {bankCoordinates.length > 0 && (
                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 pt-1">
                                    {bankCoordinates.map(iban => (
                                        <div key={iban.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/70 text-xs shadow-2xs">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 shrink-0 shadow-xs">
                                                    <Landmark className="h-4 w-4 text-emerald-600 shrink-0" />
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="font-bold text-slate-800 truncate">{iban.bankName}</span>
                                                    <span className="text-slate-500 font-mono text-[11px] truncate">{iban.iban}</span>
                                                    <span className="text-slate-400 text-[10px] truncate">Titular: {iban.holder}</span>
                                                </div>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700 shrink-0"
                                                onClick={() => removeIban(iban.id)}
                                            >
                                                <Trash className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ========================================================================= */}
                    {/* SEÇÃO 3: DOCUMENTOS EM ANEXO */}
                    {/* ========================================================================= */}
                    <div className="rounded-2xl border border-purple-200/80 bg-white overflow-hidden shadow-xs">
                        {/* Barra de Cabeçalho com Cor de Destaque */}
                        <div className="bg-purple-50/80 border-b border-purple-100 px-5 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-purple-600 text-white font-black flex items-center justify-center text-sm border border-purple-200 shrink-0">
                                    3
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-purple-900 flex items-center gap-2">
                                        <FolderPlus className="h-4.5 w-4.5 text-purple-600 shrink-0" />
                                        3. Documentos em Anexo
                                    </h3>
                                    <p className="text-xs text-purple-700/80">
                                        Anexe cópias de BI, comprovativos de residência, extratos ou outros comprovativos.
                                    </p>
                                </div>
                            </div>
                            <Badge variant="outline" className="bg-purple-100/70 text-purple-800 border-purple-300 text-xs px-3 py-1 font-semibold">
                                {documents.length} {documents.length === 1 ? 'Anexo' : 'Anexos'}
                            </Badge>
                        </div>

                        {/* Campos da Seção 3 */}
                        <div className="p-5 md:p-6 space-y-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 transition-all hover:bg-purple-50/30 hover:border-purple-300 cursor-pointer text-center group">
                                    <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-purple-600 mb-2 shadow-xs group-hover:scale-105 transition-transform shrink-0">
                                        <Upload className="h-6 w-6" />
                                    </div>
                                    <p className="text-sm font-bold text-slate-700">Carregar Documento</p>
                                    <p className="text-xs text-slate-400">PDF, JPG, PNG ou WebP (Máx. 5MB)</p>
                                    <input
                                        type="file"
                                        accept="image/*,.pdf"
                                        onChange={handleFileChange}
                                        className="absolute inset-0 cursor-pointer opacity-0"
                                    />
                                </div>

                                <div
                                    onClick={handleScanDocument}
                                    className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 transition-all hover:bg-purple-50/30 hover:border-purple-300 cursor-pointer text-center group"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 mb-2 shadow-xs group-hover:scale-105 transition-transform shrink-0">
                                        <Scan className="h-6 w-6" />
                                    </div>
                                    <p className="text-sm font-bold text-slate-700">Escanear Documento</p>
                                    <p className="text-xs text-slate-400">Conectar a scanner ou impressora instalada</p>
                                </div>
                            </div>

                            {/* Lista de Documentos Anexados */}
                            <div className="space-y-2">
                                {documents.length === 0 ? (
                                    <div className="flex h-16 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-3 text-center">
                                        <p className="text-xs font-semibold text-slate-400">Nenhum documento anexado a esta ficha de cliente.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        {documents.map((doc) => (
                                            <div key={doc.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                                                <div className="flex items-center gap-2.5 overflow-hidden">
                                                    <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                                        <FileText className="h-4 w-4" />
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="truncate text-xs font-bold text-slate-800">{doc.title}</span>
                                                        <span className="text-[10px] text-slate-400 uppercase">{doc.type} • {new Date(doc.createdAt).toLocaleDateString('pt-PT')}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-slate-500 hover:bg-slate-100"
                                                        onClick={() => setPreviewDoc(doc)}
                                                        title="Visualizar Documento"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700"
                                                        onClick={() => removeDocument(doc.id)}
                                                        title="Remover Documento"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Visualizador de Documentos Modal */}
                    {previewDoc && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setPreviewDoc(null)}>
                            <div className="relative flex h-[88vh] w-[92vw] max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-between border-b px-5 py-3 pr-14 bg-slate-50">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <FileText className="h-5 w-5 text-blue-600 shrink-0" />
                                        <span className="truncate text-sm font-bold text-slate-800">{previewDoc.title}</span>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-3 top-2.5 z-10 bg-white/80 hover:bg-white rounded-full shadow-xs"
                                    onClick={() => setPreviewDoc(null)}
                                >
                                    <X className="h-5 w-5" />
                                </Button>
                                <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-100 p-4">
                                    {isPdfDocument(previewDoc) ? (
                                        <PdfCanvasViewer source={previewDoc.data} />
                                    ) : !previewDocUrl ? (
                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                                            Carregando visualização...
                                        </div>
                                    ) : (
                                        <img src={previewDocUrl} alt="Pré-visualização do documento" className="max-h-full max-w-full object-contain rounded-lg shadow-md" />
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sticky Footer Toolbar */}
                <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-slate-200 bg-white shrink-0 shadow-lg">
                    <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 font-medium">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Ficha estruturada em 3 seções completas
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        <Button 
                            type="button" 
                            variant="outline"
                            onClick={onCancel}
                            className="h-11 px-6 border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl font-semibold transition-colors"
                        >
                            Cancelar
                        </Button>
                        <Button 
                            type="submit"
                            className="h-11 px-8 bg-blue-600 hover:bg-blue-700 text-white border-none rounded-xl font-bold transition-all shadow-md shadow-blue-500/20 flex items-center gap-2"
                        >
                            <CheckCircle2 className="h-4.5 w-4.5" />
                            {submitLabel}
                        </Button>
                    </div>
                </div>
            </form>

            <ScannerModal
                isOpen={isScannerOpen}
                onClose={() => setIsScannerOpen(false)}
                onSave={handleSaveScans}
            />

            <AlertModal
                isOpen={isAlertOpen}
                onClose={() => setIsAlertOpen(false)}
                title="Teste de WhatsApp Iniciado"
                description="Abrimos uma nova aba com o link do WhatsApp. Se o navegador bloqueou o pop-up, por favor permita-o. Verifique se o número está correto e se a conta do WhatsApp está ativa antes de confirmar o cadastro."
                type="warning"
            />

            <AlertModal
                isOpen={genericAlert.isOpen}
                onClose={() => setGenericAlert(prev => ({ ...prev, isOpen: false }))}
                title={genericAlert.title}
                description={genericAlert.description}
                type={genericAlert.type as any}
            />

            <Dialog open={isIbanModalOpen} onOpenChange={setIsIbanModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Gerir Coordenadas Bancárias (IBAN)</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label>Selecionar Banco</Label>
                                <Select
                                    value={newIban.bankName}
                                    onValueChange={(value) => {
                                        const bank = ANGOLAN_BANKS.find(b => b.name === value);
                                        setNewIban(prev => {
                                            let newIbanValue = prev.iban || '';
                                            if (bank) {
                                                const clean = newIbanValue.replace(/[^A-Z0-9]/g, '');
                                                const prefix = 'AO06';
                                                const rest = clean.length > 8 ? clean.slice(8) : '';
                                                newIbanValue = formatAngolanIBAN(prefix + bank.code + rest);
                                            }
                                            return {
                                                ...prev,
                                                bankName: value,
                                                iban: newIbanValue
                                            };
                                        });
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Escolha o banco..." />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[200px]">
                                        {ANGOLAN_BANKS.map((bank) => (
                                            <SelectItem key={bank.code} value={bank.name}>
                                                {bank.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <div className="flex items-center justify-between">
                                    <Label>IBAN</Label>
                                    {newIban.iban && validateAngolanIBAN(newIban.iban) && (
                                        <span className="text-[10px] text-green-600 font-bold flex items-center gap-1 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                                            <CheckCircle2 className="h-3 w-3" /> VÁLIDO
                                        </span>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Input
                                        placeholder="AO06 0006 0000 0000 0000 0000 0"
                                        value={newIban.iban}
                                        onChange={e => {
                                            const formatted = formatAngolanIBAN(e.target.value);
                                            setNewIban(prev => ({ ...prev, iban: formatted }));

                                            const detectedBank = identifyBankFromIBAN(formatted);
                                            if (detectedBank && !newIban.bankName) {
                                                setNewIban(prev => ({ ...prev, bankName: detectedBank.name }));
                                            }
                                        }}
                                        className={validateAngolanIBAN(newIban.iban || '') ? "border-green-300 bg-green-50/20" : ""}
                                    />

                                    {newIban.iban && (
                                        <div className="flex items-center gap-2 p-3 rounded-xl border bg-slate-50/50">
                                            <div className="h-10 w-10 rounded-lg bg-white border shadow-xs flex items-center justify-center overflow-hidden shrink-0">
                                                {identifyBankFromIBAN(newIban.iban) ? (
                                                    <span className="font-black text-[10px] text-primary">
                                                        {identifyBankFromIBAN(newIban.iban)?.shortName}
                                                    </span>
                                                ) : (
                                                    <Building className="h-5 w-5 text-muted-foreground shrink-0" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Banco Detetado</p>
                                                <p className="text-xs font-bold text-slate-800 truncate">
                                                    {identifyBankFromIBAN(newIban.iban)?.name || 'Banco não identificado'}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    <p className="text-[10px] text-muted-foreground">
                                        Formato: AO + 2 dígitos + código banco (4) + agência (4) + conta (9) + controle (2)
                                    </p>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label>Titular da Conta</Label>
                                <Input
                                    placeholder="Nome do titular da conta"
                                    value={newIban.holder}
                                    onChange={e => setNewIban(prev => ({ ...prev, holder: e.target.value }))}
                                />
                            </div>
                        </div>
                        <Button className="w-full gap-2" onClick={addIban}>
                            <Plus className="h-4 w-4" /> Adicionar à Lista
                        </Button>

                        {bankCoordinates.length > 0 && (
                            <div className="mt-4 border-t pt-4 space-y-2">
                                <Label className="text-xs text-muted-foreground uppercase">IBANs Adicionados</Label>
                                <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
                                    {bankCoordinates.map(iban => (
                                        <div key={iban.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-primary/10 p-2 rounded-full">
                                                    <Landmark className="h-4 w-4 text-primary" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold">{iban.bankName}</span>
                                                    <span className="text-[10px] font-mono text-muted-foreground">{iban.iban}</span>
                                                    <span className="text-[10px] text-muted-foreground italic truncate max-w-[150px]">{iban.holder}</span>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive"
                                                onClick={() => removeIban(iban.id)}
                                            >
                                                <Trash className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="default" onClick={() => setIsIbanModalOpen(false)}>Concluir</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Form>
    );
}
