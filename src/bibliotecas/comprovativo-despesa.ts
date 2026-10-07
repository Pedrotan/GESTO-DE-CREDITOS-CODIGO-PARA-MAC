export type ExpenseReceipt={name:string;mime:string;data:string};
export const RECEIPT_SCHEMA_SQL=[
    `CREATE TABLE IF NOT EXISTS accounting_receipts (id TEXT PRIMARY KEY, entryId TEXT NOT NULL UNIQUE, fileName TEXT NOT NULL, mime TEXT NOT NULL,
        data TEXT NOT NULL, digest TEXT NOT NULL, createdAt TEXT NOT NULL)`,
    `CREATE TRIGGER IF NOT EXISTS trg_receipt_update BEFORE UPDATE ON accounting_receipts BEGIN SELECT RAISE(ABORT,'O comprovativo contabilístico é imutável'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_receipt_delete BEFORE DELETE ON accounting_receipts BEGIN SELECT RAISE(ABORT,'O comprovativo contabilístico é imutável'); END`
];
export function validateReceipt(receipt:ExpenseReceipt) {
    if(!receipt.name || !['application/pdf','image/png','image/jpeg'].includes(receipt.mime) || !/^[A-Za-z0-9+/]+={0,2}$/.test(receipt.data) || receipt.data.length>700000)
        throw new Error('Comprovativo inválido. Use PDF, PNG ou JPEG até 512 KB.');
}