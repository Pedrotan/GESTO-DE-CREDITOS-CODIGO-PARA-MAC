// Gerado por scripts/generate-sql-allowlist.mjs. Não editar manualmente.
export const RENDERER_SQL_ALLOWLIST = new Set<string>([
  "ALTER TABLE audit_logs ADD COLUMN metadata TEXT",
  "ALTER TABLE audit_logs ADD COLUMN newState TEXT",
  "ALTER TABLE audit_logs ADD COLUMN previousState TEXT",
  "ALTER TABLE credits RENAME TO credits_old",
  "ALTER TABLE dictionary RENAME TO dictionary_old",
  "ALTER TABLE payments RENAME TO payments_old",
  "CREATE INDEX IF NOT EXISTS idx_accounting_clientId ON accounting_entries(clientId)",
  "CREATE INDEX IF NOT EXISTS idx_accounting_creditId ON accounting_entries(creditId)",
  "CREATE INDEX IF NOT EXISTS idx_accounting_timestamp ON accounting_entries(timestamp)",
  "CREATE INDEX IF NOT EXISTS idx_accounting_usuario ON accounting_entries(usuario_id)",
  "CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)",
  "CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity)",
  "CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp)",
  "CREATE INDEX IF NOT EXISTS idx_audit_userId ON audit_logs(userId)",
  "CREATE INDEX IF NOT EXISTS idx_audit_user_timestamp ON audit_logs(userId, timestamp)",
  "CREATE INDEX IF NOT EXISTS idx_calendar_tasks_date ON calendar_tasks(date)",
  "CREATE INDEX IF NOT EXISTS idx_calendar_tasks_usuario ON calendar_tasks(usuario_id)",
  "CREATE INDEX IF NOT EXISTS idx_clients_createdAt ON clients(createdAt)",
  "CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email)",
  "CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)",
  "CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status)",
  "CREATE INDEX IF NOT EXISTS idx_clients_usuario ON clients(usuario_id)",
  "CREATE INDEX IF NOT EXISTS idx_collection_messages_client ON collection_messages(clientId)",
  "CREATE INDEX IF NOT EXISTS idx_collection_messages_sentAt ON collection_messages(sentAt)",
  "CREATE INDEX IF NOT EXISTS idx_contracts_usuario ON contracts(usuario_id)",
  "CREATE INDEX IF NOT EXISTS idx_credit_installments_due ON credit_installments(creditId, status, dueDate)",
  "CREATE INDEX IF NOT EXISTS idx_credits_clientId ON credits(clientId)",
  "CREATE INDEX IF NOT EXISTS idx_credits_createdAt ON credits(createdAt)",
  "CREATE INDEX IF NOT EXISTS idx_credits_dueDate ON credits(dueDate)",
  "CREATE INDEX IF NOT EXISTS idx_credits_startDate ON credits(startDate)",
  "CREATE INDEX IF NOT EXISTS idx_credits_status ON credits(status)",
  "CREATE INDEX IF NOT EXISTS idx_credits_status_dueDate ON credits(status, dueDate)",
  "CREATE INDEX IF NOT EXISTS idx_credits_usuario ON credits(usuario_id)",
  "CREATE INDEX IF NOT EXISTS idx_ledger_lines_transaction ON ledger_lines(transactionId)",
  "CREATE INDEX IF NOT EXISTS idx_ledger_transactions_source ON ledger_transactions(sourceType, sourceId)",
  "CREATE INDEX IF NOT EXISTS idx_ledger_transactions_timestamp ON ledger_transactions(timestamp)",
  "CREATE INDEX IF NOT EXISTS idx_legal_cases_usuario ON legal_cases(usuario_id)",
  "CREATE INDEX IF NOT EXISTS idx_payments_creditId ON payments(creditId)",
  "CREATE INDEX IF NOT EXISTS idx_payments_credit_date ON payments(creditId, paymentDate)",
  "CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paymentDate)",
  "CREATE INDEX IF NOT EXISTS idx_payments_paymentDate ON payments(paymentDate)",
  "CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)",
  "CREATE INDEX IF NOT EXISTS idx_payments_usuario ON payments(usuario_id)",
  "CREATE INDEX IF NOT EXISTS idx_simulations_amount ON simulations(amount)",
  "CREATE INDEX IF NOT EXISTS idx_simulations_clientName ON simulations(clientName)",
  "CREATE INDEX IF NOT EXISTS idx_simulations_createdAt ON simulations(createdAt)",
  "CREATE INDEX IF NOT EXISTS idx_simulations_date ON simulations(date)",
  "CREATE INDEX IF NOT EXISTS idx_simulations_usuario ON simulations(usuario_id)",
  "CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status)",
  "CREATE INDEX IF NOT EXISTS idx_suppliers_usuario ON suppliers(usuario_id)",
  "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
  "CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)",
  "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
  "CREATE INDEX IF NOT EXISTS idx_warranties_usuario ON warranties(usuario_id)",
  "CREATE TABLE IF NOT EXISTS accounting_entries ( id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, type TEXT NOT NULL, description TEXT, clientId TEXT, creditId TEXT, paymentId TEXT, debit TEXT NOT NULL, credit TEXT NOT NULL, amountPrincipal REAL DEFAULT 0, amountInterest REAL DEFAULT 0, amountLateInterest REAL DEFAULT 0, amountTotal REAL NOT NULL, amountPrincipalMinor INTEGER, amountInterestMinor INTEGER, amountLateInterestMinor INTEGER, amountTotalMinor INTEGER, processedBy TEXT NOT NULL, justification TEXT, integrityHash TEXT, previousHash TEXT, hashVersion INTEGER DEFAULT 1, usuario_id TEXT, FOREIGN KEY(clientId) REFERENCES clients(id) )",
  "CREATE TABLE IF NOT EXISTS audit_logs ( id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, userId TEXT, userName TEXT, action TEXT NOT NULL, entity TEXT NOT NULL, details TEXT, previousState TEXT, newState TEXT, metadata TEXT )",
  "CREATE TABLE IF NOT EXISTS calendar_tasks ( id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, date TEXT NOT NULL, done INTEGER DEFAULT 0, createdAt TEXT DEFAULT (datetime('now')), usuario_id TEXT )",
  "CREATE TABLE IF NOT EXISTS chat_messages ( id TEXT PRIMARY KEY, role TEXT, content TEXT, timestamp TEXT, userId TEXT )",
  "CREATE TABLE IF NOT EXISTS clients ( id TEXT PRIMARY KEY, name TEXT NOT NULL, nif TEXT, phone TEXT, email TEXT, address TEXT, birthDate TEXT, age INTEGER, issueDate TEXT, expiryDate TEXT, gender TEXT, maritalStatus TEXT, fatherName TEXT, motherName TEXT, workInstitution TEXT, socialSecurityNumber TEXT, creditLimit REAL DEFAULT 0, usedCredit REAL DEFAULT 0, availableCredit REAL DEFAULT 0, monthlyIncome REAL DEFAULT 0, defaultInterestRate REAL DEFAULT 0, lateInterestRate REAL DEFAULT 0, toleranceDays INTEGER DEFAULT 0, status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'blocked')), riskLevel TEXT DEFAULT 'medium' CHECK(riskLevel IN ('low', 'medium', 'high')), whatsappVerified INTEGER DEFAULT 0, documents TEXT, bankCoordinates TEXT, receiveMethod TEXT DEFAULT 'transfer', lastContacted TEXT, createdAt TEXT NOT NULL, updatedAt TEXT, notes TEXT, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT )",
  "CREATE TABLE IF NOT EXISTS closed_months ( id TEXT PRIMARY KEY, month INTEGER NOT NULL, year INTEGER NOT NULL, capitalApplied REAL NOT NULL, projectedProfit REAL NOT NULL, realizedProfit REAL NOT NULL, overdueAmount REAL NOT NULL, liquidationRate REAL NOT NULL, closedAt TEXT NOT NULL, closedBy TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS collection_messages ( id TEXT PRIMARY KEY, clientId TEXT NOT NULL, clientName TEXT NOT NULL, creditIds TEXT NOT NULL, channel TEXT NOT NULL, message TEXT NOT NULL, attemptNumber INTEGER DEFAULT 1, totalDue REAL DEFAULT 0, sentAt TEXT NOT NULL, sentBy TEXT, legalTriggered INTEGER DEFAULT 0 )",
  "CREATE TABLE IF NOT EXISTS company_settings ( id INTEGER PRIMARY KEY CHECK(id = 1), name TEXT NOT NULL, nif TEXT, address TEXT, logo TEXT, reportLogo TEXT, licenseKey TEXT, currency TEXT DEFAULT 'AOA', customClauses TEXT, rescueKey TEXT, phone TEXT, primaryColor TEXT, secondaryColor TEXT, watermarkLogo TEXT, sessionTimeout INTEGER DEFAULT 5, email TEXT, whatsapp TEXT, whatsappAutoNotify INTEGER DEFAULT 0, whatsappVerified INTEGER DEFAULT 0, syncEnabled INTEGER DEFAULT 0, syncUrl TEXT, syncApiKey TEXT, syncPasskey TEXT, lastSync TEXT, maintenanceMode INTEGER DEFAULT 0, allowedModulesDuringMaintenance TEXT DEFAULT '[]', enableGatewaysModule INTEGER DEFAULT 1, enableGatewaysModuleAdminOnly INTEGER DEFAULT 0, enableProfileActivity INTEGER DEFAULT 1, enableProfileActivityAdminOnly INTEGER DEFAULT 0, lastBackupDate TEXT, digitalSignatureEnabled INTEGER DEFAULT 1, authorizedSigners TEXT DEFAULT '[]', bankingInfo TEXT DEFAULT '[]', contractTemplates TEXT DEFAULT '[]', installDate TEXT, financialLock INTEGER DEFAULT 0, enableWarrantiesModule INTEGER DEFAULT 1, enableWarrantiesModuleAdminOnly INTEGER DEFAULT 0, enableLegalModule INTEGER DEFAULT 1, enableLegalModuleAdminOnly INTEGER DEFAULT 0, enableScoringModule INTEGER DEFAULT 1, enableScoringModuleAdminOnly INTEGER DEFAULT 0, defaultSimulationInterestRate REAL, defaultSimulationAdminFee REAL, defaultSimulationIof REAL, smtpHost TEXT, smtpPort TEXT, smtpUser TEXT, smtpPassword TEXT, smtpSecure INTEGER DEFAULT 0, smtpFromName TEXT, location TEXT, enableSuppliersModule INTEGER DEFAULT 0, enableSuppliersModuleAdminOnly INTEGER DEFAULT 0, enableMultiTenant INTEGER DEFAULT 1, website TEXT, segment TEXT, slogan TEXT )",
  "CREATE TABLE IF NOT EXISTS contracts ( id TEXT PRIMARY KEY, clientId TEXT, clientName TEXT, title TEXT, value REAL, startDate TEXT, endDate TEXT, status TEXT, terms TEXT, createdAt TEXT, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT )",
  "CREATE TABLE IF NOT EXISTS credit_installments ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, installmentNumber INTEGER NOT NULL CHECK(installmentNumber > 0), dueDate TEXT NOT NULL, principalMinor INTEGER NOT NULL CHECK(principalMinor >= 0), interestMinor INTEGER NOT NULL CHECK(interestMinor >= 0), lateInterestMinor INTEGER NOT NULL DEFAULT 0 CHECK(lateInterestMinor >= 0), paidPrincipalMinor INTEGER NOT NULL DEFAULT 0 CHECK(paidPrincipalMinor >= 0), paidInterestMinor INTEGER NOT NULL DEFAULT 0 CHECK(paidInterestMinor >= 0), paidLateInterestMinor INTEGER NOT NULL DEFAULT 0 CHECK(paidLateInterestMinor >= 0), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partial','paid','overdue','cancelled')), paidAt TEXT, version INTEGER NOT NULL DEFAULT 0, UNIQUE(creditId, installmentNumber), FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT )",
  "CREATE TABLE IF NOT EXISTS credit_reinforcements ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, amountMinor INTEGER NOT NULL CHECK(amountMinor > 0), interestMinor INTEGER NOT NULL DEFAULT 0 CHECK(interestMinor >= 0), idempotencyKey TEXT NOT NULL UNIQUE, notes TEXT, createdBy TEXT, createdAt TEXT NOT NULL, FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT )",
  "CREATE TABLE IF NOT EXISTS credit_reinforcements ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, amountMinor INTEGER NOT NULL CHECK(amountMinor > 0), interestMinor INTEGER NOT NULL DEFAULT 0 CHECK(interestMinor >= 0), idempotencyKey TEXT NOT NULL UNIQUE, notes TEXT, createdBy TEXT, createdAt TEXT NOT NULL, FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT)",
  "CREATE TABLE IF NOT EXISTS credits ( id TEXT PRIMARY KEY, clientId TEXT NOT NULL, clientName TEXT NOT NULL, principalAmount REAL NOT NULL, principalAmountMinor INTEGER, interestRate REAL NOT NULL, lateInterestRate REAL NOT NULL, installments INTEGER NOT NULL, paidInstallments INTEGER DEFAULT 0, currentBalance REAL NOT NULL, currentBalanceMinor INTEGER, startDate TEXT, accruedInterest REAL DEFAULT 0, accruedInterestMinor INTEGER, lateInterest REAL DEFAULT 0, lateInterestMinor INTEGER, totalDue REAL NOT NULL, totalDueMinor INTEGER, version INTEGER NOT NULL DEFAULT 0, dueDate TEXT NOT NULL, daysOverdue INTEGER DEFAULT 0, status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paid', 'overdue', 'defaulted', 'cancelled', 'renegotiated', 'pending_approval', 'rejected')), creditNumber INTEGER DEFAULT 1, paidAt TEXT, createdAt TEXT NOT NULL, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT, targetMonthId TEXT, FOREIGN KEY(clientId) REFERENCES clients(id) ON DELETE RESTRICT )",
  "CREATE TABLE IF NOT EXISTS dictionary ( word TEXT NOT NULL, language TEXT NOT NULL CHECK(language IN ('pt-AO', 'pt-PT', 'both', 'pt', 'ao')), PRIMARY KEY (word, language) )",
  "CREATE TABLE IF NOT EXISTS internal_messages ( id TEXT PRIMARY KEY, senderId TEXT NOT NULL, senderName TEXT NOT NULL, receiverId TEXT NOT NULL, receiverName TEXT NOT NULL, content TEXT NOT NULL, timestamp TEXT NOT NULL, read INTEGER DEFAULT 0 )",
  "CREATE TABLE IF NOT EXISTS ledger_lines ( id TEXT PRIMARY KEY, transactionId TEXT NOT NULL, account TEXT NOT NULL, side TEXT NOT NULL CHECK(side IN ('debit', 'credit')), component TEXT NOT NULL, amountMinor INTEGER NOT NULL CHECK(amountMinor > 0), FOREIGN KEY(transactionId) REFERENCES ledger_transactions(id) ON DELETE RESTRICT )",
  "CREATE TABLE IF NOT EXISTS ledger_transactions ( id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, type TEXT NOT NULL, sourceType TEXT NOT NULL, sourceId TEXT NOT NULL, description TEXT, totalDebitMinor INTEGER NOT NULL CHECK(totalDebitMinor > 0), totalCreditMinor INTEGER NOT NULL CHECK(totalCreditMinor > 0), integrityHash TEXT NOT NULL, previousHash TEXT NOT NULL, hashVersion INTEGER NOT NULL DEFAULT 2, usuario_id TEXT, CHECK(totalDebitMinor = totalCreditMinor) )",
  "CREATE TABLE IF NOT EXISTS legal_cases ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, clientId TEXT NOT NULL, stage TEXT DEFAULT 'interpellated', priority TEXT DEFAULT 'normal', assignedLawyer TEXT, notes TEXT, history TEXT DEFAULT '[]', lastActionDate TEXT, debtAmount REAL, lastAction TEXT, updatedAt TEXT, closedAt TEXT, createdAt TEXT NOT NULL, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT )",
  "CREATE TABLE IF NOT EXISTS message_templates ( id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, content TEXT NOT NULL, isDefault INTEGER DEFAULT 0 )",
  "CREATE TABLE IF NOT EXISTS notifications ( id TEXT PRIMARY KEY, userId TEXT, title TEXT NOT NULL, message TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('info', 'success', 'warning', 'error')), source TEXT DEFAULT 'system' CHECK(source IN ('system', 'chat')), read INTEGER DEFAULT 0, timestamp TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS password_reset_requests ( id TEXT PRIMARY KEY, userId TEXT, userName TEXT NOT NULL, email TEXT NOT NULL, timestamp TEXT NOT NULL, status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'cancelled')) )",
  "CREATE TABLE IF NOT EXISTS payment_gateways ( id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL, type TEXT NOT NULL, status TEXT DEFAULT 'inactive', environment TEXT DEFAULT 'sandbox', apiKey TEXT, apiSecret TEXT, merchantId TEXT, webhookUrl TEXT, webhookSecret TEXT, config TEXT, transactionFee REAL DEFAULT 0, feeType TEXT DEFAULT 'percentage', logo TEXT, description TEXT, supportedMethods TEXT, createdAt TEXT NOT NULL, updatedAt TEXT, lastTestedAt TEXT, lastTestResult TEXT )",
  "CREATE TABLE IF NOT EXISTS payment_references ( id TEXT PRIMARY KEY, creditId TEXT, gatewayId TEXT, reference TEXT, entity TEXT, amount REAL, status TEXT DEFAULT 'pending', proofImage TEXT, expiresAt TEXT, paidAt TEXT, submittedAt TEXT, createdAt TEXT NOT NULL, usuario_id TEXT )",
  "CREATE TABLE IF NOT EXISTS payments ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, clientName TEXT NOT NULL, amount REAL NOT NULL, amountMinor INTEGER, paymentDate TEXT NOT NULL, method TEXT NOT NULL, reference TEXT, allocatedToPrincipal REAL DEFAULT 0, allocatedToPrincipalMinor INTEGER, allocatedToInterest REAL DEFAULT 0, allocatedToInterestMinor INTEGER, allocatedToLateInterest REAL DEFAULT 0, allocatedToLateInterestMinor INTEGER, idempotencyKey TEXT, processedBy TEXT NOT NULL, status TEXT DEFAULT 'confirmed' CHECK(status IN ('pending', 'confirmed', 'cancelled')), deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT, FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT )",
  "CREATE TABLE IF NOT EXISTS schema_migrations ( version INTEGER PRIMARY KEY, name TEXT NOT NULL, appliedAt TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS simulations ( id TEXT PRIMARY KEY, reference TEXT, date TEXT NOT NULL, clientName TEXT, clientIncome REAL DEFAULT 0, amount REAL DEFAULT 0, term INTEGER DEFAULT 0, interestRate REAL DEFAULT 0, method TEXT CHECK(method IN ('price', 'sac')), riskProfile TEXT CHECK(riskProfile IN ('low', 'medium', 'high')), totalPayment REAL DEFAULT 0, monthlyPayment REAL DEFAULT 0, aiAnalysis TEXT, usuario_id TEXT, createdAt TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS suppliers ( id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, nif TEXT, address TEXT, notes TEXT, status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')), createdAt TEXT DEFAULT (datetime('now')), deletedAt TEXT, deletedBy TEXT, usuario_id TEXT )",
  "CREATE TABLE IF NOT EXISTS sync_conflicts ( id TEXT PRIMARY KEY, entityType TEXT NOT NULL, entityId TEXT, operation TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')), createdAt TEXT NOT NULL, resolvedAt TEXT, resolvedBy TEXT )",
  "CREATE TABLE IF NOT EXISTS user_limits ( id TEXT PRIMARY KEY, userId TEXT, role TEXT CHECK(role IN ('admin', 'manager')), maxTransaction REAL NOT NULL, dailyLimit REAL NOT NULL, monthlyLimit REAL NOT NULL, restrictionsEnabled INTEGER DEFAULT 1, updatedAt TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS users ( id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('super_admin', 'admin', 'manager')), avatar TEXT, createdAt TEXT NOT NULL, lastLogin TEXT, lastSeen TEXT, permissions TEXT, status TEXT DEFAULT 'active', ip TEXT, signature TEXT )",
  "CREATE TABLE IF NOT EXISTS warranties ( id TEXT PRIMARY KEY, clientId TEXT NOT NULL, creditId TEXT, type TEXT NOT NULL, description TEXT NOT NULL, marketValue REAL NOT NULL, estimatedValue REAL, status TEXT DEFAULT 'active', documents TEXT DEFAULT '[]', photos TEXT DEFAULT '[]', location TEXT, createdAt TEXT NOT NULL, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT )",
  "CREATE TABLE credits ( id TEXT PRIMARY KEY, clientId TEXT NOT NULL, clientName TEXT NOT NULL, principalAmount REAL NOT NULL, interestRate REAL NOT NULL, lateInterestRate REAL NOT NULL, installments INTEGER NOT NULL, paidInstallments INTEGER DEFAULT 0, currentBalance REAL NOT NULL, startDate TEXT, accruedInterest REAL DEFAULT 0, lateInterest REAL DEFAULT 0, totalDue REAL NOT NULL, dueDate TEXT NOT NULL, daysOverdue INTEGER DEFAULT 0, status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paid', 'overdue', 'defaulted', 'cancelled', 'renegotiated', 'pending_approval', 'rejected')), creditNumber INTEGER DEFAULT 1, paidAt TEXT, createdAt TEXT NOT NULL, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT, approvedBy TEXT, requestedBy TEXT, requestedAt TEXT, approvalNotes TEXT, targetMonthId TEXT, FOREIGN KEY(clientId) REFERENCES clients(id) ON DELETE RESTRICT )",
  "CREATE TABLE dictionary ( word TEXT NOT NULL, language TEXT NOT NULL CHECK(language IN ('pt-AO', 'pt-PT', 'both', 'pt', 'ao')), PRIMARY KEY (word, language) )",
  "CREATE TABLE payments ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, clientName TEXT NOT NULL, amount REAL NOT NULL, paymentDate TEXT NOT NULL, method TEXT NOT NULL, reference TEXT, allocatedToPrincipal REAL DEFAULT 0, allocatedToInterest REAL DEFAULT 0, allocatedToLateInterest REAL DEFAULT 0, processedBy TEXT NOT NULL, status TEXT DEFAULT 'confirmed' CHECK(status IN ('pending', 'confirmed', 'cancelled')), deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT, FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT )",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_immutable_delete BEFORE DELETE ON accounting_entries BEGIN SELECT RAISE(ABORT, 'Os lançamentos contabilísticos são imutáveis",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_immutable_update BEFORE UPDATE ON accounting_entries BEGIN SELECT RAISE(ABORT, 'Os lançamentos contabilísticos são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_payment_unique BEFORE INSERT ON accounting_entries WHEN NEW.paymentId IS NOT NULL AND NEW.type = 'payment' AND EXISTS ( SELECT 1 FROM accounting_entries WHERE paymentId = NEW.paymentId AND type = 'payment' ) BEGIN SELECT RAISE(ABORT, 'Pagamento já registado no ledger')",
  "CREATE TRIGGER IF NOT EXISTS trg_ledger_lines_immutable_delete BEFORE DELETE ON ledger_lines BEGIN SELECT RAISE(ABORT, 'As linhas do ledger são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_ledger_lines_immutable_update BEFORE UPDATE ON ledger_lines BEGIN SELECT RAISE(ABORT, 'As linhas do ledger são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_ledger_transactions_immutable_delete BEFORE DELETE ON ledger_transactions BEGIN SELECT RAISE(ABORT, 'As transações do ledger são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_ledger_transactions_immutable_update BEFORE UPDATE ON ledger_transactions BEGIN SELECT RAISE(ABORT, 'As transações do ledger são imutáveis')",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_nif_active ON clients(nif) WHERE deletedAt IS NULL AND nif NOT LIKE 'SEM-%' AND nif != 'SEM IDENTIFICAÇÃO'",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone_active ON clients(phone) WHERE deletedAt IS NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_reinforcement_idempotency ON credit_reinforcements(idempotencyKey)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency ON payments(idempotencyKey) WHERE idempotencyKey IS NOT NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)",
  "DELETE FROM audit_logs",
  "DELETE FROM audit_logs WHERE id = ?",
  "DELETE FROM audit_logs WHERE userId = ?",
  "DELETE FROM calendar_tasks WHERE id = ?",
  "DELETE FROM chat_messages",
  "DELETE FROM clients",
  "DELETE FROM clients WHERE id = ?",
  "DELETE FROM closed_months WHERE id = ?",
  "DELETE FROM contracts",
  "DELETE FROM contracts WHERE id = ?",
  "DELETE FROM credits",
  "DELETE FROM credits WHERE id = ?",
  "DELETE FROM internal_messages WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)",
  "DELETE FROM internal_messages WHERE id = ?",
  "DELETE FROM legal_cases WHERE id = ?",
  "DELETE FROM message_templates WHERE id = ?",
  "DELETE FROM notifications",
  "DELETE FROM notifications WHERE id = ?",
  "DELETE FROM notifications WHERE source = ?",
  "DELETE FROM payment_gateways",
  "DELETE FROM payment_gateways WHERE id = ?",
  "DELETE FROM payment_references",
  "DELETE FROM payment_references WHERE id = ?",
  "DELETE FROM payments",
  "DELETE FROM payments WHERE id = ?",
  "DELETE FROM simulations WHERE id = ?",
  "DELETE FROM sqlite_sequence WHERE name IN ('clients', 'credits', 'payments', 'contracts', 'notifications', 'audit_logs', 'chat_messages', 'payment_gateways', 'payment_references')",
  "DELETE FROM users WHERE id = ?",
  "DELETE FROM warranties WHERE id = ?",
  "DROP INDEX IF EXISTS idx_clients_nif_active",
  "DROP TABLE credits_old",
  "DROP TABLE dictionary_old",
  "DROP TABLE payments_old",
  "INSERT INTO accounting_entries (id, timestamp, type, description, clientId, creditId, paymentId, debit, credit, amountPrincipal, amountInterest, amountLateInterest, amountTotal, amountPrincipalMinor, amountInterestMinor, amountLateInterestMinor, amountTotalMinor, processedBy, justification, integrityHash, previousHash, hashVersion, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'create', 'accounting_entry', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'create', 'credit', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'create', 'payment', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'delete', 'payment', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'restore', 'payment', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'update', 'credit', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, 'update', 'credit', ?, ?, ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO calendar_tasks (id, title, description, date, done, createdAt, usuario_id) VALUES (?,?,?,?,?,?,?)",
  "INSERT INTO clients (id, name, nif, phone, email, address, creditLimit, usedCredit, availableCredit, monthlyIncome, defaultInterestRate, lateInterestRate, toleranceDays, status, riskLevel, whatsappVerified, documents, bankCoordinates, receiveMethod, lastContacted, createdAt, usuario_id, birthDate, age, issueDate, expiryDate, gender, maritalStatus, fatherName, motherName, workInstitution, socialSecurityNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO collection_messages (id, clientId, clientName, creditIds, channel, message, attemptNumber, totalDue, sentAt, sentBy, legalTriggered) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO contracts (id, clientId, clientName, title, value, startDate, endDate, status, terms, createdAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO credit_installments (id, creditId, installmentNumber, dueDate, principalMinor, interestMinor) VALUES (?, ?, ?, ?, ?, ?)",
  "INSERT INTO credit_reinforcements (id, creditId, amountMinor, interestMinor, idempotencyKey, notes, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO credits (id, clientId, clientName, principalAmount, principalAmountMinor, interestRate, lateInterestRate, installments, paidInstallments, currentBalance, currentBalanceMinor, accruedInterest, accruedInterestMinor, lateInterest, lateInterestMinor, totalDue, totalDueMinor, version, amortizationMethod, startDate, dueDate, status, creditNumber, createdAt, requestedBy, requestedAt, approvedBy, approvalNotes, usuario_id, targetMonthId, supplierId, supplierProfitRate) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  "INSERT INTO internal_messages (id, senderId, senderName, receiverId, receiverName, content, timestamp, read) VALUES (?,?,?,?,?,?,?,?)",
  "INSERT INTO ledger_lines (id, transactionId, account, side, component, amountMinor) VALUES (?,?,?,?,?,?)",
  "INSERT INTO ledger_transactions (id, timestamp, type, sourceType, sourceId, description, totalDebitMinor, totalCreditMinor, integrityHash, previousHash, hashVersion, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  "INSERT INTO legal_cases (id, clientId, creditId, stage, priority, debtAmount, lastAction, notes, createdAt, updatedAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO message_templates (id, name, type, content, isDefault) VALUES (?, ?, ?, ?, ?)",
  "INSERT INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, 'Novo Crédito', ?, 'success', 0, ?)",
  "INSERT INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, 'Pagamento Recebido', ?, 'success', 0, ?)",
  "INSERT INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, ?, ?, ?, 0, ?)",
  "INSERT INTO notifications (id, userId, title, message, type, source, read, timestamp) VALUES (?,?,?,?,?,?,?,?)",
  "INSERT INTO password_reset_requests (id, userId, userName, email, timestamp, status) VALUES (?, ?, ?, ?, ?, ?)",
  "INSERT INTO payment_gateways ( id, name, provider, type, status, environment, apiKey, apiSecret, merchantId, webhookUrl, webhookSecret, transactionFee, feeType, logo, description, supportedMethods, config, createdAt ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO payment_references ( id, creditId, gatewayId, reference, entity, amount, status, createdAt ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO payment_references ( id, creditId, gatewayId, reference, entity, amount, status, createdAt, expiresAt, paidAt, proofImage ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO payments (id, creditId, clientName, amount, amountMinor, paymentDate, method, reference, allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest, allocatedToInterestMinor, allocatedToLateInterest, allocatedToLateInterestMinor, idempotencyKey, processedBy, status, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  "INSERT INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)",
  "INSERT INTO simulations ( id, reference, date, clientName, clientIncome, amount, term, interestRate, method, riskProfile, totalPayment, monthlyPayment, aiAnalysis, usuario_id, createdAt ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO suppliers (id, name, phone, email, nif, address, notes, status, createdAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)",
  "INSERT INTO users (id, name, email, username, password, role, avatar, createdAt, permissions, status, ip, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO warranties (id, clientId, creditId, type, description, marketValue, status, location, photos, documents, notes, createdAt, updatedAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT OR IGNORE INTO company_settings (id, name, nif) VALUES (1, 'Tango Gestão de Créditos', '000000000')",
  "INSERT OR IGNORE INTO contracts (id, clientId, clientName, title, value, startDate, endDate, status, createdAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)",
  "INSERT OR IGNORE INTO credit_installments (id, creditId, installmentNumber, dueDate, principalMinor, interestMinor) VALUES (?, ?, ?, ?, ?, ?)",
  "INSERT OR IGNORE INTO dictionary (word, language) SELECT word, CASE WHEN language = 'ao' THEN 'pt-AO' WHEN language = 'pt' THEN 'pt-PT' WHEN language IN ('pt-AO', 'pt-PT', 'both') THEN language ELSE 'both' END FROM dictionary_old",
  "INSERT OR IGNORE INTO dictionary (word, language) VALUES (?, ?)",
  "INSERT OR IGNORE INTO message_templates (id, name, type, content, isDefault) VALUES (?, ?, ?, ?, 1)",
  "INSERT OR IGNORE INTO sync_conflicts (id, entityType, entityId, operation, status, createdAt) VALUES (?, ?, ?, ?, 'pending', ?)",
  "INSERT OR IGNORE INTO user_limits (id, role, maxTransaction, dailyLimit, monthlyLimit, restrictionsEnabled, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
  "INSERT OR REPLACE INTO closed_months (id, month, year, capitalApplied, projectedProfit, realizedProfit, overdueAmount, liquidationRate, closedAt, closedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT OR REPLACE INTO company_settings ( id, name, nif, address, logo, reportLogo, watermarkLogo, currency, customClauses, rescueKey, phone, primaryColor, secondaryColor, email, whatsapp, whatsappAutoNotify, whatsappVerified, syncEnabled, syncUrl, syncApiKey, syncPasskey, lastSync, maintenanceMode, sessionTimeout, allowedModulesDuringMaintenance, enableGatewaysModule, enableProfileActivity, digitalSignatureEnabled, authorizedSigners, bankingInfo, contractTemplates, lastBackupDate, installDate, financialLock, licenseKey, enableGatewaysModuleAdminOnly, enableProfileActivityAdminOnly, enableWarrantiesModule, enableWarrantiesModuleAdminOnly, enableLegalModule, enableLegalModuleAdminOnly, enableScoringModule, enableScoringModuleAdminOnly, location, enableSuppliersModule, enableSuppliersModuleAdminOnly, enableMultiTenant, website, segment, slogan, defaultSimulationInterestRate, defaultSimulationAdminFee, defaultSimulationIof, smtpHost, smtpPort, smtpUser, smtpPassword, smtpSecure, smtpFromName ) VALUES ( 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )",
  "INSERT OR REPLACE INTO company_settings ( id, name, nif, currency, sessionTimeout, installDate ) VALUES (1, ?, ?, ?, ?, ?)",
  "INSERT OR REPLACE INTO users (id, name, email, username, password, role, avatar, createdAt, permissions, status, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "PRAGMA integrity_check",
  "PRAGMA table_info(audit_logs)",
  "PRAGMA table_info(credits_old)",
  "PRAGMA table_info(dictionary)",
  "PRAGMA table_info(payments_old)",
  "SELECT * FROM accounting_entries ORDER BY timestamp DESC, id DESC LIMIT ?",
  "SELECT * FROM accounting_entries WHERE timestamp < ? OR (timestamp = ? AND id < ?) ORDER BY timestamp DESC, id DESC LIMIT ?",
  "SELECT * FROM audit_logs ORDER BY timestamp DESC, id DESC LIMIT ?",
  "SELECT * FROM audit_logs WHERE timestamp < ? OR (timestamp = ? AND id < ?) ORDER BY timestamp DESC, id DESC LIMIT ?",
  "SELECT * FROM calendar_tasks ORDER BY date ASC",
  "SELECT * FROM clients WHERE deletedAt IS NOT NULL",
  "SELECT * FROM clients WHERE deletedAt IS NULL",
  "SELECT * FROM clients WHERE id = ?",
  "SELECT * FROM closed_months",
  "SELECT * FROM collection_messages ORDER BY sentAt DESC",
  "SELECT * FROM company_settings WHERE id = 1",
  "SELECT * FROM company_settings WHERE id = ?",
  "SELECT * FROM contracts WHERE deletedAt IS NOT NULL ORDER BY createdAt DESC",
  "SELECT * FROM contracts WHERE deletedAt IS NULL ORDER BY createdAt DESC",
  "SELECT * FROM credits WHERE id = ?",
  "SELECT * FROM internal_messages ORDER BY timestamp ASC",
  "SELECT * FROM legal_cases WHERE clientId = ?",
  "SELECT * FROM legal_cases WHERE creditId = ?",
  "SELECT * FROM legal_cases WHERE deletedAt IS NOT NULL ORDER BY createdAt DESC",
  "SELECT * FROM legal_cases WHERE deletedAt IS NULL ORDER BY createdAt DESC",
  "SELECT * FROM legal_cases WHERE id = ?",
  "SELECT * FROM message_templates",
  "SELECT * FROM notifications ORDER BY timestamp DESC LIMIT ?",
  "SELECT * FROM password_reset_requests WHERE id = ?",
  "SELECT * FROM password_reset_requests WHERE status = \"pending\" ORDER BY timestamp DESC",
  "SELECT * FROM payment_gateways ORDER BY createdAt DESC",
  "SELECT * FROM payment_references ORDER BY createdAt DESC",
  "SELECT * FROM payments WHERE deletedAt IS NOT NULL",
  "SELECT * FROM payments WHERE deletedAt IS NULL",
  "SELECT * FROM simulations ORDER BY date DESC",
  "SELECT * FROM suppliers WHERE deletedAt IS NULL",
  "SELECT * FROM suppliers WHERE id = ?",
  "SELECT * FROM user_limits",
  "SELECT * FROM user_limits WHERE role = ?",
  "SELECT * FROM users",
  "SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?",
  "SELECT * FROM users WHERE id = ?",
  "SELECT * FROM warranties WHERE clientId = ?",
  "SELECT * FROM warranties WHERE creditId = ?",
  "SELECT * FROM warranties WHERE deletedAt IS NOT NULL ORDER BY createdAt DESC",
  "SELECT * FROM warranties WHERE deletedAt IS NULL ORDER BY createdAt DESC",
  "SELECT * FROM warranties WHERE id = ?",
  "SELECT COUNT(*) as count FROM dictionary",
  "SELECT COUNT(*) as count FROM legal_cases WHERE priority = ?",
  "SELECT COUNT(*) as count FROM legal_cases WHERE stage = ?",
  "SELECT COUNT(*) as count FROM warranties WHERE status = ?",
  "SELECT SUM(debtAmount) as total FROM legal_cases WHERE stage != ?",
  "SELECT SUM(marketValue) as total FROM warranties WHERE status = ?",
  "SELECT c.id, c.startDate, c.installments, COALESCE(c.principalAmountMinor, CAST(ROUND(c.principalAmount * 100) AS INTEGER)) AS principalMinor, MAX(0, COALESCE(c.totalDueMinor, CAST(ROUND(c.totalDue * 100) AS INTEGER)) - COALESCE(c.principalAmountMinor, CAST(ROUND(c.principalAmount * 100) AS INTEGER))) AS interestMinor FROM credits c WHERE NOT EXISTS (SELECT 1 FROM credit_installments i WHERE i.creditId = c.id)",
  "SELECT id FROM users WHERE email = ?",
  "SELECT id, allocatedToPrincipalMinor, allocatedToInterestMinor, allocatedToLateInterestMinor, deletedAt, status FROM payments WHERE creditId = ?",
  "SELECT id, clientId, clientName, principalAmount, currentBalance, interestRate, lateInterestRate, installments, paidInstallments, startDate, dueDate, status, daysOverdue, accruedInterest, lateInterest, totalDue, createdAt, requestedBy, requestedAt, approvedBy, approvalNotes, creditNumber, paidAt, usuario_id, targetMonthId, supplierId, supplierProfitRate, principalAmountMinor, currentBalanceMinor, accruedInterestMinor, lateInterestMinor, totalDueMinor, version, amortizationMethod FROM credits WHERE deletedAt IS NULL",
  "SELECT id, clientId, clientName, principalAmount, currentBalance, interestRate, lateInterestRate, installments, status, deletedAt, deletedBy, createdAt FROM credits WHERE deletedAt IS NOT NULL",
  "SELECT id, dueDate, principalMinor, interestMinor, lateInterestMinor, status, paidAt, version FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber",
  "SELECT id, entityType, entityId, createdAt FROM sync_conflicts WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 100",
  "SELECT id, installmentNumber, dueDate, principalMinor, interestMinor, lateInterestMinor, paidPrincipalMinor, paidInterestMinor, paidLateInterestMinor, status, paidAt, version FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber",
  "SELECT id, name, email, role, avatar, lastLogin, lastSeen, createdAt, permissions, status, signature FROM users",
  "SELECT id, name, email, username, role, avatar, lastLogin, lastSeen, createdAt, permissions, status, signature, ip FROM users",
  "SELECT id, name, email, username, role, avatar, status, permissions FROM users",
  "SELECT id, name, role FROM users WHERE LOWER(email) = ?",
  "SELECT id, principalMinor, interestMinor, paidPrincipalMinor, paidInterestMinor, status, version FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber",
  "SELECT id, status, interestMinor, lateInterestMinor, paidInterestMinor, paidLateInterestMinor, version FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber",
  "SELECT integrityHash FROM accounting_entries ORDER BY rowid DESC LIMIT 1",
  "SELECT last_insert_rowid() as id",
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  "SELECT rescueKey FROM company_settings WHERE id = 1",
  "SELECT rowid AS ledgerSequence, * FROM accounting_entries ORDER BY rowid ASC",
  "SELECT sessionTimeout FROM company_settings WHERE id = 1",
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='credits'",
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='payments'",
  "SELECT status FROM users WHERE id = ?",
  "SELECT syncEnabled, syncUrl, syncPasskey FROM company_settings WHERE id = 1",
  "SELECT twoFactorSecret FROM users WHERE id = ?",
  "SELECT type, COUNT(*) as count FROM warranties WHERE status = ? GROUP BY type",
  "UPDATE accounting_entries SET amountPrincipalMinor = CAST(ROUND(amountPrincipal * 100) AS INTEGER), amountInterestMinor = CAST(ROUND(amountInterest * 100) AS INTEGER), amountLateInterestMinor = CAST(ROUND(amountLateInterest * 100) AS INTEGER), amountTotalMinor = CAST(ROUND(amountTotal * 100) AS INTEGER) WHERE amountTotalMinor IS NULL",
  "UPDATE clients SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?",
  "UPDATE clients SET deletedAt = NULL, restoredAt = ? WHERE id = ?",
  "UPDATE clients SET name = COALESCE(?, name), nif = COALESCE(?, nif), phone = COALESCE(?, phone), email = COALESCE(?, email), address = COALESCE(?, address), creditLimit = COALESCE(?, creditLimit), usedCredit = COALESCE(?, usedCredit), availableCredit = COALESCE(?, availableCredit), monthlyIncome = COALESCE(?, monthlyIncome), defaultInterestRate = COALESCE(?, defaultInterestRate), lateInterestRate = COALESCE(?, lateInterestRate), toleranceDays = COALESCE(?, toleranceDays), status = COALESCE(?, status), riskLevel = COALESCE(?, riskLevel), whatsappVerified = COALESCE(?, whatsappVerified), documents = COALESCE(?, documents), bankCoordinates = COALESCE(?, bankCoordinates), receiveMethod = COALESCE(?, receiveMethod), lastContacted = COALESCE(?, lastContacted), usuario_id = COALESCE(?, usuario_id), birthDate = COALESCE(?, birthDate), age = COALESCE(?, age), issueDate = COALESCE(?, issueDate), expiryDate = COALESCE(?, expiryDate), gender = COALESCE(?, gender), maritalStatus = COALESCE(?, maritalStatus), fatherName = COALESCE(?, fatherName), motherName = COALESCE(?, motherName), workInstitution = COALESCE(?, workInstitution), socialSecurityNumber = COALESCE(?, socialSecurityNumber) WHERE id = ?",
  "UPDATE clients SET nif = 'SEM-' || substr(hex(randomblob(4)),1,8) WHERE nif = 'SEM IDENTIFICAÇÃO'",
  "UPDATE company_settings SET installDate = ? WHERE installDate IS NULL",
  "UPDATE company_settings SET name = 'Tango Gestão de Créditos' WHERE name = 'Provisório' OR name = 'Empresa' OR name IS NULL OR name = ''",
  "UPDATE company_settings SET rescueKey = NULL WHERE rescueKey = ?",
  "UPDATE contracts SET clientId = COALESCE(?, clientId), clientName = COALESCE(?, clientName), title = COALESCE(?, title), value = COALESCE(?, value), startDate = COALESCE(?, startDate), endDate = COALESCE(?, endDate), status = COALESCE(?, status), terms = COALESCE(?, terms), usuario_id = COALESCE(?, usuario_id) WHERE id = ?",
  "UPDATE contracts SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?",
  "UPDATE contracts SET deletedAt = NULL, restoredAt = ? WHERE id = ?",
  "UPDATE contracts SET status = 'active' WHERE id = ? AND status = 'paid'",
  "UPDATE contracts SET status = 'paid' WHERE id = ? AND status <> 'paid'",
  "UPDATE contracts SET status = 'terminated' WHERE id = ? OR title LIKE ?",
  "UPDATE credit_installments SET interestMinor = ?, lateInterestMinor = ?, version = version + 1 WHERE id = ? AND version = ?",
  "UPDATE credit_installments SET paidPrincipalMinor = ?, paidInterestMinor = ?, paidLateInterestMinor = ?, status = ?, paidAt = ?, version = version + 1 WHERE id = ? AND version = ?",
  "UPDATE credit_installments SET principalMinor = ?, interestMinor = ?, version = version + 1 WHERE id = ? AND version = ?",
  "UPDATE credits SET accruedInterest = ?, accruedInterestMinor = ?, lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?",
  "UPDATE credits SET currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?, lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, paidInstallments = ?, status = ?, paidAt = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?",
  "UPDATE credits SET currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?, lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, paidInstallments = ?, status = ?, paidAt = NULL, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?",
  "UPDATE credits SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?",
  "UPDATE credits SET deletedAt = NULL, restoredAt = ? WHERE id = ?",
  "UPDATE credits SET principalAmount = ?, principalAmountMinor = ?, currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?, totalDue = ?, totalDueMinor = ?, reinforcedAmount = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?",
  "UPDATE credits SET principalAmountMinor = CAST(ROUND(principalAmount * 100) AS INTEGER), currentBalanceMinor = CAST(ROUND(currentBalance * 100) AS INTEGER), accruedInterestMinor = CAST(ROUND(accruedInterest * 100) AS INTEGER), lateInterestMinor = CAST(ROUND(lateInterest * 100) AS INTEGER), totalDueMinor = CAST(ROUND(totalDue * 100) AS INTEGER) WHERE principalAmountMinor IS NULL OR currentBalanceMinor IS NULL OR totalDueMinor IS NULL",
  "UPDATE credits SET status = ?, approvedBy = ?, approvalNotes = ?, version = version + 1 WHERE id = ? AND status = 'pending_approval' AND version = ?",
  "UPDATE credits SET targetMonthId = ?, version = version + 1 WHERE id = ? AND version = ?",
  "UPDATE internal_messages SET read = 1 WHERE id = ?",
  "UPDATE legal_cases SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?",
  "UPDATE legal_cases SET deletedAt = NULL, restoredAt = ? WHERE id = ?",
  "UPDATE message_templates SET content = ? WHERE id = ?",
  "UPDATE message_templates SET content = REPLACE( REPLACE( REPLACE( REPLACE( REPLACE( REPLACE( REPLACE( REPLACE(content, '{client_name}', '{nome_cliente}'), '{company_name}', '{empresa}' ), '{days_overdue}', '{dias_atraso}' ), '{credit_limit}', '{limite_credito}' ), '{amount}', '{valor}' ), '{due_date}', '{data_vencimento}' ), '{balance}', '{saldo_devedor}' ), '{debt_details}', '{detalhe_dividas}' )",
  "UPDATE notifications SET read = 1 WHERE id = ?",
  "UPDATE notifications SET read = 1 WHERE read = 0",
  "UPDATE password_reset_requests SET status = \"cancelled\" WHERE id = ?",
  "UPDATE password_reset_requests SET status = \"completed\" WHERE id = ?",
  "UPDATE payment_gateways SET name = ?, provider = ?, type = ?, status = ?, environment = ?, apiKey = ?, apiSecret = ?, merchantId = ?, webhookUrl = ?, webhookSecret = ?, transactionFee = ?, feeType = ?, description = ?, config = ?, updatedAt = ? WHERE id = ?",
  "UPDATE payment_references SET proofImage = ?, status = ?, submittedAt = ? WHERE id = ?",
  "UPDATE payment_references SET status = ?, paidAt = ? WHERE id = ?",
  "UPDATE payments SET amountMinor = CAST(ROUND(amount * 100) AS INTEGER), allocatedToPrincipalMinor = CAST(ROUND(allocatedToPrincipal * 100) AS INTEGER), allocatedToInterestMinor = CAST(ROUND(allocatedToInterest * 100) AS INTEGER), allocatedToLateInterestMinor = CAST(ROUND(allocatedToLateInterest * 100) AS INTEGER), idempotencyKey = COALESCE(idempotencyKey, id) WHERE amountMinor IS NULL OR idempotencyKey IS NULL",
  "UPDATE payments SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?",
  "UPDATE payments SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ? AND deletedAt IS NULL",
  "UPDATE payments SET deletedAt = NULL, deletedBy = NULL, restoredAt = ? WHERE id = ? AND deletedAt IS NOT NULL",
  "UPDATE payments SET deletedAt = NULL, restoredAt = ? WHERE id = ?",
  "UPDATE suppliers SET deletedAt = datetime('now'), deletedBy = ? WHERE id = ?",
  "UPDATE sync_conflicts SET status = ?, resolutionNote = ?, resolvedBy = ?, resolvedAt = ? WHERE id = ? AND status = 'pending'",
  "UPDATE user_limits SET maxTransaction = ?, dailyLimit = ?, monthlyLimit = ?, restrictionsEnabled = ?, updatedAt = ? WHERE role = ?",
  "UPDATE users SET failedAttempts = 0, blockedAt = NULL WHERE id = ?",
  "UPDATE users SET failedAttempts = ?, ip = ? WHERE id = ?",
  "UPDATE users SET failedAttempts = ?, status = ?, blockedAt = ?, ip = ? WHERE id = ?",
  "UPDATE users SET lastLogin = ?, status = ?, ip = ? WHERE id = ?",
  "UPDATE users SET lastSeen = ? WHERE id = ?",
  "UPDATE users SET password = ? WHERE id = ?",
  "UPDATE users SET password = ?, status = \"active\", failedAttempts = 0, blockedAt = NULL WHERE id = ?",
  "UPDATE users SET status = \"active\", failedAttempts = 0, blockedAt = NULL WHERE id = ?",
  "UPDATE users SET status = ? WHERE id = ?",
  "UPDATE users SET twoFactorEnabled = 0, twoFactorSecret = NULL WHERE id = ?",
  "UPDATE users SET twoFactorEnabled = 1, twoFactorSecret = ? WHERE id = ?",
  "UPDATE warranties SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?",
  "UPDATE warranties SET deletedAt = NULL, restoredAt = ? WHERE id = ?",
  "VACUUM",
  "create",
  "delete",
  "select",
  "select-all-debtors",
  "update"
]);
export const RENDERER_SQL_BY_ID = new Map<string, string>([
  [
    "4a55ce6f501a358edf27db0fb007d95aa9ddfd561018110656824ae40f410109",
    "ALTER TABLE audit_logs ADD COLUMN metadata TEXT"
  ],
  [
    "f0e3c87744de7a6ef8845248930eab2d3a51a45e3b7932dfb5a05b6510a81b60",
    "ALTER TABLE audit_logs ADD COLUMN newState TEXT"
  ],
  [
    "785602d774ef552ab032f8bb9587afaa659a89773d871792d5d625fe392d0faa",
    "ALTER TABLE audit_logs ADD COLUMN previousState TEXT"
  ],
  [
    "4c66af952a4fec530eadcd63f25c94671de9f4a69d1ccaefad08abfc722a2d90",
    "ALTER TABLE credits RENAME TO credits_old"
  ],
  [
    "9964fa7011ea540b7fd138ba60301fda3decf87d634083c1dbe66e67d6cd75b5",
    "ALTER TABLE dictionary RENAME TO dictionary_old"
  ],
  [
    "680b0c5482bd4f774a8634569d2a0dda98950dbbd8137b7355714e2eb8e71ffd",
    "ALTER TABLE payments RENAME TO payments_old"
  ],
  [
    "4eba0da0606300756dffdca8b07a0d252f08a446666408241b8b2a69b381af57",
    "CREATE INDEX IF NOT EXISTS idx_accounting_clientId ON accounting_entries(clientId)"
  ],
  [
    "b6de128c620c62abca54a69c0ba5cbfa834bd7249dec09df7e44789eb8082934",
    "CREATE INDEX IF NOT EXISTS idx_accounting_creditId ON accounting_entries(creditId)"
  ],
  [
    "3d5f430d0af9ec38686e739c5875f5d645f16cce662461d7223c383ae78de301",
    "CREATE INDEX IF NOT EXISTS idx_accounting_timestamp ON accounting_entries(timestamp)"
  ],
  [
    "37d583ed378b4ad4a1f6c8fd3c205ae51dfe95e5cc99fd8b3ffb0bbd919866f9",
    "CREATE INDEX IF NOT EXISTS idx_accounting_usuario ON accounting_entries(usuario_id)"
  ],
  [
    "858da00a7570d0b7d7a93f515149a7b4f86b74b4fffb7ef817fcbed04954be6e",
    "CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)"
  ],
  [
    "6ac1903c0ff1a4714ea6fc51751394d2079a26c6b9fe5b100a8a65ff92cac768",
    "CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity)"
  ],
  [
    "f2fe1459461df57c92f303c8637ab36cc9472b9d990686804675e91cc5b55c0b",
    "CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp)"
  ],
  [
    "64d316f610f000ea7aa2e3b9eeb17d07347066baa098b81f4749b08dddfbcd8f",
    "CREATE INDEX IF NOT EXISTS idx_audit_userId ON audit_logs(userId)"
  ],
  [
    "d682ebbb7ee3aaef1c7ed3a88fefe3fbf509f93e414486d12956a323bf33e3ab",
    "CREATE INDEX IF NOT EXISTS idx_audit_user_timestamp ON audit_logs(userId, timestamp)"
  ],
  [
    "a8767f820ebe3da74a87633bd8dbed33768a1a21c27f780d632a46cf2e636b42",
    "CREATE INDEX IF NOT EXISTS idx_calendar_tasks_date ON calendar_tasks(date)"
  ],
  [
    "ef5c4bc9dc39c6e0e28df01d8e893931ab55ff464ca8442b7beec29513f89aec",
    "CREATE INDEX IF NOT EXISTS idx_calendar_tasks_usuario ON calendar_tasks(usuario_id)"
  ],
  [
    "48dba12af3b1f5b216a74f88036134c9849723a7e6a51eca27e5ba1c2971977d",
    "CREATE INDEX IF NOT EXISTS idx_clients_createdAt ON clients(createdAt)"
  ],
  [
    "57c52ad827e3fc69ce2193da09f3637c9aab5c7f11466b836e1f2ab94f47f2bb",
    "CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email)"
  ],
  [
    "85f174ddb85172c5cf5e729abb4804907cf3cf504649a60d7dc383f11ea26dd4",
    "CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)"
  ],
  [
    "96299303e3d38664eba27b4f101a4901d150a668c8b152dc6b567652194827f7",
    "CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status)"
  ],
  [
    "fc65c499d658cace8c721f7b2c4aa035026ed727338e4e9309bace3cf1b106a1",
    "CREATE INDEX IF NOT EXISTS idx_clients_usuario ON clients(usuario_id)"
  ],
  [
    "e9804c4b40425d38962c315c32242abbc83eb6e32ea0409f63b8f760de7b809c",
    "CREATE INDEX IF NOT EXISTS idx_collection_messages_client ON collection_messages(clientId)"
  ],
  [
    "acd0ba6a809a67dc2b0c145d6145f0bbb00ae548c99c640f62a04a3c0e169dae",
    "CREATE INDEX IF NOT EXISTS idx_collection_messages_sentAt ON collection_messages(sentAt)"
  ],
  [
    "8197e43059a8893fc18da3faccd0fbd599d9d42c147577320f23f74f56042c1e",
    "CREATE INDEX IF NOT EXISTS idx_contracts_usuario ON contracts(usuario_id)"
  ],
  [
    "2bbc6ebd4e6ec4f0ae4998607f449d7cc3ae7df164952b3f8d38c63746f3e2db",
    "CREATE INDEX IF NOT EXISTS idx_credit_installments_due ON credit_installments(creditId, status, dueDate)"
  ],
  [
    "48bb89b45a47810f63e4c402ccd422b57a785a63c6bfbaae5289f5d6b65bbe9b",
    "CREATE INDEX IF NOT EXISTS idx_credits_clientId ON credits(clientId)"
  ],
  [
    "2f2b86e73eeef502b6783a23fcbe2b3a8c9e9cb800cb2265d173df78e0e23404",
    "CREATE INDEX IF NOT EXISTS idx_credits_createdAt ON credits(createdAt)"
  ],
  [
    "0887c292b660d47c708fdefcfe6e2a769d598f4b37f9eea01435ec854ab53171",
    "CREATE INDEX IF NOT EXISTS idx_credits_dueDate ON credits(dueDate)"
  ],
  [
    "376da71c5e58980fa2ee575d5bd8bf7157bee5b5b6997d1dc198ec8d5becdfac",
    "CREATE INDEX IF NOT EXISTS idx_credits_startDate ON credits(startDate)"
  ],
  [
    "d4ea047de46961f99c1c073c52c754a3dc51b8420c02523081eb3370dc66c4b1",
    "CREATE INDEX IF NOT EXISTS idx_credits_status ON credits(status)"
  ],
  [
    "b6181a8f2ad56682fff885f87fc4bdbfbd655e913979b9936f1ef31541a286cc",
    "CREATE INDEX IF NOT EXISTS idx_credits_status_dueDate ON credits(status, dueDate)"
  ],
  [
    "85e8c86491075057c76cb5eb62d22e2f49d62c0902977bac3c0d851db997c67a",
    "CREATE INDEX IF NOT EXISTS idx_credits_usuario ON credits(usuario_id)"
  ],
  [
    "e59f5a8d8de9b9b8df0159cfd945c9285585c9e3519cfdd35a701df7c254e60c",
    "CREATE INDEX IF NOT EXISTS idx_ledger_lines_transaction ON ledger_lines(transactionId)"
  ],
  [
    "b38e9643d8c09959d10bb78f981dd1f3f9a515fc64117692e5e78aa8cba77039",
    "CREATE INDEX IF NOT EXISTS idx_ledger_transactions_source ON ledger_transactions(sourceType, sourceId)"
  ],
  [
    "8082b47185e68f2359047fff1aff750a424fd413f1b73c93524ebebd8f39b340",
    "CREATE INDEX IF NOT EXISTS idx_ledger_transactions_timestamp ON ledger_transactions(timestamp)"
  ],
  [
    "13fc34b751d824ae151f6c9ade646435e2752c08b0e3f7b45dd22281e72bf634",
    "CREATE INDEX IF NOT EXISTS idx_legal_cases_usuario ON legal_cases(usuario_id)"
  ],
  [
    "262d3ad07f6b13adfddb5ce2b4a3961089a4ae6e73b426a82a0db8a770b964ef",
    "CREATE INDEX IF NOT EXISTS idx_payments_creditId ON payments(creditId)"
  ],
  [
    "f22044fb7c2787d69b3b90be3d5ec1e85c3311130c1e847e517399eea2d30dff",
    "CREATE INDEX IF NOT EXISTS idx_payments_credit_date ON payments(creditId, paymentDate)"
  ],
  [
    "d8f50fbb551e37e6aed34c9b90ffa2b1b57b26c8a7899769d30d1c9dc6df615f",
    "CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paymentDate)"
  ],
  [
    "65d3bba8314ff600d1a2af8aacfd7a9909a129390e7de64deaa9c9bc169cbbd6",
    "CREATE INDEX IF NOT EXISTS idx_payments_paymentDate ON payments(paymentDate)"
  ],
  [
    "333e08fff2d9443a3a015cefa673faf73207f9d80b8d5430a2a3d7f691dee43a",
    "CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)"
  ],
  [
    "55f178aada1eb375dc4c8d8bbe4b388c708304f557021381a6aaf2036d22a208",
    "CREATE INDEX IF NOT EXISTS idx_payments_usuario ON payments(usuario_id)"
  ],
  [
    "1bce91b59310c9d40e8e68bca65f950ba49a5b1a7f6a3db725b0e4aab2f6b577",
    "CREATE INDEX IF NOT EXISTS idx_simulations_amount ON simulations(amount)"
  ],
  [
    "a765ed21f880f16ac504d797caee7fa6f117adbf7402c0494499432f824150fa",
    "CREATE INDEX IF NOT EXISTS idx_simulations_clientName ON simulations(clientName)"
  ],
  [
    "29921511601ac3578eaa411408dca9f7f8ea5f85b253fe4855aa9d56cf999c89",
    "CREATE INDEX IF NOT EXISTS idx_simulations_createdAt ON simulations(createdAt)"
  ],
  [
    "00ae4c00d28d27443df69aa6e424e0c768f18d9087420d4b2bbef9bd77334128",
    "CREATE INDEX IF NOT EXISTS idx_simulations_date ON simulations(date)"
  ],
  [
    "ff333bd2c7582ae60ae29b9dd2940a758634174401bdd4dd51a820f2346dfe33",
    "CREATE INDEX IF NOT EXISTS idx_simulations_usuario ON simulations(usuario_id)"
  ],
  [
    "6c9e8d50244635a05bc19a7a6a0416220ed4fe5fbc4a54181c6dd89f67510e6c",
    "CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status)"
  ],
  [
    "d651ff6d0f903e9155d7f65c9f29b375a8dc75af0428729244b6910f49bf4226",
    "CREATE INDEX IF NOT EXISTS idx_suppliers_usuario ON suppliers(usuario_id)"
  ],
  [
    "9be911a8083a027dccc7913fc10153134c15e99154d29c303b59df8e0e26ab3a",
    "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"
  ],
  [
    "21951fa4f66f7cd1383188a53104bf97c2302d00b65bb31c54bf8dced18cedd0",
    "CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)"
  ],
  [
    "a9c40a1853481cc2f4bf7fecfd9b5d941c36388d40759029eea6665907ec1e8d",
    "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)"
  ],
  [
    "1a9bb1d4bbe4c06966d0974c42fa252c334494f1bea2a8f4aefd89dc85899d79",
    "CREATE INDEX IF NOT EXISTS idx_warranties_usuario ON warranties(usuario_id)"
  ],
  [
    "fba4675f0985e1cb5a454ef286147a6885b0b0cce3c6d9ea32fa8336a5359d35",
    "CREATE TABLE IF NOT EXISTS accounting_entries ( id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, type TEXT NOT NULL, description TEXT, clientId TEXT, creditId TEXT, paymentId TEXT, debit TEXT NOT NULL, credit TEXT NOT NULL, amountPrincipal REAL DEFAULT 0, amountInterest REAL DEFAULT 0, amountLateInterest REAL DEFAULT 0, amountTotal REAL NOT NULL, amountPrincipalMinor INTEGER, amountInterestMinor INTEGER, amountLateInterestMinor INTEGER, amountTotalMinor INTEGER, processedBy TEXT NOT NULL, justification TEXT, integrityHash TEXT, previousHash TEXT, hashVersion INTEGER DEFAULT 1, usuario_id TEXT, FOREIGN KEY(clientId) REFERENCES clients(id) )"
  ],
  [
    "53fe957f90a62d25d60a7dcf918ed32bb56c5bc0cffa61cc31e18dbbdcbfe688",
    "CREATE TABLE IF NOT EXISTS audit_logs ( id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, userId TEXT, userName TEXT, action TEXT NOT NULL, entity TEXT NOT NULL, details TEXT, previousState TEXT, newState TEXT, metadata TEXT )"
  ],
  [
    "5be8442b78ff1ec430806be6d925d539a9f62493cf4b0350eb5351c998cd723b",
    "CREATE TABLE IF NOT EXISTS calendar_tasks ( id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, date TEXT NOT NULL, done INTEGER DEFAULT 0, createdAt TEXT DEFAULT (datetime('now')), usuario_id TEXT )"
  ],
  [
    "fc3c7a22df401fb284b3ef73dda3dfaac3dca8da7d92ad59fa080de6f6e2a0b4",
    "CREATE TABLE IF NOT EXISTS chat_messages ( id TEXT PRIMARY KEY, role TEXT, content TEXT, timestamp TEXT, userId TEXT )"
  ],
  [
    "c7f06e7360e6573b022a0e565d9988d6348af92fc4774fe492ffd3bd6d2980d2",
    "CREATE TABLE IF NOT EXISTS clients ( id TEXT PRIMARY KEY, name TEXT NOT NULL, nif TEXT, phone TEXT, email TEXT, address TEXT, birthDate TEXT, age INTEGER, issueDate TEXT, expiryDate TEXT, gender TEXT, maritalStatus TEXT, fatherName TEXT, motherName TEXT, workInstitution TEXT, socialSecurityNumber TEXT, creditLimit REAL DEFAULT 0, usedCredit REAL DEFAULT 0, availableCredit REAL DEFAULT 0, monthlyIncome REAL DEFAULT 0, defaultInterestRate REAL DEFAULT 0, lateInterestRate REAL DEFAULT 0, toleranceDays INTEGER DEFAULT 0, status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'blocked')), riskLevel TEXT DEFAULT 'medium' CHECK(riskLevel IN ('low', 'medium', 'high')), whatsappVerified INTEGER DEFAULT 0, documents TEXT, bankCoordinates TEXT, receiveMethod TEXT DEFAULT 'transfer', lastContacted TEXT, createdAt TEXT NOT NULL, updatedAt TEXT, notes TEXT, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT )"
  ],
  [
    "e8f579d0595debb4ef76ec98c407eccb4609897a3aefa6deb24943df1ebd1f07",
    "CREATE TABLE IF NOT EXISTS closed_months ( id TEXT PRIMARY KEY, month INTEGER NOT NULL, year INTEGER NOT NULL, capitalApplied REAL NOT NULL, projectedProfit REAL NOT NULL, realizedProfit REAL NOT NULL, overdueAmount REAL NOT NULL, liquidationRate REAL NOT NULL, closedAt TEXT NOT NULL, closedBy TEXT NOT NULL )"
  ],
  [
    "7ccc7e6746d1c39d35c94dfe31cde931c34faa848cdb60d01fe49c87eca7592a",
    "CREATE TABLE IF NOT EXISTS collection_messages ( id TEXT PRIMARY KEY, clientId TEXT NOT NULL, clientName TEXT NOT NULL, creditIds TEXT NOT NULL, channel TEXT NOT NULL, message TEXT NOT NULL, attemptNumber INTEGER DEFAULT 1, totalDue REAL DEFAULT 0, sentAt TEXT NOT NULL, sentBy TEXT, legalTriggered INTEGER DEFAULT 0 )"
  ],
  [
    "b35621ff31e608427d98fa7b7a7aae5c80e34aa3d5a81b7660cda6027ee2beaa",
    "CREATE TABLE IF NOT EXISTS company_settings ( id INTEGER PRIMARY KEY CHECK(id = 1), name TEXT NOT NULL, nif TEXT, address TEXT, logo TEXT, reportLogo TEXT, licenseKey TEXT, currency TEXT DEFAULT 'AOA', customClauses TEXT, rescueKey TEXT, phone TEXT, primaryColor TEXT, secondaryColor TEXT, watermarkLogo TEXT, sessionTimeout INTEGER DEFAULT 5, email TEXT, whatsapp TEXT, whatsappAutoNotify INTEGER DEFAULT 0, whatsappVerified INTEGER DEFAULT 0, syncEnabled INTEGER DEFAULT 0, syncUrl TEXT, syncApiKey TEXT, syncPasskey TEXT, lastSync TEXT, maintenanceMode INTEGER DEFAULT 0, allowedModulesDuringMaintenance TEXT DEFAULT '[]', enableGatewaysModule INTEGER DEFAULT 1, enableGatewaysModuleAdminOnly INTEGER DEFAULT 0, enableProfileActivity INTEGER DEFAULT 1, enableProfileActivityAdminOnly INTEGER DEFAULT 0, lastBackupDate TEXT, digitalSignatureEnabled INTEGER DEFAULT 1, authorizedSigners TEXT DEFAULT '[]', bankingInfo TEXT DEFAULT '[]', contractTemplates TEXT DEFAULT '[]', installDate TEXT, financialLock INTEGER DEFAULT 0, enableWarrantiesModule INTEGER DEFAULT 1, enableWarrantiesModuleAdminOnly INTEGER DEFAULT 0, enableLegalModule INTEGER DEFAULT 1, enableLegalModuleAdminOnly INTEGER DEFAULT 0, enableScoringModule INTEGER DEFAULT 1, enableScoringModuleAdminOnly INTEGER DEFAULT 0, defaultSimulationInterestRate REAL, defaultSimulationAdminFee REAL, defaultSimulationIof REAL, smtpHost TEXT, smtpPort TEXT, smtpUser TEXT, smtpPassword TEXT, smtpSecure INTEGER DEFAULT 0, smtpFromName TEXT, location TEXT, enableSuppliersModule INTEGER DEFAULT 0, enableSuppliersModuleAdminOnly INTEGER DEFAULT 0, enableMultiTenant INTEGER DEFAULT 1, website TEXT, segment TEXT, slogan TEXT )"
  ],
  [
    "6313b99e162ac8fe97464973b99516416612b83e533d00ace673f8843b886323",
    "CREATE TABLE IF NOT EXISTS contracts ( id TEXT PRIMARY KEY, clientId TEXT, clientName TEXT, title TEXT, value REAL, startDate TEXT, endDate TEXT, status TEXT, terms TEXT, createdAt TEXT, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT )"
  ],
  [
    "8c08344cc6cde3ff2f4f340a5e20147b8ec5efb9f1d9daff49a3a76fcf9c1e32",
    "CREATE TABLE IF NOT EXISTS credit_installments ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, installmentNumber INTEGER NOT NULL CHECK(installmentNumber > 0), dueDate TEXT NOT NULL, principalMinor INTEGER NOT NULL CHECK(principalMinor >= 0), interestMinor INTEGER NOT NULL CHECK(interestMinor >= 0), lateInterestMinor INTEGER NOT NULL DEFAULT 0 CHECK(lateInterestMinor >= 0), paidPrincipalMinor INTEGER NOT NULL DEFAULT 0 CHECK(paidPrincipalMinor >= 0), paidInterestMinor INTEGER NOT NULL DEFAULT 0 CHECK(paidInterestMinor >= 0), paidLateInterestMinor INTEGER NOT NULL DEFAULT 0 CHECK(paidLateInterestMinor >= 0), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partial','paid','overdue','cancelled')), paidAt TEXT, version INTEGER NOT NULL DEFAULT 0, UNIQUE(creditId, installmentNumber), FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT )"
  ],
  [
    "9f8ad5b58f948c33647a1a837a673557646d18aa756d5804cec05d0f4c52c834",
    "CREATE TABLE IF NOT EXISTS credit_reinforcements ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, amountMinor INTEGER NOT NULL CHECK(amountMinor > 0), interestMinor INTEGER NOT NULL DEFAULT 0 CHECK(interestMinor >= 0), idempotencyKey TEXT NOT NULL UNIQUE, notes TEXT, createdBy TEXT, createdAt TEXT NOT NULL, FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT )"
  ],
  [
    "79a691d81d37e174aa631492123e9e448eb05234f0cfb0cd153aaf71db71c3cc",
    "CREATE TABLE IF NOT EXISTS credit_reinforcements ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, amountMinor INTEGER NOT NULL CHECK(amountMinor > 0), interestMinor INTEGER NOT NULL DEFAULT 0 CHECK(interestMinor >= 0), idempotencyKey TEXT NOT NULL UNIQUE, notes TEXT, createdBy TEXT, createdAt TEXT NOT NULL, FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT)"
  ],
  [
    "f077fe2b2c32059687e09d14f26909d20370e4a75aeb5b2a2b9e7a6bece80f8a",
    "CREATE TABLE IF NOT EXISTS credits ( id TEXT PRIMARY KEY, clientId TEXT NOT NULL, clientName TEXT NOT NULL, principalAmount REAL NOT NULL, principalAmountMinor INTEGER, interestRate REAL NOT NULL, lateInterestRate REAL NOT NULL, installments INTEGER NOT NULL, paidInstallments INTEGER DEFAULT 0, currentBalance REAL NOT NULL, currentBalanceMinor INTEGER, startDate TEXT, accruedInterest REAL DEFAULT 0, accruedInterestMinor INTEGER, lateInterest REAL DEFAULT 0, lateInterestMinor INTEGER, totalDue REAL NOT NULL, totalDueMinor INTEGER, version INTEGER NOT NULL DEFAULT 0, dueDate TEXT NOT NULL, daysOverdue INTEGER DEFAULT 0, status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paid', 'overdue', 'defaulted', 'cancelled', 'renegotiated', 'pending_approval', 'rejected')), creditNumber INTEGER DEFAULT 1, paidAt TEXT, createdAt TEXT NOT NULL, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT, targetMonthId TEXT, FOREIGN KEY(clientId) REFERENCES clients(id) ON DELETE RESTRICT )"
  ],
  [
    "2777cdd03e0ebd2be15beeacf0f37a3b504220a8a3655a76018f7da6a6038cf2",
    "CREATE TABLE IF NOT EXISTS dictionary ( word TEXT NOT NULL, language TEXT NOT NULL CHECK(language IN ('pt-AO', 'pt-PT', 'both', 'pt', 'ao')), PRIMARY KEY (word, language) )"
  ],
  [
    "fb7e45c39f9b488c3e81075c0d0373560da4bb5ca01ca39229616fab92888fb7",
    "CREATE TABLE IF NOT EXISTS internal_messages ( id TEXT PRIMARY KEY, senderId TEXT NOT NULL, senderName TEXT NOT NULL, receiverId TEXT NOT NULL, receiverName TEXT NOT NULL, content TEXT NOT NULL, timestamp TEXT NOT NULL, read INTEGER DEFAULT 0 )"
  ],
  [
    "a970f16938d5544b7f24caff55b4e0d12fc811c398f26ea85470fc3367b80f91",
    "CREATE TABLE IF NOT EXISTS ledger_lines ( id TEXT PRIMARY KEY, transactionId TEXT NOT NULL, account TEXT NOT NULL, side TEXT NOT NULL CHECK(side IN ('debit', 'credit')), component TEXT NOT NULL, amountMinor INTEGER NOT NULL CHECK(amountMinor > 0), FOREIGN KEY(transactionId) REFERENCES ledger_transactions(id) ON DELETE RESTRICT )"
  ],
  [
    "6821bb4d24d85edae736fa11af5335e196f9643ccd1d2c1946c5ff4f4b27a525",
    "CREATE TABLE IF NOT EXISTS ledger_transactions ( id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, type TEXT NOT NULL, sourceType TEXT NOT NULL, sourceId TEXT NOT NULL, description TEXT, totalDebitMinor INTEGER NOT NULL CHECK(totalDebitMinor > 0), totalCreditMinor INTEGER NOT NULL CHECK(totalCreditMinor > 0), integrityHash TEXT NOT NULL, previousHash TEXT NOT NULL, hashVersion INTEGER NOT NULL DEFAULT 2, usuario_id TEXT, CHECK(totalDebitMinor = totalCreditMinor) )"
  ],
  [
    "e913b57e9079d2c7eef15e03ce9a24c43399aba79bea086f43ee3e8232c82866",
    "CREATE TABLE IF NOT EXISTS legal_cases ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, clientId TEXT NOT NULL, stage TEXT DEFAULT 'interpellated', priority TEXT DEFAULT 'normal', assignedLawyer TEXT, notes TEXT, history TEXT DEFAULT '[]', lastActionDate TEXT, debtAmount REAL, lastAction TEXT, updatedAt TEXT, closedAt TEXT, createdAt TEXT NOT NULL, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT )"
  ],
  [
    "cf98d4653f26a023cfcdc553f8a75cd38e43b0b28b1a4e88083a5cd91951a4a3",
    "CREATE TABLE IF NOT EXISTS message_templates ( id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, content TEXT NOT NULL, isDefault INTEGER DEFAULT 0 )"
  ],
  [
    "ee46cfebd7e38aad13926278e74c99dc14d3ac839ca61180b951fe1b79092ff4",
    "CREATE TABLE IF NOT EXISTS notifications ( id TEXT PRIMARY KEY, userId TEXT, title TEXT NOT NULL, message TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('info', 'success', 'warning', 'error')), source TEXT DEFAULT 'system' CHECK(source IN ('system', 'chat')), read INTEGER DEFAULT 0, timestamp TEXT NOT NULL )"
  ],
  [
    "6f928bb26b56b49555a62246d3f3e9f834eeaf9b62eb60060d75c8b888305856",
    "CREATE TABLE IF NOT EXISTS password_reset_requests ( id TEXT PRIMARY KEY, userId TEXT, userName TEXT NOT NULL, email TEXT NOT NULL, timestamp TEXT NOT NULL, status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'cancelled')) )"
  ],
  [
    "978820737916e768c769397eccfa9d03d5c97ffb34223a90279111310a81f688",
    "CREATE TABLE IF NOT EXISTS payment_gateways ( id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL, type TEXT NOT NULL, status TEXT DEFAULT 'inactive', environment TEXT DEFAULT 'sandbox', apiKey TEXT, apiSecret TEXT, merchantId TEXT, webhookUrl TEXT, webhookSecret TEXT, config TEXT, transactionFee REAL DEFAULT 0, feeType TEXT DEFAULT 'percentage', logo TEXT, description TEXT, supportedMethods TEXT, createdAt TEXT NOT NULL, updatedAt TEXT, lastTestedAt TEXT, lastTestResult TEXT )"
  ],
  [
    "b938ecda825283e5aac03ae15c6f8ff12be7e50cba9c8c3b4278e8371826a771",
    "CREATE TABLE IF NOT EXISTS payment_references ( id TEXT PRIMARY KEY, creditId TEXT, gatewayId TEXT, reference TEXT, entity TEXT, amount REAL, status TEXT DEFAULT 'pending', proofImage TEXT, expiresAt TEXT, paidAt TEXT, submittedAt TEXT, createdAt TEXT NOT NULL, usuario_id TEXT )"
  ],
  [
    "f5d48944cd7efe796ed04f97be656d997e64d45edd6da640e4093361ccdcd4c4",
    "CREATE TABLE IF NOT EXISTS payments ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, clientName TEXT NOT NULL, amount REAL NOT NULL, amountMinor INTEGER, paymentDate TEXT NOT NULL, method TEXT NOT NULL, reference TEXT, allocatedToPrincipal REAL DEFAULT 0, allocatedToPrincipalMinor INTEGER, allocatedToInterest REAL DEFAULT 0, allocatedToInterestMinor INTEGER, allocatedToLateInterest REAL DEFAULT 0, allocatedToLateInterestMinor INTEGER, idempotencyKey TEXT, processedBy TEXT NOT NULL, status TEXT DEFAULT 'confirmed' CHECK(status IN ('pending', 'confirmed', 'cancelled')), deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT, FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT )"
  ],
  [
    "ffe8b85a1bc705f71927a344605fdd12cb57cded74e477fdf8e4840468405c78",
    "CREATE TABLE IF NOT EXISTS schema_migrations ( version INTEGER PRIMARY KEY, name TEXT NOT NULL, appliedAt TEXT NOT NULL )"
  ],
  [
    "5b85d73f8c54f06ddde0fe84d3ba727e587ef78ccf87540d81a1ba77b079ec77",
    "CREATE TABLE IF NOT EXISTS simulations ( id TEXT PRIMARY KEY, reference TEXT, date TEXT NOT NULL, clientName TEXT, clientIncome REAL DEFAULT 0, amount REAL DEFAULT 0, term INTEGER DEFAULT 0, interestRate REAL DEFAULT 0, method TEXT CHECK(method IN ('price', 'sac')), riskProfile TEXT CHECK(riskProfile IN ('low', 'medium', 'high')), totalPayment REAL DEFAULT 0, monthlyPayment REAL DEFAULT 0, aiAnalysis TEXT, usuario_id TEXT, createdAt TEXT NOT NULL )"
  ],
  [
    "d1a17cd844ecdba8cd2ad88428dd9457a80641414d96c9fb17c39be16cc37224",
    "CREATE TABLE IF NOT EXISTS suppliers ( id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, nif TEXT, address TEXT, notes TEXT, status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')), createdAt TEXT DEFAULT (datetime('now')), deletedAt TEXT, deletedBy TEXT, usuario_id TEXT )"
  ],
  [
    "f5e2410a52dd57965449aac4a1e1ca7b42028b3eba74404d682d52dc0d829328",
    "CREATE TABLE IF NOT EXISTS sync_conflicts ( id TEXT PRIMARY KEY, entityType TEXT NOT NULL, entityId TEXT, operation TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')), createdAt TEXT NOT NULL, resolvedAt TEXT, resolvedBy TEXT )"
  ],
  [
    "5d5960cf0e5df56f24b3389dde347912c7a7b1a4d08f39cb27582f7870aeb4c4",
    "CREATE TABLE IF NOT EXISTS user_limits ( id TEXT PRIMARY KEY, userId TEXT, role TEXT CHECK(role IN ('admin', 'manager')), maxTransaction REAL NOT NULL, dailyLimit REAL NOT NULL, monthlyLimit REAL NOT NULL, restrictionsEnabled INTEGER DEFAULT 1, updatedAt TEXT NOT NULL )"
  ],
  [
    "2ab5d2eb67e3e8cc72c051a6a9b5b9813defd1ed33a8ca97ec9262ba99d62d13",
    "CREATE TABLE IF NOT EXISTS users ( id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('super_admin', 'admin', 'manager')), avatar TEXT, createdAt TEXT NOT NULL, lastLogin TEXT, lastSeen TEXT, permissions TEXT, status TEXT DEFAULT 'active', ip TEXT, signature TEXT )"
  ],
  [
    "eef7f5875b59714a33c7ed793ae5d543500dc9209df111bb04b6d8d2b532027d",
    "CREATE TABLE IF NOT EXISTS warranties ( id TEXT PRIMARY KEY, clientId TEXT NOT NULL, creditId TEXT, type TEXT NOT NULL, description TEXT NOT NULL, marketValue REAL NOT NULL, estimatedValue REAL, status TEXT DEFAULT 'active', documents TEXT DEFAULT '[]', photos TEXT DEFAULT '[]', location TEXT, createdAt TEXT NOT NULL, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT )"
  ],
  [
    "3cdf450b1870b1a6d6eecbd6fd755c1c895a49ccde69e151453a62dd24cbc2a3",
    "CREATE TABLE credits ( id TEXT PRIMARY KEY, clientId TEXT NOT NULL, clientName TEXT NOT NULL, principalAmount REAL NOT NULL, interestRate REAL NOT NULL, lateInterestRate REAL NOT NULL, installments INTEGER NOT NULL, paidInstallments INTEGER DEFAULT 0, currentBalance REAL NOT NULL, startDate TEXT, accruedInterest REAL DEFAULT 0, lateInterest REAL DEFAULT 0, totalDue REAL NOT NULL, dueDate TEXT NOT NULL, daysOverdue INTEGER DEFAULT 0, status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paid', 'overdue', 'defaulted', 'cancelled', 'renegotiated', 'pending_approval', 'rejected')), creditNumber INTEGER DEFAULT 1, paidAt TEXT, createdAt TEXT NOT NULL, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT, approvedBy TEXT, requestedBy TEXT, requestedAt TEXT, approvalNotes TEXT, targetMonthId TEXT, FOREIGN KEY(clientId) REFERENCES clients(id) ON DELETE RESTRICT )"
  ],
  [
    "42d76065ed9886652cda4f67c4e8df7652d4d39d8783f5d9efc6e65052c11d33",
    "CREATE TABLE dictionary ( word TEXT NOT NULL, language TEXT NOT NULL CHECK(language IN ('pt-AO', 'pt-PT', 'both', 'pt', 'ao')), PRIMARY KEY (word, language) )"
  ],
  [
    "d2d8a95010de0c18051b679bfecd0cb1bd82cb6c513f0ce5329b1192574cf7b8",
    "CREATE TABLE payments ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, clientName TEXT NOT NULL, amount REAL NOT NULL, paymentDate TEXT NOT NULL, method TEXT NOT NULL, reference TEXT, allocatedToPrincipal REAL DEFAULT 0, allocatedToInterest REAL DEFAULT 0, allocatedToLateInterest REAL DEFAULT 0, processedBy TEXT NOT NULL, status TEXT DEFAULT 'confirmed' CHECK(status IN ('pending', 'confirmed', 'cancelled')), deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT, FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT )"
  ],
  [
    "0ed27f19fb3b962399d2df25b5c94ffba5d1c4c49c705dde6451ef8c76b5e2e8",
    "CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_immutable_delete BEFORE DELETE ON accounting_entries BEGIN SELECT RAISE(ABORT, 'Os lançamentos contabilísticos são imutáveis"
  ],
  [
    "6312548580678bc43fe20a086be8ec3c6e531e90322eee84518349fd28e89165",
    "CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_immutable_update BEFORE UPDATE ON accounting_entries BEGIN SELECT RAISE(ABORT, 'Os lançamentos contabilísticos são imutáveis')"
  ],
  [
    "b60134d5f108909e150202f69308450822503e53f187db23da3c5d0ab20ddcd9",
    "CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_payment_unique BEFORE INSERT ON accounting_entries WHEN NEW.paymentId IS NOT NULL AND NEW.type = 'payment' AND EXISTS ( SELECT 1 FROM accounting_entries WHERE paymentId = NEW.paymentId AND type = 'payment' ) BEGIN SELECT RAISE(ABORT, 'Pagamento já registado no ledger')"
  ],
  [
    "c2c721f2f30495f9ec562c1fe57797d7287d68e3f93f08729552bfdeecd1a1f2",
    "CREATE TRIGGER IF NOT EXISTS trg_ledger_lines_immutable_delete BEFORE DELETE ON ledger_lines BEGIN SELECT RAISE(ABORT, 'As linhas do ledger são imutáveis')"
  ],
  [
    "c434acb33060d3067eee827d8b34a51d2cc900f11cd208ca253b8e0e0981696c",
    "CREATE TRIGGER IF NOT EXISTS trg_ledger_lines_immutable_update BEFORE UPDATE ON ledger_lines BEGIN SELECT RAISE(ABORT, 'As linhas do ledger são imutáveis')"
  ],
  [
    "9f469b81e7565a57bc9f9282f51b0809297b77d11582534b44a47ced2434ff3e",
    "CREATE TRIGGER IF NOT EXISTS trg_ledger_transactions_immutable_delete BEFORE DELETE ON ledger_transactions BEGIN SELECT RAISE(ABORT, 'As transações do ledger são imutáveis')"
  ],
  [
    "fb069a8f228cc107d0354f043fc0057bc5286eb8cdf10919efb8ba6ab628eebd",
    "CREATE TRIGGER IF NOT EXISTS trg_ledger_transactions_immutable_update BEFORE UPDATE ON ledger_transactions BEGIN SELECT RAISE(ABORT, 'As transações do ledger são imutáveis')"
  ],
  [
    "33729af6d1e203ba1f48414b43bd63b24ba95038d224d5d5f8521d77f65dd7b8",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_nif_active ON clients(nif) WHERE deletedAt IS NULL AND nif NOT LIKE 'SEM-%' AND nif != 'SEM IDENTIFICAÇÃO'"
  ],
  [
    "a7a28bc6b5aa5857ac463a89666e101ffb03bc9a5733a4064f49c4aaf5d8dff2",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone_active ON clients(phone) WHERE deletedAt IS NULL"
  ],
  [
    "3a8ac9f4561aceaf89a2c4ead64e9436dda30e4baded6fe80a21d49e2688da10",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_reinforcement_idempotency ON credit_reinforcements(idempotencyKey)"
  ],
  [
    "9db7bd654e241b7c5dedb8b58b53641726764f65c433ca4bf16dc7cb770a6e3f",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency ON payments(idempotencyKey) WHERE idempotencyKey IS NOT NULL"
  ],
  [
    "6e24d14ca6dcded02bb514886eb93e9251f6562cedba4dab7e8e339d7f850281",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)"
  ],
  [
    "79067a2c7f55f8a1211a46b70384691fa7a547e2d9fe3d66794aeb808f1ccedc",
    "DELETE FROM audit_logs"
  ],
  [
    "f3e7f18912088e994e11ae592705fc5858e8289a9860e1947e53f8449fb72ce0",
    "DELETE FROM audit_logs WHERE id = ?"
  ],
  [
    "10a7df98f13784b3a5d41140ce7cd979a36e6e07d6e08c699096cb2a8ec2afba",
    "DELETE FROM audit_logs WHERE userId = ?"
  ],
  [
    "9e6ff70ada1baa1ec671ce763f01e9edfb39f77350c29406d33f764ea66f85fc",
    "DELETE FROM calendar_tasks WHERE id = ?"
  ],
  [
    "758b4822a1597c4e683b5160015edcca61bdc5e4ed67611ac74a7d241f150615",
    "DELETE FROM chat_messages"
  ],
  [
    "73fdc262a5eb06d5e8346886017639b306a4b1e8007171ae0758cfd91ef641a4",
    "DELETE FROM clients"
  ],
  [
    "caad8ec1acc8229a7bb4002fc3859893e6f6f7192b25eed4aa80ff75620d399d",
    "DELETE FROM clients WHERE id = ?"
  ],
  [
    "d565fa38635b4abb2dbeb235cb054d7184fa7c11bc5b7abaa33bdc4a42145678",
    "DELETE FROM closed_months WHERE id = ?"
  ],
  [
    "ce87b9db92b382e5eb835c5cfbeacb1bf35fde7b1e7829242146adfe4a66c487",
    "DELETE FROM contracts"
  ],
  [
    "bd1d843c4f851e545f499abe5d4c439853d7e4101178d2166ead26270b1b6388",
    "DELETE FROM contracts WHERE id = ?"
  ],
  [
    "1d6c56dbd318960e5a82a74e5c20d6eae381abbdd632b2b2e232a01924ea3a1f",
    "DELETE FROM credits"
  ],
  [
    "814f197e638c58273138d58cb3a839ce2e1b7870b028ebd0ab194424d5002aac",
    "DELETE FROM credits WHERE id = ?"
  ],
  [
    "74b78e06c2590636c2fd2613a2ac66a6d2d6d56699a7d0b5b9e590014985cb7c",
    "DELETE FROM internal_messages WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)"
  ],
  [
    "a1487a0d20c905ebf666cdbe959ff4511e557147b694dca12aabcf077499cb70",
    "DELETE FROM internal_messages WHERE id = ?"
  ],
  [
    "b516ea8c0626dcfe2fb170c17551d2634e053e18a43bb14167b57d3943427ff0",
    "DELETE FROM legal_cases WHERE id = ?"
  ],
  [
    "cb03681008e812af49b701defe65f2fc6b041ad2c20386e43ae5abe6ea22b08b",
    "DELETE FROM message_templates WHERE id = ?"
  ],
  [
    "70599e225e4de6932b8b69fbd565a22ce4f5e4e6f8352dcffdfa0e6ae1f8ba7a",
    "DELETE FROM notifications"
  ],
  [
    "177c4b9cc7901a3b906e5969b86b1c11e6acbfb8e86e98f197d7333030b17964",
    "DELETE FROM notifications WHERE id = ?"
  ],
  [
    "ffe972d8ce9bf47d3ea6b089b36049cc2577bf60d0b762526078e55f49b9cba6",
    "DELETE FROM notifications WHERE source = ?"
  ],
  [
    "7ffc6efd4b85eb2587a25605a0519132ff1062af2074c1eb20d7571792c707fd",
    "DELETE FROM payment_gateways"
  ],
  [
    "2d57736acf39d268ddbe2a9aea5dba6b7a747e71edaff31405bd025a97db276b",
    "DELETE FROM payment_gateways WHERE id = ?"
  ],
  [
    "383f6a820be3b8071bc153416ab8349d79fc226208cdc0abf23aea2b4c2f8bcd",
    "DELETE FROM payment_references"
  ],
  [
    "ad39d352c240b9830200f81370ac53fb5c31f7e943d50c441670d819772f759a",
    "DELETE FROM payment_references WHERE id = ?"
  ],
  [
    "ab75fc3bd0d87926db742fb6c941b41b27d3cb8630b6d5afe22b779fbc7026ab",
    "DELETE FROM payments"
  ],
  [
    "5823cab7fdd63eae7eef460f3c01a18d590bab9077a28e3ec64b9ce3adeae2be",
    "DELETE FROM payments WHERE id = ?"
  ],
  [
    "14e1c6026d649c5bb9f60be32061a2474a599ca20827c988fff9a9bb6d1f948a",
    "DELETE FROM simulations WHERE id = ?"
  ],
  [
    "6c3f9e335b0c132f6fa56e01149528f020ee8225ac2b458b41df52a498b9369f",
    "DELETE FROM sqlite_sequence WHERE name IN ('clients', 'credits', 'payments', 'contracts', 'notifications', 'audit_logs', 'chat_messages', 'payment_gateways', 'payment_references')"
  ],
  [
    "73ffdf5be39aa5c4c160c2f77d6634a6970eeb4e1d3395f045ded747f0ce9d2a",
    "DELETE FROM users WHERE id = ?"
  ],
  [
    "055e733c0e6b5e1b8e99cd4c12591a540c9319121ea84195c47f3502a5a4c08e",
    "DELETE FROM warranties WHERE id = ?"
  ],
  [
    "5bf42e7bb449ba579ef5ae96f613bd7514c17ffeb4a602d24953e47088997078",
    "DROP INDEX IF EXISTS idx_clients_nif_active"
  ],
  [
    "c2c981b57d9d631275c7a2114c1b16a6bc4be718a2d6cd9e6708180747c7ac98",
    "DROP TABLE credits_old"
  ],
  [
    "bbe7ef2251a0ce2704183cb1791dbe92e3ed3be1dd84caa6d3ddf90b156c4ff9",
    "DROP TABLE dictionary_old"
  ],
  [
    "a0485b0a3685bae84c5dde347dcccc056aa305bd5a416133cb80ad3f53b4dfa9",
    "DROP TABLE payments_old"
  ],
  [
    "84f2cb5ccc7bf692aab97c699abe6de38e3ac6d75af14dfb7a384d106a569f60",
    "INSERT INTO accounting_entries (id, timestamp, type, description, clientId, creditId, paymentId, debit, credit, amountPrincipal, amountInterest, amountLateInterest, amountTotal, amountPrincipalMinor, amountInterestMinor, amountLateInterestMinor, amountTotalMinor, processedBy, justification, integrityHash, previousHash, hashVersion, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ],
  [
    "4a15b0901a56594a4692c10e87941cfef1bf94e2f238397453ca24da58e30680",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'create', 'accounting_entry', ?, ?)"
  ],
  [
    "697f8440de8bfa3c758fa569d1b16345869ae0816dcec4010e8110380787c106",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'create', 'credit', ?, ?)"
  ],
  [
    "48b7bb792006efb10144fcf3be2092fdfe6a95cb5230e261e856bcd5ff1dc3a2",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'create', 'payment', ?, ?)"
  ],
  [
    "1f89382e7c06a19ae4b013cb5da15ce9e387635ae5321e9b10d726bc311828f8",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'delete', 'payment', ?, ?)"
  ],
  [
    "86be2cdb587d3a3ad5221c135d5ce98b9abaa3986c02d82c24b6d88fe1c6219b",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'restore', 'payment', ?, ?)"
  ],
  [
    "7131ff53b8bafaf78006b4db5ded9d8de8003c23f8731d2c2d20e4e8dc16bfba",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'update', 'credit', ?, ?)"
  ],
  [
    "b8d24506a4c3fc055349812ec4c14471b8b9dc00ba084dd501638f9584d8280a",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, 'update', 'credit', ?, ?, ?, ?)"
  ],
  [
    "b03c862b340923a9e9585ec991b5664c0d7c5b25aca7870e276a30caf851a14f",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "e437a0878a60cc70d9fd96a08af63aa9f35804da180c80da457cafba322f5f44",
    "INSERT INTO calendar_tasks (id, title, description, date, done, createdAt, usuario_id) VALUES (?,?,?,?,?,?,?)"
  ],
  [
    "f8c588d48b3e85d2b8a7cf5ea55e72bb70d7cdbd73d7c41d7605ec9527b75277",
    "INSERT INTO clients (id, name, nif, phone, email, address, creditLimit, usedCredit, availableCredit, monthlyIncome, defaultInterestRate, lateInterestRate, toleranceDays, status, riskLevel, whatsappVerified, documents, bankCoordinates, receiveMethod, lastContacted, createdAt, usuario_id, birthDate, age, issueDate, expiryDate, gender, maritalStatus, fatherName, motherName, workInstitution, socialSecurityNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "3638b91193dd13588d45729d26ac146b099ae663265ef201038b28e8247ea227",
    "INSERT INTO collection_messages (id, clientId, clientName, creditIds, channel, message, attemptNumber, totalDue, sentAt, sentBy, legalTriggered) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "1fef7aba424e6c56360fff4678f06b33ce251c3ad8a123884d6878a94c06edff",
    "INSERT INTO contracts (id, clientId, clientName, title, value, startDate, endDate, status, terms, createdAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "bd5dcf81d2137e6e1e41a5a8d5154fd54c13a09d1c8a38b7015dc483a88ed33f",
    "INSERT INTO credit_installments (id, creditId, installmentNumber, dueDate, principalMinor, interestMinor) VALUES (?, ?, ?, ?, ?, ?)"
  ],
  [
    "25bf964c0c238c2ccf2d5e5b646246e3d69e39f309c692e8383e0cf85b5d15f7",
    "INSERT INTO credit_reinforcements (id, creditId, amountMinor, interestMinor, idempotencyKey, notes, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "0f4edfc6e8bbf188b8d77495851bf29a84fe58e2e998b9e8e8a8d6339af2963b",
    "INSERT INTO credits (id, clientId, clientName, principalAmount, principalAmountMinor, interestRate, lateInterestRate, installments, paidInstallments, currentBalance, currentBalanceMinor, accruedInterest, accruedInterestMinor, lateInterest, lateInterestMinor, totalDue, totalDueMinor, version, amortizationMethod, startDate, dueDate, status, creditNumber, createdAt, requestedBy, requestedAt, approvedBy, approvalNotes, usuario_id, targetMonthId, supplierId, supplierProfitRate) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ],
  [
    "354403cb3fbc65e11a3acb6f2ed18990fe20472096e214c9192ca4884b2e5c20",
    "INSERT INTO internal_messages (id, senderId, senderName, receiverId, receiverName, content, timestamp, read) VALUES (?,?,?,?,?,?,?,?)"
  ],
  [
    "23b0bff90f55fe2d4527976c545c0a2660f776eb381c1600fca2c33a46caa541",
    "INSERT INTO ledger_lines (id, transactionId, account, side, component, amountMinor) VALUES (?,?,?,?,?,?)"
  ],
  [
    "6e4916b318ae334ec74822f7eb6ac97c56b3480617f63a903965b7c0720d2eec",
    "INSERT INTO ledger_transactions (id, timestamp, type, sourceType, sourceId, description, totalDebitMinor, totalCreditMinor, integrityHash, previousHash, hashVersion, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
  ],
  [
    "d5dd78b5757ab0c140a5d443653a6487dfe1c094da7a264f8df68b92de3bc4b9",
    "INSERT INTO legal_cases (id, clientId, creditId, stage, priority, debtAmount, lastAction, notes, createdAt, updatedAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "dcb12cb4046ce4da3baea318d3d4cdedec47c9b9dd609021ac8801eb7e4806fd",
    "INSERT INTO message_templates (id, name, type, content, isDefault) VALUES (?, ?, ?, ?, ?)"
  ],
  [
    "c9ad7f4741b3d18712b6512f71d276a380c561b04e4c8f4d84720a8eafbe7710",
    "INSERT INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, 'Novo Crédito', ?, 'success', 0, ?)"
  ],
  [
    "26b3c50dfd57be5001f290fccbb58d93648b2d0c7f87395200f68bb447f1e86f",
    "INSERT INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, 'Pagamento Recebido', ?, 'success', 0, ?)"
  ],
  [
    "40175cbf254825df73b4cadb5c4e3d1b8323b7cc05da9fe3ff4dbb3ffe6dc91b",
    "INSERT INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, ?, ?, ?, 0, ?)"
  ],
  [
    "07f07d59a7cf69d9b228f587fe0f537c5f155befe697969ad839984c70086cfb",
    "INSERT INTO notifications (id, userId, title, message, type, source, read, timestamp) VALUES (?,?,?,?,?,?,?,?)"
  ],
  [
    "be172ac7380d39da0d1850eb10aa505f9b78406fcb06812ea193ce898447e8f3",
    "INSERT INTO password_reset_requests (id, userId, userName, email, timestamp, status) VALUES (?, ?, ?, ?, ?, ?)"
  ],
  [
    "d5c59e43fbe66a31ea2727c5c509f9b964c52bad06d293a29b4229201aefdaba",
    "INSERT INTO payment_gateways ( id, name, provider, type, status, environment, apiKey, apiSecret, merchantId, webhookUrl, webhookSecret, transactionFee, feeType, logo, description, supportedMethods, config, createdAt ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "bdb019d78f7a55010f783c8219ad6bbda9951bf705586f863e4cd2536bce014f",
    "INSERT INTO payment_references ( id, creditId, gatewayId, reference, entity, amount, status, createdAt ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "65550d9cfc87dfddc07a1d702e2308f6b9c6b04728598ca57f71fdc65911ceef",
    "INSERT INTO payment_references ( id, creditId, gatewayId, reference, entity, amount, status, createdAt, expiresAt, paidAt, proofImage ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "6da5caf28c370db2c1412d6cd4e9f00610809d260554498f4874f209104f8b35",
    "INSERT INTO payments (id, creditId, clientName, amount, amountMinor, paymentDate, method, reference, allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest, allocatedToInterestMinor, allocatedToLateInterest, allocatedToLateInterestMinor, idempotencyKey, processedBy, status, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ],
  [
    "f2995b6d402befe778f7c32e5550922de27dbb73ddc8b5db9d5bb0f94424df23",
    "INSERT INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)"
  ],
  [
    "bc0f875159af9da57c225dad6469d12b54e5ef1d68759b465e01c0aa6af00844",
    "INSERT INTO simulations ( id, reference, date, clientName, clientIncome, amount, term, interestRate, method, riskProfile, totalPayment, monthlyPayment, aiAnalysis, usuario_id, createdAt ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "a3b0262e0fd986fe6ec56443ecafbb0f3eae271ebd46a44e97e4cafa1709a294",
    "INSERT INTO suppliers (id, name, phone, email, nif, address, notes, status, createdAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)"
  ],
  [
    "cfc731c9be02a2a7d51e20d9a8bca9e76c85319cb6b9747ca1664ed7531b17aa",
    "INSERT INTO users (id, name, email, username, password, role, avatar, createdAt, permissions, status, ip, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "c637cc14941e8f03adf41ddff99d5fc771ff8c1048acdc83e269e7e2a4b13b2c",
    "INSERT INTO warranties (id, clientId, creditId, type, description, marketValue, status, location, photos, documents, notes, createdAt, updatedAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "ccbfe4cd2cec3330b9649b5f5a78bf4da5abcbcee69a46dae6aa481061af3ff0",
    "INSERT OR IGNORE INTO company_settings (id, name, nif) VALUES (1, 'Tango Gestão de Créditos', '000000000')"
  ],
  [
    "d032f54f7459051d29a705cda4a56ba297b4c15ffc036a799bfa9d2c954ccd80",
    "INSERT OR IGNORE INTO contracts (id, clientId, clientName, title, value, startDate, endDate, status, createdAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)"
  ],
  [
    "6ae13246fc143102f8e19cfe722a2b6bdac37ba29fd1f3c5eaab10c014646895",
    "INSERT OR IGNORE INTO credit_installments (id, creditId, installmentNumber, dueDate, principalMinor, interestMinor) VALUES (?, ?, ?, ?, ?, ?)"
  ],
  [
    "f0271133c6339e90f9082d602451b35881ae4c617617fbdae1b2ff9a7bedcbfe",
    "INSERT OR IGNORE INTO dictionary (word, language) SELECT word, CASE WHEN language = 'ao' THEN 'pt-AO' WHEN language = 'pt' THEN 'pt-PT' WHEN language IN ('pt-AO', 'pt-PT', 'both') THEN language ELSE 'both' END FROM dictionary_old"
  ],
  [
    "c7efc365a2cacf70dfb2577b5f6d1eb7fdf391b3304070bcddb3f5cc9ebf98e9",
    "INSERT OR IGNORE INTO dictionary (word, language) VALUES (?, ?)"
  ],
  [
    "8061051673c9849357e501ae700a579e45998cca95222b8407e034a3cc7b65b4",
    "INSERT OR IGNORE INTO message_templates (id, name, type, content, isDefault) VALUES (?, ?, ?, ?, 1)"
  ],
  [
    "4ef80fff9ffd59097084f8874318a8bafadb834e59947ced18ebc6cd1517773b",
    "INSERT OR IGNORE INTO sync_conflicts (id, entityType, entityId, operation, status, createdAt) VALUES (?, ?, ?, ?, 'pending', ?)"
  ],
  [
    "505bd17b93c66e3cf648ce82c2a2d1ca8e037271f802f1a9ca989ba43d737a72",
    "INSERT OR IGNORE INTO user_limits (id, role, maxTransaction, dailyLimit, monthlyLimit, restrictionsEnabled, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "c9cde7dc309fb63bf1f4590bb06f1dce00144519394e74ed22b8c10a65998fb2",
    "INSERT OR REPLACE INTO closed_months (id, month, year, capitalApplied, projectedProfit, realizedProfit, overdueAmount, liquidationRate, closedAt, closedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "f7de20d6c5d5d9cb06110d6d244d117f297ca6f4e761414559116d40bd5ebee1",
    "INSERT OR REPLACE INTO company_settings ( id, name, nif, address, logo, reportLogo, watermarkLogo, currency, customClauses, rescueKey, phone, primaryColor, secondaryColor, email, whatsapp, whatsappAutoNotify, whatsappVerified, syncEnabled, syncUrl, syncApiKey, syncPasskey, lastSync, maintenanceMode, sessionTimeout, allowedModulesDuringMaintenance, enableGatewaysModule, enableProfileActivity, digitalSignatureEnabled, authorizedSigners, bankingInfo, contractTemplates, lastBackupDate, installDate, financialLock, licenseKey, enableGatewaysModuleAdminOnly, enableProfileActivityAdminOnly, enableWarrantiesModule, enableWarrantiesModuleAdminOnly, enableLegalModule, enableLegalModuleAdminOnly, enableScoringModule, enableScoringModuleAdminOnly, location, enableSuppliersModule, enableSuppliersModuleAdminOnly, enableMultiTenant, website, segment, slogan, defaultSimulationInterestRate, defaultSimulationAdminFee, defaultSimulationIof, smtpHost, smtpPort, smtpUser, smtpPassword, smtpSecure, smtpFromName ) VALUES ( 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )"
  ],
  [
    "b7ce77dce7c3ab66f20123d2d29a707992458bd1c1244879228a078787b10d71",
    "INSERT OR REPLACE INTO company_settings ( id, name, nif, currency, sessionTimeout, installDate ) VALUES (1, ?, ?, ?, ?, ?)"
  ],
  [
    "07403a51635e8b9cabb8c005ce8c8a2750749b724b376b5419007c929bf9a1a7",
    "INSERT OR REPLACE INTO users (id, name, email, username, password, role, avatar, createdAt, permissions, status, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "5703922d81e137ae18f060aebc15210f118dc0ab28d445b2375cf789987525ab",
    "PRAGMA integrity_check"
  ],
  [
    "f4b3695f8e138d3f6d08d88b52731881caa3870327f13e837ea00833fd8cbfdb",
    "PRAGMA table_info(audit_logs)"
  ],
  [
    "86fe5103c1e0f985d01f3effbdb77d964dcb66bae1e2d3db799e95ef5315ac14",
    "PRAGMA table_info(credits_old)"
  ],
  [
    "5be097b79867339ac73b307cde75af36dc48b30c919296cb89f09c0c4ecc6a59",
    "PRAGMA table_info(dictionary)"
  ],
  [
    "43a000d74554f147a72a623e8b5133d8ad0564b7f72345da110139a25d8a3b64",
    "PRAGMA table_info(payments_old)"
  ],
  [
    "9d709421058bad5667f01ced945c9703b47b53837f52aaf3e5ec1985879aac46",
    "SELECT * FROM accounting_entries ORDER BY timestamp DESC, id DESC LIMIT ?"
  ],
  [
    "b0cdb0811bac354926eb5eedafd1f49b0bde0a3f8a8febc336239030b745b62a",
    "SELECT * FROM accounting_entries WHERE timestamp < ? OR (timestamp = ? AND id < ?) ORDER BY timestamp DESC, id DESC LIMIT ?"
  ],
  [
    "67c943e1cbc0633a8371206c293d5ec84e3acfe66c98113cf8a86358a1df764e",
    "SELECT * FROM audit_logs ORDER BY timestamp DESC, id DESC LIMIT ?"
  ],
  [
    "3308ed2cce08112c7629a48b63c3670b2c68137e48d9f7a97af159a67445909b",
    "SELECT * FROM audit_logs WHERE timestamp < ? OR (timestamp = ? AND id < ?) ORDER BY timestamp DESC, id DESC LIMIT ?"
  ],
  [
    "01aef533fd55b5c01dab2bc7603cf03e5798a7deeb4cc0d5e354ee524cc369b6",
    "SELECT * FROM calendar_tasks ORDER BY date ASC"
  ],
  [
    "dedd5574a8468d610bafdac5965a79039062ec0250eaed0435324ea39bb58f88",
    "SELECT * FROM clients WHERE deletedAt IS NOT NULL"
  ],
  [
    "f542e4a27ba11b4c3f4e5c68c1b2ce92a257a8f332f180d8dc5656cb764b117f",
    "SELECT * FROM clients WHERE deletedAt IS NULL"
  ],
  [
    "b834cb36f7d64860574b601002cefb089dbf44bda3deb37ccb9ddf036fe40a4b",
    "SELECT * FROM clients WHERE id = ?"
  ],
  [
    "bf41d61725e052fba8917d403315e5a920681ed94162d089cb228cfff80455f8",
    "SELECT * FROM closed_months"
  ],
  [
    "6297e5025eaa64ce232d0296cdb76aa7eb8a335cda4b1a289bbbb2ac585cf996",
    "SELECT * FROM collection_messages ORDER BY sentAt DESC"
  ],
  [
    "20d343ac4e29f8e8807c9c32d6d80258b81ff521dcd30fcff8f821a53fdb403e",
    "SELECT * FROM company_settings WHERE id = 1"
  ],
  [
    "43e7ca76ab7ddbe235b60673deffbcfbd54a4dd8caa77234a27a775d8870cf4f",
    "SELECT * FROM company_settings WHERE id = ?"
  ],
  [
    "5aaac999f318a556c1c4e5426ab282bce919926c8979290c69b1fb14816706c8",
    "SELECT * FROM contracts WHERE deletedAt IS NOT NULL ORDER BY createdAt DESC"
  ],
  [
    "4ca85994fd1542038e0d7d767352680fa1b9dd76c8f8dc8c768230b5241b9a73",
    "SELECT * FROM contracts WHERE deletedAt IS NULL ORDER BY createdAt DESC"
  ],
  [
    "3b07cccc6f86e317f4d41cb323c6b4458a0d7b1480d7baf430c4ffc48523c664",
    "SELECT * FROM credits WHERE id = ?"
  ],
  [
    "42597f4fe4167298886486ecbbafd7d8c62f12964e527109a63d7723d92a8d19",
    "SELECT * FROM internal_messages ORDER BY timestamp ASC"
  ],
  [
    "2418fc9caaededba768005ccb1df59df7fbe7147771ee871f4ae7deb6adbaa63",
    "SELECT * FROM legal_cases WHERE clientId = ?"
  ],
  [
    "92260e9f960a32d4c6da9f2224e9ac90fee4ee574479ee08f2235d56e86ba16b",
    "SELECT * FROM legal_cases WHERE creditId = ?"
  ],
  [
    "8cfba6e750a4147d690368f0901fa4a4758ffd3488e5e1e1f36c7318dff52318",
    "SELECT * FROM legal_cases WHERE deletedAt IS NOT NULL ORDER BY createdAt DESC"
  ],
  [
    "375a54da2315494923ec613a8d6e64daad9882dc6f7ee15684e6c54454d0aa6d",
    "SELECT * FROM legal_cases WHERE deletedAt IS NULL ORDER BY createdAt DESC"
  ],
  [
    "8aafd66b8ed957f9b43ef422d7d44860fc16f89ca767acdc18f5841a6048b596",
    "SELECT * FROM legal_cases WHERE id = ?"
  ],
  [
    "3faae75bbde79b44a777358766f2761a9c4c07785adaba1d701347edefabc713",
    "SELECT * FROM message_templates"
  ],
  [
    "d047f3cffadbc93de76f7a8ea6fb1220e32a147948ae8159143597378f2fe291",
    "SELECT * FROM notifications ORDER BY timestamp DESC LIMIT ?"
  ],
  [
    "cb99131696a5d1b54025bb056f1b0f898dbaaa7cf06374d903af88d970fb2987",
    "SELECT * FROM password_reset_requests WHERE id = ?"
  ],
  [
    "965b5112363b501dbbcd9cc9c9827985f2776d40bfddb464b09a265b0f1346bf",
    "SELECT * FROM password_reset_requests WHERE status = \"pending\" ORDER BY timestamp DESC"
  ],
  [
    "caf096a5458f79066b48ddf999204c515295edc45edbc4e37a60c76a8a6d021b",
    "SELECT * FROM payment_gateways ORDER BY createdAt DESC"
  ],
  [
    "ab38326ada4c32fb201663a718f74a7e7bc8fe4c2526cd21df18041d1b1bd292",
    "SELECT * FROM payment_references ORDER BY createdAt DESC"
  ],
  [
    "09a525d768a966420c5aeecc1ed98262be07a58a4c1f10025cd8a786f0b55fc4",
    "SELECT * FROM payments WHERE deletedAt IS NOT NULL"
  ],
  [
    "8f320ec8d2a204340d471df164d058eefef82df95656f28a79bdec059013bf44",
    "SELECT * FROM payments WHERE deletedAt IS NULL"
  ],
  [
    "e4c57be0f0c3a3009fffe5f3bfe5c983a98b9701c36e2805a03e031f7cf89660",
    "SELECT * FROM simulations ORDER BY date DESC"
  ],
  [
    "ffccd64506c1425b19931542e1911d0ba6b0a96fff4e72c16ec5c11e40d0ab5b",
    "SELECT * FROM suppliers WHERE deletedAt IS NULL"
  ],
  [
    "48c4aaeb13913467a5ae7ab45bec3deb5db750b6d2b9a5c707248786d527af8c",
    "SELECT * FROM suppliers WHERE id = ?"
  ],
  [
    "295970f01c5c96c1aed00bb06d96b685976ee5a18352cbfb5e67b2a1af087858",
    "SELECT * FROM user_limits"
  ],
  [
    "6c2ed7f1a9f3a34e9f625bc306d13ec004c87d994923bb34a31d97a5e5473763",
    "SELECT * FROM user_limits WHERE role = ?"
  ],
  [
    "26e7e05427bc7dabcd7815d27764fda2baf4cfe60a2d2d6ee2a1f773dccbbce2",
    "SELECT * FROM users"
  ],
  [
    "487a0cbc68947ed8757df2f8922699597f414d64f92a5218f93bec4884326cf3",
    "SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?"
  ],
  [
    "6f540be5517aaffe1774bebe9a2c0eba835e11cd8e1b07ea44046ae795008704",
    "SELECT * FROM users WHERE id = ?"
  ],
  [
    "ea5386db1805bf73ff30b5939811691b1877114f0b04d05a67d64532971c5764",
    "SELECT * FROM warranties WHERE clientId = ?"
  ],
  [
    "e3015af552ceeeb487c5bddf2c633fee2c5bf6f77435a7fbefee25a7c23f9aaa",
    "SELECT * FROM warranties WHERE creditId = ?"
  ],
  [
    "24b477382aab6c6566afbd523eae421960531de01c4656a8730c25513e33ff58",
    "SELECT * FROM warranties WHERE deletedAt IS NOT NULL ORDER BY createdAt DESC"
  ],
  [
    "55f4fa132ddd42bc96cc17f25115b01d638b5d47a8f9b8dfff7b9594a6aa0581",
    "SELECT * FROM warranties WHERE deletedAt IS NULL ORDER BY createdAt DESC"
  ],
  [
    "6ca511473799838785a65e73543057e380630ff9d88226c20a33a54de6ab9e08",
    "SELECT * FROM warranties WHERE id = ?"
  ],
  [
    "f79650132f97dcf74034e11a22d56104bfc339f16b82608add7e6747abb811b4",
    "SELECT COUNT(*) as count FROM dictionary"
  ],
  [
    "b9ec8e47bdef533ed5eec85b6602b4be63c4fc08896e70f73bc9d0c311cac4f1",
    "SELECT COUNT(*) as count FROM legal_cases WHERE priority = ?"
  ],
  [
    "1952029be9456f184e37098f4f7b0c80e00a43e08f2ea838d2f9f4ef749e28db",
    "SELECT COUNT(*) as count FROM legal_cases WHERE stage = ?"
  ],
  [
    "9861e3ed1f73a0e476f0229d7766503584f58883741440c5fd182326faa27571",
    "SELECT COUNT(*) as count FROM warranties WHERE status = ?"
  ],
  [
    "ee65254651850f48772b53ce1f86d00d4a79d7d436d030a4d49adc35a84287f1",
    "SELECT SUM(debtAmount) as total FROM legal_cases WHERE stage != ?"
  ],
  [
    "858e3f1dc4688861e9886b9717a7c8af283060c747f2ebd5c0177eb1b067c79f",
    "SELECT SUM(marketValue) as total FROM warranties WHERE status = ?"
  ],
  [
    "b4f72dd297c35a038b6c282db24dab3febda6b37e57afcadc5c2434e59183236",
    "SELECT c.id, c.startDate, c.installments, COALESCE(c.principalAmountMinor, CAST(ROUND(c.principalAmount * 100) AS INTEGER)) AS principalMinor, MAX(0, COALESCE(c.totalDueMinor, CAST(ROUND(c.totalDue * 100) AS INTEGER)) - COALESCE(c.principalAmountMinor, CAST(ROUND(c.principalAmount * 100) AS INTEGER))) AS interestMinor FROM credits c WHERE NOT EXISTS (SELECT 1 FROM credit_installments i WHERE i.creditId = c.id)"
  ],
  [
    "a4821a27a4f2a9662ba6234e4ab77093378c0235e7dc51960e0315ae94766d15",
    "SELECT id FROM users WHERE email = ?"
  ],
  [
    "403bfe52c974d3146335e9226c73cde87702573780bdacba1150b5ef35100196",
    "SELECT id, allocatedToPrincipalMinor, allocatedToInterestMinor, allocatedToLateInterestMinor, deletedAt, status FROM payments WHERE creditId = ?"
  ],
  [
    "b5062e4958bfe822842c3247a764085441bc96b6c9edfabc215f34f0db9d1e93",
    "SELECT id, clientId, clientName, principalAmount, currentBalance, interestRate, lateInterestRate, installments, paidInstallments, startDate, dueDate, status, daysOverdue, accruedInterest, lateInterest, totalDue, createdAt, requestedBy, requestedAt, approvedBy, approvalNotes, creditNumber, paidAt, usuario_id, targetMonthId, supplierId, supplierProfitRate, principalAmountMinor, currentBalanceMinor, accruedInterestMinor, lateInterestMinor, totalDueMinor, version, amortizationMethod FROM credits WHERE deletedAt IS NULL"
  ],
  [
    "ccafb7c269b7a7d7c159d6b9702b60ad64802276a7ab5057cd0668cec8c00822",
    "SELECT id, clientId, clientName, principalAmount, currentBalance, interestRate, lateInterestRate, installments, status, deletedAt, deletedBy, createdAt FROM credits WHERE deletedAt IS NOT NULL"
  ],
  [
    "51c71b145d0c547697cb99799ff68fd1b7c748fecd5e94654786750f12522ad9",
    "SELECT id, dueDate, principalMinor, interestMinor, lateInterestMinor, status, paidAt, version FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber"
  ],
  [
    "a7770ae43efe294accb7439f93d4deb0dbfef90fd94fa5ba13c32b6a83e142a7",
    "SELECT id, entityType, entityId, createdAt FROM sync_conflicts WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 100"
  ],
  [
    "e98f48b365d100b404c42775a95dd65679921d01273ee2fcbe61191b4324fa4b",
    "SELECT id, installmentNumber, dueDate, principalMinor, interestMinor, lateInterestMinor, paidPrincipalMinor, paidInterestMinor, paidLateInterestMinor, status, paidAt, version FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber"
  ],
  [
    "bd8fcf661f6908aed0c135313077d289f5259a5d23f36d708ffcc54bc4250711",
    "SELECT id, name, email, role, avatar, lastLogin, lastSeen, createdAt, permissions, status, signature FROM users"
  ],
  [
    "84648311040c3868247a3dbb7e0fedf9833ce7230d6a9ef888cd72506e3df9e8",
    "SELECT id, name, email, username, role, avatar, lastLogin, lastSeen, createdAt, permissions, status, signature, ip FROM users"
  ],
  [
    "d4e82fae11dd8685c4078a481dcfbad01e016e35bd74288ac66264fd270e4cdf",
    "SELECT id, name, email, username, role, avatar, status, permissions FROM users"
  ],
  [
    "dd72910f6a5a6c1ec60024f1db4062da2f19123c0f06fca75f39cfd80e36261a",
    "SELECT id, name, role FROM users WHERE LOWER(email) = ?"
  ],
  [
    "ff79c9fe765a9c8223eb41a6e341f679d79f3751c335563a77eb214c64008bec",
    "SELECT id, principalMinor, interestMinor, paidPrincipalMinor, paidInterestMinor, status, version FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber"
  ],
  [
    "a6b9c39cd353d4f69f3ff8d4a67af48cd8a238abb6750cb27f79ca71b63974a1",
    "SELECT id, status, interestMinor, lateInterestMinor, paidInterestMinor, paidLateInterestMinor, version FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber"
  ],
  [
    "fcf26680ca3225940c6e6728d753e6488bc5509c1769ca756a54f6a354a6b56f",
    "SELECT integrityHash FROM accounting_entries ORDER BY rowid DESC LIMIT 1"
  ],
  [
    "2af771c4bb52f94dbcd351b2146a5f2ba4672ccb6217850beb59d92354ebdd72",
    "SELECT last_insert_rowid() as id"
  ],
  [
    "6a707e8fd2fbe3b8dd9ffc84cbf26503d5a00c4b788d58991c23e20252d00e10",
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ],
  [
    "9473539eeb7a03ef9d6914014c204b7932b9772dff258edebd8d8039222886ea",
    "SELECT rescueKey FROM company_settings WHERE id = 1"
  ],
  [
    "be96f977f4c6c5ccde3e8d8a555a7e0eeebc5197084882551764119cec4c22c8",
    "SELECT rowid AS ledgerSequence, * FROM accounting_entries ORDER BY rowid ASC"
  ],
  [
    "bb293c2fc380f941ebdcbc4b3e08ce6bbcd5a0286b82c3624ea7c7b63b9210ec",
    "SELECT sessionTimeout FROM company_settings WHERE id = 1"
  ],
  [
    "0f1034728e764db2c7bd7fc946ff58b74138167d03d94763582849c2a6eedef1",
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='credits'"
  ],
  [
    "19261afbd729c66b5e95de1074770aad95d9339b047daa916c53378c712f6c7f",
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='payments'"
  ],
  [
    "040fabfc5eb548980196062f6ae67c221224f67b07c1844848e9689ed54f97c0",
    "SELECT status FROM users WHERE id = ?"
  ],
  [
    "e5f898239a9beeb7d0c8849488de56cd76a4e4d96c4f6b0131e32d96e37ba335",
    "SELECT syncEnabled, syncUrl, syncPasskey FROM company_settings WHERE id = 1"
  ],
  [
    "5c7c18b3dd13cdd5f9d05b533db3d14340dd71427416675a1a796b58a77249f4",
    "SELECT twoFactorSecret FROM users WHERE id = ?"
  ],
  [
    "b8b2947571f262d5249f88b8905e359394bb3812e9acec722c38985ccd10e89f",
    "SELECT type, COUNT(*) as count FROM warranties WHERE status = ? GROUP BY type"
  ],
  [
    "977ed6d8f8d5e0aed3c03e10d1d018308a1d944f6d4066d9b17090072ec11df5",
    "UPDATE accounting_entries SET amountPrincipalMinor = CAST(ROUND(amountPrincipal * 100) AS INTEGER), amountInterestMinor = CAST(ROUND(amountInterest * 100) AS INTEGER), amountLateInterestMinor = CAST(ROUND(amountLateInterest * 100) AS INTEGER), amountTotalMinor = CAST(ROUND(amountTotal * 100) AS INTEGER) WHERE amountTotalMinor IS NULL"
  ],
  [
    "cc56e1bbcaa83b9aa4a6a4c3b3a8630e9c084935453c1c62425ac2929ab65c46",
    "UPDATE clients SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?"
  ],
  [
    "254e0e1286c08e459be91d2b89add0d879ada5c708955afb9f5aae1927b0c0f2",
    "UPDATE clients SET deletedAt = NULL, restoredAt = ? WHERE id = ?"
  ],
  [
    "8de17c2ce2fe717a10fff4708d6a6460a59536f37d5cfe7fc2e6aea082bf1be4",
    "UPDATE clients SET name = COALESCE(?, name), nif = COALESCE(?, nif), phone = COALESCE(?, phone), email = COALESCE(?, email), address = COALESCE(?, address), creditLimit = COALESCE(?, creditLimit), usedCredit = COALESCE(?, usedCredit), availableCredit = COALESCE(?, availableCredit), monthlyIncome = COALESCE(?, monthlyIncome), defaultInterestRate = COALESCE(?, defaultInterestRate), lateInterestRate = COALESCE(?, lateInterestRate), toleranceDays = COALESCE(?, toleranceDays), status = COALESCE(?, status), riskLevel = COALESCE(?, riskLevel), whatsappVerified = COALESCE(?, whatsappVerified), documents = COALESCE(?, documents), bankCoordinates = COALESCE(?, bankCoordinates), receiveMethod = COALESCE(?, receiveMethod), lastContacted = COALESCE(?, lastContacted), usuario_id = COALESCE(?, usuario_id), birthDate = COALESCE(?, birthDate), age = COALESCE(?, age), issueDate = COALESCE(?, issueDate), expiryDate = COALESCE(?, expiryDate), gender = COALESCE(?, gender), maritalStatus = COALESCE(?, maritalStatus), fatherName = COALESCE(?, fatherName), motherName = COALESCE(?, motherName), workInstitution = COALESCE(?, workInstitution), socialSecurityNumber = COALESCE(?, socialSecurityNumber) WHERE id = ?"
  ],
  [
    "2f7925dfbdf6d1a23a6e49b58530e1a21aeb956df25dfba73b9630f5833ef9e4",
    "UPDATE clients SET nif = 'SEM-' || substr(hex(randomblob(4)),1,8) WHERE nif = 'SEM IDENTIFICAÇÃO'"
  ],
  [
    "d22eef7acbed00c1607c1fb515f4c922bc8cef0c745b906abeb35ecbc671943a",
    "UPDATE company_settings SET installDate = ? WHERE installDate IS NULL"
  ],
  [
    "547700147b2f941bb1dc7e18ae66898e5682843e58b424b89b9a83c768cf8d78",
    "UPDATE company_settings SET name = 'Tango Gestão de Créditos' WHERE name = 'Provisório' OR name = 'Empresa' OR name IS NULL OR name = ''"
  ],
  [
    "cd2d870a39f3cc21c902caf66fb4044863c21d91a3c2c3456a16e4b612d34c18",
    "UPDATE company_settings SET rescueKey = NULL WHERE rescueKey = ?"
  ],
  [
    "1f47bc88d56694d6fd29862949abbba5a1b22c46856ed92b0cb36f33c234b486",
    "UPDATE contracts SET clientId = COALESCE(?, clientId), clientName = COALESCE(?, clientName), title = COALESCE(?, title), value = COALESCE(?, value), startDate = COALESCE(?, startDate), endDate = COALESCE(?, endDate), status = COALESCE(?, status), terms = COALESCE(?, terms), usuario_id = COALESCE(?, usuario_id) WHERE id = ?"
  ],
  [
    "15bbc90639dc5fadc5ac6c791c5a974c2f6aba0fe52b689125e5001d358f84a4",
    "UPDATE contracts SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?"
  ],
  [
    "22c20ac802eecb6998842a694a588b10fee5415463c3634bf89eda1052823b36",
    "UPDATE contracts SET deletedAt = NULL, restoredAt = ? WHERE id = ?"
  ],
  [
    "44b3619caa664a3f544412f215d0fa509614f2bd81c1924d0ff322c520d961be",
    "UPDATE contracts SET status = 'active' WHERE id = ? AND status = 'paid'"
  ],
  [
    "9688c88564d6003a0d1b8aa490de824d7ed160dd86397898316da2199948c230",
    "UPDATE contracts SET status = 'paid' WHERE id = ? AND status <> 'paid'"
  ],
  [
    "58c1c1f8743ce642d03079eb7e79e9d85185e6475fadd749d0c23778dc717cac",
    "UPDATE contracts SET status = 'terminated' WHERE id = ? OR title LIKE ?"
  ],
  [
    "1b017e8f100ee7127f60e6f32138eca6d0fd3f185dd36363fdf341ba73f5c7ce",
    "UPDATE credit_installments SET interestMinor = ?, lateInterestMinor = ?, version = version + 1 WHERE id = ? AND version = ?"
  ],
  [
    "87f6588e0de7466e3660eecd5c0622a6a4776a8f83bde3fe7176ccffaf383a79",
    "UPDATE credit_installments SET paidPrincipalMinor = ?, paidInterestMinor = ?, paidLateInterestMinor = ?, status = ?, paidAt = ?, version = version + 1 WHERE id = ? AND version = ?"
  ],
  [
    "7bf64bcbafd625bb2afafac8f8ea96c34f73f140773f75f47ed9157e896a6c63",
    "UPDATE credit_installments SET principalMinor = ?, interestMinor = ?, version = version + 1 WHERE id = ? AND version = ?"
  ],
  [
    "01f65c5d21eace6ca464ea03e2e89f9357e164edc3f4f6d2420a8115f06e6ffb",
    "UPDATE credits SET accruedInterest = ?, accruedInterestMinor = ?, lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?"
  ],
  [
    "a725143990d6d068b5042e81ee952a0bef767210d8e5e6ac633b401000cf06c5",
    "UPDATE credits SET currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?, lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, paidInstallments = ?, status = ?, paidAt = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?"
  ],
  [
    "e24875948939cd08903563ef3a5f6bd7acf48222af13dd5800821a9481a3a41a",
    "UPDATE credits SET currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?, lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, paidInstallments = ?, status = ?, paidAt = NULL, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?"
  ],
  [
    "c827331c87cdac1ee00f953df2bc31ecde4281549bdb77b32cddf11c3b5effff",
    "UPDATE credits SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?"
  ],
  [
    "4275561b7ef88f96a442b1e33817e87c6c26bf90097ff6eae2403d81ec1a8c48",
    "UPDATE credits SET deletedAt = NULL, restoredAt = ? WHERE id = ?"
  ],
  [
    "03864d3fff319d1d7eca3b7a962fd286ba64bb6b5c8aafd8dfcaf3fd38e989d5",
    "UPDATE credits SET principalAmount = ?, principalAmountMinor = ?, currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?, totalDue = ?, totalDueMinor = ?, reinforcedAmount = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?"
  ],
  [
    "b86f7da2b2e29ca8fe7fc59f5ec8731615f21023afef2ca9fc342220e2fd8c30",
    "UPDATE credits SET principalAmountMinor = CAST(ROUND(principalAmount * 100) AS INTEGER), currentBalanceMinor = CAST(ROUND(currentBalance * 100) AS INTEGER), accruedInterestMinor = CAST(ROUND(accruedInterest * 100) AS INTEGER), lateInterestMinor = CAST(ROUND(lateInterest * 100) AS INTEGER), totalDueMinor = CAST(ROUND(totalDue * 100) AS INTEGER) WHERE principalAmountMinor IS NULL OR currentBalanceMinor IS NULL OR totalDueMinor IS NULL"
  ],
  [
    "6f3d67c740d21a4982b43cb0344f5f5def0c6c412935e1592514b888c5900e43",
    "UPDATE credits SET status = ?, approvedBy = ?, approvalNotes = ?, version = version + 1 WHERE id = ? AND status = 'pending_approval' AND version = ?"
  ],
  [
    "ca9419bff35cfb1376fbbfd1e9374befcdb2f33bba4e38fdf91727df9da47072",
    "UPDATE credits SET targetMonthId = ?, version = version + 1 WHERE id = ? AND version = ?"
  ],
  [
    "9d9336ca8747e039dc5456d53c24237c97b0b67f0a54f71ec4221485798c1e6d",
    "UPDATE internal_messages SET read = 1 WHERE id = ?"
  ],
  [
    "48f5379958a85341393f726117a65debb862872e854e80356cb01c70f42d13d2",
    "UPDATE legal_cases SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?"
  ],
  [
    "876622fb4a1421ad66827c6b445e604eb1cfd068f5a55ee08151d4b65deb9083",
    "UPDATE legal_cases SET deletedAt = NULL, restoredAt = ? WHERE id = ?"
  ],
  [
    "5688efa3e8bb0b8c8450fee6f901c447bc00259352a429bb233c7acbd164c667",
    "UPDATE message_templates SET content = ? WHERE id = ?"
  ],
  [
    "93190326322158cff840cd4a6ffa7bf793119f93898771487685005c7160d038",
    "UPDATE message_templates SET content = REPLACE( REPLACE( REPLACE( REPLACE( REPLACE( REPLACE( REPLACE( REPLACE(content, '{client_name}', '{nome_cliente}'), '{company_name}', '{empresa}' ), '{days_overdue}', '{dias_atraso}' ), '{credit_limit}', '{limite_credito}' ), '{amount}', '{valor}' ), '{due_date}', '{data_vencimento}' ), '{balance}', '{saldo_devedor}' ), '{debt_details}', '{detalhe_dividas}' )"
  ],
  [
    "9705539713f54226c1a2fc2c91f1bf1b6d12e99fbbf4a0d5d69eeda1fb1344ae",
    "UPDATE notifications SET read = 1 WHERE id = ?"
  ],
  [
    "00fa5f5a260e306e200a29044614b947b8e95fc40ba5a5f5e97f1c2c6644e89b",
    "UPDATE notifications SET read = 1 WHERE read = 0"
  ],
  [
    "9490eb500825f13aaa7e800607e982dfd190dbea6d42ae81df6623e51140a427",
    "UPDATE password_reset_requests SET status = \"cancelled\" WHERE id = ?"
  ],
  [
    "866feeb55fcb687be9673f12d3d4a2418ddb783bb9e622d71668a3344c3832d2",
    "UPDATE password_reset_requests SET status = \"completed\" WHERE id = ?"
  ],
  [
    "4fec94d971c96f82fe18e9ccbbf1b0bc67f4ac3252eed57497a1340ea3629509",
    "UPDATE payment_gateways SET name = ?, provider = ?, type = ?, status = ?, environment = ?, apiKey = ?, apiSecret = ?, merchantId = ?, webhookUrl = ?, webhookSecret = ?, transactionFee = ?, feeType = ?, description = ?, config = ?, updatedAt = ? WHERE id = ?"
  ],
  [
    "b4dc07a218ae01b2c56bc4850a950ad07ce12af339a0af93ee2eae14fea16402",
    "UPDATE payment_references SET proofImage = ?, status = ?, submittedAt = ? WHERE id = ?"
  ],
  [
    "69741d5cdab6f5dce69edf7c090ed0772d76421d14def69f75407f8049d02820",
    "UPDATE payment_references SET status = ?, paidAt = ? WHERE id = ?"
  ],
  [
    "a719acf13f4d922a8bf804cd284ab62766bb6b6c6e74389d6349a6e91d5228b3",
    "UPDATE payments SET amountMinor = CAST(ROUND(amount * 100) AS INTEGER), allocatedToPrincipalMinor = CAST(ROUND(allocatedToPrincipal * 100) AS INTEGER), allocatedToInterestMinor = CAST(ROUND(allocatedToInterest * 100) AS INTEGER), allocatedToLateInterestMinor = CAST(ROUND(allocatedToLateInterest * 100) AS INTEGER), idempotencyKey = COALESCE(idempotencyKey, id) WHERE amountMinor IS NULL OR idempotencyKey IS NULL"
  ],
  [
    "aab4e903a5f89ffd1d048396e201ddd7c09361f41abbb43ce74c4e49ee027fd9",
    "UPDATE payments SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?"
  ],
  [
    "9091f3e8264d2ba183704a8eb7c40258aa76e992ec9e92298db103596c067d5d",
    "UPDATE payments SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ? AND deletedAt IS NULL"
  ],
  [
    "b3e1cd0d1db81f4c1b5a6d8538e723fd054c57218812f215ba85591712f405ee",
    "UPDATE payments SET deletedAt = NULL, deletedBy = NULL, restoredAt = ? WHERE id = ? AND deletedAt IS NOT NULL"
  ],
  [
    "91c846e2bdd43ba84ec52d7bfecb78a3207856cd97559bebf672199240ceabde",
    "UPDATE payments SET deletedAt = NULL, restoredAt = ? WHERE id = ?"
  ],
  [
    "412a0e76763ac238db35ac2f06609d2e94d98cedf78f9e00df73d1332762ef83",
    "UPDATE suppliers SET deletedAt = datetime('now'), deletedBy = ? WHERE id = ?"
  ],
  [
    "77c3ee44976298ee5f0c83f34ed50c79113628f6a4ae3b6eceaee044d5b7ee02",
    "UPDATE sync_conflicts SET status = ?, resolutionNote = ?, resolvedBy = ?, resolvedAt = ? WHERE id = ? AND status = 'pending'"
  ],
  [
    "bdc6ad979810e386b59e12902affa50ad0ab3eab35a585b5a30252aa77e41505",
    "UPDATE user_limits SET maxTransaction = ?, dailyLimit = ?, monthlyLimit = ?, restrictionsEnabled = ?, updatedAt = ? WHERE role = ?"
  ],
  [
    "6ef9d014f824bc6b073e48cc075de18e64efcd2775b43fbc888dae6ac6654cb9",
    "UPDATE users SET failedAttempts = 0, blockedAt = NULL WHERE id = ?"
  ],
  [
    "a01978ab42812f5e567ca31f0238c31fb66590141fcc24ef0c93c5c5c303efd7",
    "UPDATE users SET failedAttempts = ?, ip = ? WHERE id = ?"
  ],
  [
    "b21880084a6d73fff816500db4563d6a2642b140164bb08a7473d2d79469086b",
    "UPDATE users SET failedAttempts = ?, status = ?, blockedAt = ?, ip = ? WHERE id = ?"
  ],
  [
    "c9c9c03dd5baf3787e144e614694e145f98b0f380be6ca078745e8909a01fc72",
    "UPDATE users SET lastLogin = ?, status = ?, ip = ? WHERE id = ?"
  ],
  [
    "4699bceb8b6aaac9b7cad1b3d17680a8331b2dbae79e662e80ff75fc459bdab2",
    "UPDATE users SET lastSeen = ? WHERE id = ?"
  ],
  [
    "33a01fd1fd065b0e2f00a7d19b82f90b4aae9c461803db1ce895515dbf35cfc7",
    "UPDATE users SET password = ? WHERE id = ?"
  ],
  [
    "8bb9ac2e2b9de1cc3d7bef4f4152e272262b2219acdc37ed61ac058cc6b01134",
    "UPDATE users SET password = ?, status = \"active\", failedAttempts = 0, blockedAt = NULL WHERE id = ?"
  ],
  [
    "16838e19cb92dfd487e720f7a912096d41a7864400967283e6537f4356abf971",
    "UPDATE users SET status = \"active\", failedAttempts = 0, blockedAt = NULL WHERE id = ?"
  ],
  [
    "2994b909db328b9f90b8db60c0cd65c7f1b986725bf330dc9f11e0b149df6012",
    "UPDATE users SET status = ? WHERE id = ?"
  ],
  [
    "2bad0d968cbcd339f5ba61fdd157e2910c0f74f0bd9957efd6f25756080215d6",
    "UPDATE users SET twoFactorEnabled = 0, twoFactorSecret = NULL WHERE id = ?"
  ],
  [
    "1ff138a36f4d6b781ba0ec321225c7c8eeff36b3124db2ec0346e191d11ccb0c",
    "UPDATE users SET twoFactorEnabled = 1, twoFactorSecret = ? WHERE id = ?"
  ],
  [
    "03bd597f05be2c560ba84217c309a16043cbfb0c3e32bde60225e50191d3d6d0",
    "UPDATE warranties SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?"
  ],
  [
    "33d8d56087fba94838420fae0d78a71b6fb2ad7a0b1d3acab5df786b195ccba5",
    "UPDATE warranties SET deletedAt = NULL, restoredAt = ? WHERE id = ?"
  ],
  [
    "0a4540e8c33c71222a68ff5ecc1a167b406de9961ac3cc69649c6152a6d7a9b7",
    "VACUUM"
  ],
  [
    "fa8847b0c33183273f5945508b31c3208a9e4ece58ca47233a05628d8dba3799",
    "create"
  ],
  [
    "6197595503f01ee2a34e403fe08d2e1d9d0c14cf1cdfc2b74739895dc9a15a04",
    "delete"
  ],
  [
    "b1a36d25d9633ed2ac04939fcb614ccb2b513243c148f18694592ae037f9d35f",
    "select"
  ],
  [
    "c25dd8c9ed4ff8a034f248fdab3e1ba525f6579a4b8deb0b1c806aec4b6d80bf",
    "select-all-debtors"
  ],
  [
    "2937013f2181810606b2a799b05bda2849f3e369a20982a4138f0e0a55984ce4",
    "update"
  ]
]);
export const RENDERER_SQL_ID_BY_STATEMENT = new Map<string, string>([...RENDERER_SQL_BY_ID].map(([id, sql]) => [sql, id]));
