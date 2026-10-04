import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';

import {
    Client,
    Credit,
    Payment,
    Contract,
    Notification,
    AuditLog,
    MessageTemplate,
    UserLimit,
    ChatMessage,
    AccountingEntry,
    AccountingAccount,
    Simulation,
    Supplier,
    CalendarTask,
} from '@/tipos/credito';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { CreditEntity } from '@/dominio/entidade/Credito';
import { PaymentGateway, GatewayTestResult, PaymentReference } from '@/tipos/pagamento';
import { CompanySettings } from '@/tipos/base-dados';

import { db, setDbAdapterMode as setGlobalDbMode } from '@/bibliotecas/bd';
import { setRemoteSqlConfig } from '@/bibliotecas/adaptador-bd-remoto';
import { appAdapter } from '@/bibliotecas/adaptador-aplicacao';
import { getFileUrl } from '@/bibliotecas/utils';
import { DEFAULT_INTEREST_TIERS, InterestTier } from '@/bibliotecas/taxas-juro';
import { openWhatsApp } from '@/bibliotecas/whatsapp';
import { generateClientProfilePDF, BRAND_ORANGE, BRAND_CHARCOAL, resolveBrandPrimary, resolveBrandDark } from '@/bibliotecas/pdf';
import { resolveLicenseKey, setActiveLicenseCompanyNif, setGlobalLicenseKey, validateLicense } from '@/bibliotecas/licenciamento';
import { useToast } from '@/ganchos/usar-toast';
import { ServicoAuditoria } from '@/servicos/ServicoAuditoria';
import { ServicoCliente } from '@/servicos/ServicoCliente';
import { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
import { ServicoNotificacao } from '@/servicos/ServicoNotificacao';
import { ServicoMensagem } from '@/servicos/ServicoMensagem';
import { ServicoContabilidade } from '@/servicos/ServicoContabilidade';
import { ServicoContrato } from '@/servicos/ServicoContrato';
import { ServicoConfiguracao } from '@/servicos/ServicoConfiguracao';
import { ServicoContencioso } from '@/servicos/ServicoContencioso';
import { ServicoGarantias } from '@/servicos/ServicoGarantias';
import { ServicoSimulacao } from '@/servicos/ServicoSimulacao';
import { ServicoFornecedor } from '@/servicos/ServicoFornecedor';
import { ServicoTarefaCalendario } from '@/servicos/ServicoTarefaCalendario';
import { ServicoTaxasJuro } from '@/servicos/ServicoTaxasJuro';
import { SHARED_SETTING_KEYS, ServicoDefinicoesPartilhadas } from '@/servicos/ServicoDefinicoesPartilhadas';
import { isCloudSyncUrl, startCloudSync, syncCloudNow } from '@/servicos/ServicoSincronizacaoCloud';
import { LegalCase, Warranty } from '@/tipos/contencioso';
import { getScopedLocalStorageItem, scopedStorageKey, setScopedLocalStorageItem } from '@/bibliotecas/contas';

export interface AdvancedReportData {
    monthlyRevenue: { month: string; amount: number }[];
    creditsByStatus: { status: string; count: number; totalAmount: number }[];
    topClients: { name: string; totalPaid: number }[];
}

interface ContextoDadosType {
    users: any[];
    clients: Client[];
    allClients: Client[];
    credits: Credit[];
    payments: Payment[];
    contracts: Contract[];
    notifications: Notification[];
    simulations: Simulation[];
    logs: AuditLog[];
    messages: ChatMessage[];
    companySettings: CompanySettings;
    messageTemplates: MessageTemplate[];
    updateMessageTemplate: (id: string, content: string) => Promise<void>;
    addMessageTemplate: (template: Omit<MessageTemplate, 'isDefault'>) => Promise<void>;
    deleteMessageTemplate: (id: string) => Promise<void>;
    accountingEntries: AccountingEntry[];
    addAccountingEntry: (entry: Omit<AccountingEntry, 'id' | 'timestamp' | 'integrityHash' | 'previousHash'>) => Promise<void>;
    addClient: (client: Client, user?: { id: string; name: string }) => Promise<void>;
    updateClient: (id: string, updates: Partial<Client>, user?: { id: string; name: string }) => Promise<void>;
    deleteClient: (id: string, user?: { id: string; name: string }) => Promise<void>;
    addDocumentToClient: (clientId: string, doc: any, user?: { id: string; name: string }) => Promise<void>;
    deleteDocumentFromClient: (clientId: string, docId: string, user?: { id: string; name: string }) => Promise<void>;
    addCredit: (credit: Credit, user?: { id: string; name: string }) => Promise<void>;
    updateCredit: (id: string, updates: Partial<Credit>, user?: { id: string; name: string }) => Promise<void>;
    adjustCreditCharges: (id: string, accruedInterest: number, lateInterest: number,
        reason: string, idempotencyKey: string, user?: { id: string; name: string }) => Promise<void>;
    reinforceCredit: (
        creditId: string,
        amount: number,
        options?: { interestRate?: number; notes?: string; idempotencyKey?: string },
        user?: { id: string; name: string }
    ) => Promise<void>;
    deleteCredit: (id: string, user?: { id: string; name: string }, justification?: string) => Promise<void>;
    approveCredit: (id: string, adminId: string, adminName: string, notes?: string) => Promise<void>;
    rejectCredit: (id: string, adminId: string, adminName: string, notes?: string) => Promise<void>;
    addPayment: (payment: Payment, user?: { id: string; name: string }) => Promise<void>;
    deletePayment: (id: string, user?: { id: string; name: string }, justification?: string) => Promise<void>;
    addSimulation: (simulation: Simulation) => Promise<void>;
    deleteSimulation: (id: string) => Promise<void>;
    addContract: (contract: Contract) => Promise<void>;
    addNotification: (notification: Notification) => Promise<void>;
    markNotificationAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    clearNotifications: (source?: 'system' | 'chat') => Promise<void>;
    addLog: (
        action: AuditLog['action'],
        entity: AuditLog['entity'],
        details: string,
        userId?: string,
        userName?: string,
        previousState?: any,
        newState?: any,
        metadata?: any
    ) => Promise<void>;
    updateCompanySettings: (updates: Partial<ContextoDadosType['companySettings']>, user?: { id: string; name: string }) => Promise<void>;
    /** Tabela de taxas de juro por prazo, partilhada entre dispositivos pela nuvem. */
    interestTiers: InterestTier[];
    saveInterestTiers: (tiers: InterestTier[]) => Promise<void>;
    sendMessage: (message: Omit<ChatMessage, 'id' | 'timestamp' | 'read'>) => Promise<void>;
    markMessageAsRead: (id: string) => Promise<void>;
    deleteMessage: (id: string) => Promise<void>;
    clearMessages: (user1Id: string, user2Id: string) => Promise<void>;
    syncData: () => Promise<void>;
    getAdvancedReport: (startDate?: Date, endDate?: Date) => Promise<AdvancedReportData>;
    getUserLimit: (role: 'admin' | 'manager') => Promise<UserLimit | undefined>;
    updateUserLimit: (limit: UserLimit) => Promise<void>;
    getUserActivityReport: (userId?: string, startDate?: Date, endDate?: Date) => Promise<AuditLog[]>;
    deleteLog: (id: string) => Promise<void>;
    clearUserLogs: (userId: string) => Promise<void>;
    clearAllLogs: (user?: { id: string; name: string }) => Promise<void>;
    loadMoreLogs: (limit?: number) => Promise<void>;
    loadMoreAccountingEntries: (limit?: number) => Promise<void>;
    refreshData: () => Promise<void>;

    paymentGateways: PaymentGateway[];
    addPaymentGateway: (gateway: Omit<PaymentGateway, 'id' | 'createdAt'>) => Promise<void>;
    updatePaymentGateway: (id: string, updates: Partial<PaymentGateway>) => Promise<void>;
    deletePaymentGateway: (id: string) => Promise<void>;
    testGatewayConnection: (id: string) => Promise<GatewayTestResult>;

    paymentReferences: PaymentReference[];
    createPaymentReference: (data: Omit<PaymentReference, 'id' | 'createdAt' | 'status'>) => Promise<PaymentReference>;
    uploadPaymentProof: (referenceId: string, proofImage: string) => Promise<void>;
    validatePaymentReference: (id: string, approve: boolean) => Promise<void>;

    legalCases: LegalCase[];
    addLegalCase: (legalCase: Omit<LegalCase, 'id' | 'createdAt'>, user?: { id: string; name: string }) => Promise<void>;
    updateLegalCase: (id: string, updates: Partial<LegalCase>, user?: { id: string; name: string }) => Promise<void>;
    deleteLegalCase: (id: string, user?: { id: string; name: string }) => Promise<void>;

    suppliers: Supplier[];
    addSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt'>, user?: { id: string; name: string }) => Promise<void>;
    updateSupplier: (id: string, updates: Partial<Supplier>, user?: { id: string; name: string }) => Promise<void>;
    deleteSupplier: (id: string, user?: { id: string; name: string }) => Promise<void>;

    calendarTasks: CalendarTask[];
    addCalendarTask: (task: { title: string; description?: string; date: string }, user?: { id: string; name: string }) => Promise<void>;
    deleteCalendarTask: (id: string, user?: { id: string; name: string }) => Promise<void>;

    warranties: Warranty[];
    addWarranty: (warranty: Omit<Warranty, 'id' | 'createdAt'>, user?: { id: string; name: string }) => Promise<void>;
    updateWarranty: (id: string, updates: Partial<Warranty>, user?: { id: string; name: string }) => Promise<void>;
    deleteWarranty: (id: string, user?: { id: string; name: string }) => Promise<void>;
    isDataLoading: boolean;

    serverInfo: { isRunning: boolean, ip: string, ips: string[], hostname: string, port: number } | null;
    setServerInfo: any;
    connectedClients: any[];
    setConnectedClients: any;
    addReference: (data: any) => Promise<void>;
    deleteReference: (id: string) => Promise<void>;
    toggleServerMode: (enabled: boolean) => Promise<void>;
    promoteToMaster: (passkey?: string) => Promise<void>;

    deletedClients: Client[];
    deletedCredits: Credit[];
    deletedPayments: Payment[];
    restoreClient: (id: string, user?: { id: string; name: string }) => Promise<void>;
    hardDeleteClient: (id: string, user?: { id: string; name: string }) => Promise<void>;
    restoreCredit: (id: string, user?: { id: string; name: string }) => Promise<void>;
    hardDeleteCredit: (id: string, user?: { id: string; name: string }) => Promise<void>;
    restorePayment: (id: string, user?: { id: string; name: string }) => Promise<void>;
    hardDeletePayment: (id: string, user?: { id: string; name: string }) => Promise<void>;
    restoreLegalCase: (id: string, user?: { id: string; name: string }) => Promise<void>;
    hardDeleteLegalCase: (id: string, user?: { id: string; name: string }) => Promise<void>;
    restoreWarranty: (id: string, user?: { id: string; name: string }) => Promise<void>;
    hardDeleteWarranty: (id: string, user?: { id: string; name: string }) => Promise<void>;
    dbAdapterMode: 'local' | 'remote';

    activeContextUserId: string | null;
    setContextUserId: (userId: string | null) => void;
    closedMonths: any[];
    closeMonth: (
        id: string,
        month: number,
        year: number,
        capitalApplied: number,
        projectedProfit: number,
        realizedProfit: number,
        overdueAmount: number,
        liquidationRate: number,
        closedBy: string
    ) => Promise<void>;
    reopenMonth: (id: string) => Promise<void>;
}

const syncDictionary = async () => {
    try {
        const countResult = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM dictionary");
        const count = countResult?.count || 0;
        
        if (count === 0) {
            console.log("[Dictionary] Seeding initial words...");
            const aoWords = [
                "Angola", "Luanda", "Benguela", "Huambo", "Lobito", "Lubango", "Namibe", "Cabinda", "Soyo", "Malanje",
                "Uige", "Kwanza", "Cazenga", "Viana", "Talona", "Maianga", "Ingombota", "Samba", "Rangel", "Sambizanga",
                "cacimbo", "musseque", "imbondeiro", "kambas", "sanzala", "kimbundu", "umbundu", "chokwe", "fiote",
                "kilapi", "kota", "kamba", "quimbundo", "kwanza", "talatona", "mutamba", "morro bento"
            ];
            const commonWords = [
                "Pedro", "Morais", "Tango", "Joao", "Manuel", "Antonio", "Francisco", "Jose", "Maria", "Ana",
                "Silva", "Santos", "Oliveira", "Gomes", "Rodrigues", "Lopes", "Alves", "Sousa", "Pinto", "Cardoso",
                "credito", "pagamento", "cliente", "empresa", "prestacao", "juros", "mora", "contrato", "garantia",
                "contencioso", "financeiro", "simulacao", "simulador", "amortizacao", "banco", "transferencia",
                "numerario", "referencia", "comprovativo", "capital", "limite", "plafom", "saldo", "devedor",
                "vencimento", "multa", "taxa", "aprovacao", "recibo", "fiscal", "nif", "identificacao"
            ];
            await db.transaction([
                ...aoWords.flatMap(word => [
                    { sql: "INSERT OR IGNORE INTO dictionary (word, language) VALUES (?, ?)", params: [word, 'pt-AO'] },
                    { sql: "INSERT OR IGNORE INTO dictionary (word, language) VALUES (?, ?)", params: [word.toLowerCase(), 'pt-AO'] }
                ]),
                ...commonWords.flatMap(word => [
                    { sql: "INSERT OR IGNORE INTO dictionary (word, language) VALUES (?, ?)", params: [word, 'both'] },
                    { sql: "INSERT OR IGNORE INTO dictionary (word, language) VALUES (?, ?)", params: [word.toLowerCase(), 'both'] }
                ])
            ]);
        }

        // Skip internet sync in Web browser fallback mode to prevent massive IndexedDB/WASM write performance freeze
        const isElectron = !!(window as any).electronAPI;
        if (!isElectron) {
            console.log("[Dictionary] Web mode fallback: skipping internet sync to prevent main-thread freeze.");
            return;
        }

        console.log("[Dictionary] Starting background sync from internet...");
        const url = "https://raw.githubusercontent.com/michmech/portuguese-word-list/master/portuguese-word-list.txt";
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        
        const text = await response.text();
        const lines = text.split('\n');
        console.log(`[Dictionary] Downloaded ${lines.length} words. Syncing...`);
        
        const wordsToInsert = lines
            .map(line => line.trim())
            .filter(word => word.length >= 2 && !word.includes(' ') && !word.includes('-'))
            .slice(0, 5000);

        for (let i = 0; i < wordsToInsert.length; i += 100) {
            const chunk = wordsToInsert.slice(i, i + 100);
            await db.transaction(chunk.map(word => ({
                sql: "INSERT OR IGNORE INTO dictionary (word, language) VALUES (?, ?)",
                params: [word, 'pt-PT']
            })));
        }
        console.log("[Dictionary] Background sync completed successfully.");
    } catch (err) {
        console.warn("[Dictionary] Silent background sync failed/offline:", err);
    }
};

const CREDIT_STATUSES_THAT_USE_LIMIT = new Set(['active', 'overdue', 'defaulted', 'renegotiated']);

const calculatePrincipalPaid = (creditId: string, allPayments: Payment[]) => {
    return allPayments
        .filter(p => p.creditId === creditId && p.status !== 'cancelled' && !p.deletedAt)
        .reduce((sum, payment) => sum + Math.max(0, Number(payment.allocatedToPrincipal || 0)), 0);
};

const calculateCreditPrincipalInUse = (credit: Credit, allPayments: Payment[]) => {
    if (!CREDIT_STATUSES_THAT_USE_LIMIT.has(credit.status)) return 0;
    if ((Number(credit.currentBalance) || 0) <= 0) return 0;

    const principal = Math.max(0, Number(credit.principalAmount || 0));
    const principalPaid = calculatePrincipalPaid(credit.id, allPayments);
    return Math.max(0, principal - principalPaid);
};

const calculateClientLimitState = (client: Client, allCredits: Credit[], allPayments: Payment[]) => {
    const clientCredits = allCredits.filter(credit => credit.clientId === client.id && !credit.deletedAt);
    const hasOpenCredit = clientCredits.some(
        credit => CREDIT_STATUSES_THAT_USE_LIMIT.has(credit.status) && (Number(credit.currentBalance) || 0) > 0.1
    );
    const usedCredit = clientCredits
        .reduce((sum, credit) => sum + calculateCreditPrincipalInUse(credit, allPayments), 0);
    const status: Client['status'] = client.status === 'blocked' ? 'blocked' : hasOpenCredit ? 'active' : 'inactive';

    return {
        usedCredit,
        availableCredit: Math.max(0, (Number(client.creditLimit) || 0) - usedCredit),
        status,
    };
};

const withCalculatedClientLimit = (client: Client, allCredits: Credit[], allPayments: Payment[]) => ({
    ...client,
    ...calculateClientLimitState(client, allCredits, allPayments),
});

const limitsChanged = (client: Client, next: Pick<Client, 'usedCredit' | 'availableCredit' | 'status'>) => (
    Math.abs((Number(client.usedCredit) || 0) - next.usedCredit) > 0.01 ||
    Math.abs((Number(client.availableCredit) || 0) - next.availableCredit) > 0.01 ||
    client.status !== next.status
);

const ContextoDados = createContext<ContextoDadosType | undefined>(undefined);

export const DataProvider = ({ children }: { children: ReactNode }) => {
    const { toast } = useToast();
    const { user: authUser } = useAuth();
    const authRole = authUser?.role;
    const [activeContextUserId, setContextUserId] = useState<string | null>(null);
    const [users, setUsers] = useState<any[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [credits, setCredits] = useState<Credit[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [simulations, setSimulations] = useState<Simulation[]>([]);
    const [accountingEntries, setAccountingEntries] = useState<AccountingEntry[]>([]);
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
    const [userLimits, setUserLimits] = useState<UserLimit[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
    const [paymentReferences, setPaymentReferences] = useState<PaymentReference[]>([]);
    const [connectedClients, setConnectedClients] = useState<any[]>([]);
    const [serverInfo, setServerInfo] = useState<{ isRunning: boolean, ip: string, ips: string[], hostname: string, port: number } | null>(null);
    const [legalCases, setLegalCases] = useState<LegalCase[]>([]);
    const [warranties, setWarranties] = useState<Warranty[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [interestTiers, setInterestTiers] = useState<InterestTier[]>(DEFAULT_INTEREST_TIERS);
    // Incrementa a cada recarga de dados: volta a comparar a licença local com a partilhada pela nuvem.
    const [sharedSettingsVersion, setSharedSettingsVersion] = useState(0);
    const [calendarTasks, setCalendarTasks] = useState<CalendarTask[]>([]);
    const [closedMonths, setClosedMonths] = useState<any[]>([]);
    const [dbAdapterMode, setDbAdapterModeState] = useState<'local' | 'remote'>(() => {
        const syncUrl = getScopedLocalStorageItem('sync_url');
        const legacyRemote = getScopedLocalStorageItem('sync_enabled') === 'true'
            && syncUrl
            && !isCloudSyncUrl(syncUrl)
            && getScopedLocalStorageItem('is_master') !== 'true';
        return legacyRemote ? 'remote' : 'local';
    });
    const [isDataLoading, setIsDataLoading] = useState(true);
    const retryCount = React.useRef(0);

    const [deletedClients, setDeletedClients] = useState<Client[]>([]);
    const [deletedCredits, setDeletedCredits] = useState<Credit[]>([]);
    const [deletedPayments, setDeletedPayments] = useState<Payment[]>([]);

    const refreshClientCreditLimit = async (
        clientId: string,
        sourceCredits: Credit[] = credits,
        sourcePayments: Payment[] = payments,
        user?: { id: string; name: string }
    ) => {
        const client = clients.find(c => c.id === clientId);
        if (!client) return;

        const nextLimitState = calculateClientLimitState(client, sourceCredits, sourcePayments);
        if (!limitsChanged(client, nextLimitState)) return;

        const targetUserId = activeContextUserId || user?.id || authUser?.id || client.usuario_id;
        const updatedClient = { ...client, ...nextLimitState, usuario_id: targetUserId };
        await ServicoCliente.update(client.id, updatedClient);
        setClients(prev => prev.map(c => c.id === client.id ? { ...c, ...nextLimitState, usuario_id: targetUserId } : c));
    };

    const hydrateLogos = async (settings: any) => {
        const isElectronEnv = typeof window !== 'undefined' && !!(window as any).electronAPI;

        const hydrate = async (p: string | null, backupKey?: string): Promise<string | null> => {
            if (!p) {
                if (backupKey) {
                    const fallback = getScopedLocalStorageItem(backupKey);
                    if (fallback) return fallback;
                }
                return null;
            }
            // Already a data URI or blob — no conversion needed
            if (p.startsWith('data:') || p.startsWith('blob:')) return p;
            // Web URL or relative web asset path
            if (p.startsWith('http://') || p.startsWith('https://')) return p;
            if (!isElectronEnv && (p.startsWith('/') || p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.jpeg') || p.endsWith('.svg') || p.endsWith('.webp'))) {
                return p;
            }

            // Looks like raw base64 without data: header
            if (p.length > 100 && !p.startsWith('file:') && !p.startsWith('safe-file:') && !p.includes(' ') && /^[A-Za-z0-9+/=]+$/.test(p.substring(0, 50))) {
                return `data:image/png;base64,${p}`;
            }

            // In Web mode (Vercel), file:/// paths cannot be hydrated via disk, but we should not wipe them to null
            if (!isElectronEnv) {
                if (backupKey) {
                    const cached = getScopedLocalStorageItem(backupKey);
                    if (cached) return cached;
                }
                return p;
            }

            // It's a file path in Electron — convert to base64 data URI
            try {
                const fileUrl = getFileUrl(p);
                const res = await fetch(fileUrl);
                if (!res.ok) {
                    console.warn("Hydration fetch failed for", p, res.status, res.statusText);
                    return p; // Return original rather than destroying it with null!
                }
                const blob = await res.blob();
                if (blob.size === 0) return p;
                return new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = () => resolve(p);
                    reader.readAsDataURL(blob);
                });
            } catch (e) {
                console.warn("Hydration failed for", p, e);
                // Fallback: try loading via Image element for Electron safe-file protocol
                try {
                    const imgUrl = getFileUrl(p);
                    return new Promise<string | null>((resolve) => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => {
                            try {
                                const canvas = document.createElement('canvas');
                                canvas.width = img.naturalWidth;
                                canvas.height = img.naturalHeight;
                                const ctx = canvas.getContext('2d');
                                if (ctx) {
                                    ctx.drawImage(img, 0, 0);
                                    resolve(canvas.toDataURL('image/png'));
                                } else {
                                    resolve(p);
                                }
                            } catch {
                                resolve(p);
                            }
                        };
                        img.onerror = () => resolve(p);
                        img.src = imgUrl;
                    });
                } catch {
                    return p;
                }
            }
        };

        const finalLogo = await hydrate(settings.logo, 'company_logo_backup');
        const finalReportLogo = await hydrate(settings.reportLogo, 'company_report_logo_backup');
        const finalWatermarkLogo = await hydrate(settings.watermarkLogo, 'company_watermark_logo_backup');

        return {
            ...settings,
            logo: finalLogo,
            reportLogo: finalReportLogo,
            watermarkLogo: finalWatermarkLogo,
        };
    };

    const addNotification = useCallback(async (n: Notification) => {
        await ServicoNotificacao.add(n);
        setNotifications(prev => [n, ...prev.slice(0, 50)]);
    }, []);

    const [companySettings, setCompanySettings] = useState<ContextoDadosType['companySettings']>({
        name: 'A Carregar...', nif: '', address: '', logo: null, reportLogo: null, watermarkLogo: null,
        currency: 'AOA', customClauses: '', rescueKey: '', phone: '',
        primaryColor: BRAND_ORANGE, secondaryColor: BRAND_CHARCOAL, sessionTimeout: 20,
        email: '', whatsapp: '+244900000000', whatsappAutoNotify: false, whatsappVerified: false,
        location: '',
        syncEnabled: false, syncUrl: '', syncApiKey: '', syncPasskey: '', lastSync: '',
        maintenanceMode: false, allowedModulesDuringMaintenance: '[]', enableGatewaysModule: true,
        enableProfileActivity: true, digitalSignatureEnabled: false, authorizedSigners: '[]',
        enableWarrantiesModule: true, enableWarrantiesModuleAdminOnly: false,
        enableLegalModule: true, enableLegalModuleAdminOnly: false,
        enableScoringModule: true, enableScoringModuleAdminOnly: false,
        enableSuppliersModule: false, enableSuppliersModuleAdminOnly: false,
        enableMultiTenant: true,
        lastBackupDate: '', installDate: '',
    });

    const filterByUser = useCallback(<T extends any>(items: T[]): T[] => {
        if (!items) return [];

        if (activeContextUserId) {
            return items.filter((item: any) => {
                const itemId = item.usuario_id || item.userId;
                return itemId === activeContextUserId;
            });
        }

        if (authRole === 'super_admin') {
            return items;
        }

        if (authRole === 'admin') {
            const managerIds = users.filter(u => u.role === 'manager').map(u => u.id);
            const allowedIds = [authUser?.id, ...managerIds];
            return items.filter((item: any) => {
                const itemId = item.usuario_id || item.userId;
                return allowedIds.includes(itemId);
            });
        }

        return items.filter((item: any) => {
            const itemId = item.usuario_id || item.userId;
            return itemId === authUser?.id;
        });
    }, [authRole, activeContextUserId, authUser?.id, users]);

    const filteredClients = React.useMemo(() => filterByUser(clients), [clients, filterByUser]);
    const filteredCredits = React.useMemo(() => filterByUser(credits), [credits, filterByUser]);
    const filteredPayments = React.useMemo(() => filterByUser(payments), [payments, filterByUser]);
    const filteredContracts = React.useMemo(() => filterByUser(contracts), [contracts, filterByUser]);
    const filteredLegalCases = React.useMemo(() => filterByUser(legalCases), [legalCases, filterByUser]);
    const filteredWarranties = React.useMemo(() => filterByUser(warranties), [warranties, filterByUser]);
    const filteredSuppliers = React.useMemo(() => filterByUser(suppliers), [suppliers, filterByUser]);
    const filteredSimulations = React.useMemo(() => filterByUser(simulations), [simulations, filterByUser]);
    const filteredLogs = React.useMemo(() => filterByUser(logs), [logs, filterByUser]);
    const filteredAccountingEntries = React.useMemo(() => filterByUser(accountingEntries), [accountingEntries, filterByUser]);
    const filteredNotifications = React.useMemo(() => {
        if (!notifications) return [];
        return notifications.filter(n => {
            const nUserId = (n as any).userId || (n as any).usuario_id;
            if (!nUserId) return true;
            if ((authRole === 'super_admin' || authRole === 'admin') && !activeContextUserId) return true;
            if (activeContextUserId) return nUserId === activeContextUserId;
            if (authRole === 'manager') return nUserId === authUser?.id;
            return true;
        });
    }, [notifications, authRole, activeContextUserId, authUser?.id]);

    const refreshData = useCallback(async () => {
        // A sessao Electron ainda nao tem acesso a consultas protegidas durante o login/MFA.
        if (window.electronAPI?.userAuthStatus && !authUser?.id) {
            setIsDataLoading(false);
            return;
        }
        try {
            const isElectronEnv = typeof window !== 'undefined' && !!(window as any).electronAPI;
            const safetyTimeout = new Promise(resolve => setTimeout(resolve, isElectronEnv ? 3500 : 15000));

            const loadCriticalData = async () => {
                await db.init();
                syncDictionary().catch(err => console.warn("[Dictionary Sync Error]", err));
                return Promise.all([
                    db.get<any>('SELECT * FROM company_settings WHERE id = 1'),
                    db.all<any>('SELECT id, name, email, username, role, avatar, status, permissions FROM users')
                ]);
            };

            const result: any = await Promise.race([loadCriticalData(), safetyTimeout]);
            const [Definicoes, loadedUsers] = Array.isArray(result) ? result : [null, null];

            if (Definicoes) {
                const safeParse = (val: string, fallback: any) => {
                    try { return val ? JSON.parse(val) : fallback; } catch (e) { return fallback; }
                };
                const sanitizedName = (!Definicoes.name || Definicoes.name === 'Provisório' || Definicoes.name === 'Empresa' || Definicoes.name === 'A Carregar...') ? 'Tango Gestão de Créditos' : Definicoes.name;
                const hydratedSettings = await hydrateLogos({
                    ...Definicoes,
                    name: sanitizedName,
                    primaryColor: resolveBrandPrimary(safeParse(Definicoes.primaryColor, BRAND_ORANGE)),
                    secondaryColor: resolveBrandDark(safeParse(Definicoes.secondaryColor, BRAND_CHARCOAL)),
                    whatsappAutoNotify: Definicoes.whatsappAutoNotify === 1,
                    whatsappVerified: Definicoes.whatsappVerified === 1,
                    syncEnabled: Definicoes.syncEnabled === 1,
                    maintenanceMode: Boolean(Definicoes.maintenanceMode),
                    allowedModulesDuringMaintenance: safeParse(Definicoes.allowedModulesDuringMaintenance, []),
                    enableGatewaysModule: Definicoes.enableGatewaysModule === 1,
                    enableGatewaysModuleAdminOnly: Definicoes.enableGatewaysModuleAdminOnly === 1,
                    enableProfileActivity: Definicoes.enableProfileActivity !== 0,
                    enableProfileActivityAdminOnly: Definicoes.enableProfileActivityAdminOnly === 1,
                    digitalSignatureEnabled: Definicoes.digitalSignatureEnabled === 1,
                    authorizedSigners: safeParse(Definicoes.authorizedSigners, []),
                    bankingInfo: safeParse(Definicoes.bankingInfo, []),
                    contractTemplates: safeParse(Definicoes.contractTemplates, []),
                    financialLock: Definicoes.financialLock === 1,
                    enableWarrantiesModule: Definicoes.enableWarrantiesModule !== 0,
                    enableWarrantiesModuleAdminOnly: Definicoes.enableWarrantiesModuleAdminOnly === 1,
                    enableLegalModule: Definicoes.enableLegalModule !== 0,
                    enableLegalModuleAdminOnly: Definicoes.enableLegalModuleAdminOnly === 1,
                    enableScoringModule: Definicoes.enableScoringModule !== 0,
                    enableScoringModuleAdminOnly: Definicoes.enableScoringModuleAdminOnly === 1,
                    enableSuppliersModule: Definicoes.enableSuppliersModule === 1,
                    enableSuppliersModuleAdminOnly: Definicoes.enableSuppliersModuleAdminOnly === 1,
                    enableMultiTenant: Definicoes.enableMultiTenant !== 0,
                    licenseKey: resolveLicenseKey(Definicoes.licenseKey),
                    location: Definicoes.location || '',
                    website: Definicoes.website || '',
                    segment: Definicoes.segment || '',
                    slogan: Definicoes.slogan || '',
                    defaultSimulationInterestRate: Definicoes.defaultSimulationInterestRate ?? 3.5,
                    defaultSimulationAdminFee: Definicoes.defaultSimulationAdminFee ?? 2.0,
                    defaultSimulationIof: Definicoes.defaultSimulationIof ?? 0.38,
                    smtpHost: Definicoes.smtpHost || 'smtp.gmail.com',
                    smtpPort: Definicoes.smtpPort || '587',
                    smtpUser: Definicoes.smtpUser || Definicoes.email || '',
                    smtpPassword: Definicoes.smtpPassword || '',
                    smtpSecure: Boolean(Definicoes.smtpSecure),
                    smtpFromName: Definicoes.smtpFromName || Definicoes.name || 'Tango ERP',
                });

                // Se o logotipo estiver em falta ou vazio, restaurar do backup persistente
                if (!hydratedSettings.logo) {
                    const backupLogo = getScopedLocalStorageItem('company_logo_backup');
                    if (backupLogo) hydratedSettings.logo = backupLogo;
                }
                if (!hydratedSettings.reportLogo) {
                    const backupReportLogo = getScopedLocalStorageItem('company_report_logo_backup');
                    if (backupReportLogo) hydratedSettings.reportLogo = backupReportLogo;
                }
                if (!hydratedSettings.watermarkLogo) {
                    const backupWatermarkLogo = getScopedLocalStorageItem('company_watermark_logo_backup');
                    if (backupWatermarkLogo) hydratedSettings.watermarkLogo = backupWatermarkLogo;
                }

                setCompanySettings(hydratedSettings);
                setScopedLocalStorageItem('cached_company_settings', JSON.stringify({
                    ...hydratedSettings,
                    name: sanitizedName,
                }));
                retryCount.current = 0;
            } else if (!Array.isArray(result)) {
                console.warn("Startup timeout hit! Loading fallback/cached settings to unblock UI.");
                const cached = getScopedLocalStorageItem('cached_company_settings');
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        const parsedName = (!parsed.name || parsed.name === 'Provisório' || parsed.name === 'Empresa' || parsed.name === 'A Carregar...') ? 'Tango Gestão de Créditos' : parsed.name;
                        setCompanySettings(prev => ({
                            ...prev,
                            ...parsed,
                            logo: parsed.logo || getScopedLocalStorageItem('company_logo_backup') || prev.logo,
                            licenseKey: resolveLicenseKey(parsed.licenseKey),
                            name: parsedName
                        }));
                        retryCount.current = 0;
                    } catch (e) { }
                }
            }

            if (loadedUsers) {
                setUsers(loadedUsers);
            }

            setIsDataLoading(false);

            Promise.all([
                db.all<PaymentGateway>('SELECT * FROM payment_gateways ORDER BY createdAt DESC'),
                db.all<PaymentReference>('SELECT * FROM payment_references ORDER BY createdAt DESC'),
                ServicoContrato.getAll(),
                ServicoFinanceiro.getAllCredits(),
                ServicoCliente.getAll(),
                ServicoFinanceiro.getAllPayments(),
                ServicoNotificacao.getAll(),
                ServicoContencioso.getAll(),
                ServicoGarantias.getAll(),
                ServicoSimulacao.getAll(),
                db.all<MessageTemplate>('SELECT * FROM message_templates'),
                db.all<any>('SELECT * FROM user_limits'),
                ServicoMensagem.getAll(),
                ServicoContabilidade.getAll(),
                ServicoCliente.getDeleted(),
                ServicoFinanceiro.getDeletedCredits(),
                ServicoFinanceiro.getDeletedPayments(),
                ServicoAuditoria.getLogs(100),
                db.all<any>('SELECT * FROM closed_months'),
                ServicoFornecedor.findAll(),
                ServicoTarefaCalendario.getAll(),
                ServicoTaxasJuro.load().catch(() => DEFAULT_INTEREST_TIERS)
            ]).then(([
                gateways,
                references,
                loadedContracts,
                loadedCredits,
                loadedClients,
                loadedPayments,
                loadedNotifications,
                loadedLegalCases,
                loadedWarranties,
                loadedSimulations,
                loadedTemplates,
                loadedLimits,
                loadedMessages,
                loadedEntries,
                loadedDeletedClients,
                loadedDeletedCredits,
                loadedDeletedPayments,
                loadedLogs,
                loadedClosedMonths,
                loadedSuppliers,
                loadedCalendarTasks,
                loadedInterestTiers
            ]) => {
                const creditsByClient = (loadedCredits || []).reduce((acc: any, cr) => {
                    if (!acc[cr.clientId]) acc[cr.clientId] = [];
                    acc[cr.clientId].push(cr);
                    return acc;
                }, {});

                setPaymentGateways(gateways || []);
                setPaymentReferences(references || []);
                setContracts(loadedContracts || []);
                setCredits(loadedCredits || []);

                const existingContractIds = new Set((loadedContracts || []).map(c => c.id));
                const missingContracts = (loadedCredits || []).filter(cr =>
                    cr.status !== 'cancelled' &&
                    cr.status !== 'rejected' &&
                    !existingContractIds.has(cr.id)
                );

                if (missingContracts.length > 0) {
                    const newContracts: Contract[] = missingContracts.map(cr => ({
                        id: cr.id,
                        clientId: cr.clientId,
                        clientName: cr.clientName,
                        title: `Contrato de Crédito ${cr.id}`,
                        value: cr.principalAmount,
                        startDate: new Date(cr.startDate),
                        endDate: new Date(cr.dueDate),
                        status: cr.status === 'paid' ? 'paid' : 'active',
                        createdAt: cr.createdAt || new Date(),
                        usuario_id: cr.usuario_id
                    }));

                    Promise.all(newContracts.map(nc => ServicoContrato.add(nc)))
                        .then(() => {
                            setContracts(prev => [...(prev || []), ...newContracts]);
                        })
                        .catch(err => console.error("[ContextoDados] Erro na restauração de contratos:", err));
                }
                const normalizedClients = (loadedClients || []).map(c => ({
                    ...c,
                    ...calculateClientLimitState(c, loadedCredits || [], loadedPayments || []),
                    creditScore: CreditEntity.calculateScore(creditsByClient[c.id] || [])
                }));

                normalizedClients
                    .filter(c => limitsChanged((loadedClients || []).find(original => original.id === c.id) || c, c))
                    .forEach(c => {
                        ServicoCliente.update(c.id, c).catch(err =>
                            console.warn("[ContextoDados] Falha ao persistir limite recalculado:", err)
                        );
                    });

                setClients(normalizedClients);
                setPayments(loadedPayments);
                setNotifications(loadedNotifications);
                setLegalCases(loadedLegalCases);
                setWarranties(loadedWarranties);
                setSimulations(loadedSimulations);
                setMessageTemplates(loadedTemplates);
                setUserLimits(loadedLimits.map(l => ({ ...l, updatedAt: new Date(l.updatedAt) })));
                setMessages(loadedMessages);
                setAccountingEntries(loadedEntries);
                setDeletedClients(loadedDeletedClients);
                setDeletedCredits(loadedDeletedCredits);
                setDeletedPayments(loadedDeletedPayments);
                setLogs(loadedLogs || []);
                setClosedMonths(loadedClosedMonths || []);
                setSuppliers(loadedSuppliers || []);
                setInterestTiers(loadedInterestTiers);
                setSharedSettingsVersion(version => version + 1);
                setCalendarTasks(loadedCalendarTasks || []);

                if (serverInfo?.isRunning && Definicoes) {
                    const safeParse = (val: string, fallback: any) => {
                        try { return val ? JSON.parse(val) : fallback; } catch (e) { return fallback; }
                    };
                    const configToShare = {
                        settings: {
                            ...Definicoes,
                            primaryColor: resolveBrandPrimary(safeParse(Definicoes.primaryColor, BRAND_ORANGE)),
                            secondaryColor: resolveBrandDark(safeParse(Definicoes.secondaryColor, BRAND_CHARCOAL)),
                            whatsappAutoNotify: Definicoes.whatsappAutoNotify === 1,
                            whatsappVerified: Definicoes.whatsappVerified === 1,
                            syncEnabled: Definicoes.syncEnabled === 1,
                            maintenanceMode: Boolean(Definicoes.maintenanceMode),
                            allowedModulesDuringMaintenance: safeParse(Definicoes.allowedModulesDuringMaintenance, []),
                            enableGatewaysModule: Definicoes.enableGatewaysModule === 1,
                            enableProfileActivity: Definicoes.enableProfileActivity !== 0,
                            digitalSignatureEnabled: Definicoes.digitalSignatureEnabled === 1,
                            authorizedSigners: safeParse(Definicoes.authorizedSigners, []),
                            bankingInfo: safeParse(Definicoes.bankingInfo, []),
                            contractTemplates: safeParse(Definicoes.contractTemplates, []),
                            financialLock: Definicoes.financialLock === 1,
                        },
                        clients: normalizedClients,
                        credits: loadedCredits,
                        payments: loadedPayments,
                        simulations: loadedSimulations
                    };
                    appAdapter.setSharedConfig?.(configToShare);
                }
            }).catch(e => console.error("Background data load failed:", e));

        } catch (err) {
            console.error("Falha ao carregar dados iniciais (Recuperando...):", err);
            const cached = getScopedLocalStorageItem('cached_company_settings');
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    const parsedName = (!parsed.name || parsed.name === 'Provisório' || parsed.name === 'Empresa' || parsed.name === 'A Carregar...') ? 'Tango Gestão de Créditos' : parsed.name;
                    setCompanySettings(prev => ({
                        ...prev,
                        ...parsed,
                        licenseKey: resolveLicenseKey(parsed.licenseKey),
                        name: parsedName
                    }));
                    setIsDataLoading(false);
                    return;
                } catch (e) { }
            }

            if (clients.length === 0) {
                setIsDataLoading(false);
                setTimeout(refreshData, 5000);
            }
        } finally {
            setIsDataLoading(false);
        }
    }, [authUser?.id, clients.length, serverInfo?.isRunning]);

    const syncData = async () => {
        if (!companySettings.syncEnabled || !companySettings.syncUrl) return;
        if (isCloudSyncUrl(companySettings.syncUrl)) {
            const result = await syncCloudNow();
            if (!result.success) throw new Error(result.message || 'Falha na sincronização cloud.');
            return;
        }
        try {
            const payload = { companyId: companySettings.nif, settings: companySettings, clients, credits, payments };
            await fetch(`${companySettings.syncUrl.replace(/\/$/, '')}/sync`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sync-passkey': companySettings.syncPasskey || '' },
                body: JSON.stringify(payload)
            });
        } catch (e) { console.error("Sync failed", e); }
    };

    const performAutoSync = async () => {
        if (!companySettings.syncEnabled || !companySettings.syncUrl) return;
        setTimeout(() => syncData().catch(console.warn), 500);
    };

    const addLog = async (
        action: 'create' | 'update' | 'delete' | 'login' | 'logout',
        entity: 'client' | 'credit' | 'payment' | 'user' | 'system' | 'contencioso' | 'garantia' | 'payment_gateway',
        details: string,
        userId?: string,
        userName?: string,
        previousState?: any,
        newState?: any,
        metadata?: any
    ) => {
        const newLog = await ServicoAuditoria.addLog(action, entity, details, userId, userName, previousState, newState, metadata);
        setLogs(prev => [newLog, ...prev.slice(0, 400)]);
    };

    const clearAllLogs = async (user?: { id: string; name: string }) => {
        await ServicoAuditoria.clearAllLogs();
        setLogs([]);
        await addLog('delete', 'system', 'Limpou todo o histórico de logs de auditoria', user?.id, user?.name);
    };

    const updateCompanySettings = async (updates: Partial<ContextoDadosType['companySettings']>, user?: { id: string; name: string }) => {
        if (updates.licenseKey !== undefined) {
            setGlobalLicenseKey(updates.licenseKey);
        }

        const { newSettings, changes } = await ServicoConfiguracao.updateSettings(updates, companySettings);
        const effectiveSettings = {
            ...newSettings,
            licenseKey: resolveLicenseKey(newSettings.licenseKey)
        };
        const hydratedSettings = await hydrateLogos(effectiveSettings);

        // Guardar cópias de segurança dedicadas dos logotipos para nunca serem perdidos
        if (hydratedSettings.logo && (hydratedSettings.logo.startsWith('data:') || hydratedSettings.logo.startsWith('http') || hydratedSettings.logo.startsWith('/'))) {
            setScopedLocalStorageItem('company_logo_backup', hydratedSettings.logo);
        }
        if (hydratedSettings.reportLogo && (hydratedSettings.reportLogo.startsWith('data:') || hydratedSettings.reportLogo.startsWith('http') || hydratedSettings.reportLogo.startsWith('/'))) {
            setScopedLocalStorageItem('company_report_logo_backup', hydratedSettings.reportLogo);
        }
        if (hydratedSettings.watermarkLogo && (hydratedSettings.watermarkLogo.startsWith('data:') || hydratedSettings.watermarkLogo.startsWith('http') || hydratedSettings.watermarkLogo.startsWith('/'))) {
            setScopedLocalStorageItem('company_watermark_logo_backup', hydratedSettings.watermarkLogo);
        }

        setCompanySettings(hydratedSettings);
        setScopedLocalStorageItem('cached_company_settings', JSON.stringify(effectiveSettings));
        await addLog('update', 'system', changes.length ? changes.join(', ') : 'Atualizou definições', user?.id, user?.name);

        // A licença activada aqui vale para toda a empresa: publica-a para os outros dispositivos (web e PCs).
        const newLicenseKey = String(updates.licenseKey || '').trim();
        if (newLicenseKey && authUser?.id) {
            try {
                const shared = await ServicoDefinicoesPartilhadas.get(SHARED_SETTING_KEYS.licenseKey);
                if (shared !== newLicenseKey) await ServicoDefinicoesPartilhadas.set(SHARED_SETTING_KEYS.licenseKey, newLicenseKey, authUser.name);
            } catch (error) {
                console.warn('[Licença] Não foi possível partilhar a licença com os outros dispositivos:', error);
            }
        }

        if (updates.syncEnabled !== undefined) setScopedLocalStorageItem('sync_enabled', updates.syncEnabled ? 'true' : 'false');
        if (updates.syncUrl !== undefined) setScopedLocalStorageItem('sync_url', updates.syncUrl || '');
        if (updates.syncPasskey !== undefined) setScopedLocalStorageItem('sync_passkey', updates.syncPasskey || '');

        const isMaster = getScopedLocalStorageItem('is_master') === 'true';
        if (!isMaster && (updates.syncEnabled !== undefined || updates.syncUrl !== undefined)) {
            const newSyncEnabled = updates.syncEnabled ?? companySettings.syncEnabled;
            const newSyncUrl = updates.syncUrl ?? companySettings.syncUrl;
            const newSyncPasskey = updates.syncPasskey ?? companySettings.syncPasskey;

            if (newSyncUrl) {
                setRemoteSqlConfig(newSyncUrl, newSyncPasskey);
            }

            const newMode = (newSyncEnabled && newSyncUrl && newSyncUrl.trim() !== '' && !isCloudSyncUrl(newSyncUrl)) ? 'remote' : 'local';

            if (newMode !== dbAdapterMode) {
                setDbAdapterModeState(newMode);
                setGlobalDbMode(newMode);
                setTimeout(() => refreshData().catch(console.error), 500);
            }
        }

        if (serverInfo?.isRunning && appAdapter.setSharedConfig) {
            appAdapter.setSharedConfig({
                settings: newSettings,
                clients,
                credits,
                payments
            });
        }

        performAutoSync();
    };
    const saveInterestTiers = async (tiers: InterestTier[]) => {
        const saved = await ServicoTaxasJuro.save(tiers, authUser?.name);
        setInterestTiers(saved);
    };

    const updateCompanySettingsRef = useRef(updateCompanySettings);
    updateCompanySettingsRef.current = updateCompanySettings;

    useEffect(() => {
        setActiveLicenseCompanyNif(companySettings.nif);
    }, [companySettings.nif]);

    // Licença única para a empresa: adopta a licença activada noutro dispositivo quando é válida aqui e
    // melhor do que a local; se a local for a melhor, publica-a para os outros dispositivos.
    useEffect(() => {
        if (!authUser?.id || !sharedSettingsVersion) return;
        let cancelled = false;
        (async () => {
            const shared = (await ServicoDefinicoesPartilhadas.get(SHARED_SETTING_KEYS.licenseKey).catch(() => null) || '').trim();
            const local = String(companySettings.licenseKey || '').trim();
            if (cancelled || shared === local) return;
            const sharedInfo = shared ? await validateLicense(shared, companySettings.nif) : null;
            const localInfo = local ? await validateLicense(local, companySettings.nif) : null;
            if (cancelled) return;
            const sharedIsBetter = sharedInfo?.isValid && (!localInfo?.isValid || sharedInfo.expirationDate > localInfo.expirationDate);
            if (sharedIsBetter) {
                await updateCompanySettingsRef.current({ licenseKey: shared });
            } else if (localInfo?.isValid) {
                await ServicoDefinicoesPartilhadas.set(SHARED_SETTING_KEYS.licenseKey, local, authUser.name).catch(() => undefined);
            }
        })().catch(error => console.warn('[Licença] Sincronização da licença:', error));
        return () => { cancelled = true; };
    }, [authUser?.id, authUser?.name, companySettings.licenseKey, companySettings.nif, sharedSettingsVersion]);

    const loadMoreLogs = async (limit: number = 50) => {
        if (logs.length === 0) {
            const moreLogs = await ServicoAuditoria.getLogs(limit);
            if (moreLogs.length > 0) {
                setLogs(moreLogs);
            }
            return;
        }
        const lastLog = logs[logs.length - 1];
        const lastTimestamp = typeof lastLog.timestamp === 'string'
            ? lastLog.timestamp
            : (lastLog.timestamp instanceof Date
                ? lastLog.timestamp.toISOString()
                : new Date(lastLog.timestamp).toISOString());
        const lastId = lastLog.id;

        const moreLogs = await ServicoAuditoria.getPagedLogs(limit, lastTimestamp, lastId);
        if (moreLogs.length > 0) {
            setLogs(prev => [...prev, ...moreLogs]);
        }
    };

    const loadMoreAccountingEntries = async (limit: number = 50) => {
        if (accountingEntries.length === 0) return;
        const lastEntry = accountingEntries[accountingEntries.length - 1];
        const lastTimestamp = lastEntry.timestamp.toISOString();
        const lastId = lastEntry.id;

        const moreEntries = await ServicoContabilidade.getPaged(limit, lastTimestamp, lastId);
        if (moreEntries.length > 0) {
            setAccountingEntries(prev => [...prev, ...moreEntries]);
        }
    };

    const updateMessageTemplate = async (id: string, content: string) => {
        const template = messageTemplates.find(t => t.id === id);
        if (!template) throw new Error('Modelo de mensagem não encontrado.');

        await db.run('UPDATE message_templates SET content = ? WHERE id = ?', [content, id]);
        setMessageTemplates(prev => prev.map(t => t.id === id ? { ...t, content } : t));
        await addLog('update', 'system', `Atualizou modelo de mensagem: ${template.name}`, authUser?.id, authUser?.name);
        performAutoSync();
    };

    const addMessageTemplate = async (template: Omit<MessageTemplate, 'isDefault'>) => {
        const newTemplate: MessageTemplate = {
            ...template,
            id: template.id || crypto.randomUUID(),
            isDefault: false
        };

        await db.run(
            'INSERT INTO message_templates (id, name, type, content, isDefault) VALUES (?, ?, ?, ?, ?)',
            [newTemplate.id, newTemplate.name, newTemplate.type, newTemplate.content, 0]
        );
        setMessageTemplates(prev => [newTemplate, ...prev]);
        await addLog('create', 'system', `Criou modelo de mensagem: ${newTemplate.name}`, authUser?.id, authUser?.name);
        performAutoSync();
    };

    const deleteMessageTemplate = async (id: string) => {
        const template = messageTemplates.find(t => t.id === id);
        if (!template) return;
        if (Boolean(template.isDefault)) {
            throw new Error('Modelos padrão não podem ser apagados.');
        }

        await db.run('DELETE FROM message_templates WHERE id = ?', [id]);
        setMessageTemplates(prev => prev.filter(t => t.id !== id));
        await addLog('delete', 'system', `Apagou modelo de mensagem: ${template.name}`, authUser?.id, authUser?.name);
        performAutoSync();
    };

    const addAccountingEntry = async (entry: Omit<AccountingEntry, 'id' | 'timestamp' | 'integrityHash' | 'previousHash'>) => {
        const targetUserId = activeContextUserId || authUser?.id;
        const entryWithUser = { ...entry, usuario_id: targetUserId };
        const newEntry = await ServicoContabilidade.createEntry(entryWithUser as any);
        setAccountingEntries(prev => [...prev, newEntry]);
    };

    useEffect(() => {
        refreshData();
    }, [refreshData, authUser?.id]);

    useEffect(() => {
        const handleSystemNotification = (event: any) => {
            const { userId, title, message, type } = event.detail;
            addNotification({
                id: crypto.randomUUID(),
                userId,
                title,
                message,
                type: type || 'info',
                read: false,
                timestamp: new Date()
            });
        };

        window.addEventListener('system-notification', handleSystemNotification);
        return () => window.removeEventListener('system-notification', handleSystemNotification);
    }, [addNotification]);

    useEffect(() => {
        const interval = setInterval(refreshData, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [refreshData]);

    useEffect(() => {
        if (!companySettings.syncEnabled || !isCloudSyncUrl(companySettings.syncUrl)) return;
        const apiKey = companySettings.syncApiKey || companySettings.syncPasskey || '';
        return startCloudSync({
            url: companySettings.syncUrl,
            apiKey,
            tenantId: companySettings.nif || 'tango-default',
            onRemoteApplied: refreshData
        });
    }, [companySettings.syncEnabled, companySettings.syncUrl, companySettings.syncApiKey, companySettings.syncPasskey, companySettings.nif, refreshData]);

    useEffect(() => {
        const initServerInfo = async () => {
            if ((window as any).electronAPI && authUser) {
                try {
                    const isRunning = await (window as any).electronAPI.isServerRunning();
                    const netInfo = await (window as any).electronAPI.getNetworkInfo();
                    setServerInfo({
                        isRunning,
                        ip: netInfo.ip,
                        ips: netInfo.ips,
                        hostname: netInfo.hostname,
                        port: 3000
                    });
                } catch (e) {
                    console.error("Failed to init server info", e);
                }
            }
        };
        initServerInfo();

        let unsubscribeClients: (() => void) | undefined;
        let unsubscribeDiscovery: (() => void) | undefined;
        if ((window as any).electronAPI?.onClientsUpdated && authUser) {
            unsubscribeClients = (window as any).electronAPI.onClientsUpdated((clients: any[]) => setConnectedClients(clients));
            unsubscribeDiscovery = (window as any).electronAPI.onMasterDiscovered((data: any) => {
                if (!serverInfo?.isRunning) {
                    const discoveryUrl = `http://${data.ip}:3000/sync`;
                    if (companySettings.syncUrl !== discoveryUrl) {
                        updateCompanySettingsRef.current({ syncUrl: discoveryUrl, syncEnabled: true });
                        setGlobalDbMode('remote');
                        setDbAdapterModeState('remote');
                        setScopedLocalStorageItem('is_master', 'false');
                        setScopedLocalStorageItem('sync_enabled', 'true');
                        refreshData();
                    }
                }
            });
        }

        const unsubscribe = appAdapter.onDbUpdate(() => {
            refreshData();
        });

        const handleAuthEvent = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail.isInitialCreation) {
                return;
            }

            addNotification({
                id: crypto.randomUUID(),
                title: 'Perfil de Utilizador Atualizado',
                message: `O utilizador ${detail.name} foi atualizado.${detail.passwordChanged ? ' (Senha alterada)' : ''}${detail.roleChanged ? ' (Função alterada)' : ''}`,
                type: 'info',
                read: false,
                timestamp: new Date()
            });
        };
        window.addEventListener('auth-user-updated', handleAuthEvent);

        return () => {
            unsubscribeClients?.();
            unsubscribeDiscovery?.();
            unsubscribe();
            window.removeEventListener('auth-user-updated', handleAuthEvent);
        };
    }, [refreshData, addNotification, serverInfo?.isRunning, companySettings.syncEnabled, companySettings.syncUrl, authUser]);

    const addClient = async (client: Client, actor?: { id: string, name: string }) => {
        const nif = (client.nif || '').trim();
        if (nif && !nif.startsWith('SEM-') && nif !== 'SEM IDENTIFICAÇÃO') {
            const duplicateNif = clients.find(c => c.nif === nif);
            if (duplicateNif) {
                throw new Error(`Já existe um cliente registado com o NIF "${nif}" (${duplicateNif.name}). Por favor, utilize um NIF diferente.`);
            }
        }

        const targetUserId = activeContextUserId || actor?.id || authUser?.id;
        const clientWithUser = withCalculatedClientLimit({ ...client, usuario_id: targetUserId }, credits, payments);
        await ServicoCliente.add(clientWithUser);
        setClients(prev => [...prev, clientWithUser]);
        await addLog('create', 'client', `Cadastrou cliente ${client.name}`, actor?.id, actor?.name);

        await addNotification({
            id: crypto.randomUUID(),
            title: 'Novo Cliente',
            message: `O cliente ${client.name} foi registado com sucesso.`,
            type: 'success',
            read: false,
            timestamp: new Date()
        });

        performAutoSync();
    };

    const updateClient = async (id: string, updates: Partial<Client>, actor?: { id: string, name: string }) => {
        const current = clients.find(c => c.id === id);
        if (!current) return;

        const newNif = (updates.nif || '').trim();
        if (newNif && newNif !== current.nif && !newNif.startsWith('SEM-') && newNif !== 'SEM IDENTIFICAÇÃO') {
            const duplicateNif = clients.find(c => c.id !== id && c.nif === newNif);
            if (duplicateNif) {
                throw new Error(`Já existe um cliente registado com o NIF "${newNif}" (${duplicateNif.name}). Por favor, utilize um NIF diferente.`);
            }
        }

        const previousState = JSON.parse(JSON.stringify(current));

        const targetUserId = activeContextUserId || actor?.id || authUser?.id;
        const merged = { ...current, ...updates, usuario_id: updates.usuario_id || current.usuario_id || targetUserId };
        const updated = withCalculatedClientLimit(merged, credits, payments);
        await ServicoCliente.update(id, updated);
        setClients(prev => prev.map(c => c.id === id ? updated : c));

        const newState = JSON.parse(JSON.stringify(updated));

        await addLog(
            'update',
            'client',
            `Atualizou dados do cliente: ${updated.name}`,
            actor?.id,
            actor?.name,
            previousState,
            newState,
            { reason: 'User Action', userAgent: navigator.userAgent }
        );

        await addNotification({
            id: crypto.randomUUID(),
            title: 'Cliente Atualizado',
            message: `Os dados de ${updated.name} foram atualizados.`,
            type: 'info',
            read: false,
            timestamp: new Date()
        });

        performAutoSync();
    };

    const addDocumentToClient = async (clientId: string, doc: any, user?: { id: string; name: string }) => {
        const client = clients.find(c => c.id === clientId);
        if (!client) throw new Error('Cliente não encontrado.');

        const document = {
            ...doc,
            id: doc.id || crypto.randomUUID(),
            createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date()
        };

        await updateClient(clientId, { documents: [...(client.documents || []), document] }, user);
        await addLog('update', 'client', `Adicionou documento ao cliente: ${client.name}`, user?.id, user?.name, client, { ...client, documents: [...(client.documents || []), document] }, { documentId: document.id });
    };

    const deleteDocumentFromClient = async (clientId: string, docId: string, user?: { id: string; name: string }) => {
        const client = clients.find(c => c.id === clientId);
        if (!client) throw new Error('Cliente não encontrado.');

        const updatedDocuments = (client.documents || []).filter((doc: any) => doc.id !== docId);
        await updateClient(clientId, { documents: updatedDocuments }, user);
        await addLog('delete', 'client', `Removeu documento do cliente: ${client.name}`, user?.id, user?.name, client, { ...client, documents: updatedDocuments }, { documentId: docId });
    };

    const deleteClient = async (id: string, user?: { id: string; name: string }) => {
        const client = clients.find(c => c.id === id);
        if (!user) {
            toast({ title: 'Erro de Permissão', description: 'Utilizador não identificado', variant: 'destructive' });
            return;
        }

        await ServicoCliente.delete(id, user.id);
        const deletedClient = { ...client!, deletedAt: new Date(), deletedBy: user.id } as Client;
        setClients(prev => prev.filter(c => c.id !== id));
        setDeletedClients(prev => [deletedClient, ...prev]);

        if (client) {
            await addLog('delete', 'client', `Enviou cliente para a lixeira: ${client.name}`, user.id, user.name);
            await addNotification({
                id: crypto.randomUUID(),
                title: 'Cliente na Lixeira',
                message: `O cliente ${client.name} foi movido para a lixeira.`,
                type: 'warning',
                read: false,
                timestamp: new Date()
            });
        }

        performAutoSync();
    };

    const restoreClient = async (id: string, user?: { id: string; name: string }) => {
        const client = deletedClients.find(c => c.id === id);
        await ServicoCliente.restore(id);
        if (client) {
            const restored = { ...client, deletedAt: undefined, restoredAt: new Date() };
            setDeletedClients(prev => prev.filter(c => c.id !== id));
            setClients(prev => [...prev, restored]);
            await addLog('update', 'client', `Restaurou cliente da lixeira: ${client.name}`, user?.id, user?.name);
        }
        performAutoSync();
    };

    const hardDeleteClient = async (id: string, user?: { id: string; name: string }) => {
        const client = deletedClients.find(c => c.id === id);
        await ServicoCliente.hardDelete(id);
        setDeletedClients(prev => prev.filter(c => c.id !== id));
        if (client) {
            await addLog('delete', 'client', `Apagou permanentemente o cliente: ${client.name}`, user?.id, user?.name);
        }
        performAutoSync();
    };

    const addSimulation = async (simulation: Simulation) => {
        const targetUserId = activeContextUserId || authUser?.id;
        const simWithUser = { ...simulation, usuario_id: targetUserId };
        await ServicoSimulacao.add(simWithUser);
        setSimulations(prev => [simWithUser, ...prev]);
        performAutoSync();
    };

    const deleteSimulation = async (id: string) => {
        await ServicoSimulacao.delete(id);
        setSimulations(prev => prev.filter(s => s.id !== id));
        performAutoSync();
    };

    const addCredit = async (credit: Credit, user?: { id: string; name: string }) => {
        try {
            const targetUserId = activeContextUserId || user?.id || authUser?.id;
            const creditWithUser = { ...credit, usuario_id: targetUserId };
            let finalCredit = { ...creditWithUser, status: credit.status || 'active' } as Credit;
            finalCredit = await ServicoFinanceiro.addCredit(finalCredit);
            const nextCredits = [finalCredit, ...credits];
            setCredits(prev => [finalCredit, ...prev]);
            await refreshClientCreditLimit(finalCredit.clientId, nextCredits, payments, user);

            if (!['pending_approval', 'rejected', 'cancelled'].includes(finalCredit.status)) {
                const newContract: Contract = {
                    id: finalCredit.id, clientId: finalCredit.clientId, clientName: finalCredit.clientName,
                    title: `Contrato de Crédito ${finalCredit.id}`, value: finalCredit.principalAmount,
                    startDate: new Date(finalCredit.startDate), endDate: new Date(finalCredit.dueDate),
                    status: 'active', createdAt: new Date(), usuario_id: targetUserId
                };
                setContracts(prev => [newContract, ...prev]);
            }
            setNotifications(prev => [{
                id: `notification:credit:${finalCredit.id}`, userId: targetUserId,
                title: 'Novo Crédito', message: `Crédito de ${finalCredit.principalAmount} AOA criado para ${finalCredit.clientName}.`,
                type: 'success', read: false, timestamp: new Date()
            }, ...prev]);

            performAutoSync();
        } catch (error: any) {
            console.error("[ContextoDados] Erro ao adicionar crédito:", error);
            throw new Error(error.message || "Erro interno ao salvar crédito no banco de dados.");
        }
    };

    /**
     * Reforço de capital: acrescenta capital a um crédito em curso.
     *
     * Não é uma renegociação — o contrato, o prazo e a taxa mantêm-se. O capital
     * sobe, e o valor reforçado gera juros à mesma taxa, somados ao já vencido.
     * Fica registado no livro contabilístico como um novo desembolso ligado ao
     * mesmo crédito, para a carteira e a tesouraria continuarem a bater certo.
     */
    const reinforceCredit = async (
        creditId: string,
        amount: number,
        options?: { interestRate?: number; notes?: string; idempotencyKey?: string },
        user?: { id: string; name: string }
    ) => {
        const credit = credits.find(c => c.id === creditId);
        if (!credit) throw new Error('Crédito não encontrado.');
        if (!['active', 'overdue'].includes(credit.status)) {
            throw new Error('Só é possível reforçar créditos activos ou em mora.');
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error('O valor do reforço tem de ser maior que zero.');
        }

        const taxa = options?.interestRate ?? credit.interestRate;
        const jurosReforco = Math.round(amount * (taxa / 100));

        const principalAntes = credit.principalAmount;
        const atualizado: Partial<Credit> = {
            principalAmount: principalAntes + amount,
            currentBalance: credit.currentBalance + amount,
            accruedInterest: (credit.accruedInterest || 0) + jurosReforco,
            totalDue: (credit.totalDue || 0) + amount + jurosReforco,
            reinforcedAmount: (credit.reinforcedAmount || 0) + amount,
        };

        const entry = await ServicoFinanceiro.reinforceCredit({
            idempotencyKey: options?.idempotencyKey || crypto.randomUUID(), credit, amount,
            interestAmount: jurosReforco, processedBy: user?.name || authUser?.name || 'Sistema',
            userId: user?.id || authUser?.id, notes: options?.notes
        });
        const updatedCredit = { ...credit, ...atualizado, version: (credit.version ?? 0) + 1 };
        setCredits(prev => prev.map(item => item.id === creditId ? updatedCredit : item));
        setAccountingEntries(prev => [...prev, entry]);
        performAutoSync();
    };

    const updateCredit = async (id: string, updates: Partial<Credit>, user?: { id: string; name: string }) => {
        try {
            const credit = credits.find(c => c.id === id); if (!credit) return;

            const previousState = JSON.parse(JSON.stringify(credit));

            const targetUserId = activeContextUserId || user?.id || authUser?.id;
            const updateRequest = { ...updates, version: credit.version ?? 0, usuario_id: updates.usuario_id || credit.usuario_id || targetUserId };
            await ServicoFinanceiro.updateCredit(id, updateRequest);
            const updated = { ...credit, ...updateRequest, version: (credit.version ?? 0) + 1 };
            const nextCredits = credits.map(c => c.id === id ? updated : c);
            setCredits(prev => prev.map(c => c.id === id ? updated : c));
            await refreshClientCreditLimit(updated.clientId, nextCredits, payments, user);

            const newState = JSON.parse(JSON.stringify(updated));

            await addLog(
                'update',
                'credit',
                `Atualizou crédito: ${id}`,
                user?.id,
                user?.name,
                previousState,
                newState,
                { creditId: id, updates: Object.keys(updates) }
            );

            performAutoSync();
        } catch (error: any) {
            console.error("[ContextoDados] Erro ao atualizar crédito:", error);
            throw new Error(error.message || "Erro ao atualizar dados do crédito.");
        }
    };

    const adjustCreditCharges = async (id: string, accruedInterest: number, lateInterest: number,
        reason: string, idempotencyKey: string, user?: { id: string; name: string }) => {
        const credit = credits.find(item => item.id === id);
        if (!credit) throw new Error('Crédito não encontrado.');
        const actor = user || (authUser ? { id: authUser.id, name: authUser.name } : undefined);
        if (!actor) throw new Error('Sessão de utilizador obrigatória.');
        const entries = await ServicoFinanceiro.adjustCreditCharges({ credit, accruedInterest, lateInterest,
            reason, idempotencyKey, actorId: actor.id, actorName: actor.name });
        const updated = { ...credit, accruedInterest, lateInterest,
            totalDue: credit.currentBalance + accruedInterest + lateInterest,
            version: (credit.version ?? 0) + 1 };
        setCredits(previous => previous.map(item => item.id === id ? updated : item));
        setAccountingEntries(previous => [...previous, ...entries]);
        performAutoSync();
    };

    const approveCredit = async (id: string, adminId: string, adminName: string, notes?: string) => {
        const credit = credits.find(c => c.id === id);
        if (!credit) throw new Error('Crédito não encontrado.');
        if (credit.status !== 'pending_approval') {
            throw new Error('Apenas créditos pendentes podem ser aprovados.');
        }

        const updates: Partial<Credit> = {
            status: 'active',
            approvedBy: adminName,
            approvalNotes: notes || 'Aprovado sem observações adicionais.'
        };

        await ServicoFinanceiro.decideCredit({ credit, decision: 'approved', actorId: adminId, actorName: adminName,
            notes, notificationId: crypto.randomUUID(), auditId: crypto.randomUUID() });
        setCredits(prev => prev.map(item => item.id === id ? { ...item, ...updates, version: (item.version ?? 0) + 1 } : item));
        await refreshData();

        await refreshClientCreditLimit(credit.clientId, credits.map(c => c.id === id ? { ...c, ...updates } as Credit : c), payments, { id: adminId, name: adminName });

        performAutoSync();
    };

    const rejectCredit = async (id: string, adminId: string, adminName: string, notes?: string) => {
        const credit = credits.find(c => c.id === id);
        if (!credit) throw new Error('Crédito não encontrado.');
        if (credit.status !== 'pending_approval') {
            throw new Error('Apenas créditos pendentes podem ser rejeitados.');
        }

        const updates: Partial<Credit> = {
            status: 'rejected',
            approvedBy: adminName,
            approvalNotes: notes || 'Rejeitado sem observações adicionais.'
        };

        await ServicoFinanceiro.decideCredit({ credit, decision: 'rejected', actorId: adminId, actorName: adminName,
            notes, notificationId: crypto.randomUUID(), auditId: crypto.randomUUID() });
        setCredits(prev => prev.map(item => item.id === id ? { ...item, ...updates, version: (item.version ?? 0) + 1 } : item));
        await refreshData();
        performAutoSync();
    };

    const deleteCredit = async (id: string, user?: { id: string; name: string }, justification?: string) => {
        const credit = credits.find(c => c.id === id);

        const previousState = credit ? JSON.parse(JSON.stringify(credit)) : null;

        if (user) {
            await ServicoFinanceiro.deleteCredit(id, user.id);
            const deletedCredit = { ...credit!, deletedAt: new Date(), deletedBy: user.id } as Credit;
            const nextCredits = credits.filter(c => c.id !== id);
            setCredits(prev => prev.filter(c => c.id !== id));
            setDeletedCredits(prev => [deletedCredit, ...prev]);
            if (credit) {
                await refreshClientCreditLimit(credit.clientId, nextCredits, payments, user);
            }

            await addLog(
                'delete',
                'credit',
                `Enviou crédito para a lixeira: ${id} ${justification ? `(${justification})` : ''}`,
                user.id,
                user.name,
                previousState,
                null,
                { justification }
            );
        }

        if (credit) {
            await addNotification({
                id: crypto.randomUUID(),
                title: 'Crédito na Lixeira',
                message: `O crédito de ${credit.clientName} foi movido para a lixeira.`,
                type: 'error',
                read: false,
                timestamp: new Date()
            });
        }

        performAutoSync();
    };

    const restoreCredit = async (id: string, user?: { id: string; name: string }) => {
        const credit = deletedCredits.find(c => c.id === id);
        await ServicoFinanceiro.restoreCredit(id);
        if (credit) {
            const restored = { ...credit, deletedAt: undefined, restoredAt: new Date() };
            setDeletedCredits(prev => prev.filter(c => c.id !== id));
            setCredits(prev => [restored, ...prev]);
            await refreshClientCreditLimit(restored.clientId, [restored, ...credits], payments, user);
            await addLog('update', 'credit', `Restaurou crédito da lixeira: ${id}`, user?.id, user?.name);
        }
        performAutoSync();
    };

    const hardDeleteCredit = async (id: string, user?: { id: string; name: string }) => {
        const credit = deletedCredits.find(c => c.id === id);
        await ServicoFinanceiro.hardDeleteCredit(id);
        setDeletedCredits(prev => prev.filter(c => c.id !== id));
        if (credit) {
            await addLog('delete', 'credit', `Apagou permanentemente o crédito: ${id}`, user?.id, user?.name);
        }
        performAutoSync();
    };

    const addPayment = async (payment: Payment, user?: { id: string; name: string }) => {
        const targetUserId = activeContextUserId || user?.id || authUser?.id;
        const credit = credits.find(c => c.id === payment.creditId);
        if (!credit) throw new Error('O crédito associado ao pagamento não foi encontrado.');
        // A alocação e os novos saldos são calculados pelo serviço a partir da base de dados.
        const result = await ServicoFinanceiro.addPaymentAndUpdateCredit(
            { ...payment, usuario_id: targetUserId }, credit.version ?? 0, credit.clientId);
        const { creditState, payment: paymentWithUser, ...accountingEntry } = result;
        const updatedCredit: Credit = { ...credit, ...creditState };
        setAccountingEntries(previous => [...previous, accountingEntry as AccountingEntry]);
        setCredits(previous => previous.map(item => item.id === credit.id ? updatedCredit : item));
        setNotifications(previous => [{
            id: `notification:payment:${payment.id}`, userId: targetUserId || undefined,
            title: 'Pagamento Recebido', message: `Recebido pagamento de ${payment.amount} AOA de ${payment.clientName}.`,
            type: 'success', read: false, timestamp: new Date()
        }, ...previous]);
        const nextPayments = [paymentWithUser, ...payments];
        setPayments(prev => [paymentWithUser, ...prev]);

        if (updatedCredit.status === 'paid') {
            setContracts(previous => previous.map(contract => contract.id === credit.id
                ? { ...contract, status: 'paid' } : contract));
        }
        await refreshClientCreditLimit(
            credit.clientId,
            credits.map(c => c.id === credit.id ? updatedCredit : c),
            nextPayments,
            user
        );

        performAutoSync();
    };

    const deletePayment = async (id: string, user?: { id: string; name: string }, justification?: string) => {
        const payment = payments.find(p => p.id === id);
        if (payment) {
            const previousState = JSON.parse(JSON.stringify(payment));

            if (user) {
                const remainingPayments = payments.filter(p => p.id !== id);
                const credit = credits.find(c => c.id === payment.creditId);
                if (!credit) throw new Error('O crédito associado ao pagamento não foi encontrado.');
                const { creditState, ...reversalEntry } = await ServicoFinanceiro.reversePaymentAndUpdateCredit(
                    payment, credit, user.id, justification
                );
                const updatedCredit: Credit = { ...credit, ...creditState };
                const deletedPayment = { ...payment!, deletedAt: new Date(), deletedBy: user.id } as Payment;
                setPayments(prev => prev.filter(p => p.id !== id));
                setDeletedPayments(prev => [deletedPayment, ...prev]);
                setCredits(previous => previous.map(item => item.id === credit.id ? updatedCredit : item));
                if (credit.status === 'paid' && updatedCredit.status !== 'paid') {
                    setContracts(previous => previous.map(contract => contract.id === credit.id
                        ? { ...contract, status: 'active' } : contract));
                }
                setAccountingEntries(previous => [...previous, reversalEntry]);
                await refreshClientCreditLimit(
                    credit.clientId,
                    credits.map(c => c.id === credit.id ? updatedCredit : c),
                    remainingPayments,
                    user
                );

                await addLog(
                    'delete',
                    'payment',
                    `Enviou pagamento para a lixeira: ${id} ${justification ? `(${justification})` : ''}`,
                    user.id,
                    user.name,
                    previousState,
                    null,
                    { justification }
                );
            }

            await addNotification({
                id: crypto.randomUUID(),
                title: 'Pagamento na Lixeira',
                message: `O pagamento de ${payment.clientName} foi movido para a lixeira.`,
                type: 'warning',
                read: false,
                timestamp: new Date()
            });
        }
        performAutoSync();
    };

    const restorePayment = async (id: string, user?: { id: string; name: string }) => {
        const payment = deletedPayments.find(p => p.id === id);
        if (payment) {
            const restored = { ...payment, deletedAt: undefined, restoredAt: new Date() };
            const credit = credits.find(c => c.id === restored.creditId);
            if (credit) {
                const { creditState, ...restorationEntry } = await ServicoFinanceiro.restorePaymentAndUpdateCredit(
                    restored, credit, user?.id || authUser?.id || 'system'
                );
                const updatedCredit: Credit = { ...credit, ...creditState };
                setDeletedPayments(prev => prev.filter(p => p.id !== id));
                setPayments(prev => [restored, ...prev]);
                setCredits(previous => previous.map(item => item.id === credit.id ? updatedCredit : item));
                if (updatedCredit.status === 'paid') {
                    setContracts(previous => previous.map(contract => contract.id === credit.id
                        ? { ...contract, status: 'paid' } : contract));
                }
                setAccountingEntries(previous => [...previous, restorationEntry]);
                await refreshClientCreditLimit(
                    credit.clientId,
                    credits.map(c => c.id === credit.id ? updatedCredit : c),
                    [restored, ...payments],
                    user
                );
            } else throw new Error('O crédito associado ao pagamento não foi encontrado.');
            await addLog('update', 'payment', `Restaurou pagamento da lixeira: ${id}`, user?.id, user?.name);
        }
        performAutoSync();
    };

    const hardDeletePayment = async (id: string, user?: { id: string; name: string }) => {
        const payment = deletedPayments.find(p => p.id === id);
        await ServicoFinanceiro.hardDeletePayment(id);
        setDeletedPayments(prev => prev.filter(p => p.id !== id));
        if (payment) {
            await addLog('delete', 'payment', `Apagou permanentemente o pagamento: ${id}`, user?.id, user?.name);
        }
        performAutoSync();
    };

    const addLegalCase = async (legalCase: Omit<LegalCase, 'id' | 'createdAt'>, user?: { id: string; name: string }) => {
        const client = clients.find(cl => cl.id === legalCase.clientId);
        const clientName = client ? client.name : 'Cliente Desconhecido';
        const targetUserId = activeContextUserId || user?.id || authUser?.id;
        const caseWithUser = { ...legalCase, usuario_id: targetUserId };
        const newCase = await ServicoContencioso.create(caseWithUser as any);
        setLegalCases(prev => [newCase, ...prev]);
        const newState = JSON.parse(JSON.stringify(newCase));
        await addLog('create', 'contencioso', `Novo processo de contencioso: ${clientName}`, user?.id, user?.name, null, newState);
        performAutoSync();
    };

    const updateCreditRef = useRef(updateCredit);
    updateCreditRef.current = updateCredit;
    const addLegalCaseRef = useRef(addLegalCase);
    addLegalCaseRef.current = addLegalCase;

    const updateLegalCase = async (id: string, updates: Partial<LegalCase>, user?: { id: string; name: string }) => {
        const current = legalCases.find(c => c.id === id);
        const previousState = current ? JSON.parse(JSON.stringify(current)) : null;

        const targetUserId = activeContextUserId || user?.id || authUser?.id;
        const updatedWithUser = { ...updates, usuario_id: updates.usuario_id || current?.usuario_id || targetUserId };
        await ServicoContencioso.update(id, updatedWithUser);
        setLegalCases(prev => prev.map(c => c.id === id ? { ...c, ...updatedWithUser } : c));

        const updated = legalCases.find(c => c.id === id);
        const newState = updated ? JSON.parse(JSON.stringify({ ...updated, ...updates })) : null;

        const client = clients.find(cl => cl.id === (updated?.clientId || current?.clientId));
        const clientName = client ? client.name : 'Cliente';

        await addLog('update', 'contencioso', `Atualizou processo de contencioso: ${clientName}`, user?.id, user?.name, previousState, newState);
        performAutoSync();
    };

    const deleteLegalCase = async (id: string, user?: { id: string; name: string }) => {
        const current = legalCases.find(c => c.id === id);
        const previousState = current ? JSON.parse(JSON.stringify(current)) : null;

        await ServicoContencioso.delete(id, user?.id || 'system');
        setLegalCases(prev => prev.filter(c => c.id !== id));
        await addLog('delete', 'contencioso', `Removeu processo de contencioso: ${id}`, user?.id, user?.name, previousState, null);
        performAutoSync();
    };

    const restoreLegalCase = async (id: string, user?: { id: string; name: string }) => {
        const item = legalCases.find(c => c.id === id);
        await ServicoContencioso.restore(id);
        if (item) {
            setLegalCases(prev => prev.map(c => c.id === id ? { ...c, deletedAt: undefined, restoredAt: new Date().toISOString() } : c));
            await addLog('update', 'contencioso', `Restaurou processo da lixeira: ${id}`, user?.id, user?.name);
        }
        performAutoSync();
    };

    const hardDeleteLegalCase = async (id: string, user?: { id: string; name: string }) => {
        await ServicoContencioso.hardDelete(id);
        setLegalCases(prev => prev.filter(c => c.id !== id));
        await addLog('delete', 'contencioso', `Eliminou permanentemente processo: ${id}`, user?.id, user?.name);
        performAutoSync();
    };

    const addWarranty = async (warranty: Omit<Warranty, 'id' | 'createdAt'>, user?: { id: string; name: string }) => {
        const targetUserId = activeContextUserId || user?.id || authUser?.id;
        const warrantyWithUser = { ...warranty, usuario_id: targetUserId };
        const newWarranty = await ServicoGarantias.create(warrantyWithUser as any);
        setWarranties(prev => [newWarranty, ...prev]);
        const newState = JSON.parse(JSON.stringify(newWarranty));
        await addLog('create', 'garantia', `Nova garantia registada: ${newWarranty.description}`, user?.id, user?.name, null, newState);
        performAutoSync();
    };

    const updateWarranty = async (id: string, updates: Partial<Warranty>, user?: { id: string; name: string }) => {
        const current = warranties.find(w => w.id === id);
        const previousState = current ? JSON.parse(JSON.stringify(current)) : null;

        const targetUserId = activeContextUserId || user?.id || authUser?.id;
        const updatedWithUser = { ...updates, usuario_id: updates.usuario_id || current?.usuario_id || targetUserId };
        await ServicoGarantias.update(id, updatedWithUser);
        setWarranties(prev => prev.map(w => w.id === id ? { ...w, ...updatedWithUser } : w));

        const updated = warranties.find(w => w.id === id);
        const newState = updated ? JSON.parse(JSON.stringify({ ...updated, ...updates })) : null;

        await addLog('update', 'garantia', `Atualizou garantia: ${id}`, user?.id, user?.name, previousState, newState);
        performAutoSync();
    };

    const deleteWarranty = async (id: string, user?: { id: string; name: string }) => {
        const current = warranties.find(w => w.id === id);
        const previousState = current ? JSON.parse(JSON.stringify(current)) : null;

        await ServicoGarantias.delete(id, user?.id || 'system');
        setWarranties(prev => prev.filter(w => w.id !== id));
        await addLog('delete', 'garantia', `Removeu garantia: ${id}`, user?.id, user?.name, previousState, null);
        performAutoSync();
    };

    const restoreWarranty = async (id: string, user?: { id: string; name: string }) => {
        const item = warranties.find(w => w.id === id);
        await ServicoGarantias.restore(id);
        if (item) {
            setWarranties(prev => prev.map(w => w.id === id ? { ...w, deletedAt: undefined, restoredAt: new Date().toISOString() } : w));
            await addLog('update', 'garantia', `Restaurou garantia da lixeira: ${id}`, user?.id, user?.name);
        }
        performAutoSync();
    };

    const hardDeleteWarranty = async (id: string, user?: { id: string; name: string }) => {
        await ServicoGarantias.hardDelete(id);
        setWarranties(prev => prev.filter(w => w.id !== id));
        await addLog('delete', 'garantia', `Eliminou permanentemente garantia: ${id}`, user?.id, user?.name);
        performAutoSync();
    };


    // === SUPPLIERS / FORNECEDORES ===
    const addSupplier = async (supplier: Omit<Supplier, 'id' | 'createdAt'>, user?: { id: string; name: string }) => {
        const targetUserId = activeContextUserId || user?.id || authUser?.id;
        const id = 'SUP-' + Math.random().toString(36).substring(2, 10).toUpperCase();
        const newSupplier: Supplier = {
            ...supplier,
            id,
            status: supplier.status || 'active',
            createdAt: new Date(),
            usuario_id: targetUserId || undefined
        } as Supplier;
        await ServicoFornecedor.create(newSupplier);
        setSuppliers(prev => [newSupplier, ...prev]);
        await addLog('create', 'system', `Novo fornecedor/parceiro registado: ${newSupplier.name}`, user?.id, user?.name);
        performAutoSync();
    };

    const updateSupplier = async (id: string, updates: Partial<Supplier>, user?: { id: string; name: string }) => {
        await ServicoFornecedor.update(id, updates);
        setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
        await addLog('update', 'system', `Atualizou fornecedor/parceiro: ${id}`, user?.id, user?.name);
        performAutoSync();
    };

    const deleteSupplier = async (id: string, user?: { id: string; name: string }) => {
        await ServicoFornecedor.softDelete(id, user?.id);
        setSuppliers(prev => prev.filter(s => s.id !== id));
        await addLog('delete', 'system', `Removeu fornecedor/parceiro: ${id}`, user?.id, user?.name);
        performAutoSync();
    };

    // === CALENDAR TASKS / TAREFAS DO CALENDARIO ===
    const addCalendarTask = async (task: { title: string; description?: string; date: string }, user?: { id: string; name: string }) => {
        const targetUserId = activeContextUserId || user?.id || authUser?.id;
        const id = 'TASK-' + Math.random().toString(36).substring(2, 10).toUpperCase();
        const newTask: CalendarTask = {
            id,
            title: task.title,
            description: task.description,
            date: task.date,
            done: false,
            createdAt: new Date(),
            usuario_id: targetUserId || undefined
        };
        await ServicoTarefaCalendario.create(newTask);
        setCalendarTasks(prev => [...prev, newTask]);
        const [y, m, d] = task.date.split('-');
        await addNotification({
            id: crypto.randomUUID(),
            userId: user?.id,
            title: 'Tarefa Agendada',
            message: `Lembrete: "${task.title}" agendado para ${d}/${m}/${y}.`,
            type: 'info',
            source: 'system',
            read: false,
            timestamp: new Date()
        });
        await addLog('create', 'system', `Agendou tarefa no calendário: ${newTask.title} (${task.date})`, user?.id, user?.name);
        performAutoSync();
    };

    const deleteCalendarTask = async (id: string, user?: { id: string; name: string }) => {
        await ServicoTarefaCalendario.delete(id);
        setCalendarTasks(prev => prev.filter(t => t.id !== id));
        await addLog('delete', 'system', `Removeu tarefa do calendário: ${id}`, user?.id, user?.name);
        performAutoSync();
    };

    const runCollectionAutomation = useCallback(async () => {
        if (isDataLoading || credits.length === 0) return;

        const todayKey = new Date().toISOString().slice(0, 10);
        const thresholds = [0, 3, 7, 15, 30, 60];

        for (const credit of credits) {
            if (['paid', 'cancelled', 'rejected', 'pending_approval'].includes(credit.status)) continue;

            const dueDate = new Date(credit.dueDate);
            if (Number.isNaN(dueDate.getTime())) continue;

            const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / (24 * 60 * 60 * 1000));
            if (daysOverdue < 0) continue;

            if (daysOverdue > 0 && credit.status === 'active') {
                await updateCreditRef.current(credit.id, {
                    status: 'overdue',
                    daysOverdue
                }, { id: 'system', name: 'Sistema de Cobrança' });
            } else if (daysOverdue !== credit.daysOverdue) {
                await updateCreditRef.current(credit.id, { daysOverdue }, { id: 'system', name: 'Sistema de Cobrança' });
            }

            const stage = thresholds.reduce((current, threshold) => daysOverdue >= threshold ? threshold : current, 0);
            const notificationKey = `collection:${credit.id}:${stage}:${todayKey}`;
            if (!localStorage.getItem(notificationKey)) {
                const title = stage === 0 ? 'Crédito vence hoje' : `Cobrança D+${stage}`;
                await addNotification({
                    id: crypto.randomUUID(),
                    userId: credit.usuario_id,
                    title,
                    message: `${credit.clientName} tem saldo de ${credit.currentBalance.toLocaleString('pt-AO')} AOA no crédito ${credit.id}.`,
                    type: stage >= 30 ? 'error' : stage >= 7 ? 'warning' : 'info',
                    read: false,
                    timestamp: new Date()
                });
                localStorage.setItem(notificationKey, 'sent');
            }

            if (daysOverdue >= 30 && !legalCases.some(c => c.creditId === credit.id && c.stage !== 'closed')) {
                await addLegalCaseRef.current({
                    clientId: credit.clientId,
                    creditId: credit.id,
                    stage: 'interpellated',
                    priority: daysOverdue >= 60 ? 'critical' : 'high',
                    debtAmount: credit.currentBalance || credit.totalDue,
                    lastAction: `Gerado automaticamente por atraso de ${daysOverdue} dias.`,
                    notes: 'Processo criado pela esteira automática de cobrança.',
                    updatedAt: new Date().toISOString(),
                    usuario_id: credit.usuario_id
                }, { id: 'system', name: 'Sistema de Cobrança' });
            }
        }
    }, [addNotification, credits, isDataLoading, legalCases]);

    useEffect(() => {
        runCollectionAutomation().catch(error => console.error('[Cobrança] Falha na automação:', error));
    }, [runCollectionAutomation]);

    const addContract = async (contract: Contract) => {
        const targetUserId = activeContextUserId || authUser?.id;
        const contractWithUser = { ...contract, usuario_id: targetUserId };
        await ServicoContrato.add(contractWithUser);
        setContracts(prev => [contractWithUser, ...prev]);
        performAutoSync();
    };

    const updateContract = async (id: string, updates: Partial<Contract>) => {
        try {
            const contract = contracts.find(c => c.id === id);
            if (!contract) return;
            const updated = { ...contract, ...updates };
            await ServicoContrato.update(id, updated);
            setContracts(prev => prev.map(c => c.id === id ? updated : c));
            performAutoSync();
        } catch (error) {
            console.error("[ContextoDados] Erro ao atualizar contrato:", error);
        }
    };

    const markNotificationAsRead = async (id: string) => {
        await ServicoNotificacao.markAsRead(id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const markAllAsRead = async () => {
        await ServicoNotificacao.markAllAsRead();
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const deleteNotification = async (id: string) => {
        await ServicoNotificacao.delete(id);
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const clearNotifications = async (source?: 'system' | 'chat') => {
        if (source) {
            await db.run('DELETE FROM notifications WHERE source = ?', [source]);
            setNotifications(prev => prev.filter(n => n.source !== source));
            return;
        }

        await ServicoNotificacao.clearAll();
        setNotifications([]);
    };

    const sendMessage = async (m: Omit<ChatMessage, 'id' | 'timestamp' | 'read'>) => {
        const msg = { ...m, id: crypto.randomUUID(), timestamp: new Date(), read: false };
        await ServicoMensagem.send(msg);
        setMessages(prev => [...prev, msg]);

        await addNotification({
            id: crypto.randomUUID(),
            userId: m.receiverId,
            title: `Nova mensagem de ${m.senderName}`,
            message: m.content.length > 120 ? `${m.content.slice(0, 117)}...` : m.content,
            type: 'info',
            source: 'chat',
            read: false,
            timestamp: new Date()
        });
        performAutoSync();
    };

    const markMessageAsRead = async (id: string) => {
        await ServicoMensagem.markAsRead(id);
        setMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m));
    };

    const deleteMessage = async (id: string) => {
        await ServicoMensagem.delete(id);
        setMessages(prev => prev.filter(m => m.id !== id));
        performAutoSync();
    };

    const clearMessages = async (user1Id: string, user2Id: string) => {
        await ServicoMensagem.clearChat(user1Id, user2Id);
        setMessages(prev => prev.filter(m =>
            !((m.senderId === user1Id && m.receiverId === user2Id) ||
                (m.senderId === user2Id && m.receiverId === user1Id))
        ));
        performAutoSync();
    };

    const getAdvancedReport = async (startDate?: Date, endDate?: Date): Promise<AdvancedReportData> => {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        const isWithinRange = (dateLike: any) => {
            const date = new Date(dateLike);
            if (Number.isNaN(date.getTime())) return false;
            if (start && date < start) return false;
            if (end && date > end) return false;
            return true;
        };

        const relevantPayments = payments.filter(p => isWithinRange(p.paymentDate));
        const relevantCredits = credits.filter(c => isWithinRange(c.createdAt));

        const monthFormatter = new Intl.DateTimeFormat('pt-AO', { month: 'short', year: '2-digit' });
        const last12Months = Array.from({ length: 12 }, (_, index) => {
            const date = new Date();
            date.setMonth(date.getMonth() - (11 - index));
            return {
                key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
                month: monthFormatter.format(date),
                amount: 0
            };
        });

        const revenueByMonth = new Map(last12Months.map(item => [item.key, item]));
        relevantPayments.forEach(payment => {
            const date = new Date(payment.paymentDate);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const bucket = revenueByMonth.get(key);
            if (bucket) bucket.amount += Number(payment.amount || 0);
        });

        const statusLabels: Record<string, string> = {
            active: 'Ativo',
            overdue: 'Em atraso',
            paid: 'Pago',
            renegotiated: 'Renegociado',
            defaulted: 'Incumprimento',
            pending_approval: 'Pendente',
            rejected: 'Rejeitado',
            cancelled: 'Cancelado'
        };

        const statusMap = new Map<string, { status: string; count: number; totalAmount: number }>();
        relevantCredits.forEach(credit => {
            const key = credit.status || 'unknown';
            const current = statusMap.get(key) || {
                status: statusLabels[key] || key,
                count: 0,
                totalAmount: 0
            };
            current.count += 1;
            current.totalAmount += Number(credit.principalAmount || 0);
            statusMap.set(key, current);
        });

        const totalsByClient = new Map<string, number>();
        relevantPayments.forEach(payment => {
            totalsByClient.set(payment.clientName, (totalsByClient.get(payment.clientName) || 0) + Number(payment.amount || 0));
        });

        return {
            monthlyRevenue: Array.from(revenueByMonth.values()).map(({ month, amount }) => ({ month, amount })),
            creditsByStatus: Array.from(statusMap.values()).sort((a, b) => b.count - a.count),
            topClients: Array.from(totalsByClient.entries())
                .map(([name, totalPaid]) => ({ name, totalPaid }))
                .sort((a, b) => b.totalPaid - a.totalPaid)
                .slice(0, 5)
        };
    };

    const getUserActivityReport = async (userId: string, startDate?: Date, endDate?: Date) => {
        let filteredLogs = logs;

        if (userId && userId !== 'all') {
            filteredLogs = filteredLogs.filter(l => l.userId === userId);
        }

        if (startDate) {
            filteredLogs = filteredLogs.filter(l => new Date(l.timestamp) >= startDate);
        }

        if (endDate) {
            filteredLogs = filteredLogs.filter(l => new Date(l.timestamp) <= endDate);
        }

        return filteredLogs;
    };

    const deleteLog = async (id: string) => {
        await ServicoAuditoria.deleteLog(id);
        const updatedLogs = logs.filter(l => l.id !== id);
        setLogs(updatedLogs);
    };

    const clearUserLogs = async (userId: string) => {
        await ServicoAuditoria.clearUserLogs(userId);
        setLogs(prev => prev.filter(l => l.userId !== userId));
    };

    const toggleServerMode = async (enabled: boolean) => {
        if (!(window as any).electronAPI) return;

        if (enabled) {
            const result = await (window as any).electronAPI.startServer(companySettings.syncPasskey);
            if (result.success) {
                setServerInfo({
                    isRunning: true,
                    ip: result.ip,
                    ips: result.ips,
                    hostname: result.hostname,
                    port: result.port
                });

                if (appAdapter.setSharedConfig) {
                    appAdapter.setSharedConfig({
                        settings: companySettings,
                        clients,
                        credits,
                        payments
                    });
                }
            } else {
                throw new Error(result.message);
            }
        } else {
            await (window as any).electronAPI.stopServer();
            const netInfo = await (window as any).electronAPI.getNetworkInfo();
            setServerInfo({
                isRunning: false,
                ip: netInfo.ip,
                ips: netInfo.ips,
                hostname: netInfo.hostname,
                port: 3000
            });
            setGlobalDbMode('local');
            setDbAdapterModeState('local');
            setScopedLocalStorageItem('is_master', 'false');
        }
    };

    const promoteToMaster = async (passkey?: string) => {
        if (!(window as any).electronAPI) {
            await toggleServerMode(true);
            setScopedLocalStorageItem('is_master', 'true');
            return;
        }

        try {
            const result = await (window as any).electronAPI.promoteToMaster(passkey);
            if (result.success) {
                setGlobalDbMode('local');
                setDbAdapterModeState('local');
                setScopedLocalStorageItem('is_master', 'true');
                setScopedLocalStorageItem('sync_enabled', 'true');
                setServerInfo({
                    isRunning: true,
                    ip: result.ip,
                    ips: result.ips,
                    hostname: result.hostname,
                    port: result.port
                });
                refreshData();
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error("Error promoting to master:", error);
            await toggleServerMode(true);
            setScopedLocalStorageItem('is_master', 'true');
        }
    };

    useEffect(() => {
        if (!isDataLoading) {
            ServicoAuditoria.getLogs(50).then(recentLogs => {
                setLogs(recentLogs);
            }).catch(e => console.error("Background log load failed:", e));
        }
    }, [isDataLoading]);

    const addPaymentGatewayFunc = async (gateway: Omit<PaymentGateway, 'id' | 'createdAt'>) => {
        try {
            const newGateway = {
                ...gateway,
                id: `gateway_${Date.now()}`,
                createdAt: new Date().toISOString()
            };

            await db.run(
                `INSERT INTO payment_gateways (
                    id, name, provider, type, status, environment,
                    apiKey, apiSecret, merchantId, webhookUrl, webhookSecret,
                    transactionFee, feeType, logo, description, supportedMethods,
                    config, createdAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    newGateway.id, newGateway.name, newGateway.provider, newGateway.type,
                    newGateway.status, newGateway.environment, newGateway.apiKey || null,
                    newGateway.apiSecret || null, newGateway.merchantId || null,
                    newGateway.webhookUrl || null, newGateway.webhookSecret || null,
                    newGateway.transactionFee, newGateway.feeType, newGateway.logo || null,
                    newGateway.description || null, newGateway.supportedMethods || null,
                    newGateway.config || null, newGateway.createdAt
                ]
            );

            setPaymentGateways(prev => [newGateway as PaymentGateway, ...prev]);
            await addLog('create', 'payment_gateway', `Adicionou gateway: ${newGateway.name}`, authUser?.id, authUser?.name);
            performAutoSync();
        } catch (error) {
            console.error('[ContextoDados] Erro ao adicionar gateway:', error);
            throw error;
        }
    };

    const updatePaymentGatewayFunc = async (id: string, updates: Partial<PaymentGateway>) => {
        try {
            const gateway = paymentGateways.find(g => g.id === id);
            if (!gateway) return;

            const updatedGateway = { ...gateway, ...updates, updatedAt: new Date().toISOString() };

            await db.run(
                `UPDATE payment_gateways SET
                    name = ?, provider = ?, type = ?, status = ?, environment = ?,
                    apiKey = ?, apiSecret = ?, merchantId = ?, webhookUrl = ?, webhookSecret = ?,
                    transactionFee = ?, feeType = ?, description = ?, config = ?, updatedAt = ?
                WHERE id = ?`,
                [
                    updatedGateway.name, updatedGateway.provider, updatedGateway.type,
                    updatedGateway.status, updatedGateway.environment, updatedGateway.apiKey || null,
                    updatedGateway.apiSecret || null, updatedGateway.merchantId || null,
                    updatedGateway.webhookUrl || null, updatedGateway.webhookSecret || null,
                    updatedGateway.transactionFee, updatedGateway.feeType,
                    updatedGateway.description || null, updatedGateway.config || null,
                    updatedGateway.updatedAt, id
                ]
            );

            setPaymentGateways(prev => prev.map(g => g.id === id ? updatedGateway : g));
            await addLog('update', 'payment_gateway', `Atualizou gateway: ${updatedGateway.name}`, authUser?.id, authUser?.name);
            performAutoSync();
        } catch (error) {
            console.error('[ContextoDados] Erro ao atualizar gateway:', error);
            throw error;
        }
    };

    const deletePaymentGatewayFunc = async (id: string) => {
        try {
            const gateway = paymentGateways.find(g => g.id === id);

            await db.run('DELETE FROM payment_gateways WHERE id = ?', [id]);
            setPaymentGateways(prev => prev.filter(g => g.id !== id));

            if (gateway) {
                await addLog('delete', 'payment_gateway', `Removeu gateway: ${gateway.name}`, authUser?.id, authUser?.name);
            }
            performAutoSync();
        } catch (error) {
            console.error('[ContextoDados] Erro ao remover gateway:', error);
            throw error;
        }
    };

    const testGatewayConnectionFunc = async (id: string): Promise<GatewayTestResult> => {
        try {
            const gateway = paymentGateways.find(g => g.id === id);
            if (!gateway) {
                return { success: false, message: 'Gateway não encontrado' };
            }

            if (gateway.provider === 'plinqpay') {
                const { ServicoPlinqPay } = await import('@/servicos/ServicoPlinqPay');
                const service = new ServicoPlinqPay(gateway);
                const result = await service.testConnection();

                await updatePaymentGatewayFunc(id, {
                    lastTestedAt: new Date().toISOString(),
                    lastTestResult: result.success ? 'success' : 'failed'
                });

                return result;
            }

            return {
                success: true,
                message: 'Teste de conexão não implementado para este provedor',
                latency: 0
            };
        } catch (error: any) {
            console.error('[ContextoDados] Erro ao testar conexão:', error);
            return {
                success: false,
                message: error.message || 'Erro ao testar conexão'
            };
        }
    };

    const createPaymentReferenceFunc = async (data: {
        creditId: string;
        gatewayId: string;
        amount: number;
        expiresIn?: number;
    }): Promise<PaymentReference> => {
        try {
            const gateway = paymentGateways.find(g => g.id === data.gatewayId);
            if (!gateway) {
                throw new Error('Gateway não encontrado');
            }

            let reference = '';
            let entity = '';

            if (gateway.provider === 'plinqpay') {
                const { ServicoPlinqPay } = await import('@/servicos/ServicoPlinqPay');
                const service = new ServicoPlinqPay(gateway);
                const result = await service.generateReference({
                    amount: data.amount,
                    description: `Pagamento de crédito ${data.creditId}`,
                    expiresIn: data.expiresIn || 24,
                    metadata: { creditId: data.creditId }
                });

                if (!result.success || !result.reference) {
                    throw new Error(result.message || 'Erro ao gerar referência');
                }

                reference = result.reference;
                entity = result.entity || '';
            } else {
                reference = `REF${Date.now()}`;
            }

            const paymentRef: PaymentReference = {
                id: `ref_${Date.now()}`,
                creditId: data.creditId,
                gatewayId: data.gatewayId,
                reference,
                entity,
                amount: data.amount,
                status: 'pending',
                createdAt: new Date().toISOString()
            };

            await db.run(
                `INSERT INTO payment_references (
                    id, creditId, gatewayId, reference, entity, amount, status, createdAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    paymentRef.id, paymentRef.creditId, paymentRef.gatewayId,
                    paymentRef.reference, paymentRef.entity, paymentRef.amount,
                    paymentRef.status, paymentRef.createdAt
                ]
            );

            setPaymentReferences(prev => [paymentRef, ...prev]);
            performAutoSync();

            return paymentRef;
        } catch (error: any) {
            console.error('[ContextoDados] Erro ao criar referência:', error);
            throw error;
        }
    };

    const validatePaymentReferenceFunc = async (id: string, approve: boolean) => {
        try {
            const status = approve ? 'completed' : 'failed';
            const paidAt = approve ? new Date().toISOString() : undefined;

            await db.run(
                'UPDATE payment_references SET status = ?, paidAt = ? WHERE id = ?',
                [status, paidAt || null, id]
            );

            setPaymentReferences(prev =>
                prev.map(ref => ref.id === id ? { ...ref, status, paidAt } : ref)
            );

            performAutoSync();
        } catch (error) {
            console.error('[ContextoDados] Erro ao validar referência:', error);
            throw error;
        }
    };

    const uploadPaymentProofFunc = async (referenceId: string, proofImage: string) => {
        try {
            await db.run(
                'UPDATE payment_references SET proofImage = ?, status = ?, submittedAt = ? WHERE id = ?',
                [proofImage, 'pending_validation', new Date().toISOString(), referenceId]
            );

            setPaymentReferences(prev =>
                prev.map(ref =>
                    ref.id === referenceId
                        ? { ...ref, proofImage, status: 'pending_validation', submittedAt: new Date().toISOString() }
                        : ref
                )
            );

            performAutoSync();
        } catch (error) {
            console.error('[ContextoDados] Erro ao enviar comprovativo:', error);
            throw error;
        }
    };

    const addReference = async (data: any) => {
        const reference: PaymentReference = {
            id: data.id || `ref_${Date.now()}`,
            creditId: data.creditId,
            gatewayId: data.gatewayId || 'manual',
            reference: data.reference || `MAN${Date.now()}`,
            entity: data.entity || '',
            amount: Number(data.amount || 0),
            status: data.status || 'pending',
            createdAt: data.createdAt || new Date().toISOString(),
            expiresAt: data.expiresAt,
            paidAt: data.paidAt,
            proofImage: data.proofImage
        } as PaymentReference;

        await db.run(
            `INSERT INTO payment_references (
                id, creditId, gatewayId, reference, entity, amount, status, createdAt, expiresAt, paidAt, proofImage
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                reference.id,
                reference.creditId,
                reference.gatewayId,
                reference.reference,
                reference.entity || null,
                reference.amount,
                reference.status,
                reference.createdAt,
                (reference as any).expiresAt || null,
                (reference as any).paidAt || null,
                (reference as any).proofImage || null
            ]
        );
        setPaymentReferences(prev => [reference, ...prev]);
        performAutoSync();
    };

    const deleteReference = async (id: string) => {
        await db.run('DELETE FROM payment_references WHERE id = ?', [id]);
        setPaymentReferences(prev => prev.filter(ref => ref.id !== id));
        performAutoSync();
    };

    const getUserLimit = async (role: 'admin' | 'manager'): Promise<UserLimit | undefined> => {
        try {
            const limit = await db.get<UserLimit>('SELECT * FROM user_limits WHERE role = ?', [role]);
            if (limit) {
                return {
                    ...limit,
                    restrictionsEnabled: Boolean(limit.restrictionsEnabled),
                    updatedAt: new Date(limit.updatedAt)
                };
            }
            return undefined;
        } catch (error) {
            console.error('[ContextoDados] Erro ao buscar limites:', error);
            return undefined;
        }
    };

    const updateUserLimit = async (limit: UserLimit) => {
        try {
            const updatedAt = new Date().toISOString();
            await db.run(
                `UPDATE user_limits SET 
                    maxTransaction = ?, 
                    dailyLimit = ?, 
                    monthlyLimit = ?, 
                    restrictionsEnabled = ?, 
                    updatedAt = ? 
                WHERE role = ?`,
                [
                    limit.maxTransaction,
                    limit.dailyLimit,
                    limit.monthlyLimit,
                    limit.restrictionsEnabled ? 1 : 0,
                    updatedAt,
                    limit.role
                ]
            );

            setUserLimits(prev => prev.map(l => l.role === limit.role ? { ...limit, updatedAt: new Date(updatedAt) } : l));
            performAutoSync();
        } catch (error) {
            console.error('[ContextoDados] Erro ao atualizar limites:', error);
            throw error;
        }
    };

    const closeMonth = async (
        id: string,
        month: number,
        year: number,
        capitalApplied: number,
        projectedProfit: number,
        realizedProfit: number,
        overdueAmount: number,
        liquidationRate: number,
        closedBy: string
    ) => {
        const closedAt = new Date().toISOString();
        await db.run(
            `INSERT OR REPLACE INTO closed_months (id, month, year, capitalApplied, projectedProfit, realizedProfit, overdueAmount, liquidationRate, closedAt, closedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, month, year, capitalApplied, projectedProfit, realizedProfit, overdueAmount, liquidationRate, closedAt, closedBy]
        );
        const allClosed = await db.all<any>('SELECT * FROM closed_months');
        setClosedMonths(allClosed);

        await addLog(
            'create',
            'system',
            `Fecho do mês efetuado com sucesso para o período ${id}.`,
            authUser?.id || 'system',
            authUser?.name || 'Sistema'
        );
    };

    const reopenMonth = async (id: string) => {
        await db.run('DELETE FROM closed_months WHERE id = ?', [id]);
        const allClosed = await db.all<any>('SELECT * FROM closed_months');
        setClosedMonths(allClosed);

        await addLog(
            'delete',
            'system',
            `Reabertura da folha mensal do período ${id} efetuada com sucesso.`,
            authUser?.id || 'system',
            authUser?.name || 'Sistema'
        );
    };

    const value: ContextoDadosType = {
        users,
        clients: filteredClients,
        allClients: clients,
        credits: filteredCredits,
        payments: filteredPayments,
        contracts: filteredContracts,
        notifications: filteredNotifications,
        simulations: filteredSimulations,
        logs: filteredLogs,
        messages,
        companySettings,
        messageTemplates,
        updateMessageTemplate,
        addMessageTemplate,
        deleteMessageTemplate,
        accountingEntries: filteredAccountingEntries,
        addAccountingEntry,
        addClient,
        updateClient,
        deleteClient,
        addDocumentToClient,
        deleteDocumentFromClient,
        addCredit,
        updateCredit,
        adjustCreditCharges,
        reinforceCredit,
        deleteCredit,
        approveCredit,
        rejectCredit,
        addPayment,
        deletePayment,
        addSimulation,
        deleteSimulation,
        addContract,
        addNotification,
        markNotificationAsRead,
        markAllAsRead,
        deleteNotification,
        clearNotifications,
        addLog,
        updateCompanySettings,
        interestTiers,
        saveInterestTiers,
        sendMessage,
        markMessageAsRead,
        deleteMessage,
        clearMessages,
        syncData,
        refreshData,
        getAdvancedReport,
        getUserLimit,
        updateUserLimit,
        getUserActivityReport,
        deleteLog,
        clearUserLogs,
        clearAllLogs,
        loadMoreLogs,
        loadMoreAccountingEntries,
        paymentGateways,
        addPaymentGateway: addPaymentGatewayFunc,
        updatePaymentGateway: updatePaymentGatewayFunc,
        deletePaymentGateway: deletePaymentGatewayFunc,
        paymentReferences,
        createPaymentReference: createPaymentReferenceFunc,
        validatePaymentReference: validatePaymentReferenceFunc,
        testGatewayConnection: testGatewayConnectionFunc,
        addReference,
        deleteReference,
        uploadPaymentProof: uploadPaymentProofFunc,
        serverInfo,
        setServerInfo,
        connectedClients,
        setConnectedClients,
        toggleServerMode,
        promoteToMaster,
        legalCases: filteredLegalCases,
        addLegalCase,
        updateLegalCase,
        deleteLegalCase,
        suppliers: filteredSuppliers,
        addSupplier,
        updateSupplier,
        deleteSupplier,
        calendarTasks,
        addCalendarTask,
        deleteCalendarTask,
        warranties: filteredWarranties,
        addWarranty,
        updateWarranty,
        deleteWarranty,
        isDataLoading,
        deletedClients,
        deletedCredits,
        deletedPayments,
        restoreClient,
        hardDeleteClient,
        restoreCredit,
        hardDeleteCredit,
        restorePayment,
        hardDeletePayment,
        restoreLegalCase,
        hardDeleteLegalCase,
        restoreWarranty,
        hardDeleteWarranty,
        activeContextUserId,
        setContextUserId,
        dbAdapterMode,
        closedMonths,
        closeMonth,
        reopenMonth,
    };

    return <ContextoDados.Provider value={value}>{children}</ContextoDados.Provider>;
};

export const useData = () => {
    const context = useContext(ContextoDados);
    if (!context) throw new Error('useData must be used within a DataProvider');
    return context;
};
