export interface LegalCase {
    id: string;
    clientId: string;
    creditId: string;
    stage: 'interpellated' | 'mediation' | 'court' | 'closed';
    priority: 'low' | 'normal' | 'high' | 'critical';
    debtAmount: number;
    lastAction?: string;
    notes?: string;
    createdAt: string;
    updatedAt?: string;
    closedAt?: string;
    deletedAt?: string;
    deletedBy?: string;
    restoredAt?: string;
    originalState?: string;
    usuario_id?: string;
}

export interface Warranty {
    id: string;
    clientId: string;
    creditId?: string;
    type: 'Veículo' | 'Imóvel' | 'Equipamento' | 'Outro';
    description: string;
    marketValue: number;
    status: 'active' | 'released' | 'seized';
    location?: string;
    photos?: string[]; // URLs or base64
    documents?: string[]; // URLs or base64
    notes?: string;
    createdAt: string;
    updatedAt?: string;
    deletedAt?: string;
    deletedBy?: string;
    restoredAt?: string;
    originalState?: string;
    usuario_id?: string;
}
