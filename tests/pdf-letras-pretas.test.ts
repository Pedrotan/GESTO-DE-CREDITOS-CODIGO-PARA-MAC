import test from 'node:test';
import assert from 'node:assert/strict';
import jsPDF, { lockBrandTextToBlack } from '../src/bibliotecas/pdf-documento.ts';

test('letras dos relatórios ficam a preto com cores da marca personalizadas; branco e cores de estado mantêm-se', () => {
    const doc = new jsPDF();
    lockBrandTextToBlack(doc, [[243, 112, 33], [11, 107, 79]]);
    doc.setTextColor(11, 107, 79);
    assert.equal(doc.getTextColor(), '#000000');
    doc.setTextColor('#F37021');
    assert.equal(doc.getTextColor(), '#000000');
    doc.setTextColor(255, 255, 255);
    assert.equal(doc.getTextColor(), '#ffffff');
    doc.setTextColor(16, 185, 129);
    assert.notEqual(doc.getTextColor(), '#000000');
});
