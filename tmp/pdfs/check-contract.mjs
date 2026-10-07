import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
await build({stdin:{contents:`import {newSoftwareContract} from '../../src/bibliotecas/contrato-software.ts';import {softwareContractPdf} from '../../src/bibliotecas/contrato-software-pdf.ts';export const doc=softwareContractPdf({...newSoftwareContract(),number:'TG-2026-001',client:'Empresa Demonstração, Lda',nif:'5000000000'});`,resolveDir:import.meta.dirname},bundle:true,platform:'node',format:'esm',outfile:'tmp/pdfs/contract-bundle.mjs',logLevel:'silent'});
const {doc}=await import('./contract-bundle.mjs');
writeFileSync('tmp/pdfs/contrato-validacao.pdf',Buffer.from(doc.output('arraybuffer')));
console.log('PDF gerado:',doc.getNumberOfPages(),'páginas');
