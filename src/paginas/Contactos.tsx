import { useMemo, useState } from 'react';
import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from '@/bibliotecas/pdf-tabela';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/componentes/ui/table';
import { 
    Search, Copy, Check, Printer, Phone, Mail, CreditCard, 
    MessageCircle, MapPin, Users, Download, UserCheck, Sparkles 
} from 'lucide-react';
import { useToast } from '@/ganchos/usar-toast';
import { cn } from '@/bibliotecas/utils';
import { applyBranding, getCompanySettings, BRAND_ORANGE, BRAND_CHARCOAL, resolveBrandPrimary } from '@/bibliotecas/pdf';
import { format } from 'date-fns';
import { ServicoAlcadas } from '@/servicos/ServicoAlcadas';
import { porMaisRecente } from '@/bibliotecas/ordenacao';

type CategoriaFiltro = 'TODOS' | 'COMUM' | 'APOSENTADO' | 'ESTRANGEIRO';

const getInitials = (name?: string) => {
    if (!name) return 'CL';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getAvatarBg = (name?: string) => {
    const colors = [
        'bg-emerald-600 text-white',
        'bg-blue-600 text-white',
        'bg-teal-600 text-white',
        'bg-indigo-600 text-white',
        'bg-amber-600 text-white',
        'bg-rose-600 text-white',
    ];
    let sum = 0;
    for (let i = 0; i < (name?.length || 0); i++) {
        sum += name!.charCodeAt(i);
    }
    return colors[sum % colors.length];
};

/** Botão que copia um valor e confirma visualmente com suporte a ícones e link direto */
function BotaoCopiar({ valor, titulo, icone, linkHref }: { valor?: string; titulo: string; icone?: React.ReactNode; linkHref?: string }) {
    const [copiado, setCopiado] = useState(false);
    const { toast } = useToast();

    if (!valor || valor.trim() === '') return <span className="text-slate-400 italic text-[11px]">--</span>;

    const copiar = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(valor);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
        } catch {
            toast({ title: 'Não foi possível copiar', description: 'Acesso à área de transferência bloqueado.' });
        }
    };

    return (
        <div className="group/cell inline-flex items-center gap-1.5 max-w-full">
            {linkHref ? (
                <a
                    href={linkHref}
                    title={`Abrir ${titulo}`}
                    className="inline-flex items-center gap-1.5 truncate text-slate-700 dark:text-slate-200 hover:text-primary transition-colors max-w-[200px]"
                >
                    {icone && <span className="text-slate-400 shrink-0">{icone}</span>}
                    <span className="truncate">{valor}</span>
                </a>
            ) : (
                <span className="inline-flex items-center gap-1.5 truncate text-slate-700 dark:text-slate-200 max-w-[200px]">
                    {icone && <span className="text-slate-400 shrink-0">{icone}</span>}
                    <span className="truncate">{valor}</span>
                </span>
            )}
            <button
                type="button"
                onClick={copiar}
                title={`Copiar ${titulo}`}
                className="opacity-0 group-hover/cell:opacity-100 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shrink-0"
            >
                {copiado ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600 animate-in zoom-in" />
                ) : (
                    <Copy className="h-3 w-3 text-slate-400 hover:text-foreground" />
                )}
            </button>
        </div>
    );
}

