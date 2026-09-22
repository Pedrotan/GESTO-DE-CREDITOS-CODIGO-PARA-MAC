export const LEDGER_GENESIS_HASH = '0'.repeat(64);

export const LEDGER_PROTECTION_SQL = [
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_immutable_update
        BEFORE UPDATE ON accounting_entries BEGIN
        SELECT RAISE(ABORT, 'Os lançamentos contabilísticos são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_immutable_delete
        BEFORE DELETE ON accounting_entries BEGIN
        SELECT RAISE(ABORT, 'Os lançamentos contabilísticos são imutáveis; use um estorno'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_payment_unique
        BEFORE INSERT ON accounting_entries
        WHEN NEW.paymentId IS NOT NULL AND NEW.type = 'payment' AND EXISTS (
            SELECT 1 FROM accounting_entries WHERE paymentId = NEW.paymentId AND type = 'payment'
        ) BEGIN SELECT RAISE(ABORT, 'Pagamento já registado no ledger'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_chain
        BEFORE INSERT ON accounting_entries
        WHEN NEW.previousHash <> COALESCE(
            (SELECT integrityHash FROM accounting_entries ORDER BY rowid DESC LIMIT 1),
            '${LEDGER_GENESIS_HASH}'
        ) BEGIN SELECT RAISE(ABORT, 'Cadeia contabilística concorrente ou inválida'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_ledger_transactions_immutable_update
        BEFORE UPDATE ON ledger_transactions BEGIN
        SELECT RAISE(ABORT, 'As transações do ledger são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_ledger_transactions_immutable_delete
        BEFORE DELETE ON ledger_transactions BEGIN
        SELECT RAISE(ABORT, 'As transações do ledger são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_ledger_lines_immutable_update
        BEFORE UPDATE ON ledger_lines BEGIN
        SELECT RAISE(ABORT, 'As linhas do ledger são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_ledger_lines_immutable_delete
        BEFORE DELETE ON ledger_lines BEGIN
        SELECT RAISE(ABORT, 'As linhas do ledger são imutáveis'); END`
];
