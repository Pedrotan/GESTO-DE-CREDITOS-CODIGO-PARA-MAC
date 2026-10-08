import { useEffect, useState, useRef } from 'react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/componentes/ui/dialog';
import { PdfCanvasViewer } from '@/componentes/ui/PdfCanvasViewer';
import {
    newSoftwareContract,
    validateSoftwareContract,
    contractDesign,
    DEFAULT_CONTRACT_DESIGN,
    type SoftwareContract,
} from '@/bibliotecas/contrato-software';
import { softwareContractPdf } from '@/bibliotecas/contrato-software-pdf';
import MarcaAguaMaster from './MarcaAguaMaster';
import {
    Eye,
    Download,
    RefreshCw,
    Loader2,
    Plus,
    ArrowUp,
    ArrowDown,
    Trash2,
    FileText,
    Sparkles,
    Bold,
    Italic,
    Underline,
    Highlighter,
    Minus,
    List,
    ListOrdered,
    CaseUpper,
    CaseLower,
    Type,
    CheckCircle2,
} from 'lucide-react';
import { cn } from '@/bibliotecas/utils';

const DRAFT = 'tango_master_contract_draft_v1';
const HISTORY = 'tango_master_contracts_v1';

function readHistory(): SoftwareContract[] {
    const raw = localStorage.getItem(HISTORY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || !list.every(validateSoftwareContract)) {
        throw new Error('Histórico de contratos inválido.');
    }
    return list;
}