export default function Contactos() {
    const { clients, companySettings } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    const [procura, setProcura] = useState('');
    const [categoriaFiltro, setCategoriaFiltro] = useState<CategoriaFiltro>('TODOS');
    const [copiandoLista, setCopiandoLista] = useState(false);

    // Contadores por categoria
    const totalTodos = clients.length;
    const totalNormais = clients.filter(c => (c.clientCategory || 'COMUM') === 'COMUM').length;
    const totalAposentados = clients.filter(c => (c.clientCategory || 'COMUM') === 'APOSENTADO').length;
    const totalEstrangeiros = clients.filter(c => (c.clientCategory || 'COMUM') === 'ESTRANGEIRO').length;

    // Lista filtrada
    const lista = useMemo(() => {
        const q = procura.trim().toLowerCase();
        return clients
            .filter((c) => {
                const cat = c.clientCategory || 'COMUM';
                if (categoriaFiltro !== 'TODOS' && cat !== categoriaFiltro) {
                    return false;
                }
                if (!q) return true;
                return (
                    (c.name || '').toLowerCase().includes(q) ||
                    (c.nif || '').toLowerCase().includes(q) ||
                    (c.phone || '').includes(q) ||
                    (c.email || '').toLowerCase().includes(q) ||
                    (c.address || '').toLowerCase().includes(q)
                );
            })
            .sort(porMaisRecente(c => c.createdAt));
    }, [clients, procura, categoriaFiltro]);

    const totalFiltrados = lista.length;
    const comTelefone = lista.filter((c) => c.phone && c.phone.trim() !== '').length;
    const comEmail = lista.filter((c) => c.email && c.email.trim() !== '').length;
    const pctTelefone = totalFiltrados > 0 ? Math.round((comTelefone / totalFiltrados) * 100) : 0;

    /** Exporta lista de contactos em PDF profissional */
    const descarregarPDF = async (apenasFiltrados: boolean = false) => {
        const dados = apenasFiltrados ? lista : clients;
        if (dados.length === 0) {
            toast({ title: 'Nenhum contacto', description: 'Não há contactos para exportar.' });
            return;
        }
        // Alçada de exportação de dados de clientes (registos por exportação e exportações por dia).
        try { await ServicoAlcadas.authorizeExport(user?.id, dados.length, 'agenda de contactos'); }
        catch (error: any) { toast({ title: 'Exportação acima do limite', description: error?.message, variant: 'destructive' }); return; }

        const config = getCompanySettings(companySettings);
        const generatedBy = user?.name || 'Sistema';
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();

        // 1. Aplica o cabeçalho institucional completo com Logo, Nome, NIF, Telefone e Email
        applyBranding(doc, config, generatedBy, false);

        const primary = resolveBrandPrimary(config.primaryColor);
        const dark = BRAND_CHARCOAL;

        // 2. Título Executivo com Acento Vertical Laranja (Conforme Imagem de Referência)
        const titleY = 48;
        doc.setFillColor(primary[0], primary[1], primary[2]);
        doc.roundedRect(16, titleY, 3.5, 11, 0.8, 0.8, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12.5);
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text('AGENDA DE CONTACTOS DOS CLIENTES', 22, titleY + 5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`Total de registos encontrados: ${dados.length}   |   Data: ${format(new Date(), 'dd/MM/yyyy HH:mm')}   |   Operador: ${generatedBy}`, 22, titleY + 9.5);

        autoTable(doc, {
            startY: 64,
            head: [['#', 'NOME DO CLIENTE', 'NIF / BI', 'TELEFONE', 'CORREIO ELETRÓNICO', 'ENDEREÇO / MORADA']],
            body: dados.map((c, i) => [
                String(i + 1),
                c.name || '-',
                c.nif || '-',
                c.phone || '-',
                c.email || '--',
                c.address || '--'
            ]),
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2.2, overflow: 'linebreak', textColor: dark },
            headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [250, 250, 252] },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 65, fontStyle: 'bold' },
                2: { cellWidth: 35 },
                3: { cellWidth: 35 },
                4: { cellWidth: 50 },
                5: { cellWidth: 'auto' }
            },
            margin: { left: 16, right: 14, bottom: 25 },
            didDrawPage: () => applyBranding(doc, config, generatedBy, true)
        });

        doc.save(`Agenda_Contactos_Clientes_${format(new Date(), 'ddMMyyyy_HHmm')}.pdf`);
        toast({ title: 'PDF Descarregado', description: `Lista com ${dados.length} clientes exportada.` });
    };

    /** Copia a lista de todos os clientes formatada para a área de transferência */
    const copiarTodosContactos = async () => {
        try {
            setCopiandoLista(true);
            const linhas = [
                `========================================`,
                `AGENDA GERAL DE CONTACTOS DOS CLIENTES (${clients.length} CLIENTES)`,
                `========================================\n`
            ];

            clients.forEach((c, index) => {
                linhas.push(
                    `${index + 1}. ${c.name.toUpperCase()}\n` +
                    `   NIF/BI: ${c.nif || 'Não informado'}\n` +
                    `   Telefone: ${c.phone || '--'}\n` +
                    `   Email: ${c.email || '--'}\n` +
                    `   Morada: ${c.address || '--'}\n`
                );
            });

            await navigator.clipboard.writeText(linhas.join('\n'));
            toast({
                title: 'Lista Copiada!',
                description: `Todos os ${clients.length} clientes foram copiados para a área de transferência.`
            });
        } catch {
            toast({ title: 'Erro ao copiar', description: 'Não foi possível copiar os dados.' });
        } finally {
            setTimeout(() => setCopiandoLista(false), 1200);
        }
    };

    return (
        <MainLayout title="Contactos" subtitle="Agenda consolidada de contactos dos clientes">
            <div className="flex flex-col gap-5 pb-12">
                
                {/* --- TÍTULO IDÊNTICO À SEGUNDA IMAGEM --- */}
                <div className="space-y-1">
                    <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-[#04432c] dark:text-emerald-400">
                        AGENDA DE CONTACTOS DOS CLIENTES
                    </h1>
                    <p className="text-xs text-muted-foreground font-medium">
                        Total de registos encontrados: <strong className="text-foreground">{totalFiltrados}</strong>
                    </p>
                </div>

                {/* --- 3 CARDS SUPERIORES DE MÉTRICAS (EXATOS À SEGUNDA IMAGEM) --- */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Card 1: Todos Clientes */}
                    <div className="bg-card border rounded-xl p-4 text-center shadow-2xs">
                        <div className="text-2xl sm:text-3xl font-bold text-foreground">
                            {totalFiltrados}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                            Todos Clientes
                        </div>
                    </div>

                    {/* Card 2: Com Telefone */}
                    <div className="bg-card border rounded-xl p-4 text-center shadow-2xs">
                        <div className="text-2xl sm:text-3xl font-bold text-foreground">
                            {comTelefone}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                            Com Telefone ({pctTelefone}%)
                        </div>
                    </div>

                    {/* Card 3: Clientes com Email / NIF */}
                    <div className="bg-card border rounded-xl p-4 text-center shadow-2xs">
                        <div className="text-2xl sm:text-3xl font-bold text-foreground">
                            {comEmail}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                            Clientes com Email
                        </div>
                    </div>
                </div>

                {/* --- BOTÕES DE FILTRO POR CARTEIRA + AÇÕES DE EXPORTAÇÃO --- */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-muted/20 p-3.5 rounded-xl border">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant={categoriaFiltro === 'TODOS' ? 'default' : 'outline'}
                            onClick={() => setCategoriaFiltro('TODOS')}
                            className={cn(
                                "text-xs font-bold rounded-lg h-8",
                                categoriaFiltro === 'TODOS' && "bg-[#04432c] hover:bg-[#065f46] text-white"
                            )}
                        >
                            Todos ({totalTodos})
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={categoriaFiltro === 'COMUM' ? 'default' : 'outline'}
                            onClick={() => setCategoriaFiltro('COMUM')}
                            className={cn(
                                "text-xs font-semibold rounded-lg h-8",
                                categoriaFiltro === 'COMUM' && "bg-blue-600 hover:bg-blue-700 text-white"
                            )}
                        >
                            Normais ({totalNormais})
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={categoriaFiltro === 'APOSENTADO' ? 'default' : 'outline'}
                            onClick={() => setCategoriaFiltro('APOSENTADO')}
                            className={cn(
                                "text-xs font-semibold rounded-lg h-8",
                                categoriaFiltro === 'APOSENTADO' && "bg-amber-600 hover:bg-amber-700 text-white"
                            )}
                        >
                            Aposentados ({totalAposentados})
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={categoriaFiltro === 'ESTRANGEIRO' ? 'default' : 'outline'}
                            onClick={() => setCategoriaFiltro('ESTRANGEIRO')}
                            className={cn(
                                "text-xs font-semibold rounded-lg h-8",
                                categoriaFiltro === 'ESTRANGEIRO' && "bg-purple-600 hover:bg-purple-700 text-white"
                            )}
                        >
                            Estrangeiros ({totalEstrangeiros})
                        </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            size="sm"
                            onClick={() => descarregarPDF(false)}
                            className="h-8 text-xs font-bold gap-1.5 bg-[#04432c] hover:bg-[#065f46] text-white rounded-lg"
                            title="Baixar lista completa de todos os clientes em PDF"
                        >
                            <Download className="h-3.5 w-3.5" />
                            Pegar Lista de Todos os Clientes (PDF)
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={copiarTodosContactos}
                            className="h-8 text-xs font-semibold gap-1.5 rounded-lg"
                        >
                            {copiandoLista ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                            Copiar Lista
                        </Button>
                    </div>
                </div>

                {/* --- BARRA DE PESQUISA RÁPIDA --- */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Filtrar por nome, NIF, telefone ou morada..."
                            value={procura}
                            onChange={(e) => setProcura(e.target.value)}
                            className="pl-9 h-9 text-xs rounded-xl"
                        />
                    </div>
                    {categoriaFiltro !== 'TODOS' && (
                        <Button 
                            size="sm"
                            onClick={() => descarregarPDF(true)} 
                            variant="outline" 
                            className="gap-1.5 h-9 text-xs rounded-xl"
                        >
                            <Download className="h-3.5 w-3.5" />
                            Baixar Seleção ({lista.length})
                        </Button>
                    )}
                </div>

                {/* --- TABELA DE CONTACTOS TOTALMENTE AJUSTADA E PROPORCIONAL --- */}
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm bg-card">
                    <Table className="w-full text-xs min-w-[980px]">
                        <TableHeader>
                            <TableRow className="bg-[#04432c] hover:bg-[#04432c] text-white border-b-0 select-none">
                                <TableHead className="w-12 text-center font-black text-white uppercase text-[11px] py-3.5 tracking-wider">#</TableHead>
                                <TableHead className="w-64 font-black text-white uppercase text-[11px] py-3.5 px-3 tracking-wider">NOME DO CLIENTE</TableHead>
                                <TableHead className="w-40 font-black text-white uppercase text-[11px] py-3.5 px-3 tracking-wider">NIF / BI</TableHead>
                                <TableHead className="w-44 font-black text-white uppercase text-[11px] py-3.5 px-3 tracking-wider">TELEFONE</TableHead>
                                <TableHead className="w-60 font-black text-white uppercase text-[11px] py-3.5 px-3 tracking-wider">CORREIO ELETRÓNICO</TableHead>
                                <TableHead className="min-w-[220px] font-black text-white uppercase text-[11px] py-3.5 px-3 tracking-wider">ENDEREÇO / MORADA</TableHead>
                                <TableHead className="w-24 text-center font-black text-white uppercase text-[11px] py-3.5 tracking-wider print:hidden">WHATSAPP</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {lista.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-16 text-center text-xs text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <Users className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                                            <span>
                                                {procura
                                                    ? `Nenhum contacto encontrado para "${procura}".`
                                                    : 'Nenhum cliente cadastrado nesta seleção.'}
                                            </span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                lista.map((c, index) => {
                                    return (
                                        <TableRow key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 transition-colors group">
                                            <TableCell className="text-center font-bold text-slate-400 py-3.5 w-12">
                                                {index + 1}
                                            </TableCell>
                                            <TableCell className="py-3.5 px-3 w-64">
                                                <div className="flex items-center gap-2.5">
                                                    <div className={cn("h-8 w-8 rounded-full flex items-center justify-center font-black text-[11px] shrink-0 shadow-2xs", getAvatarBg(c.name))}>
                                                        {getInitials(c.name)}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-bold text-slate-900 dark:text-slate-100 truncate text-xs" title={c.name}>
                                                            {c.name}
                                                        </div>
                                                        <div className="mt-0.5">
                                                            {c.clientCategory === 'APOSENTADO' ? (
                                                                <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                                                    Aposentado
                                                                </span>
                                                            ) : c.clientCategory === 'ESTRANGEIRO' ? (
                                                                <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                                                                    Estrangeiro
                                                                </span>
                                                            ) : (
                                                                <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                                                                    Comum
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-slate-700 dark:text-slate-300 py-3.5 px-3 w-40">
                                                <BotaoCopiar valor={c.nif} titulo="NIF/BI" icone={<CreditCard className="h-3.5 w-3.5 text-slate-400" />} />
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-slate-700 dark:text-slate-300 py-3.5 px-3 w-44">
                                                <BotaoCopiar valor={c.phone} titulo="telefone" icone={<Phone className="h-3.5 w-3.5 text-slate-400" />} linkHref={c.phone ? `tel:${c.phone}` : undefined} />
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-700 dark:text-slate-300 py-3.5 px-3 w-60">
                                                <BotaoCopiar valor={c.email} titulo="correio eletrónico" icone={<Mail className="h-3.5 w-3.5 text-slate-400" />} linkHref={c.email ? `mailto:${c.email}` : undefined} />
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-700 dark:text-slate-300 py-3.5 px-3 min-w-[220px]">
                                                <BotaoCopiar valor={c.address} titulo="morada" icone={<MapPin className="h-3.5 w-3.5 text-slate-400" />} />
                                            </TableCell>
                                            <TableCell className="text-center py-3.5 px-3 w-24 print:hidden">
                                                {c.phone ? (
                                                    <a
                                                        href={`https://wa.me/${c.phone.replace(/\D/g, '')}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        title={`Conversar com ${c.name} no WhatsApp`}
                                                        className="inline-flex h-7 px-2.5 items-center gap-1 rounded-lg text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all font-semibold text-[11px] shadow-2xs"
                                                    >
                                                        <MessageCircle className="h-3.5 w-3.5" />
                                                        <span>Chat</span>
                                                    </a>
                                                ) : (
                                                    <span className="text-slate-300 dark:text-slate-600 text-xs">--</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50/70 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-800 text-xs text-muted-foreground">
                        <span>A mostrar <strong>{lista.length}</strong> de <strong>{clients.length}</strong> clientes registados</span>
                        {categoriaFiltro !== 'TODOS' && (
                            <span className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-medium">
                                Filtro Ativo: {categoriaFiltro}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
