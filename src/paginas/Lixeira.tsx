import React, { useState } from 'react';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import { Button } from '@/componentes/ui/button';
import { Trash2, RotateCcw, AlertTriangle, User, Calendar, Info, Search } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { generateLixeiraReport } from '@/bibliotecas/lixeiraReportGenerator';
import { FileDown, ArrowUpDown, Check } from 'lucide-react';
import { AlertModal } from '@/componentes/ui/AlertModal';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/componentes/ui/dropdown-menu";

const EmptyState = React.forwardRef<HTMLDivElement, { message: string }>(({ message }, ref) => (
    <div ref={ref} className="flex flex-col items-center justify-center py-20 text-slate-400 w-full col-span-full">
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
            <Trash2 className="w-10 h-10 opacity-20" />
        </div>
        <p className="font-medium text-lg italic">{message}</p>
    </div>
));
EmptyState.displayName = 'EmptyState';

const Lixeira = () => {
    const {
        deletedClients,
        deletedCredits,
        deletedPayments,
        legalCases,
        warranties,
        restoreClient,
        hardDeleteClient,
        restoreCredit,
        hardDeleteCredit,
        restorePayment,
        hardDeletePayment,
        restoreLegalCase,
        hardDeleteLegalCase,
        restoreWarranty,
        hardDeleteWarranty,
        users,
        companySettings
    } = useData();
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('clients');
    const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        type: 'warning' | 'error' | 'info';
        onConfirm: () => void;
    }>({
        isOpen: false,
        title: '',
        description: '',
        type: 'info',
        onConfirm: () => { }
    });

    const openAlert = (config: Omit<typeof alertConfig, 'isOpen'>) => {
        setAlertConfig({ ...config, isOpen: true });
    };

    const closeAlert = () => {
        setAlertConfig(prev => ({ ...prev, isOpen: false }));
    };

    const deletedLegalCases = legalCases.filter(c => c.deletedAt);
    const deletedWarranties = warranties.filter(w => w.deletedAt);

    const sortItems = (items: any[]) => {
        return [...items].sort((a, b) => {
            if (sortBy === 'date') {
                const dateA = new Date(a.deletedAt || 0).getTime();
                const dateB = new Date(b.deletedAt || 0).getTime();
                return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
            } else {
                const nameA = (a.name || a.clientName || a.description || a.id || '').toLowerCase();
                const nameB = (b.name || b.clientName || b.description || b.id || '').toLowerCase();
                return sortOrder === 'asc'
                    ? nameA.localeCompare(nameB)
                    : nameB.localeCompare(nameA);
            }
        });
    };

    const sortedClients = sortItems(deletedClients);
    const sortedCredits = sortItems(deletedCredits);
    const sortedPayments = sortItems(deletedPayments);
    const sortedLegalCases = sortItems(deletedLegalCases);
    const sortedWarranties = sortItems(deletedWarranties);

    const getUserName = (userId: string) => {
        const u = users.find(u => u.id === userId);
        return u ? u.name : 'Sistema/Desconhecido';
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(val);
    };

    return (
        <MainLayout title="Lixeira do Sistema" subtitle="Recupere ou elimine permanentemente registos removidos">
            <div className="w-full max-w-none space-y-5">
                {/* Search & Tabs */}
                <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden min-h-[500px]">
                    <div className="p-6 border-b border-border bg-muted/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="relative max-w-md w-full">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Pesquisar na lixeira..."
                                className="w-full pl-11 pr-4 py-3 bg-card border border-border rounded-2xl text-sm font-medium focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="h-10 w-10 p-0 border-border hover:bg-muted rounded-xl transition-all active:scale-95"
                                        title="Ordenar itens"
                                    >
                                        <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 rounded-2xl border-border shadow-xl">
                                    <DropdownMenuLabel className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground px-4 py-3">
                                        Ordenar Por
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => setSortBy('date')}
                                        className="flex items-center justify-between px-4 py-2 cursor-pointer rounded-xl mx-1"
                                    >
                                        <span className="text-sm font-medium">Data de Eliminação</span>
                                        {sortBy === 'date' && <Check className="w-4 h-4 text-primary" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setSortBy('name')}
                                        className="flex items-center justify-between px-4 py-2 cursor-pointer rounded-xl mx-1"
                                    >
                                        <span className="text-sm font-medium">Nome / Descrição</span>
                                        {sortBy === 'name' && <Check className="w-4 h-4 text-primary" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground px-4 py-3">
                                        Ordem
                                    </DropdownMenuLabel>
                                    <DropdownMenuItem
                                        onClick={() => setSortOrder('desc')}
                                        className="flex items-center justify-between px-4 py-2 cursor-pointer rounded-xl mx-1"
                                    >
                                        <span className="text-sm font-medium">Mais recentes primeiro</span>
                                        {sortOrder === 'desc' && <Check className="w-4 h-4 text-primary" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setSortOrder('asc')}
                                        className="flex items-center justify-between px-4 py-2 cursor-pointer rounded-xl mx-1"
                                    >
                                        <span className="text-sm font-medium">Mais antigos primeiro</span>
                                        {sortOrder === 'asc' && <Check className="w-4 h-4 text-primary" />}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <Button
                                variant="outline"
                                className="h-10 gap-2 border-border hover:bg-muted font-bold text-[10px] uppercase tracking-widest rounded-xl"
                                onClick={() => generateLixeiraReport({
                                    deletedClients,
                                    deletedCredits,
                                    deletedPayments,
                                    deletedLegalCases,
                                    deletedWarranties,
                                    users,
                                    companySettings,
                                    userName: user?.name
                                })}
                            >
                                <FileDown className="w-4 h-4" />
                                Descarregar Relatório
                            </Button>
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-200/50 px-3 py-1 rounded-full whitespace-nowrap">
                                {deletedClients.length + deletedCredits.length + deletedPayments.length + deletedLegalCases.length + deletedWarranties.length} ITENS TOTAIS
                            </div>
                        </div>
                    </div>

                    <Tabs defaultValue="clients" onValueChange={setActiveTab} className="w-full">
                        <div className="px-6 py-2 border-b border-border bg-card sticky top-0 z-10 overflow-x-auto">
                            <TabsList className="bg-muted p-1 rounded-xl w-fit">
                                <TabsTrigger value="clients" className="rounded-lg font-bold uppercase text-[10px] tracking-widest h-10 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                                    Clientes ({deletedClients.length})
                                </TabsTrigger>
                                <TabsTrigger value="credits" className="rounded-lg font-bold uppercase text-[10px] tracking-widest h-10 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                    Créditos ({deletedCredits.length})
                                </TabsTrigger>
                                <TabsTrigger value="payments" className="rounded-lg font-bold uppercase text-[10px] tracking-widest h-10 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                    Pagamentos ({deletedPayments.length})
                                </TabsTrigger>
                                <TabsTrigger value="legal" className="rounded-lg font-bold uppercase text-[10px] tracking-widest h-10 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                    Processos ({deletedLegalCases.length})
                                </TabsTrigger>
                                <TabsTrigger value="warranties" className="rounded-lg font-bold uppercase text-[10px] tracking-widest h-10 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                    Garantias ({deletedWarranties.length})
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="p-6 bg-muted/20">
                            <TabsContent value="clients" className="mt-0">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <AnimatePresence mode="popLayout">
                                        {sortedClients.length === 0 ? (
                                            <EmptyState message="Nenhum cliente na lixeira" />
                                        ) : (
                                            sortedClients
                                                .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
                                                .map((client) => (
                                                    <DeletedItemCard
                                                        key={client.id}
                                                        title={client.name}
                                                        subtitle={client.nif || 'NIF não informado'}
                                                        date={client.deletedAt as Date}
                                                        author={getUserName(client.deletedBy!)}
                                                        onRestore={() => openAlert({
                                                            title: 'Restaurar Cliente',
                                                            description: `Deseja restaurar o cadastro do cliente ${client.name}? Ele voltará a estar ativo no sistema.`,
                                                            type: 'info',
                                                            onConfirm: () => {
                                                                restoreClient(client.id, user!);
                                                                closeAlert();
                                                            }
                                                        })}
                                                        onDelete={() => openAlert({
                                                            title: 'Eliminar Definitivamente',
                                                            description: `Tem certeza que deseja apagar permanentemente o cliente ${client.name}? Esta ação é irreversível e todos os dados associados serão perdidos.`,
                                                            type: 'error',
                                                            onConfirm: () => {
                                                                hardDeleteClient(client.id, user!);
                                                                closeAlert();
                                                            }
                                                        })}
                                                    />
                                                ))
                                        )}
                                    </AnimatePresence>
                                </div>
                            </TabsContent>

                            <TabsContent value="credits" className="mt-0">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <AnimatePresence mode="popLayout">
                                        {sortedCredits.length === 0 ? (
                                            <EmptyState message="Nenhum crédito na lixeira" />
                                        ) : (
                                            sortedCredits
                                                .filter(c => c.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || c.id.includes(searchTerm))
                                                .map((credit) => (
                                                    <DeletedItemCard
                                                        key={credit.id}
                                                        title={credit.clientName}
                                                        subtitle={`Crédito: ${formatCurrency(credit.principalAmount)}`}
                                                        date={credit.deletedAt as Date}
                                                        author={getUserName(credit.deletedBy!)}
                                                        onRestore={() => openAlert({
                                                            title: 'Restaurar Crédito',
                                                            description: `Deseja restaurar este crédito para o status ativo?`,
                                                            type: 'info',
                                                            onConfirm: () => {
                                                                restoreCredit(credit.id, user!);
                                                                closeAlert();
                                                            }
                                                        })}
                                                        onDelete={() => openAlert({
                                                            title: 'Eliminar Definitivamente',
                                                            description: `Tem certeza que deseja apagar permanentemente este crédito? Esta ação é irreversível.`,
                                                            type: 'error',
                                                            onConfirm: () => {
                                                                hardDeleteCredit(credit.id, user!);
                                                                closeAlert();
                                                            }
                                                        })}
                                                    />
                                                ))
                                        )}
                                    </AnimatePresence>
                                </div>
                            </TabsContent>

                            <TabsContent value="payments" className="mt-0">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <AnimatePresence mode="popLayout">
                                        {sortedPayments.length === 0 ? (
                                            <EmptyState message="Nenhum pagamento na lixeira" />
                                        ) : (
                                            sortedPayments
                                                .filter(p => p.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || p.id.includes(searchTerm))
                                                .map((payment) => (
                                                    <DeletedItemCard
                                                        key={payment.id}
                                                        title={payment.clientName}
                                                        subtitle={`Pagamento: ${formatCurrency(payment.amount)}`}
                                                        date={payment.deletedAt as Date}
                                                        author={getUserName(payment.deletedBy!)}
                                                        onRestore={() => openAlert({
                                                            title: 'Restaurar Pagamento',
                                                            description: `Deseja restaurar este registo de pagamento?`,
                                                            type: 'info',
                                                            onConfirm: () => {
                                                                restorePayment(payment.id, user!);
                                                                closeAlert();
                                                            }
                                                        })}
                                                        onDelete={() => openAlert({
                                                            title: 'Eliminar Definitivamente',
                                                            description: `Tem certeza que deseja apagar permanentemente este pagamento? Esta ação é irreversível.`,
                                                            type: 'error',
                                                            onConfirm: () => {
                                                                hardDeletePayment(payment.id, user!);
                                                                closeAlert();
                                                            }
                                                        })}
                                                    />
                                                ))
                                        )}
                                    </AnimatePresence>
                                </div>
                            </TabsContent>

                            <TabsContent value="legal" className="mt-0">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <AnimatePresence mode="popLayout">
                                        {sortedLegalCases.length === 0 ? (
                                            <EmptyState message="Nenhum processo na lixeira" />
                                        ) : (
                                            sortedLegalCases
                                                .filter(c => c.id.toLowerCase().includes(searchTerm.toLowerCase()))
                                                .map((legalCase) => (
                                                    <DeletedItemCard
                                                        key={legalCase.id}
                                                        title={`Processo: ${legalCase.id}`}
                                                        subtitle={`Crédito: ${legalCase.creditId}`}
                                                        date={legalCase.deletedAt as unknown as Date}
                                                        author={getUserName(legalCase.deletedBy!)}
                                                        onRestore={() => openAlert({
                                                            title: 'Restaurar Processo',
                                                            description: `Deseja restaurar este processo legal?`,
                                                            type: 'info',
                                                            onConfirm: () => {
                                                                restoreLegalCase(legalCase.id, user!);
                                                                closeAlert();
                                                            }
                                                        })}
                                                        onDelete={() => openAlert({
                                                            title: 'Eliminar Definitivamente',
                                                            description: `Tem certeza que deseja apagar permanentemente este processo?`,
                                                            type: 'error',
                                                            onConfirm: () => {
                                                                hardDeleteLegalCase(legalCase.id, user!);
                                                                closeAlert();
                                                            }
                                                        })}
                                                    />
                                                ))
                                        )}
                                    </AnimatePresence>
                                </div>
                            </TabsContent>

                            <TabsContent value="warranties" className="mt-0">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <AnimatePresence mode="popLayout">
                                        {sortedWarranties.length === 0 ? (
                                            <EmptyState message="Nenhuma garantia na lixeira" />
                                        ) : (
                                            sortedWarranties
                                                .filter(w => w.description.toLowerCase().includes(searchTerm.toLowerCase()))
                                                .map((warranty) => (
                                                    <DeletedItemCard
                                                        key={warranty.id}
                                                        title={warranty.description}
                                                        subtitle={`Tipo: ${warranty.type}`}
                                                        date={warranty.deletedAt as unknown as Date}
                                                        author={getUserName(warranty.deletedBy!)}
                                                        onRestore={() => openAlert({
                                                            title: 'Restaurar Garantia',
                                                            description: `Deseja restaurar esta garantia?`,
                                                            type: 'info',
                                                            onConfirm: () => {
                                                                restoreWarranty(warranty.id, user!);
                                                                closeAlert();
                                                            }
                                                        })}
                                                        onDelete={() => openAlert({
                                                            title: 'Eliminar Definitivamente',
                                                            description: `Tem certeza que deseja apagar permanentemente esta garantia?`,
                                                            type: 'error',
                                                            onConfirm: () => {
                                                                hardDeleteWarranty(warranty.id, user!);
                                                                closeAlert();
                                                            }
                                                        })}
                                                    />
                                                ))
                                        )}
                                    </AnimatePresence>
                                </div>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>

                {/* Audit Note */}
                <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-white flex items-start gap-4 shadow-xl shadow-slate-200/10">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center shrink-0">
                        <Info className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold mb-1 uppercase italic">Política de Retenção de Dados</h3>
                        <p className="text-slate-400 text-sm font-medium leading-relaxed">
                            Os itens na lixeira permanecem disponíveis para recuperação por até 30 dias. Após este período, o sistema poderá realizar a purga automática para conformidade com normas de proteção de dados. Registos de transações financeiras permanecem no histórico de auditoria mesmo após a eliminação definitiva.
                        </p>
                    </div>
                </div>
            </div>

            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={closeAlert}
                title={alertConfig.title}
                description={alertConfig.description}
                type={alertConfig.type}
                onConfirm={alertConfig.onConfirm}
            />
        </MainLayout>
    );
};

