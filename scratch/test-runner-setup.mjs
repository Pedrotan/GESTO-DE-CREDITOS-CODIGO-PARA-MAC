import { build } from 'esbuild';
import fs from 'fs';

// Script to test precise pagination and justification
const testCode = `
import jsPDF from '../src/bibliotecas/pdf-documento';
import { contractDesign, contractText, type SoftwareContract } from '../src/bibliotecas/contrato-software';
import { CREATO_DISPLAY_REGULAR_B64, CREATO_DISPLAY_BOLD_B64 } from '../src/bibliotecas/fonte-creato-display';

export function testSoftwareContractPdf(contract: SoftwareContract, logo?: string) {
    const doc = new jsPDF();
    doc.addFileToVFS('CreatoDisplay-Regular.otf', CREATO_DISPLAY_REGULAR_B64);
    doc.addFont('CreatoDisplay-Regular.otf', 'CreatoDisplay', 'normal');
    doc.addFileToVFS('CreatoDisplay-Bold.otf', CREATO_DISPLAY_BOLD_B64);
    doc.addFont('CreatoDisplay-Bold.otf', 'CreatoDisplay', 'bold');

    console.log('Doc initialized with CreatoDisplay');
    return doc;
}
`;

fs.writeFileSync('scratch/test-runner.ts', testCode);
await build({
  entryPoints: ['scratch/test-runner.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scratch/test-runner.mjs',
  external: ['canvas']
});
const { testSoftwareContractPdf } = await import('./test-runner.mjs');
testSoftwareContractPdf({});
console.log('Build & run OK!');
