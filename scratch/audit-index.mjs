import { appendFileSync,readFileSync } from 'node:fs';
import { AUDIT_CHAIN_SCHEMA_SQL } from '../src/bibliotecas/cadeia-auditoria.ts';
const path='electron/database-indexes.sql';
if(!readFileSync(path,'utf8').includes('trg_audit_chain_insert')) appendFileSync(path,'\n'+AUDIT_CHAIN_SCHEMA_SQL.map(sql=>sql+';').join('\n')+'\n');
JSON.parse(readFileSync('package-lock.json','utf8'));