import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUNICIPIOS_POR_PROVINCIA, PROVINCIAS_DPA, municipioDPA, municipiosDaProvincia, provinciaDPA } from '../src/bibliotecas/dpa-angola.ts';

test('nova DPA: 21 províncias e 326 municípios, sem repetidos dentro da mesma província', () => {
    assert.equal(PROVINCIAS_DPA.length, 21);
    const total = Object.values(MUNICIPIOS_POR_PROVINCIA).reduce((soma, lista) => soma + lista.length, 0);
    assert.equal(total, 326);
    for (const [provincia, lista] of Object.entries(MUNICIPIOS_POR_PROVINCIA)) {
        assert.equal(new Set(lista).size, lista.length, provincia);
    }
    assert.equal(MUNICIPIOS_POR_PROVINCIA['Icolo e Bengo'].length, 7);
    assert.equal(MUNICIPIOS_POR_PROVINCIA.Malanje.length, 27);
    assert.equal(MUNICIPIOS_POR_PROVINCIA.Luanda.length, 16);
});

test('província escrita de outras formas corresponde ao nome oficial; «Cuando Cubango» já não existe', () => {
    assert.equal(provinciaDPA('LUANDA'), 'Luanda');
    assert.equal(provinciaDPA('Província de Kwanza Norte, Angola'), 'Cuanza Norte');
    assert.equal(provinciaDPA('cuanza-sul'), 'Cuanza Sul');
    assert.equal(provinciaDPA('Uige'), 'Uíge');
    assert.equal(provinciaDPA('Icolo e Bengo'), 'Icolo e Bengo');
    assert.equal(provinciaDPA('Cuando Cubango'), '');
    assert.equal(provinciaDPA(''), '');
    assert.equal(provinciaDPA(undefined), '');
});

test('municípios da província escolhida, por ordem alfabética', () => {
    const luanda = municipiosDaProvincia('Luanda');
    assert.equal(luanda[0], 'Belas');
    assert.ok(luanda.includes('Talatona'));
    assert.ok(!luanda.includes('Catete'));
    assert.ok(municipiosDaProvincia('Icolo e Bengo').includes('Catete'));
    assert.deepEqual(municipiosDaProvincia('Cuando Cubango'), []);
    assert.equal(municipioDPA('Luanda', 'talatona'), 'Talatona');
    assert.equal(municipioDPA('Luanda', 'Catete'), '');
    assert.equal(municipioDPA('Huambo', 'Caala'), 'Caála');
});
