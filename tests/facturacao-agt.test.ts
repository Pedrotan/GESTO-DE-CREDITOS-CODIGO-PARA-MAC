import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    arredondarImposto, construirDocumento, linhasDoPagamento, mensagemHashSaft, nifAngolanoValido, payloadAssinaturaDocumento,
    round2, temErros, urlQrAgt, validarDocumento, dataHoraLuanda,
} from '../src/bibliotecas/fiscal/regras.ts';
import { construirSaft, prevalidarSaft, type LinhaSaft } from '../src/bibliotecas/fiscal/saft-ao.ts';
import type { AgtDocumento, ConfigFiscal, EmpresaFiscal } from '../src/bibliotecas/fiscal/tipos.ts';
// @ts-ignore — módulo JS
import { assinarDocumento, chamarAgt, hashSaft, verificarJws } from '../vercel-api/_agt-nucleo.js';

const { privateKey: chaveContribuinte } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const { privateKey: chaveSaft } = generateKeyPairSync('rsa', { modulusLength: 1024 });
const NIF = '5001032771';

const config: Pick<ConfigFiscal, 'perfis' | 'eacCode' | 'dataAdesao'> = {
    perfis: {
        juros: { label: 'Juros', operationType: 'SIF', productCode: 'JUROS', taxType: 'IVA', taxCode: 'ISE', taxPercentage: 0, taxExemptionCode: 'M00', taxExemptionReason: 'Isento' },
        juros_mora: { label: 'Mora', operationType: 'SIF', productCode: 'JUROS-MORA', taxType: 'IVA', taxCode: 'ISE', taxPercentage: 0, taxExemptionCode: 'M00', taxExemptionReason: 'Isento' },
        imposto_selo_capital: { label: 'IS', operationType: 'SIF', productCode: 'IS-CREDITO', taxType: 'IS', taxCode: '17.1', taxPercentage: 0.5 },
    },
};
const empresa: EmpresaFiscal = { nif: NIF, nome: 'BRAVALDO - COMERCIO E SERVIÇOS, LDA', morada: 'Benguela', cidade: 'Benguela', telefone: '+244900000000' };

test('arredondamentos da AGT: imposto por excesso, totais meio para cima', () => {
    assert.equal(arredondarImposto(23.144), 23.15);
    assert.equal(arredondarImposto(0.001844), 0.01);
    assert.equal(arredondarImposto(5.9999999), 6);
    assert.equal(round2(100.125), 100.13);
    assert.equal(round2(99990.1249999), 99990.12);
    assert.equal(round2(1.005), 1.01);
});

test('pagamento de prestação: só juros e mora são facturados, nunca o capital', () => {
    const linhas = linhasDoPagamento({ numeroCredito: 'CR0004', juros: 12_345.67, jurosMora: 500, referencia: 'recibo RC 2026/14' });
    assert.deepEqual(linhas.map(l => l.tipo), ['juros', 'juros_mora']);
    const doc = construirDocumento({ tipo: 'FR', numero: 'FR FR26S1N/1', data: '2026-10-25', dataSistema: '2026-10-25T09:00:00', cliente: { nif: '004567890LA041', nome: 'Ana Paula Mendes' }, linhas }, config);
    assert.equal(doc.documentTotals.netTotal, 12_845.67);
    assert.equal(doc.documentTotals.taxPayable, 0);
    assert.equal(doc.lines![0].taxes![0].taxExemptionCode, 'M00');
    assert.equal(temErros(validarDocumento(doc, { config })), false);
    assert.deepEqual(Object.keys(payloadAssinaturaDocumento(doc, NIF)), ['documentNo', 'taxRegistrationNumber', 'documentType', 'documentDate', 'customerTaxID', 'customerCountry', 'companyName', 'documentTotals']);
});

