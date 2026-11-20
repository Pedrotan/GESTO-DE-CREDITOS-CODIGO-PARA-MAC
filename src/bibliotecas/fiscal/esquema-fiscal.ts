/**
 * Esquema SQLite do módulo fiscal (Facturação Electrónica AGT + SAF-T AO).
 * Aplicado no arranque com o resto de LEDGER_PROTECTION_SQL (por isso os triggers são aceites pelo db-worker).
 *
 * - fiscal_series: séries de numeração atribuídas pela AGT. Cada série pertence a UM dispositivo (deviceId):
 *   com vários computadores sincronizados, cada um numera na sua própria série e nunca há números repetidos.
 * - fiscal_documents: documentos emitidos. Os campos fiscais são imutáveis; só o estado da comunicação muda.
 * - fiscal_agt_requests: registo de cada chamada aos serviços da AGT.
 * - fiscal_saft_exports: histórico dos ficheiros SAF-T gerados, com SHA-256.
 */
export const FISCAL_SCHEMA_SQL = [
    `CREATE TABLE IF NOT EXISTS fiscal_settings (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    updatedBy TEXT
);`,
    `CREATE TABLE IF NOT EXISTS fiscal_series (
    id TEXT PRIMARY KEY,
    seriesCode TEXT NOT NULL UNIQUE,
    seriesYear INTEGER NOT NULL,
    documentType TEXT NOT NULL,
    establishment TEXT NOT NULL DEFAULT 'SEDE',
    contingency INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'A' CHECK(status IN ('A','U','F')),
    firstNumber INTEGER NOT NULL DEFAULT 1,
    lastNumber INTEGER NOT NULL,
    nextNumber INTEGER NOT NULL DEFAULT 1,
    deviceId TEXT NOT NULL,
    simulated INTEGER NOT NULL DEFAULT 0,
    agtSyncedAt TEXT,
    createdAt TEXT NOT NULL,
    CHECK(nextNumber >= firstNumber)
);`,
    `CREATE INDEX IF NOT EXISTS idx_fiscal_series_lookup ON fiscal_series(deviceId, documentType, seriesYear, contingency, status)`,
    `CREATE TABLE IF NOT EXISTS fiscal_documents (
    id TEXT PRIMARY KEY,
    idempotencyKey TEXT NOT NULL UNIQUE,
    documentNo TEXT NOT NULL UNIQUE,
    documentType TEXT NOT NULL,
    seriesId TEXT NOT NULL,
    sequenceNumber INTEGER NOT NULL,
    documentStatus TEXT NOT NULL DEFAULT 'N' CHECK(documentStatus IN ('N','C')),
    rejectedDocumentNo TEXT,
    referenceDocumentNo TEXT,
    documentDate TEXT NOT NULL,
    systemEntryDate TEXT NOT NULL,
    clientId TEXT,
    customerTaxId TEXT NOT NULL,
    customerCountry TEXT NOT NULL DEFAULT 'AO',
    customerName TEXT NOT NULL,
    customerAddress TEXT,
    creditId TEXT,
    paymentId TEXT,
    netTotalMinor INTEGER NOT NULL,
    taxPayableMinor INTEGER NOT NULL,
    grossTotalMinor INTEGER NOT NULL,
    withholdingMinor INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL,
    jwsSignature TEXT NOT NULL,
    saftHash TEXT NOT NULL,
    saftHashControl TEXT NOT NULL DEFAULT '1',
    deviceId TEXT NOT NULL,
    agtStatus TEXT NOT NULL DEFAULT 'pendente' CHECK(agtStatus IN ('pendente','enviado','em_validacao','valido','valido_penal','invalido','erro_envio','simulado','anulado')),
    agtRequestId TEXT,
    agtErrors TEXT NOT NULL DEFAULT '[]',
    agtAttempts INTEGER NOT NULL DEFAULT 0,
    agtLastAttemptAt TEXT,
    agtNextAttemptAt TEXT,
    agtValidatedAt TEXT,
    createdBy TEXT,
    createdByName TEXT,
    createdAt TEXT NOT NULL,
    UNIQUE(seriesId, sequenceNumber)
);`,
    `CREATE INDEX IF NOT EXISTS idx_fiscal_documents_date ON fiscal_documents(documentDate)`,
    `CREATE INDEX IF NOT EXISTS idx_fiscal_documents_agt ON fiscal_documents(agtStatus, agtNextAttemptAt)`,
    `CREATE INDEX IF NOT EXISTS idx_fiscal_documents_payment ON fiscal_documents(paymentId)`,
    `CREATE INDEX IF NOT EXISTS idx_fiscal_documents_request ON fiscal_documents(agtRequestId)`,
    `CREATE TRIGGER IF NOT EXISTS trg_fiscal_documents_immutable
        BEFORE UPDATE OF documentNo, documentType, seriesId, sequenceNumber, documentDate, systemEntryDate, customerTaxId,
            customerName, netTotalMinor, taxPayableMinor, grossTotalMinor, payload, jwsSignature, saftHash ON fiscal_documents
        BEGIN SELECT RAISE(ABORT, 'Documento fiscal imutável: use uma nota de crédito ou uma correcção'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_fiscal_documents_no_delete BEFORE DELETE ON fiscal_documents
        BEGIN SELECT RAISE(ABORT, 'Documentos fiscais não podem ser apagados'); END`,
    `CREATE TABLE IF NOT EXISTS fiscal_agt_requests (
    id TEXT PRIMARY KEY,
    service TEXT NOT NULL,
    requestId TEXT,
    documentNos TEXT NOT NULL DEFAULT '[]',
    httpStatus INTEGER,
    resultCode TEXT,
    durationMs INTEGER,
    error TEXT,
    deviceId TEXT,
    createdAt TEXT NOT NULL
);`,
    `CREATE INDEX IF NOT EXISTS idx_fiscal_agt_requests_created ON fiscal_agt_requests(createdAt)`,
    `CREATE TABLE IF NOT EXISTS fiscal_saft_exports (
    id TEXT PRIMARY KEY,
    fiscalYear INTEGER NOT NULL,
    startDate TEXT NOT NULL,
    endDate TEXT NOT NULL,
    basis TEXT NOT NULL,
    fileName TEXT NOT NULL,
    fileSize INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    invoicesCount INTEGER NOT NULL DEFAULT 0,
    paymentsCount INTEGER NOT NULL DEFAULT 0,
    totalDebitMinor INTEGER NOT NULL DEFAULT 0,
    totalCreditMinor INTEGER NOT NULL DEFAULT 0,
    warnings INTEGER NOT NULL DEFAULT 0,
    xml TEXT NOT NULL,
    createdBy TEXT,
    createdByName TEXT,
    createdAt TEXT NOT NULL
);`,
    `CREATE TRIGGER IF NOT EXISTS trg_fiscal_saft_exports_immutable BEFORE UPDATE ON fiscal_saft_exports
        BEGIN SELECT RAISE(ABORT, 'Exportações SAF-T são imutáveis'); END`,
];
