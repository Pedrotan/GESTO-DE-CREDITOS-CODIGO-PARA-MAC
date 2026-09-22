import React, { useState, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/componentes/ui/table';
import { Badge } from '@/componentes/ui/badge';
import { Client } from '@/tipos/credito';
import { Download, Search, ShieldAlert, Unlock } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useAuth } from '@/contextos/ContextoAutenticacao';

interface BlockedClientsModalProps {
    isOpen: boolean;
    onClose: () => void;
    clients: Client[];
    onUnblockClient: (clientId: string) => void;
    onExportPDF: () => void;
}

export function BlockedClientsModal({
    isOpen,
    onClose,
    clients,
    onUnblockClient,
    onExportPDF,
}: BlockedClientsModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const { user } = useAuth();
    const isSuperAdmin = user?.role === 'super_admin';

    // Filtrar clientes bloqueados
    const blockedClients = useMemo(() => {
        return clients.filter(c => c.blocked === true);
    }, [clients]);

    // Filtrar por pesquisa
    const filteredClients = useMemo(() => {
        return blockedClients.filter(client =>
            client.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [blockedClients, searchTerm]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                        🚫 Clientes Bloqueados ({blockedClients.length})
                    </DialogTitle>
                    <DialogDescription>
                        Lista de clientes bloqueados no sistema com motivos e ações
                    </DialogDescription>
                </DialogHeader>

                {/* Barra de Ferramentas */}
                <div className="flex items-center gap-4 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Pesquisar por nome..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <Button onClick={onExportPDF} variant="outline" className="gap-2">
                        <Download className="h-4 w-4" />
                        Exportar PDF
                    </Button>
                </div>

                {/* Tabela */}
                <div className="border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Motivo do Bloqueio</TableHead>
                                <TableHead className="text-center">Data de Bloqueio</TableHead>
                                <TableHead className="text-center">Bloqueado Por</TableHead>
                                {isSuperAdmin && <TableHead className="text-center">Ações</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredClients.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={isSuperAdmin ? 5 : 4} className="text-center py-8 text-muted-foreground">
                                        {searchTerm ? 'Nenhum cliente encontrado' : 'Nenhum cliente bloqueado'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredClients.map(client => (
                                    <TableRow key={client.id}>
                                        <TableCell className="font-medium">
                                            <div>
                                                <div className="font-bold flex items-center gap-2">
                                                    <ShieldAlert className="h-4 w-4 text-red-500" />
                                                    {client.name}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {client.phone || 'Sem telefone'}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="max-w-md">
                                                <Badge variant="destructive" className="mb-1">
                                                    Bloqueado
                                                </Badge>
                                                <p className="text-sm text-muted-foreground">
                                                    {client.blockReason || 'Motivo não especificado'}
                                                </p>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <div className="text-xs">
                                                {client.blockedAt
                                                    ? format(new Date(client.blockedAt), 'dd/MM/yyyy HH:mm', { locale: pt })
                                                    : 'N/A'
                                                }
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <div className="text-xs font-medium">
                                                {client.blockedBy || 'Sistema'}
                                            </div>
                                        </TableCell>
                                        {isSuperAdmin && (
                                            <TableCell className="text-center">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="gap-2 text-green-600 border-green-300 hover:bg-green-50"
                                                    onClick={() => onUnblockClient(client.id)}
                                                >
                                                    <Unlock className="h-3 w-3" />
                                                    Desbloquear
                                                </Button>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Estatísticas Resumidas */}
                {blockedClients.length > 0 && (
                    <div className="grid grid-cols-3 gap-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-red-600">
                                {blockedClients.length}
                            </div>
                            <div className="text-xs text-muted-foreground">Total Bloqueados</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-orange-600">
                                {blockedClients.filter(c => c.blockReason?.toLowerCase().includes('atraso')).length}
                            </div>
                            <div className="text-xs text-muted-foreground">Por Atrasos</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-slate-600">
                                {blockedClients.filter(c => !c.blockReason || !c.blockReason.toLowerCase().includes('atraso')).length}
                            </div>
                            <div className="text-xs text-muted-foreground">Outros Motivos</div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