test('linha isenta sem código de motivo é bloqueada antes do envio', () => {
    const doc = construirDocumento({ tipo: 'FR', numero: 'FR FR26S1N/2', data: '2026-10-25', dataSistema: '2026-10-25T09:00:00', cliente: { nome: 'Cliente' }, linhas: [{ tipo: 'juros', descricao: 'Juros', valor: 100 }] }, { perfis: {} });
    assert.equal(doc.customerTaxID, '999999999');
    assert.ok(validarDocumento(doc, { config: { perfis: {} } }).some(p => p.nivel === 'erro' && /isenção/.test(p.mensagem)));
});

test('nota de crédito: débito, documento de origem obrigatório; totais adulterados são detectados', () => {
    const nc = construirDocumento({ tipo: 'NC', numero: 'NC NC26S1N/1', data: '2026-10-25', dataSistema: '2026-10-25T10:00:00', cliente: { nif: NIF, nome: 'X' },
        referencia: { documento: 'FR FR26S1N/1', motivo: 'Erro no valor' }, linhas: [{ tipo: 'juros', descricao: 'Juros', valor: 1000 }] }, config);
    assert.equal(nc.lines![0].debitAmount, 1000);
    assert.equal(nc.lines![0].referenceInfo?.reference, 'FR FR26S1N/1');
    assert.equal(temErros(validarDocumento(nc, { config })), false);
    const codigos = validarDocumento({ ...nc, documentTotals: { taxPayable: 1, netTotal: 2, grossTotal: 4 } }, { config }).map(p => p.codigo);
    for (const c of ['E22', 'E23', 'E24']) assert.ok(codigos.includes(c), c);
});

test('NIF angolano, data de Luanda e URL do QR Code AGT', () => {
    assert.ok(nifAngolanoValido('5001032771'));
    assert.ok(nifAngolanoValido('004567890LA041'));
    assert.ok(!nifAngolanoValido('12345'));
    assert.equal(dataHoraLuanda(new Date('2026-10-25T05:28:00Z')), '2026-10-25T06:28:00');
    assert.equal(urlQrAgt(NIF, 'FR FR26S1N/15'), 'https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor=5001032771&document=FR%20FR26S1N/15');
});

test('ponte AGT: assina só documentos com os campos da especificação e do NIF configurado', () => {
    const doc = construirDocumento({ tipo: 'FR', numero: 'FR FR26S1N/3', data: '2026-10-25', dataSistema: '2026-10-25T09:00:00', cliente: { nif: NIF, nome: 'X' }, linhas: [{ tipo: 'juros', descricao: 'Juros', valor: 10 }] }, config);
    const jws = assinarDocumento(payloadAssinaturaDocumento(doc, NIF), NIF, chaveContribuinte);
    const v = verificarJws(jws, chaveContribuinte);
    assert.equal(v.valida, true);
    assert.equal(v.payload.documentNo, 'FR FR26S1N/3');
    assert.throws(() => assinarDocumento({ qualquer: 'coisa' }, NIF, chaveContribuinte));
    assert.throws(() => assinarDocumento(payloadAssinaturaDocumento(doc, '5000000000'), NIF, chaveContribuinte), /NIF/);
});

test('ponte AGT: jwsSignature dos pedidos é feito no núcleo com os campos da especificação', async () => {
    let enviado: any;
    const fetchFalso = async (_url: string, init: any) => { enviado = JSON.parse(init.body); return new Response(JSON.stringify({ requestID: '202600000000001' }), { status: 200 }); };
    const r = await chamarAgt({ ambiente: 'homologacao', servico: 'obterEstado', corpo: { taxRegistrationNumber: NIF, requestID: '202600000000001' }, nif: NIF, chave: chaveContribuinte, fetchImpl: fetchFalso });
    assert.equal(r.ok, true);
    assert.deepEqual(verificarJws(enviado.jwsSignature, chaveContribuinte).payload, { taxRegistrationNumber: NIF, requestID: '202600000000001' });
    await assert.rejects(chamarAgt({ ambiente: 'homologacao', servico: 'apagarTudo', corpo: {}, nif: NIF, chave: chaveContribuinte, fetchImpl: fetchFalso }));
    await assert.rejects(chamarAgt({ ambiente: 'homologacao', servico: 'registarFactura', corpo: { taxRegistrationNumber: NIF, numberOfEntries: 31, documents: Array(31).fill({}) }, nif: NIF, chave: chaveContribuinte, fetchImpl: fetchFalso }));
});

