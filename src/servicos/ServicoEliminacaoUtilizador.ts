import { db } from '@/bibliotecas/bd';
import type { ClienteUtilizador, CreditoUtilizador, LevantamentoUtilizador, PagamentoUtilizador, RegistoAuditoria } from '@/bibliotecas/relatorio-utilizador-eliminado';

const lista = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);

/** Tudo o que o utilizador fez no sistema (lido antes de o eliminar; as operações ficam onde estão). */
export class ServicoEliminacaoUtilizador {
    static async levantamento(u: { id: string; name: string; email?: string | null; role?: string | null; createdAt?: string | Date | null }, roleLabel?: string): Promise<LevantamentoUtilizador> {
        const [creditos, pagamentosRecebidos, pagamentosDosCreditos, clientes, auditoria] = await Promise.all([
            lista(db.all<CreditoUtilizador>(`SELECT id, clientId, clientName, creditNumber, principalAmount, totalDue, currentBalance, installments, paidInstallments, status, createdAt, dueDate, paidAt
                FROM credits WHERE usuario_id = ? AND deletedAt IS NULL ORDER BY createdAt`, [u.id])),
            lista(db.all<PagamentoUtilizador>(`SELECT id, creditId, clientName, amount, paymentDate, method, status FROM payments WHERE usuario_id = ? AND deletedAt IS NULL ORDER BY paymentDate`, [u.id])),
            lista(db.all<PagamentoUtilizador>(`SELECT p.id, p.creditId, p.clientName, p.amount, p.paymentDate, p.method, p.status FROM payments p JOIN credits c ON c.id = p.creditId
                WHERE c.usuario_id = ? AND p.deletedAt IS NULL ORDER BY p.paymentDate`, [u.id])),
            lista(db.all<ClienteUtilizador>('SELECT id, name, nif, createdAt FROM clients WHERE usuario_id = ? AND deletedAt IS NULL ORDER BY createdAt', [u.id])),
            lista(db.all<RegistoAuditoria>('SELECT id, timestamp, action, entity, details, metadata, userName FROM audit_logs WHERE userId = ? ORDER BY timestamp', [u.id])),
        ]);
        return {
            utilizador: { id: u.id, name: u.name, email: u.email, role: u.role, roleLabel, createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : auditoria[0]?.timestamp || null },
            creditos, pagamentosRecebidos, pagamentosDosCreditos, clientes, auditoria,
        };
    }
}
