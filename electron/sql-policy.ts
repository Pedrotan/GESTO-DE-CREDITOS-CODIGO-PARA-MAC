import { RENDERER_SQL_ALLOWLIST } from './renderer-sql-allowlist.ts';
import { isAllowedDynamicUpdate, mutationTable, normalizeSqlText } from '../src/bibliotecas/sync-operacoes.ts';

export { isAllowedDynamicUpdate, mutationTable };
export const normalizeAllowedSql = normalizeSqlText;

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