interface DeletedItemCardProps {
    title: string;
    subtitle: string;
    date: Date;
    author: string;
    onRestore: () => void;
    onDelete: () => void;
}

const DeletedItemCard = ({ title, subtitle, date, author, onRestore, onDelete }: DeletedItemCardProps) => (
    <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-3xl border border-border p-6 shadow-sm hover:shadow-md transition-all group"
    >
        <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center group-hover:bg-primary/5 transition-colors">
                <Trash2 className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full w-9 h-9 border-border hover:border-emerald-200 hover:bg-emerald-500/10 hover:text-emerald-500 transition-all active:scale-95"
                    onClick={onRestore}
                    title="Restaurar"
                >
                    <RotateCcw className="w-4 h-4" />
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full w-9 h-9 border-border hover:border-red-200 hover:bg-red-500/10 hover:text-red-500 transition-all active:scale-95"
                    onClick={onDelete}
                    title="Apagar Definitivamente"
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            </div>
        </div>

        <div className="space-y-1 mb-4">
            <h3 className="font-black text-foreground tracking-tight leading-tight line-clamp-1">{title}</h3>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{subtitle}</p>
        </div>

        <div className="pt-4 border-t border-border flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                <Calendar className="w-3 h-3" />
                {date && !isNaN(new Date(date).getTime()) ? format(new Date(date), "dd 'de' MMMM', às ' HH:mm", { locale: ptBR }) : 'Desconhecido'}
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                <User className="w-3 h-3" />
                Por: {author}
            </div>
        </div>

        <div className="mt-4 flex items-center gap-2 bg-amber-500/10 rounded-xl p-3 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
            <span className="text-[9px] font-black text-amber-500 uppercase tracking-tighter leading-none">Pendente de Purga</span>
        </div>
    </motion.div>
);

export default Lixeira;
