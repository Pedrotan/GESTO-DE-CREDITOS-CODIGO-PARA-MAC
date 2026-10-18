/** Migração transacional: preserva a ficha e o método real (incluindo FLAT). */
export const SIMULATIONS_FLAT_MIGRATION = [
    `CREATE TABLE simulations_flat_v2 (
        id TEXT PRIMARY KEY, reference TEXT, date TEXT NOT NULL, clientName TEXT,
        clientIncome REAL DEFAULT 0, amount REAL DEFAULT 0, term INTEGER DEFAULT 0,
        interestRate REAL DEFAULT 0, method TEXT CHECK(method IN ('price', 'sac', 'flat')),
        riskProfile TEXT CHECK(riskProfile IN ('low', 'medium', 'high')), totalPayment REAL DEFAULT 0,
        monthlyPayment REAL DEFAULT 0, aiAnalysis TEXT, usuario_id TEXT, createdAt TEXT NOT NULL,
        status TEXT DEFAULT 'simulated', clientId TEXT, productId TEXT, verificationCode TEXT,
        expiresAt TEXT, details TEXT, convertedCreditId TEXT, updatedAt TEXT
    )`,
    `INSERT INTO simulations_flat_v2 (id, reference, date, clientName, clientIncome, amount, term,
        interestRate, method, riskProfile, totalPayment, monthlyPayment, aiAnalysis, usuario_id, createdAt,
        status, clientId, productId, verificationCode, expiresAt, details, convertedCreditId, updatedAt)
     SELECT id, reference, date, clientName, clientIncome, amount, term,
        interestRate, method, riskProfile, totalPayment, monthlyPayment, aiAnalysis, usuario_id, createdAt,
        status, clientId, productId, verificationCode, expiresAt, details, convertedCreditId, updatedAt FROM simulations`,
    'DROP TABLE simulations',
    'ALTER TABLE simulations_flat_v2 RENAME TO simulations',
    'CREATE INDEX IF NOT EXISTS idx_simulations_usuario ON simulations(usuario_id)',
    'CREATE INDEX IF NOT EXISTS idx_simulations_date ON simulations(date)',
    'CREATE INDEX IF NOT EXISTS idx_simulations_clientName ON simulations(clientName)',
    'CREATE INDEX IF NOT EXISTS idx_simulations_createdAt ON simulations(createdAt)',
    'CREATE INDEX IF NOT EXISTS idx_simulations_amount ON simulations(amount)',
];
