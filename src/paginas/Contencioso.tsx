import { useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/componentes/ui/table';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import {
    Search,
    Scale,
    FileWarning,
    Gavel,
    History,
    MoreHorizontal,
    Pencil,
    Trash
} from 'lucide-react';
import { formatCurrency } from '@/bibliotecas/formatters';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/componentes/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/componentes/ui/dialog";
import { LegalCaseForm } from '@/componentes/forms/LegalCaseForm';
import { LegalCase } from '@/tipos/contencioso';

export default function Contencioso() {
    const { clients, credits, legalCases, addLegalCase, updateLegalCase, deleteLegalCase } = useData();
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCase, setEditingCase] = useState<LegalCase | undefined>(undefined);

    const filteredCases = legalCases.filter(c => {
        const client = clients.find(cl => cl.id === c.clientId);
        const clientName = client ? client.name : '';
        return (
            clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.creditId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.id.toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    const getStageBadge = (stage: string) => {
        switch (stage) {
            case 'interpellated': return <Badge variant="warning" className="text-[10px] uppercase">Interpelação</Badge>;
            case 'mediation': return <Badge variant="secondary" className="text-[10px] uppercase">Mediação / CMC</Badge>;
            case 'court': return <Badge variant="destructive" className="text-[10px] uppercase">Tribunal / Comarca</Badge>;
            case 'closed': return <Badge variant="success" className="text-[10px] uppercase">Fechado / Recuperado</Badge>;
            default: return <Badge variant="outline" className="text-[10px] uppercase">{stage}</Badge>;
        }
    };

    const handleCreate = async (data: any) => {
        try {
            await addLegalCase(data);
            setIsModalOpen(false);
        } catch (error) {
            console.error("Erro ao criar processo:", error);
        }
    };

    const handleUpdate = async (data: any) => {
        if (!editingCase) return;
        try {
            await updateLegalCase(editingCase.id, data);
            setEditingCase(undefined);
            setIsModalOpen(false);
        } catch (error) {
            console.error("Erro ao atualizar processo:", error);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Deseja mover este processo para a lixeira? Poderá restaurá-lo mais tarde se necessário.')) {
            await deleteLegalCase(id, user!);
        }
    };

    const openEditModal = (legalCase: LegalCase) => {
        setEditingCase(legalCase);
        setIsModalOpen(true);
    };

    const openCreateModal = () => {
        setEditingCase(undefined);
        setIsModalOpen(true);
    };

    // Statistics
    const criticalCount = legalCases.filter(c => c.priority === 'critical' && c.stage !== 'closed').length;
    const interpellatedCount = legalCases.filter(c => c.stage === 'interpellated').length;
    const mediationCount = legalCases.filter(c => c.stage === 'mediation').length;
    const now = new Date();
    const recoveredThisMonth = legalCases
        .filter(c => {
            if (c.stage !== 'closed' || !c.closedAt) return false;
            const closedAt = new Date(c.closedAt);
            return closedAt.getMonth() === now.getMonth() && closedAt.getFullYear() === now.getFullYear();
        })
        .reduce((sum, c) => sum + Number(c.debtAmount || 0), 0);

    return (
        <MainLayout title="Contencioso Jurídico" subtitle="Gestão de processos de cobrança e recuperação judicial">
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Pesquisar processos ou créditos..."
                            className="pl-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button className="gap-2 bg-red-600 hover:bg-red-700 text-white" onClick={openCreateModal}>
                            <Scale className="h-4 w-4" /> Novo Processo
                        </Button>
                    </div>
                </div>

                {/* Cards Estilo Pastel Arredondado */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    {/* 1. Críticos (Coral / Rosa #FDA4AF) */}
                    <div className="card-kpi-coral">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <FileWarning className="h-5 w-5" />
                                </div>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                    Críticos
                                </p>
                            </div>
                        </div>

                        <div className="my-2">
                            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                {criticalCount}
                            </p>
                        </div>

                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                            Processos em risco extremo
                        </p>
                    </div>

                    {/* 2. Interpelações (Dourado / Âmbar #FED771) */}
                    <div className="card-kpi-amber">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <Scale className="h-5 w-5" />
                                </div>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                    Interpelações
                                </p>
                            </div>
                        </div>

                        <div className="my-2">
                            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                {interpellatedCount}
                            </p>
                        </div>

                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                            Notificações extrajudiciais
                        </p>
                    </div>

                    {/* 3. Em Mediação (Púrpura / Lavanda #E99EFE) */}
                    <div className="card-kpi-purple">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <Gavel className="h-5 w-5" />
                                </div>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                    Em Mediação
                                </p>
                            </div>
                        </div>

                        <div className="my-2">
                            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                {mediationCount}
                            </p>
                        </div>

                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                            Negociação CMC / Tribunal
                        </p>
                    </div>

                    {/* 4. Recuperado Mês (Verde Menta #86EFAC) */}
                    <div className="card-kpi-mint">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <History className="h-5 w-5" />
                                </div>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                    Recuperado (Mês)
                                </p>
                            </div>
                        </div>

                        <div className="my-2">
                            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(recoveredThisMonth)}>
                                {formatCurrency(recoveredThisMonth)}
                            </p>
                        </div>

                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                            Montante recuperado no período
                        </p>
                    </div>
                </div>

                <div className="card-elevated overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/30">
                                <TableHead>Ref / Crédito</TableHead>
                                <TableHead>Devedor</TableHead>
                                <TableHead>Dívida Total</TableHead>
                                <TableHead>Fase Atual</TableHead>
                                <TableHead>Última Diligência</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredCases.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        Nenhum processo encontrado.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredCases.map((c) => {
                                    const client = clients.find(cl => cl.id === c.clientId);
                                    return (
                                        <TableRow key={c.id} className="hover:bg-red-50/20 transition-colors">
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-bold">{c.id}</span>
                                                    <span className="text-xs text-muted-foreground uppercase">{c.creditId}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-semibold">{client?.name || 'Cliente Removido'}</TableCell>
                                            <TableCell className="font-mono text-red-600 font-bold">{formatCurrency(c.debtAmount)}</TableCell>
                                            <TableCell>{getStageBadge(c.stage)}</TableCell>
                                            <TableCell className="max-w-[180px] truncate text-xs italic text-slate-500">
                                                {c.lastAction || '-'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem className="gap-2" onClick={() => openEditModal(c)}>
                                                            <Pencil className="h-4 w-4" /> Editar
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="gap-2 text-red-600"
                                                            onClick={() => handleDelete(c.id)}
                                                        >
                                                            <Trash className="h-4 w-4" /> Remover
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingCase ? 'Editar Processo' : 'Novo Processo'}</DialogTitle>
                        <DialogDescription>
                            {editingCase ? 'Atualize o estado e as diligências do processo.' : 'Inicie um novo processo de contencioso para recuperação de crédito.'}
                        </DialogDescription>
                    </DialogHeader>
                    <LegalCaseForm
                        onSubmit={editingCase ? handleUpdate : handleCreate}
                        onCancel={() => setIsModalOpen(false)}
                        clients={clients}
                        credits={credits}
                        initialData={editingCase}
                    />
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}
