export interface CompanySettings {
    name: string;
    nif: string;
    address: string;
    logo: string | null;
    reportLogo: string | null;
    watermarkLogo: string | null;
    currency: string;
    customClauses?: string;
    rescueKey?: string;
    phone?: string;
    primaryColor?: number[];
    secondaryColor?: number[];
    sessionTimeout: number;
    email?: string;
    whatsapp?: string;
    whatsappAutoNotify?: boolean;
    whatsappVerified?: boolean;
    syncEnabled: boolean;
    syncUrl?: string;
    syncApiKey?: string;
    lastSync?: string;
    maintenanceMode?: number | boolean;
    allowedModulesDuringMaintenance?: string | string[];
    enableGatewaysModule?: boolean;
    enableGatewaysModuleAdminOnly?: boolean;
    enableProfileActivity?: boolean;
    enableProfileActivityAdminOnly?: boolean;
    lastBackupDate?: string;
    syncPasskey?: string;
    digitalSignatureEnabled: boolean;
    authorizedSigners: string | string[];
    bankingInfo?: string | any[];
    contractTemplates?: string | any[];
    installDate?: string;
    financialLock?: boolean; // Bloqueio do módulo financeiro (Auditoria)
    enableWarrantiesModule?: boolean;
    enableWarrantiesModuleAdminOnly?: boolean;
    enableLegalModule?: boolean;
    enableLegalModuleAdminOnly?: boolean;
    enableScoringModule?: boolean;
    enableScoringModuleAdminOnly?: boolean;
    enableSuppliersModule?: boolean;
    enableSuppliersModuleAdminOnly?: boolean;
    enableMultiTenant?: boolean;

    // Simulation Defaults
    defaultSimulationInterestRate?: number;
    defaultSimulationAdminFee?: number;
    defaultSimulationIof?: number;


    // SMTP Configuration
    smtpHost?: string;
    smtpPort?: string;
    smtpUser?: string;
    smtpPassword?: string;
    smtpSecure?: boolean;
    smtpFromName?: string;
    licenseKey?: string;
    location?: string;
    /** Endereço do sítio da empresa, mostrado no cabeçalho. */
    website?: string;
    /** Ramo de actividade, escrito por cima do nome no cabeçalho. */
    segment?: string;
    /** Assinatura da marca, escrita por baixo do nome no cabeçalho. */
    slogan?: string;
}




