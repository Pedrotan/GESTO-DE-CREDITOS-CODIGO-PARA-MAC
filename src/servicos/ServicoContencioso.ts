import { LegalCase } from '@/tipos/contencioso';
import { RepositorioContencioso } from '@/repositorios/RepositorioContencioso';
import { db } from '@/bibliotecas/bd';
import { formatCurrency } from '@/bibliotecas/formatters';
import { applyBranding, getCompanySettings, BRAND_CHARCOAL } from '@/bibliotecas/pdf';

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
        if (!legalCase) throw new Error('Processo de contencioso não encontrado.');

        const [client, credit, rawSettings] = await Promise.all([
            db.get<any>('SELECT * FROM clients WHERE id = ?', [legalCase.clientId]),
            db.get<any>('SELECT * FROM credits WHERE id = ?', [legalCase.creditId]),
            db.get<any>('SELECT * FROM company_settings WHERE id = 1')
        ]);

        const { default: jsPDF } = await import('jspdf');
        const doc = new jsPDF();
        const config = getCompanySettings(rawSettings);
        applyBranding(doc, config, undefined, false);

        const companyName = config.name || 'Instituição Credora';
        const today = new Date();
        const filename = `carta_cobranca_${legalCase.id}_${today.toISOString().slice(0, 10)}.pdf`;

        // Título Formal
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(BRAND_CHARCOAL[0], BRAND_CHARCOAL[1], BRAND_CHARCOAL[2]);
        doc.text('CARTA FORMAL DE COBRANÇA', 105, 52, { align: 'center' });

        // Bloco de Identificação do Processo e Devedor
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(71, 85, 105);
        doc.text(`Processo: ${legalCase.id}`, 20, 64);
        doc.text(`Data de Emissão: ${today.toLocaleDateString('pt-AO')}`, 190, 64, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(BRAND_CHARCOAL[0], BRAND_CHARCOAL[1], BRAND_CHARCOAL[2]);
        doc.text(`Destinatário / Cliente: ${client?.name || legalCase.clientId}`, 20, 72);
        doc.text(`NIF: ${client?.nif || 'N/D'}`, 20, 78);
        doc.text(`Contrato de Crédito: ${credit?.id || legalCase.creditId}`, 20, 84);

        doc.setFont('helvetica', 'bold');
        doc.text(`Valor Total em Dívida: ${formatCurrency(Number(legalCase.debtAmount || credit?.currentBalance || 0))}`, 20, 92);

        // Linha divisória
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(20, 97, 190, 97);

        const body = [
            'Exmo(a). Senhor(a),',
            '',
            `Serve a presente para notificar V. Exa. de que se encontra pendente a regularização do crédito associado ao processo ${legalCase.id}.`,
            `Solicitamos a liquidação voluntária do valor em dívida no prazo de 5 dias úteis, contados a partir da receção desta comunicação.`,
            'Na ausência de regularização ou acordo escrito, o processo poderá prosseguir para as etapas legais aplicáveis, incluindo mediação, interpelação judicial ou execução de garantias.',
            '',
            'Para evitar custos adicionais, recomendamos contacto imediato com a nossa área de cobrança para negociar um plano de regularização.',
            '',
            'Com os melhores cumprimentos,',
            companyName
        ];

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        doc.text(body, 20, 107, { maxWidth: 170, lineHeightFactor: 1.5 });

        doc.save(filename);

        await repository.update(legalCase.id, {
            lastAction: `Carta de cobrança emitida em ${today.toISOString()}`,
            updatedAt: today.toISOString()
        });

        return filename;
    }
}
