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
import { Client, Credit, Payment } from '@/tipos/credito';
import { calculateClientScore, renderStars, getRatingColor } from '@/bibliotecas/clientScoring';
import { Download, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency } from '@/bibliotecas/formatters';

interface ClientDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    clients: Client[];
    credits: Credit[];
    payments: Payment[];
    onExportPDF: () => void;
}

export function ClientDetailsModal({
    isOpen,
    onClose,
    clients,
    credits,
    payments,
    onExportPDF,
}: ClientDetailsModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<'score' | 'name'>('score');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    // Calcular scores para todos os clientes
    const clientsWithScores = useMemo(() => {
        return clients.map(client => ({
            client,
            scoreData: calculateClientScore(client, credits, payments),
        }));
    }, [clients, credits, payments]);

    // Filtrar e ordenar
    const filteredAndSortedClients = useMemo(() => {
        let filtered = clientsWithScores.filter(({ client }) =>
            client.name.toLowerCase().includes(searchTerm.toLowerCase())
        );

        // Ordenar
        filtered.sort((a, b) => {
            if (sortBy === 'score') {
                return sortOrder === 'desc'
                    ? b.scoreData.score - a.scoreData.score
                    : a.scoreData.score - b.scoreData.score;
            } else {
                const nameA = a.client.name.toLowerCase();
                const nameB = b.client.name.toLowerCase();
                if (sortOrder === 'asc') {
                    return nameA.localeCompare(nameB);
                } else {
                    return nameB.localeCompare(nameA);
                }
            }
        });

        return filtered;
    }, [clientsWithScores, searchTerm, sortBy, sortOrder]);

    const toggleSort = (column: 'score' | 'name') => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder(column === 'score' ? 'desc' : 'asc');
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                        📊 Total de Clientes ({clients.length})
                    </DialogTitle>
                    <DialogDescription>
                        Visão detalhada de todos os clientes com pontuação de pagamentos e histórico
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
                                <TableHead
                                    className="cursor-pointer hover:bg-muted/50"
                                    onClick={() => toggleSort('name')}
                                >
                                    <div className="flex items-center gap-2">
                                        Cliente
                                        {sortBy === 'name' && (
                                            sortOrder === 'asc' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />
                                        )}
                                    </div>
                                </TableHead>
                                <TableHead className="text-center">Créditos</TableHead>
                                <TableHead className="text-center">Contratos</TableHead>
                                <TableHead className="text-center">Pagamentos</TableHead>
                                <TableHead
                                    className="text-center cursor-pointer hover:bg-muted/50"
                                    onClick={() => toggleSort('score')}
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        Pontuação
                                        {sortBy === 'score' && (
                                            sortOrder === 'desc' ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />
                                        )}
                                    </div>
                                </TableHead>
                                <TableHead className="text-center">Classificação</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredAndSortedClients.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        {searchTerm ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredAndSortedClients.map(({ client, scoreData }) => (
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
                                            <Badge variant="outline" className="font-mono">
                                                {scoreData.metrics.totalCredits}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline" className="font-mono">
                                                {scoreData.metrics.totalContracts}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <div className="space-y-1">
                                                <div className="text-xs">
                                                    <span className="text-green-600 font-bold">{scoreData.metrics.paymentsOnTime}</span>
                                                    {' / '}
                                                    <span className="text-red-600 font-bold">{scoreData.metrics.latePayments}</span>
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">
                                                    Em dia / Atrasados
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <div className="space-y-1">
                                                <div className="text-2xl font-bold text-primary">
                                                    {scoreData.score}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {renderStars(scoreData.stars)}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge className={getRatingColor(scoreData.rating)}>
                                                {scoreData.rating}
                                            </Badge>
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
                            {clientsWithScores.filter(c => c.scoreData.rating === 'Excelente' || c.scoreData.rating === 'Bom').length}
                        </div>
                        <div className="text-xs text-muted-foreground">Bons Clientes</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-600">
                            {clientsWithScores.filter(c => c.scoreData.rating === 'Regular').length}
                        </div>
                        <div className="text-xs text-muted-foreground">Regulares</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">
                            {clientsWithScores.filter(c => c.scoreData.rating === 'Fraco' || c.scoreData.rating === 'Muito Fraco').length}
                        </div>
                        <div className="text-xs text-muted-foreground">Maus Pagadores</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-primary">
                            {Math.round(clientsWithScores.reduce((sum, c) => sum + c.scoreData.score, 0) / clientsWithScores.length) || 0}
                        </div>
                        <div className="text-xs text-muted-foreground">Pontuação Média</div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