function documentosSaft(): LinhaSaft[] {
    const linhas: LinhaSaft[] = [];
    let anterior = '';
    const add = (seq: number, dados: Parameters<typeof construirDocumento>[0]) => {
        const p = { ...construirDocumento(dados, config), jwsDocumentSignature: 'x' } as AgtDocumento;
        const h = hashSaft(mensagemHashSaft({ data: p.documentDate, dataSistema: p.systemEntryDate, numero: p.documentNo, total: p.documentTotals.grossTotal, hashAnterior: anterior }), chaveSaft);
        anterior = h;
        linhas.push({ documentNo: p.documentNo, documentType: p.documentType, seriesId: 's1', sequenceNumber: seq, documentDate: p.documentDate, systemEntryDate: p.systemEntryDate,
            clientId: 'C1', customerAddress: 'Benguela', payload: p, saftHash: h, saftHashControl: '1', agtStatus: 'valido', createdByName: 'Paulo' });
    };
    add(1, { tipo: 'FR', numero: 'FR FR26S1N/1', data: '2026-10-20', dataSistema: '2026-10-20T10:00:00', cliente: { nif: NIF, nome: 'Cliente & Filhos <Lda>' },
        linhas: [{ tipo: 'juros', descricao: 'Juros', valor: 10_000 }, { tipo: 'outros', descricao: 'Serviço', valor: 1000, desconto: 100 }],
        retencoes: [{ withholdingTaxType: 'II', withholdingTaxAmount: 58.5, withholdingTaxDescription: 'Retenção 6,5%' }] });
    add(2, { tipo: 'FR', numero: 'FR FR26S1N/2', data: '2026-10-21', dataSistema: '2026-10-21T10:00:00', cliente: { nome: 'Consumidor' },
        linhas: [{ tipo: 'imposto_selo_capital', descricao: 'IS s/ crédito', valor: 500_000, soImposto: true }] });
    return linhas;
}

test('SAF-T (AO): hash RSA 1024 cabe no XSD, sequências e encadeamento verificados', () => {
    const linhas = documentosSaft();
    assert.ok(linhas.every(l => l.saftHash.length <= 172));
    assert.throws(() => hashSaft('mensagem inválida', chaveSaft));
    const software = { productId: 'Tango Gestao de Creditos', productVersion: '3.0.3', softwareValidationNumber: '000/AGT/2026', producerTaxId: '5000000000' };
    assert.equal(prevalidarSaft(linhas, empresa, software).filter(p => p.nivel === 'erro').length, 0);
    const salto = [linhas[0], { ...linhas[1], sequenceNumber: 5 }];
    assert.ok(prevalidarSaft(salto, empresa, software).some(p => p.codigo === 'SEQ'));
    const out = construirSaft(linhas, empresa, config.perfis as any, software, { inicio: '2026-10-01', fim: '2026-10-31', base: 'F' }, 'SEDE', new Date('2026-11-01T10:00:00Z'));
    assert.ok(out.xml.includes('xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01"'));
    assert.ok(out.xml.includes('Cliente &amp; Filhos &lt;Lda&gt;'));
    assert.ok(out.xml.includes('<TaxBase>500000.00</TaxBase>'));
    assert.equal(out.estatisticas.facturas, 2);
    // Validação com o XSD oficial quando disponível (SAFT_XSD_PATH + xmllint)
    const xsd = process.env.SAFT_XSD_PATH;
    if (xsd && existsSync(xsd) && spawnSync('xmllint', ['--version']).status === 0) {
        const ficheiro = join(mkdtempSync(join(tmpdir(), 'saft-')), 'saft.xml');
        writeFileSync(ficheiro, out.xml);
        const r = spawnSync('xmllint', ['--noout', '--schema', xsd, ficheiro], { encoding: 'utf8' });
        assert.equal(r.status, 0, r.stderr);
    }
});
