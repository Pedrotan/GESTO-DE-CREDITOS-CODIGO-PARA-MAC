import initSqlJs, { Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { LEDGER_PROTECTION_SQL } from '@/bibliotecas/esquema-ledger';
import { buildInstallmentSchedule } from '@/bibliotecas/cronograma-prestacoes';

let db: Database | null = null;
let sqlPromise: Promise<any> | null = null;
const IS_DEV = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const IDB_NAME = IS_DEV ? 'TangoGestaoCreditosERP_DevDB' : 'TangoGestaoCreditosERPDB';
const IDB_STORE = 'sqlite_store';
const IDB_KEY = 'main_db';

export type SqlTransactionStatement = {
    sql: string;
    params?: any[];
    type?: 'execute' | 'exec';
    expectChanges?: number;
};

const loadFromIDB = (): Promise<Uint8Array | null> => {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = (e: any) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = (e: any) => {
            const db = e.target.result;
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
            req.onsuccess = async () => {
                if (req.result) {
                    if (req.result instanceof Blob) {
                        const buf = await req.result.arrayBuffer();
                        resolve(new Uint8Array(buf));
                    } else {
                        resolve(req.result);
                    }
                } else resolve(null);
            };
            req.onerror = () => reject(req.error || new Error('Falha ao ler a base de dados local.'));
        };
        req.onerror = () => reject(req.error || new Error('Falha ao abrir o armazenamento local.'));
    });
};

const saveToIDB = (data: Uint8Array): Promise<void> => {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = (e: any) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = (e: any) => {
            const db = e.target.result;
            const tx = db.transaction(IDB_STORE, 'readwrite');
            try {
                const store = tx.objectStore(IDB_STORE);
                const request = store.put(new Blob([data as any]), IDB_KEY);
                request.onerror = () => {
                    console.error("Failed to save to IDB", request.error);
                    reject(request.error);
                };
            } catch (err) {
                console.error("Error executing put on IDB", err);
                reject(err);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
    });
};

// Inicializar SQL.js
const initDB = async (): Promise<Database> => {
    if (db) return db;

    if (!sqlPromise) {
        sqlPromise = initSqlJs({
            locateFile: () => wasmUrl
        });
    }

    const SQL = await sqlPromise;

    try {
        let persisted: Uint8Array | null = null;

        // 1. Verificar Electron IPC
        if ((window as any).electronAPI?.dbLoad) {
            const data = await (window as any).electronAPI.dbLoad();
            if (data) persisted = new Uint8Array(data);
        }
        // 2. Verificar IndexedDB
        else {
            const stored = await loadFromIDB();
            if (stored) {
                persisted = stored;
            }
            // Limpar localStorage legado para libertar quota
            if (localStorage.getItem('angola_credito_pro_db')) {
                localStorage.removeItem('angola_credito_pro_db');
            }
        }

        if (persisted) {
            db = new SQL.Database(persisted);
            await createTables();
        } else {
            db = new SQL.Database();
            await createTables();
        }
    } catch (e) {
        console.error('Falha ao carregar a base de dados persistida.', e);
        db?.close();
        db = null;
        throw new Error('A base de dados local não pôde ser aberta ou migrada. Os dados existentes foram preservados. Restaure um backup válido ou repare o armazenamento antes de continuar.');
    }

    if ((window as any).electronAPI?.dbSchemaReady) {
        await (window as any).electronAPI.dbSchemaReady();
    }
    return db;
};

