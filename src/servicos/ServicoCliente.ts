import { Client } from '@/tipos/credito';
import { RepositorioCliente } from '@/repositorios/RepositorioCliente';
import { db } from '@/bibliotecas/bd';
import { clientCategoryOf } from '@/bibliotecas/carteira-cliente';
import { atribuirNumerosEmFalta, prefixoCliente, proximoNumeroCliente } from '@/bibliotecas/numero-cliente';

export class ServicoCliente {
    private static safeStr(val: any): string {
        return JSON.stringify(val || []);
    }

    static async getAll(): Promise<Client[]> {
        const rows = await RepositorioCliente.findAll();
        return rows.map(c => this.mapRowToClient(c));
    }

    static async getDeleted(): Promise<Client[]> {
        const rows = await RepositorioCliente.findDeleted();
        return rows.map(c => this.mapRowToClient(c));
    }

    private static mapRowToClient(c: any): Client {
        return {
            ...c,
            clientCategory: clientCategoryOf(c),
            clientType: c.clientType || undefined,
            documentType: c.documentType || undefined,
            countryCode: c.countryCode || undefined,
            nationality: c.nationality || undefined,
            passportFormatValidated: Boolean(c.passportFormatValidated),
            createdAt: new Date(c.createdAt),
            deletedAt: c.deletedAt ? new Date(c.deletedAt) : undefined,
            restoredAt: c.restoredAt ? new Date(c.restoredAt) : undefined,
            documents: JSON.parse(c.documents || '[]'),
            bankCoordinates: JSON.parse(c.bankCoordinates || '[]'),
            receiveMethod: c.receiveMethod || 'transfer',
            lastContacted: c.lastContacted ? new Date(c.lastContacted) : undefined
        };
    }

    static async add(client: Client): Promise<void> {
        await RepositorioCliente.insert(client);
    }

    /** Todos os números de cliente já usados (também de clientes apagados: nunca se reutilizam). */
    private static async numerosUsados() {
        const rows = await db.all<{ clientNumber: string }>('SELECT clientNumber FROM clients WHERE clientNumber IS NOT NULL').catch(() => [] as Array<{ clientNumber: string }>);
        return rows.map(r => r.clientNumber);
    }

    /** Atribui o n.º ao cliente acabado de cadastrar (00 + ano + mês + sequência do mês). */
    static async atribuirNumero(id: string, createdAt: Date | string): Promise<string> {
        const numero = proximoNumeroCliente(prefixoCliente(createdAt), await this.numerosUsados());
        await db.run('UPDATE clients SET clientNumber = ? WHERE id = ? AND clientNumber IS NULL', [numero, id]);
        return numero;
    }

    /** Clientes ainda sem número (cadastrados antes desta versão): recebem-no pela ordem de cadastro. */
    static async atribuirNumerosEmFalta(): Promise<Array<{ id: string; numero: string }>> {
        const rows = await db.all<{ id: string; createdAt: string; clientNumber: string | null }>('SELECT id, createdAt, clientNumber FROM clients').catch(() => [] as Array<{ id: string; createdAt: string; clientNumber: string | null }>);
        const { atribuidos, semEspaco } = atribuirNumerosEmFalta(rows);
        if (semEspaco.length) console.warn(`[Clientes] ${semEspaco.length} cliente(s) sem n.º: o mês de cadastro já tem 99 números.`);
        if (!atribuidos.length) return [];
        await db.transaction(atribuidos.map(a => ({ sql: 'UPDATE clients SET clientNumber = ? WHERE id = ? AND clientNumber IS NULL', params: [a.numero, a.id] })));
        return atribuidos;
    }

    static async update(id: string, updates: Partial<Client>): Promise<void> {
        await RepositorioCliente.update(id, updates);
    }

    /**
     * Crédito usado, disponível e estado recalculados a partir dos créditos e pagamentos deste dispositivo: gravados só
     * aqui. Cada dispositivo calcula os seus; a sincronização leva os créditos e os pagamentos, não estes totais.
     */
    static async updateDerived(id: string, derived: Pick<Client, 'usedCredit' | 'availableCredit' | 'status'>): Promise<void> {
        await db.runLocal('UPDATE clients SET usedCredit = ?, availableCredit = ?, status = ? WHERE id = ?',
            [Number(derived.usedCredit) || 0, Number(derived.availableCredit) || 0, derived.status, id]);
    }

    static async delete(id: string, userId: string, withCredits = true): Promise<void> {
        const clients = await this.getAll();
        const client = clients.find(c => c.id === id);
        const originalState = client ? JSON.stringify(client) : undefined;
        await RepositorioCliente.softDelete(id, userId, originalState, withCredits);
    }

    static async restore(id: string): Promise<void> {
        await RepositorioCliente.restore(id);
    }

    static async hardDelete(id: string, userId: string): Promise<void> {
        await RepositorioCliente.purge(id, userId);
    }
}




