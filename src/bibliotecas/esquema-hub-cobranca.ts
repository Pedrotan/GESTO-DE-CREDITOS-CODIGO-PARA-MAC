export const HUB_COLLECTION_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS hub_collection_settings (id TEXT PRIMARY KEY, data TEXT NOT NULL, updatedAt TEXT NOT NULL, updatedBy TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS hub_collection_clients (clientId TEXT PRIMARY KEY, data TEXT NOT NULL, updatedAt TEXT NOT NULL, updatedBy TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS hub_collection_campaigns (id TEXT PRIMARY KEY, data TEXT NOT NULL, updatedAt TEXT NOT NULL, updatedBy TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS hub_collection_events (id TEXT PRIMARY KEY, clientId TEXT NOT NULL, creditId TEXT, kind TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL, message TEXT NOT NULL, metadata TEXT NOT NULL, actorId TEXT NOT NULL, actorName TEXT NOT NULL, createdAt TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_hub_events_client ON hub_collection_events(clientId, createdAt)`,
  `CREATE TRIGGER IF NOT EXISTS trg_hub_events_update BEFORE UPDATE ON hub_collection_events BEGIN SELECT RAISE(ABORT, 'O histórico de contactos é imutável'); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_hub_events_delete BEFORE DELETE ON hub_collection_events BEGIN SELECT RAISE(ABORT, 'O histórico de contactos é imutável'); END`,
];
