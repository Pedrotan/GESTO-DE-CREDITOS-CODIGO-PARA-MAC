import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import jsPDF, { setPdfWatermark } from '../src/bibliotecas/pdf-documento.ts';

const png = 'data:image/png;base64,' + readFileSync(new URL('../public/favicon.png', import.meta.url)).toString('base64');

test('marca de água em todas as páginas, sem duplicar em exportações repetidas', () => {
    const doc = new jsPDF();
    setPdfWatermark(doc, png);
    doc.text('Página 1', 20, 20);
    doc.addPage();
    doc.text('Página 2', 20, 20);
    const output = doc.output();
    assert.equal((output.match(/\/I\d+ Do/g) || []).length, 2);
    assert.ok(output.includes('/ca 0.08'));
    assert.equal(doc.getCurrentPageInfo().pageNumber, 2);
    assert.equal(doc.output(), output);
    doc.addPage();
    assert.equal((doc.output().match(/\/I\d+ Do/g) || []).length, 3);
});

test('sem marca configurada não desenha imagem', () => {
    const doc = new jsPDF();
    setPdfWatermark(doc, null);
    assert.equal((doc.output().match(/\/I\d+ Do/g) || []).length, 0);
});

test('marca configurada no Master cobre os PDFs sem configuração individual',()=>{
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
    try {
        Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>key==='tango_master_watermark'?png:null}});
        const doc=new jsPDF();doc.addPage();
        setPdfWatermark(doc,undefined);
        assert.equal((doc.output().match(/\/I\d+ Do/g)||[]).length,2);
    }finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');}
});
