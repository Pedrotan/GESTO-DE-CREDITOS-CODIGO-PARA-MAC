import { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

type CategoriaFiltro = 'TODOS' | 'COMUM' | 'APOSENTADO' | 'ESTRANGEIRO';

/** Botão que copia um valor e confirma visualmente */
function BotaoCopiar({ valor, titulo }: { valor?: string; titulo: string }) {
    const [copiado, setCopiado] = useState(false);
    const { toast } = useToast();

    if (!valor || valor.trim() === '') return <span className="text-slate-400">--</span>;

    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(valor);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
        } catch {
            toast({ title: 'Não foi possível copiar', description: 'Acesso à área de transferência bloqueado.' });
        }
    };

    return (
        <button
            type="button"
            onClick={copiar}
            title={`Copiar ${titulo}`}
            className="group inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
            <span className="truncate max-w-[260px]">{valor}</span>
            {copiado
                ? <Check className="h-3 w-3 shrink-0 text-emerald-600" />
                : <Copy className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />}
        </button>
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
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [clients, procura, categoriaFiltro]);

    const totalFiltrados = lista.length;
    const comTelefone = lista.filter((c) => c.phone && c.phone.trim() !== '').length;
    const comEmail = lista.filter((c) => c.email && c.email.trim() !== '').length;
    const pctTelefone = totalFiltrados > 0 ? Math.round((comTelefone / totalFiltrados) * 100) : 0;

    /** Exporta lista de contactos em PDF profissional */
    const descarregarPDF = (apenasFiltrados: boolean = false) => {
        const dados = apenasFiltrados ? lista : clients;
        if (dados.length === 0) {
            toast({ title: 'Nenhum contacto', description: 'Não há contactos para exportar.' });
            return;
        }

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

                {/* --- TABELA COM CABEÇALHO VERDE ESCURO IGUAL À SEGUNDA IMAGEM --- */}
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs bg-card">
                    <div className="overflow-x-auto">
                        <Table className="w-full text-xs">
                            <TableHeader>
                                <TableRow className="bg-[#04432c] hover:bg-[#04432c] text-white border-b-0">
                                    <TableHead className="w-12 text-center font-bold text-white uppercase text-[11px] py-3">#</TableHead>
                                    <TableHead className="font-bold text-white uppercase text-[11px] py-3">NOME DO CLIENTE</TableHead>
                                    <TableHead className="w-40 font-bold text-white uppercase text-[11px] py-3">NIF / BI</TableHead>
                                    <TableHead className="w-40 font-bold text-white uppercase text-[11px] py-3">TELEFONE</TableHead>
                                    <TableHead className="w-56 font-bold text-white uppercase text-[11px] py-3">CORREIO ELETRÓNICO</TableHead>
                                    <TableHead className="min-w-[220px] font-bold text-white uppercase text-[11px] py-3">ENDEREÇO / MORADA</TableHead>
                                    <TableHead className="w-16 text-center font-bold text-white uppercase text-[11px] py-3 print:hidden">WHATSAPP</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lista.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="py-12 text-center text-xs text-muted-foreground">
                                            {procura
                                                ? `Nenhum contacto encontrado para "${procura}".`
                                                : 'Nenhum cliente cadastrado nesta seleção.'}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    lista.map((c, index) => {
                                        return (
                                            <TableRow key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 transition-colors">
                                                <TableCell className="text-center font-medium text-slate-500 py-2.5">
                                                    {index + 1}
                                                </TableCell>
                                                <TableCell className="font-bold text-slate-900 dark:text-slate-100 py-2.5">
                                                    <div className="leading-tight">
                                                        <span>{c.name}</span>
                                                        {c.nif && (
                                                            <span className="block text-[10px] font-normal text-slate-400 mt-0.5">
                                                                BI / NIF: {c.nif}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-slate-700 dark:text-slate-300 py-2.5">
                                                    <BotaoCopiar valor={c.nif} titulo="NIF/BI" />
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-slate-700 dark:text-slate-300 py-2.5">
                                                    <BotaoCopiar valor={c.phone} titulo="telefone" />
                                                </TableCell>
                                                <TableCell className="text-xs text-slate-700 dark:text-slate-300 py-2.5">
                                                    <BotaoCopiar valor={c.email} titulo="correio eletrónico" />
                                                </TableCell>
                                                <TableCell className="text-xs text-slate-700 dark:text-slate-300 py-2.5">
                                                    <BotaoCopiar valor={c.address} titulo="morada" />
                                                </TableCell>
                                                <TableCell className="text-center py-2.5 print:hidden">
                                                    {c.phone ? (
                                                        <a
                                                            href={`https://wa.me/${c.phone.replace(/\D/g, '')}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            title={`Conversar com ${c.name} no WhatsApp`}
                                                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                                                        >
                                                            <MessageCircle className="h-4 w-4" />
                                                        </a>
                                                    ) : (
                                                        <span className="text-slate-300">--</span>
                                                    )}
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
        </MainLayout>
    );
}
