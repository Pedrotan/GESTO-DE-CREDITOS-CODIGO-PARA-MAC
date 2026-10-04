import test from 'node:test';
import assert from 'node:assert/strict';
import { LINKS_OFICIAIS_DOCUMENTOS, ServicoAngolaAPI } from '../src/servicos/ServicoAngolaAPI.ts';

test('LINKS_OFICIAIS_DOCUMENTOS contém as URLs oficiais solicitadas', () => {
    assert.equal(
        LINKS_OFICIAIS_DOCUMENTOS.PORTAL_CONTRIBUINTE,
        'https://portaldocontribuinte.minfin.gov.ao/consultar-nif-do-contribuinte'
    );
    assert.equal(
        LINKS_OFICIAIS_DOCUMENTOS.SEPE_CONSULTA_NIF,
        'https://sepe.gov.ao/catalogo/eservicos/consulta-de-nif'
    );
});

test('biblioteca @djosekispy/nifvalidation está instalada e exporta métodos esperados', async () => {
    const nifMod = await import('@djosekispy/nifvalidation');
    assert.ok(typeof nifMod.getNifData === 'function');
    assert.ok(nifMod.NifService);
    assert.ok(nifMod.PortalContribuinteProvider);
    assert.ok(nifMod.PuppeteerBrowser);
});

test('ServicoAngolaAPI devolve links oficiais quando serviços automáticos não respondem', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
        throw new Error('Serviço indisponível');
    };
    try {
        const res = await ServicoAngolaAPI.fetchBIData('000000000AA000', 'SINGULAR');
        assert.ok(res);
        assert.equal(res.success, false);
        assert.ok(res.officialLinks);
        assert.equal(res.officialLinks.minfin, LINKS_OFICIAIS_DOCUMENTOS.PORTAL_CONTRIBUINTE);
        assert.equal(res.officialLinks.sepe, LINKS_OFICIAIS_DOCUMENTOS.SEPE_CONSULTA_NIF);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