export default function ContratosSoftware({ logo }: { logo?: string }) {
    const [error, setError] = useState('');
    const [note, setNote] = useState('');
    const [contract, setContract] = useState<SoftwareContract>(() => {
        try {
            const raw = localStorage.getItem(DRAFT);
            const saved = raw ? JSON.parse(raw) : null;
            if (validateSoftwareContract(saved)) return saved;
        } catch {
            /* Não altera o histórico ao abrir */
        }
        return newSoftwareContract();
    });

    const [selected, setSelected] = useState(contract.sections[0]?.id || '');
    const [tab, setTab] = useState<'editor' | 'history'>('editor');
    const [history, setHistory] = useState<SoftwareContract[]>(() => {
        try {
            return readHistory();
        } catch {
            return [];
        }
    });

    // Estado da Modal de Pré-visualização sob demanda (elimina totalmente o lag/bloqueio ao escrever)
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewUri, setPreviewUri] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewError, setPreviewError] = useState('');

    const [designTab, setDesignTab] = useState<'colors' | 'identity' | 'logo' | 'watermark'>('colors');
    const [, setWatermarkRevision] = useState(0);

    useEffect(() => {
        const refresh = () => setWatermarkRevision((n) => n + 1);
        window.addEventListener('tango-master-watermark-changed', refresh);
        return () => window.removeEventListener('tango-master-watermark-changed', refresh);
    }, []);

    const section = contract.sections.find((s) => s.id === selected) || contract.sections[0] || { id: '', title: '', body: '' };
    const design = contractDesign(contract);

    // Auto-save com debounce de 500ms para evitar serializações JSON pesadas a cada toque de tecla
    useEffect(() => {
        const timer = setTimeout(() => {
            try {
                localStorage.setItem(DRAFT, JSON.stringify(contract));
            } catch {
                setError('Não foi possível guardar o rascunho. Exporte uma cópia editável.');
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [contract]);

    const change = (values: Partial<SoftwareContract>) => {
        setNote('');
        setContract((c) => ({ ...c, ...values, updatedAt: new Date().toISOString() }));
    };

    const editSection = (values: Partial<typeof section>) =>
        change({
            sections: contract.sections.map((s) => (s.id === section.id ? { ...s, ...values } : s)),
        });

    const save = () => {
        try {
            const previous = readHistory();
            const saved = JSON.parse(JSON.stringify(contract)) as SoftwareContract;
            const next = [saved, ...previous.filter((c) => c.id !== saved.id)];
            localStorage.setItem(HISTORY, JSON.stringify(next));
            setHistory(next);
            setError('');
            setNote('Contrato guardado no histórico local do Master Gen.');
        } catch (e: any) {
            setError(e.message || 'Não foi possível guardar.');
        }
    };

    const downloadEditable = () => {
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(contract, null, 2)], { type: 'application/json' })
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = 'contrato-editavel-' + contract.id + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const handleDownloadPdf = () => {
        try {
            const filename = 'Contrato-' + (contract.number || contract.id).replace(/[^\w-]/g, '_') + '.pdf';
            softwareContractPdf(contract, logo).save(filename);
        } catch {
            setError('Não foi possível exportar o PDF.');
        }
    };

    const fresh = () => {
        if (!window.confirm('Criar um novo contrato? Guarde o atual no histórico antes de continuar.')) return;
        const next = newSoftwareContract();
        setContract(next);
        setSelected(next.sections[0].id);
        setTab('editor');
    };

    // Gera a pré-visualização de forma assíncrona apenas quando solicitada pelo utilizador
    const generatePreview = async () => {
        setIsGenerating(true);
        setPreviewError('');
        // Pequena pausa para permitir que a interface mostre o loader suavemente sem travar o ecrã
        await new Promise((resolve) => setTimeout(resolve, 60));
        try {
            const doc = softwareContractPdf(contract, logo);
            const uri = doc.output('datauristring');
            setPreviewUri(uri);
        } catch (err: any) {
            setPreviewError(err?.message || 'Não foi possível gerar a pré-visualização do PDF.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleOpenPreviewModal = () => {
        setShowPreviewModal(true);
        void generatePreview();
    };

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [editorFontSize, setEditorFontSize] = useState<number>(14);

    const applyFormatting = (prefix: string, suffix: string = prefix, defaultPlaceholder: string = 'texto') => {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const text = section.body || '';
        const selectedText = text.substring(start, end);
        const replacement = selectedText ? `${prefix}${selectedText}${suffix}` : `${prefix}${defaultPlaceholder}${suffix}`;
        const newBody = text.substring(0, start) + replacement + text.substring(end);
        editSection({ body: newBody });
        setTimeout(() => {
            el.focus();
            if (selectedText) {
                el.setSelectionRange(start, start + replacement.length);
            } else {
                el.setSelectionRange(start + prefix.length, start + prefix.length + defaultPlaceholder.length);
            }
        }, 10);
    };

    const insertSnippet = (snippet: string) => {
        const el = textareaRef.current;
        if (!el) {
            const currentBody = section.body || '';
            editSection({ body: currentBody ? `${currentBody} ${snippet}` : snippet });
            return;
        }
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const text = section.body || '';
        const newBody = text.substring(0, start) + snippet + text.substring(end);
        editSection({ body: newBody });
        setTimeout(() => {
            el.focus();
            el.setSelectionRange(start + snippet.length, start + snippet.length);
        }, 10);
    };

    const transformCase = (type: 'upper' | 'lower') => {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const text = section.body || '';
        const selectedText = text.substring(start, end);
        if (!selectedText) return;
        const transformed = type === 'upper' ? selectedText.toUpperCase() : selectedText.toLowerCase();
        const newBody = text.substring(0, start) + transformed + text.substring(end);
        editSection({ body: newBody });
        setTimeout(() => {
            el.focus();
            el.setSelectionRange(start, start + transformed.length);
        }, 10);
    };

    const insertVariable = (variable: string) => {
        insertSnippet(variable);
    };

    return (
        <div className="space-y-6">
            {/* Cabeçalho Superior com Ações Principais */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Contratos de venda e licenciamento
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Tango Gestão de Créditos · Modelo integral com 30 cláusulas e cinco anexos jurídicos
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fresh}>
                        Novo contrato
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadEditable}>
                        Cópia editável
                    </Button>
                    <Button size="sm" onClick={save} className="font-semibold">
                        Guardar contrato
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleOpenPreviewModal}
                        className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm"
                        title="Abrir pré-visualização do PDF em ecrã expandido"
                    >
                        <Eye className="h-4 w-4" />
                        Pré-visualizar PDF
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadPdf}
                        className="gap-1.5"
                    >
                        <Download className="h-4 w-4" />
                        Baixar PDF
                    </Button>
                </div>
            </div>

            {error && (
                <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive font-medium">
                    {error}
                </div>
            )}
            {note && (
                <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                    {note}
                </div>
            )}

            {/* Abas Superiores: Editor vs Histórico */}
            <div className="flex gap-2">
                <Button
                    variant={tab === 'editor' ? 'default' : 'outline'}
                    onClick={() => setTab('editor')}
                >
                    Editor de Contrato
                </Button>
                <Button
                    variant={tab === 'history' ? 'default' : 'outline'}
                    onClick={() => setTab('history')}
                >
                    Histórico ({history.length})
                </Button>
            </div>

            {tab === 'history' ? (
                <div className="space-y-3">
                    {history.length === 0 && (
                        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                            Ainda não há contratos guardados no histórico local.
                        </div>
                    )}
                    {history.map((c) => (
                        <div
                            key={c.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
                        >
                            <div>
                                <strong className="text-base text-slate-900 dark:text-white">
                                    {c.number || 'Sem número'} · {c.client || 'Cliente por preencher'}
                                </strong>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Última atualização: {new Date(c.updatedAt).toLocaleString('pt-AO')}
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    if (!window.confirm('Abrir este contrato? Guarde primeiro as alterações do rascunho atual.')) return;
                                    setContract(c);
                                    setSelected(c.sections[0]?.id || '');
                                    setTab('editor');
                                }}
                            >
                                Abrir e editar
                            </Button>
                        </div>
                    ))}
                </div>
            ) : (
                <>
                    {/* Painel: Personalizar o Papel Timbrado & Design */}
                    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                        <div className="border-b bg-muted/40 px-5 py-4">
                            <h2 className="text-base font-bold text-slate-900 dark:text-white">
                                Personalizar o papel timbrado
                            </h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Modelo com faixas cruzadas, logótipo institucional e marca de água oficial.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2 border-b p-3 bg-muted/20" role="tablist" aria-label="Design do contrato">
                            {(
                                [
                                    ['colors', 'Paleta de cores'],
                                    ['identity', 'Cabeçalho e contactos'],
                                    ['logo', 'Logótipo'],
                                    ['watermark', 'Marca de água'],
                                ] as const
                            ).map(([key, label]) => (
                                <Button
                                    key={key}
                                    size="sm"
                                    role="tab"
                                    aria-selected={designTab === key}
                                    variant={designTab === key ? 'default' : 'outline'}
                                    onClick={() => setDesignTab(key)}
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>
                        <div className="mx-auto max-w-5xl space-y-4 p-5" role="tabpanel">
                            {designTab === 'colors' && (
                                <>
                                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                        {(
                                            [
                                                ['primary', 'Azul / faixas principais'],
                                                ['accent', 'Laranja / detalhes'],
                                                ['text', 'Texto'],
                                                ['paper', 'Fundo do papel'],
                                            ] as const
                                        ).map(([key, label]) => (
                                            <label key={key} className="rounded-xl border bg-background/50 p-3 text-xs font-semibold">
                                                {label}
                                                <div className="mt-2.5 flex items-center gap-3">
                                                    <input
                                                        aria-label={label}
                                                        type="color"
                                                        value={design[key]}
                                                        onChange={(e) => change({ design: { ...design, [key]: e.target.value } })}
                                                        className="h-10 w-12 cursor-pointer rounded border bg-background"
                                                    />
                                                    <span className="font-mono text-xs">{design[key]}</span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 pt-2">
                                        {[
                                            ['Modelo da imagem', '#13384b', '#f58a00'],
                                            ['Monocromático', '#262626', '#666666'],
                                            ['Azul e dourado', '#0f213d', '#b58a35'],
                                            ['Verde institucional', '#17483e', '#8c9d6b'],
                                        ].map(([label, primary, accent]) => (
                                            <Button
                                                key={label}
                                                size="sm"
                                                variant="outline"
                                                onClick={() => change({ design: { ...design, primary, accent, text: '#333333', paper: '#ffffff' } })}
                                            >
                                                {label}
                                            </Button>
                                        ))}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                change({
                                                    design: {
                                                        ...design,
                                                        primary: DEFAULT_CONTRACT_DESIGN.primary,
                                                        accent: DEFAULT_CONTRACT_DESIGN.accent,
                                                        text: DEFAULT_CONTRACT_DESIGN.text,
                                                        paper: DEFAULT_CONTRACT_DESIGN.paper,
                                                    },
                                                })
                                            }
                                        >
                                            Restaurar cores
                                        </Button>
                                    </div>
                                </>
                            )}
                            {designTab === 'identity' && (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {(
                                        [
                                            ['company', 'Nome no cabeçalho'],
                                            ['tagline', 'Subtítulo'],
                                            ['contacts', 'Telefone / email / website'],
                                            ['address', 'Morada no rodapé'],
                                        ] as const
                                    ).map(([key, label]) => (
                                        <label key={key} className="text-xs font-semibold">
                                            {label}
                                            <Input
                                                className="mt-1.5"
                                                maxLength={key === 'company' ? 90 : 160}
                                                value={design[key]}
                                                onChange={(e) => change({ design: { ...design, [key]: e.target.value } })}
                                            />
                                        </label>
                                    ))}
                                </div>
                            )}
                            {designTab === 'logo' && (
                                <div className="grid gap-5 sm:grid-cols-2">
                                    <div className="space-y-3">
                                        <h3 className="font-semibold text-sm">Logótipo do contrato</h3>
                                        <p className="text-xs text-muted-foreground">
                                            Imagem ampliada no cabeçalho, com proporções originais. Pode usar o logótipo do Master ou carregar um próprio para este contrato.
                                        </p>
                                        <Input
                                            aria-label="Carregar logótipo do contrato"
                                            type="file"
                                            accept="image/png,image/jpeg"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                e.target.value = '';
                                                if (!file) return;
                                                try {
                                                    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 1024 * 1024) {
                                                        throw new Error('Escolha PNG ou JPG até 1 MB.');
                                                    }
                                                    const image = await new Promise<string>((resolve, reject) => {
                                                        const reader = new FileReader();
                                                        reader.onload = () => resolve(String(reader.result));
                                                        reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
                                                        reader.readAsDataURL(file);
                                                    });
                                                    await new Promise<void>((resolve, reject) => {
                                                        const img = new Image();
                                                        img.onload = () => resolve();
                                                        img.onerror = () => reject(new Error('Imagem inválida.'));
                                                        img.src = image;
                                                    });
                                                    change({ design: { ...design, logo: image } });
                                                } catch (err: any) {
                                                    setError(err.message);
                                                }
                                            }}
                                        />
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={!design.logo}
                                            onClick={() => change({ design: { ...design, logo: '' } })}
                                        >
                                            Usar logótipo do Master
                                        </Button>
                                    </div>
                                    <div className="flex min-h-36 items-center justify-center rounded-xl border bg-white p-6 shadow-xs">
                                        {design.logo || logo ? (
                                            <img
                                                src={design.logo || logo}
                                                alt="Logótipo do contrato"
                                                className="max-h-28 max-w-full object-contain"
                                            />
                                        ) : (
                                            <span className="text-xs text-slate-500">Nenhum logótipo carregado.</span>
                                        )}
                                    </div>
                                </div>
                            )}
                            {designTab === 'watermark' && <MarcaAguaMaster />}
                        </div>
                    </section>

                    {/* Dados Básicos do Contrato */}
                    <div className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4 shadow-sm">
                        {(
                            [
                                ['number', 'Número do contrato'],
                                ['client', 'Cliente / empresa'],
                                ['nif', 'NIF do cliente'],
                                ['software', 'Nome do software'],
                            ] as const
                        ).map(([key, label]) => (
                            <label className="text-xs font-semibold" key={key}>
                                {label}
                                <Input
                                    className="mt-1"
                                    value={contract[key]}
                                    onChange={(e) => change({ [key]: e.target.value })}
                                />
                            </label>
                        ))}
                        <label className="sm:col-span-2 text-xs font-semibold">
                            Título do documento
                            <Input
                                className="mt-1"
                                value={contract.title}
                                onChange={(e) => change({ title: e.target.value })}
                            />
                        </label>
                        <label className="sm:col-span-2 text-xs font-semibold">
                            Importar cópia editável (.json)
                            <Input
                                className="mt-1"
                                type="file"
                                accept=".json"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    try {
                                        if (file.size > 2000000) throw new Error('Ficheiro demasiado grande.');
                                        const saved = JSON.parse(await file.text());
                                        if (!validateSoftwareContract(saved)) throw new Error('Cópia editável inválida.');
                                        if (!window.confirm('Substituir o rascunho por esta cópia?')) return;
                                        setContract(saved);
                                        setSelected(saved.sections[0]?.id || '');
                                        setError('');
                                    } catch (err: any) {
                                        setError(err.message);
                                    } finally {
                                        e.target.value = '';
                                    }
                                }}
                            />
                        </label>
                    </div>

                    {/* Editor de Secções / Cláusulas - Layout Fluido, Espaçoso e 100% Livre de Lags */}
                    <div className="grid gap-5 lg:grid-cols-12 items-start">
                        {/* Coluna Esquerda: Lista e Navegação das Secções */}
                        <div className="lg:col-span-4 rounded-2xl border bg-card p-4 shadow-sm space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b">
                                <div>
                                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                                        Cláusulas & Secções
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        {contract.sections.length} partes do contrato
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        const s = {
                                            id: crypto.randomUUID(),
                                            title: `Nova Cláusula ${contract.sections.length + 1}`,
                                            body: '',
                                        };
                                        change({ sections: [...contract.sections, s] });
                                        setSelected(s.id);
                                    }}
                                    className="gap-1 text-xs"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Adicionar
                                </Button>
                            </div>

                            <div className="max-h-[600px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                                {contract.sections.map((s, idx) => {
                                    const isCurrent = s.id === section.id;
                                    return (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => setSelected(s.id)}
                                            className={cn(
                                                'w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-center justify-between gap-2 border',
                                                isCurrent
                                                    ? 'bg-primary/10 border-primary text-primary font-bold shadow-xs'
                                                    : 'border-transparent bg-muted/20 hover:bg-muted/60 text-slate-700 dark:text-slate-300'
                                            )}
                                        >
                                            <span className="truncate flex-1">
                                                <span className="opacity-60 font-mono mr-1.5">{idx + 1}.</span>
                                                {s.title || 'Sem título'}
                                            </span>
                                            {isCurrent && (
                                                <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="pt-2 border-t flex flex-wrap gap-2">
                                {([-1, 1] as const).map((offset) => (
                                    <Button
                                        key={offset}
                                        size="sm"
                                        variant="outline"
                                        disabled={
                                            contract.sections.indexOf(section) + offset < 0 ||
                                            contract.sections.indexOf(section) + offset >= contract.sections.length
                                        }
                                        onClick={() => {
                                            const next = [...contract.sections];
                                            const index = next.findIndex((s) => s.id === section.id);
                                            [next[index], next[index + offset]] = [next[index + offset], next[index]];
                                            change({ sections: next });
                                        }}
                                        className="gap-1 text-xs flex-1"
                                    >
                                        {offset < 0 ? (
                                            <>
                                                <ArrowUp className="h-3 w-3" /> Mover acima
                                            </>
                                        ) : (
                                            <>
                                                <ArrowDown className="h-3 w-3" /> Mover abaixo
                                            </>
                                        )}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Coluna Direita: Editor Completo da Secção Selecionada */}
                        <div className="lg:col-span-8 rounded-2xl border bg-card p-5 shadow-sm space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b">
                                <div className="flex-1 min-w-[200px]">
                                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                                        Título da Cláusula ou Anexo
                                    </label>
                                    <Input
                                        aria-label="Título da secção"
                                        className="text-sm font-semibold"
                                        value={section.title}
                                        onChange={(e) => editSection({ title: e.target.value })}
                                        placeholder="Ex.: Cláusula 1.ª (Objeto do Contrato)"
                                    />
                                </div>
                                <div className="flex items-center gap-2 pt-5">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleOpenPreviewModal}
                                        className="gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 border-blue-200 dark:border-blue-900 font-semibold"
                                    >
                                        <Eye className="h-3.5 w-3.5" />
                                        Pré-visualizar na modal
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={contract.sections.length <= 1}
                                        onClick={() => {
                                            if (window.confirm('Remover esta secção do contrato?')) {
                                                const remaining = contract.sections.filter((s) => s.id !== section.id);
                                                change({ sections: remaining });
                                                if (remaining[0]) setSelected(remaining[0].id);
                                            }
                                        }}
                                        className="text-destructive hover:bg-destructive/10 text-xs gap-1"
                                        title="Remover secção"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        Remover
                                    </Button>
                                </div>
                            </div>

                            {/* Barra de Ferramentas Completa do Editor de Texto */}
                            <div className="rounded-xl border bg-muted/40 p-2.5 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                                    {/* Formatação: Negrito, Itálico, Sublinhado, Destaque e Caixa */}
                                    <div className="flex flex-wrap items-center gap-1">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => applyFormatting('**', '**', 'texto em negrito')}
                                            className="h-8 w-8 p-0 font-bold hover:bg-primary/10 hover:text-primary"
                                            title="Negritar seleção (**texto**)"
                                        >
                                            <Bold className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => applyFormatting('*', '*', 'texto em itálico')}
                                            className="h-8 w-8 p-0 italic hover:bg-primary/10 hover:text-primary"
                                            title="Itálico (*texto*)"
                                        >
                                            <Italic className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => applyFormatting('__', '__', 'texto sublinhado')}
                                            className="h-8 w-8 p-0 underline hover:bg-primary/10 hover:text-primary"
                                            title="Sublinhado (__texto__)"
                                        >
                                            <Underline className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => applyFormatting('==', '==', 'texto destacado')}
                                            className="h-8 px-2 gap-1 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-950/60 font-semibold text-xs"
                                            title="Destacar texto com marcador (==texto==)"
                                        >
                                            <Highlighter className="h-3.5 w-3.5" />
                                            Destacar
                                        </Button>
                                        <div className="h-4 w-px bg-border mx-1" />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => transformCase('upper')}
                                            className="h-8 w-8 p-0 text-xs font-semibold"
                                            title="Converter seleção para MAIÚSCULAS"
                                        >
                                            <CaseUpper className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => transformCase('lower')}
                                            className="h-8 w-8 p-0 text-xs font-semibold"
                                            title="Converter seleção para minúsculas"
                                        >
                                            <CaseLower className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>

                                    {/* Ajuste de Tamanho de Letra (Diminuir e Aumentar) */}
                                    <div className="flex items-center gap-1 bg-background rounded-lg border p-1 shadow-2xs">
                                        <span className="text-[11px] font-medium text-muted-foreground px-1.5 flex items-center gap-1">
                                            <Type className="h-3 w-3" /> Tamanho:
                                        </span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={editorFontSize <= 11}
                                            onClick={() => setEditorFontSize((s) => Math.max(11, s - 1))}
                                            className="h-6 w-6 p-0 text-xs font-bold"
                                            title="Diminuir tamanho da letra (A-)"
                                        >
                                            <Minus className="h-3 w-3" />
                                        </Button>
                                        <span className="min-w-[34px] text-center font-mono text-xs font-semibold text-primary">
                                            {editorFontSize}px
                                        </span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={editorFontSize >= 22}
                                            onClick={() => setEditorFontSize((s) => Math.min(22, s + 1))}
                                            className="h-6 w-6 p-0 text-xs font-bold"
                                            title="Aumentar tamanho da letra (A+)"
                                        >
                                            <Plus className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Estrutura e Inserção Rápida */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                        <span className="text-muted-foreground font-medium text-[11px] mr-1">
                                            Estrutura:
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => insertSnippet('\n\n1. ')}
                                            className="px-2 py-0.5 rounded-md bg-background hover:bg-primary/10 hover:text-primary text-[11px] font-medium border transition-colors flex items-center gap-1"
                                            title="Inserir número 1."
                                        >
                                            <ListOrdered className="h-3 w-3" /> 1. Número
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => insertSnippet('\n   a) ')}
                                            className="px-2 py-0.5 rounded-md bg-background hover:bg-primary/10 hover:text-primary text-[11px] font-medium border transition-colors"
                                            title="Inserir alínea a)"
                                        >
                                            a) Alínea
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => insertSnippet('\n• ')}
                                            className="px-2 py-0.5 rounded-md bg-background hover:bg-primary/10 hover:text-primary text-[11px] font-medium border transition-colors flex items-center gap-1"
                                            title="Inserir marcador de lista"
                                        >
                                            <List className="h-3 w-3" /> • Marcador
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => insertSnippet('\n\n')}
                                            className="px-2 py-0.5 rounded-md bg-background hover:bg-primary/10 hover:text-primary text-[11px] font-medium border transition-colors"
                                            title="Inserir parágrafo"
                                        >
                                            ¶ Parágrafo
                                        </button>
                                    </div>

                                    {/* Variáveis Dinâmicas */}
                                    <div className="flex flex-wrap items-center gap-1 text-xs">
                                        <span className="text-muted-foreground font-medium flex items-center gap-1 mr-1 text-[11px]">
                                            <Sparkles className="h-3 w-3 text-amber-500" /> Variáveis:
                                        </span>
                                        {[
                                            ['{{cliente}}', 'Cliente'],
                                            ['{{nif}}', 'NIF'],
                                            ['{{software}}', 'Software'],
                                            ['{{numero}}', 'N.º Contrato'],
                                        ].map(([tag, label]) => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => insertSnippet(tag)}
                                                className="px-2 py-0.5 rounded-md bg-primary/5 hover:bg-primary/15 text-primary text-[11px] font-mono border border-primary/20 transition-colors"
                                                title={`Inserir ${tag} na posição do cursor`}
                                            >
                                                +{label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Área de Texto com Tamanho Dinâmico e Sem Travamentos */}
                            <div>
                                <textarea
                                    ref={textareaRef}
                                    aria-label="Texto do contrato"
                                    style={{ fontSize: `${editorFontSize}px` }}
                                    className="min-h-[500px] w-full resize-y rounded-xl border border-input bg-background p-4 leading-relaxed text-slate-800 dark:text-slate-200 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-sans transition-all"
                                    value={section.body}
                                    onChange={(e) => editSection({ body: e.target.value })}
                                    placeholder="Escreva ou edite aqui os termos desta cláusula..."
                                />
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground border-t pt-2">
                                    <div className="flex items-center gap-2.5">
                                        <span><strong>{(section.body || '').length.toLocaleString('pt-AO')}</strong> caracteres</span>
                                        <span>·</span>
                                        <span><strong>{((section.body || '').trim() ? (section.body || '').trim().split(/\s+/).length : 0).toLocaleString('pt-AO')}</strong> palavras</span>
                                        <span>·</span>
                                        <span><strong>{(section.body ? (section.body.split('\n').length) : 0)}</strong> linhas</span>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground">
                                        Tipografia: <span className="font-semibold text-slate-700 dark:text-slate-300">Helvetica Executiva</span> · Diagramação e alinhamento oficial · Termo de fecho e assinaturas
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Modal de Pré-visualização do PDF Completo */}
            <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
                <DialogContent className="w-[97vw] !max-w-[97vw] xl:!max-w-[1650px] 2xl:!max-w-[1850px] h-[94vh] max-h-[96vh] p-0 gap-0 flex flex-col overflow-hidden rounded-2xl border border-slate-700/60 dark:border-slate-800 bg-card shadow-2xl">
                    {/* Cabeçalho Executivo em Dark/Navy com Alto Contraste e Separação Segura do Botão X */}
                    <DialogHeader className="px-5 py-4 sm:px-6 sm:py-4.5 border-b border-slate-800 bg-slate-900 text-white flex flex-row items-center justify-between gap-4 shrink-0 !m-0 !mb-0 !-mt-0 relative overflow-hidden">
                        <div className="flex items-center gap-3.5 min-w-0">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 border border-blue-400/30">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div className="space-y-1 min-w-0">
                                <DialogTitle className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2.5 truncate">
                                    <span>Pré-visualização do Contrato de Venda</span>
                                    <span className="hidden sm:inline-flex items-center rounded-md bg-blue-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-blue-300 border border-blue-400/30">
                                        Alta Fidelidade (300 DPI)
                                    </span>
                                </DialogTitle>
                                <DialogDescription className="text-xs sm:text-sm text-slate-300 flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-white">
                                        {contract.number ? `N.º ${contract.number}` : 'Contrato em preparação'}
                                    </span>
                                    <span className="text-slate-500">·</span>
                                    <span className="truncate max-w-[200px] sm:max-w-none text-slate-200">
                                        {contract.client || 'Cliente por preencher'}
                                    </span>
                                    <span className="text-slate-500">·</span>
                                    <span className="text-slate-400">
                                        {contract.sections.length} secções contratuais
                                    </span>
                                </DialogDescription>
                            </div>
                        </div>

                        {/* Ações com espaçamento generoso para NUNCA colidir com o botão X de fechar */}
                        <div className="flex items-center gap-2.5 pr-14 sm:pr-16 shrink-0">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={generatePreview}
                                disabled={isGenerating}
                                className="gap-2 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border-white/20 shadow-sm transition-all"
                                title="Recarregar e atualizar o documento"
                            >
                                <RefreshCw className={cn('h-3.5 w-3.5', isGenerating && 'animate-spin')} />
                                <span>Atualizar</span>
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleDownloadPdf}
                                className="gap-2 text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-500/25 border border-blue-400/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <Download className="h-3.5 w-3.5" />
                                <span>Baixar PDF</span>
                            </Button>
                        </div>
                    </DialogHeader>

                    {/* Área Expandida de Visualização do Documento */}
                    <div className="flex-1 overflow-hidden p-3 sm:p-5 bg-slate-900/5 dark:bg-slate-950/80 flex flex-col items-center justify-center">
                        {isGenerating ? (
                            <div className="flex flex-col items-center justify-center gap-4 p-8 text-center animate-in fade-in max-w-md w-full rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
                                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                    <Loader2 className="h-8 w-8 animate-spin" />
                                    <span className="absolute -inset-1 animate-ping rounded-2xl bg-blue-500/15" />
                                </div>
                                <div className="space-y-1.5">
                                    <p className="text-base font-bold text-slate-900 dark:text-white">
                                        A processar pré-visualização em alta resolução...
                                    </p>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        A renderizar todas as 30 cláusulas, anexos, papel timbrado e marcas de água com o motor de alta fidelidade.
                                    </p>
                                </div>
                                <div className="w-full space-y-2 pt-3 text-left text-[11px] text-muted-foreground border-t border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                        <span>Tipografia executiva de alta fidelidade formatada</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                        <span>Papel timbrado e carimbos oficiais</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <RefreshCw className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
                                        <span>Cálculo de quebras de página e layout A4</span>
                                    </div>
                                </div>
                            </div>
                        ) : previewError ? (
                            <div className="p-8 text-center space-y-3.5 max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 shadow-lg">
                                <p className="text-destructive font-semibold text-sm">{previewError}</p>
                                <Button variant="outline" size="sm" onClick={generatePreview} className="gap-2">
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    Tentar novamente
                                </Button>
                            </div>
                        ) : previewUri ? (
                            <div className="w-full h-full overflow-hidden flex flex-col">
                                <PdfCanvasViewer
                                    source={previewUri}
                                    className="h-full w-full overflow-auto rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/70 p-3 sm:p-5 shadow-inner"
                                />
                            </div>
                        ) : (
                            <div className="text-center p-8 text-muted-foreground space-y-3">
                                <p className="text-sm">Clique em "Atualizar" para gerar a pré-visualização.</p>
                                <Button size="sm" onClick={generatePreview} className="gap-2">
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    Gerar Pré-visualização
                                </Button>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
