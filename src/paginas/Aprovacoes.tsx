import { useState, useEffect } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { formatCurrency, formatDate } from '@/bibliotecas/formatters';
import { Button } from '@/componentes/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/componentes/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/componentes/ui/table';
import { Badge } from '@/componentes/ui/badge';
import { CheckCircle, XCircle, AlertCircle, Check, X } from 'lucide-react';
import { useToast } from '@/componentes/ui/use-toast';
import { AlertModal, AlertModalType } from '@/componentes/ui/AlertModal';

export default function Approvals() {
    const { user } = useAuth();
    const { credits, approveCredit, rejectCredit, addNotification } = useData();
    const { toast } = useToast();
    const [processing, setProcessing] = useState<string | null>(null);

    // Estado da Modal de Alerta
    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        type: AlertModalType;
    }>({
        isOpen: false,
        title: '',
        description: '',
        type: 'success'
    });

    const pendingApprovals = credits.filter(c => c.status === 'pending_approval');

    const handleApprove = async (creditId: string) => {
        if (!user) return;
        setProcessing(creditId);
        try {
            await approveCredit(creditId, user.id, user.name);
            setAlertConfig({
                isOpen: true,
                title: "Crédito Aprovado",
                description: "O crédito foi aprovado com sucesso.",
                type: "success"
            });
        } catch (error: any) {
            setAlertConfig({
                isOpen: true,
                title: "Erro",
                description: error.message || "Não foi possível aprovar o crédito.",
                type: "error"
            });
            console.error(error);
        } finally {
            setProcessing(null);
        }
    };

    const handleReject = async (creditId: string) => {
        if (!user) return;
        setProcessing(creditId);
        try {
            await rejectCredit(creditId, user.id, user.name);
            setAlertConfig({
                isOpen: true,
                title: "Crédito Rejeitado",
                description: "O crédito foi rejeitado.",
                type: "warning"
            });
        } catch (error: any) {
            setAlertConfig({
                isOpen: true,
                title: "Erro",
                description: error.message || "Não foi possível rejeitar o crédito.",
                type: "error"
            });
        } finally {
            setProcessing(null);
        }
    };

    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return (
            <MainLayout title="Aprovações" subtitle="Acesso restrito">
                <div className="flex items-center justify-center h-[60vh]">
                    <p className="text-muted-foreground">Acesso restrito a Administradores do Sistema.</p>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout title="Aprovações de Crédito" subtitle="Gestão de solicitações pendentes">
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Aprovações Pendentes</h1>
                    <p className="text-muted-foreground">Revise e aprove ou rejeite créditos que excedem os limites de transação.</p>
                </div>

                {pendingApprovals.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-16">
                            <CheckCircle className="h-16 w-16 text-success mb-4" />
                            <h3 className="text-xl font-semibold mb-2">Nenhuma Aprovação Pendente</h3>
                            <p className="text-muted-foreground text-center">
                                Todas as solicitações de crédito foram processadas! Não existe pedidos pendentes. 
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <AlertCircle className="h-5 w-5 text-warning" />
                                {pendingApprovals.length} Solicitação{pendingApprovals.length === 1 ? 'ão' : 'ões'} Aguardando Revisão
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Valor Principal</TableHead>
                                        <TableHead>Taxa de Juro</TableHead>
                                        <TableHead>Data de Vencimento</TableHead>
                                        <TableHead>Solicitado Por</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pendingApprovals.map((credit) => (
                                        <TableRow key={credit.id}>
                                            <TableCell className="font-medium">{credit.clientName}</TableCell>
                                            <TableCell className="font-bold text-primary">{formatCurrency(credit.principalAmount)}</TableCell>
                                            <TableCell>{credit.interestRate}%</TableCell>
                                            <TableCell>{formatDate(credit.dueDate)}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{credit.clientName || 'Sistema'}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex gap-2 justify-end">
                                                    <Button
                                                        size="sm"
                                                        variant="default"
                                                        className="gap-2 font-bold min-w-[100px]"
                                                        onClick={() => handleApprove(credit.id)}
                                                        disabled={processing === credit.id}
                                                    >
                                                        {processing === credit.id ? 'A processar...' : (
                                                            <>
                                                                <CheckCircle className="h-4 w-4" />
                                                                Confirmar
                                                            </>
                                                        )}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        className="gap-2"
                                                        onClick={() => handleReject(credit.id)}
                                                        disabled={processing === credit.id}
                                                    >
                                                        <XCircle className="h-4 w-4" />
                                                        Rejeitar
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
            </div>
            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
                title={alertConfig.title}
                description={alertConfig.description}
                type={alertConfig.type}
            />
        </MainLayout>
    );
}




