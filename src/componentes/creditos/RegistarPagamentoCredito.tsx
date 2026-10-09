import { useMemo } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { AssistentePagamento } from '@/componentes/pagamentos/AssistentePagamento';
import { usePagamentos } from '@/componentes/pagamentos/usePagamentos';
import { useToast } from '@/componentes/ui/use-toast';

/**
 * Registo de pagamento a partir de Créditos (tabela, alertas e ficha): o mesmo assistente da página de Pagamentos,
 * com a mesma imputação (mora, juros e capital da prestação mais antiga), recibo e lançamento contabilístico.
 * Só fica montado enquanto está aberto, para não carregar os pagamentos sem necessidade.
 */
export function RegistarPagamentoCredito({ creditId, onClose, onDone }: { creditId: string | null; onClose: () => void; onDone?: () => void }) {
    if (!creditId) return null;
    return <Assistente creditId={creditId} onClose={onClose} onDone={onDone} />;
}

function Assistente({ creditId, onClose, onDone }: { creditId: string; onClose: () => void; onDone?: () => void }) {
    const { user } = useAuth();
    const { addPayment } = useData() as any;
    const data = usePagamentos();
    const { toast } = useToast();
    const actor = useMemo(() => ({ ...(user as any), id: user?.id || 'system', name: user?.name || 'Sistema', role: user?.role || 'manager' }), [user]);
    return (
        <AssistentePagamento
            open onOpenChange={open => { if (!open) onClose(); }} initialCreditId={creditId}
            credits={data.credits} clients={data.clients} rows={data.rows} numbers={data.numbers} actor={actor}
            onRegisterConfirmed={payment => addPayment(payment, { id: actor.id, name: actor.name })}
            onDone={({ payment, pending }) => {
                toast({ title: pending ? 'Pagamento registado como pendente' : 'Pagamento registado', description: pending ? 'Fica pendente de validação até alguém confirmar a entrada no banco.' : `Recibo emitido para ${payment.clientName}.` });
                onClose();
                onDone?.();
            }}
        />
    );
}
