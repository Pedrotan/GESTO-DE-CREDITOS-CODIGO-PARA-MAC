// Gerado por scripts/generate-sql-allowlist.mjs. Não editar manualmente.
export const RENDERER_SQL_ALLOWLIST = new Set<string>([
  "ALTER TABLE audit_logs ADD COLUMN metadata TEXT",
  "ALTER TABLE audit_logs ADD COLUMN newState TEXT",
  "ALTER TABLE audit_logs ADD COLUMN previousState TEXT",
  "ALTER TABLE credits RENAME TO credits_old",
  "ALTER TABLE dictionary RENAME TO dictionary_old",
  "ALTER TABLE payments RENAME TO payments_old",
  "CREATE INDEX IF NOT EXISTS idx_accounting_audit_runs_finished ON accounting_audit_runs(finishedAt)",
  "CREATE INDEX IF NOT EXISTS idx_accounting_clientId ON accounting_entries(clientId)",
  "CREATE INDEX IF NOT EXISTS idx_accounting_creditId ON accounting_entries(creditId)",
  "CREATE INDEX IF NOT EXISTS idx_accounting_timestamp ON accounting_entries(timestamp)",
  "CREATE INDEX IF NOT EXISTS idx_accounting_usuario ON accounting_entries(usuario_id)",
  "CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)",
  "CREATE INDEX IF NOT EXISTS idx_audit_alerts_status ON audit_alerts(status, occurredAt)",
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
  "CREATE INDEX IF NOT EXISTS idx_collection_credit ON collection_events(creditId, createdAt)",
  "CREATE INDEX IF NOT EXISTS idx_collection_messages_client ON collection_messages(clientId)",
  "CREATE INDEX IF NOT EXISTS idx_collection_messages_sentAt ON collection_messages(sentAt)",
  "CREATE INDEX IF NOT EXISTS idx_contracts_usuario ON contracts(usuario_id)",
  "CREATE INDEX IF NOT EXISTS idx_credit_approvals_creditId ON credit_approvals(creditId)",
  "CREATE INDEX IF NOT EXISTS idx_credit_approvals_decidedAt ON credit_approvals(decidedAt)",
  "CREATE INDEX IF NOT EXISTS idx_credit_documents_credit ON credit_documents(creditId)",
  "CREATE INDEX IF NOT EXISTS idx_credit_installments_due ON credit_installments(creditId, status, dueDate)",
  "CREATE INDEX IF NOT EXISTS idx_credit_restructurings_credit ON credit_restructurings(creditId, requestedAt)",
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
  "CREATE INDEX IF NOT EXISTS idx_limit_escalations_entity ON limit_escalations(entityType, entityId, status)",
  "CREATE INDEX IF NOT EXISTS idx_limit_ledger_month ON limit_ledger(operationType, monthKey)",
  "CREATE INDEX IF NOT EXISTS idx_limit_ledger_user ON limit_ledger(operationType, userId, dayKey)",
  "CREATE INDEX IF NOT EXISTS idx_limit_versions_status ON limit_policy_versions(status, effectiveFrom)",
  "CREATE INDEX IF NOT EXISTS idx_payments_batch ON payments(batchId)",
  "CREATE INDEX IF NOT EXISTS idx_payments_creditId ON payments(creditId)",
  "CREATE INDEX IF NOT EXISTS idx_payments_credit_date ON payments(creditId, paymentDate)",
  "CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paymentDate)",
  "CREATE INDEX IF NOT EXISTS idx_payments_paymentDate ON payments(paymentDate)",
  "CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)",
  "CREATE INDEX IF NOT EXISTS idx_payments_usuario ON payments(usuario_id)",
  "CREATE INDEX IF NOT EXISTS idx_report_history_generatedAt ON report_history(generatedAt)",
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
  "CREATE TABLE IF NOT EXISTS accounting_audit_runs ( id TEXT PRIMARY KEY, kind TEXT NOT NULL, startedAt TEXT NOT NULL, finishedAt TEXT NOT NULL, userId TEXT, userName TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('ok','warning','critical')), criticalCount INTEGER NOT NULL DEFAULT 0, highCount INTEGER NOT NULL DEFAULT 0, mediumCount INTEGER NOT NULL DEFAULT 0, lowCount INTEGER NOT NULL DEFAULT 0, headEntryId TEXT, headHash TEXT, sealStatus TEXT, summary TEXT, findings TEXT )",
  "CREATE TABLE IF NOT EXISTS accounting_bank_imports (id TEXT PRIMARY KEY, fileName TEXT NOT NULL, movements TEXT NOT NULL, actorId TEXT NOT NULL, actorName TEXT NOT NULL, importedAt TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS accounting_cash_sessions ( id TEXT PRIMARY KEY, operatorId TEXT NOT NULL, operatorName TEXT NOT NULL, sessionDate TEXT NOT NULL, openedAt TEXT NOT NULL, closedAt TEXT, openingMinor INTEGER NOT NULL CHECK(openingMinor >= 0), expectedMinor INTEGER, countedMinor INTEGER, reason TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')), UNIQUE(operatorId, sessionDate), CHECK(status = 'open' OR (expectedMinor IS NOT NULL AND countedMinor IS NOT NULL AND countedMinor >= 0 AND (expectedMinor = countedMinor OR length(trim(reason)) >= 10))) )",
  "CREATE TABLE IF NOT EXISTS accounting_daily_closes ( day TEXT PRIMARY KEY, headEntryId TEXT, headHash TEXT, entryCount INTEGER NOT NULL, debitMinor INTEGER NOT NULL, creditMinor INTEGER NOT NULL, liquidMinor INTEGER NOT NULL, portfolioMinor INTEGER NOT NULL, auditRunId TEXT, sealStatus TEXT, closedAt TEXT NOT NULL, closedBy TEXT NOT NULL, closedById TEXT )",
  "CREATE TABLE IF NOT EXISTS accounting_divergence_events ( id TEXT PRIMARY KEY, issueKey TEXT NOT NULL, previousId TEXT NOT NULL DEFAULT '', source TEXT NOT NULL, description TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','justified','resolved')), reason TEXT NOT NULL CHECK(length(trim(reason)) >= 10), actorId TEXT NOT NULL, actorName TEXT NOT NULL, createdAt TEXT NOT NULL, UNIQUE(issueKey, previousId) )",
  "CREATE TABLE IF NOT EXISTS accounting_entries ( id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, type TEXT NOT NULL, description TEXT, clientId TEXT, creditId TEXT, paymentId TEXT, debit TEXT NOT NULL, credit TEXT NOT NULL, amountPrincipal REAL DEFAULT 0, amountInterest REAL DEFAULT 0, amountLateInterest REAL DEFAULT 0, amountTotal REAL NOT NULL, amountPrincipalMinor INTEGER, amountInterestMinor INTEGER, amountLateInterestMinor INTEGER, amountTotalMinor INTEGER, processedBy TEXT NOT NULL, justification TEXT, integrityHash TEXT, previousHash TEXT, hashVersion INTEGER DEFAULT 1, usuario_id TEXT, FOREIGN KEY(clientId) REFERENCES clients(id) )",
  "CREATE TABLE IF NOT EXISTS accounting_entry_seals ( seq INTEGER PRIMARY KEY AUTOINCREMENT, entryId TEXT NOT NULL UNIQUE, hmac TEXT NOT NULL, previousHmac TEXT NOT NULL, origin TEXT NOT NULL CHECK(origin IN ('local','remote','legacy','review')), sealedAt TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS accounting_receipts (id TEXT PRIMARY KEY, entryId TEXT NOT NULL UNIQUE, fileName TEXT NOT NULL, mime TEXT NOT NULL, data TEXT NOT NULL, digest TEXT NOT NULL, createdAt TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS accounting_requests ( id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('reversal','writeoff')), targetId TEXT NOT NULL, amountMinor INTEGER, description TEXT, reason TEXT NOT NULL CHECK(length(trim(reason)) >= 10), requestedBy TEXT NOT NULL, requestedById TEXT NOT NULL, requestedAt TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), decidedBy TEXT, decidedById TEXT, decidedAt TEXT, decisionReason TEXT, resultEntryId TEXT )",
  "CREATE TABLE IF NOT EXISTS audit_alert_comments ( id TEXT PRIMARY KEY, alertId TEXT NOT NULL, userId TEXT, userName TEXT NOT NULL, status TEXT, comment TEXT NOT NULL, createdAt TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS audit_alerts ( id TEXT PRIMARY KEY, alertKey TEXT NOT NULL UNIQUE, ruleId TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL, description TEXT, eventIds TEXT, originUserId TEXT, originUserName TEXT, occurredAt TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_review','justified','false_positive','resolved')), assignedTo TEXT, assignedToName TEXT, dueAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT, closedBy TEXT, closedByName TEXT, closedAt TEXT )",
  "CREATE TABLE IF NOT EXISTS audit_daily_closes ( day TEXT PRIMARY KEY, lastAuditId TEXT, headHash TEXT, eventCount INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('ok','broken')), brokenSeq INTEGER, verifiedAt TEXT NOT NULL, verifiedBy TEXT )",
  "CREATE TABLE IF NOT EXISTS audit_log_chain (seq INTEGER PRIMARY KEY AUTOINCREMENT, auditId TEXT NOT NULL UNIQUE, previousHash TEXT NOT NULL, integrityHash TEXT NOT NULL, origin TEXT NOT NULL CHECK(origin IN ('live','legacy')))",
  "CREATE TABLE IF NOT EXISTS audit_logs ( id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, userId TEXT, userName TEXT, action TEXT NOT NULL, entity TEXT NOT NULL, details TEXT, previousState TEXT, newState TEXT, metadata TEXT )",
  "CREATE TABLE IF NOT EXISTS calendar_tasks ( id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, date TEXT NOT NULL, done INTEGER DEFAULT 0, createdAt TEXT DEFAULT (datetime('now')), usuario_id TEXT )",
  "CREATE TABLE IF NOT EXISTS chat_messages ( id TEXT PRIMARY KEY, role TEXT, content TEXT, timestamp TEXT, userId TEXT )",
  "CREATE TABLE IF NOT EXISTS clients ( id TEXT PRIMARY KEY, name TEXT NOT NULL, nif TEXT, phone TEXT, email TEXT, address TEXT, birthDate TEXT, age INTEGER, issueDate TEXT, expiryDate TEXT, gender TEXT, maritalStatus TEXT, fatherName TEXT, motherName TEXT, workInstitution TEXT, socialSecurityNumber TEXT, creditLimit REAL DEFAULT 0, usedCredit REAL DEFAULT 0, availableCredit REAL DEFAULT 0, monthlyIncome REAL DEFAULT 0, defaultInterestRate REAL DEFAULT 0, lateInterestRate REAL DEFAULT 0, toleranceDays INTEGER DEFAULT 0, status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'blocked')), riskLevel TEXT DEFAULT 'medium' CHECK(riskLevel IN ('low', 'medium', 'high')), whatsappVerified INTEGER DEFAULT 0, documents TEXT, bankCoordinates TEXT, receiveMethod TEXT DEFAULT 'transfer', lastContacted TEXT, createdAt TEXT NOT NULL, updatedAt TEXT, notes TEXT, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT, spouseName TEXT, spouseBi TEXT, spouseNif TEXT, spousePhone TEXT, spouseEmail TEXT, legalRepresentative TEXT, legalRepRole TEXT )",
  "CREATE TABLE IF NOT EXISTS closed_months ( id TEXT PRIMARY KEY, month INTEGER NOT NULL, year INTEGER NOT NULL, capitalApplied REAL NOT NULL, projectedProfit REAL NOT NULL, realizedProfit REAL NOT NULL, overdueAmount REAL NOT NULL, liquidationRate REAL NOT NULL, closedAt TEXT NOT NULL, closedBy TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS collection_events ( id TEXT PRIMARY KEY, creditId TEXT, kind TEXT NOT NULL CHECK(kind IN ('contact','promise','promise_kept','promise_broken','assignment','target')), agentId TEXT, agentName TEXT, monthKey TEXT, amountMinor INTEGER CHECK(amountMinor IS NULL OR (typeof(amountMinor) = 'integer' AND amountMinor >= 0)), promisedDate TEXT, relatedId TEXT, notes TEXT NOT NULL CHECK(length(trim(notes)) >= 5), actorId TEXT NOT NULL, actorName TEXT NOT NULL, createdAt TEXT NOT NULL, CHECK((kind NOT IN ('contact','promise','promise_kept','promise_broken','assignment')) OR creditId IS NOT NULL), CHECK(kind <> 'promise' OR (amountMinor > 0 AND promisedDate IS NOT NULL)), CHECK(kind <> 'target' OR (agentId IS NOT NULL AND monthKey IS NOT NULL AND amountMinor IS NOT NULL)), CHECK(kind <> 'assignment' OR agentId IS NOT NULL), CHECK(kind NOT IN ('promise_kept','promise_broken') OR relatedId IS NOT NULL) )",
  "CREATE TABLE IF NOT EXISTS collection_messages ( id TEXT PRIMARY KEY, clientId TEXT NOT NULL, clientName TEXT NOT NULL, creditIds TEXT NOT NULL, channel TEXT NOT NULL, message TEXT NOT NULL, attemptNumber INTEGER DEFAULT 1, totalDue REAL DEFAULT 0, sentAt TEXT NOT NULL, sentBy TEXT, legalTriggered INTEGER DEFAULT 0 )",
  "CREATE TABLE IF NOT EXISTS company_settings ( id INTEGER PRIMARY KEY CHECK(id = 1), name TEXT NOT NULL, nif TEXT, address TEXT, logo TEXT, reportLogo TEXT, licenseKey TEXT, currency TEXT DEFAULT 'AOA', customClauses TEXT, rescueKey TEXT, phone TEXT, primaryColor TEXT, secondaryColor TEXT, watermarkLogo TEXT, sessionTimeout INTEGER DEFAULT 5, email TEXT, whatsapp TEXT, whatsappAutoNotify INTEGER DEFAULT 0, whatsappVerified INTEGER DEFAULT 0, syncEnabled INTEGER DEFAULT 0, syncUrl TEXT, syncApiKey TEXT, syncPasskey TEXT, lastSync TEXT, maintenanceMode INTEGER DEFAULT 0, allowedModulesDuringMaintenance TEXT DEFAULT '[]', enableGatewaysModule INTEGER DEFAULT 1, enableGatewaysModuleAdminOnly INTEGER DEFAULT 0, enableProfileActivity INTEGER DEFAULT 1, enableProfileActivityAdminOnly INTEGER DEFAULT 0, lastBackupDate TEXT, digitalSignatureEnabled INTEGER DEFAULT 1, authorizedSigners TEXT DEFAULT '[]', bankingInfo TEXT DEFAULT '[]', contractTemplates TEXT DEFAULT '[]', installDate TEXT, financialLock INTEGER DEFAULT 0, enableWarrantiesModule INTEGER DEFAULT 1, enableWarrantiesModuleAdminOnly INTEGER DEFAULT 0, enableLegalModule INTEGER DEFAULT 1, enableLegalModuleAdminOnly INTEGER DEFAULT 0, enableScoringModule INTEGER DEFAULT 1, enableScoringModuleAdminOnly INTEGER DEFAULT 0, defaultSimulationInterestRate REAL, defaultSimulationAdminFee REAL, defaultSimulationIof REAL, smtpHost TEXT, smtpPort TEXT, smtpUser TEXT, smtpPassword TEXT, smtpSecure INTEGER DEFAULT 0, smtpFromName TEXT, location TEXT, enableSuppliersModule INTEGER DEFAULT 0, enableSuppliersModuleAdminOnly INTEGER DEFAULT 0, enableMultiTenant INTEGER DEFAULT 1, website TEXT, segment TEXT, slogan TEXT )",
  "CREATE TABLE IF NOT EXISTS contracts ( id TEXT PRIMARY KEY, clientId TEXT, clientName TEXT, title TEXT, value REAL, startDate TEXT, endDate TEXT, status TEXT, terms TEXT, createdAt TEXT, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT )",
  "CREATE TABLE IF NOT EXISTS credit_approvals (id TEXT PRIMARY KEY, creditId TEXT NOT NULL, clientId TEXT, clientName TEXT, principalAmount REAL, interestRate REAL, installments INTEGER, decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')), reason TEXT, requestedBy TEXT, requestedAt TEXT, decidedBy TEXT NOT NULL, decidedById TEXT, decidedAt TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS credit_documents ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, kind TEXT NOT NULL, fileName TEXT NOT NULL, mimeType TEXT NOT NULL, dataUrl TEXT NOT NULL, uploadedAt TEXT NOT NULL, uploadedBy TEXT, uploadedByName TEXT, deletedAt TEXT, deletedBy TEXT )",
  "CREATE TABLE IF NOT EXISTS credit_import_batches ( id TEXT PRIMARY KEY, number TEXT NOT NULL, fileName TEXT, createdAt TEXT NOT NULL, createdBy TEXT NOT NULL, createdById TEXT, rowsCount INTEGER NOT NULL DEFAULT 0, totalMinor INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')), cancelledAt TEXT, cancelledBy TEXT, cancelReason TEXT )",
  "CREATE TABLE IF NOT EXISTS credit_import_items ( batchId TEXT NOT NULL, creditId TEXT NOT NULL, PRIMARY KEY(batchId, creditId) )",
  "CREATE TABLE IF NOT EXISTS credit_installments ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, installmentNumber INTEGER NOT NULL CHECK(installmentNumber > 0), dueDate TEXT NOT NULL, principalMinor INTEGER NOT NULL CHECK(principalMinor >= 0), interestMinor INTEGER NOT NULL CHECK(interestMinor >= 0), lateInterestMinor INTEGER NOT NULL DEFAULT 0 CHECK(lateInterestMinor >= 0), paidPrincipalMinor INTEGER NOT NULL DEFAULT 0 CHECK(paidPrincipalMinor >= 0), paidInterestMinor INTEGER NOT NULL DEFAULT 0 CHECK(paidInterestMinor >= 0), paidLateInterestMinor INTEGER NOT NULL DEFAULT 0 CHECK(paidLateInterestMinor >= 0), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partial','paid','overdue','cancelled')), paidAt TEXT, version INTEGER NOT NULL DEFAULT 0, UNIQUE(creditId, installmentNumber), FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT )",
  "CREATE TABLE IF NOT EXISTS credit_manager_transfers ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, fromUserId TEXT, toUserId TEXT NOT NULL, toUserName TEXT, reason TEXT NOT NULL, actorId TEXT NOT NULL, actorName TEXT NOT NULL, createdAt TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS credit_reinforcements ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, amountMinor INTEGER NOT NULL CHECK(amountMinor > 0), interestMinor INTEGER NOT NULL DEFAULT 0 CHECK(interestMinor >= 0), idempotencyKey TEXT NOT NULL UNIQUE, notes TEXT, createdBy TEXT, createdAt TEXT NOT NULL, FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT )",
  "CREATE TABLE IF NOT EXISTS credit_reinforcements ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, amountMinor INTEGER NOT NULL CHECK(amountMinor > 0), interestMinor INTEGER NOT NULL DEFAULT 0 CHECK(interestMinor >= 0), idempotencyKey TEXT NOT NULL UNIQUE, notes TEXT, createdBy TEXT, createdAt TEXT NOT NULL, FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT)",
  "CREATE TABLE IF NOT EXISTS credit_restructurings ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('restructure','early_settlement')), mode TEXT, reason TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')), originalPlan TEXT NOT NULL, newPlan TEXT NOT NULL, params TEXT, payNowMinor INTEGER, requestedBy TEXT NOT NULL, requestedByName TEXT NOT NULL, requestedAt TEXT NOT NULL, decidedBy TEXT, decidedByName TEXT, decidedAt TEXT, decisionReason TEXT )",
  "CREATE TABLE IF NOT EXISTS credit_writeoffs ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL UNIQUE, principalMinor INTEGER NOT NULL CHECK(principalMinor >= 0), interestMinor INTEGER NOT NULL DEFAULT 0 CHECK(interestMinor >= 0), provisionUsedMinor INTEGER NOT NULL DEFAULT 0 CHECK(provisionUsedMinor >= 0), lossMinor INTEGER NOT NULL DEFAULT 0 CHECK(lossMinor >= 0), reason TEXT NOT NULL CHECK(length(trim(reason)) >= 10), requestedBy TEXT NOT NULL, requestedById TEXT NOT NULL, approvedBy TEXT NOT NULL, approvedById TEXT NOT NULL, entryId TEXT NOT NULL, createdAt TEXT NOT NULL, CHECK(requestedById <> approvedById) )",
  "CREATE TABLE IF NOT EXISTS credits ( id TEXT PRIMARY KEY, clientId TEXT NOT NULL, clientName TEXT NOT NULL, principalAmount REAL NOT NULL, principalAmountMinor INTEGER, interestRate REAL NOT NULL, lateInterestRate REAL NOT NULL, installments INTEGER NOT NULL, paidInstallments INTEGER DEFAULT 0, currentBalance REAL NOT NULL, currentBalanceMinor INTEGER, startDate TEXT, accruedInterest REAL DEFAULT 0, accruedInterestMinor INTEGER, lateInterest REAL DEFAULT 0, lateInterestMinor INTEGER, totalDue REAL NOT NULL, totalDueMinor INTEGER, version INTEGER NOT NULL DEFAULT 0, dueDate TEXT NOT NULL, daysOverdue INTEGER DEFAULT 0, status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paid', 'overdue', 'defaulted', 'cancelled', 'renegotiated', 'pending_approval', 'rejected')), creditNumber INTEGER DEFAULT 1, paidAt TEXT, createdAt TEXT NOT NULL, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT, targetMonthId TEXT, productId TEXT, FOREIGN KEY(clientId) REFERENCES clients(id) ON DELETE RESTRICT )",
  "CREATE TABLE IF NOT EXISTS dictionary ( word TEXT NOT NULL, language TEXT NOT NULL CHECK(language IN ('pt-AO', 'pt-PT', 'both', 'pt', 'ao')), PRIMARY KEY (word, language) )",
  "CREATE TABLE IF NOT EXISTS internal_messages ( id TEXT PRIMARY KEY, senderId TEXT NOT NULL, senderName TEXT NOT NULL, receiverId TEXT NOT NULL, receiverName TEXT NOT NULL, content TEXT NOT NULL, timestamp TEXT NOT NULL, read INTEGER DEFAULT 0 )",
  "CREATE TABLE IF NOT EXISTS ledger_lines ( id TEXT PRIMARY KEY, transactionId TEXT NOT NULL, account TEXT NOT NULL, side TEXT NOT NULL CHECK(side IN ('debit', 'credit')), component TEXT NOT NULL, amountMinor INTEGER NOT NULL CHECK(amountMinor > 0), FOREIGN KEY(transactionId) REFERENCES ledger_transactions(id) ON DELETE RESTRICT )",
  "CREATE TABLE IF NOT EXISTS ledger_transactions ( id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, type TEXT NOT NULL, sourceType TEXT NOT NULL, sourceId TEXT NOT NULL, description TEXT, totalDebitMinor INTEGER NOT NULL CHECK(totalDebitMinor > 0), totalCreditMinor INTEGER NOT NULL CHECK(totalCreditMinor > 0), integrityHash TEXT NOT NULL, previousHash TEXT NOT NULL, hashVersion INTEGER NOT NULL DEFAULT 2, usuario_id TEXT, CHECK(totalDebitMinor = totalCreditMinor) )",
  "CREATE TABLE IF NOT EXISTS legal_cases ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, clientId TEXT NOT NULL, stage TEXT DEFAULT 'interpellated', priority TEXT DEFAULT 'normal', assignedLawyer TEXT, notes TEXT, history TEXT DEFAULT '[]', lastActionDate TEXT, debtAmount REAL, lastAction TEXT, updatedAt TEXT, closedAt TEXT, createdAt TEXT NOT NULL, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT )",
  "CREATE TABLE IF NOT EXISTS limit_escalation_approvals ( id TEXT PRIMARY KEY, escalationId TEXT NOT NULL, approverId TEXT NOT NULL, approverName TEXT NOT NULL, approverRole TEXT, decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')), notes TEXT, decidedAt TEXT NOT NULL, UNIQUE(escalationId, approverId) )",
  "CREATE TABLE IF NOT EXISTS limit_escalations ( id TEXT PRIMARY KEY, operationType TEXT NOT NULL, entityType TEXT NOT NULL, entityId TEXT NOT NULL, amountMinor INTEGER NOT NULL, requestedById TEXT, requestedByName TEXT, requestedRole TEXT, reason TEXT NOT NULL, details TEXT, requiredLevelId TEXT NOT NULL, requiredLevelIndex INTEGER NOT NULL, requiredLevelName TEXT NOT NULL, dual INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')), createdAt TEXT NOT NULL, levelSince TEXT NOT NULL, escalationCount INTEGER NOT NULL DEFAULT 0, lastReminderAt TEXT, decidedAt TEXT, decidedBy TEXT, decidedByName TEXT )",
  "CREATE TABLE IF NOT EXISTS limit_exceptions ( id TEXT PRIMARY KEY, userId TEXT NOT NULL, userName TEXT NOT NULL, operationType TEXT NOT NULL, perOperationMinor INTEGER, dailyMinor INTEGER, monthlyMinor INTEGER, dailyCount INTEGER, startsAt TEXT NOT NULL, endsAt TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','revoked')), requestedBy TEXT NOT NULL, requestedByName TEXT NOT NULL, requestedAt TEXT NOT NULL, decidedBy TEXT, decidedByName TEXT, decidedAt TEXT, decisionReason TEXT, expiryNotifiedAt TEXT )",
  "CREATE TABLE IF NOT EXISTS limit_ledger ( id TEXT PRIMARY KEY, operationType TEXT NOT NULL, userId TEXT NOT NULL, userName TEXT, profileId TEXT, branchId TEXT DEFAULT '', amountMinor INTEGER NOT NULL DEFAULT 0, count INTEGER NOT NULL DEFAULT 1, dayKey TEXT NOT NULL, monthKey TEXT NOT NULL, entityType TEXT, entityId TEXT, createdAt TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS limit_locks ( id TEXT PRIMARY KEY, ledgerId TEXT NOT NULL, scope TEXT NOT NULL, scopeId TEXT NOT NULL, period TEXT NOT NULL, periodKey TEXT NOT NULL, createdAt TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS limit_policy_versions ( id TEXT PRIMARY KEY, version INTEGER NOT NULL, policy TEXT NOT NULL, summary TEXT, reason TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','cancelled')), effectiveFrom TEXT NOT NULL, requiresSecondApproval INTEGER NOT NULL DEFAULT 0, secondApprovalReasons TEXT, createdBy TEXT NOT NULL, createdByName TEXT NOT NULL, createdAt TEXT NOT NULL, decidedBy TEXT, decidedByName TEXT, decidedAt TEXT, decisionReason TEXT, restoredFrom TEXT )",
  "CREATE TABLE IF NOT EXISTS message_templates ( id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, content TEXT NOT NULL, isDefault INTEGER DEFAULT 0 )",
  "CREATE TABLE IF NOT EXISTS notifications ( id TEXT PRIMARY KEY, userId TEXT, title TEXT NOT NULL, message TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('info', 'success', 'warning', 'error')), source TEXT DEFAULT 'system' CHECK(source IN ('system', 'chat')), read INTEGER DEFAULT 0, timestamp TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS password_reset_requests ( id TEXT PRIMARY KEY, userId TEXT, userName TEXT NOT NULL, email TEXT NOT NULL, timestamp TEXT NOT NULL, status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'cancelled')) )",
  "CREATE TABLE IF NOT EXISTS payment_gateways ( id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL, type TEXT NOT NULL, status TEXT DEFAULT 'inactive', environment TEXT DEFAULT 'sandbox', apiKey TEXT, apiSecret TEXT, merchantId TEXT, webhookUrl TEXT, webhookSecret TEXT, config TEXT, transactionFee REAL DEFAULT 0, feeType TEXT DEFAULT 'percentage', logo TEXT, description TEXT, supportedMethods TEXT, createdAt TEXT NOT NULL, updatedAt TEXT, lastTestedAt TEXT, lastTestResult TEXT )",
  "CREATE TABLE IF NOT EXISTS payment_import_batches ( id TEXT PRIMARY KEY, number TEXT NOT NULL, fileName TEXT, createdAt TEXT NOT NULL, createdBy TEXT NOT NULL, createdById TEXT, rowsCount INTEGER NOT NULL DEFAULT 0, totalMinor INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'cancelled')), cancelledAt TEXT, cancelledBy TEXT, cancelReason TEXT )",
  "CREATE TABLE IF NOT EXISTS payment_proofs ( paymentId TEXT PRIMARY KEY, fileName TEXT NOT NULL, mimeType TEXT NOT NULL, dataUrl TEXT NOT NULL, uploadedAt TEXT NOT NULL, uploadedBy TEXT )",
  "CREATE TABLE IF NOT EXISTS payment_references ( id TEXT PRIMARY KEY, creditId TEXT, gatewayId TEXT, reference TEXT, entity TEXT, amount REAL, status TEXT DEFAULT 'pending', proofImage TEXT, expiresAt TEXT, paidAt TEXT, submittedAt TEXT, createdAt TEXT NOT NULL, usuario_id TEXT )",
  "CREATE TABLE IF NOT EXISTS payments ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, clientName TEXT NOT NULL, amount REAL NOT NULL, amountMinor INTEGER, paymentDate TEXT NOT NULL, method TEXT NOT NULL, reference TEXT, allocatedToPrincipal REAL DEFAULT 0, allocatedToPrincipalMinor INTEGER, allocatedToInterest REAL DEFAULT 0, allocatedToInterestMinor INTEGER, allocatedToLateInterest REAL DEFAULT 0, allocatedToLateInterestMinor INTEGER, idempotencyKey TEXT, processedBy TEXT NOT NULL, status TEXT DEFAULT 'confirmed' CHECK(status IN ('pending', 'confirmed', 'cancelled')), deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT, FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT )",
  "CREATE TABLE IF NOT EXISTS report_history ( id TEXT PRIMARY KEY, reportType TEXT NOT NULL, title TEXT NOT NULL, format TEXT NOT NULL CHECK(format IN ('pdf', 'xlsx')), filters TEXT, fileName TEXT NOT NULL, fileData TEXT, generatedAt TEXT NOT NULL, generatedBy TEXT NOT NULL, generatedById TEXT )",
  "CREATE TABLE IF NOT EXISTS report_schedules ( id TEXT PRIMARY KEY, reportType TEXT NOT NULL, recipients TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, lastRunMonth TEXT, lastRunAt TEXT, lastError TEXT, createdAt TEXT NOT NULL, createdBy TEXT )",
  "CREATE TABLE IF NOT EXISTS schema_migrations ( version INTEGER PRIMARY KEY, name TEXT NOT NULL, appliedAt TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS shared_settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL, updatedBy TEXT )",
  "CREATE TABLE IF NOT EXISTS simulations ( id TEXT PRIMARY KEY, reference TEXT, date TEXT NOT NULL, clientName TEXT, clientIncome REAL DEFAULT 0, amount REAL DEFAULT 0, term INTEGER DEFAULT 0, interestRate REAL DEFAULT 0, method TEXT CHECK(method IN ('price', 'sac')), riskProfile TEXT CHECK(riskProfile IN ('low', 'medium', 'high')), totalPayment REAL DEFAULT 0, monthlyPayment REAL DEFAULT 0, aiAnalysis TEXT, usuario_id TEXT, createdAt TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS suppliers ( id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, nif TEXT, address TEXT, notes TEXT, status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')), createdAt TEXT DEFAULT (datetime('now')), deletedAt TEXT, deletedBy TEXT, usuario_id TEXT )",
  "CREATE TABLE IF NOT EXISTS sync_conflicts ( id TEXT PRIMARY KEY, entityType TEXT NOT NULL, entityId TEXT, operation TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')), createdAt TEXT NOT NULL, resolvedAt TEXT, resolvedBy TEXT )",
  "CREATE TABLE IF NOT EXISTS user_limits ( id TEXT PRIMARY KEY, userId TEXT, role TEXT CHECK(role IN ('admin', 'manager')), maxTransaction REAL NOT NULL, dailyLimit REAL NOT NULL, monthlyLimit REAL NOT NULL, restrictionsEnabled INTEGER DEFAULT 1, updatedAt TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS users ( id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL, avatar TEXT, createdAt TEXT NOT NULL, lastLogin TEXT, lastSeen TEXT, permissions TEXT, status TEXT DEFAULT 'active', ip TEXT, signature TEXT )",
  "CREATE TABLE IF NOT EXISTS warranties ( id TEXT PRIMARY KEY, clientId TEXT NOT NULL, creditId TEXT, type TEXT NOT NULL, description TEXT NOT NULL, marketValue REAL NOT NULL, estimatedValue REAL, status TEXT DEFAULT 'active', documents TEXT DEFAULT '[]', photos TEXT DEFAULT '[]', location TEXT, createdAt TEXT NOT NULL, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT )",
  "CREATE TABLE credits ( id TEXT PRIMARY KEY, clientId TEXT NOT NULL, clientName TEXT NOT NULL, principalAmount REAL NOT NULL, interestRate REAL NOT NULL, lateInterestRate REAL NOT NULL, installments INTEGER NOT NULL, paidInstallments INTEGER DEFAULT 0, currentBalance REAL NOT NULL, startDate TEXT, accruedInterest REAL DEFAULT 0, lateInterest REAL DEFAULT 0, totalDue REAL NOT NULL, dueDate TEXT NOT NULL, daysOverdue INTEGER DEFAULT 0, status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paid', 'overdue', 'defaulted', 'cancelled', 'renegotiated', 'pending_approval', 'rejected')), creditNumber INTEGER DEFAULT 1, paidAt TEXT, createdAt TEXT NOT NULL, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT, approvedBy TEXT, requestedBy TEXT, requestedAt TEXT, approvalNotes TEXT, targetMonthId TEXT, FOREIGN KEY(clientId) REFERENCES clients(id) ON DELETE RESTRICT )",
  "CREATE TABLE dictionary ( word TEXT NOT NULL, language TEXT NOT NULL CHECK(language IN ('pt-AO', 'pt-PT', 'both', 'pt', 'ao')), PRIMARY KEY (word, language) )",
  "CREATE TABLE payments ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, clientName TEXT NOT NULL, amount REAL NOT NULL, paymentDate TEXT NOT NULL, method TEXT NOT NULL, reference TEXT, allocatedToPrincipal REAL DEFAULT 0, allocatedToInterest REAL DEFAULT 0, allocatedToLateInterest REAL DEFAULT 0, processedBy TEXT NOT NULL, status TEXT DEFAULT 'confirmed' CHECK(status IN ('pending', 'confirmed', 'cancelled')), deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT, FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT )",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_audit_runs_immutable_delete BEFORE DELETE ON accounting_audit_runs BEGIN SELECT RAISE(ABORT, 'O histórico de auditorias é imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_audit_runs_immutable_update BEFORE UPDATE ON accounting_audit_runs BEGIN SELECT RAISE(ABORT, 'O histórico de auditorias é imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_closed_period BEFORE INSERT ON accounting_entries WHEN EXISTS (SELECT 1 FROM closed_months WHERE id = substr(NEW.timestamp, 1, 7)) BEGIN SELECT RAISE(ABORT, 'Período contabilístico fechado. Reabra-o com autorização e justificação.')",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_daily_closes_immutable_delete BEFORE DELETE ON accounting_daily_closes BEGIN SELECT RAISE(ABORT, 'Os fechos diários são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_daily_closes_immutable_update BEFORE UPDATE ON accounting_daily_closes BEGIN SELECT RAISE(ABORT, 'Os fechos diários são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_immutable_delete BEFORE DELETE ON accounting_entries BEGIN SELECT RAISE(ABORT, 'Os lançamentos contabilísticos são imutáveis",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_immutable_update BEFORE UPDATE ON accounting_entries BEGIN SELECT RAISE(ABORT, 'Os lançamentos contabilísticos são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_payment_unique BEFORE INSERT ON accounting_entries WHEN NEW.paymentId IS NOT NULL AND NEW.type = 'payment' AND EXISTS ( SELECT 1 FROM accounting_entries WHERE paymentId = NEW.paymentId AND type = 'payment' ) BEGIN SELECT RAISE(ABORT, 'Pagamento já registado no ledger')",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_entry_seals_delete BEFORE DELETE ON accounting_entry_seals BEGIN SELECT RAISE(ABORT, 'Os selos contabilísticos são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_entry_seals_update BEFORE UPDATE ON accounting_entry_seals BEGIN SELECT RAISE(ABORT, 'Os selos contabilísticos são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_requests_decided BEFORE UPDATE ON accounting_requests WHEN OLD.status <> 'pending' BEGIN SELECT RAISE(ABORT, 'Pedido já decidido: não pode ser alterado')",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_requests_delete BEFORE DELETE ON accounting_requests BEGIN SELECT RAISE(ABORT, 'O histórico de pedidos é imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_accounting_requests_segregation BEFORE UPDATE ON accounting_requests WHEN NEW.decidedById IS NOT NULL AND NEW.decidedById = OLD.requestedById BEGIN SELECT RAISE(ABORT, 'O pedido tem de ser decidido por outro administrador')",
  "CREATE TRIGGER IF NOT EXISTS trg_audit_alert_comments_delete BEFORE DELETE ON audit_alert_comments BEGIN SELECT RAISE(ABORT, 'Os comentários dos alertas são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_audit_alert_comments_update BEFORE UPDATE ON audit_alert_comments BEGIN SELECT RAISE(ABORT, 'Os comentários dos alertas são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_audit_alerts_delete BEFORE DELETE ON audit_alerts BEGIN SELECT RAISE(ABORT, 'Os alertas de auditoria não podem ser apagados')",
  "CREATE TRIGGER IF NOT EXISTS trg_audit_alerts_self_close BEFORE UPDATE ON audit_alerts WHEN NEW.status IN ('justified','false_positive','resolved') AND NEW.closedBy IS NOT NULL AND NEW.closedBy = OLD.originUserId BEGIN SELECT RAISE(ABORT, 'Quem originou o alerta não o pode fechar')",
  "CREATE TRIGGER IF NOT EXISTS trg_audit_chain_delete BEFORE DELETE ON audit_log_chain BEGIN SELECT RAISE(ABORT,'A cadeia de auditoria é imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_audit_chain_insert AFTER INSERT ON audit_logs BEGIN INSERT INTO audit_log_chain (auditId, previousHash, integrityHash, origin) VALUES (NEW.id, COALESCE((SELECT integrityHash FROM audit_log_chain ORDER BY seq DESC LIMIT 1), '0000000000000000000000000000000000000000000000000000000000000000'), tango_audit_hash(NEW.id,NEW.timestamp,NEW.userId,NEW.userName,NEW.action,NEW.entity,NEW.details,NEW.previousState,NEW.newState,NEW.metadata, COALESCE((SELECT integrityHash FROM audit_log_chain ORDER BY seq DESC LIMIT 1), '0000000000000000000000000000000000000000000000000000000000000000')),'live')",
  "CREATE TRIGGER IF NOT EXISTS trg_audit_chain_update BEFORE UPDATE ON audit_log_chain BEGIN SELECT RAISE(ABORT,'A cadeia de auditoria é imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_audit_daily_closes_delete BEFORE DELETE ON audit_daily_closes BEGIN SELECT RAISE(ABORT, 'Os fechos diários da auditoria são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_audit_daily_closes_update BEFORE UPDATE ON audit_daily_closes BEGIN SELECT RAISE(ABORT, 'Os fechos diários da auditoria são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_audit_logs_immutable_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'Os registos de auditoria são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_audit_logs_immutable_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'Os registos de auditoria são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_bank_import_delete BEFORE DELETE ON accounting_bank_imports BEGIN SELECT RAISE(ABORT, 'O extrato importado é imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_bank_import_update BEFORE UPDATE ON accounting_bank_imports BEGIN SELECT RAISE(ABORT, 'O extrato importado é imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_cash_session_closed_update BEFORE UPDATE ON accounting_cash_sessions WHEN OLD.status = 'closed' BEGIN SELECT RAISE(ABORT, 'Fecho de caixa imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_cash_session_delete BEFORE DELETE ON accounting_cash_sessions BEGIN SELECT RAISE(ABORT, 'O histórico de caixa é imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_collection_delete BEFORE DELETE ON collection_events BEGIN SELECT RAISE(ABORT, 'O histórico de cobrança é imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_collection_update BEFORE UPDATE ON collection_events BEGIN SELECT RAISE(ABORT, 'O histórico de cobrança é imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_credit_documents_delete BEFORE DELETE ON credit_documents BEGIN SELECT RAISE(ABORT, 'Os documentos do crédito não podem ser apagados (só arquivados)')",
  "CREATE TRIGGER IF NOT EXISTS trg_credit_manager_transfers_delete BEFORE DELETE ON credit_manager_transfers BEGIN SELECT RAISE(ABORT, 'O histórico de transferências é imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_credit_manager_transfers_update BEFORE UPDATE ON credit_manager_transfers BEGIN SELECT RAISE(ABORT, 'O histórico de transferências é imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_credit_restructurings_delete BEFORE DELETE ON credit_restructurings BEGIN SELECT RAISE(ABORT, 'O histórico de reestruturações não pode ser apagado')",
  "CREATE TRIGGER IF NOT EXISTS trg_credit_restructurings_four_eyes BEFORE UPDATE ON credit_restructurings WHEN NEW.status = 'approved' AND OLD.kind = 'restructure' AND (NEW.decidedBy IS NULL OR NEW.decidedBy = OLD.requestedBy) BEGIN SELECT RAISE(ABORT, 'A reestruturação tem de ser aprovada por outra pessoa')",
  "CREATE TRIGGER IF NOT EXISTS trg_credit_restructurings_immutable BEFORE UPDATE ON credit_restructurings WHEN OLD.status <> 'pending' OR NEW.originalPlan <> OLD.originalPlan OR NEW.newPlan <> OLD.newPlan OR NEW.creditId <> OLD.creditId BEGIN SELECT RAISE(ABORT, 'Uma reestruturação já decidida não pode ser alterada')",
  "CREATE TRIGGER IF NOT EXISTS trg_credit_writeoffs_immutable_delete BEFORE DELETE ON credit_writeoffs BEGIN SELECT RAISE(ABORT, 'Os abates de créditos são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_credit_writeoffs_immutable_update BEFORE UPDATE ON credit_writeoffs BEGIN SELECT RAISE(ABORT, 'Os abates de créditos são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_divergence_immutable_delete BEFORE DELETE ON accounting_divergence_events BEGIN SELECT RAISE(ABORT, 'Decisões de divergências são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_divergence_immutable_update BEFORE UPDATE ON accounting_divergence_events BEGIN SELECT RAISE(ABORT, 'Decisões de divergências são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_ledger_lines_immutable_delete BEFORE DELETE ON ledger_lines BEGIN SELECT RAISE(ABORT, 'As linhas do ledger são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_ledger_lines_immutable_update BEFORE UPDATE ON ledger_lines BEGIN SELECT RAISE(ABORT, 'As linhas do ledger são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_ledger_transactions_immutable_delete BEFORE DELETE ON ledger_transactions BEGIN SELECT RAISE(ABORT, 'As transações do ledger são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_ledger_transactions_immutable_update BEFORE UPDATE ON ledger_transactions BEGIN SELECT RAISE(ABORT, 'As transações do ledger são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_limit_escalation_approvals_delete BEFORE DELETE ON limit_escalation_approvals BEGIN SELECT RAISE(ABORT, 'As decisões dos aprovadores são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_limit_escalation_approvals_update BEFORE UPDATE ON limit_escalation_approvals BEGIN SELECT RAISE(ABORT, 'As decisões dos aprovadores são imutáveis')",
  "CREATE TRIGGER IF NOT EXISTS trg_limit_escalation_self BEFORE INSERT ON limit_escalation_approvals WHEN NEW.approverId = (SELECT requestedById FROM limit_escalations WHERE id = NEW.escalationId) BEGIN SELECT RAISE(ABORT, 'Quem pediu a operação não a pode aprovar')",
  "CREATE TRIGGER IF NOT EXISTS trg_limit_escalations_delete BEFORE DELETE ON limit_escalations BEGIN SELECT RAISE(ABORT, 'Os pedidos escalados não podem ser apagados')",
  "CREATE TRIGGER IF NOT EXISTS trg_limit_exceptions_delete BEFORE DELETE ON limit_exceptions BEGIN SELECT RAISE(ABORT, 'As exceções de limites não podem ser apagadas')",
  "CREATE TRIGGER IF NOT EXISTS trg_limit_exceptions_four_eyes BEFORE UPDATE ON limit_exceptions WHEN NEW.status = 'approved' AND OLD.status = 'pending' AND (NEW.decidedBy IS NULL OR NEW.decidedBy = OLD.requestedBy OR NEW.decidedBy = OLD.userId) BEGIN SELECT RAISE(ABORT, 'A exceção tem de ser aprovada por outro administrador')",
  "CREATE TRIGGER IF NOT EXISTS trg_limit_exceptions_immutable BEFORE UPDATE ON limit_exceptions WHEN NEW.userId <> OLD.userId OR NEW.operationType <> OLD.operationType OR NEW.startsAt <> OLD.startsAt OR NEW.endsAt <> OLD.endsAt OR COALESCE(NEW.perOperationMinor, -1) <> COALESCE(OLD.perOperationMinor, -1) OR COALESCE(NEW.dailyMinor, -1) <> COALESCE(OLD.dailyMinor, -1) OR COALESCE(NEW.monthlyMinor, -1) <> COALESCE(OLD.monthlyMinor, -1) OR NEW.reason <> OLD.reason OR (OLD.status IN ('rejected','revoked') AND NEW.status <> OLD.status) BEGIN SELECT RAISE(ABORT, 'Os valores de uma exceção não podem ser alterados')",
  "CREATE TRIGGER IF NOT EXISTS trg_limit_ledger_delete BEFORE DELETE ON limit_ledger BEGIN SELECT RAISE(ABORT, 'O registo de consumo dos limites é imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_limit_ledger_update BEFORE UPDATE ON limit_ledger BEGIN SELECT RAISE(ABORT, 'O registo de consumo dos limites é imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_limit_versions_delete BEFORE DELETE ON limit_policy_versions BEGIN SELECT RAISE(ABORT, 'As versões dos limites não podem ser apagadas')",
  "CREATE TRIGGER IF NOT EXISTS trg_limit_versions_four_eyes BEFORE UPDATE ON limit_policy_versions WHEN NEW.status = 'approved' AND (NEW.decidedBy IS NULL OR NEW.decidedBy = OLD.createdBy) BEGIN SELECT RAISE(ABORT, 'A alteração tem de ser aprovada por um segundo administrador')",
  "CREATE TRIGGER IF NOT EXISTS trg_limit_versions_immutable BEFORE UPDATE ON limit_policy_versions WHEN OLD.status <> 'pending' OR NEW.policy <> OLD.policy OR NEW.version <> OLD.version OR NEW.createdBy <> OLD.createdBy OR NEW.effectiveFrom <> OLD.effectiveFrom OR NEW.reason <> OLD.reason OR NEW.requiresSecondApproval <> OLD.requiresSecondApproval BEGIN SELECT RAISE(ABORT, 'Uma versão dos limites já decidida não pode ser alterada')",
  "CREATE TRIGGER IF NOT EXISTS trg_receipt_delete BEFORE DELETE ON accounting_receipts BEGIN SELECT RAISE(ABORT,'O comprovativo contabilístico é imutável')",
  "CREATE TRIGGER IF NOT EXISTS trg_receipt_update BEFORE UPDATE ON accounting_receipts BEGIN SELECT RAISE(ABORT,'O comprovativo contabilístico é imutável')",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_requests_pending ON accounting_requests(kind, targetId) WHERE status = 'pending'",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_nif_active ON clients(nif) WHERE deletedAt IS NULL AND nif NOT LIKE 'SEM-%' AND nif != 'SEM IDENTIFICAÇÃO'",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone_active ON clients(phone) WHERE deletedAt IS NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_promise_decision ON collection_events(relatedId) WHERE kind IN ('promise_kept','promise_broken')",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_reinforcement_idempotency ON credit_reinforcements(idempotencyKey)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency ON payments(idempotencyKey) WHERE idempotencyKey IS NOT NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_receipt ON payments(receiptYear, receiptSeq) WHERE receiptSeq IS NOT NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)",
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
  "DELETE FROM report_schedules WHERE id = ?",
  "DELETE FROM simulations WHERE id = ?",
  "DELETE FROM sqlite_sequence WHERE name IN ('clients', 'credits', 'payments', 'contracts', 'notifications', 'chat_messages', 'payment_gateways', 'payment_references')",
  "DELETE FROM users WHERE id = ?",
  "DELETE FROM warranties WHERE id = ?",
  "DROP INDEX IF EXISTS idx_clients_nif_active",
  "DROP TABLE credits_old",
  "DROP TABLE dictionary_old",
  "DROP TABLE payments_old",
  "INSERT INTO accounting_audit_runs (id, kind, startedAt, finishedAt, userId, userName, status, criticalCount, highCount, mediumCount, lowCount, headEntryId, headHash, sealStatus, summary, findings) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO accounting_cash_sessions (id, operatorId, operatorName, sessionDate, openedAt, openingMinor, status) VALUES (?,?,?,?,?,?,?)",
  "INSERT INTO accounting_daily_closes (day, headEntryId, headHash, entryCount, debitMinor, creditMinor, liquidMinor, portfolioMinor, auditRunId, sealStatus, closedAt, closedBy, closedById) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO accounting_divergence_events (id, issueKey, previousId, source, description, state, reason, actorId, actorName, createdAt) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ? = COALESCE((SELECT id FROM accounting_divergence_events WHERE issueKey = ? ORDER BY createdAt DESC, rowid DESC LIMIT 1),'')",
  "INSERT INTO accounting_entries (id, timestamp, type, description, clientId, creditId, paymentId, debit, credit, amountPrincipal, amountInterest, amountLateInterest, amountTotal, amountPrincipalMinor, amountInterestMinor, amountLateInterestMinor, amountTotalMinor, processedBy, justification, integrityHash, previousHash, hashVersion, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  "INSERT INTO accounting_receipts (id,entryId,fileName,mime,data,digest,createdAt) VALUES (?,?,?,?,?,?,?)",
  "INSERT INTO accounting_requests (id, kind, targetId, amountMinor, description, reason, requestedBy, requestedById, requestedAt, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
  "INSERT INTO audit_alert_comments (id, alertId, userId, userName, status, comment, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO audit_log_chain (auditId,previousHash,integrityHash,origin) SELECT ?,?,?,'legacy' WHERE ? = COALESCE((SELECT integrityHash FROM audit_log_chain ORDER BY seq DESC LIMIT 1), ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'create', 'accounting_entry', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'create', 'credit', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'create', 'system', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'delete', 'system', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'export', 'client', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'export', 'report', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'restore', 'payment', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'update', 'accounting_entry', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'update', 'credit', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'update', 'system', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, ?, 'payment', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, NULL, 'Sistema', 'update', 'system', ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, 'create', 'payment', ?, ?, ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, 'delete', 'payment', ?, ?, ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, 'update', 'credit', ?, ?, ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, 'update', 'system', ?, ?, ?, ?)",
  "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO audit_logs (id,timestamp,userId,userName,action,entity,details,metadata) VALUES (?,?,?,?,?,?,?,?)",
  "INSERT INTO calendar_tasks (id, title, description, date, done, createdAt, usuario_id) VALUES (?,?,?,?,?,?,?)",
  "INSERT INTO clients (id, name, nif, phone, email, address, creditLimit, usedCredit, availableCredit, monthlyIncome, defaultInterestRate, lateInterestRate, toleranceDays, status, riskLevel, whatsappVerified, documents, bankCoordinates, receiveMethod, lastContacted, createdAt, usuario_id, birthDate, age, issueDate, expiryDate, gender, maritalStatus, fatherName, motherName, workInstitution, socialSecurityNumber, spouseName, spouseBi, spouseNif, spousePhone, spouseEmail, legalRepresentative, legalRepRole) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO collection_events (id, creditId, kind, agentId, agentName, monthKey, amountMinor, promisedDate, relatedId, notes, actorId, actorName, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
  "INSERT INTO collection_messages (id, clientId, clientName, creditIds, channel, message, attemptNumber, totalDue, sentAt, sentBy, legalTriggered) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO contracts (id, clientId, clientName, title, value, startDate, endDate, status, terms, createdAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO credit_approvals (id, creditId, clientId, clientName, principalAmount, interestRate, installments, decision, reason, requestedBy, requestedAt, decidedBy, decidedById, decidedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO credit_documents (id, creditId, kind, fileName, mimeType, dataUrl, uploadedAt, uploadedBy, uploadedByName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO credit_import_batches (id, number, fileName, createdAt, createdBy, createdById, rowsCount, totalMinor, status) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'active')",
  "INSERT INTO credit_installments (id, creditId, installmentNumber, dueDate, principalMinor, interestMinor) VALUES (?, ?, ?, ?, ?, ?)",
  "INSERT INTO credit_manager_transfers (id, creditId, fromUserId, toUserId, toUserName, reason, actorId, actorName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO credit_reinforcements (id, creditId, amountMinor, interestMinor, idempotencyKey, notes, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO credit_restructurings (id, creditId, kind, mode, reason, status, originalPlan, newPlan, params, payNowMinor, requestedBy, requestedByName, requestedAt) VALUES (?, ?, 'restructure', NULL, ?, 'pending', ?, ?, ?, NULL, ?, ?, ?)",
  "INSERT INTO credit_restructurings (id, creditId, kind, mode, reason, status, originalPlan, newPlan, params, payNowMinor, requestedBy, requestedByName, requestedAt, decidedBy, decidedByName, decidedAt) VALUES (?, ?, 'early_settlement', ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO credit_writeoffs (id, creditId, principalMinor, interestMinor, provisionUsedMinor, lossMinor, reason, requestedBy, requestedById, approvedBy, approvedById, entryId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO credits (id, clientId, clientName, principalAmount, principalAmountMinor, interestRate, lateInterestRate, installments, paidInstallments, currentBalance, currentBalanceMinor, accruedInterest, accruedInterestMinor, lateInterest, lateInterestMinor, totalDue, totalDueMinor, version, amortizationMethod, startDate, dueDate, status, creditNumber, createdAt, requestedBy, requestedAt, approvedBy, approvalNotes, usuario_id, targetMonthId, supplierId, supplierProfitRate, productId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  "INSERT INTO internal_messages (id, senderId, senderName, receiverId, receiverName, content, timestamp, read) VALUES (?,?,?,?,?,?,?,?)",
  "INSERT INTO ledger_lines (id, transactionId, account, side, component, amountMinor) VALUES (?,?,?,?,?,?)",
  "INSERT INTO ledger_transactions (id, timestamp, type, sourceType, sourceId, description, totalDebitMinor, totalCreditMinor, integrityHash, previousHash, hashVersion, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  "INSERT INTO legal_cases (id, clientId, creditId, stage, priority, debtAmount, lastAction, notes, createdAt, updatedAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO limit_escalation_approvals (id, escalationId, approverId, approverName, approverRole, decision, notes, decidedAt) VALUES (?, ?, ?, ?, ?, 'approved', ?, ?)",
  "INSERT INTO limit_escalation_approvals (id, escalationId, approverId, approverName, approverRole, decision, notes, decidedAt) VALUES (?, ?, ?, ?, ?, 'rejected', ?, ?)",
  "INSERT INTO limit_escalations (id, operationType, entityType, entityId, amountMinor, requestedById, requestedByName, requestedRole, reason, details, requiredLevelId, requiredLevelIndex, requiredLevelName, dual, status, createdAt, levelSince) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
  "INSERT INTO limit_exceptions (id, userId, userName, operationType, perOperationMinor, dailyMinor, monthlyMinor, dailyCount, startsAt, endsAt, reason, status, requestedBy, requestedByName, requestedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
  "INSERT INTO limit_ledger (id, operationType, userId, userName, profileId, branchId, amountMinor, count, dayKey, monthKey, entityType, entityId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO limit_locks (id, ledgerId, scope, scopeId, period, periodKey, createdAt) SELECT ?, ?, ?, ?, ?, ?, ? WHERE COALESCE((SELECT SUM(amountMinor) FROM limit_ledger WHERE operationType = ? AND (CASE ? WHEN 'user' THEN userId WHEN 'branch' THEN COALESCE(profileId, '') || '|' || COALESCE(branchId, '') WHEN 'profile' THEN profileId ELSE 'all' END) = ? AND (CASE ? WHEN 'day' THEN dayKey ELSE monthKey END) = ?), 0) + ? <= ? AND COALESCE((SELECT SUM(count) FROM limit_ledger WHERE operationType = ? AND (CASE ? WHEN 'user' THEN userId WHEN 'branch' THEN COALESCE(profileId, '') || '|' || COALESCE(branchId, '') WHEN 'profile' THEN profileId ELSE 'all' END) = ? AND (CASE ? WHEN 'day' THEN dayKey ELSE monthKey END) = ?), 0) + ? <= ?",
  "INSERT INTO limit_policy_versions (id, version, policy, summary, reason, status, effectiveFrom, requiresSecondApproval, secondApprovalReasons, createdBy, createdByName, createdAt, restoredFrom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO message_templates (id, name, type, content, isDefault) VALUES (?, ?, ?, ?, ?)",
  "INSERT INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, 'Novo Crédito', ?, 'success', 0, ?)",
  "INSERT INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, 'Pagamento Recebido', ?, 'success', 0, ?)",
  "INSERT INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, ?, ?, ?, 0, ?)",
  "INSERT INTO notifications (id, userId, title, message, type, source, read, timestamp) VALUES (?,?,?,?,?,?,?,?)",
  "INSERT INTO password_reset_requests (id, userId, userName, email, timestamp, status) VALUES (?, ?, ?, ?, ?, ?)",
  "INSERT INTO payment_gateways ( id, name, provider, type, status, environment, apiKey, apiSecret, merchantId, webhookUrl, webhookSecret, transactionFee, feeType, logo, description, supportedMethods, config, createdAt ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO payment_import_batches (id, number, fileName, createdAt, createdBy, createdById, rowsCount, totalMinor, status) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'active')",
  "INSERT INTO payment_references ( id, creditId, gatewayId, reference, entity, amount, status, createdAt ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO payment_references ( id, creditId, gatewayId, reference, entity, amount, status, createdAt, expiresAt, paidAt, proofImage ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO payments (id, creditId, clientName, amount, amountMinor, paymentDate, method, reference, allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest, allocatedToInterestMinor, allocatedToLateInterest, allocatedToLateInterestMinor, idempotencyKey, processedBy, status, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  "INSERT INTO payments (id, creditId, clientName, amount, amountMinor, paymentDate, method, reference, allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest, allocatedToInterestMinor, allocatedToLateInterest, allocatedToLateInterestMinor, idempotencyKey, processedBy, status, usuario_id, registeredAt, batchId, hasProof) VALUES (?,?,?,?,?,?,?,?,0,0,0,0,0,0,?,?,'pending',?,?,?,?)",
  "INSERT INTO payments (id, creditId, clientName, amount, amountMinor, paymentDate, method, reference, allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest, allocatedToInterestMinor, allocatedToLateInterest, allocatedToLateInterestMinor, idempotencyKey, processedBy, status, usuario_id, registeredAt, receiptYear, receiptSeq, allocationDetail, balanceAfterMinor, batchId, hasProof) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  "INSERT INTO report_history (id, reportType, title, format, filters, fileName, fileData, generatedAt, generatedBy, generatedById) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO report_schedules (id, reportType, recipients, enabled, createdAt, createdBy) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET reportType = excluded.reportType, recipients = excluded.recipients, enabled = excluded.enabled",
  "INSERT INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)",
  "INSERT INTO shared_settings (key, value, updatedAt, updatedBy) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy WHERE excluded.updatedAt >= shared_settings.updatedAt",
  "INSERT INTO simulations ( id, reference, date, clientName, clientIncome, amount, term, interestRate, method, riskProfile, totalPayment, monthlyPayment, aiAnalysis, usuario_id, createdAt, status, clientId, productId, verificationCode, expiresAt, details, convertedCreditId, updatedAt ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO suppliers (id, name, phone, email, nif, address, notes, status, createdAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)",
  "INSERT INTO users (id, name, email, username, password, role, avatar, createdAt, permissions, status, ip, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO warranties (id, clientId, creditId, type, description, marketValue, status, location, photos, documents, notes, createdAt, updatedAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT OR IGNORE INTO accounting_bank_imports (id, fileName, movements, actorId, actorName, importedAt) VALUES (?,?,?,?,?,?)",
  "INSERT OR IGNORE INTO audit_alerts (id, alertKey, ruleId, severity, title, description, eventIds, originUserId, originUserName, occurredAt, status, dueAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)",
  "INSERT OR IGNORE INTO audit_daily_closes (day, lastAuditId, headHash, eventCount, status, brokenSeq, verifiedAt, verifiedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT OR IGNORE INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'create', 'accounting_entry', ?, ?)",
  "INSERT OR IGNORE INTO company_settings (id, name, nif) VALUES (1, 'Tango Gestão de Créditos', '000000000')",
  "INSERT OR IGNORE INTO contracts (id, clientId, clientName, title, value, startDate, endDate, status, createdAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)",
  "INSERT OR IGNORE INTO credit_import_items (batchId, creditId) VALUES (?, ?)",
  "INSERT OR IGNORE INTO credit_installments (id, creditId, installmentNumber, dueDate, principalMinor, interestMinor) VALUES (?, ?, ?, ?, ?, ?)",
  "INSERT OR IGNORE INTO dictionary (word, language) SELECT word, CASE WHEN language = 'ao' THEN 'pt-AO' WHEN language = 'pt' THEN 'pt-PT' WHEN language IN ('pt-AO', 'pt-PT', 'both') THEN language ELSE 'both' END FROM dictionary_old",
  "INSERT OR IGNORE INTO dictionary (word, language) VALUES (?, ?)",
  "INSERT OR IGNORE INTO message_templates (id, name, type, content, isDefault) VALUES (?, ?, ?, ?, 1)",
  "INSERT OR IGNORE INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, ?, ?, ?, 0, ?)",
  "INSERT OR IGNORE INTO sync_conflicts (id, entityType, entityId, operation, status, createdAt) VALUES (?, ?, ?, ?, 'pending', ?)",
  "INSERT OR IGNORE INTO user_limits (id, role, maxTransaction, dailyLimit, monthlyLimit, restrictionsEnabled, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
  "INSERT OR REPLACE INTO closed_months (id, month, year, capitalApplied, projectedProfit, realizedProfit, overdueAmount, liquidationRate, closedAt, closedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT OR REPLACE INTO company_settings ( id, name, nif, address, logo, reportLogo, watermarkLogo, currency, customClauses, rescueKey, phone, primaryColor, secondaryColor, email, whatsapp, whatsappAutoNotify, whatsappVerified, syncEnabled, syncUrl, syncApiKey, syncPasskey, lastSync, maintenanceMode, sessionTimeout, allowedModulesDuringMaintenance, enableGatewaysModule, enableProfileActivity, digitalSignatureEnabled, authorizedSigners, bankingInfo, contractTemplates, lastBackupDate, installDate, financialLock, licenseKey, enableGatewaysModuleAdminOnly, enableProfileActivityAdminOnly, enableWarrantiesModule, enableWarrantiesModuleAdminOnly, enableLegalModule, enableLegalModuleAdminOnly, enableScoringModule, enableScoringModuleAdminOnly, location, enableSuppliersModule, enableSuppliersModuleAdminOnly, enableMultiTenant, website, segment, slogan, defaultSimulationInterestRate, defaultSimulationAdminFee, defaultSimulationIof, smtpHost, smtpPort, smtpUser, smtpPassword, smtpSecure, smtpFromName ) VALUES ( 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )",
  "INSERT OR REPLACE INTO company_settings ( id, name, nif, currency, sessionTimeout, installDate ) VALUES (1, ?, ?, ?, ?, ?)",
  "INSERT OR REPLACE INTO payment_proofs (paymentId, fileName, mimeType, dataUrl, uploadedAt, uploadedBy) VALUES (?, ?, ?, ?, ?, ?)",
  "INSERT OR REPLACE INTO users (id, name, email, username, password, role, avatar, createdAt, permissions, status, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "PRAGMA integrity_check",
  "PRAGMA table_info(audit_logs)",
  "PRAGMA table_info(credits_old)",
  "PRAGMA table_info(dictionary)",
  "PRAGMA table_info(payments_old)",
  "SELECT * FROM accounting_audit_runs ORDER BY finishedAt DESC LIMIT ?",
  "SELECT * FROM accounting_bank_imports ORDER BY importedAt DESC, rowid DESC",
  "SELECT * FROM accounting_cash_sessions WHERE operatorId = ? AND sessionDate = ?",
  "SELECT * FROM accounting_cash_sessions WHERE operatorId = ? ORDER BY sessionDate DESC LIMIT 90",
  "SELECT * FROM accounting_cash_sessions WHERE status = 'closed'",
  "SELECT * FROM accounting_cash_sessions WHERE status = 'closed' AND expectedMinor <> countedMinor",
  "SELECT * FROM accounting_daily_closes ORDER BY day DESC",
  "SELECT * FROM accounting_divergence_events ORDER BY createdAt DESC, rowid DESC",
  "SELECT * FROM accounting_entries ORDER BY rowid",
  "SELECT * FROM accounting_entries ORDER BY timestamp DESC, id DESC LIMIT ?",
  "SELECT * FROM accounting_entries WHERE timestamp < ? OR (timestamp = ? AND id < ?) ORDER BY timestamp DESC, id DESC LIMIT ?",
  "SELECT * FROM accounting_requests ORDER BY requestedAt DESC",
  "SELECT * FROM accounting_requests WHERE id = ?",
  "SELECT * FROM audit_alert_comments WHERE alertId = ? ORDER BY createdAt",
  "SELECT * FROM audit_alerts ORDER BY occurredAt DESC LIMIT 1000",
  "SELECT * FROM audit_log_chain ORDER BY seq",
  "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?",
  "SELECT * FROM audit_logs ORDER BY timestamp DESC, id DESC LIMIT ?",
  "SELECT * FROM audit_logs ORDER BY timestamp DESC, rowid DESC",
  "SELECT * FROM audit_logs WHERE timestamp < ? OR (timestamp = ? AND id < ?) ORDER BY timestamp DESC, id DESC LIMIT ?",
  "SELECT * FROM audit_logs WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT ?",
  "SELECT * FROM calendar_tasks ORDER BY date ASC",
  "SELECT * FROM clients WHERE deletedAt IS NOT NULL",
  "SELECT * FROM clients WHERE deletedAt IS NULL",
  "SELECT * FROM clients WHERE id = ?",
  "SELECT * FROM closed_months",
  "SELECT * FROM collection_events ORDER BY createdAt DESC, rowid DESC",
  "SELECT * FROM collection_events WHERE id = ? AND kind = ?",
  "SELECT * FROM collection_events WHERE kind IN ('promise','promise_kept','promise_broken') ORDER BY createdAt",
  "SELECT * FROM collection_messages ORDER BY sentAt DESC",
  "SELECT * FROM company_settings WHERE id = 1",
  "SELECT * FROM company_settings WHERE id = ?",
  "SELECT * FROM contracts WHERE deletedAt IS NOT NULL ORDER BY createdAt DESC",
  "SELECT * FROM contracts WHERE deletedAt IS NULL ORDER BY createdAt DESC",
  "SELECT * FROM credit_import_batches ORDER BY createdAt DESC",
  "SELECT * FROM credit_installments",
  "SELECT * FROM credit_manager_transfers WHERE creditId = ? ORDER BY createdAt DESC",
  "SELECT * FROM credit_restructurings ORDER BY requestedAt DESC",
  "SELECT * FROM credit_restructurings WHERE creditId = ? ORDER BY requestedAt DESC",
  "SELECT * FROM credit_writeoffs",
  "SELECT * FROM credits",
  "SELECT * FROM credits WHERE id = ?",
  "SELECT * FROM internal_messages ORDER BY timestamp ASC",
  "SELECT * FROM ledger_lines ORDER BY rowid",
  "SELECT * FROM ledger_lines WHERE transactionId = ? ORDER BY id",
  "SELECT * FROM ledger_transactions ORDER BY rowid",
  "SELECT * FROM ledger_transactions WHERE id = ?",
  "SELECT * FROM legal_cases WHERE clientId = ?",
  "SELECT * FROM legal_cases WHERE creditId = ?",
  "SELECT * FROM legal_cases WHERE deletedAt IS NOT NULL ORDER BY createdAt DESC",
  "SELECT * FROM legal_cases WHERE deletedAt IS NULL ORDER BY createdAt DESC",
  "SELECT * FROM legal_cases WHERE id = ?",
  "SELECT * FROM limit_escalation_approvals ORDER BY decidedAt DESC LIMIT 5000",
  "SELECT * FROM limit_escalation_approvals WHERE escalationId = ? ORDER BY decidedAt",
  "SELECT * FROM limit_escalations ORDER BY createdAt DESC LIMIT 2000",
  "SELECT * FROM limit_escalations WHERE createdAt >= ? ORDER BY createdAt DESC",
  "SELECT * FROM limit_escalations WHERE entityType = ? AND entityId = ? ORDER BY createdAt DESC LIMIT 1",
  "SELECT * FROM limit_exceptions ORDER BY requestedAt DESC",
  "SELECT * FROM limit_ledger WHERE createdAt >= ? AND operationType NOT IN ('credit_approval','disbursement')",
  "SELECT * FROM limit_ledger WHERE dayKey >= ? ORDER BY createdAt DESC",
  "SELECT * FROM limit_policy_versions ORDER BY version DESC",
  "SELECT * FROM message_templates",
  "SELECT * FROM notifications ORDER BY timestamp DESC LIMIT ?",
  "SELECT * FROM password_reset_requests WHERE id = ?",
  "SELECT * FROM password_reset_requests WHERE status = \"pending\" ORDER BY timestamp DESC",
  "SELECT * FROM payment_gateways ORDER BY createdAt DESC",
  "SELECT * FROM payment_import_batches ORDER BY createdAt DESC",
  "SELECT * FROM payment_import_batches WHERE id = ?",
  "SELECT * FROM payment_references ORDER BY createdAt DESC",
  "SELECT * FROM payments",
  "SELECT * FROM payments WHERE deletedAt IS NOT NULL",
  "SELECT * FROM payments WHERE deletedAt IS NULL AND status = 'confirmed'",
  "SELECT * FROM payments WHERE deletedAt IS NULL ORDER BY paymentDate DESC",
  "SELECT * FROM report_schedules ORDER BY createdAt",
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
  "SELECT COALESCE(SUM(CASE WHEN l.side = 'debit' THEN l.amountMinor ELSE -l.amountMinor END),0) AS net FROM ledger_lines l JOIN ledger_transactions t ON t.id = l.transactionId WHERE l.account = 'cash' AND t.usuario_id = ? AND t.timestamp >= ?",
  "SELECT COUNT(*) AS n FROM clients WHERE deletedAt IS NULL AND substr(createdAt, 1, 7) = ?",
  "SELECT COUNT(*) AS n FROM users",
  "SELECT COUNT(*) AS total FROM credit_import_batches WHERE number LIKE ?",
  "SELECT COUNT(*) AS total FROM payment_import_batches WHERE number LIKE ?",
  "SELECT COUNT(*) as count FROM dictionary",
  "SELECT COUNT(*) as count FROM legal_cases WHERE priority = ?",
  "SELECT COUNT(*) as count FROM legal_cases WHERE stage = ?",
  "SELECT COUNT(*) as count FROM warranties WHERE status = ?",
  "SELECT MAX(receiptSeq) AS last FROM payments WHERE receiptYear = ?",
  "SELECT SUM(debtAmount) as total FROM legal_cases WHERE stage != ?",
  "SELECT SUM(marketValue) as total FROM warranties WHERE status = ?",
  "SELECT a.* FROM accounting_entries a LEFT JOIN ledger_transactions t ON t.id = a.id WHERE t.id IS NULL ORDER BY a.rowid",
  "SELECT a.* FROM audit_logs a LEFT JOIN audit_log_chain c ON c.auditId = a.id WHERE c.auditId IS NULL ORDER BY a.rowid LIMIT 200",
  "SELECT a.id, a.timestamp, a.userId, a.userName, a.action, a.entity, a.details, a.previousState, a.newState, a.metadata, c.seq, c.integrityHash, c.previousHash FROM audit_logs a LEFT JOIN audit_log_chain c ON c.auditId = a.id WHERE a.userId = ? ORDER BY a.timestamp DESC LIMIT ?",
  "SELECT account, component, amountMinor FROM ledger_lines WHERE transactionId = ? AND side = 'credit'",
  "SELECT account, side, SUM(amountMinor) AS total FROM ledger_lines WHERE account IN ('cash', 'bank') GROUP BY account, side",
  "SELECT alertKey FROM audit_alerts",
  "SELECT allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest, allocatedToInterestMinor, allocatedToLateInterest, allocatedToLateInterestMinor FROM payments WHERE id = ?",
  "SELECT auditId, previousHash, integrityHash, seq FROM audit_log_chain ORDER BY seq",
  "SELECT c.id, c.principalAmount, c.principalAmountMinor, c.createdAt, c.requestedBy, c.usuario_id, cl.riskLevel FROM credits c LEFT JOIN clients cl ON cl.id = c.clientId WHERE c.deletedAt IS NULL AND c.createdAt >= ?",
  "SELECT c.id, c.startDate, c.installments, COALESCE(c.principalAmountMinor, CAST(ROUND(c.principalAmount * 100) AS INTEGER)) AS principalMinor, MAX(0, COALESCE(c.totalDueMinor, CAST(ROUND(c.totalDue * 100) AS INTEGER)) - COALESCE(c.principalAmountMinor, CAST(ROUND(c.principalAmount * 100) AS INTEGER))) AS interestMinor FROM credits c WHERE NOT EXISTS (SELECT 1 FROM credit_installments i WHERE i.creditId = c.id)",
  "SELECT clientId, SUM(COALESCE(currentBalanceMinor, ROUND(currentBalance * 100))) AS balance FROM credits WHERE deletedAt IS NULL AND status IN ('active','overdue','defaulted','renegotiated','pending_approval') GROUP BY clientId",
  "SELECT clientId, status, principalAmount, currentBalance, totalDue, createdAt, startDate, deletedAt FROM credits WHERE clientId = ? AND deletedAt IS NULL",
  "SELECT clientId, version FROM credits WHERE id = ? AND deletedAt IS NULL",
  "SELECT convertedCreditId, productId FROM simulations WHERE convertedCreditId IS NOT NULL AND productId IS NOT NULL",
  "SELECT creditId FROM credit_import_items WHERE batchId = ?",
  "SELECT creditId FROM credit_writeoffs",
  "SELECT creditId, dueDate, principalMinor, interestMinor, paidPrincipalMinor, paidInterestMinor, status FROM credit_installments WHERE status <> 'cancelled'",
  "SELECT creditId, stage FROM legal_cases WHERE deletedAt IS NULL AND stage <> 'closed'",
  "SELECT creditId,dueDate,principalMinor,interestMinor,lateInterestMinor,paidPrincipalMinor,paidInterestMinor,paidLateInterestMinor FROM credit_installments",
  "SELECT day FROM accounting_daily_closes WHERE day = ?",
  "SELECT day, status, brokenSeq, verifiedAt FROM audit_daily_closes ORDER BY day DESC LIMIT 1",
  "SELECT details, metadata FROM audit_logs WHERE userId = ? ORDER BY timestamp DESC LIMIT 500",
  "SELECT entityId FROM limit_escalations WHERE entityType = 'credit' AND status = 'pending'",
  "SELECT fileName, fileData, format FROM report_history WHERE id = ?",
  "SELECT fileName, mimeType, dataUrl, uploadedAt, uploadedBy FROM payment_proofs WHERE paymentId = ?",
  "SELECT fileName, movements FROM accounting_bank_imports",
  "SELECT fileName,mime,data,digest FROM accounting_receipts WHERE entryId = ?",
  "SELECT i.creditId, c.clientId, c.clientName, i.installmentNumber, i.dueDate, i.principalMinor, i.interestMinor, i.lateInterestMinor, i.paidPrincipalMinor, i.paidInterestMinor, i.paidLateInterestMinor FROM credit_installments i JOIN credits c ON c.id = i.creditId WHERE c.deletedAt IS NULL AND c.status IN ('active', 'overdue', 'defaulted', 'renegotiated', 'paid')",
  "SELECT id FROM accounting_entries ORDER BY rowid DESC LIMIT 1",
  "SELECT id FROM accounting_requests WHERE kind = ? AND targetId = ? AND status = 'pending'",
  "SELECT id FROM closed_months",
  "SELECT id FROM credit_writeoffs WHERE creditId = ?",
  "SELECT id FROM credit_writeoffs WHERE creditId = ? LIMIT 1",
  "SELECT id FROM credits WHERE id = ?",
  "SELECT id FROM ledger_transactions WHERE id = ?",
  "SELECT id FROM notifications WHERE id = ?",
  "SELECT id FROM payments WHERE idempotencyKey = ?",
  "SELECT id FROM users WHERE email = ?",
  "SELECT id FROM users WHERE role IN ('admin','super_admin','credit_director') AND (status IS NULL OR status <> 'blocked')",
  "SELECT id FROM users WHERE role IN ('super_admin', 'internal_auditor') AND (status IS NULL OR status <> 'blocked')",
  "SELECT id, allocatedToPrincipalMinor, allocatedToInterestMinor, allocatedToLateInterestMinor, deletedAt, status FROM payments WHERE creditId = ?",
  "SELECT id, clientId, clientName, principalAmount, currentBalance, interestRate, lateInterestRate, installments, paidInstallments, startDate, dueDate, status, daysOverdue, accruedInterest, lateInterest, totalDue, createdAt, requestedBy, requestedAt, approvedBy, approvalNotes, creditNumber, paidAt, usuario_id, targetMonthId, supplierId, supplierProfitRate, principalAmountMinor, currentBalanceMinor, accruedInterestMinor, lateInterestMinor, totalDueMinor, version, amortizationMethod, productId FROM credits WHERE deletedAt IS NULL",
  "SELECT id, clientId, clientName, principalAmount, currentBalance, interestRate, lateInterestRate, installments, status, deletedAt, deletedBy, createdAt FROM credits WHERE deletedAt IS NOT NULL",
  "SELECT id, clientId, clientName, status, version FROM credits WHERE id = ? AND deletedAt IS NULL",
  "SELECT id, clientId, status, version FROM credits WHERE id = ? AND deletedAt IS NULL",
  "SELECT id, clientId, status, version, lateInterestRate FROM credits WHERE id = ? AND deletedAt IS NULL",
  "SELECT id, creditId, clientId, clientName, principalAmount, interestRate, installments, decision, reason, requestedBy, requestedAt, decidedBy, decidedById, decidedAt FROM credit_approvals ORDER BY decidedAt DESC",
  "SELECT id, creditId, installmentNumber, dueDate, principalMinor, interestMinor, lateInterestMinor, paidPrincipalMinor, paidInterestMinor, paidLateInterestMinor, status, paidAt FROM credit_installments",
  "SELECT id, creditId, kind, fileName, mimeType, dataUrl, uploadedAt, uploadedByName FROM credit_documents WHERE creditId = ? AND deletedAt IS NULL ORDER BY uploadedAt DESC",
  "SELECT id, entityType, entityId, createdAt FROM sync_conflicts WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 100",
  "SELECT id, installmentNumber, dueDate, principalMinor, interestMinor, lateInterestMinor, paidPrincipalMinor, paidInterestMinor, paidLateInterestMinor, status, paidAt, version FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber",
  "SELECT id, lateInterestMinor, version FROM credit_installments WHERE creditId = ?",
  "SELECT id, name, email, username, role, avatar, lastLogin, lastSeen, createdAt, permissions, status, signature, ip FROM users",
  "SELECT id, name, email, username, role, avatar, status, permissions FROM users",
  "SELECT id, name, nif, phone, riskLevel, fatherName, motherName, spouseName, spouseBi, spouseNif, spousePhone, legalRepresentative FROM clients WHERE deletedAt IS NULL",
  "SELECT id, name, role FROM users WHERE LOWER(email) = ?",
  "SELECT id, name, role, branchId FROM users WHERE id = ?",
  "SELECT id, name, role, status, branchId, branchName FROM users WHERE status IS NULL OR status <> 'blocked'",
  "SELECT id, operation FROM sync_conflicts WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 5000",
  "SELECT id, paymentDate FROM payments WHERE receiptSeq IS NULL AND status = 'confirmed' AND deletedAt IS NULL ORDER BY paymentDate, id",
  "SELECT id, principalMinor, interestMinor, paidPrincipalMinor, paidInterestMinor, status, version FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber",
  "SELECT id, reportType, title, format, filters, fileName, generatedAt, generatedBy, generatedById FROM report_history ORDER BY generatedAt DESC LIMIT 200",
  "SELECT id, requestedById, reason FROM accounting_requests WHERE id = ? AND kind = ? AND targetId = ? AND status = ?",
  "SELECT id, status FROM credits WHERE deletedAt IS NULL",
  "SELECT id, status FROM credits WHERE id = ? AND deletedAt IS NULL",
  "SELECT id, status, daysOverdue, clientName FROM credits WHERE deletedAt IS NULL AND status IN ('active','overdue')",
  "SELECT id, status, interestMinor, lateInterestMinor, paidInterestMinor, paidLateInterestMinor, version FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber",
  "SELECT id, timestamp, type, description, debit, credit, amountTotal, justification FROM accounting_entries WHERE paymentId = ? ORDER BY timestamp",
  "SELECT id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata FROM audit_logs",
  "SELECT id, timestamp, userName, action, details, metadata FROM audit_logs WHERE entity = 'payment' AND (metadata LIKE ? OR details LIKE ?) ORDER BY timestamp",
  "SELECT id, totalDueMinor, totalDue, deletedAt FROM credits WHERE id = ?",
  "SELECT id, usuario_id, clientName FROM credits WHERE deletedAt IS NULL",
  "SELECT integrityHash FROM accounting_entries ORDER BY rowid DESC LIMIT 1",
  "SELECT integrityHash FROM audit_log_chain ORDER BY seq DESC LIMIT 1",
  "SELECT l.*, t.timestamp, t.sourceId, t.description FROM ledger_lines l LEFT JOIN ledger_transactions t ON t.id = l.transactionId ORDER BY t.timestamp, l.id",
  "SELECT l.account, l.side, l.amountMinor FROM ledger_lines l JOIN accounting_entries a ON a.id = l.transactionId WHERE a.creditId = ? AND l.account IN ('receivable_interest', 'receivable_late_interest')",
  "SELECT last_insert_rowid() as id",
  "SELECT lateInterestRate FROM credits WHERE id = ? AND deletedAt IS NULL",
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  "SELECT name FROM users WHERE id = ?",
  "SELECT password FROM users WHERE id = ?",
  "SELECT paymentDate, allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest, allocatedToInterestMinor, allocatedToLateInterest, allocatedToLateInterestMinor FROM payments WHERE creditId = ? AND deletedAt IS NULL AND status = 'confirmed'",
  "SELECT paymentDate, allocatedToPrincipalMinor, allocatedToInterestMinor, allocatedToLateInterestMinor FROM payments WHERE creditId = ? AND deletedAt IS NULL AND status = 'confirmed'",
  "SELECT principalAmount, principalAmountMinor, currentBalance, currentBalanceMinor, accruedInterest, accruedInterestMinor, lateInterest, lateInterestMinor, status, version FROM credits WHERE id = ? AND deletedAt IS NULL",
  "SELECT principalAmount, principalAmountMinor, currentBalance, currentBalanceMinor, accruedInterest, accruedInterestMinor, lateInterest, lateInterestMinor, status, version, lateInterestRate FROM credits WHERE id = ? AND deletedAt IS NULL",
  "SELECT principalAmountMinor, principalAmount FROM credits WHERE id = ?",
  "SELECT receiptYear, MAX(receiptSeq) AS last FROM payments WHERE receiptSeq IS NOT NULL GROUP BY receiptYear",
  "SELECT receiveMethod FROM clients WHERE id = ?",
  "SELECT requestedBy FROM accounting_requests WHERE id = ?",
  "SELECT requestedById FROM accounting_requests WHERE id = ?",
  "SELECT requestedById, reason FROM accounting_requests WHERE id = ? AND kind = ? AND targetId = ? AND status = ?",
  "SELECT rescueKey FROM company_settings WHERE id = 1",
  "SELECT role, name FROM users WHERE id = ?",
  "SELECT role, name, branchId FROM users WHERE id = ?",
  "SELECT rowid AS ledgerSequence, * FROM accounting_entries ORDER BY rowid ASC",
  "SELECT sessionTimeout FROM company_settings WHERE id = 1",
  "SELECT side, SUM(amountMinor) AS total FROM ledger_lines WHERE account = ? GROUP BY side",
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='credits'",
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='payments'",
  "SELECT status FROM credits WHERE id = ? AND deletedAt IS NULL",
  "SELECT status FROM users WHERE id = ?",
  "SELECT syncEnabled, syncUrl, syncPasskey FROM company_settings WHERE id = 1",
  "SELECT twoFactorSecret FROM users WHERE id = ?",
  "SELECT type, COUNT(*) as count FROM warranties WHERE status = ? GROUP BY type",
  "SELECT value FROM shared_settings WHERE key = ?",
  "UPDATE accounting_cash_sessions SET expectedMinor = openingMinor + (SELECT COALESCE(SUM(CASE WHEN l.side = 'debit' THEN l.amountMinor ELSE -l.amountMinor END),0) FROM ledger_lines l JOIN ledger_transactions t ON t.id = l.transactionId WHERE l.account = 'cash' AND t.usuario_id = accounting_cash_sessions.operatorId AND t.timestamp >= accounting_cash_sessions.openedAt AND t.timestamp <= ?), countedMinor = ?, reason = ?, closedAt = ?, status = 'closed' WHERE id = ? AND operatorId = ? AND status = 'open'",
  "UPDATE accounting_entries SET amountPrincipalMinor = CAST(ROUND(amountPrincipal * 100) AS INTEGER), amountInterestMinor = CAST(ROUND(amountInterest * 100) AS INTEGER), amountLateInterestMinor = CAST(ROUND(amountLateInterest * 100) AS INTEGER), amountTotalMinor = CAST(ROUND(amountTotal * 100) AS INTEGER) WHERE amountTotalMinor IS NULL",
  "UPDATE accounting_requests SET status = ?, decidedBy = ?, decidedById = ?, decidedAt = ?, decisionReason = ?, resultEntryId = ? WHERE id = ? AND status = 'pending'",
  "UPDATE accounting_requests SET status = ?, decidedBy = ?, decidedById = ?, decidedAt = ?, decisionReason = ?, resultEntryId = ? WHERE id = ? AND status = 'pending' AND requestedById <> ?",
  "UPDATE audit_alerts SET status = ?, assignedTo = ?, assignedToName = ?, dueAt = ?, updatedAt = ?, closedBy = ?, closedByName = ?, closedAt = ? WHERE id = ?",
  "UPDATE clients SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?",
  "UPDATE clients SET deletedAt = NULL, restoredAt = ? WHERE id = ?",
  "UPDATE clients SET name = COALESCE(?, name), nif = COALESCE(?, nif), phone = COALESCE(?, phone), email = COALESCE(?, email), address = COALESCE(?, address), creditLimit = COALESCE(?, creditLimit), usedCredit = COALESCE(?, usedCredit), availableCredit = COALESCE(?, availableCredit), monthlyIncome = COALESCE(?, monthlyIncome), defaultInterestRate = COALESCE(?, defaultInterestRate), lateInterestRate = COALESCE(?, lateInterestRate), toleranceDays = COALESCE(?, toleranceDays), status = COALESCE(?, status), riskLevel = COALESCE(?, riskLevel), whatsappVerified = COALESCE(?, whatsappVerified), documents = COALESCE(?, documents), bankCoordinates = COALESCE(?, bankCoordinates), receiveMethod = COALESCE(?, receiveMethod), lastContacted = COALESCE(?, lastContacted), usuario_id = COALESCE(?, usuario_id), birthDate = COALESCE(?, birthDate), age = COALESCE(?, age), issueDate = COALESCE(?, issueDate), expiryDate = COALESCE(?, expiryDate), gender = COALESCE(?, gender), maritalStatus = COALESCE(?, maritalStatus), fatherName = COALESCE(?, fatherName), motherName = COALESCE(?, motherName), workInstitution = COALESCE(?, workInstitution), socialSecurityNumber = COALESCE(?, socialSecurityNumber), spouseName = COALESCE(?, spouseName), spouseBi = COALESCE(?, spouseBi), spouseNif = COALESCE(?, spouseNif), spousePhone = COALESCE(?, spousePhone), spouseEmail = COALESCE(?, spouseEmail), legalRepresentative = COALESCE(?, legalRepresentative), legalRepRole = COALESCE(?, legalRepRole) WHERE id = ?",
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
  "UPDATE credit_documents SET deletedAt = ?, deletedBy = ? WHERE id = ? AND deletedAt IS NULL",
  "UPDATE credit_import_batches SET rowsCount = ?, totalMinor = ? WHERE id = ?",
  "UPDATE credit_import_batches SET status = 'cancelled', cancelledAt = ?, cancelledBy = ?, cancelReason = ? WHERE id = ? AND status = 'active'",
  "UPDATE credit_installments SET dueDate = ?, principalMinor = ?, interestMinor = ?, status = 'pending', version = version + 1 WHERE id = ? AND version = ?",
  "UPDATE credit_installments SET interestMinor = ?, lateInterestMinor = ?, version = version + 1 WHERE id = ? AND version = ?",
  "UPDATE credit_installments SET lateInterestMinor = ?, version = version + 1 WHERE id = ? AND version = ?",
  "UPDATE credit_installments SET paidPrincipalMinor = ?, paidInterestMinor = ?, paidLateInterestMinor = ?, status = ?, paidAt = ?, version = version + 1 WHERE id = ? AND version = ?",
  "UPDATE credit_installments SET principalMinor = 0, interestMinor = 0, status = 'cancelled', version = version + 1 WHERE id = ? AND version = ?",
  "UPDATE credit_installments SET principalMinor = ?, interestMinor = ?, version = version + 1 WHERE id = ? AND version = ?",
  "UPDATE credit_restructurings SET status = ?, decidedBy = ?, decidedByName = ?, decidedAt = ?, decisionReason = ? WHERE id = ? AND status = 'pending'",
  "UPDATE credits SET accruedInterest = ?, accruedInterestMinor = ?, lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?",
  "UPDATE credits SET accruedInterest = ?, accruedInterestMinor = ?, totalDue = ?, totalDueMinor = ?, dueDate = ?, status = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?",
  "UPDATE credits SET currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?, lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, paidInstallments = ?, status = ?, paidAt = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?",
  "UPDATE credits SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?",
  "UPDATE credits SET deletedAt = NULL, restoredAt = ? WHERE id = ?",
  "UPDATE credits SET lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?",
  "UPDATE credits SET principalAmount = ?, principalAmountMinor = ?, currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?, totalDue = ?, totalDueMinor = ?, reinforcedAmount = COALESCE(reinforcedAmount, 0) + ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?",
  "UPDATE credits SET principalAmountMinor = CAST(ROUND(principalAmount * 100) AS INTEGER), currentBalanceMinor = CAST(ROUND(currentBalance * 100) AS INTEGER), accruedInterestMinor = CAST(ROUND(accruedInterest * 100) AS INTEGER), lateInterestMinor = CAST(ROUND(lateInterest * 100) AS INTEGER), totalDueMinor = CAST(ROUND(totalDue * 100) AS INTEGER) WHERE principalAmountMinor IS NULL OR currentBalanceMinor IS NULL OR totalDueMinor IS NULL",
  "UPDATE credits SET status = 'cancelled' WHERE id = ? AND status = 'pending_approval'",
  "UPDATE credits SET status = 'defaulted', version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?",
  "UPDATE credits SET status = ?, approvedBy = ?, approvalNotes = ?, version = version + 1 WHERE id = ? AND status = 'pending_approval' AND version = ?",
  "UPDATE credits SET status = ?, daysOverdue = ? WHERE id = ? AND status = ? AND deletedAt IS NULL",
  "UPDATE credits SET targetMonthId = ?, version = version + 1 WHERE id = ? AND version = ?",
  "UPDATE credits SET usuario_id = ? WHERE id = ? AND deletedAt IS NULL",
  "UPDATE internal_messages SET read = 1 WHERE id = ?",
  "UPDATE legal_cases SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?",
  "UPDATE legal_cases SET deletedAt = NULL, restoredAt = ? WHERE id = ?",
  "UPDATE limit_escalations SET requiredLevelIndex = ?, requiredLevelId = ?, requiredLevelName = ?, levelSince = ?, escalationCount = escalationCount + 1, lastReminderAt = ? WHERE id = ? AND status = 'pending' AND levelSince = ?",
  "UPDATE limit_escalations SET status = 'approved', decidedAt = ?, decidedBy = ?, decidedByName = ? WHERE id = ? AND status = 'pending'",
  "UPDATE limit_escalations SET status = 'cancelled', decidedAt = ?, decidedBy = ?, decidedByName = ? WHERE entityType = 'credit' AND entityId = ? AND status = 'pending'",
  "UPDATE limit_escalations SET status = 'rejected', decidedAt = ?, decidedBy = ?, decidedByName = ? WHERE id = ? AND status = 'pending'",
  "UPDATE limit_exceptions SET status = 'revoked', decidedBy = COALESCE(decidedBy, ?), decidedByName = COALESCE(decidedByName, ?), decidedAt = COALESCE(decidedAt, ?), decisionReason = ? WHERE id = ? AND status IN ('approved','pending')",
  "UPDATE limit_exceptions SET status = ?, decidedBy = ?, decidedByName = ?, decidedAt = ?, decisionReason = ? WHERE id = ? AND status = 'pending'",
  "UPDATE limit_policy_versions SET status = ?, decidedBy = ?, decidedByName = ?, decidedAt = ?, decisionReason = ? WHERE id = ? AND status = 'pending'",
  "UPDATE message_templates SET content = ? WHERE id = ?",
  "UPDATE message_templates SET content = REPLACE( REPLACE( REPLACE( REPLACE( REPLACE( REPLACE( REPLACE( REPLACE(content, '{client_name}', '{nome_cliente}'), '{company_name}', '{empresa}' ), '{days_overdue}', '{dias_atraso}' ), '{credit_limit}', '{limite_credito}' ), '{amount}', '{valor}' ), '{due_date}', '{data_vencimento}' ), '{balance}', '{saldo_devedor}' ), '{debt_details}', '{detalhe_dividas}' )",
  "UPDATE notifications SET read = 1 WHERE id = ?",
  "UPDATE notifications SET read = 1 WHERE read = 0",
  "UPDATE password_reset_requests SET status = \"cancelled\" WHERE id = ?",
  "UPDATE password_reset_requests SET status = \"completed\" WHERE id = ?",
  "UPDATE payment_gateways SET name = ?, provider = ?, type = ?, status = ?, environment = ?, apiKey = ?, apiSecret = ?, merchantId = ?, webhookUrl = ?, webhookSecret = ?, transactionFee = ?, feeType = ?, description = ?, config = ?, updatedAt = ? WHERE id = ?",
  "UPDATE payment_import_batches SET rowsCount = ?, totalMinor = ? WHERE id = ?",
  "UPDATE payment_import_batches SET status = 'cancelled', cancelledAt = ?, cancelledBy = ?, cancelReason = ? WHERE id = ? AND status = 'active'",
  "UPDATE payment_references SET proofImage = ?, status = ?, submittedAt = ? WHERE id = ?",
  "UPDATE payment_references SET status = ?, paidAt = ? WHERE id = ?",
  "UPDATE payments SET amountMinor = CAST(ROUND(amount * 100) AS INTEGER), allocatedToPrincipalMinor = CAST(ROUND(allocatedToPrincipal * 100) AS INTEGER), allocatedToInterestMinor = CAST(ROUND(allocatedToInterest * 100) AS INTEGER), allocatedToLateInterestMinor = CAST(ROUND(allocatedToLateInterest * 100) AS INTEGER), idempotencyKey = COALESCE(idempotencyKey, id) WHERE amountMinor IS NULL OR idempotencyKey IS NULL",
  "UPDATE payments SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?",
  "UPDATE payments SET deletedAt = NULL, deletedBy = NULL, restoredAt = ? WHERE id = ? AND deletedAt IS NOT NULL",
  "UPDATE payments SET deletedAt = NULL, restoredAt = ? WHERE id = ?",
  "UPDATE payments SET hasProof = 1 WHERE id = ?",
  "UPDATE payments SET receiptYear = ?, receiptSeq = ? WHERE id = ? AND receiptSeq IS NULL",
  "UPDATE payments SET registeredAt = paymentDate WHERE registeredAt IS NULL",
  "UPDATE payments SET status = 'cancelled', cancelledAt = ?, cancelledBy = ?, cancelReason = ? WHERE id = ? AND status = 'pending' AND deletedAt IS NULL",
  "UPDATE payments SET status = 'cancelled', cancelledAt = ?, cancelledBy = ?, cancelReason = ?, cancelApprovedBy = ?, originalState = ? WHERE id = ? AND deletedAt IS NULL AND status = 'confirmed'",
  "UPDATE payments SET status = 'confirmed', paymentDate = ?, allocatedToPrincipal = ?, allocatedToPrincipalMinor = ?, allocatedToInterest = ?, allocatedToInterestMinor = ?, allocatedToLateInterest = ?, allocatedToLateInterestMinor = ?, receiptYear = ?, receiptSeq = ?, allocationDetail = ?, balanceAfterMinor = ?, validatedAt = ?, validatedBy = ? WHERE id = ? AND status = 'pending' AND deletedAt IS NULL",
  "UPDATE report_schedules SET lastRunMonth = ?, lastRunAt = ?, lastError = ? WHERE id = ?",
  "UPDATE simulations SET status = ?, convertedCreditId = ?, updatedAt = ? WHERE id = ?",
  "UPDATE suppliers SET deletedAt = datetime('now'), deletedBy = ? WHERE id = ?",
  "UPDATE sync_conflicts SET status = 'accepted', resolutionNote = ?, resolvedAt = ? WHERE id = ? AND status = 'pending'",
  "UPDATE sync_conflicts SET status = ?, resolutionNote = ?, resolvedBy = ?, resolvedAt = ? WHERE id = ? AND status = 'pending'",
  "UPDATE user_limits SET maxTransaction = ?, dailyLimit = ?, monthlyLimit = ?, restrictionsEnabled = ?, updatedAt = ? WHERE role = ?",
  "UPDATE users SET failedAttempts = 0, blockedAt = NULL WHERE id = ?",
  "UPDATE users SET failedAttempts = ?, ip = ? WHERE id = ?",
  "UPDATE users SET failedAttempts = ?, status = ?, blockedAt = ?, ip = ? WHERE id = ?",
  "UPDATE users SET lastLogin = ?, lastSeen = ?, status = ?, ip = ? WHERE id = ?",
  "UPDATE users SET lastSeen = ?, status = \"active\", ip = COALESCE(NULLIF(ip, \"\"), ?) WHERE id = ?",
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
    "e3b25cc3c53a16bd7171d671a0bfd499148b7251f1be9f4f03493554a4b64ed7",
    "CREATE INDEX IF NOT EXISTS idx_accounting_audit_runs_finished ON accounting_audit_runs(finishedAt)"
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
    "371f56a396feb6808c6680afabd1a90c6fb1f7d9fe30c10b120d590abef2b3a9",
    "CREATE INDEX IF NOT EXISTS idx_audit_alerts_status ON audit_alerts(status, occurredAt)"
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
    "c35e969f84cfd277d4b4d185a8100ad4d2a1ac6a820b3a34d736a95fef8925fc",
    "CREATE INDEX IF NOT EXISTS idx_collection_credit ON collection_events(creditId, createdAt)"
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
    "1061c470f623762da51d69555b1bc5f314ad4487521c7fc414f2f01704385cfb",
    "CREATE INDEX IF NOT EXISTS idx_credit_approvals_creditId ON credit_approvals(creditId)"
  ],
  [
    "e38921b4647351f00d6a77a4e8f2cdfd47808bc1271c96797b225eaedd16a6f0",
    "CREATE INDEX IF NOT EXISTS idx_credit_approvals_decidedAt ON credit_approvals(decidedAt)"
  ],
  [
    "2249dda7b48c2784529d4f206e04bf8ce0a77a0b8099f2a7c7856cc4f84963df",
    "CREATE INDEX IF NOT EXISTS idx_credit_documents_credit ON credit_documents(creditId)"
  ],
  [
    "2bbc6ebd4e6ec4f0ae4998607f449d7cc3ae7df164952b3f8d38c63746f3e2db",
    "CREATE INDEX IF NOT EXISTS idx_credit_installments_due ON credit_installments(creditId, status, dueDate)"
  ],
  [
    "edadd213697d0b2f5c777d3cbf253e6f403e3c4d592e763cbc6589f8008065b5",
    "CREATE INDEX IF NOT EXISTS idx_credit_restructurings_credit ON credit_restructurings(creditId, requestedAt)"
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
    "97146808cf18c2e3ca85f1a61d02024701ea66afa5d7fbc7947da6c9271518d8",
    "CREATE INDEX IF NOT EXISTS idx_limit_escalations_entity ON limit_escalations(entityType, entityId, status)"
  ],
  [
    "72ba517e878581ce699a8683d3ce2919c2be9c21e9d91af7a7e5837e96f85b2a",
    "CREATE INDEX IF NOT EXISTS idx_limit_ledger_month ON limit_ledger(operationType, monthKey)"
  ],
  [
    "85c9d7bda561a8084be1897d1f9f15efd1eee5133d66eefd507659880cfb5123",
    "CREATE INDEX IF NOT EXISTS idx_limit_ledger_user ON limit_ledger(operationType, userId, dayKey)"
  ],
  [
    "19fb946e3f1468f210718acb8339fd44a41af4cca4d463cfe8e9cc6a1644a75a",
    "CREATE INDEX IF NOT EXISTS idx_limit_versions_status ON limit_policy_versions(status, effectiveFrom)"
  ],
  [
    "1afbae6033ec325a016f6654f3019ca6c7e7e1c25f5227c9abd6ea0ac376a20e",
    "CREATE INDEX IF NOT EXISTS idx_payments_batch ON payments(batchId)"
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
    "a02434a76e5a05ff3409d74718073abbaf20bd27aee2333bb865bbf7e3f1c46c",
    "CREATE INDEX IF NOT EXISTS idx_report_history_generatedAt ON report_history(generatedAt)"
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
    "d9f456a068be8d9cadee802547bfe53a8490bb5f22bcf98177b0a62c704841b6",
    "CREATE TABLE IF NOT EXISTS accounting_audit_runs ( id TEXT PRIMARY KEY, kind TEXT NOT NULL, startedAt TEXT NOT NULL, finishedAt TEXT NOT NULL, userId TEXT, userName TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('ok','warning','critical')), criticalCount INTEGER NOT NULL DEFAULT 0, highCount INTEGER NOT NULL DEFAULT 0, mediumCount INTEGER NOT NULL DEFAULT 0, lowCount INTEGER NOT NULL DEFAULT 0, headEntryId TEXT, headHash TEXT, sealStatus TEXT, summary TEXT, findings TEXT )"
  ],
  [
    "8e065b95a5ee5657ee8838f096ed7c2591ab98947d8affd7d774712f40f30f33",
    "CREATE TABLE IF NOT EXISTS accounting_bank_imports (id TEXT PRIMARY KEY, fileName TEXT NOT NULL, movements TEXT NOT NULL, actorId TEXT NOT NULL, actorName TEXT NOT NULL, importedAt TEXT NOT NULL)"
  ],
  [
    "cd6fc7613a8cbbbdd5c91d288e14af1c56784174cc16df4c814b95a6809c6147",
    "CREATE TABLE IF NOT EXISTS accounting_cash_sessions ( id TEXT PRIMARY KEY, operatorId TEXT NOT NULL, operatorName TEXT NOT NULL, sessionDate TEXT NOT NULL, openedAt TEXT NOT NULL, closedAt TEXT, openingMinor INTEGER NOT NULL CHECK(openingMinor >= 0), expectedMinor INTEGER, countedMinor INTEGER, reason TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')), UNIQUE(operatorId, sessionDate), CHECK(status = 'open' OR (expectedMinor IS NOT NULL AND countedMinor IS NOT NULL AND countedMinor >= 0 AND (expectedMinor = countedMinor OR length(trim(reason)) >= 10))) )"
  ],
  [
    "f6e91a51e52b0c1a5c23af46750b1473f922b2b61b6bbc3c3bb4b58514bbff26",
    "CREATE TABLE IF NOT EXISTS accounting_daily_closes ( day TEXT PRIMARY KEY, headEntryId TEXT, headHash TEXT, entryCount INTEGER NOT NULL, debitMinor INTEGER NOT NULL, creditMinor INTEGER NOT NULL, liquidMinor INTEGER NOT NULL, portfolioMinor INTEGER NOT NULL, auditRunId TEXT, sealStatus TEXT, closedAt TEXT NOT NULL, closedBy TEXT NOT NULL, closedById TEXT )"
  ],
  [
    "cbbfdb30f29962b50356eced6435219dc253b375888e9c1eaf6138a7cf14844c",
    "CREATE TABLE IF NOT EXISTS accounting_divergence_events ( id TEXT PRIMARY KEY, issueKey TEXT NOT NULL, previousId TEXT NOT NULL DEFAULT '', source TEXT NOT NULL, description TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','justified','resolved')), reason TEXT NOT NULL CHECK(length(trim(reason)) >= 10), actorId TEXT NOT NULL, actorName TEXT NOT NULL, createdAt TEXT NOT NULL, UNIQUE(issueKey, previousId) )"
  ],
  [
    "fba4675f0985e1cb5a454ef286147a6885b0b0cce3c6d9ea32fa8336a5359d35",
    "CREATE TABLE IF NOT EXISTS accounting_entries ( id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, type TEXT NOT NULL, description TEXT, clientId TEXT, creditId TEXT, paymentId TEXT, debit TEXT NOT NULL, credit TEXT NOT NULL, amountPrincipal REAL DEFAULT 0, amountInterest REAL DEFAULT 0, amountLateInterest REAL DEFAULT 0, amountTotal REAL NOT NULL, amountPrincipalMinor INTEGER, amountInterestMinor INTEGER, amountLateInterestMinor INTEGER, amountTotalMinor INTEGER, processedBy TEXT NOT NULL, justification TEXT, integrityHash TEXT, previousHash TEXT, hashVersion INTEGER DEFAULT 1, usuario_id TEXT, FOREIGN KEY(clientId) REFERENCES clients(id) )"
  ],
  [
    "dcc083e1b1138fa252ddce7c9bda5749dea37f8a267a123d46a9382a42bce9b3",
    "CREATE TABLE IF NOT EXISTS accounting_entry_seals ( seq INTEGER PRIMARY KEY AUTOINCREMENT, entryId TEXT NOT NULL UNIQUE, hmac TEXT NOT NULL, previousHmac TEXT NOT NULL, origin TEXT NOT NULL CHECK(origin IN ('local','remote','legacy','review')), sealedAt TEXT NOT NULL )"
  ],
  [
    "642b31e5cecd49627ad4b402e4c1fa6de6b347956c37fce7c0b88ea77224991c",
    "CREATE TABLE IF NOT EXISTS accounting_receipts (id TEXT PRIMARY KEY, entryId TEXT NOT NULL UNIQUE, fileName TEXT NOT NULL, mime TEXT NOT NULL, data TEXT NOT NULL, digest TEXT NOT NULL, createdAt TEXT NOT NULL)"
  ],
  [
    "cc8a82fbeae16a23744cbb11be4793442a71a13c1051dd3229bd3265ed82745d",
    "CREATE TABLE IF NOT EXISTS accounting_requests ( id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('reversal','writeoff')), targetId TEXT NOT NULL, amountMinor INTEGER, description TEXT, reason TEXT NOT NULL CHECK(length(trim(reason)) >= 10), requestedBy TEXT NOT NULL, requestedById TEXT NOT NULL, requestedAt TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), decidedBy TEXT, decidedById TEXT, decidedAt TEXT, decisionReason TEXT, resultEntryId TEXT )"
  ],
  [
    "3fb195bb4ebf078c7c1186d149f4d16ac333efe73730588d4aea3d9307ac47b2",
    "CREATE TABLE IF NOT EXISTS audit_alert_comments ( id TEXT PRIMARY KEY, alertId TEXT NOT NULL, userId TEXT, userName TEXT NOT NULL, status TEXT, comment TEXT NOT NULL, createdAt TEXT NOT NULL )"
  ],
  [
    "25253bfd339165bd90845ca3088177317c45ca4d61eb1094e7c4808e3ce812e1",
    "CREATE TABLE IF NOT EXISTS audit_alerts ( id TEXT PRIMARY KEY, alertKey TEXT NOT NULL UNIQUE, ruleId TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL, description TEXT, eventIds TEXT, originUserId TEXT, originUserName TEXT, occurredAt TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_review','justified','false_positive','resolved')), assignedTo TEXT, assignedToName TEXT, dueAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT, closedBy TEXT, closedByName TEXT, closedAt TEXT )"
  ],
  [
    "7200494c19609c94450d4870951b0f6b137b0ede1ac39dbeed6bb156862999ca",
    "CREATE TABLE IF NOT EXISTS audit_daily_closes ( day TEXT PRIMARY KEY, lastAuditId TEXT, headHash TEXT, eventCount INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('ok','broken')), brokenSeq INTEGER, verifiedAt TEXT NOT NULL, verifiedBy TEXT )"
  ],
  [
    "915e04ef9a197119c43594217c6cb4429a42b4e6c69d5df93dca24340e3efea8",
    "CREATE TABLE IF NOT EXISTS audit_log_chain (seq INTEGER PRIMARY KEY AUTOINCREMENT, auditId TEXT NOT NULL UNIQUE, previousHash TEXT NOT NULL, integrityHash TEXT NOT NULL, origin TEXT NOT NULL CHECK(origin IN ('live','legacy')))"
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
    "6cea738d3e8d18cdd5d290d69e49d13cafcb966efe67a65a49a23109d8c226dd",
    "CREATE TABLE IF NOT EXISTS clients ( id TEXT PRIMARY KEY, name TEXT NOT NULL, nif TEXT, phone TEXT, email TEXT, address TEXT, birthDate TEXT, age INTEGER, issueDate TEXT, expiryDate TEXT, gender TEXT, maritalStatus TEXT, fatherName TEXT, motherName TEXT, workInstitution TEXT, socialSecurityNumber TEXT, creditLimit REAL DEFAULT 0, usedCredit REAL DEFAULT 0, availableCredit REAL DEFAULT 0, monthlyIncome REAL DEFAULT 0, defaultInterestRate REAL DEFAULT 0, lateInterestRate REAL DEFAULT 0, toleranceDays INTEGER DEFAULT 0, status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'blocked')), riskLevel TEXT DEFAULT 'medium' CHECK(riskLevel IN ('low', 'medium', 'high')), whatsappVerified INTEGER DEFAULT 0, documents TEXT, bankCoordinates TEXT, receiveMethod TEXT DEFAULT 'transfer', lastContacted TEXT, createdAt TEXT NOT NULL, updatedAt TEXT, notes TEXT, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT, spouseName TEXT, spouseBi TEXT, spouseNif TEXT, spousePhone TEXT, spouseEmail TEXT, legalRepresentative TEXT, legalRepRole TEXT )"
  ],
  [
    "e8f579d0595debb4ef76ec98c407eccb4609897a3aefa6deb24943df1ebd1f07",
    "CREATE TABLE IF NOT EXISTS closed_months ( id TEXT PRIMARY KEY, month INTEGER NOT NULL, year INTEGER NOT NULL, capitalApplied REAL NOT NULL, projectedProfit REAL NOT NULL, realizedProfit REAL NOT NULL, overdueAmount REAL NOT NULL, liquidationRate REAL NOT NULL, closedAt TEXT NOT NULL, closedBy TEXT NOT NULL )"
  ],
  [
    "bdbfbfa7c8e4ffb188d192e0ed1388de26636610e7245cc2b01280003985717a",
    "CREATE TABLE IF NOT EXISTS collection_events ( id TEXT PRIMARY KEY, creditId TEXT, kind TEXT NOT NULL CHECK(kind IN ('contact','promise','promise_kept','promise_broken','assignment','target')), agentId TEXT, agentName TEXT, monthKey TEXT, amountMinor INTEGER CHECK(amountMinor IS NULL OR (typeof(amountMinor) = 'integer' AND amountMinor >= 0)), promisedDate TEXT, relatedId TEXT, notes TEXT NOT NULL CHECK(length(trim(notes)) >= 5), actorId TEXT NOT NULL, actorName TEXT NOT NULL, createdAt TEXT NOT NULL, CHECK((kind NOT IN ('contact','promise','promise_kept','promise_broken','assignment')) OR creditId IS NOT NULL), CHECK(kind <> 'promise' OR (amountMinor > 0 AND promisedDate IS NOT NULL)), CHECK(kind <> 'target' OR (agentId IS NOT NULL AND monthKey IS NOT NULL AND amountMinor IS NOT NULL)), CHECK(kind <> 'assignment' OR agentId IS NOT NULL), CHECK(kind NOT IN ('promise_kept','promise_broken') OR relatedId IS NOT NULL) )"
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
    "770aeb26bfba8ef483876bc7b4d019fcb67a66f02cd8f547b7a0563a797ef7e0",
    "CREATE TABLE IF NOT EXISTS credit_approvals (id TEXT PRIMARY KEY, creditId TEXT NOT NULL, clientId TEXT, clientName TEXT, principalAmount REAL, interestRate REAL, installments INTEGER, decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')), reason TEXT, requestedBy TEXT, requestedAt TEXT, decidedBy TEXT NOT NULL, decidedById TEXT, decidedAt TEXT NOT NULL)"
  ],
  [
    "7bdabfa7383ebd762d7d579a57da96aa2173eb294c28573229a79f6fb43dca8c",
    "CREATE TABLE IF NOT EXISTS credit_documents ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, kind TEXT NOT NULL, fileName TEXT NOT NULL, mimeType TEXT NOT NULL, dataUrl TEXT NOT NULL, uploadedAt TEXT NOT NULL, uploadedBy TEXT, uploadedByName TEXT, deletedAt TEXT, deletedBy TEXT )"
  ],
  [
    "390527bb5292a95383dac2ddac301dd6f3da45306f7b3fbdc0a673bbb0363090",
    "CREATE TABLE IF NOT EXISTS credit_import_batches ( id TEXT PRIMARY KEY, number TEXT NOT NULL, fileName TEXT, createdAt TEXT NOT NULL, createdBy TEXT NOT NULL, createdById TEXT, rowsCount INTEGER NOT NULL DEFAULT 0, totalMinor INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')), cancelledAt TEXT, cancelledBy TEXT, cancelReason TEXT )"
  ],
  [
    "e3ebe20568cddaa2487423e860484f326442967eff1bc3ef348d14ba39dc6f4a",
    "CREATE TABLE IF NOT EXISTS credit_import_items ( batchId TEXT NOT NULL, creditId TEXT NOT NULL, PRIMARY KEY(batchId, creditId) )"
  ],
  [
    "8c08344cc6cde3ff2f4f340a5e20147b8ec5efb9f1d9daff49a3a76fcf9c1e32",
    "CREATE TABLE IF NOT EXISTS credit_installments ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, installmentNumber INTEGER NOT NULL CHECK(installmentNumber > 0), dueDate TEXT NOT NULL, principalMinor INTEGER NOT NULL CHECK(principalMinor >= 0), interestMinor INTEGER NOT NULL CHECK(interestMinor >= 0), lateInterestMinor INTEGER NOT NULL DEFAULT 0 CHECK(lateInterestMinor >= 0), paidPrincipalMinor INTEGER NOT NULL DEFAULT 0 CHECK(paidPrincipalMinor >= 0), paidInterestMinor INTEGER NOT NULL DEFAULT 0 CHECK(paidInterestMinor >= 0), paidLateInterestMinor INTEGER NOT NULL DEFAULT 0 CHECK(paidLateInterestMinor >= 0), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partial','paid','overdue','cancelled')), paidAt TEXT, version INTEGER NOT NULL DEFAULT 0, UNIQUE(creditId, installmentNumber), FOREIGN KEY(creditId) REFERENCES credits(id) ON DELETE RESTRICT )"
  ],
  [
    "137f314d92ebe1020c108b5ee956021ccefe9f8530d4d067d31b0100e01d81e3",
    "CREATE TABLE IF NOT EXISTS credit_manager_transfers ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, fromUserId TEXT, toUserId TEXT NOT NULL, toUserName TEXT, reason TEXT NOT NULL, actorId TEXT NOT NULL, actorName TEXT NOT NULL, createdAt TEXT NOT NULL )"
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
    "538391deb0adc90b42af95a21bb3a24a0ea1ae485c0835163d5c8c446e5b40f3",
    "CREATE TABLE IF NOT EXISTS credit_restructurings ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('restructure','early_settlement')), mode TEXT, reason TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')), originalPlan TEXT NOT NULL, newPlan TEXT NOT NULL, params TEXT, payNowMinor INTEGER, requestedBy TEXT NOT NULL, requestedByName TEXT NOT NULL, requestedAt TEXT NOT NULL, decidedBy TEXT, decidedByName TEXT, decidedAt TEXT, decisionReason TEXT )"
  ],
  [
    "2bc2de045392367e0d1c88214291acfff3feae2dca9340f295272763c93c280f",
    "CREATE TABLE IF NOT EXISTS credit_writeoffs ( id TEXT PRIMARY KEY, creditId TEXT NOT NULL UNIQUE, principalMinor INTEGER NOT NULL CHECK(principalMinor >= 0), interestMinor INTEGER NOT NULL DEFAULT 0 CHECK(interestMinor >= 0), provisionUsedMinor INTEGER NOT NULL DEFAULT 0 CHECK(provisionUsedMinor >= 0), lossMinor INTEGER NOT NULL DEFAULT 0 CHECK(lossMinor >= 0), reason TEXT NOT NULL CHECK(length(trim(reason)) >= 10), requestedBy TEXT NOT NULL, requestedById TEXT NOT NULL, approvedBy TEXT NOT NULL, approvedById TEXT NOT NULL, entryId TEXT NOT NULL, createdAt TEXT NOT NULL, CHECK(requestedById <> approvedById) )"
  ],
  [
    "ea1217863348361b78d2b40d925f555e8a3bd12e843254fd4175c890df829e2e",
    "CREATE TABLE IF NOT EXISTS credits ( id TEXT PRIMARY KEY, clientId TEXT NOT NULL, clientName TEXT NOT NULL, principalAmount REAL NOT NULL, principalAmountMinor INTEGER, interestRate REAL NOT NULL, lateInterestRate REAL NOT NULL, installments INTEGER NOT NULL, paidInstallments INTEGER DEFAULT 0, currentBalance REAL NOT NULL, currentBalanceMinor INTEGER, startDate TEXT, accruedInterest REAL DEFAULT 0, accruedInterestMinor INTEGER, lateInterest REAL DEFAULT 0, lateInterestMinor INTEGER, totalDue REAL NOT NULL, totalDueMinor INTEGER, version INTEGER NOT NULL DEFAULT 0, dueDate TEXT NOT NULL, daysOverdue INTEGER DEFAULT 0, status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paid', 'overdue', 'defaulted', 'cancelled', 'renegotiated', 'pending_approval', 'rejected')), creditNumber INTEGER DEFAULT 1, paidAt TEXT, createdAt TEXT NOT NULL, deletedAt TEXT, deletedBy TEXT, restoredAt TEXT, originalState TEXT, usuario_id TEXT, targetMonthId TEXT, productId TEXT, FOREIGN KEY(clientId) REFERENCES clients(id) ON DELETE RESTRICT )"
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
    "53f6edb7f1c885bb3e3c1b3b3b56b9f0c17b7dfdf6161bdf7ad241da41db8d42",
    "CREATE TABLE IF NOT EXISTS limit_escalation_approvals ( id TEXT PRIMARY KEY, escalationId TEXT NOT NULL, approverId TEXT NOT NULL, approverName TEXT NOT NULL, approverRole TEXT, decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')), notes TEXT, decidedAt TEXT NOT NULL, UNIQUE(escalationId, approverId) )"
  ],
  [
    "a8d56f3147da1315494f59574c0e1577e5caad993a91cd552a29a53b581b2cab",
    "CREATE TABLE IF NOT EXISTS limit_escalations ( id TEXT PRIMARY KEY, operationType TEXT NOT NULL, entityType TEXT NOT NULL, entityId TEXT NOT NULL, amountMinor INTEGER NOT NULL, requestedById TEXT, requestedByName TEXT, requestedRole TEXT, reason TEXT NOT NULL, details TEXT, requiredLevelId TEXT NOT NULL, requiredLevelIndex INTEGER NOT NULL, requiredLevelName TEXT NOT NULL, dual INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')), createdAt TEXT NOT NULL, levelSince TEXT NOT NULL, escalationCount INTEGER NOT NULL DEFAULT 0, lastReminderAt TEXT, decidedAt TEXT, decidedBy TEXT, decidedByName TEXT )"
  ],
  [
    "982f83bd521b9424471348461072ab09baa4b37a8afca1bf81a9f22dfbd5b1af",
    "CREATE TABLE IF NOT EXISTS limit_exceptions ( id TEXT PRIMARY KEY, userId TEXT NOT NULL, userName TEXT NOT NULL, operationType TEXT NOT NULL, perOperationMinor INTEGER, dailyMinor INTEGER, monthlyMinor INTEGER, dailyCount INTEGER, startsAt TEXT NOT NULL, endsAt TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','revoked')), requestedBy TEXT NOT NULL, requestedByName TEXT NOT NULL, requestedAt TEXT NOT NULL, decidedBy TEXT, decidedByName TEXT, decidedAt TEXT, decisionReason TEXT, expiryNotifiedAt TEXT )"
  ],
  [
    "b0c88b99c6f86b60447e2e921219415f3e9a0b728b30fcb40d29360ed754135a",
    "CREATE TABLE IF NOT EXISTS limit_ledger ( id TEXT PRIMARY KEY, operationType TEXT NOT NULL, userId TEXT NOT NULL, userName TEXT, profileId TEXT, branchId TEXT DEFAULT '', amountMinor INTEGER NOT NULL DEFAULT 0, count INTEGER NOT NULL DEFAULT 1, dayKey TEXT NOT NULL, monthKey TEXT NOT NULL, entityType TEXT, entityId TEXT, createdAt TEXT NOT NULL )"
  ],
  [
    "66d2506ea343cf91fcaa812992c9f048a477031c23c6b13738b9a62cdd8ddb75",
    "CREATE TABLE IF NOT EXISTS limit_locks ( id TEXT PRIMARY KEY, ledgerId TEXT NOT NULL, scope TEXT NOT NULL, scopeId TEXT NOT NULL, period TEXT NOT NULL, periodKey TEXT NOT NULL, createdAt TEXT NOT NULL )"
  ],
  [
    "3082194ebe47894c5ba4f9de527a730cdcfa31eaf32721464500336fa7c48acf",
    "CREATE TABLE IF NOT EXISTS limit_policy_versions ( id TEXT PRIMARY KEY, version INTEGER NOT NULL, policy TEXT NOT NULL, summary TEXT, reason TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','cancelled')), effectiveFrom TEXT NOT NULL, requiresSecondApproval INTEGER NOT NULL DEFAULT 0, secondApprovalReasons TEXT, createdBy TEXT NOT NULL, createdByName TEXT NOT NULL, createdAt TEXT NOT NULL, decidedBy TEXT, decidedByName TEXT, decidedAt TEXT, decisionReason TEXT, restoredFrom TEXT )"
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
    "5108ebdcc23e5a5449650abb9a2bfbacf8af13d2e1f0c87c4c1b62c30033e382",
    "CREATE TABLE IF NOT EXISTS payment_import_batches ( id TEXT PRIMARY KEY, number TEXT NOT NULL, fileName TEXT, createdAt TEXT NOT NULL, createdBy TEXT NOT NULL, createdById TEXT, rowsCount INTEGER NOT NULL DEFAULT 0, totalMinor INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'cancelled')), cancelledAt TEXT, cancelledBy TEXT, cancelReason TEXT )"
  ],
  [
    "c51216e7f4c6f41bfeabd14e2d591cd309fc17964dce3e0801e770dedad4dedb",
    "CREATE TABLE IF NOT EXISTS payment_proofs ( paymentId TEXT PRIMARY KEY, fileName TEXT NOT NULL, mimeType TEXT NOT NULL, dataUrl TEXT NOT NULL, uploadedAt TEXT NOT NULL, uploadedBy TEXT )"
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
    "1a34788bb53f152ff0131ce3f2ad90e4bb747b445154387317f82ac9bf3e1849",
    "CREATE TABLE IF NOT EXISTS report_history ( id TEXT PRIMARY KEY, reportType TEXT NOT NULL, title TEXT NOT NULL, format TEXT NOT NULL CHECK(format IN ('pdf', 'xlsx')), filters TEXT, fileName TEXT NOT NULL, fileData TEXT, generatedAt TEXT NOT NULL, generatedBy TEXT NOT NULL, generatedById TEXT )"
  ],
  [
    "e0e0f3d88e357df8f22975d47255192263b892c9f1b5456eacde2b9fe83be7ad",
    "CREATE TABLE IF NOT EXISTS report_schedules ( id TEXT PRIMARY KEY, reportType TEXT NOT NULL, recipients TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, lastRunMonth TEXT, lastRunAt TEXT, lastError TEXT, createdAt TEXT NOT NULL, createdBy TEXT )"
  ],
  [
    "ffe8b85a1bc705f71927a344605fdd12cb57cded74e477fdf8e4840468405c78",
    "CREATE TABLE IF NOT EXISTS schema_migrations ( version INTEGER PRIMARY KEY, name TEXT NOT NULL, appliedAt TEXT NOT NULL )"
  ],
  [
    "791a7226f6c15e2c08a5176b81770abfd405905fa87022952796b4b1b8bada85",
    "CREATE TABLE IF NOT EXISTS shared_settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL, updatedBy TEXT )"
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
    "815c67b228927bae516cea2d35c32871351e606acdbdfac23ba883605792adc8",
    "CREATE TABLE IF NOT EXISTS users ( id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL, avatar TEXT, createdAt TEXT NOT NULL, lastLogin TEXT, lastSeen TEXT, permissions TEXT, status TEXT DEFAULT 'active', ip TEXT, signature TEXT )"
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
    "eb769e4b5b3628a073d0a35ae790449a2cb5638e774028be4b6f7e7e85b6e08d",
    "CREATE TRIGGER IF NOT EXISTS trg_accounting_audit_runs_immutable_delete BEFORE DELETE ON accounting_audit_runs BEGIN SELECT RAISE(ABORT, 'O histórico de auditorias é imutável')"
  ],
  [
    "acb7a9da4b60852c3079c717cf02573f91ec635d25437c2bac84d742d36cf7a3",
    "CREATE TRIGGER IF NOT EXISTS trg_accounting_audit_runs_immutable_update BEFORE UPDATE ON accounting_audit_runs BEGIN SELECT RAISE(ABORT, 'O histórico de auditorias é imutável')"
  ],
  [
    "b6df90ca87031a2803a33cfdd969cb06d81f4e4ca69aacf0f8ca408559b1fe43",
    "CREATE TRIGGER IF NOT EXISTS trg_accounting_closed_period BEFORE INSERT ON accounting_entries WHEN EXISTS (SELECT 1 FROM closed_months WHERE id = substr(NEW.timestamp, 1, 7)) BEGIN SELECT RAISE(ABORT, 'Período contabilístico fechado. Reabra-o com autorização e justificação.')"
  ],
  [
    "87c9807850fd739106f771d516096e7ec8df4c42535b810503b7a64091de8f41",
    "CREATE TRIGGER IF NOT EXISTS trg_accounting_daily_closes_immutable_delete BEFORE DELETE ON accounting_daily_closes BEGIN SELECT RAISE(ABORT, 'Os fechos diários são imutáveis')"
  ],
  [
    "18096b5c1770a5f3359f4da1854f0b989d4eb0da9607c9bf10bc2bd039d5f6eb",
    "CREATE TRIGGER IF NOT EXISTS trg_accounting_daily_closes_immutable_update BEFORE UPDATE ON accounting_daily_closes BEGIN SELECT RAISE(ABORT, 'Os fechos diários são imutáveis')"
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
    "1b608049247978e2dbe06f7477ba9e50083eeaf30f9d752889cb6bb099014f2a",
    "CREATE TRIGGER IF NOT EXISTS trg_accounting_entry_seals_delete BEFORE DELETE ON accounting_entry_seals BEGIN SELECT RAISE(ABORT, 'Os selos contabilísticos são imutáveis')"
  ],
  [
    "8e67cccbc7a61efa19973e14b617de92834081aa99051308724123356a4b458c",
    "CREATE TRIGGER IF NOT EXISTS trg_accounting_entry_seals_update BEFORE UPDATE ON accounting_entry_seals BEGIN SELECT RAISE(ABORT, 'Os selos contabilísticos são imutáveis')"
  ],
  [
    "f6cee5cfe401c1578f42e7a1a7b36b8c007fabc30a99b96f077ca12d6720af94",
    "CREATE TRIGGER IF NOT EXISTS trg_accounting_requests_decided BEFORE UPDATE ON accounting_requests WHEN OLD.status <> 'pending' BEGIN SELECT RAISE(ABORT, 'Pedido já decidido: não pode ser alterado')"
  ],
  [
    "68e201de569ad2ed75f127e3a9797c5ba5dab2445b5ac2060161c814eacf14a6",
    "CREATE TRIGGER IF NOT EXISTS trg_accounting_requests_delete BEFORE DELETE ON accounting_requests BEGIN SELECT RAISE(ABORT, 'O histórico de pedidos é imutável')"
  ],
  [
    "2eb9c8ad0cfa7ae8bc1e1f9f42ea45c1879e50f20f6669ecee31638247597dad",
    "CREATE TRIGGER IF NOT EXISTS trg_accounting_requests_segregation BEFORE UPDATE ON accounting_requests WHEN NEW.decidedById IS NOT NULL AND NEW.decidedById = OLD.requestedById BEGIN SELECT RAISE(ABORT, 'O pedido tem de ser decidido por outro administrador')"
  ],
  [
    "950dbab48a1c5ad96ea59f8a7442b9d2461458f3c5b66d245eb6ab42fa5dd002",
    "CREATE TRIGGER IF NOT EXISTS trg_audit_alert_comments_delete BEFORE DELETE ON audit_alert_comments BEGIN SELECT RAISE(ABORT, 'Os comentários dos alertas são imutáveis')"
  ],
  [
    "9ae0e50d6b6fa3d352b95f4baeb3d45aedabe24daf55abe8a778e2fe69a00eca",
    "CREATE TRIGGER IF NOT EXISTS trg_audit_alert_comments_update BEFORE UPDATE ON audit_alert_comments BEGIN SELECT RAISE(ABORT, 'Os comentários dos alertas são imutáveis')"
  ],
  [
    "10b74138803ba4756394898e181521ad35f57d4247bf4890d13c3f770b49b9da",
    "CREATE TRIGGER IF NOT EXISTS trg_audit_alerts_delete BEFORE DELETE ON audit_alerts BEGIN SELECT RAISE(ABORT, 'Os alertas de auditoria não podem ser apagados')"
  ],
  [
    "31ddb2b7f180689da6b4bb583f82a3d7820d96080ea5274f6db32daef2d87e21",
    "CREATE TRIGGER IF NOT EXISTS trg_audit_alerts_self_close BEFORE UPDATE ON audit_alerts WHEN NEW.status IN ('justified','false_positive','resolved') AND NEW.closedBy IS NOT NULL AND NEW.closedBy = OLD.originUserId BEGIN SELECT RAISE(ABORT, 'Quem originou o alerta não o pode fechar')"
  ],
  [
    "16647ffe4552119fe6921658f914a1eb85fac485b82911b8d1cba1b1aaee45a9",
    "CREATE TRIGGER IF NOT EXISTS trg_audit_chain_delete BEFORE DELETE ON audit_log_chain BEGIN SELECT RAISE(ABORT,'A cadeia de auditoria é imutável')"
  ],
  [
    "c0caf694d29f0c2400f11d7146ee96ffc7ccd1030eb9627043b6bcc22b59f364",
    "CREATE TRIGGER IF NOT EXISTS trg_audit_chain_insert AFTER INSERT ON audit_logs BEGIN INSERT INTO audit_log_chain (auditId, previousHash, integrityHash, origin) VALUES (NEW.id, COALESCE((SELECT integrityHash FROM audit_log_chain ORDER BY seq DESC LIMIT 1), '0000000000000000000000000000000000000000000000000000000000000000'), tango_audit_hash(NEW.id,NEW.timestamp,NEW.userId,NEW.userName,NEW.action,NEW.entity,NEW.details,NEW.previousState,NEW.newState,NEW.metadata, COALESCE((SELECT integrityHash FROM audit_log_chain ORDER BY seq DESC LIMIT 1), '0000000000000000000000000000000000000000000000000000000000000000')),'live')"
  ],
  [
    "91ebf5470ad78ffbe83a7a3d1065b17aa352665fb7a55a66f861d422c452bf2c",
    "CREATE TRIGGER IF NOT EXISTS trg_audit_chain_update BEFORE UPDATE ON audit_log_chain BEGIN SELECT RAISE(ABORT,'A cadeia de auditoria é imutável')"
  ],
  [
    "ee30028c7283221f997157247a3c3653443ee7243d368bc76d85be94d868f3ce",
    "CREATE TRIGGER IF NOT EXISTS trg_audit_daily_closes_delete BEFORE DELETE ON audit_daily_closes BEGIN SELECT RAISE(ABORT, 'Os fechos diários da auditoria são imutáveis')"
  ],
  [
    "78bbb6af7a3bb75860ef737ef9eeac3ab05eb6da2643c478a8bf86438f3dcea3",
    "CREATE TRIGGER IF NOT EXISTS trg_audit_daily_closes_update BEFORE UPDATE ON audit_daily_closes BEGIN SELECT RAISE(ABORT, 'Os fechos diários da auditoria são imutáveis')"
  ],
  [
    "37dcbfb4f387b22c2d5a00ba10d2833fecb89754a8a722ca170255986f52abd3",
    "CREATE TRIGGER IF NOT EXISTS trg_audit_logs_immutable_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'Os registos de auditoria são imutáveis')"
  ],
  [
    "e7d4e3b804a01f3262838b321a12d0ab6daf4b058d1cfdc031818f5c878359e0",
    "CREATE TRIGGER IF NOT EXISTS trg_audit_logs_immutable_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'Os registos de auditoria são imutáveis')"
  ],
  [
    "adf8eae22807b8c229808b7d44d262602da5969f0b62d3123f2a91d4b2ed39a2",
    "CREATE TRIGGER IF NOT EXISTS trg_bank_import_delete BEFORE DELETE ON accounting_bank_imports BEGIN SELECT RAISE(ABORT, 'O extrato importado é imutável')"
  ],
  [
    "ea386f7ee2fde2324162466f729547192f5da80735740324118b02b2451103bb",
    "CREATE TRIGGER IF NOT EXISTS trg_bank_import_update BEFORE UPDATE ON accounting_bank_imports BEGIN SELECT RAISE(ABORT, 'O extrato importado é imutável')"
  ],
  [
    "2902ce5e73b73947db2b6f9e5c0e907d545857f4e56a72308527733f6c4e815c",
    "CREATE TRIGGER IF NOT EXISTS trg_cash_session_closed_update BEFORE UPDATE ON accounting_cash_sessions WHEN OLD.status = 'closed' BEGIN SELECT RAISE(ABORT, 'Fecho de caixa imutável')"
  ],
  [
    "1f96d776650cf4858485218dda9c47c11d6774938f44a64c4583edf3c70b9ddf",
    "CREATE TRIGGER IF NOT EXISTS trg_cash_session_delete BEFORE DELETE ON accounting_cash_sessions BEGIN SELECT RAISE(ABORT, 'O histórico de caixa é imutável')"
  ],
  [
    "df8fd22f7447a9e673333b4543638285c24e24bc5ac3443938db7fe3e2cf2c57",
    "CREATE TRIGGER IF NOT EXISTS trg_collection_delete BEFORE DELETE ON collection_events BEGIN SELECT RAISE(ABORT, 'O histórico de cobrança é imutável')"
  ],
  [
    "676134166855a8983159bd9ca52f58bd40bf144cff6fad8d3d035eb54dd2f863",
    "CREATE TRIGGER IF NOT EXISTS trg_collection_update BEFORE UPDATE ON collection_events BEGIN SELECT RAISE(ABORT, 'O histórico de cobrança é imutável')"
  ],
  [
    "5b3f2214e4d93976a1fd63e628b80d3c1230f1fa681459808e5bddf35995c372",
    "CREATE TRIGGER IF NOT EXISTS trg_credit_documents_delete BEFORE DELETE ON credit_documents BEGIN SELECT RAISE(ABORT, 'Os documentos do crédito não podem ser apagados (só arquivados)')"
  ],
  [
    "2c1ee71efe46d022ed6d05c5708d6a2ee63d81ee3683c4ffe03bda0fd43817bf",
    "CREATE TRIGGER IF NOT EXISTS trg_credit_manager_transfers_delete BEFORE DELETE ON credit_manager_transfers BEGIN SELECT RAISE(ABORT, 'O histórico de transferências é imutável')"
  ],
  [
    "3a2ec5834690275ed751e4e3eb0ea828cdb124b6c3a787d6b0e1fb5d073a04ff",
    "CREATE TRIGGER IF NOT EXISTS trg_credit_manager_transfers_update BEFORE UPDATE ON credit_manager_transfers BEGIN SELECT RAISE(ABORT, 'O histórico de transferências é imutável')"
  ],
  [
    "d02405a19a8698d968ccece75eda847f300fbec9466ab87aee7f45fd02789264",
    "CREATE TRIGGER IF NOT EXISTS trg_credit_restructurings_delete BEFORE DELETE ON credit_restructurings BEGIN SELECT RAISE(ABORT, 'O histórico de reestruturações não pode ser apagado')"
  ],
  [
    "beae9c33fb29a654d83c7510a36c91bffb60b496317c9e20593198561ce6d31b",
    "CREATE TRIGGER IF NOT EXISTS trg_credit_restructurings_four_eyes BEFORE UPDATE ON credit_restructurings WHEN NEW.status = 'approved' AND OLD.kind = 'restructure' AND (NEW.decidedBy IS NULL OR NEW.decidedBy = OLD.requestedBy) BEGIN SELECT RAISE(ABORT, 'A reestruturação tem de ser aprovada por outra pessoa')"
  ],
  [
    "30567399cd2be3a53b19389876cc73d3b2b98afe6104974d8dcb49bbd682c2dd",
    "CREATE TRIGGER IF NOT EXISTS trg_credit_restructurings_immutable BEFORE UPDATE ON credit_restructurings WHEN OLD.status <> 'pending' OR NEW.originalPlan <> OLD.originalPlan OR NEW.newPlan <> OLD.newPlan OR NEW.creditId <> OLD.creditId BEGIN SELECT RAISE(ABORT, 'Uma reestruturação já decidida não pode ser alterada')"
  ],
  [
    "644c6e40201686e991b0fbbea08c072e021c3459659afc68c6b3d573583a4fa7",
    "CREATE TRIGGER IF NOT EXISTS trg_credit_writeoffs_immutable_delete BEFORE DELETE ON credit_writeoffs BEGIN SELECT RAISE(ABORT, 'Os abates de créditos são imutáveis')"
  ],
  [
    "7ea63e53b926620e4786420ceb6e19f184f17678c0bcb25b8ee50548b15fc61a",
    "CREATE TRIGGER IF NOT EXISTS trg_credit_writeoffs_immutable_update BEFORE UPDATE ON credit_writeoffs BEGIN SELECT RAISE(ABORT, 'Os abates de créditos são imutáveis')"
  ],
  [
    "cd752202ce710fff5ac0ac0e490885492064e74ae5a61db7a816a1780d266c63",
    "CREATE TRIGGER IF NOT EXISTS trg_divergence_immutable_delete BEFORE DELETE ON accounting_divergence_events BEGIN SELECT RAISE(ABORT, 'Decisões de divergências são imutáveis')"
  ],
  [
    "8543aac3ec3557b02bfa7691d38946b3cf6f038aec82144c91353d46b200bff2",
    "CREATE TRIGGER IF NOT EXISTS trg_divergence_immutable_update BEFORE UPDATE ON accounting_divergence_events BEGIN SELECT RAISE(ABORT, 'Decisões de divergências são imutáveis')"
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
    "ef5057c7ffd65291e23f27ec8c0fe0536058b4b9e7c5a72bd248f2a77b71db27",
    "CREATE TRIGGER IF NOT EXISTS trg_limit_escalation_approvals_delete BEFORE DELETE ON limit_escalation_approvals BEGIN SELECT RAISE(ABORT, 'As decisões dos aprovadores são imutáveis')"
  ],
  [
    "c46b0e2aa2488d7bfdfdc25e2bdf103d916e215da5ae4fd68aa58defe4c0c592",
    "CREATE TRIGGER IF NOT EXISTS trg_limit_escalation_approvals_update BEFORE UPDATE ON limit_escalation_approvals BEGIN SELECT RAISE(ABORT, 'As decisões dos aprovadores são imutáveis')"
  ],
  [
    "7bc1f92d86aca95f4bcaa72799c58427b9b00b93a3fbab854acb0d90bb88a3cc",
    "CREATE TRIGGER IF NOT EXISTS trg_limit_escalation_self BEFORE INSERT ON limit_escalation_approvals WHEN NEW.approverId = (SELECT requestedById FROM limit_escalations WHERE id = NEW.escalationId) BEGIN SELECT RAISE(ABORT, 'Quem pediu a operação não a pode aprovar')"
  ],
  [
    "88d6f4d31c00efff0588cdb711f2b732c355046617d6c94b897a808cb93fdc2f",
    "CREATE TRIGGER IF NOT EXISTS trg_limit_escalations_delete BEFORE DELETE ON limit_escalations BEGIN SELECT RAISE(ABORT, 'Os pedidos escalados não podem ser apagados')"
  ],
  [
    "4296862474e2668e025378cf67d54c91c91b365418dab8b8d7b5bd0e05a7c23d",
    "CREATE TRIGGER IF NOT EXISTS trg_limit_exceptions_delete BEFORE DELETE ON limit_exceptions BEGIN SELECT RAISE(ABORT, 'As exceções de limites não podem ser apagadas')"
  ],
  [
    "7588df862f263447245990af5012a3f2c41c034ad87f8ed9279bd406fbc14ba0",
    "CREATE TRIGGER IF NOT EXISTS trg_limit_exceptions_four_eyes BEFORE UPDATE ON limit_exceptions WHEN NEW.status = 'approved' AND OLD.status = 'pending' AND (NEW.decidedBy IS NULL OR NEW.decidedBy = OLD.requestedBy OR NEW.decidedBy = OLD.userId) BEGIN SELECT RAISE(ABORT, 'A exceção tem de ser aprovada por outro administrador')"
  ],
  [
    "0f1bd3358dcd02fcbc6d3ee10b3e9f95d2bd063016e401a0ee8a1deb84306ee9",
    "CREATE TRIGGER IF NOT EXISTS trg_limit_exceptions_immutable BEFORE UPDATE ON limit_exceptions WHEN NEW.userId <> OLD.userId OR NEW.operationType <> OLD.operationType OR NEW.startsAt <> OLD.startsAt OR NEW.endsAt <> OLD.endsAt OR COALESCE(NEW.perOperationMinor, -1) <> COALESCE(OLD.perOperationMinor, -1) OR COALESCE(NEW.dailyMinor, -1) <> COALESCE(OLD.dailyMinor, -1) OR COALESCE(NEW.monthlyMinor, -1) <> COALESCE(OLD.monthlyMinor, -1) OR NEW.reason <> OLD.reason OR (OLD.status IN ('rejected','revoked') AND NEW.status <> OLD.status) BEGIN SELECT RAISE(ABORT, 'Os valores de uma exceção não podem ser alterados')"
  ],
  [
    "0f36e892760a35848fc726b790fbce7ea9b69f4bf315a28ec81df358eb3e24d5",
    "CREATE TRIGGER IF NOT EXISTS trg_limit_ledger_delete BEFORE DELETE ON limit_ledger BEGIN SELECT RAISE(ABORT, 'O registo de consumo dos limites é imutável')"
  ],
  [
    "9a99bd6ee70fdaec50fc2792ab5899b66b6ed5650137d1b8864cbc67d33e3f5a",
    "CREATE TRIGGER IF NOT EXISTS trg_limit_ledger_update BEFORE UPDATE ON limit_ledger BEGIN SELECT RAISE(ABORT, 'O registo de consumo dos limites é imutável')"
  ],
  [
    "ab46bcc5905b591ab23a38d5d02de3bbc7b11bd2abc9e429e5b80a188228abf0",
    "CREATE TRIGGER IF NOT EXISTS trg_limit_versions_delete BEFORE DELETE ON limit_policy_versions BEGIN SELECT RAISE(ABORT, 'As versões dos limites não podem ser apagadas')"
  ],
  [
    "3c77a17f0944c4c952dd53749cf9f39674646616e7fecc572d87f20493964c4f",
    "CREATE TRIGGER IF NOT EXISTS trg_limit_versions_four_eyes BEFORE UPDATE ON limit_policy_versions WHEN NEW.status = 'approved' AND (NEW.decidedBy IS NULL OR NEW.decidedBy = OLD.createdBy) BEGIN SELECT RAISE(ABORT, 'A alteração tem de ser aprovada por um segundo administrador')"
  ],
  [
    "ef39268f4407010814b06e6a920d5dc07bd3c870da7db8ef5c21b44d4fa1a3bf",
    "CREATE TRIGGER IF NOT EXISTS trg_limit_versions_immutable BEFORE UPDATE ON limit_policy_versions WHEN OLD.status <> 'pending' OR NEW.policy <> OLD.policy OR NEW.version <> OLD.version OR NEW.createdBy <> OLD.createdBy OR NEW.effectiveFrom <> OLD.effectiveFrom OR NEW.reason <> OLD.reason OR NEW.requiresSecondApproval <> OLD.requiresSecondApproval BEGIN SELECT RAISE(ABORT, 'Uma versão dos limites já decidida não pode ser alterada')"
  ],
  [
    "864228c4f7ebee39ebe9907cc196a93187c8f2229e01f1fe8f455bf9d689dc22",
    "CREATE TRIGGER IF NOT EXISTS trg_receipt_delete BEFORE DELETE ON accounting_receipts BEGIN SELECT RAISE(ABORT,'O comprovativo contabilístico é imutável')"
  ],
  [
    "9f5145429efcb21c57040aba04eb9296095a21fba7d28b42ce19c9cb70958696",
    "CREATE TRIGGER IF NOT EXISTS trg_receipt_update BEFORE UPDATE ON accounting_receipts BEGIN SELECT RAISE(ABORT,'O comprovativo contabilístico é imutável')"
  ],
  [
    "00c65d93dda94eb83eda257732f00f67282057891b8ebffa72b960efeaabcfa2",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_requests_pending ON accounting_requests(kind, targetId) WHERE status = 'pending'"
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
    "98ef793ae9c9e227203aa1ea7c9b62ba503858622b98230fb7a106c3e90761ab",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_promise_decision ON collection_events(relatedId) WHERE kind IN ('promise_kept','promise_broken')"
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
    "aacd5dba909ecc648fe5c71e66824cf44de5e567d87d971760cb0836a67dda05",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_receipt ON payments(receiptYear, receiptSeq) WHERE receiptSeq IS NOT NULL"
  ],
  [
    "6e24d14ca6dcded02bb514886eb93e9251f6562cedba4dab7e8e339d7f850281",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)"
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
    "470788ce3fc62225bdab6d7295469c5d1ad9b0052e6a4f5511a95b6c790dc892",
    "DELETE FROM report_schedules WHERE id = ?"
  ],
  [
    "14e1c6026d649c5bb9f60be32061a2474a599ca20827c988fff9a9bb6d1f948a",
    "DELETE FROM simulations WHERE id = ?"
  ],
  [
    "2c10a79ffb49e94655e805f2bb8610873474544c4c0f64be0becaefeab20f4ab",
    "DELETE FROM sqlite_sequence WHERE name IN ('clients', 'credits', 'payments', 'contracts', 'notifications', 'chat_messages', 'payment_gateways', 'payment_references')"
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
    "e6446a01c84187f0cd4f5cdde815542b51f8e5b9fde02bff99949aa94292cbe6",
    "INSERT INTO accounting_audit_runs (id, kind, startedAt, finishedAt, userId, userName, status, criticalCount, highCount, mediumCount, lowCount, headEntryId, headHash, sealStatus, summary, findings) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "75d5ba5010e0a0e84a8d8a456a8aa193e08f884fe772592fb02416a1ed8f22e1",
    "INSERT INTO accounting_cash_sessions (id, operatorId, operatorName, sessionDate, openedAt, openingMinor, status) VALUES (?,?,?,?,?,?,?)"
  ],
  [
    "084c7ec283bdb1708378830b309862bf4f484174c7d96ee4c85220493d73ee7b",
    "INSERT INTO accounting_daily_closes (day, headEntryId, headHash, entryCount, debitMinor, creditMinor, liquidMinor, portfolioMinor, auditRunId, sealStatus, closedAt, closedBy, closedById) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "403ffa5960b210b4a4c3ed0ea648b63aa031e550cfb039ad029b6dd3a0be2ed7",
    "INSERT INTO accounting_divergence_events (id, issueKey, previousId, source, description, state, reason, actorId, actorName, createdAt) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ? = COALESCE((SELECT id FROM accounting_divergence_events WHERE issueKey = ? ORDER BY createdAt DESC, rowid DESC LIMIT 1),'')"
  ],
  [
    "84f2cb5ccc7bf692aab97c699abe6de38e3ac6d75af14dfb7a384d106a569f60",
    "INSERT INTO accounting_entries (id, timestamp, type, description, clientId, creditId, paymentId, debit, credit, amountPrincipal, amountInterest, amountLateInterest, amountTotal, amountPrincipalMinor, amountInterestMinor, amountLateInterestMinor, amountTotalMinor, processedBy, justification, integrityHash, previousHash, hashVersion, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ],
  [
    "db335bb161c2add9966bc000a1ef588f049b370fc4d1db256e58a0d658cab6dc",
    "INSERT INTO accounting_receipts (id,entryId,fileName,mime,data,digest,createdAt) VALUES (?,?,?,?,?,?,?)"
  ],
  [
    "66e47b56ae4db519e6666e27c5c054e84aca9762cbff77e444beae7bd326063b",
    "INSERT INTO accounting_requests (id, kind, targetId, amountMinor, description, reason, requestedBy, requestedById, requestedAt, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')"
  ],
  [
    "24bd6ac4e240c3c4c6d0dbef34e1ddb73087664f11cec9ba499c2ed971da8630",
    "INSERT INTO audit_alert_comments (id, alertId, userId, userName, status, comment, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "b2f536d42cc05445738fc7a1005f8d8b9f64be94fd5fe49f46dc091cc86ea503",
    "INSERT INTO audit_log_chain (auditId,previousHash,integrityHash,origin) SELECT ?,?,?,'legacy' WHERE ? = COALESCE((SELECT integrityHash FROM audit_log_chain ORDER BY seq DESC LIMIT 1), ?)"
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
    "5e0a1cb67ce56bf080e7ae056a5866d998a7265c0cb085fa18181e58cd6cd1d9",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'create', 'system', ?, ?)"
  ],
  [
    "094309a73589f62a76e2135db0c68ee8ff7bcf6b218903c0c3e6504d3a44786c",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'delete', 'system', ?, ?)"
  ],
  [
    "dd13a8fb9ff93013624df66c869cfbd36e4ddf23be1cc218989ded59dc10dab2",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'export', 'client', ?, ?)"
  ],
  [
    "14be03014f13ed43d913c97f7b523ecf153622ca6f46fed140b9523931d01269",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'export', 'report', ?, ?)"
  ],
  [
    "86be2cdb587d3a3ad5221c135d5ce98b9abaa3986c02d82c24b6d88fe1c6219b",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'restore', 'payment', ?, ?)"
  ],
  [
    "882129e9db6037aa0466270a5f59c192c57eef15d710324c07cc738550274927",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'update', 'accounting_entry', ?, ?)"
  ],
  [
    "7131ff53b8bafaf78006b4db5ded9d8de8003c23f8731d2c2d20e4e8dc16bfba",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'update', 'credit', ?, ?)"
  ],
  [
    "44fb63489649b7e34f4128087a5037b62bdf4e0e6470027f4fb1a16b9af4ad39",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'update', 'system', ?, ?)"
  ],
  [
    "493a9e09ad61a529c2114196288db8cbf68f55b335902aae056a691956d15e45",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?)"
  ],
  [
    "12c31a3627c43562e51cf7f6c8d9dec7c3b16c53b6e1f7e8eab64943c01ed42c",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, ?, 'payment', ?, ?)"
  ],
  [
    "4f96f6cc256773f60b2adcad2783a9ac01907bf75a0c819c8da1a3885f8905aa",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "e80727e27c8fe551ae0d0d8eede24a7efd68460f9357c0fc93a8d5d6c583b4c6",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, NULL, 'Sistema', 'update', 'system', ?, ?)"
  ],
  [
    "0bf296b289bb4cba74c09cb6b5188dae44db1de513c8fdf05704c9c75df94aca",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, 'create', 'payment', ?, ?, ?, ?)"
  ],
  [
    "303e20ca55203c3005c620763b2fc078096704c4c1ea8784b2e1919ef203b550",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, 'delete', 'payment', ?, ?, ?, ?)"
  ],
  [
    "b8d24506a4c3fc055349812ec4c14471b8b9dc00ba084dd501638f9584d8280a",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, 'update', 'credit', ?, ?, ?, ?)"
  ],
  [
    "304ca2bec839506567eca520caa25d5d95c8aa4ab528ba67ed4a461ed0e05403",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, 'update', 'system', ?, ?, ?, ?)"
  ],
  [
    "b03c862b340923a9e9585ec991b5664c0d7c5b25aca7870e276a30caf851a14f",
    "INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "4ad8b402e3434eca295b2bb0a9afe54af5dce88d3b5b7815d5f77ba06c1e0b57",
    "INSERT INTO audit_logs (id,timestamp,userId,userName,action,entity,details,metadata) VALUES (?,?,?,?,?,?,?,?)"
  ],
  [
    "e437a0878a60cc70d9fd96a08af63aa9f35804da180c80da457cafba322f5f44",
    "INSERT INTO calendar_tasks (id, title, description, date, done, createdAt, usuario_id) VALUES (?,?,?,?,?,?,?)"
  ],
  [
    "506a72a37a37a2dbef0bf60c0ad8ee93a3e200067f4e095a674d755b38b3aba0",
    "INSERT INTO clients (id, name, nif, phone, email, address, creditLimit, usedCredit, availableCredit, monthlyIncome, defaultInterestRate, lateInterestRate, toleranceDays, status, riskLevel, whatsappVerified, documents, bankCoordinates, receiveMethod, lastContacted, createdAt, usuario_id, birthDate, age, issueDate, expiryDate, gender, maritalStatus, fatherName, motherName, workInstitution, socialSecurityNumber, spouseName, spouseBi, spouseNif, spousePhone, spouseEmail, legalRepresentative, legalRepRole) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "91d2d82b3e73e1db642a1f04e9e04604dfde45206bf6c5e24abb531f3752c4e3",
    "INSERT INTO collection_events (id, creditId, kind, agentId, agentName, monthKey, amountMinor, promisedDate, relatedId, notes, actorId, actorName, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
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
    "a979478225583dbcb8c82ccf2efc1c95ecf9fd1b8867e1dc5c6bc90a0697e6e4",
    "INSERT INTO credit_approvals (id, creditId, clientId, clientName, principalAmount, interestRate, installments, decision, reason, requestedBy, requestedAt, decidedBy, decidedById, decidedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "0ae8a6176fce759b0b410a97e84953252c8cd78d4485f5debd709b995df8b3bd",
    "INSERT INTO credit_documents (id, creditId, kind, fileName, mimeType, dataUrl, uploadedAt, uploadedBy, uploadedByName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "2892cddc7cdfc23454ee3275b829b226cbfff65cd180cdbbb4aa1a9d88eee6e3",
    "INSERT INTO credit_import_batches (id, number, fileName, createdAt, createdBy, createdById, rowsCount, totalMinor, status) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'active')"
  ],
  [
    "bd5dcf81d2137e6e1e41a5a8d5154fd54c13a09d1c8a38b7015dc483a88ed33f",
    "INSERT INTO credit_installments (id, creditId, installmentNumber, dueDate, principalMinor, interestMinor) VALUES (?, ?, ?, ?, ?, ?)"
  ],
  [
    "3e744c46123d49fc5047642deec0b0af842c39b4569aa5b0440f98446b79d595",
    "INSERT INTO credit_manager_transfers (id, creditId, fromUserId, toUserId, toUserName, reason, actorId, actorName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "25bf964c0c238c2ccf2d5e5b646246e3d69e39f309c692e8383e0cf85b5d15f7",
    "INSERT INTO credit_reinforcements (id, creditId, amountMinor, interestMinor, idempotencyKey, notes, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "f96329309fa70f5099a1c7bca0a385422ba6120aecf70d323eb314bd83726daa",
    "INSERT INTO credit_restructurings (id, creditId, kind, mode, reason, status, originalPlan, newPlan, params, payNowMinor, requestedBy, requestedByName, requestedAt) VALUES (?, ?, 'restructure', NULL, ?, 'pending', ?, ?, ?, NULL, ?, ?, ?)"
  ],
  [
    "fb6ec72350363b0da774664b680db9e82dfa76358ca085b6138d69483bfadbd8",
    "INSERT INTO credit_restructurings (id, creditId, kind, mode, reason, status, originalPlan, newPlan, params, payNowMinor, requestedBy, requestedByName, requestedAt, decidedBy, decidedByName, decidedAt) VALUES (?, ?, 'early_settlement', ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "49cf0dbc1f6dbf40fe928eff02140e56d35670737033ae6baf6679d485425d3c",
    "INSERT INTO credit_writeoffs (id, creditId, principalMinor, interestMinor, provisionUsedMinor, lossMinor, reason, requestedBy, requestedById, approvedBy, approvedById, entryId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "1554539be5261997025e02344b1afdfdee3c3ff4eef5334f56b630ab3e021357",
    "INSERT INTO credits (id, clientId, clientName, principalAmount, principalAmountMinor, interestRate, lateInterestRate, installments, paidInstallments, currentBalance, currentBalanceMinor, accruedInterest, accruedInterestMinor, lateInterest, lateInterestMinor, totalDue, totalDueMinor, version, amortizationMethod, startDate, dueDate, status, creditNumber, createdAt, requestedBy, requestedAt, approvedBy, approvalNotes, usuario_id, targetMonthId, supplierId, supplierProfitRate, productId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
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
    "4a126ac7858cc54f138bf70626cb0cd97d4764deec76adf006bde860473e8076",
    "INSERT INTO limit_escalation_approvals (id, escalationId, approverId, approverName, approverRole, decision, notes, decidedAt) VALUES (?, ?, ?, ?, ?, 'approved', ?, ?)"
  ],
  [
    "5525b57de3b50031f1b3b89e01abbc09cc85f825ad9ddb6e115ea40b555b5f37",
    "INSERT INTO limit_escalation_approvals (id, escalationId, approverId, approverName, approverRole, decision, notes, decidedAt) VALUES (?, ?, ?, ?, ?, 'rejected', ?, ?)"
  ],
  [
    "f5d82be361b4b0b1bb2f62b53d3e4e351651eb4b7e76bc27943ac313cdb45d5d",
    "INSERT INTO limit_escalations (id, operationType, entityType, entityId, amountMinor, requestedById, requestedByName, requestedRole, reason, details, requiredLevelId, requiredLevelIndex, requiredLevelName, dual, status, createdAt, levelSince) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)"
  ],
  [
    "0040e084970becb56b571fc19d37994a074bb8eb564de6ba07d9b085eba82fff",
    "INSERT INTO limit_exceptions (id, userId, userName, operationType, perOperationMinor, dailyMinor, monthlyMinor, dailyCount, startsAt, endsAt, reason, status, requestedBy, requestedByName, requestedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)"
  ],
  [
    "6c57dabb34b406fd631d693e710db90639a1250fb701449964f68837f2fba403",
    "INSERT INTO limit_ledger (id, operationType, userId, userName, profileId, branchId, amountMinor, count, dayKey, monthKey, entityType, entityId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "2f94bf630ef74e630c481c57633d206357da82a2047d9efac22a828c27c2d824",
    "INSERT INTO limit_locks (id, ledgerId, scope, scopeId, period, periodKey, createdAt) SELECT ?, ?, ?, ?, ?, ?, ? WHERE COALESCE((SELECT SUM(amountMinor) FROM limit_ledger WHERE operationType = ? AND (CASE ? WHEN 'user' THEN userId WHEN 'branch' THEN COALESCE(profileId, '') || '|' || COALESCE(branchId, '') WHEN 'profile' THEN profileId ELSE 'all' END) = ? AND (CASE ? WHEN 'day' THEN dayKey ELSE monthKey END) = ?), 0) + ? <= ? AND COALESCE((SELECT SUM(count) FROM limit_ledger WHERE operationType = ? AND (CASE ? WHEN 'user' THEN userId WHEN 'branch' THEN COALESCE(profileId, '') || '|' || COALESCE(branchId, '') WHEN 'profile' THEN profileId ELSE 'all' END) = ? AND (CASE ? WHEN 'day' THEN dayKey ELSE monthKey END) = ?), 0) + ? <= ?"
  ],
  [
    "e4742b46ff7a26f6ea5cf7d7f31b0f9149a23f23ab9bfbc17ef57f4392a842ab",
    "INSERT INTO limit_policy_versions (id, version, policy, summary, reason, status, effectiveFrom, requiresSecondApproval, secondApprovalReasons, createdBy, createdByName, createdAt, restoredFrom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
    "7e5124d774d8759701bb01f350828446892ed37e899427ea640464fba6c022c2",
    "INSERT INTO payment_import_batches (id, number, fileName, createdAt, createdBy, createdById, rowsCount, totalMinor, status) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'active')"
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
    "da2ca8b7bc104b1746d10bc88ea5a5d069e7890f9f9abfc8de434fa38d3a459c",
    "INSERT INTO payments (id, creditId, clientName, amount, amountMinor, paymentDate, method, reference, allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest, allocatedToInterestMinor, allocatedToLateInterest, allocatedToLateInterestMinor, idempotencyKey, processedBy, status, usuario_id, registeredAt, batchId, hasProof) VALUES (?,?,?,?,?,?,?,?,0,0,0,0,0,0,?,?,'pending',?,?,?,?)"
  ],
  [
    "3366e44964e62a72aac0b0ea9a80d0b1815a43d0fff39ecef9e81cb03e0260b3",
    "INSERT INTO payments (id, creditId, clientName, amount, amountMinor, paymentDate, method, reference, allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest, allocatedToInterestMinor, allocatedToLateInterest, allocatedToLateInterestMinor, idempotencyKey, processedBy, status, usuario_id, registeredAt, receiptYear, receiptSeq, allocationDetail, balanceAfterMinor, batchId, hasProof) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ],
  [
    "ded18942273c326529f228c40e12db983efd042e5b7b25554cd842f945ce3eff",
    "INSERT INTO report_history (id, reportType, title, format, filters, fileName, fileData, generatedAt, generatedBy, generatedById) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "099217f363ae7ca19916536fd5bade71dfb7fb98f9d73f5862e86b3342d81e49",
    "INSERT INTO report_schedules (id, reportType, recipients, enabled, createdAt, createdBy) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET reportType = excluded.reportType, recipients = excluded.recipients, enabled = excluded.enabled"
  ],
  [
    "f2995b6d402befe778f7c32e5550922de27dbb73ddc8b5db9d5bb0f94424df23",
    "INSERT INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)"
  ],
  [
    "b2abc0146d49c3d8d435e9c83176148ab307fe5e18be47e517ced072ba47562f",
    "INSERT INTO shared_settings (key, value, updatedAt, updatedBy) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy WHERE excluded.updatedAt >= shared_settings.updatedAt"
  ],
  [
    "1cc95977dbda37ed2b218ce82baba8ae52b1a3d0cb698284554782aec3293919",
    "INSERT INTO simulations ( id, reference, date, clientName, clientIncome, amount, term, interestRate, method, riskProfile, totalPayment, monthlyPayment, aiAnalysis, usuario_id, createdAt, status, clientId, productId, verificationCode, expiresAt, details, convertedCreditId, updatedAt ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
    "f1a837bff3a4b87f4fe7b7192e1a9e1cedc6e284daf95fbfbcccf3036d9adaef",
    "INSERT OR IGNORE INTO accounting_bank_imports (id, fileName, movements, actorId, actorName, importedAt) VALUES (?,?,?,?,?,?)"
  ],
  [
    "924ddc834dffb8a5d1d57cae9ebb9287c31d022cc5003d81b02d1a06271df763",
    "INSERT OR IGNORE INTO audit_alerts (id, alertKey, ruleId, severity, title, description, eventIds, originUserId, originUserName, occurredAt, status, dueAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)"
  ],
  [
    "245c3b80918541bb6730309e1635bcdd0b510eb99de1a50599c80d1e5f99a76b",
    "INSERT OR IGNORE INTO audit_daily_closes (day, lastAuditId, headHash, eventCount, status, brokenSeq, verifiedAt, verifiedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "fd742f8d6d18960338ee772bf38085682e3ded58dc6a8b129e27fa60c7e84978",
    "INSERT OR IGNORE INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'create', 'accounting_entry', ?, ?)"
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
    "e64404d01bf43919846dd317e0fb27f13ca17c47a2b90584672269fd50bcb880",
    "INSERT OR IGNORE INTO credit_import_items (batchId, creditId) VALUES (?, ?)"
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
    "571cadffb5762a85eb3a30adbb2a8bddae421a0bdbe3fd9f2a63ccc63bf4320a",
    "INSERT OR IGNORE INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, ?, ?, ?, 0, ?)"
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
    "9ff8cf04f515e992614730dd0e25f5e4c79c18c1f73a607ef44b4b11e06a4591",
    "INSERT OR REPLACE INTO payment_proofs (paymentId, fileName, mimeType, dataUrl, uploadedAt, uploadedBy) VALUES (?, ?, ?, ?, ?, ?)"
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
    "4ac78eab30d56ef2d21a18041fefdeb49d2b39691e4a5a7516d2f7944c1f2aaf",
    "SELECT * FROM accounting_audit_runs ORDER BY finishedAt DESC LIMIT ?"
  ],
  [
    "f791230631dc387f032ce33a84f6d07a48899873c700170c7804e0fbeacf2589",
    "SELECT * FROM accounting_bank_imports ORDER BY importedAt DESC, rowid DESC"
  ],
  [
    "33e9ee6e0d98ab704fc0b6f0a72a0c4f0ac4396a6b52a4c61b93f151a54b66d4",
    "SELECT * FROM accounting_cash_sessions WHERE operatorId = ? AND sessionDate = ?"
  ],
  [
    "da4998118fd73e91af1125c1181288fca5c537c945b40dfe82cffe08f0dae641",
    "SELECT * FROM accounting_cash_sessions WHERE operatorId = ? ORDER BY sessionDate DESC LIMIT 90"
  ],
  [
    "0aa532f9990cceada369582585cc47cc6608cecc9a5e2a259596ed13c05e8219",
    "SELECT * FROM accounting_cash_sessions WHERE status = 'closed'"
  ],
  [
    "efdfc66974d9086f8194c067f8526799092066fbec9864388cf53823fc047eb2",
    "SELECT * FROM accounting_cash_sessions WHERE status = 'closed' AND expectedMinor <> countedMinor"
  ],
  [
    "3a284a6ffb91f253c3a4f4eb66293fe5e3cf51b2c727c8f2b4df2ffb0a0d4163",
    "SELECT * FROM accounting_daily_closes ORDER BY day DESC"
  ],
  [
    "32562a211b8e108416bbd37699c9a92f506626549a54a2d72cdbaceb43d5272a",
    "SELECT * FROM accounting_divergence_events ORDER BY createdAt DESC, rowid DESC"
  ],
  [
    "644ae5e30760b7885519623d36a8903de28dd98978caabfdeef5194f31fc4bfa",
    "SELECT * FROM accounting_entries ORDER BY rowid"
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
    "be2e95dae17b4448a06620e3b1acb6f85f5539e7a69bb43e4fe5047a3b9c6264",
    "SELECT * FROM accounting_requests ORDER BY requestedAt DESC"
  ],
  [
    "b7b6282bac6d45888f8f97187b878142ea489e92d33f4d9a815b35271eab3585",
    "SELECT * FROM accounting_requests WHERE id = ?"
  ],
  [
    "c6c83a7d10c90a73d29d6416d64c647da3c62861cb92e7e8f604914fc648b8c9",
    "SELECT * FROM audit_alert_comments WHERE alertId = ? ORDER BY createdAt"
  ],
  [
    "c1653fa06e8ad6103b220df6a667f176b38ec87d7c908960d521dd6e75f3378a",
    "SELECT * FROM audit_alerts ORDER BY occurredAt DESC LIMIT 1000"
  ],
  [
    "3471bbcbb6f9ef1878d957401e56955ca8478b3e94fed6cca9b84a4b21a75525",
    "SELECT * FROM audit_log_chain ORDER BY seq"
  ],
  [
    "a0c62aaa643ebc1b3a3a63692bfc7cee3003be21a99e3c8f523482f1bc77be24",
    "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?"
  ],
  [
    "67c943e1cbc0633a8371206c293d5ec84e3acfe66c98113cf8a86358a1df764e",
    "SELECT * FROM audit_logs ORDER BY timestamp DESC, id DESC LIMIT ?"
  ],
  [
    "afc37b489f3bde55ade15137fab84f9d341f8f005854835344a7294a90f14476",
    "SELECT * FROM audit_logs ORDER BY timestamp DESC, rowid DESC"
  ],
  [
    "3308ed2cce08112c7629a48b63c3670b2c68137e48d9f7a97af159a67445909b",
    "SELECT * FROM audit_logs WHERE timestamp < ? OR (timestamp = ? AND id < ?) ORDER BY timestamp DESC, id DESC LIMIT ?"
  ],
  [
    "d69e56f45c41d440442e2d32ff7fa9f46050550b4172c512a92ee817ef602de1",
    "SELECT * FROM audit_logs WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT ?"
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
    "cdf2a72cc97bea161bd897b97056e04c894f4f5afd8cf0f087650aad4147897b",
    "SELECT * FROM collection_events ORDER BY createdAt DESC, rowid DESC"
  ],
  [
    "750219de86b49a3572f7163c84fa6e5f2ba1abc7337a5f9fba43ded8d9e49e7e",
    "SELECT * FROM collection_events WHERE id = ? AND kind = ?"
  ],
  [
    "3151401e5c7b9baf8fc1b46b1e4822a9614cd02252629b1bdd6a448779210d41",
    "SELECT * FROM collection_events WHERE kind IN ('promise','promise_kept','promise_broken') ORDER BY createdAt"
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
    "d5e5bfee542e75f424579150ccbb664b85f879244de474ef060fc5aa8c092737",
    "SELECT * FROM credit_import_batches ORDER BY createdAt DESC"
  ],
  [
    "59c1a7f72df5eacf043d5d0b7fee519983da359bee31a0a1a0faf5f8ae50919b",
    "SELECT * FROM credit_installments"
  ],
  [
    "b105d3648c37ee2db7b63316e78f1c0fc938959434bddb6d2c6ede050dc8222e",
    "SELECT * FROM credit_manager_transfers WHERE creditId = ? ORDER BY createdAt DESC"
  ],
  [
    "6592775787d53b5476073f9ef2e1d4c9f0f877f84e284adab5b10fd232915dda",
    "SELECT * FROM credit_restructurings ORDER BY requestedAt DESC"
  ],
  [
    "5384fa9326c3519e1aa5550c74ad7e95aeec5041d7bff7e27a8bc515e4cf0ef4",
    "SELECT * FROM credit_restructurings WHERE creditId = ? ORDER BY requestedAt DESC"
  ],
  [
    "b2b70e3f3aac019a93e71e6a11b40b1917211c40bc33e8c6db2a62b9ae6bfda5",
    "SELECT * FROM credit_writeoffs"
  ],
  [
    "0ec54f56b9e9bd44bb53fd49690562c5d5a97edb0ae0f225109f33f55dd89b52",
    "SELECT * FROM credits"
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
    "b5e7f65b917935be8fe694775b454cc9f27b504c7e26bca0fb3ec2df72c941ed",
    "SELECT * FROM ledger_lines ORDER BY rowid"
  ],
  [
    "d5d92b32c748f00fcc4d31901866ba971e79321d50eb821e366307032756a5a2",
    "SELECT * FROM ledger_lines WHERE transactionId = ? ORDER BY id"
  ],
  [
    "6a547d7b5b6ac0c9d2090471ab4e637b950259428bdf41b030866502cbc2a7d2",
    "SELECT * FROM ledger_transactions ORDER BY rowid"
  ],
  [
    "4c034f28daf872d064f108e2a8edd9e2c51232d0552997fdaffe83c99f3bc39c",
    "SELECT * FROM ledger_transactions WHERE id = ?"
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
    "f35e6b2bde98eaf1b33cc14523d1011180ec5ffa67868208b35b4287e8bc582a",
    "SELECT * FROM limit_escalation_approvals ORDER BY decidedAt DESC LIMIT 5000"
  ],
  [
    "01ff551c0866a305dd11dec9713add4d1e93fa2f9535351bf4ea80fa46012d49",
    "SELECT * FROM limit_escalation_approvals WHERE escalationId = ? ORDER BY decidedAt"
  ],
  [
    "abc7896421e168793b1f17d51b23a37d59f435dec29d5cab7219342ab6a6c963",
    "SELECT * FROM limit_escalations ORDER BY createdAt DESC LIMIT 2000"
  ],
  [
    "04b4bbb72588cd987e381993800f416ab62d931dede2ce712e87989e8cf731c4",
    "SELECT * FROM limit_escalations WHERE createdAt >= ? ORDER BY createdAt DESC"
  ],
  [
    "8eb74788dc490da52a2715a1e5ef159aa4fc2dae6f9044d462593f1b4b100e4b",
    "SELECT * FROM limit_escalations WHERE entityType = ? AND entityId = ? ORDER BY createdAt DESC LIMIT 1"
  ],
  [
    "3cf34937ad8fb21e53554e19c060bc6facb00cfed6e418e596136f0f12c940dd",
    "SELECT * FROM limit_exceptions ORDER BY requestedAt DESC"
  ],
  [
    "62fb7d34146c875b868d8c0dc85482bdb731784dd1da6bf7cd259e66e1f07ccd",
    "SELECT * FROM limit_ledger WHERE createdAt >= ? AND operationType NOT IN ('credit_approval','disbursement')"
  ],
  [
    "dacc5a99e6d92511a12d355d1e2d816f7b485f1e35c30e2ff000a9596fc48d9e",
    "SELECT * FROM limit_ledger WHERE dayKey >= ? ORDER BY createdAt DESC"
  ],
  [
    "1d91db7b563e1a90757900ca8395f66ae76a452f43c9741b67e681993b53a388",
    "SELECT * FROM limit_policy_versions ORDER BY version DESC"
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
    "b017c3a8bfe0ed516d40763e6022d206fa3efe968ff9b66b4eba531f3380dc7c",
    "SELECT * FROM payment_import_batches ORDER BY createdAt DESC"
  ],
  [
    "d795e991ce0e17a55ac47b6352746553d2241ed7eb8f9c23a1390e6405a23d7e",
    "SELECT * FROM payment_import_batches WHERE id = ?"
  ],
  [
    "ab38326ada4c32fb201663a718f74a7e7bc8fe4c2526cd21df18041d1b1bd292",
    "SELECT * FROM payment_references ORDER BY createdAt DESC"
  ],
  [
    "b0346484d86b9a469ec4c9c60c7fa0db52814dfb801569a6da2ddba66f46f69b",
    "SELECT * FROM payments"
  ],
  [
    "09a525d768a966420c5aeecc1ed98262be07a58a4c1f10025cd8a786f0b55fc4",
    "SELECT * FROM payments WHERE deletedAt IS NOT NULL"
  ],
  [
    "21883d4b0bc8e8fa557758881f0b65f1d8e28589ef8ec59eef6d36e5da234903",
    "SELECT * FROM payments WHERE deletedAt IS NULL AND status = 'confirmed'"
  ],
  [
    "d7fc402bdcfebcd36ada870fe7a3ca7f102699864b24475dfc60a3b8657bb3c1",
    "SELECT * FROM payments WHERE deletedAt IS NULL ORDER BY paymentDate DESC"
  ],
  [
    "c5bdc0851c9ca0f7b0a51545055d09e854ce4e15b49353d4dee4c8ab81f55ba2",
    "SELECT * FROM report_schedules ORDER BY createdAt"
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
    "8fafd3252528dcf4b3de48c0950f9aa311b68993504c067749d6f9ec186f82ec",
    "SELECT COALESCE(SUM(CASE WHEN l.side = 'debit' THEN l.amountMinor ELSE -l.amountMinor END),0) AS net FROM ledger_lines l JOIN ledger_transactions t ON t.id = l.transactionId WHERE l.account = 'cash' AND t.usuario_id = ? AND t.timestamp >= ?"
  ],
  [
    "e5a42ef884eebe05b3a6108a251c953eface73ad6c2e61447bfb114bbcdb355f",
    "SELECT COUNT(*) AS n FROM clients WHERE deletedAt IS NULL AND substr(createdAt, 1, 7) = ?"
  ],
  [
    "1bfab959c14d5d0ff7d8e535a99439ee09672d473c2773905e1394e8de92c32d",
    "SELECT COUNT(*) AS n FROM users"
  ],
  [
    "771579d0a55575f2aefd9dcad891f906a9ad82833692c76e404ded412695038c",
    "SELECT COUNT(*) AS total FROM credit_import_batches WHERE number LIKE ?"
  ],
  [
    "c8ddff8281e56ce8629e49973eb25d32b0dc191dbe28998bb0b98dd69958c5c5",
    "SELECT COUNT(*) AS total FROM payment_import_batches WHERE number LIKE ?"
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
    "6384bfb684344aa5866977bd1f431dd92e26afa1f282d68c33b9834fa4a9e835",
    "SELECT MAX(receiptSeq) AS last FROM payments WHERE receiptYear = ?"
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
    "5be5e42d4861817b0d2ad2fbf5257980cc2c240442da19110b41dbf641d36432",
    "SELECT a.* FROM accounting_entries a LEFT JOIN ledger_transactions t ON t.id = a.id WHERE t.id IS NULL ORDER BY a.rowid"
  ],
  [
    "4f1c18ac3cdc9455750bede72e14992781c4f0d4b8adbec89a8455bcd2cc9c4c",
    "SELECT a.* FROM audit_logs a LEFT JOIN audit_log_chain c ON c.auditId = a.id WHERE c.auditId IS NULL ORDER BY a.rowid LIMIT 200"
  ],
  [
    "404858670e967bc7ae6a78b65257d96f7f9b60424e45128b3db063c3ffcb2559",
    "SELECT a.id, a.timestamp, a.userId, a.userName, a.action, a.entity, a.details, a.previousState, a.newState, a.metadata, c.seq, c.integrityHash, c.previousHash FROM audit_logs a LEFT JOIN audit_log_chain c ON c.auditId = a.id WHERE a.userId = ? ORDER BY a.timestamp DESC LIMIT ?"
  ],
  [
    "db7cfc87fea8c3db687860b0a65a94575a56a338c0fd10950c26fc696f86bb5e",
    "SELECT account, component, amountMinor FROM ledger_lines WHERE transactionId = ? AND side = 'credit'"
  ],
  [
    "33b09ba788601a4e57c67f4f152467b8efc33195247faa90d5023b37c8d282b6",
    "SELECT account, side, SUM(amountMinor) AS total FROM ledger_lines WHERE account IN ('cash', 'bank') GROUP BY account, side"
  ],
  [
    "93b44992fae09c07597bdccfb6526e1e8fead71048ddb05ee6a8cbe4cab89ef7",
    "SELECT alertKey FROM audit_alerts"
  ],
  [
    "2be9d11947fb8f64bca8ffc7b0df929a352ecc19aa825353b8f835cbe6d3dbce",
    "SELECT allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest, allocatedToInterestMinor, allocatedToLateInterest, allocatedToLateInterestMinor FROM payments WHERE id = ?"
  ],
  [
    "e7063397d1756aca147a353a1d010dcdde988d06eb88cff546be75b1c0e8f9ef",
    "SELECT auditId, previousHash, integrityHash, seq FROM audit_log_chain ORDER BY seq"
  ],
  [
    "c9ebf60c9fe43c0665579afed41fd2cc88b4a3b34649a3a8b099dffbd4ed8cef",
    "SELECT c.id, c.principalAmount, c.principalAmountMinor, c.createdAt, c.requestedBy, c.usuario_id, cl.riskLevel FROM credits c LEFT JOIN clients cl ON cl.id = c.clientId WHERE c.deletedAt IS NULL AND c.createdAt >= ?"
  ],
  [
    "b4f72dd297c35a038b6c282db24dab3febda6b37e57afcadc5c2434e59183236",
    "SELECT c.id, c.startDate, c.installments, COALESCE(c.principalAmountMinor, CAST(ROUND(c.principalAmount * 100) AS INTEGER)) AS principalMinor, MAX(0, COALESCE(c.totalDueMinor, CAST(ROUND(c.totalDue * 100) AS INTEGER)) - COALESCE(c.principalAmountMinor, CAST(ROUND(c.principalAmount * 100) AS INTEGER))) AS interestMinor FROM credits c WHERE NOT EXISTS (SELECT 1 FROM credit_installments i WHERE i.creditId = c.id)"
  ],
  [
    "e6bbc82aea82e9c75b6018331b02d286b714ddc116784e6e50ca335e40ad2410",
    "SELECT clientId, SUM(COALESCE(currentBalanceMinor, ROUND(currentBalance * 100))) AS balance FROM credits WHERE deletedAt IS NULL AND status IN ('active','overdue','defaulted','renegotiated','pending_approval') GROUP BY clientId"
  ],
  [
    "a3e8d7fb9fe8e7516af9b6e6eaec79e2c65467719d0679a09f098d4e51563faa",
    "SELECT clientId, status, principalAmount, currentBalance, totalDue, createdAt, startDate, deletedAt FROM credits WHERE clientId = ? AND deletedAt IS NULL"
  ],
  [
    "48f1643d9a06ac51d21e2a2a22b5ae6e2c6ae020961ce14441e9157c6f5c6271",
    "SELECT clientId, version FROM credits WHERE id = ? AND deletedAt IS NULL"
  ],
  [
    "00f13408432a1eda6723a565bfc26cfab8b493452a0e3fc7fd1d5b39fd561da4",
    "SELECT convertedCreditId, productId FROM simulations WHERE convertedCreditId IS NOT NULL AND productId IS NOT NULL"
  ],
  [
    "b6e27e23d8113b62ac108b7aab6cbc5591b01966cbeced5f4670a91b0f1145e3",
    "SELECT creditId FROM credit_import_items WHERE batchId = ?"
  ],
  [
    "cf94a5c2e80c6e741bae017809cf2660b6822f9a2cbb749f48eec6d6aeaebaed",
    "SELECT creditId FROM credit_writeoffs"
  ],
  [
    "d2d20e166d0c2a1a51b3af51f46196317daac73b5daebf1833afb7c83ee8b7b3",
    "SELECT creditId, dueDate, principalMinor, interestMinor, paidPrincipalMinor, paidInterestMinor, status FROM credit_installments WHERE status <> 'cancelled'"
  ],
  [
    "cc45ae6a81a4b79953483f522a09f975265209d485f42d594fa120ae41a65c61",
    "SELECT creditId, stage FROM legal_cases WHERE deletedAt IS NULL AND stage <> 'closed'"
  ],
  [
    "598ee0b5e91f5b81590cb7d54a4dda2e1860dcf9e32ea15a424f72ae174517c6",
    "SELECT creditId,dueDate,principalMinor,interestMinor,lateInterestMinor,paidPrincipalMinor,paidInterestMinor,paidLateInterestMinor FROM credit_installments"
  ],
  [
    "334b930b20fc3fc58abc4d884acadd381eed16ea34f6e2473d13718997c8acb1",
    "SELECT day FROM accounting_daily_closes WHERE day = ?"
  ],
  [
    "7b387880f7572680cc4befa0423e949136816a914a078a68bf9d01fb726fa3c8",
    "SELECT day, status, brokenSeq, verifiedAt FROM audit_daily_closes ORDER BY day DESC LIMIT 1"
  ],
  [
    "f40de797fae008ebe5d1c22db3e9a727c84bda052317d39540a86e57fa98dd19",
    "SELECT details, metadata FROM audit_logs WHERE userId = ? ORDER BY timestamp DESC LIMIT 500"
  ],
  [
    "23fa4168af434358e45f29067d31a3e2c8d7105ca30066445be3f164fdb2c491",
    "SELECT entityId FROM limit_escalations WHERE entityType = 'credit' AND status = 'pending'"
  ],
  [
    "52559f037a89b243c5b564e1925c6c6723d3255909f7105ec971ba7033ebe6c4",
    "SELECT fileName, fileData, format FROM report_history WHERE id = ?"
  ],
  [
    "7fb792ad149775b62d9ad5deb5847ae27f60e63e00a94d7d12f4c288e4980761",
    "SELECT fileName, mimeType, dataUrl, uploadedAt, uploadedBy FROM payment_proofs WHERE paymentId = ?"
  ],
  [
    "4629ad582104b26009bd7f5a5e9a6c7d5353ba93dd6d1f6fb2f5d99d93b5a60a",
    "SELECT fileName, movements FROM accounting_bank_imports"
  ],
  [
    "4bd4bd0a9d5d1caf21761f9d617217f012a9b8995c0f6777f07bec985e660537",
    "SELECT fileName,mime,data,digest FROM accounting_receipts WHERE entryId = ?"
  ],
  [
    "1b125175cc9de0b5d4ef63056dd9b014e79b7eae3d739262b8465cee8f64f49a",
    "SELECT i.creditId, c.clientId, c.clientName, i.installmentNumber, i.dueDate, i.principalMinor, i.interestMinor, i.lateInterestMinor, i.paidPrincipalMinor, i.paidInterestMinor, i.paidLateInterestMinor FROM credit_installments i JOIN credits c ON c.id = i.creditId WHERE c.deletedAt IS NULL AND c.status IN ('active', 'overdue', 'defaulted', 'renegotiated', 'paid')"
  ],
  [
    "74b346ceef61ef08f04db6abe00e0b246a7104c525244a255fcf1ad90f626166",
    "SELECT id FROM accounting_entries ORDER BY rowid DESC LIMIT 1"
  ],
  [
    "861cbdc76ebee5398bdb7a21f231dc19a5f63647c59c53736e665dfdfbe93508",
    "SELECT id FROM accounting_requests WHERE kind = ? AND targetId = ? AND status = 'pending'"
  ],
  [
    "494ba46c8daee18c0d0106d44c28a8c55bd17672eaef907659da8c3ff03ad986",
    "SELECT id FROM closed_months"
  ],
  [
    "f5f0ec7d5ecbffd1ee24ed583ae821bb963d52a397de48307c4d4f101e6dd594",
    "SELECT id FROM credit_writeoffs WHERE creditId = ?"
  ],
  [
    "b43dd7cf7201c629b2b44ba6f0b7039cb28d235f81edfbffe429f0e94ac1b79f",
    "SELECT id FROM credit_writeoffs WHERE creditId = ? LIMIT 1"
  ],
  [
    "b5befaec6669db56b9448e74a7297c063dcc7deced9469b1360d89a6eadceb08",
    "SELECT id FROM credits WHERE id = ?"
  ],
  [
    "f9314fa06ffd6f372f2256224610c2ad4e0f60c46a3399e28a28f3198153b73d",
    "SELECT id FROM ledger_transactions WHERE id = ?"
  ],
  [
    "5202cc4abdce53a37ab39a6b28071d6d20df0455b0b050c5fdf30cd5e9c0ff48",
    "SELECT id FROM notifications WHERE id = ?"
  ],
  [
    "d011454a1268548328b77b091e5b7b2396eddf0dd66e096f466fef1d423dd8e9",
    "SELECT id FROM payments WHERE idempotencyKey = ?"
  ],
  [
    "a4821a27a4f2a9662ba6234e4ab77093378c0235e7dc51960e0315ae94766d15",
    "SELECT id FROM users WHERE email = ?"
  ],
  [
    "a0c2a7f0d5cd98b706cb5be27130f5073bf7c22a5e00a9f883341133491e2c67",
    "SELECT id FROM users WHERE role IN ('admin','super_admin','credit_director') AND (status IS NULL OR status <> 'blocked')"
  ],
  [
    "538d1e9bdb1e5f96afaaf280bac40cf79ec9f8b42dfe671d2b2f54c9c787973f",
    "SELECT id FROM users WHERE role IN ('super_admin', 'internal_auditor') AND (status IS NULL OR status <> 'blocked')"
  ],
  [
    "403bfe52c974d3146335e9226c73cde87702573780bdacba1150b5ef35100196",
    "SELECT id, allocatedToPrincipalMinor, allocatedToInterestMinor, allocatedToLateInterestMinor, deletedAt, status FROM payments WHERE creditId = ?"
  ],
  [
    "33c7348b49294ad9b1ccf1e756b16b31fc61650d4b51ad4d561ddb5971f812fc",
    "SELECT id, clientId, clientName, principalAmount, currentBalance, interestRate, lateInterestRate, installments, paidInstallments, startDate, dueDate, status, daysOverdue, accruedInterest, lateInterest, totalDue, createdAt, requestedBy, requestedAt, approvedBy, approvalNotes, creditNumber, paidAt, usuario_id, targetMonthId, supplierId, supplierProfitRate, principalAmountMinor, currentBalanceMinor, accruedInterestMinor, lateInterestMinor, totalDueMinor, version, amortizationMethod, productId FROM credits WHERE deletedAt IS NULL"
  ],
  [
    "ccafb7c269b7a7d7c159d6b9702b60ad64802276a7ab5057cd0668cec8c00822",
    "SELECT id, clientId, clientName, principalAmount, currentBalance, interestRate, lateInterestRate, installments, status, deletedAt, deletedBy, createdAt FROM credits WHERE deletedAt IS NOT NULL"
  ],
  [
    "68a37b8e9bab8c64d19dc673d86ee67997224e261d646b12e0a13b94806dacc1",
    "SELECT id, clientId, clientName, status, version FROM credits WHERE id = ? AND deletedAt IS NULL"
  ],
  [
    "e06ca25b0bb0abedd534653b8d3205c2b69a7511bb1058860feb30f3507c03b9",
    "SELECT id, clientId, status, version FROM credits WHERE id = ? AND deletedAt IS NULL"
  ],
  [
    "9fe1ad80771f8332841f845fe08310d7006658e343c05dae63d48bc6f1b6dfd8",
    "SELECT id, clientId, status, version, lateInterestRate FROM credits WHERE id = ? AND deletedAt IS NULL"
  ],
  [
    "2700cbcf81526b02bff254c2148f19906658bb7180c0b753ff42aad7e9012c78",
    "SELECT id, creditId, clientId, clientName, principalAmount, interestRate, installments, decision, reason, requestedBy, requestedAt, decidedBy, decidedById, decidedAt FROM credit_approvals ORDER BY decidedAt DESC"
  ],
  [
    "363e9c081ff01a62e89b553e613e142a89a67fb240317ebc1b1bc361a186a0f7",
    "SELECT id, creditId, installmentNumber, dueDate, principalMinor, interestMinor, lateInterestMinor, paidPrincipalMinor, paidInterestMinor, paidLateInterestMinor, status, paidAt FROM credit_installments"
  ],
  [
    "18f872abec7e51e7606df6b21240f8ff974534d61d3b776750842d243e6af040",
    "SELECT id, creditId, kind, fileName, mimeType, dataUrl, uploadedAt, uploadedByName FROM credit_documents WHERE creditId = ? AND deletedAt IS NULL ORDER BY uploadedAt DESC"
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
    "9bbbd93e37c26b451259878b471d4319fce4670c9b8b5f00d43e7bfafbf6c338",
    "SELECT id, lateInterestMinor, version FROM credit_installments WHERE creditId = ?"
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
    "1bf291dd03e794dd9959b0e30f29d28f6f513dbcd99545ebd467cbb619dfbd09",
    "SELECT id, name, nif, phone, riskLevel, fatherName, motherName, spouseName, spouseBi, spouseNif, spousePhone, legalRepresentative FROM clients WHERE deletedAt IS NULL"
  ],
  [
    "dd72910f6a5a6c1ec60024f1db4062da2f19123c0f06fca75f39cfd80e36261a",
    "SELECT id, name, role FROM users WHERE LOWER(email) = ?"
  ],
  [
    "26982f30dbd6f126b861c3a8a2ea6da2e5416443b34c249f0e5a15bfc4ff2abb",
    "SELECT id, name, role, branchId FROM users WHERE id = ?"
  ],
  [
    "bad640298ec792ac9d37a3a6726214b02f5ba61e260a28806dded3c988cebee3",
    "SELECT id, name, role, status, branchId, branchName FROM users WHERE status IS NULL OR status <> 'blocked'"
  ],
  [
    "013f69d21f2481982cae2f0924904102580bd89319865f28ad733692f0285d48",
    "SELECT id, operation FROM sync_conflicts WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 5000"
  ],
  [
    "7b32ef771c56302234aae2c40b39a0be2cb247e6a7f1d269334a70014da865d9",
    "SELECT id, paymentDate FROM payments WHERE receiptSeq IS NULL AND status = 'confirmed' AND deletedAt IS NULL ORDER BY paymentDate, id"
  ],
  [
    "ff79c9fe765a9c8223eb41a6e341f679d79f3751c335563a77eb214c64008bec",
    "SELECT id, principalMinor, interestMinor, paidPrincipalMinor, paidInterestMinor, status, version FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber"
  ],
  [
    "7d82c09cf7fcfd91a78bbe1333d745d418c4e947b095df63f38e4961b529defa",
    "SELECT id, reportType, title, format, filters, fileName, generatedAt, generatedBy, generatedById FROM report_history ORDER BY generatedAt DESC LIMIT 200"
  ],
  [
    "e9ba9af405ebfbaf85a5b4244008807a3dbacd8475165ffa0eddbb19d704df82",
    "SELECT id, requestedById, reason FROM accounting_requests WHERE id = ? AND kind = ? AND targetId = ? AND status = ?"
  ],
  [
    "03ec4c4f0303a0b06ecaeb83c7d8435576d3042233d0d49c9ac9d51870ea70ab",
    "SELECT id, status FROM credits WHERE deletedAt IS NULL"
  ],
  [
    "ce731292039fe7bdae2d087e06d596dee308ee5f3ab8b981fd827c01f21d31e2",
    "SELECT id, status FROM credits WHERE id = ? AND deletedAt IS NULL"
  ],
  [
    "c7e5bd1234545cfaba828d45c19b1a923cccc13a357a457400d9ff8d686d7ad0",
    "SELECT id, status, daysOverdue, clientName FROM credits WHERE deletedAt IS NULL AND status IN ('active','overdue')"
  ],
  [
    "a6b9c39cd353d4f69f3ff8d4a67af48cd8a238abb6750cb27f79ca71b63974a1",
    "SELECT id, status, interestMinor, lateInterestMinor, paidInterestMinor, paidLateInterestMinor, version FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber"
  ],
  [
    "1c6cd7487d8c304c871361e6c8caf23a6cf43f6eca836c431a34caafd22bdb0a",
    "SELECT id, timestamp, type, description, debit, credit, amountTotal, justification FROM accounting_entries WHERE paymentId = ? ORDER BY timestamp"
  ],
  [
    "32395461387ddf8df5d5819422a58f230ae70df0193344be202147b2c2c5c8de",
    "SELECT id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata FROM audit_logs"
  ],
  [
    "4c603e933bf26c91ba8819985b723329ba01977ff95541ac85776f7622f1bda8",
    "SELECT id, timestamp, userName, action, details, metadata FROM audit_logs WHERE entity = 'payment' AND (metadata LIKE ? OR details LIKE ?) ORDER BY timestamp"
  ],
  [
    "14fee47bb181f867e0e0738dbbeef2b087656dcd28b049f1b862bac69d87da45",
    "SELECT id, totalDueMinor, totalDue, deletedAt FROM credits WHERE id = ?"
  ],
  [
    "ba04f742187e969abe3df4ebc393e5fbb97b5a24820cfe2fb6ecfe6362f6b400",
    "SELECT id, usuario_id, clientName FROM credits WHERE deletedAt IS NULL"
  ],
  [
    "fcf26680ca3225940c6e6728d753e6488bc5509c1769ca756a54f6a354a6b56f",
    "SELECT integrityHash FROM accounting_entries ORDER BY rowid DESC LIMIT 1"
  ],
  [
    "616bf8791a2f2529aa51161fbfd9872836228090993ec87eeb3ae9923dbaaca3",
    "SELECT integrityHash FROM audit_log_chain ORDER BY seq DESC LIMIT 1"
  ],
  [
    "35c324fe10a164aac86d1d390a6ec914682ead540b30f4824739a3e08de3b69a",
    "SELECT l.*, t.timestamp, t.sourceId, t.description FROM ledger_lines l LEFT JOIN ledger_transactions t ON t.id = l.transactionId ORDER BY t.timestamp, l.id"
  ],
  [
    "5558fd1c526ae8992497c24e2af82739e380ff079dc39e59e0687c1732642342",
    "SELECT l.account, l.side, l.amountMinor FROM ledger_lines l JOIN accounting_entries a ON a.id = l.transactionId WHERE a.creditId = ? AND l.account IN ('receivable_interest', 'receivable_late_interest')"
  ],
  [
    "2af771c4bb52f94dbcd351b2146a5f2ba4672ccb6217850beb59d92354ebdd72",
    "SELECT last_insert_rowid() as id"
  ],
  [
    "09cf62af1af1f956cab85182ff520870d326746e8673b1b86554ee1f2b8db809",
    "SELECT lateInterestRate FROM credits WHERE id = ? AND deletedAt IS NULL"
  ],
  [
    "6a707e8fd2fbe3b8dd9ffc84cbf26503d5a00c4b788d58991c23e20252d00e10",
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ],
  [
    "87154d352aba922e5478ffd6c3bbd39dc54e18b2a0a2cc568af9b33788aec220",
    "SELECT name FROM users WHERE id = ?"
  ],
  [
    "cd7425ad37f05c39d77544341e93a100b38f87d46cbfa2509baa808deca16090",
    "SELECT password FROM users WHERE id = ?"
  ],
  [
    "cf0969e483e5e118460d08c565c706515caba2fdc24c09233c2e3266567c7aaa",
    "SELECT paymentDate, allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest, allocatedToInterestMinor, allocatedToLateInterest, allocatedToLateInterestMinor FROM payments WHERE creditId = ? AND deletedAt IS NULL AND status = 'confirmed'"
  ],
  [
    "459f4f20e07f4541b02443d4f186443ea6c6a9ee38a3b954d97811d11caccc93",
    "SELECT paymentDate, allocatedToPrincipalMinor, allocatedToInterestMinor, allocatedToLateInterestMinor FROM payments WHERE creditId = ? AND deletedAt IS NULL AND status = 'confirmed'"
  ],
  [
    "d97d7ae68294c41233c982840721ac90ca3447c1b22adcb80b583cdbceab48d0",
    "SELECT principalAmount, principalAmountMinor, currentBalance, currentBalanceMinor, accruedInterest, accruedInterestMinor, lateInterest, lateInterestMinor, status, version FROM credits WHERE id = ? AND deletedAt IS NULL"
  ],
  [
    "5aefd1f4403a34db82d4c69deb106e17884480f35ca6c9e2db7672b5f5da0cae",
    "SELECT principalAmount, principalAmountMinor, currentBalance, currentBalanceMinor, accruedInterest, accruedInterestMinor, lateInterest, lateInterestMinor, status, version, lateInterestRate FROM credits WHERE id = ? AND deletedAt IS NULL"
  ],
  [
    "2b56645d01d39156e37dccdbafd885e2f64a74c4f4786c09d0359fc9f48f9b79",
    "SELECT principalAmountMinor, principalAmount FROM credits WHERE id = ?"
  ],
  [
    "80b923cccce89f645cf1de26a8b39ef94afa07c0541f5df197186e2eb74e0935",
    "SELECT receiptYear, MAX(receiptSeq) AS last FROM payments WHERE receiptSeq IS NOT NULL GROUP BY receiptYear"
  ],
  [
    "5f31058fd763edc86ec62ff3a08eba55f0ad2a50eb603cca235d4ff28a0df9e4",
    "SELECT receiveMethod FROM clients WHERE id = ?"
  ],
  [
    "4a26b62b13326bfb72bba39780bdbc7931da14e4596dd4fc986a0ba278cb7eb5",
    "SELECT requestedBy FROM accounting_requests WHERE id = ?"
  ],
  [
    "c4e63154d1097670f6ff4d0221f073973eb6ed0f0159aeab91b43b75f70ff423",
    "SELECT requestedById FROM accounting_requests WHERE id = ?"
  ],
  [
    "7d227189f18e58981191f712c39703459a0c213c7bfd95ee424e545a9523cc49",
    "SELECT requestedById, reason FROM accounting_requests WHERE id = ? AND kind = ? AND targetId = ? AND status = ?"
  ],
  [
    "9473539eeb7a03ef9d6914014c204b7932b9772dff258edebd8d8039222886ea",
    "SELECT rescueKey FROM company_settings WHERE id = 1"
  ],
  [
    "af4bcfb2ef9840c9e12ca475261d887997db040c5d35eb799b7206bfb331ffad",
    "SELECT role, name FROM users WHERE id = ?"
  ],
  [
    "d3f84b59aef39baa1e43685a9dcc4e2ca5af15486dcc5729250377a9c8212d54",
    "SELECT role, name, branchId FROM users WHERE id = ?"
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
    "bc893cce743ea9a64865969ed2a16882761aa56b6e104c5f4def9604c5c1b6a0",
    "SELECT side, SUM(amountMinor) AS total FROM ledger_lines WHERE account = ? GROUP BY side"
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
    "2c021af901521ae886e7c709b75389748fd9507d289e11f2094bf5216b51781f",
    "SELECT status FROM credits WHERE id = ? AND deletedAt IS NULL"
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
    "c0e7f5c5e1c20d86c56d8c7b62aa9244a9b561e094e243ac5c3c5a4f54627961",
    "SELECT value FROM shared_settings WHERE key = ?"
  ],
  [
    "ab9e6a70582e6f9918807e03b1d05a18fa6e0f978db576813b166079c5b32cdd",
    "UPDATE accounting_cash_sessions SET expectedMinor = openingMinor + (SELECT COALESCE(SUM(CASE WHEN l.side = 'debit' THEN l.amountMinor ELSE -l.amountMinor END),0) FROM ledger_lines l JOIN ledger_transactions t ON t.id = l.transactionId WHERE l.account = 'cash' AND t.usuario_id = accounting_cash_sessions.operatorId AND t.timestamp >= accounting_cash_sessions.openedAt AND t.timestamp <= ?), countedMinor = ?, reason = ?, closedAt = ?, status = 'closed' WHERE id = ? AND operatorId = ? AND status = 'open'"
  ],
  [
    "977ed6d8f8d5e0aed3c03e10d1d018308a1d944f6d4066d9b17090072ec11df5",
    "UPDATE accounting_entries SET amountPrincipalMinor = CAST(ROUND(amountPrincipal * 100) AS INTEGER), amountInterestMinor = CAST(ROUND(amountInterest * 100) AS INTEGER), amountLateInterestMinor = CAST(ROUND(amountLateInterest * 100) AS INTEGER), amountTotalMinor = CAST(ROUND(amountTotal * 100) AS INTEGER) WHERE amountTotalMinor IS NULL"
  ],
  [
    "2572a962a8e29a719e2277004c259a82b6929c2c37e1f905a5fb5e9039c93e9e",
    "UPDATE accounting_requests SET status = ?, decidedBy = ?, decidedById = ?, decidedAt = ?, decisionReason = ?, resultEntryId = ? WHERE id = ? AND status = 'pending'"
  ],
  [
    "22e691c6d5870e0f4f842e8bdd254456c3d9457c660640203470abf3cfb8d105",
    "UPDATE accounting_requests SET status = ?, decidedBy = ?, decidedById = ?, decidedAt = ?, decisionReason = ?, resultEntryId = ? WHERE id = ? AND status = 'pending' AND requestedById <> ?"
  ],
  [
    "6476ddbcb998b9ac4acf1b52780e347d43c27eacd71f4b6c1b15c7c258b6fac8",
    "UPDATE audit_alerts SET status = ?, assignedTo = ?, assignedToName = ?, dueAt = ?, updatedAt = ?, closedBy = ?, closedByName = ?, closedAt = ? WHERE id = ?"
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
    "89e248af07953f429bab8293993fab7ecb56ad62352e7b6e710bedec3759c3c9",
    "UPDATE clients SET name = COALESCE(?, name), nif = COALESCE(?, nif), phone = COALESCE(?, phone), email = COALESCE(?, email), address = COALESCE(?, address), creditLimit = COALESCE(?, creditLimit), usedCredit = COALESCE(?, usedCredit), availableCredit = COALESCE(?, availableCredit), monthlyIncome = COALESCE(?, monthlyIncome), defaultInterestRate = COALESCE(?, defaultInterestRate), lateInterestRate = COALESCE(?, lateInterestRate), toleranceDays = COALESCE(?, toleranceDays), status = COALESCE(?, status), riskLevel = COALESCE(?, riskLevel), whatsappVerified = COALESCE(?, whatsappVerified), documents = COALESCE(?, documents), bankCoordinates = COALESCE(?, bankCoordinates), receiveMethod = COALESCE(?, receiveMethod), lastContacted = COALESCE(?, lastContacted), usuario_id = COALESCE(?, usuario_id), birthDate = COALESCE(?, birthDate), age = COALESCE(?, age), issueDate = COALESCE(?, issueDate), expiryDate = COALESCE(?, expiryDate), gender = COALESCE(?, gender), maritalStatus = COALESCE(?, maritalStatus), fatherName = COALESCE(?, fatherName), motherName = COALESCE(?, motherName), workInstitution = COALESCE(?, workInstitution), socialSecurityNumber = COALESCE(?, socialSecurityNumber), spouseName = COALESCE(?, spouseName), spouseBi = COALESCE(?, spouseBi), spouseNif = COALESCE(?, spouseNif), spousePhone = COALESCE(?, spousePhone), spouseEmail = COALESCE(?, spouseEmail), legalRepresentative = COALESCE(?, legalRepresentative), legalRepRole = COALESCE(?, legalRepRole) WHERE id = ?"
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
    "8aad810ee85a2d79fcbb22a23e2bbf03a7cd6cede00098829920fd3d50529b77",
    "UPDATE credit_documents SET deletedAt = ?, deletedBy = ? WHERE id = ? AND deletedAt IS NULL"
  ],
  [
    "ccbacb901a7738379ca7b1317d80fa26b2b3dc0e9e4b26b55eb2a56814835dd6",
    "UPDATE credit_import_batches SET rowsCount = ?, totalMinor = ? WHERE id = ?"
  ],
  [
    "33e4dbd33d03d4aa4cf61b3090c167c73acfa843f2ea8051031c261fe776f1eb",
    "UPDATE credit_import_batches SET status = 'cancelled', cancelledAt = ?, cancelledBy = ?, cancelReason = ? WHERE id = ? AND status = 'active'"
  ],
  [
    "9d83675ce459909422a72a81f96f046657517d586ec96c5ad34e377085f346dd",
    "UPDATE credit_installments SET dueDate = ?, principalMinor = ?, interestMinor = ?, status = 'pending', version = version + 1 WHERE id = ? AND version = ?"
  ],
  [
    "1b017e8f100ee7127f60e6f32138eca6d0fd3f185dd36363fdf341ba73f5c7ce",
    "UPDATE credit_installments SET interestMinor = ?, lateInterestMinor = ?, version = version + 1 WHERE id = ? AND version = ?"
  ],
  [
    "bc66207f0d584e23ebcd7e05cbfc7d35d6143256b9bf065ae440d629b93ae32d",
    "UPDATE credit_installments SET lateInterestMinor = ?, version = version + 1 WHERE id = ? AND version = ?"
  ],
  [
    "87f6588e0de7466e3660eecd5c0622a6a4776a8f83bde3fe7176ccffaf383a79",
    "UPDATE credit_installments SET paidPrincipalMinor = ?, paidInterestMinor = ?, paidLateInterestMinor = ?, status = ?, paidAt = ?, version = version + 1 WHERE id = ? AND version = ?"
  ],
  [
    "0b801ec2a638430bea0e053c86a9428ddf8334761c7c8e0bf095a14d1394b4ba",
    "UPDATE credit_installments SET principalMinor = 0, interestMinor = 0, status = 'cancelled', version = version + 1 WHERE id = ? AND version = ?"
  ],
  [
    "7bf64bcbafd625bb2afafac8f8ea96c34f73f140773f75f47ed9157e896a6c63",
    "UPDATE credit_installments SET principalMinor = ?, interestMinor = ?, version = version + 1 WHERE id = ? AND version = ?"
  ],
  [
    "04e23e3b9071ddebc12fb6c3376e226c153a8aed8aa3c37fbcc0f0681fd98d40",
    "UPDATE credit_restructurings SET status = ?, decidedBy = ?, decidedByName = ?, decidedAt = ?, decisionReason = ? WHERE id = ? AND status = 'pending'"
  ],
  [
    "01f65c5d21eace6ca464ea03e2e89f9357e164edc3f4f6d2420a8115f06e6ffb",
    "UPDATE credits SET accruedInterest = ?, accruedInterestMinor = ?, lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?"
  ],
  [
    "f69867e4afcb45c93c007faba8e3422dcab19098b32e3772f8c9ae75d2ebb8f5",
    "UPDATE credits SET accruedInterest = ?, accruedInterestMinor = ?, totalDue = ?, totalDueMinor = ?, dueDate = ?, status = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?"
  ],
  [
    "a725143990d6d068b5042e81ee952a0bef767210d8e5e6ac633b401000cf06c5",
    "UPDATE credits SET currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?, lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, paidInstallments = ?, status = ?, paidAt = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?"
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
    "fe1a161f6325e819fde15144917bf75aa8e7538614876bcd4e6b2ab5aa46b31e",
    "UPDATE credits SET lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?"
  ],
  [
    "bc84effd45338cd5120c3b25b32c3c1da40976c0754c9feaa3d0162666fdaa8b",
    "UPDATE credits SET principalAmount = ?, principalAmountMinor = ?, currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?, totalDue = ?, totalDueMinor = ?, reinforcedAmount = COALESCE(reinforcedAmount, 0) + ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?"
  ],
  [
    "b86f7da2b2e29ca8fe7fc59f5ec8731615f21023afef2ca9fc342220e2fd8c30",
    "UPDATE credits SET principalAmountMinor = CAST(ROUND(principalAmount * 100) AS INTEGER), currentBalanceMinor = CAST(ROUND(currentBalance * 100) AS INTEGER), accruedInterestMinor = CAST(ROUND(accruedInterest * 100) AS INTEGER), lateInterestMinor = CAST(ROUND(lateInterest * 100) AS INTEGER), totalDueMinor = CAST(ROUND(totalDue * 100) AS INTEGER) WHERE principalAmountMinor IS NULL OR currentBalanceMinor IS NULL OR totalDueMinor IS NULL"
  ],
  [
    "37114f51d3fdd55f6a09060b8fba13ae1cb3b20e6f57261a5f80551092afe49d",
    "UPDATE credits SET status = 'cancelled' WHERE id = ? AND status = 'pending_approval'"
  ],
  [
    "c63bc0f11a1d37062e060fa3269964df161dad5b8830c4d63eb4ce9487f666e5",
    "UPDATE credits SET status = 'defaulted', version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?"
  ],
  [
    "6f3d67c740d21a4982b43cb0344f5f5def0c6c412935e1592514b888c5900e43",
    "UPDATE credits SET status = ?, approvedBy = ?, approvalNotes = ?, version = version + 1 WHERE id = ? AND status = 'pending_approval' AND version = ?"
  ],
  [
    "d9bc4b3a9223a1700eb366684680e712cc2f01517bba03a09efe2e930b2879ce",
    "UPDATE credits SET status = ?, daysOverdue = ? WHERE id = ? AND status = ? AND deletedAt IS NULL"
  ],
  [
    "ca9419bff35cfb1376fbbfd1e9374befcdb2f33bba4e38fdf91727df9da47072",
    "UPDATE credits SET targetMonthId = ?, version = version + 1 WHERE id = ? AND version = ?"
  ],
  [
    "3318a33f79c6f7deabcd665a679e1ee65c099db75c73e875ea91243967e1bd94",
    "UPDATE credits SET usuario_id = ? WHERE id = ? AND deletedAt IS NULL"
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
    "44f26ae4719052b151c2d738b9d9a6d3c5946585083eeae1ceb728fb5fdfab1a",
    "UPDATE limit_escalations SET requiredLevelIndex = ?, requiredLevelId = ?, requiredLevelName = ?, levelSince = ?, escalationCount = escalationCount + 1, lastReminderAt = ? WHERE id = ? AND status = 'pending' AND levelSince = ?"
  ],
  [
    "f1bcddbcb8b5f17e23120d2aabf58caef94503757047066405ac4e54f3e91148",
    "UPDATE limit_escalations SET status = 'approved', decidedAt = ?, decidedBy = ?, decidedByName = ? WHERE id = ? AND status = 'pending'"
  ],
  [
    "9dc4292d065a8d278b805be958eabef93a9d7430db554aeadd498f40433d132d",
    "UPDATE limit_escalations SET status = 'cancelled', decidedAt = ?, decidedBy = ?, decidedByName = ? WHERE entityType = 'credit' AND entityId = ? AND status = 'pending'"
  ],
  [
    "18c9b78d78a9fd9783d8699fc57e9b2db73591a1c73422cb7c722b4ce5cd42de",
    "UPDATE limit_escalations SET status = 'rejected', decidedAt = ?, decidedBy = ?, decidedByName = ? WHERE id = ? AND status = 'pending'"
  ],
  [
    "eb7b9e2be6eed43969a563f0c0f939cc99f32f29981b9eec41162ca069d9e0f3",
    "UPDATE limit_exceptions SET status = 'revoked', decidedBy = COALESCE(decidedBy, ?), decidedByName = COALESCE(decidedByName, ?), decidedAt = COALESCE(decidedAt, ?), decisionReason = ? WHERE id = ? AND status IN ('approved','pending')"
  ],
  [
    "b3fe25d0f603e2935f420bb6b167744437317f72c743a7e55ec88b1f5ed291da",
    "UPDATE limit_exceptions SET status = ?, decidedBy = ?, decidedByName = ?, decidedAt = ?, decisionReason = ? WHERE id = ? AND status = 'pending'"
  ],
  [
    "013fbbca9b2291d5c598a48f8c71564fbeddbc4a52d99a145f0ec99f0080a59f",
    "UPDATE limit_policy_versions SET status = ?, decidedBy = ?, decidedByName = ?, decidedAt = ?, decisionReason = ? WHERE id = ? AND status = 'pending'"
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
    "fbd2a8cbcc785f162f6fcf0080d35a5a1344007822efe0336665deac53edf29b",
    "UPDATE payment_import_batches SET rowsCount = ?, totalMinor = ? WHERE id = ?"
  ],
  [
    "1f089585b7fb3c2c695a196fbab98354d0591690044c8e5cf460b2a4710fda13",
    "UPDATE payment_import_batches SET status = 'cancelled', cancelledAt = ?, cancelledBy = ?, cancelReason = ? WHERE id = ? AND status = 'active'"
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
    "b3e1cd0d1db81f4c1b5a6d8538e723fd054c57218812f215ba85591712f405ee",
    "UPDATE payments SET deletedAt = NULL, deletedBy = NULL, restoredAt = ? WHERE id = ? AND deletedAt IS NOT NULL"
  ],
  [
    "91c846e2bdd43ba84ec52d7bfecb78a3207856cd97559bebf672199240ceabde",
    "UPDATE payments SET deletedAt = NULL, restoredAt = ? WHERE id = ?"
  ],
  [
    "f4017e2cd1f7faa5b040eeaa86ce7a356702851f68b32cc2e1c98160c03f0f42",
    "UPDATE payments SET hasProof = 1 WHERE id = ?"
  ],
  [
    "7d33f4544d6af2e42d1166b35822646b25a92c49ef58b38fd9c278b5a01f45e7",
    "UPDATE payments SET receiptYear = ?, receiptSeq = ? WHERE id = ? AND receiptSeq IS NULL"
  ],
  [
    "bc57c8a48d861240ac8564e35f4347073dec217b5e015a9046b56869869188d1",
    "UPDATE payments SET registeredAt = paymentDate WHERE registeredAt IS NULL"
  ],
  [
    "eaf087d75ac305713b3ec5336c741d7d4e0eb769935ed472ad0bf420b2318dd7",
    "UPDATE payments SET status = 'cancelled', cancelledAt = ?, cancelledBy = ?, cancelReason = ? WHERE id = ? AND status = 'pending' AND deletedAt IS NULL"
  ],
  [
    "9b96a3ed8d8018fc133f3cd8d8a28adc65fca08638e806f56f0c7c2ba8165e2b",
    "UPDATE payments SET status = 'cancelled', cancelledAt = ?, cancelledBy = ?, cancelReason = ?, cancelApprovedBy = ?, originalState = ? WHERE id = ? AND deletedAt IS NULL AND status = 'confirmed'"
  ],
  [
    "1ee3ac7607a6ddce504d9b8e7bac92e26a3f73a62cfd94782666ccbc8ed2b467",
    "UPDATE payments SET status = 'confirmed', paymentDate = ?, allocatedToPrincipal = ?, allocatedToPrincipalMinor = ?, allocatedToInterest = ?, allocatedToInterestMinor = ?, allocatedToLateInterest = ?, allocatedToLateInterestMinor = ?, receiptYear = ?, receiptSeq = ?, allocationDetail = ?, balanceAfterMinor = ?, validatedAt = ?, validatedBy = ? WHERE id = ? AND status = 'pending' AND deletedAt IS NULL"
  ],
  [
    "6715ac7164f5bd86d051e1441708959c31580c69349e9025d9588baef5b1a9fc",
    "UPDATE report_schedules SET lastRunMonth = ?, lastRunAt = ?, lastError = ? WHERE id = ?"
  ],
  [
    "f10327fdeff9b931d3d425a969d8addf50641449157d526ae2fa1c81ee86f4e0",
    "UPDATE simulations SET status = ?, convertedCreditId = ?, updatedAt = ? WHERE id = ?"
  ],
  [
    "412a0e76763ac238db35ac2f06609d2e94d98cedf78f9e00df73d1332762ef83",
    "UPDATE suppliers SET deletedAt = datetime('now'), deletedBy = ? WHERE id = ?"
  ],
  [
    "6ab67be9e4abff9f62321f06e31923459f9ad9eab5998d473946c8903d9ba820",
    "UPDATE sync_conflicts SET status = 'accepted', resolutionNote = ?, resolvedAt = ? WHERE id = ? AND status = 'pending'"
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
    "71afed51b7d3de3684d3fa807de4f93f642a1192c1387b32a1688ca8218a10a4",
    "UPDATE users SET lastLogin = ?, lastSeen = ?, status = ?, ip = ? WHERE id = ?"
  ],
  [
    "6ce21c1166690b2cb8f836a5d0fdfac0450fe514ee0f60c847c390b00bdca0c1",
    "UPDATE users SET lastSeen = ?, status = \"active\", ip = COALESCE(NULLIF(ip, \"\"), ?) WHERE id = ?"
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
