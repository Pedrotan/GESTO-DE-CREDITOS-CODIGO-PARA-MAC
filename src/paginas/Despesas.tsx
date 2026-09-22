import { useMemo, useState, useEffect, useRef } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Badge } from '@/componentes/ui/badge';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/componentes/ui/dialog';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/componentes/ui/table';
import {
    Plus, Search, Receipt, ChevronLeft, ChevronRight, Loader2, Wallet,
    Check, ChevronDown, Landmark, Sparkles, FolderPlus, Tag
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/bibliotecas/formatters';
import { useToast } from '@/ganchos/usar-toast';
import { cn } from '@/bibliotecas/utils';

/** Categorias padrão de despesas operacionais */
const CATEGORIAS_PADRAO = [
    'Renda e Instalações',
    'Salários e Pessoal',
    'Energia e Água',
    'Comunicações e Internet',
    'Transporte e Combustível',
    'Material de Escritório',
    'Manutenção e Reparações',
    'Serviços Bancários e Comissões',
    'Impostos, Taxas e Licenças',
    'Marketing e Publicidade',
    'Serviços Jurídicos e Contabilidade',
    'Alimentação e Refeições',
    'Segurança e Vigilância',
    'Tecnologia e Software',
    'Outras Despesas Operacionais',
];

const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const CATEGORIES_STORAGE_KEY = 'tango_custom_expense_categories';

export default function Despesas() {
    const { accountingEntries, addAccountingEntry } = useData();
    const { user } = useAuth();
    const { toast } = useToast();

    const hoje = new Date();
    const [ano, setAno] = useState(hoje.getFullYear());
    const [mes, setMes] = useState(hoje.getMonth());
    const [procura, setProcura] = useState('');

    // Categorias personalizadas guardadas
    const [customCategorias, setCustomCategorias] = useState<string[]>(() => {
        try {
            const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });

    // Modal de Nova Despesa
    const [modalAberta, setModalAberta] = useState(false);
    const [categoria, setCategoria] = useState(CATEGORIAS_PADRAO[0]);
    const [dataDespesa, setDataDespesa] = useState(() => new Date().toISOString().split('T')[0]);
    const [descricao, setDescricao] = useState('');
    const [valor, setValor] = useState(0);
    const [formaPagamento, setFormaPagamento] = useState<'cash' | 'bank'>('cash');
    const [aGravar, setAGravar] = useState(false);

    // Select2 Combobox State
    const [select2Open, setSelect2Open] = useState(false);
    const [categoriaSearch, setCategoriaSearch] = useState('');
    const [criandoNovaCategoria, setCriandoNovaCategoria] = useState(false);
    const [novaCategoriaNome, setNovaCategoriaNome] = useState('');
    const select2Ref = useRef<HTMLDivElement>(null);

    // Fechar dropdown Select2 ao clicar fora
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (select2Ref.current && !select2Ref.current.contains(e.target as Node)) {
                setSelect2Open(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Lista unificada de todas as categorias (Padrão + Criadas pelo Utilizador)
    const todasCategorias = useMemo(() => {
        const set = new Set([...CATEGORIAS_PADRAO, ...customCategorias]);
        return Array.from(set);
    }, [customCategorias]);

    // Filtro para o Select2
    const categoriasFiltradas = useMemo(() => {
        const q = categoriaSearch.trim().toLowerCase();
        if (!q) return todasCategorias;
        return todasCategorias.filter(c => c.toLowerCase().includes(q));
    }, [todasCategorias, categoriaSearch]);

    // Cadastrar uma nova categoria no sistema
    const handleSalvarNovaCategoria = (nomeParaCriar?: string) => {
        const nome = (nomeParaCriar || novaCategoriaNome).trim();
        if (!nome) {
            toast({ title: 'Nome obrigatório', description: 'Informe o nome da nova categoria.' });
            return;
        }

        if (todasCategorias.some(c => c.toLowerCase() === nome.toLowerCase())) {
            setCategoria(todasCategorias.find(c => c.toLowerCase() === nome.toLowerCase()) || nome);
            setCriandoNovaCategoria(false);
            setSelect2Open(false);
            setNovaCategoriaNome('');
            setCategoriaSearch('');
            return;
        }

        const updated = [...customCategorias, nome];
        setCustomCategorias(updated);
        try {
            localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
            console.error('Erro ao salvar categoria:', e);
        }

        setCategoria(nome);
        setCriandoNovaCategoria(false);
        setSelect2Open(false);
        setNovaCategoriaNome('');
        setCategoriaSearch('');

        toast({
            title: 'Nova Categoria Cadastrada!',
            description: `A categoria "${nome}" foi cadastrada e selecionada para esta despesa.`
        });
    };

    const mudarMes = (delta: number) => {
        const d = new Date(ano, mes + delta, 1);
        setAno(d.getFullYear());
        setMes(d.getMonth());
    };

    // Despesas do mês selecionado
    const despesas = useMemo(() => {
        const inicio = new Date(ano, mes, 1, 0, 0, 0, 0).getTime();
        const fim = new Date(ano, mes + 1, 0, 23, 59, 59, 999).getTime();
        const q = procura.trim().toLowerCase();

        return accountingEntries
            .filter((e) => e.debit === 'expenses')
            .filter((e) => {
                const t = e.timestamp instanceof Date ? e.timestamp.getTime() : new Date(e.timestamp).getTime();
                return t >= inicio && t <= fim;
            })
            .filter((e) => !q || (e.description || '').toLowerCase().includes(q))
            .sort((a, b) => {
                const tA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
                const tB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
                return tB - tA;
            });
    }, [accountingEntries, ano, mes, procura]);

    const total = despesas.reduce((s, e) => s + (e.amountTotal || 0), 0);

    /** Total por categoria dinâmico (suporta novas categorias cadastradas) */
    const porCategoria = useMemo(() => {
        const mapa: Record<string, number> = {};
        despesas.forEach((e) => {
            const desc = e.description || '';
            const parts = desc.split(' — ');
            const cat = parts.length > 1 && parts[0].trim() !== ''
                ? parts[0].trim()
                : (todasCategorias.find((c) => desc.startsWith(c)) || 'Outras Despesas Operacionais');
            mapa[cat] = (mapa[cat] || 0) + (e.amountTotal || 0);
        });
        return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
    }, [despesas, todasCategorias]);

    // Registar nova despesa
    const registar = async () => {
        if (valor <= 0 || !descricao.trim()) {
            toast({ title: 'Dados incompletos', description: 'Indique a descrição e um valor maior que zero.' });
            return;
        }

        setAGravar(true);
        try {
            const expenseDate = dataDespesa ? new Date(dataDespesa + 'T12:00:00') : new Date();

            await addAccountingEntry({
                type: 'adjustment',
                description: `${categoria} — ${descricao.trim()}`,
                debit: 'expenses',
                credit: formaPagamento,
                amountPrincipal: 0,
                amountInterest: 0,
                amountLateInterest: 0,
                amountTotal: valor,
                processedBy: user?.name || 'Sistema',
                timestamp: expenseDate,
            } as any);

            // Garantir que a visualização navega para o mês da despesa cadastrada
            if (expenseDate.getFullYear() !== ano || expenseDate.getMonth() !== mes) {
                setAno(expenseDate.getFullYear());
                setMes(expenseDate.getMonth());
            }

            toast({
                title: 'Despesa Registada!',
                description: `${categoria}: ${formatCurrency(valor)} registado com sucesso.`
            });

            setModalAberta(false);
            setDescricao('');
            setValor(0);
            setDataDespesa(new Date().toISOString().split('T')[0]);
        } catch {
            toast({ title: 'Erro', description: 'Não foi possível registar a despesa.' });
        } finally {
            setAGravar(false);
        }
    };

    return (
        <MainLayout title="Despesas" subtitle="Custos operacionais da empresa">
            <div className="flex flex-col gap-6 pb-12">
                {/* Navegação e acções */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => mudarMes(-1)} className="h-9 w-9 p-0 rounded-xl" title="Mês anterior">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <p className="min-w-44 text-center font-display text-lg font-black tracking-tight text-foreground">
                            {MESES[mes]} {ano}
                        </p>
                        <Button variant="outline" size="sm" onClick={() => mudarMes(1)} className="h-9 w-9 p-0 rounded-xl" title="Mês seguinte">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Pesquisar por categoria ou despesa…"
                                value={procura}
                                onChange={(e) => setProcura(e.target.value)}
                                className="pl-10 h-9 rounded-xl text-xs"
                            />
                        </div>
                        <Button
                            onClick={() => {
                                setDataDespesa(new Date().toISOString().split('T')[0]);
                                setModalAberta(true);
                            }}
                            className="gap-2 h-9 rounded-xl font-bold bg-[#04432c] hover:bg-[#065f46] text-white shadow-xs"
                        >
                            <Plus className="h-4 w-4" />
                            Nova Despesa
                        </Button>
                    </div>
                </div>

                {/* Resumo de KPI */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="card-kpi-coral rounded-2xl p-5 shadow-xs">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/10 text-slate-950 shrink-0 dark:bg-white/10 dark:text-white">
                                <Wallet className="h-5 w-5" />
                            </div>
                            <p className="text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">Total do Mês</p>
                        </div>
                        <div className="my-2">
                            <p className="font-display truncate text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                                {formatCurrency(total)}
                            </p>
                        </div>
                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400">
                            {despesas.length} lançamento(s) em {MESES[mes]} de {ano}
                        </p>
                    </div>

                    <div className="card-elevated p-5 sm:col-span-2 xl:col-span-3 rounded-2xl border border-border shadow-xs">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-bold text-foreground flex items-center gap-2">
                                <Tag className="h-4 w-4 text-primary" />
                                Por Categoria
                            </p>
                            <span className="text-xs text-muted-foreground">
                                {porCategoria.length} categoria(s) com movimento
                            </span>
                        </div>
                        {porCategoria.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Sem despesas neste mês.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {porCategoria.map(([cat, v]) => (
                                    <Badge key={cat} variant="outline" className="gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border-border/80">
                                        <span>{cat}</span>
                                        <span className="font-black tabular-nums text-rose-600 dark:text-rose-400">{formatCurrency(v)}</span>
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Tabela de Lançamentos de Despesas */}
                <div className="card-elevated overflow-hidden rounded-2xl border border-border shadow-xs">
                    <div className="overflow-x-auto">
                        <Table className="w-full text-xs">
                            <TableHeader>
                                <TableRow className="bg-[#04432c] hover:bg-[#04432c] text-white">
                                    <TableHead className="w-36 text-white uppercase text-[11px] font-bold py-3">Data</TableHead>
                                    <TableHead className="w-52 text-white uppercase text-[11px] font-bold py-3">Categoria</TableHead>
                                    <TableHead className="text-white uppercase text-[11px] font-bold py-3">Descrição da Despesa</TableHead>
                                    <TableHead className="w-32 text-center text-white uppercase text-[11px] font-bold py-3">Origem</TableHead>
                                    <TableHead className="w-40 text-white uppercase text-[11px] font-bold py-3">Registado por</TableHead>
                                    <TableHead className="w-36 text-right text-white uppercase text-[11px] font-bold py-3">Valor</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {despesas.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="py-14 text-center text-xs text-muted-foreground">
                                            Sem despesas em {MESES[mes]} de {ano}. Clique em <strong>"+ Nova Despesa"</strong> para adicionar.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    despesas.map((e) => {
                                        const desc = e.description || '';
                                        const parts = desc.split(' — ');
                                        const cat = parts.length > 1 ? parts[0].trim() : (todasCategorias.find((c) => desc.startsWith(c)) || 'Despesa Operacional');
                                        const detalhe = parts.length > 1 ? parts.slice(1).join(' — ') : desc;

                                        return (
                                            <TableRow key={e.id} className="hover:bg-muted/30 border-b transition-colors">
                                                <TableCell className="font-mono text-xs text-muted-foreground py-3">
                                                    {formatDateTime(e.timestamp)}
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted text-foreground border border-border">
                                                        {cat}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="font-medium text-foreground py-3">
                                                    {detalhe}
                                                </TableCell>
                                                <TableCell className="text-center py-3">
                                                    <span className={cn(
                                                        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold",
                                                        e.credit === 'bank'
                                                            ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                                            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                                    )}>
                                                        {e.credit === 'bank' ? 'Banco' : 'Caixa'}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground py-3">
                                                    {e.processedBy || 'Sistema'}
                                                </TableCell>
                                                <TableCell className="text-right font-black tabular-nums text-rose-600 dark:text-rose-400 text-sm py-3">
                                                    {formatCurrency(e.amountTotal || 0)}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>

            {/* --- MODAL DE NOVA DESPESA COM SELECT2 INTEGRADO --- */}
            <Dialog open={modalAberta} onOpenChange={setModalAberta}>
                <DialogContent className="w-[95vw] max-w-md flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 rounded-2xl border shadow-2xl">
                    {/* Cabeçalho sem sobreposições */}
                    <DialogHeader className="m-0 shrink-0 bg-sidebar text-white px-6 pr-12 pt-6 pb-5 border-b border-white/10 space-y-1.5 shadow-none relative">
                        <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white tracking-tight">
                            <Receipt className="h-5 w-5 text-white/90" />
                            Nova Despesa
                        </DialogTitle>
                        <DialogDescription className="text-xs text-white/75 leading-relaxed m-0">
                            Fica lançada na contabilidade a débito de Despesas Operacionais.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                        
                        {/* --- SELECT 2: CATEGORIA COM BUSCA E OPÇÃO DE CADASTRAR NOVA --- */}
                        <div className="space-y-1.5" ref={select2Ref}>
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-foreground">
                                    Categoria / Tipo de Despesa *
                                </Label>
                                <button
                                    type="button"
                                    onClick={() => setCriandoNovaCategoria(!criandoNovaCategoria)}
                                    className="text-[11px] text-primary hover:underline font-bold flex items-center gap-1 transition-colors"
                                >
                                    <Plus className="h-3 w-3" />
                                    {criandoNovaCategoria ? 'Fechar' : 'Cadastrar Nova Categoria'}
                                </button>
                            </div>

                            {/* Formulário Inline para Cadastrar Nova Categoria */}
                            {criandoNovaCategoria && (
                                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2 animate-in fade-in zoom-in-95 duration-150">
                                    <span className="text-[11px] font-bold text-foreground block">
                                        Nova Categoria de Despesa:
                                    </span>
                                    <div className="flex gap-2">
                                        <Input
                                            autoFocus
                                            value={novaCategoriaNome}
                                            onChange={(e) => setNovaCategoriaNome(e.target.value)}
                                            placeholder="Ex: Licenças de TI, Café e Refeições..."
                                            className="h-8 text-xs bg-background rounded-lg"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleSalvarNovaCategoria();
                                                }
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => handleSalvarNovaCategoria()}
                                            className="h-8 px-3 text-xs font-bold rounded-lg shrink-0"
                                        >
                                            Salvar
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Dropdown Select2 Pesquisável */}
                            <div className="relative">
                                <div
                                    onClick={() => setSelect2Open(!select2Open)}
                                    className="flex items-center justify-between w-full h-10 px-3 bg-background border rounded-xl cursor-pointer hover:border-primary/60 transition-colors shadow-2xs"
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <Tag className="h-3.5 w-3.5 text-primary shrink-0" />
                                        <span className="font-semibold text-xs text-foreground truncate">
                                            {categoria || 'Selecione uma categoria...'}
                                        </span>
                                    </div>
                                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0", select2Open && "rotate-180")} />
                                </div>

                                {/* Menu Flutuante Select2 */}
                                {select2Open && (
                                    <div className="absolute z-50 left-0 right-0 top-11 mt-1 bg-popover text-popover-foreground border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                        <div className="p-2 border-b bg-muted/30">
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                                                <Input
                                                    autoFocus
                                                    value={categoriaSearch}
                                                    onChange={(e) => setCategoriaSearch(e.target.value)}
                                                    placeholder="Pesquisar ou digitar nova categoria..."
                                                    className="pl-8 h-8 text-xs bg-background rounded-lg"
                                                />
                                            </div>
                                        </div>

                                        <div className="max-h-52 overflow-y-auto divide-y divide-border/40">
                                            {categoriasFiltradas.length === 0 ? (
                                                <div className="p-3 text-center space-y-2">
                                                    <p className="text-xs text-muted-foreground">
                                                        Nenhuma categoria existente com "{categoriaSearch}".
                                                    </p>
                                                    {categoriaSearch.trim() && (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            onClick={() => handleSalvarNovaCategoria(categoriaSearch.trim())}
                                                            className="w-full h-7 text-xs font-bold gap-1 rounded-lg"
                                                        >
                                                            <Plus className="h-3 w-3" />
                                                            Cadastrar "{categoriaSearch.trim()}"
                                                        </Button>
                                                    )}
                                                </div>
                                            ) : (
                                                categoriasFiltradas.map((cat) => (
                                                    <div
                                                        key={cat}
                                                        onClick={() => {
                                                            setCategoria(cat);
                                                            setSelect2Open(false);
                                                            setCategoriaSearch('');
                                                        }}
                                                        className={cn(
                                                            "px-3 py-2 text-xs hover:bg-primary/10 cursor-pointer flex items-center justify-between transition-colors",
                                                            categoria === cat && "bg-primary/10 font-bold text-primary"
                                                        )}
                                                    >
                                                        <span>{cat}</span>
                                                        {categoria === cat && (
                                                            <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                                        )}
                                                    </div>
                                                ))
                                            )}

                                            {/* Atalho para cadastrar caso tenha digitado algo novo */}
                                            {categoriaSearch.trim() && !todasCategorias.some(c => c.toLowerCase() === categoriaSearch.trim().toLowerCase()) && categoriasFiltradas.length > 0 && (
                                                <div
                                                    onClick={() => handleSalvarNovaCategoria(categoriaSearch.trim())}
                                                    className="p-2.5 text-xs bg-primary/5 hover:bg-primary/10 cursor-pointer text-primary font-bold flex items-center gap-1.5 transition-colors"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    Cadastrar como nova: "{categoriaSearch.trim()}"
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Data da Despesa */}
                        <div className="space-y-1.5">
                            <Label htmlFor="data-despesa" className="text-xs font-bold">Data da Despesa *</Label>
                            <Input
                                id="data-despesa"
                                type="date"
                                value={dataDespesa}
                                onChange={(e) => setDataDespesa(e.target.value)}
                                className="h-9 text-xs rounded-xl"
                            />
                        </div>

                        {/* Descrição */}
                        <div className="space-y-1.5">
                            <Label htmlFor="desc-despesa" className="text-xs font-bold">Descrição / Detalhe *</Label>
                            <Input
                                id="desc-despesa"
                                value={descricao}
                                onChange={(e) => setDescricao(e.target.value)}
                                placeholder="Ex: Pagamento mensal de internet fibra ótica"
                                className="h-9 text-xs rounded-xl"
                            />
                        </div>

                        {/* Forma de Pagamento / Conta de Saída */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold">Forma de Saída de Caixa</Label>
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={formaPagamento === 'cash' ? 'default' : 'outline'}
                                    onClick={() => setFormaPagamento('cash')}
                                    className={cn(
                                        "h-9 text-xs font-bold rounded-xl gap-1.5",
                                        formaPagamento === 'cash' && "bg-emerald-700 hover:bg-emerald-800 text-white"
                                    )}
                                >
                                    <Wallet className="h-3.5 w-3.5" />
                                    Caixa Geral (Dinheiro)
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={formaPagamento === 'bank' ? 'default' : 'outline'}
                                    onClick={() => setFormaPagamento('bank')}
                                    className={cn(
                                        "h-9 text-xs font-bold rounded-xl gap-1.5",
                                        formaPagamento === 'bank' && "bg-blue-700 hover:bg-blue-800 text-white"
                                    )}
                                >
                                    <Landmark className="h-3.5 w-3.5" />
                                    Banco (Transferência)
                                </Button>
                            </div>
                        </div>

                        {/* Valor */}
                        <div className="space-y-1.5">
                            <Label htmlFor="valor-despesa" className="text-xs font-bold">Valor (AOA) *</Label>
                            <CurrencyInput id="valor-despesa" value={valor} onValueChange={setValor} />
                        </div>
                    </div>

                    {/* Rodapé com botões de ação */}
                    <div className="flex shrink-0 justify-end gap-3 border-t border-border px-6 py-4 bg-muted/20">
                        <Button variant="outline" onClick={() => setModalAberta(false)} disabled={aGravar} className="rounded-xl text-xs">
                            Cancelar
                        </Button>
                        <Button onClick={registar} disabled={aGravar} className="gap-2 font-bold rounded-xl text-xs bg-[#04432c] hover:bg-[#065f46] text-white">
                            {aGravar && <Loader2 className="h-4 w-4 animate-spin" />}
                            Registar Despesa
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}
