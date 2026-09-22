export interface ElectronAPI {
    userAuthLogin: (login: string, password: string) => Promise<{ authenticated: boolean; requires2FA?: boolean; requiresMfaEnrollment?: boolean; notFound?: boolean; userId?: string; user?: any }>;
    userAuthVerifyTotp: (userId: string, token: string) => Promise<{ authenticated: boolean; replayed?: boolean; user?: any }>;
    userAuthStatus: () => Promise<{ authenticated: boolean; user?: any; expiresAt?: string }>;
    userAuthBootstrapStatus: () => Promise<{ hasUsers: boolean }>;
    userAuthLogout: () => Promise<{ authenticated: false }>;
    userAuthMfaBegin: () => Promise<{ secret: string; qrCode: string }>;
    userAuthMfaEnable: (token: string) => Promise<{ enabled: boolean; user?: any; recoveryCodes?: string[] }>;
    userAuthMfaDisable: (token: string) => Promise<{ disabled: boolean; user?: any }>;
    dbSchemaReady: () => Promise<{ ready: true }>;
    masterAuthStatus: () => Promise<{ configured: boolean; authenticated: boolean; requiresMfa?: boolean; requiresMfaEnrollment?: boolean; unavailable?: boolean; expiresAt: string | null }>;
    masterAuthSetup: (password: string) => Promise<{ configured: boolean; authenticated: boolean; requiresMfaEnrollment?: boolean; expiresAt: string | null }>;
    masterAuthLogin: (password: string) => Promise<{ configured: boolean; authenticated: boolean; requiresMfa?: boolean; requiresMfaEnrollment?: boolean; expiresAt: string | null }>;
    masterAuthMfaBegin: () => Promise<{ secret: string; qrCode: string }>;
    masterAuthMfaConfirm: (token: string) => Promise<{ authenticated: boolean; recoveryCodes?: string[]; expiresAt?: string | null }>;
    masterAuthMfaVerify: (token: string) => Promise<{ authenticated: boolean; recovered?: boolean; expiresAt?: string | null }>;
    masterAuthChangePassword: (currentPassword: string, newPassword: string) => Promise<{ configured: boolean; authenticated: boolean; expiresAt: string | null }>;
    masterAuthLogout: () => Promise<{ configured: boolean; authenticated: boolean; expiresAt: string | null }>;
    dbExecute: (sql: string, params?: any[]) => Promise<{ lastInsertRowid?: number | string; changes?: number }>;
    dbQuery: <T = any>(sql: string, params?: any[]) => Promise<T[]>;
    dbGet: <T = any>(sql: string, params?: any[]) => Promise<T | undefined>;
    dbExec: (sql: string) => Promise<{ success: boolean } | void>;
    dbTransaction: (statements: Array<{ sql: string; params?: any[]; type?: 'execute' | 'exec'; expectChanges?: number }>) => Promise<any[]>;
    dbLoad: () => Promise<Uint8Array | null>;
    dbSave: (data: Uint8Array) => Promise<boolean>;
    dbImport: (data: Uint8Array, confirmation: string) => Promise<{ success: boolean }>;
    dbExport: () => Promise<{
        success: boolean;
        canceled?: boolean;
        error?: string;
        filePath?: string;
        size?: number;
        totalPages?: number;
    }>;
    backupDatabase: () => Promise<{ success: boolean; error?: string; filePath?: string; size?: number; checksum?: string; formatVersion?: number; createdAt?: string }>;
    getBackupRecoveryKey: () => Promise<{ recoveryKey: string }>;
    restoreBackup: (recoveryKey?: string) => Promise<{ success: boolean; error?: string; canceled?: boolean; filePath?: string; restoredAt?: string; reloadRequired?: boolean }>;
    listAccounts: () => Promise<{
        activeAccountId: string;
        accounts: Array<{
            id: string;
            name: string;
            createdAt: string;
            updatedAt: string;
            lastOpenedAt?: string;
            isDefault?: boolean;
            dbExists?: boolean;
        }>;
    }>;
    createAccount: (name: string) => Promise<{ success: boolean; error?: string; account?: any; activeAccountId?: string; relaunching?: boolean }>;
    switchAccount: (accountId: string) => Promise<{ success: boolean; error?: string; activeAccountId?: string; relaunching?: boolean; reloadRequired?: boolean }>;
    deleteAccount: (accountId: string, confirmation: string, backupAcknowledged: boolean) => Promise<{
        success: boolean;
        error?: string;
        deletedAccountId?: string;
        activeAccountId?: string;
        archivedPath?: string;
        switchedToDefault?: boolean;
        reloadRequired?: boolean;
    }>;

    // Scanner API
    scanDocument: (deviceId?: string) => Promise<{ success: boolean; image?: string; message?: string }>;
    listDevices: () => Promise<{ deviceId: string; name: string; type: string; description: string }[]>;

    // Server API
    startServer: (passkey: string) => Promise<{ success: boolean; error?: string }>;
    stopServer: () => Promise<{ success: boolean; error?: string }>;
    getIpAddress: () => Promise<string>;
    verifyWhatsApp: (phone: string) => Promise<{ registered: boolean; error?: string }>;
    isServerRunning: () => Promise<boolean>;
    getConnectedClients: () => Promise<string[]>;
    onSyncReceived: (callback: (data: string) => void) => () => void;
    onClientsUpdated: (callback: (clients: string[]) => void) => () => void;
    onMasterDiscovered: (callback: (data: any) => void) => () => void;
    onDbUpdate: (callback: () => void) => () => void;
    notifyDbUpdate: () => Promise<void>;
    getNetworkInfo: () => Promise<any>;
    fetchServerConfig: (params: { url: string; passkey: string }) => Promise<any>;
    setSharedConfig: (config: any) => Promise<any>;
    promoteToMaster: (passkey?: string) => Promise<any>;
    getMeshPriority: () => Promise<number>;
    selectImage: () => Promise<string | null>;
    saveAvatar: (userId: string, base64Data: string) => Promise<string>;
    saveLogo: (type: string, base64Data: string) => Promise<string>;
    deleteAvatar: (userId: string) => Promise<boolean>;
    lookupBI: (biNumber: string, type?: string) => Promise<any>;
    isPackaged: boolean;
    sendEmail: (params: { smtpSettings: any, emailOptions: any }) => Promise<{ success: boolean; error?: string }>;
    composeNativeEmail: (params: { to: string; subject: string; body: string; attachment?: any }) => Promise<{ success: boolean; error?: string }>;
    getPrinters: () => Promise<Array<{ name: string; displayName?: string; description?: string; status?: number; isDefault?: boolean }>>;
    printPdf: (params: {
        pdfData: Uint8Array | number[] | string;
        fileName?: string;
        printerName?: string;
        silent?: boolean;
    }) => Promise<{ success: boolean; printerName?: string; printers?: any[]; error?: string }>;
    readLicenseKeys: () => Promise<{ success: boolean; publicKey?: string; hasPrivateKey?: boolean; error?: string }>;
    generateLicenseKeypair: () => Promise<{ success: boolean; publicKey: string; hasPrivateKey: boolean }>;
    signLicensePayload: (payload: string) => Promise<{ success: boolean; payload: string; signature: string }>;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}




