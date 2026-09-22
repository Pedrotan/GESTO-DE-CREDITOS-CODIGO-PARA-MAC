import { RENDERER_SQL_ALLOWLIST } from './renderer-sql-allowlist.ts';

export const mutationTable = (sql: string) => sql.match(/\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+["'`\[]?([a-z_][a-z0-9_]*)/iu)?.[1]?.toLowerCase() || null;
export const normalizeAllowedSql = (sql: string) => sql.replace(/--.*$/gmu, '').replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\s+/gu, ' ').trim().replace(/;$/u, '');
const DYNAMIC_UPDATE_COLUMNS: Record<string, Set<string>> = {
  suppliers: new Set(['name', 'phone', 'email', 'nif', 'address', 'notes', 'status']),
  legal_cases: new Set(['clientId', 'creditId', 'stage', 'priority', 'debtAmount', 'lastAction', 'notes', 'updatedAt', 'usuario_id']),
  warranties: new Set(['clientId', 'creditId', 'type', 'description', 'marketValue', 'status', 'location', 'registrationNumber', 'notes', 'updatedAt', 'usuario_id'])
};
export const isAllowedDynamicUpdate = (sql: string) => {
  const normalized = normalizeAllowedSql(sql);
  const match = normalized.match(/^UPDATE\s+([a-z_][a-z0-9_]*)\s+SET\s+(.+)\s+WHERE\s+id\s*=\s*\?$/iu);
  if (!match || !DYNAMIC_UPDATE_COLUMNS[match[1]]) return false;
  const assignments = match[2].split(',').map(value => value.trim().match(/^([a-z_][a-z0-9_]*)\s*=\s*\?$/iu)?.[1]);
  return assignments.length > 0 && assignments.every(column => column && DYNAMIC_UPDATE_COLUMNS[match[1]].has(column));
};
export const assertRendererSqlAllowlisted = (statements: Array<{ sql: string }>, bootstrapOpen = false) => {
  if (bootstrapOpen) return;
  for (const statement of statements) {
    if (!mutationTable(statement.sql)) continue;
    const normalized = normalizeAllowedSql(statement.sql);
    if (!RENDERER_SQL_ALLOWLIST.has(normalized) && !isAllowedDynamicUpdate(normalized)) {
      throw new Error('Comando de dados não registado. Use uma operação de domínio autorizada.');
    }
  }
};
