import { Warranty } from '@/tipos/contencioso';
import { RepositorioGarantias } from '@/repositorios/RepositorioGarantias';

const repository = new RepositorioGarantias();

export class ServicoGarantias {
    static async getAll(): Promise<Warranty[]> {
        return await repository.findAll();
    }

    static async getById(id: string): Promise<Warranty | undefined> {
        return await repository.findById(id);
    }

    static async getByClientId(clientId: string): Promise<Warranty[]> {
        return await repository.findByClientId(clientId);
    }

    static async getByCreditId(creditId: string): Promise<Warranty[]> {
        return await repository.findByCreditId(creditId);
    }

    static async create(warranty: Omit<Warranty, 'id' | 'createdAt'>): Promise<Warranty> {
        const newWarranty: Warranty = {
            ...warranty,
            id: `WR-${Date.now()}`,
            status: warranty.status || 'active',
            createdAt: new Date().toISOString()
        };

        await repository.insert(newWarranty);
        return newWarranty;
    }

    static async update(id: string, updates: Partial<Warranty>): Promise<void> {
        await repository.update(id, {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    }

    static async delete(id: string, userId: string): Promise<void> {
        const warranties = await this.getAll();
        const warranty = warranties.find(w => w.id === id);
        const originalState = warranty ? JSON.stringify(warranty) : undefined;
        await repository.softDelete(id, userId, originalState);
    }

    static async restore(id: string): Promise<void> {
        await repository.restore(id);
    }

    static async hardDelete(id: string): Promise<void> {
        await repository.hardDelete(id);
    }

    static async releaseWarranty(id: string, notes?: string): Promise<void> {
        await repository.update(id, {
            status: 'released',
            notes,
            updatedAt: new Date().toISOString()
        });
    }

    static async seizeWarranty(id: string, notes?: string): Promise<void> {
        await repository.update(id, {
            status: 'seized',
            notes,
            updatedAt: new Date().toISOString()
        });
    }

    static async addPhoto(id: string, photoUrl: string): Promise<void> {
        const warranty = await repository.findById(id);
        if (!warranty) throw new Error('Warranty not found');

        const photos = warranty.photos || [];
        photos.push(photoUrl);

        await repository.update(id, {
            photos,
            updatedAt: new Date().toISOString()
        });
    }

    static async addDocument(id: string, documentUrl: string): Promise<void> {
        const warranty = await repository.findById(id);
        if (!warranty) throw new Error('Warranty not found');

        const documents = warranty.documents || [];
        documents.push(documentUrl);

        await repository.update(id, {
            documents,
            updatedAt: new Date().toISOString()
        });
    }

    static async getTotalValue(): Promise<number> {
        return await repository.getTotalValue();
    }

    static async getStatistics() {
        return await repository.getStatistics();
    }

    static calculateCoverage(warrantyValue: number, debtAmount: number): number {
        if (debtAmount === 0) return 100;
        return Math.min((warrantyValue / debtAmount) * 100, 100);
    }
}
