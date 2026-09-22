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
import { Client, Credit } from '@/tipos/credito';
import { Download, Search, Calendar, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/bibliotecas/formatters';
import { format, isPast } from 'date-fns';
import { pt } from 'date-fns/locale';

interface ActiveClientsModalProps {
    isOpen: boolean;
    onClose: () => void;
    clients: Client[];
    credits: Credit[];
    onExportPDF: () => void;
}

export function ActiveClientsModal({
    isOpen,
    onClose,
    clients,
    credits,
    onExportPDF,
}: ActiveClientsModalProps) {
    const [searchTerm, setSearchTerm] = useState('');

    // Filtrar clientes com créditos ativos
    const activeClientsData = useMemo(() => {
        const activeCredits = credits.filter(
            c => ['active', 'overdue', 'renegotiated', 'defaulted'].includes(c.status) && (Number(c.currentBalance) || 0) > 0.1
        );

        // Agrupar por cliente
        const clientMap = new Map<string, {
            client: Client;
            activeCredits: Credit[];
            totalDue: number;
            nextDueDate: Date | null;
            oldestCreditDate: Date | null;
            hasOverdue: boolean;
        }>();

        activeCredits.forEach(credit => {
            const client = clients.find(c => c.id === credit.clientId);
            if (!client) return;

            if (!clientMap.has(client.id)) {
                clientMap.set(client.id, {
                    client,
                    activeCredits: [],
                    totalDue: 0,
                    nextDueDate: null,
                    oldestCreditDate: null,
                    hasOverdue: false,
                });
            }

            const data = clientMap.get(client.id)!;
            data.activeCredits.push(credit);
            data.totalDue += credit.totalDue;

            // Verificar se tem atraso
            if (credit.status === 'overdue') {
                data.hasOverdue = true;
            }

            // Data do crédito mais antigo
            const creditDate = new Date(credit.createdAt);
            if (!data.oldestCreditDate || creditDate < data.oldestCreditDate) {
                data.oldestCreditDate = creditDate;
            }

            // Próxima data de vencimento (mais próxima)
            if (credit.nextDueDate) {
                const dueDate = new Date(credit.nextDueDate);
                if (!data.nextDueDate || dueDate < data.nextDueDate) {
                    data.nextDueDate = dueDate;
                }
            }
        });

        return Array.from(clientMap.values());
    }, [clients, credits]);

    // Filtrar por pesquisa
    const filteredClients = useMemo(() => {
        return activeClientsData.filter(({ client }) =>
            client.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [activeClientsData, searchTerm]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                        ✅ Clientes Ativos ({activeClientsData.length})
                    </DialogTitle>
                    <DialogDescription>
                        Clientes com contratos de crédito ativos no sistema
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
                                <TableHead className="text-center">Contratos Ativos</TableHead>
                                <TableHead className="text-center">Início</TableHead>
                                <TableHead className="text-center">Próximo Vencimento</TableHead>
                                <TableHead className="text-right">Valor em Dívida</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredClients.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        {searchTerm ? 'Nenhum cliente encontrado' : 'Nenhum cliente ativo'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredClients.map(({ client, activeCredits, totalDue, nextDueDate, oldestCreditDate, hasOverdue }) => (
                                    <TableRow key={client.id}>
                                        <TableCell className="font-medium">
                                            <div>
                                                <div className="font-bold">{client.name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {client.phone || 'Sem telefone'}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline" className="font-mono font-bold">
                                                {activeCredits.length}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <div className="flex items-center justify-center gap-1 text-xs">
                                                <Calendar className="h-3 w-3 text-muted-foreground" />
                                                {oldestCreditDate
                                                    ? format(oldestCreditDate, 'dd/MM/yyyy', { locale: pt })
                                                    : 'N/A'
                                                }
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {nextDueDate ? (
                                                <div className={`text-xs font-medium ${isPast(nextDueDate) ? 'text-red-600' : 'text-slate-600'}`}>
                                                    {format(nextDueDate, 'dd/MM/yyyy', { locale: pt })}
                                                    {isPast(nextDueDate) && (
                                                        <div className="text-[10px] text-red-500 flex items-center justify-center gap-1 mt-1">
                                                            <AlertCircle className="h-3 w-3" />
                                                            Vencido
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">N/A</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="font-bold text-primary">
                                                {formatCurrency(totalDue)}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {hasOverdue ? (
                                                <Badge variant="destructive" className="gap-1">
                                                    <AlertCircle className="h-3 w-3" />
                                                    Atrasado
                                                </Badge>
                                            ) : (
                                                <Badge variant="default" className="bg-green-600">
                                                    Em Dia
                                                </Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Estatísticas Resumidas */}
                <div className="grid grid-cols-4 gap-4 mt-4 p-4 bg-muted/30 rounded-lg">
                    <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                            {activeClientsData.filter(c => !c.hasOverdue).length}
                        </div>
                        <div className="text-xs text-muted-foreground">Em Dia</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">
                            {activeClientsData.filter(c => c.hasOverdue).length}
                        </div>
                        <div className="text-xs text-muted-foreground">Com Atrasos</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-primary">
                            {activeClientsData.reduce((sum, c) => sum + c.activeCredits.length, 0)}
                        </div>
                        <div className="text-xs text-muted-foreground">Total Contratos</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">
                            {formatCurrency(activeClientsData.reduce((sum, c) => sum + c.totalDue, 0))}
                        </div>
                        <div className="text-xs text-muted-foreground">Total em Dívida</div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
