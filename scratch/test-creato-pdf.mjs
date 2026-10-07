import fs from 'fs';
import { jsPDF } from 'jspdf';
import { newSoftwareContract } from './contrato-software.js';
import { CREATO_DISPLAY_REGULAR_B64, CREATO_DISPLAY_BOLD_B64 } from '../src/bibliotecas/fonte-creato-display.js';

console.log('Testing font registration...');
const doc = new jsPDF();
doc.addFileToVFS('CreatoDisplay-Regular.otf', CREATO_DISPLAY_REGULAR_B64);
doc.addFont('CreatoDisplay-Regular.otf', 'CreatoDisplay', 'normal');
doc.addFileToVFS('CreatoDisplay-Bold.otf', CREATO_DISPLAY_BOLD_B64);
doc.addFont('CreatoDisplay-Bold.otf', 'CreatoDisplay', 'bold');

doc.setFont('CreatoDisplay', 'bold');
doc.setFontSize(18);
doc.text('Contrato de Licenciamento e Venda de Software', 24, 40);

doc.setFont('CreatoDisplay', 'normal');
doc.setFontSize(10);
doc.text('Texto de teste em Creato Display com acentuação: República de Angola, Cláusula 1.ª', 24, 60);

console.log('Successfully created test PDF with Creato Display!');
