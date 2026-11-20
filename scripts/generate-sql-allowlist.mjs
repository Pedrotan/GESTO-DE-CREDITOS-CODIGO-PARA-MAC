import ts from 'typescript';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve('src');
const values = new Set();
const normalize = value => value.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim().replace(/;$/u, '');
const isSql = value => /^(SELECT|WITH|PRAGMA|INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|REINDEX|ANALYZE)\b/iu.test(value.trim());

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(target);
    else if (/\.[cm]?[jt]sx?$/u.test(entry.name)) {
      const sourceText = await readFile(target, 'utf8');
      const source = ts.createSourceFile(target, sourceText, ts.ScriptTarget.Latest, true);
      const visit = node => {
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && isSql(node.text)) {
          const statements = node.text.split(';').map(normalize).filter(Boolean);
          for (const statement of statements) if (isSql(statement)) values.add(statement);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
}

await walk(root);
const byId = [...values].sort().map(value => [createHash('sha256').update(value).digest('hex'), value]);
const allowlistFile = path.resolve('electron/renderer-sql-allowlist.ts');
const legacyFile = path.resolve('electron/renderer-sql-legacy.ts');

// Comandos de escrita de versões anteriores. Um computador ou navegador ainda com a versão antiga continua a enviar
// as alterações com o comando antigo (identificado pelo hash do SQL); sem este registo, a versão nova recusava-as
// como «comando desconhecido» e tudo o que dependia delas (crédito, contrato, lançamentos) falhava em cascata.
// Só acumula: um comando que sai da lista actual passa para aqui e nunca é esquecido.
const readEntries = async (file, name) => {
  const text = await readFile(file, 'utf8').catch(() => '');
  const start = text.indexOf(`${name} = new Map<string, string>(`);
  if (start < 0) return [];
  const open = text.indexOf('(', start) + 1;
  return JSON.parse(text.slice(open, text.indexOf(');\n', open)));
};
// DELETE sem WHERE e eliminações da auditoria nunca são reaplicados vindos de outro dispositivo.
const legacyAllowed = sql => /^(INSERT|UPDATE|DELETE|REPLACE)\b/iu.test(sql)
  && !(/^DELETE\b/iu.test(sql) && (!/\bWHERE\b/iu.test(sql) || /^DELETE FROM audit_logs\b/iu.test(sql)));
const currentIds = new Set(byId.map(([id]) => id));
const legacy = new Map([
  ...await readEntries(legacyFile, 'RENDERER_SQL_LEGACY_BY_ID'),
  ...await readEntries(allowlistFile, 'RENDERER_SQL_BY_ID'),
].filter(([id, sql]) => !currentIds.has(id) && legacyAllowed(sql) && createHash('sha256').update(sql).digest('hex') === id));

const output = `// Gerado por scripts/generate-sql-allowlist.mjs. Não editar manualmente.\n` +
  `export const RENDERER_SQL_ALLOWLIST = new Set<string>(${JSON.stringify([...values].sort(), null, 2)});\n` +
  `export const RENDERER_SQL_BY_ID = new Map<string, string>(${JSON.stringify(byId, null, 2)});\n` +
  `export const RENDERER_SQL_ID_BY_STATEMENT = new Map<string, string>([...RENDERER_SQL_BY_ID].map(([id, sql]) => [sql, id]));\n`;
await writeFile(allowlistFile, output, 'utf8');
await writeFile(legacyFile, `// Gerado por scripts/generate-sql-allowlist.mjs. Não editar manualmente.\n` +
  `// Comandos de escrita de versões anteriores: só servem para aplicar alterações recebidas da nuvem.\n` +
  `export const RENDERER_SQL_LEGACY_BY_ID = new Map<string, string>(${JSON.stringify([...legacy].sort((a, b) => a[1].localeCompare(b[1])), null, 2)});\n`, 'utf8');
console.log(`Generated ${values.size} renderer SQL statements (${legacy.size} from earlier versions kept for sync).`);
