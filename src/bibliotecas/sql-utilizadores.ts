// No computador o processo principal recusa leituras que incluam senhas ou segredos de 2FA (SELECT * incluído):
// a lista de utilizadores pede só as restantes colunas, a partir do PRAGMA table_info(users).
export const SECRET_USER_COLUMNS = new Set(['password', 'twoFactorSecret', 'mfaRecoveryCodes']);

export const usersListSqlFromColumns = (columnNames: string[]) => {
    const columns = columnNames.filter(name => /^[A-Za-z_]\w*$/.test(name) && !SECRET_USER_COLUMNS.has(name));
    if (columns.length === 0) throw new Error('A tabela users não tem colunas legíveis.');
    return `SELECT ${columns.map(name => `"${name}"`).join(', ')} FROM users`;
};
