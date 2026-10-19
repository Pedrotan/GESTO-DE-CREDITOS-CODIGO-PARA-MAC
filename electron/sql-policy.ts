import { RENDERER_SQL_ALLOWLIST } from './renderer-sql-allowlist.ts';
import { isAllowedDynamicUpdate, mutationTable, normalizeSqlText } from '../src/bibliotecas/sync-operacoes.ts';

export { isAllowedDynamicUpdate, mutationTable };
export const normalizeAllowedSql = normalizeSqlText;

// Perfil e gestão de utilizadores (updateUser monta o SET com os campos alterados). Quem pode alterar o quê é
// decidido a seguir por assertUserSqlAuthorized/checkUserMutation. Segredos e estado de segurança (MFA, conta
// principal, tentativas e bloqueios) só mudam pelas operações próprias do processo principal.
const USER_UPDATE_COLUMNS = new Set(['name', 'email', 'username', 'role', 'avatar', 'permissions', 'status', 'password',
  'signature', 'permissionExceptions', 'approvalLimits', 'dataScope', 'branchId', 'branchName', 'temporaryRoleExpiry', 'mustChangePassword']);

export const isAllowedUserUpdate = (sql: string) => {
  const match = normalizeAllowedSql(sql).match(/^UPDATE\s+users\s+SET\s+(.+)\s+WHERE\s+id\s*=\s*\?$/iu);
  if (!match) return false;
  const columns = match[1].split(',').map(value => value.trim().match(/^([a-z_][a-z0-9_]*)\s*=\s*\?$/iu)?.[1]);
  return columns.length > 0 && columns.every(column => column && USER_UPDATE_COLUMNS.has(column));
};

export const assertRendererSqlAllowlisted = (statements: Array<{ sql: string }>, bootstrapOpen = false) => {
  if (bootstrapOpen) return;
  for (const statement of statements) {
    if (!mutationTable(statement.sql)) continue;
    const normalized = normalizeAllowedSql(statement.sql);
    if (!RENDERER_SQL_ALLOWLIST.has(normalized) && !isAllowedDynamicUpdate(normalized) && !isAllowedUserUpdate(normalized)) {
      throw new Error('Comando de dados não registado. Use uma operação de domínio autorizada.');
    }
  }
};
