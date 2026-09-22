import { LegalCase } from '@/tipos/contencioso';
import { RepositorioContencioso } from '@/repositorios/RepositorioContencioso';
import { db } from '@/bibliotecas/bd';
import { formatCurrency } from '@/bibliotecas/formatters';

const repository = new RepositorioContencioso();

export class ServicoContencioso {
    static async getAll(): Promise<LegalCase[]> {
        return await repository.findAll();
    }

    static async getById(id: string): Promise<LegalCase | undefined> {
        return await repository.findById(id);
    }

    static async getByClientId(clientId: string): Promise<LegalCase[]> {
        return await repository.findByClientId(clientId);
    }

    static async getByCreditId(creditId: string): Promise<LegalCase[]> {
        return await repository.findByCreditId(creditId);
    }

    static async create(legalCase: Omit<LegalCase, 'id' | 'createdAt'>): Promise<LegalCase> {
        const newCase: LegalCase = {
            ...legalCase,
            id: `LC-${Date.now()}`,
            createdAt: new Date().toISOString()
        };

        await repository.insert(newCase);
        return newCase;
    }

    static async update(id: string, updates: Partial<LegalCase>): Promise<void> {
        await repository.update(id, {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    }

    static async delete(id: string, userId: string): Promise<void> {
        const cases = await this.getAll();
        const legalCase = cases.find(c => c.id === id);
        const originalState = legalCase ? JSON.stringify(legalCase) : undefined;
        await repository.softDelete(id, userId, originalState);
    }

    static async restore(id: string): Promise<void> {
        await repository.restore(id);
    }

    static async hardDelete(id: string): Promise<void> {
        await repository.hardDelete(id);
    }

    static async closeCase(id: string, notes?: string): Promise<void> {
        await repository.update(id, {
            stage: 'closed',
            closedAt: new Date().toISOString(),
            notes,
            updatedAt: new Date().toISOString()
        });
    }

    static async updateStage(id: string, stage: LegalCase['stage'], lastAction?: string): Promise<void> {
        await repository.update(id, {
            stage,
            lastAction,
            updatedAt: new Date().toISOString()
        });
    }

    static async getStatistics() {
        return await repository.getStatistics();
    }

    static async generateCollectionLetter(legalCaseId: string): Promise<string> {
        const legalCase = await repository.findById(legalCaseId);
        if (!legalCase) throw new Error('Processo de contencioso nÃ£o encontrado.');

        const [client, credit, settings] = await Promise.all([
            db.get<any>('SELECT * FROM clients WHERE id = ?', [legalCase.clientId]),
            db.get<any>('SELECT * FROM credits WHERE id = ?', [legalCase.creditId]),
            db.get<any>('SELECT * FROM company_settings WHERE id = 1')
        ]);

        const { default: jsPDF } = await import('jspdf');
        const doc = new jsPDF();
        const companyName = settings?.name || 'InstituiÃ§Ã£o Credora';
        const companyNif = settings?.nif || '';
        const companyAddress = settings?.address || '';
        const today = new Date();
        const filename = `carta_cobranca_${legalCase.id}_${today.toISOString().slice(0, 10)}.pdf`;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(companyName, 20, 22);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        if (companyNif) doc.text(`NIF: ${companyNif}`, 20, 29);
        if (companyAddress) doc.text(companyAddress, 20, 35);

        doc.setDrawColor(30, 41, 59);
        doc.line(20, 42, 190, 42);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('CARTA FORMAL DE COBRANÃ‡A', 105, 56, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Data: ${today.toLocaleDateString('pt-AO')}`, 20, 68);
        doc.text(`Processo: ${legalCase.id}`, 20, 75);
        doc.text(`Cliente: ${client?.name || legalCase.clientId}`, 20, 82);
        doc.text(`NIF: ${client?.nif || 'N/D'}`, 20, 89);
        doc.text(`CrÃ©dito: ${credit?.id || legalCase.creditId}`, 20, 96);
        doc.text(`Valor em dÃ­vida: ${formatCurrency(Number(legalCase.debtAmount || credit?.currentBalance || 0))}`, 20, 103);

        const body = [
            'Exmo(a). Senhor(a),',
            '',
            `Serve a presente para notificar V. Exa. de que se encontra pendente a regularizaÃ§Ã£o do crÃ©dito associado ao processo ${legalCase.id}.`,
            `Solicitamos a liquidaÃ§Ã£o voluntÃ¡ria do valor em dÃ­vida no prazo de 5 dias Ãºteis, contados a partir da receÃ§Ã£o desta comunicaÃ§Ã£o.`,
            'Na ausÃªncia de regularizaÃ§Ã£o ou acordo escrito, o processo poderÃ¡ prosseguir para as etapas legais aplicÃ¡veis, incluindo mediaÃ§Ã£o, interpelaÃ§Ã£o judicial ou execuÃ§Ã£o de garantias.',
            '',
            'Para evitar custos adicionais, recomendamos contacto imediato com a Ã¡rea de cobranÃ§a para negociar uma soluÃ§Ã£o de pagamento.',
            '',
            'Com os melhores cumprimentos,',
            companyName
        ];

        doc.text(body, 20, 120, { maxWidth: 170, lineHeightFactor: 1.5 });

        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text('Documento gerado automaticamente pelo Tango GestÃ£o de CrÃ©ditos ERP.', 20, 285);
        doc.save(filename);

        await repository.update(legalCase.id, {
            lastAction: `Carta de cobranÃ§a emitida em ${today.toISOString()}`,
            updatedAt: today.toISOString()
        });

        return filename;
    }
}
