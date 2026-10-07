import { build } from 'esbuild';
import fs from 'fs';

let code = fs.readFileSync('src/bibliotecas/contrato-software-pdf.ts', 'utf8');
code = code.replace("import jsPDF from './pdf-documento';", "import jsPDF from '../src/bibliotecas/pdf-documento';");
code = code.replace("import { contractDesign, contractText, type SoftwareContract } from './contrato-software';", "import { contractDesign, contractText, type SoftwareContract } from '../src/bibliotecas/contrato-software';");
code = code.replace('write(section.title,true);', 'console.log(section.title, "--> Page:", doc.getNumberOfPages()); write(section.title, true);');
fs.writeFileSync('scratch/trace.ts', code);

await build({
  entryPoints: ['scratch/trace.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scratch/trace.mjs',
  external: ['canvas']
});

const { newSoftwareContract } = await import('./contrato-software.js');
const { softwareContractPdf } = await import('./trace.mjs');
softwareContractPdf(newSoftwareContract());
