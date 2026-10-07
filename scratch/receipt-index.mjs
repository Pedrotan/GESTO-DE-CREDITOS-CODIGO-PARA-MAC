import { appendFileSync,readFileSync } from 'node:fs';
import { RECEIPT_SCHEMA_SQL } from '../src/bibliotecas/comprovativo-despesa.ts';
const path='electron/database-indexes.sql';
if(!readFileSync(path,'utf8').includes('trg_receipt_update')) appendFileSync(path,'\n'+RECEIPT_SCHEMA_SQL.map(sql=>sql+';').join('\n')+'\n');