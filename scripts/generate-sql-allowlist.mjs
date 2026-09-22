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
const output = `// Gerado por scripts/generate-sql-allowlist.mjs. Não editar manualmente.\n` +
  `export const RENDERER_SQL_ALLOWLIST = new Set<string>(${JSON.stringify([...values].sort(), null, 2)});\n` +
  `export const RENDERER_SQL_BY_ID = new Map<string, string>(${JSON.stringify([...values].sort().map(value => [createHash('sha256').update(value).digest('hex'), value]), null, 2)});\n` +
  `export const RENDERER_SQL_ID_BY_STATEMENT = new Map<string, string>([...RENDERER_SQL_BY_ID].map(([id, sql]) => [sql, id]));\n`;
await writeFile(path.resolve('electron/renderer-sql-allowlist.ts'), output, 'utf8');
console.log(`Generated ${values.size} renderer SQL statements.`);
