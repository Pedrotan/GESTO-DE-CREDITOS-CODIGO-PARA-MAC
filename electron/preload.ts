import { contextBridge, ipcRenderer } from 'electron';

type SqlParams = unknown[];
type TransactionStatement = {
    sql: string;
    params?: SqlParams;
    type?: 'execute' | 'exec';
    expectChanges?: number;
};

const MAX_SQL_LENGTH = 200_000;
const MAX_TRANSACTION_STATEMENTS = 1_000;
const MAX_PARAM_COUNT = 500;
const MAX_STRING_PARAM_LENGTH = 1_000_000;
const MAX_BASE64_IMAGE_LENGTH = 15 * 1024 * 1024;
const MAX_TEXT_PAYLOAD_LENGTH = 2 * 1024 * 1024;

const BLOCKED_SQL_PATTERNS = [
    /\bATTACH\b/i,
    /\bDETACH\b/i,
    /\bLOAD_EXTENSION\b/i,
    /\bPRAGMA\s+(key|rekey|hexkey|textkey|cipher|cipher_|legacy)\b/i
];

const READ_SQL = /^(SELECT|WITH|PRAGMA)\b/i;
const WRITE_SQL = /^(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|REINDEX|ANALYZE|PRAGMA)\b/i;
const EXEC_SQL = /^(SELECT|WITH|INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|REINDEX|ANALYZE|PRAGMA)\b/i;

const normalizeSql = (sql: unknown) => {
    if (typeof sql !== 'string') throw new TypeError('SQL invalido.');
    const normalized = sql.trim();
    if (!normalized) throw new TypeError('SQL vazio.');
    if (normalized.length > MAX_SQL_LENGTH) throw new TypeError('SQL demasiado grande.');

    for (const pattern of BLOCKED_SQL_PATTERNS) {
        if (pattern.test(normalized)) {
            throw new Error('Instrucao SQLite bloqueada pelo preload.');
        }
    }

    return normalized;
};

const assertSqlKind = (sql: string, pattern: RegExp, label: string) => {
    if (!pattern.test(sql)) throw new Error(`${label} recebeu uma instrucao SQL nao permitida.`);
};

const assertSingleStatement = (sql: string) => {
    const withoutTrailingSemicolon = sql.replace(/;\s*$/, '');
    if (withoutTrailingSemicolon.includes(';')) {
        throw new Error('Use dbTransaction para multiplas instrucoes SQL.');
    }
};

const sanitizeSqlParams = (params: unknown = []): SqlParams => {
    if (params == null) return [];
    if (!Array.isArray(params)) throw new TypeError('Parametros SQL devem ser enviados como array.');
    if (params.length > MAX_PARAM_COUNT) throw new Error('Demasiados parametros SQL.');

    return params.map((value) => {
        if (value === undefined) return null;
        if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            if (value.length > MAX_STRING_PARAM_LENGTH) throw new Error('Parametro SQL textual demasiado grande.');
            return value;
        }
        if (value instanceof Uint8Array || value instanceof ArrayBuffer) return value;
        throw new TypeError('Parametro SQL nao suportado. Use texto, numero, booleano, null ou binario.');
    });
};

const sanitizeTransactionStatements = (statements: unknown): TransactionStatement[] => {
    if (!Array.isArray(statements)) throw new TypeError('Transacao invalida.');
    if (statements.length === 0) throw new Error('Transacao vazia.');
    if (statements.length > MAX_TRANSACTION_STATEMENTS) throw new Error('Transacao com demasiadas instrucoes.');

    return statements.map((statement) => {
        if (!statement || typeof statement !== 'object') throw new TypeError('Instrucao de transacao invalida.');
        const item = statement as TransactionStatement;
        const sql = normalizeSql(item.sql);
        const type = item.type === 'exec' ? 'exec' : 'execute';
        const expectChanges = item.expectChanges;
        if (expectChanges !== undefined && (!Number.isSafeInteger(expectChanges) || expectChanges < 0 || expectChanges > 1_000_000)) {
            throw new Error('Contagem esperada de alteraÃ§Ãµes invalida.');
        }
        assertSqlKind(sql, type === 'exec' ? EXEC_SQL : WRITE_SQL, 'dbTransaction');
        if (type !== 'exec') assertSingleStatement(sql);
        return {
            sql,
            params: sanitizeSqlParams(item.params),
            type,
            expectChanges
        };
    });
};

const ensureText = (value: unknown, label: string, maxLength = MAX_TEXT_PAYLOAD_LENGTH) => {
    if (typeof value !== 'string') throw new TypeError(`${label} invalido.`);
    if (value.length > maxLength) throw new Error(`${label} demasiado grande.`);
    return value;
};

const ensureIdentifier = (value: unknown, label: string) => {
    const text = ensureText(value, label, 128).trim();
    if (!/^[\w.-]+$/u.test(text)) throw new Error(`${label} contem caracteres invalidos.`);
    return text;
};

const subscribe = <T>(channel: string, callback: (data: T) => void) => {
    if (typeof callback !== 'function') throw new TypeError('Callback invalido.');
    const listener = (_event: Electron.IpcRendererEvent, data: T) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
};

