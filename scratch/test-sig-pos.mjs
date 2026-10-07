import fs from 'fs';
import { build } from 'esbuild';

let code = fs.readFileSync('src/bibliotecas/contrato-software-pdf.ts', 'utf8');
code = code.replace("import jsPDF from './pdf-documento';", "import jsPDF from '../src/bibliotecas/pdf-documento';");
code = code.replace("import { contractDesign, contractText, type SoftwareContract } from './contrato-software';", "import { contractDesign, contractText, type SoftwareContract } from '../src/bibliotecas/contrato-software';");
code = code.replace("if(section.title==='Assinaturas'", "if(section.title==='Assinaturas') continue; if(false");
fs.writeFileSync('scratch/test-no-sig.ts', code);

await build({
  entryPoints: ['scratch/test-no-sig.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scratch/test-no-sig.mjs',
  external: ['canvas']
});

const { newSoftwareContract } = await import('./contrato-software.js');
const { softwareContractPdf } = await import('./test-no-sig.mjs');
const c = newSoftwareContract();
const doc = softwareContractPdf(c);
console.log('Pages without Assinaturas in the middle:', doc.getNumberOfPages());