// Criar todas as tabelas necessárias
const createTables = async () => {
    // Em Electron, não precisamos do objeto 'db' (sql.js), usamos IPC
    if (!isElectron && !db) return;

    const executeSql = async (sql: string) => {
        if (isElectron) {
            await (window as any).electronAPI.dbExec(sql);
        } else {
            db!.exec(sql);
        }
    };

    const runSql = async (sql: string, params: any[] = []) => {
        if (isElectron) {
            await (window as any).electronAPI.dbExecute(sql, params);
        } else {
            db!.run(sql, params.map(p => p === undefined ? null : p));
        }
    };

    const querySql = async (sql: string) => {
        if (isElectron) {
            return await (window as any).electronAPI.dbQuery(sql);
        } else {
            const stmt = db!.prepare(sql);
            const results = [];
            while (stmt.step()) results.push(stmt.getAsObject());
            stmt.free();
            return results;
        }
    };

    // Helper to safely add column only if it doesn't match
    const safeAddColumn = async (table: string, column: string, definition: string) => {
        try {
            const columns = await querySql(`PRAGMA table_info(${table})`);
            const exists = columns.some((c: any) => c.name === column);
            if (!exists) {
                await executeSql(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
                console.log(`[Migration] Added column ${column} to ${table}`);
            }
        } catch (e) {
            console.error('[Migration] Erro ao adicionar coluna:', e);
            throw new Error(`Falha na migração da coluna ${table}.${column}.`);
        }
    };

    // Migrate credits table if it has the old status check constraint
    try {
        const creditsTableInfo = await querySql("SELECT sql FROM sqlite_master WHERE type='table' AND name='credits'");
        if (creditsTableInfo.length > 0) {
            const tableSql = creditsTableInfo[0].sql || '';
            if (!tableSql.includes('pending_approval') || !tableSql.includes('rejected') || !tableSql.includes('renegotiated')) {
                console.log("[Migration] Rebuilding credits table to update CHECK constraint...");
                // 1. Rename old table
                await executeSql("ALTER TABLE credits RENAME TO credits_old");
                // 2. Create new table
                await executeSql(`
                    CREATE TABLE credits (
                        id TEXT PRIMARY KEY,
                        clientId TEXT NOT NULL,
                        clientName TEXT NOT NULL,
                        principalAmount REAL NOT NULL,
                        interestRate REAL NOT NULL,
                        lateInterestRate REAL NOT NULL,
                        installments INTEGER NOT NULL,
                        paidInstallments INTEGER DEFAULT 0,
                        currentBalance REAL NOT NULL,
                        startDate TEXT,
                        accruedInterest REAL DEFAULT 0,
                        lateInterest REAL DEFAULT 0,
                        totalDue REAL NOT NULL,
                        dueDate TEXT NOT NULL,
                        daysOverdue INTEGER DEFAULT 0,
                        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paid', 'overdue', 'defaulted', 'cancelled', 'renegotiated', 'pending_approval', 'rejected')),
                        creditNumber INTEGER DEFAULT 1,
                        paidAt TEXT,
                        createdAt TEXT NOT NULL,
                        deletedAt TEXT,
                        deletedBy TEXT,
                        restoredAt TEXT,
                        originalState TEXT,
                        usuario_id TEXT,
                        approvedBy TEXT,
                        requestedBy TEXT,
                        requestedAt TEXT,
                        approvalNotes TEXT,
                        targetMonthId TEXT,
                        FOREIGN KEY(clientId) REFERENCES clients(id) ON DELETE RESTRICT
                    );
                `);
                // 3. Copy columns
                const oldColumnsInfo = await querySql("PRAGMA table_info(credits_old)");
                const oldCols = oldColumnsInfo.map((c: any) => c.name);
                const newCols = [
                    'id', 'clientId', 'clientName', 'principalAmount', 'interestRate', 'lateInterestRate',
                    'installments', 'paidInstallments', 'currentBalance', 'startDate', 'accruedInterest',
                    'lateInterest', 'totalDue', 'dueDate', 'daysOverdue', 'status', 'creditNumber',
                    'paidAt', 'createdAt', 'deletedAt', 'deletedBy', 'restoredAt', 'originalState', 'usuario_id',
                    'approvedBy', 'requestedBy', 'requestedAt', 'approvalNotes', 'targetMonthId'
                ];
                const colsToCopy = oldCols.filter((col: string) => newCols.includes(col));
                const colsJoined = colsToCopy.join(', ');
                await executeSql(`INSERT INTO credits (${colsJoined}) SELECT ${colsJoined} FROM credits_old`);
                // 4. Drop old table
                await executeSql("DROP TABLE credits_old");
                console.log("[Migration] Rebuilt credits table successfully.");
            }
        }
    } catch (err) {
        console.warn("[Migration Error] Failed to rebuild credits table:", err);
    }

    // Migrate payments table if it references the old table (credits_old) due to SQLite foreign key auto-rename
    try {
        const paymentsTableInfo = await querySql("SELECT sql FROM sqlite_master WHERE type='table' AND name='payments'");
        if (paymentsTableInfo.length > 0) {
            const tableSql = paymentsTableInfo[0].sql || '';
            if (tableSql.includes('credits_old')) {
                console.log("[Migration] Rebuilding payments table to update FK constraint pointing to credits...");
                // 1. Rename old table
                await executeSql("ALTER TABLE payments RENAME TO payments_old");
                // 2. Create new table
                await executeSql(`
                    CREATE TABLE payments (
                        id TEXT PRIMARY KEY,
                        creditId TEXT NOT NULL,
                        clientName TEXT NOT NULL,
                        amount REAL NOT NULL,
                        paymentDate TEXT NOT NULL,
                        method TEXT NOT NULL,
                        reference TEXT,
                        allocatedToPrincipal REAL DEFAULT 0,
                        allocatedToInterest REAL DEFAULT 0,
                        allocatedToLateInterest REAL DEFAULT 0,
                        processedBy TEXT NOT NULL,
                        status TEXT DEFAULT 'confirmed' CHECK(status IN ('pending', 'confirmed', 'cancelled')),
                        deletedAt TEXT,
                        deletedBy TEXT,
                        restoredAt TEXT,
                        originalState TEXT,
                        usuario_id TEXT,
                        FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT
                    );
                `);
                // 3. Copy columns
                const oldColumnsInfo = await querySql("PRAGMA table_info(payments_old)");
                const oldCols = oldColumnsInfo.map((c: any) => c.name);
                const newCols = [
                    'id', 'creditId', 'clientName', 'amount', 'paymentDate', 'method', 'reference',
                    'allocatedToPrincipal', 'allocatedToInterest', 'allocatedToLateInterest',
                    'processedBy', 'status', 'deletedAt', 'deletedBy', 'restoredAt', 'originalState', 'usuario_id'
                ];
                const colsToCopy = oldCols.filter((col: string) => newCols.includes(col));
                const colsJoined = colsToCopy.map((c: string) => `"${c}"`).join(', ');
                await executeSql(`INSERT INTO payments (${colsJoined}) SELECT ${colsJoined} FROM payments_old`);
                // 4. Drop old table
                await executeSql("DROP TABLE payments_old");
                console.log("[Migration] Rebuilt payments table successfully.");
            }
        }
    } catch (err) {
        console.warn("[Migration Error] Failed to rebuild payments table:", err);
    }


    await executeSql(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('super_admin', 'admin', 'manager')),
            avatar TEXT,
            createdAt TEXT NOT NULL,
            lastLogin TEXT,
            lastSeen TEXT,
            permissions TEXT,
            status TEXT DEFAULT 'active',
            ip TEXT,
            signature TEXT
        );

        CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            nif TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            birthDate TEXT,
            age INTEGER,
            issueDate TEXT,
            expiryDate TEXT,
            gender TEXT,
            maritalStatus TEXT,
            fatherName TEXT,
            motherName TEXT,
            workInstitution TEXT,
            socialSecurityNumber TEXT,
            creditLimit REAL DEFAULT 0,
            usedCredit REAL DEFAULT 0,
            availableCredit REAL DEFAULT 0,
            monthlyIncome REAL DEFAULT 0,
            defaultInterestRate REAL DEFAULT 0,
            lateInterestRate REAL DEFAULT 0,
            toleranceDays INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'blocked')),
            riskLevel TEXT DEFAULT 'medium' CHECK(riskLevel IN ('low', 'medium', 'high')),
            whatsappVerified INTEGER DEFAULT 0,
            documents TEXT,
            bankCoordinates TEXT,
            receiveMethod TEXT DEFAULT 'transfer',
            lastContacted TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT,
            notes TEXT,
            deletedAt TEXT,
            deletedBy TEXT,
            restoredAt TEXT,
            originalState TEXT,
            usuario_id TEXT
        );

        CREATE TABLE IF NOT EXISTS credits (
            id TEXT PRIMARY KEY,
            clientId TEXT NOT NULL,
            clientName TEXT NOT NULL,
            principalAmount REAL NOT NULL,
            principalAmountMinor INTEGER,
            interestRate REAL NOT NULL,
            lateInterestRate REAL NOT NULL,
            installments INTEGER NOT NULL,
            paidInstallments INTEGER DEFAULT 0,
            currentBalance REAL NOT NULL,
            currentBalanceMinor INTEGER,
            startDate TEXT,
            accruedInterest REAL DEFAULT 0,
            accruedInterestMinor INTEGER,
            lateInterest REAL DEFAULT 0,
            lateInterestMinor INTEGER,
            totalDue REAL NOT NULL,
            totalDueMinor INTEGER,
            version INTEGER NOT NULL DEFAULT 0,
            dueDate TEXT NOT NULL,
            daysOverdue INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paid', 'overdue', 'defaulted', 'cancelled', 'renegotiated', 'pending_approval', 'rejected')),
            creditNumber INTEGER DEFAULT 1,
            paidAt TEXT,
            createdAt TEXT NOT NULL,
            deletedAt TEXT,
            deletedBy TEXT,
            restoredAt TEXT,
            originalState TEXT,
            usuario_id TEXT,
            targetMonthId TEXT,
            FOREIGN KEY(clientId) REFERENCES clients(id) ON DELETE RESTRICT
        );

        CREATE TABLE IF NOT EXISTS payments (
            id TEXT PRIMARY KEY,
            creditId TEXT NOT NULL,
            clientName TEXT NOT NULL,
            amount REAL NOT NULL,
            amountMinor INTEGER,
            paymentDate TEXT NOT NULL,
            method TEXT NOT NULL,
            reference TEXT,
            allocatedToPrincipal REAL DEFAULT 0,
            allocatedToPrincipalMinor INTEGER,
            allocatedToInterest REAL DEFAULT 0,
            allocatedToInterestMinor INTEGER,
            allocatedToLateInterest REAL DEFAULT 0,
            allocatedToLateInterestMinor INTEGER,
            idempotencyKey TEXT,
            processedBy TEXT NOT NULL,
            status TEXT DEFAULT 'confirmed' CHECK(status IN ('pending', 'confirmed', 'cancelled')),
            deletedAt TEXT,
            deletedBy TEXT,
            restoredAt TEXT,
            originalState TEXT,
            usuario_id TEXT,
            FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT
        );

        CREATE TABLE IF NOT EXISTS credit_installments (
            id TEXT PRIMARY KEY,
            creditId TEXT NOT NULL,
            installmentNumber INTEGER NOT NULL CHECK(installmentNumber > 0),
            dueDate TEXT NOT NULL,
            principalMinor INTEGER NOT NULL CHECK(principalMinor >= 0),
            interestMinor INTEGER NOT NULL CHECK(interestMinor >= 0),
            lateInterestMinor INTEGER NOT NULL DEFAULT 0 CHECK(lateInterestMinor >= 0),
            paidPrincipalMinor INTEGER NOT NULL DEFAULT 0 CHECK(paidPrincipalMinor >= 0),
            paidInterestMinor INTEGER NOT NULL DEFAULT 0 CHECK(paidInterestMinor >= 0),
            paidLateInterestMinor INTEGER NOT NULL DEFAULT 0 CHECK(paidLateInterestMinor >= 0),
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partial','paid','overdue','cancelled')),
            paidAt TEXT,
            version INTEGER NOT NULL DEFAULT 0,
            UNIQUE(creditId, installmentNumber),
            FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_credit_installments_due ON credit_installments(creditId, status, dueDate);

        CREATE TABLE IF NOT EXISTS credit_reinforcements (
            id TEXT PRIMARY KEY,
            creditId TEXT NOT NULL,
            amountMinor INTEGER NOT NULL CHECK(amountMinor > 0),
            interestMinor INTEGER NOT NULL DEFAULT 0 CHECK(interestMinor >= 0),
            idempotencyKey TEXT NOT NULL UNIQUE,
            notes TEXT,
            createdBy TEXT,
            createdAt TEXT NOT NULL,
            FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT
        );

        CREATE TABLE IF NOT EXISTS contracts (
            id TEXT PRIMARY KEY,
            clientId TEXT,
            clientName TEXT,
            title TEXT,
            value REAL,
            startDate TEXT,
            endDate TEXT,
            status TEXT,
            terms TEXT,
            createdAt TEXT,
            deletedAt TEXT,
            deletedBy TEXT,
            restoredAt TEXT,
            originalState TEXT,
            usuario_id TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            userId TEXT,
            userName TEXT,
            action TEXT NOT NULL,
            entity TEXT NOT NULL,
            details TEXT,
            previousState TEXT,
            newState TEXT,
            metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            appliedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_conflicts (
            id TEXT PRIMARY KEY,
            entityType TEXT NOT NULL,
            entityId TEXT,
            operation TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
            createdAt TEXT NOT NULL,
            resolvedAt TEXT,
            resolvedBy TEXT
        );

        CREATE TABLE IF NOT EXISTS password_reset_requests (
            id TEXT PRIMARY KEY,
            userId TEXT,
            userName TEXT NOT NULL,
            email TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'cancelled'))
        );

        CREATE TABLE IF NOT EXISTS company_settings (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            name TEXT NOT NULL,
            nif TEXT,
            address TEXT,
            logo TEXT,
            reportLogo TEXT,
            licenseKey TEXT,
            currency TEXT DEFAULT 'AOA',
            customClauses TEXT,
            rescueKey TEXT,
            phone TEXT,
            primaryColor TEXT,
            secondaryColor TEXT,
            watermarkLogo TEXT,
            sessionTimeout INTEGER DEFAULT 5,
            email TEXT,
            whatsapp TEXT,
            whatsappAutoNotify INTEGER DEFAULT 0,
            whatsappVerified INTEGER DEFAULT 0,
            syncEnabled INTEGER DEFAULT 0,
            syncUrl TEXT,
            syncApiKey TEXT,
            syncPasskey TEXT,
            lastSync TEXT,
            maintenanceMode INTEGER DEFAULT 0,
            allowedModulesDuringMaintenance TEXT DEFAULT '[]',
            enableGatewaysModule INTEGER DEFAULT 1,
            enableGatewaysModuleAdminOnly INTEGER DEFAULT 0,
            enableProfileActivity INTEGER DEFAULT 1,
            enableProfileActivityAdminOnly INTEGER DEFAULT 0,
            lastBackupDate TEXT,
            digitalSignatureEnabled INTEGER DEFAULT 1,
            authorizedSigners TEXT DEFAULT '[]',
            bankingInfo TEXT DEFAULT '[]',
            contractTemplates TEXT DEFAULT '[]',
            installDate TEXT,
            financialLock INTEGER DEFAULT 0,
            enableWarrantiesModule INTEGER DEFAULT 1,
            enableWarrantiesModuleAdminOnly INTEGER DEFAULT 0,
            enableLegalModule INTEGER DEFAULT 1,
            enableLegalModuleAdminOnly INTEGER DEFAULT 0,
            enableScoringModule INTEGER DEFAULT 1,
            enableScoringModuleAdminOnly INTEGER DEFAULT 0,
            defaultSimulationInterestRate REAL,
            defaultSimulationAdminFee REAL,
            defaultSimulationIof REAL,
            smtpHost TEXT,
            smtpPort TEXT,
            smtpUser TEXT,
            smtpPassword TEXT,
            smtpSecure INTEGER DEFAULT 0,
            smtpFromName TEXT,
            location TEXT,
            enableSuppliersModule INTEGER DEFAULT 0,
            enableSuppliersModuleAdminOnly INTEGER DEFAULT 0,
            enableMultiTenant INTEGER DEFAULT 1,
            website TEXT,
            segment TEXT,
            slogan TEXT
        );

        CREATE TABLE IF NOT EXISTS warranties (
            id TEXT PRIMARY KEY,
            clientId TEXT NOT NULL,
            creditId TEXT,
            type TEXT NOT NULL,
            description TEXT NOT NULL,
            marketValue REAL NOT NULL,
            estimatedValue REAL,
            status TEXT DEFAULT 'active',
            documents TEXT DEFAULT '[]',
            photos TEXT DEFAULT '[]',
            location TEXT,
            createdAt TEXT NOT NULL,
            deletedAt TEXT,
            deletedBy TEXT,
            restoredAt TEXT,
            originalState TEXT,
            usuario_id TEXT
        );

        CREATE TABLE IF NOT EXISTS legal_cases (
            id TEXT PRIMARY KEY,
            creditId TEXT NOT NULL,
            clientId TEXT NOT NULL,
            stage TEXT DEFAULT 'interpellated',
            priority TEXT DEFAULT 'normal',
            assignedLawyer TEXT,
            notes TEXT,
            history TEXT DEFAULT '[]',
            lastActionDate TEXT,
            debtAmount REAL,
            lastAction TEXT,
            updatedAt TEXT,
            closedAt TEXT,
            createdAt TEXT NOT NULL,
            deletedAt TEXT,
            deletedBy TEXT,
            restoredAt TEXT,
            originalState TEXT,
            usuario_id TEXT
        );

        CREATE TABLE IF NOT EXISTS closed_months (
            id TEXT PRIMARY KEY,
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            capitalApplied REAL NOT NULL,
            projectedProfit REAL NOT NULL,
            realizedProfit REAL NOT NULL,
            overdueAmount REAL NOT NULL,
            liquidationRate REAL NOT NULL,
            closedAt TEXT NOT NULL,
            closedBy TEXT NOT NULL
        );

        -- Índices para Escalabilidade e Soft Delete
        CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
        CREATE INDEX IF NOT EXISTS idx_credits_clientId ON credits(clientId);
        CREATE INDEX IF NOT EXISTS idx_payments_creditId ON payments(creditId);
        CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paymentDate);

        -- Índices adicionais recomendados para alta performance
        CREATE INDEX IF NOT EXISTS idx_credits_dueDate ON credits(dueDate);
        CREATE INDEX IF NOT EXISTS idx_credits_startDate ON credits(startDate);
        CREATE INDEX IF NOT EXISTS idx_credits_createdAt ON credits(createdAt);
        CREATE INDEX IF NOT EXISTS idx_payments_paymentDate ON payments(paymentDate);
        CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
        CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
        CREATE INDEX IF NOT EXISTS idx_clients_createdAt ON clients(createdAt);
        CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
        CREATE INDEX IF NOT EXISTS idx_audit_userId ON audit_logs(userId);
        CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);



        CREATE INDEX IF NOT EXISTS idx_credits_status_dueDate ON credits(status, dueDate);
        CREATE INDEX IF NOT EXISTS idx_payments_credit_date ON payments(creditId, paymentDate);
        CREATE INDEX IF NOT EXISTS idx_audit_user_timestamp ON audit_logs(userId, timestamp);

        -- Índices Parciais para Unicidade com Soft Delete
        DROP INDEX IF EXISTS idx_clients_nif_active;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_nif_active ON clients(nif) WHERE deletedAt IS NULL AND nif NOT LIKE 'SEM-%' AND nif != 'SEM IDENTIFICAÇÃO';
        CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone_active ON clients(phone) WHERE deletedAt IS NULL;

        CREATE TABLE IF NOT EXISTS message_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            isDefault INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS collection_messages (
            id TEXT PRIMARY KEY,
            clientId TEXT NOT NULL,
            clientName TEXT NOT NULL,
            creditIds TEXT NOT NULL,
            channel TEXT NOT NULL,
            message TEXT NOT NULL,
            attemptNumber INTEGER DEFAULT 1,
            totalDue REAL DEFAULT 0,
            sentAt TEXT NOT NULL,
            sentBy TEXT,
            legalTriggered INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            userId TEXT,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('info', 'success', 'warning', 'error')),
            source TEXT DEFAULT 'system' CHECK(source IN ('system', 'chat')),
            read INTEGER DEFAULT 0,
            timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS payment_gateways (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider TEXT NOT NULL,
            type TEXT NOT NULL,
            status TEXT DEFAULT 'inactive',
            environment TEXT DEFAULT 'sandbox',
            apiKey TEXT,
            apiSecret TEXT,
            merchantId TEXT,
            webhookUrl TEXT,
            webhookSecret TEXT,
            config TEXT,
            transactionFee REAL DEFAULT 0,
            feeType TEXT DEFAULT 'percentage',
            logo TEXT,
            description TEXT,
            supportedMethods TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT,
            lastTestedAt TEXT,
            lastTestResult TEXT
        );

        CREATE TABLE IF NOT EXISTS payment_references (
            id TEXT PRIMARY KEY,
            creditId TEXT,
            gatewayId TEXT,
            reference TEXT,
            entity TEXT,
            amount REAL,
            status TEXT DEFAULT 'pending', 
            proofImage TEXT, 
            expiresAt TEXT,
            paidAt TEXT,
            submittedAt TEXT,
            createdAt TEXT NOT NULL,
            usuario_id TEXT
        );

        CREATE TABLE IF NOT EXISTS internal_messages (
            id TEXT PRIMARY KEY,
            senderId TEXT NOT NULL,
            senderName TEXT NOT NULL,
            receiverId TEXT NOT NULL,
            receiverName TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            read INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS user_limits (
            id TEXT PRIMARY KEY,
            userId TEXT,
            role TEXT CHECK(role IN ('admin', 'manager')),
            maxTransaction REAL NOT NULL,
            dailyLimit REAL NOT NULL,
            monthlyLimit REAL NOT NULL,
            restrictionsEnabled INTEGER DEFAULT 1,
            updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS accounting_entries (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            clientId TEXT,
            creditId TEXT,
            paymentId TEXT,
            debit TEXT NOT NULL,
            credit TEXT NOT NULL,
            amountPrincipal REAL DEFAULT 0,
            amountInterest REAL DEFAULT 0,
            amountLateInterest REAL DEFAULT 0,
            amountTotal REAL NOT NULL,
            amountPrincipalMinor INTEGER,
            amountInterestMinor INTEGER,
            amountLateInterestMinor INTEGER,
            amountTotalMinor INTEGER,
            processedBy TEXT NOT NULL,
            justification TEXT,
            integrityHash TEXT,
            previousHash TEXT,
            hashVersion INTEGER DEFAULT 1,
            usuario_id TEXT,
            FOREIGN KEY(clientId) REFERENCES clients(id)
        );

        CREATE INDEX IF NOT EXISTS idx_accounting_clientId ON accounting_entries(clientId);
        CREATE INDEX IF NOT EXISTS idx_accounting_creditId ON accounting_entries(creditId);
        CREATE INDEX IF NOT EXISTS idx_accounting_timestamp ON accounting_entries(timestamp);

        CREATE TABLE IF NOT EXISTS ledger_transactions (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            type TEXT NOT NULL,
            sourceType TEXT NOT NULL,
            sourceId TEXT NOT NULL,
            description TEXT,
            totalDebitMinor INTEGER NOT NULL CHECK(totalDebitMinor > 0),
            totalCreditMinor INTEGER NOT NULL CHECK(totalCreditMinor > 0),
            integrityHash TEXT NOT NULL,
            previousHash TEXT NOT NULL,
            hashVersion INTEGER NOT NULL DEFAULT 2,
            usuario_id TEXT,
            CHECK(totalDebitMinor = totalCreditMinor)
        );

        CREATE TABLE IF NOT EXISTS ledger_lines (
            id TEXT PRIMARY KEY,
            transactionId TEXT NOT NULL,
            account TEXT NOT NULL,
            side TEXT NOT NULL CHECK(side IN ('debit', 'credit')),
            component TEXT NOT NULL,
            amountMinor INTEGER NOT NULL CHECK(amountMinor > 0),
            FOREIGN KEY(transactionId) REFERENCES ledger_transactions(id) ON DELETE RESTRICT
        );

        CREATE INDEX IF NOT EXISTS idx_ledger_transactions_source ON ledger_transactions(sourceType, sourceId);
        CREATE INDEX IF NOT EXISTS idx_ledger_transactions_timestamp ON ledger_transactions(timestamp);
        CREATE INDEX IF NOT EXISTS idx_ledger_lines_transaction ON ledger_lines(transactionId);
        
        -- Performance indexes for critical tables
        CREATE INDEX IF NOT EXISTS idx_credits_status ON credits(status);
        CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity);

        -- Multi-tenancy indexes
        CREATE INDEX IF NOT EXISTS idx_clients_usuario ON clients(usuario_id);
        CREATE INDEX IF NOT EXISTS idx_credits_usuario ON credits(usuario_id);
        CREATE INDEX IF NOT EXISTS idx_payments_usuario ON payments(usuario_id);
        CREATE INDEX IF NOT EXISTS idx_contracts_usuario ON contracts(usuario_id);
        CREATE INDEX IF NOT EXISTS idx_legal_cases_usuario ON legal_cases(usuario_id);
        CREATE INDEX IF NOT EXISTS idx_warranties_usuario ON warranties(usuario_id);
        CREATE INDEX IF NOT EXISTS idx_accounting_usuario ON accounting_entries(usuario_id);

        CREATE TABLE IF NOT EXISTS simulations (
            id TEXT PRIMARY KEY,
            reference TEXT,
            date TEXT NOT NULL,
            clientName TEXT,
            clientIncome REAL DEFAULT 0,
            amount REAL DEFAULT 0,
            term INTEGER DEFAULT 0,
            interestRate REAL DEFAULT 0,
            method TEXT CHECK(method IN ('price', 'sac')),
            riskProfile TEXT CHECK(riskProfile IN ('low', 'medium', 'high')),
            totalPayment REAL DEFAULT 0,
            monthlyPayment REAL DEFAULT 0,
            aiAnalysis TEXT,
            usuario_id TEXT,
            createdAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            role TEXT,
            content TEXT,
            timestamp TEXT,
            userId TEXT
        );

        CREATE TABLE IF NOT EXISTS dictionary (
            word TEXT NOT NULL,
            language TEXT NOT NULL CHECK(language IN ('pt-AO', 'pt-PT', 'both', 'pt', 'ao')),
            PRIMARY KEY (word, language)
        );

        CREATE INDEX IF NOT EXISTS idx_simulations_usuario ON simulations(usuario_id);
        CREATE INDEX IF NOT EXISTS idx_simulations_date ON simulations(date);
        CREATE INDEX IF NOT EXISTS idx_simulations_clientName ON simulations(clientName);
        CREATE INDEX IF NOT EXISTS idx_simulations_createdAt ON simulations(createdAt);
        CREATE INDEX IF NOT EXISTS idx_simulations_amount ON simulations(amount);

        CREATE TABLE IF NOT EXISTS suppliers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            nif TEXT,
            address TEXT,
            notes TEXT,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
            createdAt TEXT DEFAULT (datetime('now')),
            deletedAt TEXT,
            deletedBy TEXT,
            usuario_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
        CREATE INDEX IF NOT EXISTS idx_suppliers_usuario ON suppliers(usuario_id);

        CREATE TABLE IF NOT EXISTS calendar_tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            date TEXT NOT NULL,
            done INTEGER DEFAULT 0,
            createdAt TEXT DEFAULT (datetime('now')),
            usuario_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_calendar_tasks_date ON calendar_tasks(date);
        CREATE INDEX IF NOT EXISTS idx_calendar_tasks_usuario ON calendar_tasks(usuario_id);
    `);

    try {
        const dictionaryColumns = await querySql("PRAGMA table_info(dictionary)");
        const wordColumn = dictionaryColumns.find((c: any) => c.name === 'word');
        const languageColumn = dictionaryColumns.find((c: any) => c.name === 'language');
        const isLegacyDictionary = wordColumn?.pk === 1 && !languageColumn?.pk;

        if (isLegacyDictionary) {
            await executeSql("ALTER TABLE dictionary RENAME TO dictionary_old");
            await executeSql(`
                CREATE TABLE dictionary (
                    word TEXT NOT NULL,
                    language TEXT NOT NULL CHECK(language IN ('pt-AO', 'pt-PT', 'both', 'pt', 'ao')),
                    PRIMARY KEY (word, language)
                )
            `);
            await executeSql(`
                INSERT OR IGNORE INTO dictionary (word, language)
                SELECT word,
                    CASE
                        WHEN language = 'ao' THEN 'pt-AO'
                        WHEN language = 'pt' THEN 'pt-PT'
                        WHEN language IN ('pt-AO', 'pt-PT', 'both') THEN language
                        ELSE 'both'
                    END
                FROM dictionary_old
            `);
            await executeSql("DROP TABLE dictionary_old");
        }
    } catch (err) {
        console.warn("[Migration] Failed to migrate dictionary table:", err);
    }

    // Migrate clients table for new biographical and document date columns
    await safeAddColumn('clients', 'birthDate', 'TEXT');
    await safeAddColumn('clients', 'age', 'INTEGER');
    await safeAddColumn('clients', 'issueDate', 'TEXT');
    await safeAddColumn('clients', 'expiryDate', 'TEXT');
    await safeAddColumn('clients', 'gender', 'TEXT');
    await safeAddColumn('clients', 'maritalStatus', 'TEXT');
    await safeAddColumn('clients', 'fatherName', 'TEXT');
    await safeAddColumn('clients', 'motherName', 'TEXT');
    await safeAddColumn('clients', 'workInstitution', 'TEXT');
    await safeAddColumn('clients', 'socialSecurityNumber', 'TEXT');

    // Seed default message templates
    const templates = [
        {
            id: "welcome",
            name: "Boas-vindas",
            type: "registration",
            content: "Ola {nome_cliente}, bem-vindo a {empresa}! E um prazer te-lo connosco. O seu limite de credito aprovado e de {limite_credito}. Segue em anexo a sua ficha de inscricao."
        },
        {
            id: "credit_remind",
            name: "Lembrete de Pagamento",
            type: "reminder",
            content: "Ola {nome_cliente}, lembramos que o seu credito em {empresa} no valor de {valor} vence em {data_vencimento}."
        },
        {
            id: "payment_confirm",
            name: "Confirmação de Pagamento",
            type: "confirmation",
            content: "Ola {nome_cliente}, confirmamos a recepcao do seu pagamento no valor de {valor}. Obrigado!"
        }
    ];

    for (const t of templates) {
        if (isElectron) {
            await (window as any).electronAPI.dbExecute(
                "INSERT OR IGNORE INTO message_templates (id, name, type, content, isDefault) VALUES (?, ?, ?, ?, 1)",
                [t.id, t.name, t.type, t.content]
            );
        } else {
            const stmt = db!.prepare("INSERT OR IGNORE INTO message_templates (id, name, type, content, isDefault) VALUES (?, ?, ?, ?, 1)");
            stmt.run([t.id, t.name, t.type, t.content]);
            stmt.free();
        }
    }

    const applyMigration = async (version: number, name: string, migrate: () => Promise<void>) => {
        const applied = await querySql(`SELECT version FROM schema_migrations WHERE version = ${version}`);
        if (applied.length > 0) return;
        await migrate();
        await runSql('INSERT INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)',
            [version, name, new Date().toISOString()]);
    };

    await applyMigration(2026092201, 'mfa-recovery-and-financial-minor-units', async () => {
        await safeAddColumn("users", "mfaRecoveryCodes", "TEXT");
        await safeAddColumn("credits", "principalAmountMinor", "INTEGER");
        await safeAddColumn("credits", "currentBalanceMinor", "INTEGER");
        await safeAddColumn("credits", "accruedInterestMinor", "INTEGER");
        await safeAddColumn("credits", "lateInterestMinor", "INTEGER");
        await safeAddColumn("credits", "totalDueMinor", "INTEGER");
        await safeAddColumn("credits", "version", "INTEGER NOT NULL DEFAULT 0");
        await executeSql(`UPDATE credits SET
            principalAmountMinor = CAST(ROUND(principalAmount * 100) AS INTEGER),
            currentBalanceMinor = CAST(ROUND(currentBalance * 100) AS INTEGER),
            accruedInterestMinor = CAST(ROUND(accruedInterest * 100) AS INTEGER),
            lateInterestMinor = CAST(ROUND(lateInterest * 100) AS INTEGER),
            totalDueMinor = CAST(ROUND(totalDue * 100) AS INTEGER)
            WHERE principalAmountMinor IS NULL OR currentBalanceMinor IS NULL OR totalDueMinor IS NULL`);
        await safeAddColumn("payments", "amountMinor", "INTEGER");
        await safeAddColumn("payments", "allocatedToPrincipalMinor", "INTEGER");
        await safeAddColumn("payments", "allocatedToInterestMinor", "INTEGER");
        await safeAddColumn("payments", "allocatedToLateInterestMinor", "INTEGER");
        await safeAddColumn("payments", "idempotencyKey", "TEXT");
        await executeSql(`UPDATE payments SET
            amountMinor = CAST(ROUND(amount * 100) AS INTEGER),
            allocatedToPrincipalMinor = CAST(ROUND(allocatedToPrincipal * 100) AS INTEGER),
            allocatedToInterestMinor = CAST(ROUND(allocatedToInterest * 100) AS INTEGER),
            allocatedToLateInterestMinor = CAST(ROUND(allocatedToLateInterest * 100) AS INTEGER),
            idempotencyKey = COALESCE(idempotencyKey, id)
            WHERE amountMinor IS NULL OR idempotencyKey IS NULL`);
        await executeSql("CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency ON payments(idempotencyKey) WHERE idempotencyKey IS NOT NULL");
    });

    await applyMigration(2026092202, 'credit-installment-schedules', async () => {
        await safeAddColumn("credits", "amortizationMethod", "TEXT DEFAULT 'FLAT'");
        const creditsWithoutSchedule = await querySql(`SELECT c.id, c.startDate, c.installments,
            COALESCE(c.principalAmountMinor, CAST(ROUND(c.principalAmount * 100) AS INTEGER)) AS principalMinor,
            MAX(0, COALESCE(c.totalDueMinor, CAST(ROUND(c.totalDue * 100) AS INTEGER)) -
                COALESCE(c.principalAmountMinor, CAST(ROUND(c.principalAmount * 100) AS INTEGER))) AS interestMinor
            FROM credits c WHERE NOT EXISTS (SELECT 1 FROM credit_installments i WHERE i.creditId = c.id)`);
        for (const credit of creditsWithoutSchedule as any[]) {
            const schedule = buildInstallmentSchedule({
                principalMinor: Number(credit.principalMinor || 0),
                flatInterestMinor: Number(credit.interestMinor || 0),
                installments: Math.max(1, Number(credit.installments || 1)),
                startDate: credit.startDate || new Date().toISOString(),
                method: 'FLAT'
            });
            for (const item of schedule) {
                await runSql(`INSERT OR IGNORE INTO credit_installments
                    (id, creditId, installmentNumber, dueDate, principalMinor, interestMinor)
                    VALUES (?, ?, ?, ?, ?, ?)`, [
                    `${credit.id}:installment:${item.number}`, credit.id, item.number, item.dueDate,
                    item.principalMinor, item.interestMinor
                ]);
            }
        }
    });

    await applyMigration(2026092203, 'atomic-credit-reinforcements', async () => {
        await executeSql(`CREATE TABLE IF NOT EXISTS credit_reinforcements (
            id TEXT PRIMARY KEY, creditId TEXT NOT NULL, amountMinor INTEGER NOT NULL CHECK(amountMinor > 0),
            interestMinor INTEGER NOT NULL DEFAULT 0 CHECK(interestMinor >= 0), idempotencyKey TEXT NOT NULL UNIQUE,
            notes TEXT, createdBy TEXT, createdAt TEXT NOT NULL,
            FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT)`);
        await executeSql('CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_reinforcement_idempotency ON credit_reinforcements(idempotencyKey)');
    });

    await applyMigration(2026092204, 'remove-legacy-default-rescue-key', async () => {
        await runSql('UPDATE company_settings SET rescueKey = NULL WHERE rescueKey = ?',
            ['$2b$10$62r5b52lBESpvNHOfibFve4320qWghaZhi6rtHOV.naEISwrPU3ru']);
    });

    await applyMigration(2026092301, 'reviewable-sync-conflicts', async () => {
        await safeAddColumn('sync_conflicts', 'resolutionNote', 'TEXT');
        await safeAddColumn('sync_conflicts', 'resolvedBy', 'TEXT');
        await safeAddColumn('sync_conflicts', 'resolvedAt', 'TEXT');
    });

    // safeAddColumns for migrations
    await safeAddColumn("users", "status", "TEXT DEFAULT 'active'");
    await safeAddColumn("users", "lastSeen", "TEXT");
    await safeAddColumn("users", "permissions", "TEXT");
    await safeAddColumn("users", "username", "TEXT");
    await safeAddColumn("users", "failedAttempts", "INTEGER DEFAULT 0");
    await safeAddColumn("users", "twoFactorEnabled", "BOOLEAN DEFAULT 0");
    await safeAddColumn("users", "twoFactorSecret", "TEXT");
    await safeAddColumn("users", "blockedAt", "TEXT");
    await executeSql("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)");
    await safeAddColumn("users", "ip", "TEXT");
    await safeAddColumn("users", "signature", "TEXT");
    await safeAddColumn("users", "createdAt", "TEXT");

    await safeAddColumn("clients", "documents", "TEXT");
    await safeAddColumn("clients", "whatsappVerified", "INTEGER DEFAULT 0");
    await safeAddColumn("clients", "createdAt", "TEXT");
    await safeAddColumn("clients", "lateInterestRate", "REAL DEFAULT 0");
    await safeAddColumn("clients", "bankCoordinates", "TEXT");
    await safeAddColumn("clients", "receiveMethod", "TEXT DEFAULT 'transfer'");
    await safeAddColumn("clients", "lastContacted", "TEXT");
    await safeAddColumn("clients", "monthlyIncome", "REAL DEFAULT 0");
    await safeAddColumn("clients", "phone", "TEXT");
    await safeAddColumn("clients", "deletedAt", "TEXT");
    await safeAddColumn("clients", "deletedBy", "TEXT");
    await safeAddColumn("clients", "restoredAt", "TEXT");
    await safeAddColumn("clients", "originalState", "TEXT");
    
    await executeSql("DROP INDEX IF EXISTS idx_clients_nif_active");
    await executeSql("CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_nif_active ON clients(nif) WHERE deletedAt IS NULL AND nif NOT LIKE 'SEM-%' AND nif != 'SEM IDENTIFICAÇÃO'");
    await executeSql("CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone_active ON clients(phone) WHERE deletedAt IS NULL");

    try {
        await executeSql("UPDATE clients SET nif = 'SEM-' || substr(hex(randomblob(4)),1,8) WHERE nif = 'SEM IDENTIFICAÇÃO'");
    } catch (o) {
        console.warn("[Migration] Failed to migrate SEM IDENTIFICAÇÃO NIFs:", o);
    }

    await safeAddColumn("credits", "startDate", "TEXT");
    await safeAddColumn("credits", "deletedAt", "TEXT");
    await safeAddColumn("credits", "createdAt", "TEXT");
    await safeAddColumn("credits", "deletedBy", "TEXT");
    await safeAddColumn("credits", "restoredAt", "TEXT");
    await safeAddColumn("credits", "originalState", "TEXT");
    await safeAddColumn("credits", "approvedBy", "TEXT");
    await safeAddColumn("credits", "requestedBy", "TEXT");
    await safeAddColumn("credits", "requestedAt", "TEXT");
    await safeAddColumn("credits", "approvalNotes", "TEXT");
    await safeAddColumn("credits", "creditNumber", "INTEGER DEFAULT 1");
    await safeAddColumn("credits", "paidAt", "TEXT");
    await safeAddColumn("credits", "targetMonthId", "TEXT");

    await safeAddColumn("payments", "deletedAt", "TEXT");
    await safeAddColumn("payments", "deletedBy", "TEXT");
    await safeAddColumn("payments", "restoredAt", "TEXT");
    await safeAddColumn("payments", "originalState", "TEXT");

    await safeAddColumn("accounting_entries", "amountPrincipalMinor", "INTEGER");
    await safeAddColumn("accounting_entries", "amountInterestMinor", "INTEGER");
    await safeAddColumn("accounting_entries", "amountLateInterestMinor", "INTEGER");
    await safeAddColumn("accounting_entries", "amountTotalMinor", "INTEGER");
    await safeAddColumn("accounting_entries", "hashVersion", "INTEGER DEFAULT 1");
    await executeSql(`UPDATE accounting_entries SET
        amountPrincipalMinor = CAST(ROUND(amountPrincipal * 100) AS INTEGER),
        amountInterestMinor = CAST(ROUND(amountInterest * 100) AS INTEGER),
        amountLateInterestMinor = CAST(ROUND(amountLateInterest * 100) AS INTEGER),
        amountTotalMinor = CAST(ROUND(amountTotal * 100) AS INTEGER)
        WHERE amountTotalMinor IS NULL`);
    for (const statement of LEDGER_PROTECTION_SQL) await executeSql(statement);

    await safeAddColumn("contracts", "startDate", "TEXT");
    await safeAddColumn("contracts", "endDate", "TEXT");
    await safeAddColumn("contracts", "deletedAt", "TEXT");
    await safeAddColumn("contracts", "deletedBy", "TEXT");
    await safeAddColumn("contracts", "restoredAt", "TEXT");
    await safeAddColumn("contracts", "originalState", "TEXT");

    await safeAddColumn("legal_cases", "deletedAt", "TEXT");
    await safeAddColumn("legal_cases", "deletedBy", "TEXT");
    await safeAddColumn("legal_cases", "restoredAt", "TEXT");
    await safeAddColumn("legal_cases", "originalState", "TEXT");
    await safeAddColumn("legal_cases", "debtAmount", "REAL");
    await safeAddColumn("legal_cases", "lastAction", "TEXT");
    await safeAddColumn("legal_cases", "updatedAt", "TEXT");
    await safeAddColumn("legal_cases", "closedAt", "TEXT");

    await safeAddColumn("warranties", "deletedAt", "TEXT");
    await safeAddColumn("warranties", "deletedBy", "TEXT");
    await safeAddColumn("warranties", "restoredAt", "TEXT");
    await safeAddColumn("warranties", "originalState", "TEXT");
    await safeAddColumn("warranties", "updatedAt", "TEXT");
    await safeAddColumn("warranties", "notes", "TEXT");

    await safeAddColumn("audit_logs", "previousState", "TEXT");
    await safeAddColumn("audit_logs", "newState", "TEXT");
    await safeAddColumn("audit_logs", "metadata", "TEXT");

    await safeAddColumn("company_settings", "phone", "TEXT");
    await safeAddColumn("company_settings", "primaryColor", "TEXT");
    await safeAddColumn("company_settings", "secondaryColor", "TEXT");
    await safeAddColumn("company_settings", "watermarkLogo", "TEXT");
    await safeAddColumn("company_settings", "sessionTimeout", "INTEGER DEFAULT 5");
    await safeAddColumn("company_settings", "email", "TEXT");
    await safeAddColumn("company_settings", "whatsapp", "TEXT");
    await safeAddColumn("company_settings", "whatsappAutoNotify", "INTEGER DEFAULT 0");
    await safeAddColumn("company_settings", "whatsappVerified", "INTEGER DEFAULT 0");
    await safeAddColumn("company_settings", "syncEnabled", "INTEGER DEFAULT 0");
    await safeAddColumn("company_settings", "syncUrl", "TEXT");
    await safeAddColumn("company_settings", "syncApiKey", "TEXT");
    await safeAddColumn("company_settings", "syncPasskey", "TEXT");
    await safeAddColumn("company_settings", "lastSync", "TEXT");
    await safeAddColumn("company_settings", "maintenanceMode", "INTEGER DEFAULT 0");
    await safeAddColumn("company_settings", "allowedModulesDuringMaintenance", "TEXT DEFAULT '[]'");
    await safeAddColumn("company_settings", "enableGatewaysModule", "INTEGER DEFAULT 1");
    await safeAddColumn("company_settings", "enableProfileActivity", "INTEGER DEFAULT 1");
    await safeAddColumn("company_settings", "digitalSignatureEnabled", "INTEGER DEFAULT 1");
    await safeAddColumn("company_settings", "authorizedSigners", "TEXT DEFAULT '[]'");
    await safeAddColumn("company_settings", "bankingInfo", "TEXT DEFAULT '[]'");
    await safeAddColumn("company_settings", "contractTemplates", "TEXT DEFAULT '[]'");
    await safeAddColumn("company_settings", "lastBackupDate", "TEXT");
    await safeAddColumn("company_settings", "installDate", "TEXT");
    await safeAddColumn("company_settings", "financialLock", "INTEGER DEFAULT 0");
    await safeAddColumn("company_settings", "licenseKey", "TEXT");
    await safeAddColumn("company_settings", "defaultSimulationInterestRate", "REAL");
    await safeAddColumn("company_settings", "defaultSimulationAdminFee", "REAL");
    await safeAddColumn("company_settings", "defaultSimulationIof", "REAL");
    await safeAddColumn("company_settings", "smtpHost", "TEXT");
    await safeAddColumn("company_settings", "smtpPort", "TEXT");
    await safeAddColumn("company_settings", "smtpUser", "TEXT");
    await safeAddColumn("company_settings", "smtpPassword", "TEXT");
    await safeAddColumn("company_settings", "enableScoringModule", "INTEGER DEFAULT 1");
    await safeAddColumn("company_settings", "smtpSecure", "INTEGER DEFAULT 0");
    await safeAddColumn("company_settings", "smtpFromName", "TEXT");
    await safeAddColumn("company_settings", "enableGatewaysModuleAdminOnly", "INTEGER DEFAULT 0");
    await safeAddColumn("company_settings", "enableWarrantiesModuleAdminOnly", "INTEGER DEFAULT 0");
    await safeAddColumn("company_settings", "enableLegalModuleAdminOnly", "INTEGER DEFAULT 0");
    await safeAddColumn("company_settings", "enableScoringModuleAdminOnly", "INTEGER DEFAULT 0");
    await safeAddColumn("company_settings", "enableProfileActivityAdminOnly", "INTEGER DEFAULT 0");
    await safeAddColumn("company_settings", "location", "TEXT");
    await safeAddColumn("company_settings", "enableSuppliersModule", "INTEGER DEFAULT 0");
    await safeAddColumn("company_settings", "enableSuppliersModuleAdminOnly", "INTEGER DEFAULT 0");
    await safeAddColumn("company_settings", "enableMultiTenant", "INTEGER DEFAULT 1");
    await safeAddColumn("company_settings", "website", "TEXT");
    await safeAddColumn("company_settings", "segment", "TEXT");
    await safeAddColumn("company_settings", "slogan", "TEXT");

    await safeAddColumn("credits", "supplierId", "TEXT");
    await safeAddColumn("credits", "supplierProfitRate", "REAL");

    const multiTenancyTables = ["clients", "credits", "payments", "contracts", "warranties", "legal_cases", "payment_references", "accounting_entries"];
    for (const table of multiTenancyTables) {
        await safeAddColumn(table, "usuario_id", "TEXT");
    }

    await safeAddColumn("user_limits", "restrictionsEnabled", "INTEGER DEFAULT 1");
    await safeAddColumn("notifications", "source", "TEXT DEFAULT 'system'");
    await safeAddColumn("simulations", "createdAt", "TEXT");
    await safeAddColumn("collection_messages", "legalTriggered", "INTEGER DEFAULT 0");
    await safeAddColumn("collection_messages", "attemptNumber", "INTEGER DEFAULT 1");
    await safeAddColumn("collection_messages", "totalDue", "REAL DEFAULT 0");

    await executeSql("CREATE INDEX IF NOT EXISTS idx_collection_messages_client ON collection_messages(clientId)");
    await executeSql("CREATE INDEX IF NOT EXISTS idx_collection_messages_sentAt ON collection_messages(sentAt)");

    await executeSql(`
        UPDATE message_templates
        SET content = REPLACE(
            REPLACE(
                REPLACE(
                    REPLACE(
                        REPLACE(
                            REPLACE(
                                REPLACE(
                                    REPLACE(content, '{client_name}', '{nome_cliente}'),
                                    '{company_name}', '{empresa}'
                                ),
                                '{days_overdue}', '{dias_atraso}'
                            ),
                            '{credit_limit}', '{limite_credito}'
                        ),
                        '{amount}', '{valor}'
                    ),
                    '{due_date}', '{data_vencimento}'
                ),
                '{balance}', '{saldo_devedor}'
            ),
            '{debt_details}', '{detalhe_dividas}'
        )
    `);

    try {
        const nowIso = new Date().toISOString();
        // FIXED A03: Using prepared statement runSql instead of string interpolation
        await runSql("UPDATE company_settings SET installDate = ? WHERE installDate IS NULL", [nowIso]);
    } catch (e) {
        console.warn("[Migration Error] Failed to update installDate:", e);
    }

    // Remove a antiga chave de resgate distribuída com o código. Uma nova chave
    // só pode ser definida pelo super-administrador autenticado.
    await runSql(
        "UPDATE company_settings SET rescueKey = NULL WHERE rescueKey = ?",
        ['$2b$10$62r5b52lBESpvNHOfibFve4320qWghaZhi6rtHOV.naEISwrPU3ru']
    );

    const nowStr = new Date().toISOString();
    try {
        // FIXED A03: Using prepared statement runSql instead of string interpolation
        await runSql(
            `INSERT OR IGNORE INTO user_limits (id, role, maxTransaction, dailyLimit, monthlyLimit, restrictionsEnabled, updatedAt) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ['limit_admin', 'admin', 5000000, 20000000, 100000000, 1, nowStr]
        );
        await runSql(
            `INSERT OR IGNORE INTO user_limits (id, role, maxTransaction, dailyLimit, monthlyLimit, restrictionsEnabled, updatedAt) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ['limit_manager', 'manager', 500000, 2000000, 10000000, 1, nowStr]
        );
    } catch (e) {
        console.warn("[Migration Error] Failed to insert default user limits:", e);
    }

    // Try to ensure company settings root row exists
    try {
        if (isElectron) {
            await (window as any).electronAPI.dbExec("INSERT OR IGNORE INTO company_settings (id, name, nif) VALUES (1, 'Tango Gestão de Créditos', '000000000')");
            await (window as any).electronAPI.dbExec("UPDATE company_settings SET name = 'Tango Gestão de Créditos' WHERE name = 'Provisório' OR name = 'Empresa' OR name IS NULL OR name = ''");
        } else {
            db!.exec("INSERT OR IGNORE INTO company_settings (id, name, nif) VALUES (1, 'Tango Gestão de Créditos', '000000000')");
            db!.exec("UPDATE company_settings SET name = 'Tango Gestão de Créditos' WHERE name = 'Provisório' OR name = 'Empresa' OR name IS NULL OR name = ''");
        }
        console.log('[SQLite Adapter] Root company row ensured.');
    } catch (e) {
        console.warn('[SQLite Adapter] Failed to ensure root row:', e);
    }

    if (!isElectron) {
        await persistDB();
    }
};

// Guardar base de dados na camada de persistência
const persistDB = async () => {
    if (!db) return;
    const data = db.export();

    // 1. Verificar Electron IPC
    if ((window as any).electronAPI?.dbSave) {
        const buffer = Uint8Array.from(data);
        await (window as any).electronAPI.dbSave(buffer);
    }
    // 2. IndexedDB
    else {
        await saveToIDB(data);
    }
};

// Operações da base de dados
const checkIsElectron = () => {
    if (typeof window === 'undefined') return false;
    // Multi-method check for Electron
    const isElectronEnv = !!(window as any).electronAPI ||
        navigator.userAgent.toLowerCase().includes('electron') ||
        !!(window as any).process?.versions?.electron;
    return isElectronEnv;
};
let isElectron = checkIsElectron();

// Singleton promise to prevent multiple parallel initializations
let sharedInitPromise: Promise<{ success: boolean }> | null = null;

export const sqlite = {
    init: async () => {
        // @ts-ignore
        if (window.sqliteInitialized) {
            return { success: true };
        }

        if (sharedInitPromise) {
            console.log('[SQLite Adapter] Initialization already in progress, waiting...');
            return sharedInitPromise;
        }

        sharedInitPromise = (async () => {
            try {
                // Wait for Electron API to be available (retry up to 10 times)
                let currentIsElectron = checkIsElectron();
                let retries = 0;
                while (!currentIsElectron && retries < 10) {
                    await new Promise(r => setTimeout(r, 100));
                    currentIsElectron = checkIsElectron();
                    retries++;
                }

                console.log(`[SQLite Adapter] Environment detected: ${currentIsElectron ? 'Electron' : 'Web'} (Retries: ${retries})`);

                if (currentIsElectron) {
                    console.log('[SQLite Adapter] Initializing Electron IPC (better-sqlite3)');
                    // O processo principal mantém este estado após um reload do renderer.
                    // Repetir DDL depois do login seria rejeitado e poderia interromper o arranque.
                    let isReady = false;
                    try {
                        const schemaStatus = await (window as any).electronAPI?.dbSchemaStatus?.();
                        isReady = Boolean(schemaStatus?.ready);
                    } catch (schemaErr) {
                        console.warn('[SQLite Adapter] dbSchemaStatus indisponível:', schemaErr);
                        try {
                            const bootstrap = await (window as any).electronAPI?.userAuthBootstrapStatus?.();
                            if (bootstrap?.hasUsers) isReady = true;
                        } catch {
                            // manter false
                        }
                    }

                    if (!isReady) {
                        await createTables();
                        try {
                            await (window as any).electronAPI?.dbSchemaReady?.();
                        } catch (readyErr) {
                            console.warn('[SQLite Adapter] Erro ao invocar dbSchemaReady:', readyErr);
                        }
                    }
                    // @ts-ignore
                    window.sqliteInitialized = true;
                    return { success: true };
                } else {
                    console.log('[SQLite Adapter] Initializing sql.js (Web fallback)');
                    await initDB();
                    // @ts-ignore
                    window.sqliteInitialized = true;
                    return { success: true };
                }
            } catch (error) {
                console.error('[SQLite Adapter] Critical Initialization Failure:', error);
                sharedInitPromise = null; // Allow retry on failure
                throw error;
            }
        })();

        return sharedInitPromise;
    },

    run: async (sql: string, params: any[] = []): Promise<{ lastInsertRowid: number; changes: number }> => {
        if (checkIsElectron()) {
            const result = await (window as any).electronAPI.dbExecute(sql, params);
            return {
                lastInsertRowid: result.lastInsertRowid || 0,
                changes: result.changes || 0
            };
        }

        // Fallback to sql.js
        const sanitizedParams = params.map(p => p === undefined ? null : p);
        const database = await initDB();
        try {
            database.run(sql, sanitizedParams);
            await persistDB();

            if ((window as any).electronAPI?.notifyDbUpdate) {
                (window as any).electronAPI.notifyDbUpdate();
            }

            return {
                lastInsertRowid: database.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] as number || 0,
                changes: database.getRowsModified()
            };
        } catch (error) {
            console.error('Erro no run do SQLite:', error, { sql, params });
            throw error;
        }
    },

    get: async <T = any>(sql: string, params: any[] = []): Promise<T | undefined> => {
        if (checkIsElectron()) {
            return await (window as any).electronAPI.dbGet(sql, params);
        }

        // Fallback to sql.js
        const sanitizedParams = params.map(p => p === undefined ? null : p);
        const database = await initDB();
        try {
            const stmt = database.prepare(sql);
            stmt.bind(sanitizedParams);
            if (stmt.step()) {
                const columns = stmt.getColumnNames();
                const values = stmt.get();
                const result: any = {};
                columns.forEach((col, idx) => {
                    result[col] = values[idx];
                });
                stmt.free();
                return result as T;
            }
            stmt.free();
            return undefined;
        } catch (error) {
            console.error('Erro no get do SQLite:', error, { sql, params });
            throw error;
        }
    },

    all: async <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
        if (checkIsElectron()) {
            return await (window as any).electronAPI.dbQuery(sql, params);
        }

        // Fallback to sql.js
        const sanitizedParams = params.map(p => p === undefined ? null : p);
        const database = await initDB();
        try {
            const stmt = database.prepare(sql);
            stmt.bind(sanitizedParams);
            const results: T[] = [];
            const columns = stmt.getColumnNames();

            while (stmt.step()) {
                const values = stmt.get();
                const result: any = {};
                columns.forEach((col, idx) => {
                    result[col] = values[idx];
                });
                results.push(result);
            }
            stmt.free();
            return results;
        } catch (error) {
            console.error('Erro no all do SQLite:', error, { sql, params });
            throw error;
        }
    },

    exec: async (sql: string): Promise<void> => {
        if (isElectron) {
            const trimmed = sql.trim();
            if (/^VACUUM\b/i.test(trimmed)) {
                if ((window as any).electronAPI?.dbOptimize) {
                    await (window as any).electronAPI.dbOptimize();
                    return;
                }
            }
            if (/^(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(trimmed)) {
                await (window as any).electronAPI.dbExecute(sql, []);
                return;
            }
            await (window as any).electronAPI.dbExec(sql);
            return;
        }

        // Fallback to sql.js
        const database = await initDB();
        try {
            database.exec(sql);
            await persistDB();

            if ((window as any).electronAPI?.notifyDbUpdate) {
                (window as any).electronAPI.notifyDbUpdate();
            }
        } catch (error) {
            console.error('Erro no exec do SQLite:', error, { sql });
            throw error;
        }
    },

    transaction: async (statements: SqlTransactionStatement[]): Promise<any[]> => {
        if (!Array.isArray(statements) || statements.length === 0) return [];

        if (checkIsElectron() && (window as any).electronAPI?.dbTransaction) {
            return await (window as any).electronAPI.dbTransaction(statements);
        }

        const database = await initDB();
        try {
            database.run('BEGIN TRANSACTION');
            const results: any[] = [];
            for (const statement of statements) {
                const params = (statement.params || []).map(p => p === undefined ? null : p);
                if (statement.type === 'exec') {
                    database.exec(statement.sql);
                    results.push({ success: true });
                } else {
                    database.run(statement.sql, params);
                    results.push({
                        lastInsertRowid: database.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] as number || 0,
                        changes: database.getRowsModified()
                    });
                    if (statement.expectChanges !== undefined && database.getRowsModified() !== statement.expectChanges) {
                        throw new Error(`Conflito de concorrÃªncia: esperadas ${statement.expectChanges} alteraÃ§Ãµes, obtidas ${database.getRowsModified()}.`);
                    }
                }
            }
            database.run('COMMIT');
            await persistDB();

            if ((window as any).electronAPI?.notifyDbUpdate) {
                (window as any).electronAPI.notifyDbUpdate();
            }

            return results;
        } catch (error) {
            try {
                database.run('ROLLBACK');
            } catch {
                // ignore rollback errors after failed statements
            }
            console.error('Erro na transaction do SQLite:', error, { statements });
            throw error;
        }
    },

    export: async (): Promise<Uint8Array> => {
        if (isElectron) {
            console.warn('[SQLite] Export not supported in Electron mode (database is file-based)');
            return new Uint8Array();
        }
        const database = await initDB();
        return database.export();
    },

    close: async () => {
        if (isElectron) {
            console.log('[SQLite] Close not needed in Electron mode');
            return;
        }
        if (db) {
            await persistDB();
            db.close();
            db = null;
        }
    }
};

// --- SQL Proxy Listener (Renderer Side) ---
// Escuta pedidos do Main process (vindas da Web Interface) e executa no SQLite local
if (typeof window !== 'undefined' && (window as any).electronAPI?.onExecuteSql) {
    console.log('[SQLite Adapter] Starting SQL Proxy Listener...');

    (window as any).electronAPI.onExecuteSql(async (request: any) => {
        const { requestId, sql, params, method } = request;
        try {
            // Ensure DB is init
            await initDB();

            let result: any;

            // Map methods to sqlite object
            switch (method) {
                case 'run':
                    result = await sqlite.run(sql, params);
                    break;
                case 'all':
                    result = await sqlite.all(sql, params);
                    break;
                case 'get':
                    result = await sqlite.get(sql, params);
                    break;
                case 'exec':
                    await sqlite.exec(sql);
                    result = { success: true };
                    break;
                default:
                    throw new Error(`Unknown method: ${method}`);
            }

            // Notify local UI that a remote write happened (Master only)
            if (['run', 'exec'].includes(method)) {
                window.dispatchEvent(new CustomEvent('database-remote-update', { detail: { method, sql } }));

                // Notificar o Main process para fazer broadcast via SSE para outros escravos
                if ((window as any).electronAPI?.notifyDbUpdate) {
                    (window as any).electronAPI.notifyDbUpdate();
                }
            }

            // Send success response
            (window as any).electronAPI.sendSqlResponse(requestId, { success: true, result });

        } catch (error: any) {
            console.error('[SQLite Proxy] Error executing remote SQL:', error);
            // Send error response
            (window as any).electronAPI.sendSqlResponse(requestId, { success: false, error: error.message || String(error) });
        }
    });
}