const api = Object.freeze({
    masterAuthStatus: () => ipcRenderer.invoke('master-auth-status'),
    masterAuthSetup: (password: string) => ipcRenderer.invoke('master-auth-setup', ensureText(password, 'Palavra-passe', 256)),
    masterAuthLogin: (password: string) => ipcRenderer.invoke('master-auth-login', ensureText(password, 'Palavra-passe', 256)),
    masterAuthMfaBegin: () => ipcRenderer.invoke('master-auth-mfa-begin'),
    masterAuthMfaConfirm: (token: string) => ipcRenderer.invoke('master-auth-mfa-confirm', ensureText(token, 'Código MFA', 32)),
    masterAuthMfaVerify: (token: string) => ipcRenderer.invoke('master-auth-mfa-verify', ensureText(token, 'Código MFA', 32)),
    masterAuthChangePassword: (currentPassword: string, newPassword: string) => ipcRenderer.invoke('master-auth-change-password', {
        currentPassword: ensureText(currentPassword, 'Palavra-passe atual', 256),
        newPassword: ensureText(newPassword, 'Nova palavra-passe', 256)
    }),
    masterAuthLogout: () => ipcRenderer.invoke('master-auth-logout'),
    userAuthLogin: (login: string, password: string) => ipcRenderer.invoke('user-auth-login', {
        login: ensureText(login, 'Utilizador', 254), password: ensureText(password, 'Palavra-passe', 256)
    }),
    userAuthVerifyTotp: (userId: string, token: string) => ipcRenderer.invoke('user-auth-verify-totp', {
        userId: ensureIdentifier(userId, 'Utilizador'), token: ensureText(token, 'Código MFA', 16)
    }),
    userAuthStatus: () => ipcRenderer.invoke('user-auth-status'),
    userAuthBootstrapStatus: () => ipcRenderer.invoke('user-auth-bootstrap-status'),
    userAuthLogout: () => ipcRenderer.invoke('user-auth-logout'),
    userAuthMfaBegin: () => ipcRenderer.invoke('user-auth-mfa-begin'),
    userAuthMfaEnable: (token: string) => ipcRenderer.invoke('user-auth-mfa-enable', {
        token: ensureText(token, 'CÃ³digo MFA', 6)
    }),
    userAuthMfaDisable: (token: string) => ipcRenderer.invoke('user-auth-mfa-disable', {
        token: ensureText(token, 'CÃ³digo MFA', 6)
    }),
    dbSchemaReady: () => ipcRenderer.invoke('db-schema-ready'),
    dbSchemaStatus: () => ipcRenderer.invoke('db-schema-status'),
    dbOptimize: () => ipcRenderer.invoke('db-optimize'),
    dbExecute: (sql: string, params?: SqlParams) => {
        const normalizedSql = normalizeSql(sql);
        assertSqlKind(normalizedSql, WRITE_SQL, 'dbExecute');
        assertSingleStatement(normalizedSql);
        return ipcRenderer.invoke('db-execute', normalizedSql, sanitizeSqlParams(params));
    },
    dbQuery: (sql: string, params?: SqlParams) => {
        const normalizedSql = normalizeSql(sql);
        assertSqlKind(normalizedSql, READ_SQL, 'dbQuery');
        assertSingleStatement(normalizedSql);
        return ipcRenderer.invoke('db-query', normalizedSql, sanitizeSqlParams(params));
    },
    dbGet: (sql: string, params?: SqlParams) => {
        const normalizedSql = normalizeSql(sql);
        assertSqlKind(normalizedSql, READ_SQL, 'dbGet');
        assertSingleStatement(normalizedSql);
        return ipcRenderer.invoke('db-get', normalizedSql, sanitizeSqlParams(params));
    },
    dbExec: (sql: string) => {
        const normalizedSql = normalizeSql(sql);
        assertSqlKind(normalizedSql, EXEC_SQL, 'dbExec');
        return ipcRenderer.invoke('db-exec', normalizedSql);
    },
    dbTransaction: (statements: TransactionStatement[]) => {
        return ipcRenderer.invoke('db-transaction', sanitizeTransactionStatements(statements));
    },

    dbLoad: () => ipcRenderer.invoke('db-load'),
    dbSave: (data: Uint8Array) => ipcRenderer.invoke('db-save', data),
    dbImport: (data: Uint8Array, confirmation: string) => ipcRenderer.invoke('db-import', {
        data,
        confirmation: ensureText(confirmation, 'Confirmacao', 64)
    }),
    dbExport: () => ipcRenderer.invoke('db-export'),
    backupDatabase: () => ipcRenderer.invoke('backup-database'),
    getBackupRecoveryKey: () => ipcRenderer.invoke('get-backup-recovery-key'),
    restoreBackup: (recoveryKey?: string) => ipcRenderer.invoke('restore-backup', {
        recoveryKey: recoveryKey ? ensureText(recoveryKey, 'Chave de recuperacao', 128) : ''
    }),
    listAccounts: () => ipcRenderer.invoke('accounts-list'),
    createAccount: (name: string) => ipcRenderer.invoke('accounts-create', { name: ensureText(name, 'Nome da conta', 120).trim() }),
    switchAccount: (accountId: string) => ipcRenderer.invoke('accounts-switch', ensureIdentifier(accountId, 'Conta')),
    deleteAccount: (accountId: string, confirmation: string, backupAcknowledged: boolean) => ipcRenderer.invoke('accounts-delete', {
        accountId: ensureIdentifier(accountId, 'Conta'),
        confirmation: ensureText(confirmation, 'Confirmacao', 120),
        backupAcknowledged: backupAcknowledged === true
    }),
    saveAvatar: (userId: string, base64Data: string) => ipcRenderer.invoke('save-avatar', {
        userId: ensureIdentifier(userId, 'Utilizador'),
        base64Data: ensureText(base64Data, 'Imagem', MAX_BASE64_IMAGE_LENGTH)
    }),
    saveLogo: (type: string, base64Data: string) => ipcRenderer.invoke('save-logo', {
        type: ensureIdentifier(type, 'Tipo de logo'),
        base64Data: ensureText(base64Data, 'Imagem', MAX_BASE64_IMAGE_LENGTH)
    }),
    selectImage: () => ipcRenderer.invoke('select-image'),
    deleteAvatar: (userId: string) => ipcRenderer.invoke('delete-avatar', ensureIdentifier(userId, 'Utilizador')),
    lookupBI: (biNumber: string, type?: string) => ipcRenderer.invoke(
        'lookup-bi',
        ensureText(biNumber, 'Documento', 40).trim(),
        type ? ensureText(type, 'Tipo', 32).trim() : undefined
    ),

    startServer: (passkey?: string) => ipcRenderer.invoke('start-server', passkey ? ensureText(passkey, 'Chave', 256) : undefined),
    stopServer: () => ipcRenderer.invoke('stop-server'),
    setSharedConfig: (config: any) => ipcRenderer.invoke('set-shared-config', config),
    getIpAddress: () => ipcRenderer.invoke('get-ip-address'),
    getNetworkInfo: () => ipcRenderer.invoke('get-network-info'),
    fetchServerConfig: (params: { url: string, passkey: string }) => ipcRenderer.invoke('fetch-server-config', {
        url: ensureText(params?.url, 'URL', 2048),
        passkey: ensureText(params?.passkey || '', 'Chave', 256)
    }),
    verifyWhatsApp: (phone: string) => ipcRenderer.invoke('verify-whatsapp', ensureText(phone, 'Telefone', 40)),
    isServerRunning: () => ipcRenderer.invoke('is-server-running'),
    getConnectedClients: () => ipcRenderer.invoke('get-connected-clients'),
    onSyncReceived: (callback: (data: string) => void) => subscribe('sync-received', callback),
    onClientsUpdated: (callback: (clients: string[]) => void) => subscribe('clients-updated', callback),
    scanDocument: (deviceId?: string) => ipcRenderer.invoke('scan-document', deviceId ? ensureText(deviceId, 'Scanner', 512) : undefined),
    listDevices: () => ipcRenderer.invoke('list-devices'),
    isPackaged: (() => {
        try {
            return Boolean(ipcRenderer.sendSync('is-packaged'));
        } catch {
            return false;
        }
    })(),
    getMachineId: () => ipcRenderer.invoke('get-machine-id'),
    getActivations: () => ipcRenderer.invoke('get-activations'),
    notifyDbUpdate: () => ipcRenderer.invoke('notify-db-update'),

    onMasterDiscovered: (callback: (data: any) => void) => subscribe('master-discovered', callback),
    onDbUpdate: (callback: () => void) => subscribe('db-update', callback),

    promoteToMaster: (passkey?: string) => ipcRenderer.invoke('promote-to-master', passkey ? ensureText(passkey, 'Chave', 256) : undefined),
    getMeshPriority: () => ipcRenderer.invoke('get-mesh-priority'),

    sendEmail: (params: { smtpSettings: any, emailOptions: any }) => ipcRenderer.invoke('send-email', params),
    composeNativeEmail: (params: { to: string, subject: string, body: string, attachment?: any }) => ipcRenderer.invoke('compose-native-email', params),
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    printPdf: (params: { pdfData: Uint8Array | number[] | string; fileName?: string; printerName?: string; silent?: boolean }) => ipcRenderer.invoke('print-pdf', params),

    encryptData: (data: string) => ipcRenderer.invoke('encrypt-data', ensureText(data, 'Dados')),
    decryptData: (data: string) => ipcRenderer.invoke('decrypt-data', ensureText(data, 'Dados')),

    readLicenseKeys: () => ipcRenderer.invoke('read-license-keys'),
    generateLicenseKeypair: () => ipcRenderer.invoke('generate-license-keypair'),
    signLicensePayload: (payload: string) => ipcRenderer.invoke('sign-license-payload', ensureText(payload, 'Payload da licenca', 64_000)),

    dbNuclearReset: (confirmation?: string) => ipcRenderer.invoke('db-nuclear-reset', {
        confirmation: confirmation ? ensureText(confirmation, 'Confirmacao', 64) : ''
    })
});

contextBridge.exposeInMainWorld('electronAPI', api);
