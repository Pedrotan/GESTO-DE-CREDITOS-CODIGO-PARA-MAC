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
    Plus,
    ShieldCheck,
    FileText,
    Camera,
    MapPin,
    MoreHorizontal,
    ExternalLink,
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
import { WarrantyForm } from '@/componentes/forms/WarrantyForm';
import { Warranty } from '@/tipos/contencioso';

export default function Garantias() {
    const { clients, credits, warranties, addWarranty, updateWarranty, deleteWarranty } = useData();
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingWarranty, setEditingWarranty] = useState<Warranty | undefined>(undefined);

    const filteredWarranties = warranties.filter(w => {
        const client = clients.find(c => c.id === w.clientId);
        const clientName = client ? client.name : '';
        return (
            w.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
            clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            w.type.toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    const handleCreate = async (data: any) => {
        try {
            await addWarranty(data);
            setIsModalOpen(false);
        } catch (error) {
            console.error("Erro ao criar garantia:", error);
        }
    };

    const handleUpdate = async (data: any) => {
        if (!editingWarranty) return;
        try {
            await updateWarranty(editingWarranty.id, data);
            setEditingWarranty(undefined);
            setIsModalOpen(false);
        } catch (error) {
            console.error("Erro ao atualizar garantia:", error);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Deseja mover esta garantia para a lixeira? Poderá restaurá-la mais tarde se necessário.')) {
            await deleteWarranty(id, user!);
        }
    };

    const openEditModal = (warranty: Warranty) => {
        setEditingWarranty(warranty);
        setIsModalOpen(true);
    };

    const openCreateModal = () => {
        setEditingWarranty(undefined);
        setIsModalOpen(true);
    };

    const totalValue = warranties
        .filter(w => w.status === 'active')
        .reduce((sum, w) => sum + w.marketValue, 0);

    return (
        <MainLayout title="Gestão de Garantias" subtitle="Monitorização de colaterais e bens em custódia">
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Pesquisar garantias ou clientes..."
                            className="pl-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button className="gap-2" onClick={openCreateModal}>
                        <Plus className="h-4 w-4" /> Nova Garantia
                    </Button>
                </div>

                {/* Cards Estilo Pastel Arredondado */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {/* 1. Total Garantias (Azul Céu #82C9FF) */}
                    <div className="card-kpi-sky">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <ShieldCheck className="h-5 w-5" />
                                </div>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                    Total Garantias
                                </p>
                            </div>
                        </div>

                        <div className="my-2">
                            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                {warranties.length}
                            </p>
                        </div>

                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                            Bens e colaterais registados
                        </p>
                    </div>

                    {/* 2. Valor em Custódia (Verde Menta #86EFAC) */}
                    <div className="card-kpi-mint">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                    Valor em Custódia
                                </p>
                            </div>
                        </div>

                        <div className="my-2">
                            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(totalValue)}>
                                {formatCurrency(totalValue)}
                            </p>
                        </div>

                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                            Avaliação total das garantias ativas
                        </p>
                    </div>

                    {/* 3. Vistorias Pendentes (Dourado / Âmbar #FED771) */}
                    <div className="card-kpi-amber">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <Camera className="h-5 w-5" />
                                </div>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                    Vistorias Pendentes
                                </p>
                            </div>
                        </div>

                        <div className="my-2">
                            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                0
                            </p>
                        </div>

                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                            Inspeções a serem realizadas
                        </p>
                    </div>
                </div>

                <div className="card-elevated overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ID / Tipo</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Descrição do Bem</TableHead>
                                <TableHead>Valor de Mercado</TableHead>
                                <TableHead>Localização</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredWarranties.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        Nenhuma garantia encontrada.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredWarranties.map((w) => {
                                    const client = clients.find(c => c.id === w.clientId);
                                    return (
                                        <TableRow key={w.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-bold">{w.id}</span>
                                                    <span className="text-xs text-muted-foreground uppercase">{w.type}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium">{client?.name || 'Cliente Removido'}</TableCell>
                                            <TableCell className="max-w-[200px] truncate" title={w.description}>
                                                {w.description}
                                            </TableCell>
                                            <TableCell className="font-mono">{formatCurrency(w.marketValue)}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1 text-xs">
                                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                                    {w.location || 'N/A'}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={w.status === 'active' ? 'success' : w.status === 'seized' ? 'destructive' : 'secondary'}
                                                    className="text-[10px] uppercase"
                                                >
                                                    {w.status === 'active' ? 'Ativo' : w.status === 'seized' ? 'Apreendido' : 'Libertado'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem className="gap-2" onClick={() => openEditModal(w)}>
                                                            <Pencil className="h-4 w-4" /> Editar
                                                        </DropdownMenuItem>
                                                        {/* <DropdownMenuItem className="gap-2">
                                                            <Camera className="h-4 w-4" /> Anexar Fotos
                                                        </DropdownMenuItem> */}
                                                        <DropdownMenuItem
                                                            className="gap-2 text-red-600 focus:text-red-600"
                                                            onClick={() => handleDelete(w.id)}
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
                        <DialogTitle>{editingWarranty ? 'Editar Garantia' : 'Nova Garantia'}</DialogTitle>
                        <DialogDescription>
                            {editingWarranty ? 'Atualize os detalhes da garantia / colateral.' : 'Registe um novo bem como garantia ou colateral.'}
                        </DialogDescription>
                    </DialogHeader>
                    <WarrantyForm
                        onSubmit={editingWarranty ? handleUpdate : handleCreate}
                        onCancel={() => setIsModalOpen(false)}
                        clients={clients}
                        credits={credits}
                        initialData={editingWarranty}
                    />
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}
