// Gerado por scripts/generate-sql-allowlist.mjs. Não editar manualmente.
// Comandos de escrita de versões anteriores: só servem para aplicar alterações recebidas da nuvem.
export const RENDERER_SQL_LEGACY_BY_ID = new Map<string, string>([
  [
    "caad8ec1acc8229a7bb4002fc3859893e6f6f7192b25eed4aa80ff75620d399d",
    "DELETE FROM clients WHERE id = ?"
  ],
  [
    "814f197e638c58273138d58cb3a839ce2e1b7870b028ebd0ab194424d5002aac",
    "DELETE FROM credits WHERE id = ?"
  ],
  [
    "5823cab7fdd63eae7eef460f3c01a18d590bab9077a28e3ec64b9ce3adeae2be",
    "DELETE FROM payments WHERE id = ?"
  ],
  [
    "6c3f9e335b0c132f6fa56e01149528f020ee8225ac2b458b41df52a498b9369f",
    "DELETE FROM sqlite_sequence WHERE name IN ('clients', 'credits', 'payments', 'contracts', 'notifications', 'audit_logs', 'chat_messages', 'payment_gateways', 'payment_references')"
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
    "db7e7b429882ef98b78469089e5ce5f76060839e676ca04cf8d258f51b826ca3",
    "INSERT INTO clients (id, name, nif, phone, email, address, creditLimit, usedCredit, availableCredit, monthlyIncome, defaultInterestRate, lateInterestRate, toleranceDays, status, riskLevel, whatsappVerified, documents, bankCoordinates, receiveMethod, lastContacted, createdAt, usuario_id, birthDate, age, issueDate, expiryDate, gender, maritalStatus, fatherName, motherName, workInstitution, socialSecurityNumber, spouseName, spouseBi, spouseNif, spousePhone, spouseEmail, legalRepresentative, legalRepRole, spouseBirthDate, spouseOccupation, spouseIncome, spouseDataRefused, spouseDataRefusedAt, spouseDataRefusedBy, spouseConsentAt, spouseConsentBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "506a72a37a37a2dbef0bf60c0ad8ee93a3e200067f4e095a674d755b38b3aba0",
    "INSERT INTO clients (id, name, nif, phone, email, address, creditLimit, usedCredit, availableCredit, monthlyIncome, defaultInterestRate, lateInterestRate, toleranceDays, status, riskLevel, whatsappVerified, documents, bankCoordinates, receiveMethod, lastContacted, createdAt, usuario_id, birthDate, age, issueDate, expiryDate, gender, maritalStatus, fatherName, motherName, workInstitution, socialSecurityNumber, spouseName, spouseBi, spouseNif, spousePhone, spouseEmail, legalRepresentative, legalRepRole) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
    "0f4edfc6e8bbf188b8d77495851bf29a84fe58e2e998b9e8e8a8d6339af2963b",
    "INSERT INTO credits (id, clientId, clientName, principalAmount, principalAmountMinor, interestRate, lateInterestRate, installments, paidInstallments, currentBalance, currentBalanceMinor, accruedInterest, accruedInterestMinor, lateInterest, lateInterestMinor, totalDue, totalDueMinor, version, amortizationMethod, startDate, dueDate, status, creditNumber, createdAt, requestedBy, requestedAt, approvedBy, approvalNotes, usuario_id, targetMonthId, supplierId, supplierProfitRate) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ],
  [
    "bc0f875159af9da57c225dad6469d12b54e5ef1d68759b465e01c0aa6af00844",
    "INSERT INTO simulations ( id, reference, date, clientName, clientIncome, amount, term, interestRate, method, riskProfile, totalPayment, monthlyPayment, aiAnalysis, usuario_id, createdAt ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ],
  [
    "df998797996d43d95de71e39e89241d169bd52689fcc448c18c98df931fc6086",
    "INSERT OR REPLACE INTO company_settings ( id, name, nif, address, logo, reportLogo, watermarkLogo, currency, customClauses, rescueKey, phone, primaryColor, secondaryColor, email, whatsapp, whatsappAutoNotify, whatsappVerified, syncEnabled, syncUrl, syncApiKey, syncPasskey, lastSync, maintenanceMode, sessionTimeout, allowedModulesDuringMaintenance, enableGatewaysModule, enableProfileActivity, digitalSignatureEnabled, authorizedSigners, bankingInfo, contractTemplates, lastBackupDate, installDate, financialLock, licenseKey, enableGatewaysModuleAdminOnly, enableProfileActivityAdminOnly, enableWarrantiesModule, enableWarrantiesModuleAdminOnly, enableLegalModule, enableLegalModuleAdminOnly, enableScoringModule, enableScoringModuleAdminOnly, location, enableSuppliersModule, enableSuppliersModuleAdminOnly, enableMultiTenant ) VALUES ( 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )"
  ],
  [
    "22e691c6d5870e0f4f842e8bdd254456c3d9457c660640203470abf3cfb8d105",
    "UPDATE accounting_requests SET status = ?, decidedBy = ?, decidedById = ?, decidedAt = ?, decisionReason = ?, resultEntryId = ? WHERE id = ? AND status = 'pending' AND requestedById <> ?"
  ],
  [
    "9b3cbe6d16ceb7fa743613315b61019d5b35b526401dcf6039bc037cab8c8c8b",
    "UPDATE clients SET deletedAt = ? WHERE id = ?"
  ],
  [
    "5566ac857b1b80d1c914fa6f1eebf723587e95c49d22f62e3044b0f82d90fcae",
    "UPDATE clients SET deletedAt = NULL WHERE id = ? AND deletedAt = ?"
  ],
  [
    "8de17c2ce2fe717a10fff4708d6a6460a59536f37d5cfe7fc2e6aea082bf1be4",
    "UPDATE clients SET name = COALESCE(?, name), nif = COALESCE(?, nif), phone = COALESCE(?, phone), email = COALESCE(?, email), address = COALESCE(?, address), creditLimit = COALESCE(?, creditLimit), usedCredit = COALESCE(?, usedCredit), availableCredit = COALESCE(?, availableCredit), monthlyIncome = COALESCE(?, monthlyIncome), defaultInterestRate = COALESCE(?, defaultInterestRate), lateInterestRate = COALESCE(?, lateInterestRate), toleranceDays = COALESCE(?, toleranceDays), status = COALESCE(?, status), riskLevel = COALESCE(?, riskLevel), whatsappVerified = COALESCE(?, whatsappVerified), documents = COALESCE(?, documents), bankCoordinates = COALESCE(?, bankCoordinates), receiveMethod = COALESCE(?, receiveMethod), lastContacted = COALESCE(?, lastContacted), usuario_id = COALESCE(?, usuario_id), birthDate = COALESCE(?, birthDate), age = COALESCE(?, age), issueDate = COALESCE(?, issueDate), expiryDate = COALESCE(?, expiryDate), gender = COALESCE(?, gender), maritalStatus = COALESCE(?, maritalStatus), fatherName = COALESCE(?, fatherName), motherName = COALESCE(?, motherName), workInstitution = COALESCE(?, workInstitution), socialSecurityNumber = COALESCE(?, socialSecurityNumber) WHERE id = ?"
  ],
  [
    "89e248af07953f429bab8293993fab7ecb56ad62352e7b6e710bedec3759c3c9",
    "UPDATE clients SET name = COALESCE(?, name), nif = COALESCE(?, nif), phone = COALESCE(?, phone), email = COALESCE(?, email), address = COALESCE(?, address), creditLimit = COALESCE(?, creditLimit), usedCredit = COALESCE(?, usedCredit), availableCredit = COALESCE(?, availableCredit), monthlyIncome = COALESCE(?, monthlyIncome), defaultInterestRate = COALESCE(?, defaultInterestRate), lateInterestRate = COALESCE(?, lateInterestRate), toleranceDays = COALESCE(?, toleranceDays), status = COALESCE(?, status), riskLevel = COALESCE(?, riskLevel), whatsappVerified = COALESCE(?, whatsappVerified), documents = COALESCE(?, documents), bankCoordinates = COALESCE(?, bankCoordinates), receiveMethod = COALESCE(?, receiveMethod), lastContacted = COALESCE(?, lastContacted), usuario_id = COALESCE(?, usuario_id), birthDate = COALESCE(?, birthDate), age = COALESCE(?, age), issueDate = COALESCE(?, issueDate), expiryDate = COALESCE(?, expiryDate), gender = COALESCE(?, gender), maritalStatus = COALESCE(?, maritalStatus), fatherName = COALESCE(?, fatherName), motherName = COALESCE(?, motherName), workInstitution = COALESCE(?, workInstitution), socialSecurityNumber = COALESCE(?, socialSecurityNumber), spouseName = COALESCE(?, spouseName), spouseBi = COALESCE(?, spouseBi), spouseNif = COALESCE(?, spouseNif), spousePhone = COALESCE(?, spousePhone), spouseEmail = COALESCE(?, spouseEmail), legalRepresentative = COALESCE(?, legalRepresentative), legalRepRole = COALESCE(?, legalRepRole) WHERE id = ?"
  ],
  [
    "b8b3e41aa4ffdfa17ea7ea60603a7cd739caed63f45683a85dbe58eaffad9e1b",
    "UPDATE clients SET name = COALESCE(?, name), nif = COALESCE(?, nif), phone = COALESCE(?, phone), email = COALESCE(?, email), address = COALESCE(?, address), creditLimit = COALESCE(?, creditLimit), usedCredit = COALESCE(?, usedCredit), availableCredit = COALESCE(?, availableCredit), monthlyIncome = COALESCE(?, monthlyIncome), defaultInterestRate = COALESCE(?, defaultInterestRate), lateInterestRate = COALESCE(?, lateInterestRate), toleranceDays = COALESCE(?, toleranceDays), status = COALESCE(?, status), riskLevel = COALESCE(?, riskLevel), whatsappVerified = COALESCE(?, whatsappVerified), documents = COALESCE(?, documents), bankCoordinates = COALESCE(?, bankCoordinates), receiveMethod = COALESCE(?, receiveMethod), lastContacted = COALESCE(?, lastContacted), usuario_id = COALESCE(?, usuario_id), birthDate = COALESCE(?, birthDate), age = COALESCE(?, age), issueDate = COALESCE(?, issueDate), expiryDate = COALESCE(?, expiryDate), gender = COALESCE(?, gender), maritalStatus = COALESCE(?, maritalStatus), fatherName = COALESCE(?, fatherName), motherName = COALESCE(?, motherName), workInstitution = COALESCE(?, workInstitution), socialSecurityNumber = COALESCE(?, socialSecurityNumber), spouseName = COALESCE(?, spouseName), spouseBi = COALESCE(?, spouseBi), spouseNif = COALESCE(?, spouseNif), spousePhone = COALESCE(?, spousePhone), spouseEmail = COALESCE(?, spouseEmail), legalRepresentative = COALESCE(?, legalRepresentative), legalRepRole = COALESCE(?, legalRepRole), spouseBirthDate = COALESCE(?, spouseBirthDate), spouseOccupation = COALESCE(?, spouseOccupation), spouseIncome = COALESCE(?, spouseIncome), spouseDataRefused = COALESCE(?, spouseDataRefused), spouseDataRefusedAt = COALESCE(?, spouseDataRefusedAt), spouseDataRefusedBy = COALESCE(?, spouseDataRefusedBy), spouseConsentAt = COALESCE(?, spouseConsentAt), spouseConsentBy = COALESCE(?, spouseConsentBy) WHERE id = ?"
  ],
  [
    "e24875948939cd08903563ef3a5f6bd7acf48222af13dd5800821a9481a3a41a",
    "UPDATE credits SET currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?, lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, paidInstallments = ?, status = ?, paidAt = NULL, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?"
  ],
  [
    "03864d3fff319d1d7eca3b7a962fd286ba64bb6b5c8aafd8dfcaf3fd38e989d5",
    "UPDATE credits SET principalAmount = ?, principalAmountMinor = ?, currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?, totalDue = ?, totalDueMinor = ?, reinforcedAmount = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?"
  ],
  [
    "bd85f354853ace6e24bb4f14efb68fab2a0bed4cce494e54d0de3d1cf69ce329",
    "UPDATE credits SET principalAmount = COALESCE(?, principalAmount), principalAmountMinor = COALESCE(?, principalAmountMinor), interestRate = COALESCE(?, interestRate), lateInterestRate = COALESCE(?, lateInterestRate), installments = COALESCE(?, installments), paidInstallments = COALESCE(?, paidInstallments), currentBalance = COALESCE(?, currentBalance), currentBalanceMinor = COALESCE(?, currentBalanceMinor), status = COALESCE(?, status), accruedInterest = COALESCE(?, accruedInterest), accruedInterestMinor = COALESCE(?, accruedInterestMinor), lateInterest = COALESCE(?, lateInterest), lateInterestMinor = COALESCE(?, lateInterestMinor), totalDue = COALESCE(?, totalDue), totalDueMinor = COALESCE(?, totalDueMinor), daysOverdue = COALESCE(?, daysOverdue), startDate = COALESCE(?, startDate), dueDate = COALESCE(?, dueDate), approvedBy = COALESCE(?, approvedBy), approvalNotes = COALESCE(?, approvalNotes), requestedBy = COALESCE(?, requestedBy), requestedAt = COALESCE(?, requestedAt), creditNumber = COALESCE(?, creditNumber), paidAt = COALESCE(?, paidAt), usuario_id = COALESCE(?, usuario_id), targetMonthId = COALESCE(?, targetMonthId), supplierId = COALESCE(?, supplierId), supplierProfitRate = COALESCE(?, supplierProfitRate), version = version + 1 WHERE id = ? AND version = ?"
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
    "9091f3e8264d2ba183704a8eb7c40258aa76e992ec9e92298db103596c067d5d",
    "UPDATE payments SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ? AND deletedAt IS NULL"
  ],
  [
    "ef6551e3ab5d9c6c6713ea398c1c1fb2f3c3e1c24d15c78dd7b7b256e81d767d",
    "UPDATE sync_conflicts SET status = 'accepted', resolutionNote = ?, resolvedAt = ? WHERE status = 'pending' AND (entityType = ? OR entityType = 'desconhecido') AND (entityId = ? OR instr(operation, ?) > 0)"
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
    "6ce21c1166690b2cb8f836a5d0fdfac0450fe514ee0f60c847c390b00bdca0c1",
    "UPDATE users SET lastSeen = ?, status = \"active\", ip = COALESCE(NULLIF(ip, \"\"), ?) WHERE id = ?"
  ],
  [
    "8bb9ac2e2b9de1cc3d7bef4f4152e272262b2219acdc37ed61ac058cc6b01134",
    "UPDATE users SET password = ?, status = \"active\", failedAttempts = 0, blockedAt = NULL WHERE id = ?"
  ],
  [
    "16838e19cb92dfd487e720f7a912096d41a7864400967283e6537f4356abf971",
    "UPDATE users SET status = \"active\", failedAttempts = 0, blockedAt = NULL WHERE id = ?"
  ]
]);
