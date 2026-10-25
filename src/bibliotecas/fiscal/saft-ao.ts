/**
 * Gerador do SAF-T (AO) 1.01_01 — vertente de Facturação — a partir dos MESMOS documentos comunicados à AGT.
 * A ordem dos elementos segue o XSD oficial (SAFTAO1.01_01.xsd); um ficheiro de exemplo com FR, FT com
 * Imposto de Selo, NC e recibo valida sem erros contra esse XSD.
 * O elemento Hash está limitado a 172 caracteres no XSD: a chave do hash SAF-T é RSA de 1024 bits.
 */
import type { AgtDocumento, EmpresaFiscal, PerfisFiscais, Problema } from './tipos.ts';
import { TIPOS_RECIBO } from './tipos.ts';
import { nifAngolanoValido, round2, dataLuanda, NIF_CONSUMIDOR_FINAL } from './regras.ts';

export interface LinhaSaft {
  documentNo: string;
  documentType: string;
  seriesId: string;
  sequenceNumber: number;
  documentDate: string;
  systemEntryDate: string;
  clientId: string | null;
  customerAddress: string | null;
  payload: AgtDocumento;
  saftHash: string;
  saftHashControl: string;
  agtStatus: string;
  createdByName: string | null;
}

export interface OpcoesSaft { inicio: string; fim: string; base: 'F' | 'C' | 'I' }

export interface ResultadoSaft {
  xml: string;
  nomeFicheiro: string;
  estatisticas: { facturas: number; recibos: number; clientes: number; debito: number; credito: number };
}

const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const el = (nome: string, valor: unknown, max?: number) => {
  if (valor === undefined || valor === null || valor === '') return '';
  const s = String(valor);
  return `<${nome}>${esc(max ? s.slice(0, max) : s)}</${nome}>`;
};
const kz = (n: number) => round2(n).toFixed(2);
const qtd = (n: number) => (Math.round(n * 1e6) / 1e6).toString();
const idCliente = (l: LinhaSaft) => (l.payload.customerTaxID === NIF_CONSUMIDOR_FINAL ? 'CF' : (l.clientId || l.payload.customerTaxID));
const origem = (l: LinhaSaft) => (l.createdByName || 'Sistema').slice(0, 30);

// ---------------------------------------------------------------------------- pré-validação
export function prevalidarSaft(linhas: LinhaSaft[], empresa: EmpresaFiscal, software: { softwareValidationNumber: string; producerTaxId: string }): Problema[] {
  const out: Problema[] = [];
  const add = (nivel: Problema['nivel'], codigo: string, mensagem: string, documentNo?: string) => out.push({ nivel, codigo, mensagem, documentNo });

  if (!/^\d{10}$/.test(empresa.nif)) add('erro', 'CAB', 'O NIF da empresa (Definições) tem de ter 10 dígitos');
  if (!software.softwareValidationNumber) add('erro', 'CAB', 'Falta o número de certificação do software atribuído pela AGT');
  if (!software.producerTaxId) add('aviso', 'CAB', 'Falta o NIF do produtor do software');
  if (!empresa.morada.trim()) add('aviso', 'CAB', 'A morada da empresa não está preenchida nas Definições');

  const porSerie = new Map<string, LinhaSaft[]>();
  for (const l of linhas) porSerie.set(l.seriesId, [...(porSerie.get(l.seriesId) ?? []), l]);
  for (const lista of porSerie.values()) {
    lista.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    for (let i = 1; i < lista.length; i++) {
      const ant = lista[i - 1], act = lista[i];
      if (act.sequenceNumber !== ant.sequenceNumber + 1) add('erro', 'SEQ', `Quebra de sequência entre ${ant.documentNo} e ${act.documentNo}`, act.documentNo);
      if (act.systemEntryDate < ant.systemEntryDate) add('erro', 'SEQ', 'Data de registo anterior à do documento anterior da série', act.documentNo);
    }
  }

  for (const l of linhas) {
    const p = l.payload;
    if (!l.saftHash) add('erro', 'HASH', 'Documento sem hash', l.documentNo);
    if (p.customerCountry === 'AO' && !nifAngolanoValido(p.customerTaxID)) add('aviso', 'NIF', `NIF do cliente "${p.customerTaxID}" com formato inválido`, l.documentNo);
    if (l.agtStatus === 'invalido') add('aviso', 'AGT', 'Rejeitado pela AGT — confirme que a correcção foi emitida', l.documentNo);
    if (['pendente', 'erro_envio', 'enviado', 'em_validacao'].includes(l.agtStatus)) add('aviso', 'AGT', `Ainda não validado pela AGT (${l.agtStatus.replace('_', ' ')})`, l.documentNo);
    const soma = round2((p.lines ?? []).reduce((s, x) => s + (x.creditAmount ?? x.debitAmount ?? 0), 0));
    if (p.lines?.length && Math.abs(soma - p.documentTotals.netTotal) > 0.001) add('erro', 'TOT', `Soma das linhas (${soma}) ≠ total sem imposto (${p.documentTotals.netTotal})`, l.documentNo);
    for (const x of p.lines ?? []) for (const t of x.taxes ?? [])
      if ((t.taxCode === 'ISE' || t.taxType === 'NS') && !t.taxExemptionCode) add('erro', 'ISE', `Linha ${x.lineNumber} isenta sem código de motivo`, l.documentNo);
  }
  return out;
}

// ---------------------------------------------------------------------------- XML
export function construirSaft(
  linhas: LinhaSaft[], empresa: EmpresaFiscal, perfis: PerfisFiscais,
  software: { productId: string; productVersion: string; softwareValidationNumber: string; producerTaxId: string },
  op: OpcoesSaft, estabelecimento = 'SEDE', criadoEm = new Date(),
): ResultadoSaft {
  const motivos = new Map<string, string>();
  for (const p of Object.values(perfis)) if (p.taxExemptionCode) motivos.set(p.taxExemptionCode, p.taxExemptionReason || 'Isento nos termos da lei');

  const facturas = linhas.filter(l => !TIPOS_RECIBO.includes(l.payload.documentType));
  const recibos = linhas.filter(l => TIPOS_RECIBO.includes(l.payload.documentType));

  const clientes = new Map<string, { id: string; nif: string; nome: string; morada: string; pais: string }>();
  const produtos = new Map<string, string>();
  const impostos = new Map<string, { tipo: string; regiao: string; codigo: string; taxa: number; desc: string }>();
  for (const l of linhas) {
    const p = l.payload;
    const id = idCliente(l);
    if (!clientes.has(id)) clientes.set(id, { id, nif: p.customerTaxID, nome: id === 'CF' ? 'Consumidor final' : p.companyName, morada: l.customerAddress || 'Desconhecido', pais: p.customerCountry });
    for (const x of p.lines ?? []) {
      if (!produtos.has(x.productCode)) produtos.set(x.productCode, x.productDescription.split(' · ')[0]);
      for (const t of x.taxes ?? []) {
        const codigo = t.taxCode || (t.taxType === 'NS' ? 'NS' : 'ISE');
        const k = `${t.taxType}|${t.taxCountryRegion}|${codigo}|${t.taxPercentage ?? 0}`;
        if (!impostos.has(k)) impostos.set(k, { tipo: t.taxType, regiao: t.taxCountryRegion, codigo, taxa: t.taxPercentage ?? 0,
          desc: ({ ISE: 'Isento', NOR: 'Taxa normal', RED: 'Taxa reduzida', INT: 'Taxa intermédia' } as Record<string, string>)[codigo] ?? `${t.taxType} ${codigo}` });
      }
    }
  }

  const xmlClientes = [...clientes.values()].map(c =>
    `<Customer>${el('CustomerID', c.id)}${el('AccountID', 'Desconhecido')}${el('CustomerTaxID', c.nif)}${el('CompanyName', c.nome, 200)}` +
    `<BillingAddress>${el('AddressDetail', c.morada, 200)}${el('City', 'Desconhecido')}${el('Country', c.pais)}</BillingAddress>${el('SelfBillingIndicator', 0)}</Customer>`).join('');
  const xmlProdutos = [...produtos].map(([c, d]) =>
    `<Product>${el('ProductType', 'S')}${el('ProductCode', c)}${el('ProductDescription', d, 200)}${el('ProductNumberCode', c)}</Product>`).join('');
  const xmlImpostos = impostos.size ? `<TaxTable>${[...impostos.values()].map(t =>
    `<TaxTableEntry>${el('TaxType', t.tipo)}${el('TaxCountryRegion', t.regiao)}${el('TaxCode', t.codigo)}${el('Description', t.desc)}${el('TaxPercentage', kz(t.taxa))}</TaxTableEntry>`).join('')}</TaxTable>` : '';

  let debito = 0, credito = 0;
  const xmlFacturas = facturas.map(l => {
    const p = l.payload;
    for (const x of p.lines ?? []) { debito += x.debitAmount ?? 0; credito += x.creditAmount ?? 0; }
    const linhasXml = (p.lines ?? []).map(x => {
      const t = x.taxes?.[0];
      return `<Line>${el('LineNumber', x.lineNumber)}${el('ProductCode', x.productCode)}${el('ProductDescription', x.productDescription, 200)}` +
        `${el('Quantity', qtd(x.quantity))}${el('UnitOfMeasure', x.unitOfMeasure)}${el('UnitPrice', kz(x.unitPrice))}` +
        `${t?.taxBase != null ? el('TaxBase', kz(t.taxBase)) : ''}${el('TaxPointDate', x.operationDate ?? p.documentDate)}` +
        `${x.referenceInfo ? `<References>${el('Reference', x.referenceInfo.reference)}${el('Reason', x.referenceInfo.reason)}</References>` : ''}` +
        `${el('Description', x.productDescription, 200)}` +
        `${x.debitAmount != null ? el('DebitAmount', kz(x.debitAmount)) : el('CreditAmount', kz(x.creditAmount ?? 0))}` +
        (t ? `<Tax>${el('TaxType', t.taxType)}${el('TaxCountryRegion', t.taxCountryRegion)}${el('TaxCode', t.taxCode || (t.taxType === 'NS' ? 'NS' : 'ISE'))}` +
          `${t.taxAmount != null ? el('TaxAmount', kz(t.taxAmount)) : el('TaxPercentage', kz(t.taxPercentage ?? 0))}</Tax>` : '') +
        (t?.taxExemptionCode ? `${el('TaxExemptionReason', motivos.get(t.taxExemptionCode) ?? 'Isento nos termos da lei', 60)}${el('TaxExemptionCode', t.taxExemptionCode)}` : '') +
        `${x.settlementAmount ? el('SettlementAmount', kz(x.settlementAmount)) : ''}</Line>`;
    }).join('');
    const cur = p.documentTotals.currency;
    const ret = (p.withholdingTaxList ?? []).map(w =>
      `<WithholdingTax>${el('WithholdingTaxType', w.withholdingTaxType)}${el('WithholdingTaxDescription', w.withholdingTaxDescription, 60)}${el('WithholdingTaxAmount', kz(w.withholdingTaxAmount))}</WithholdingTax>`).join('');
    return `<Invoice>${el('InvoiceNo', p.documentNo)}` +
      `<DocumentStatus>${el('InvoiceStatus', 'N')}${el('InvoiceStatusDate', l.systemEntryDate)}${el('SourceID', origem(l))}${el('SourceBilling', 'P')}</DocumentStatus>` +
      `${el('Hash', l.saftHash)}${el('HashControl', l.saftHashControl)}${el('Period', Number(p.documentDate.slice(5, 7)))}` +
      `${el('InvoiceDate', p.documentDate)}${el('InvoiceType', p.documentType)}` +
      `<SpecialRegimes>${el('SelfBillingIndicator', p.documentType === 'AF' ? 1 : 0)}${el('CashVATSchemeIndicator', 0)}${el('ThirdPartiesBillingIndicator', 0)}</SpecialRegimes>` +
      `${el('SourceID', origem(l))}${el('EACCode', p.eacCode)}${el('SystemEntryDate', l.systemEntryDate)}${el('CustomerID', idCliente(l))}` +
      linhasXml +
      `<DocumentTotals>${el('TaxPayable', kz(p.documentTotals.taxPayable))}${el('NetTotal', kz(p.documentTotals.netTotal))}${el('GrossTotal', kz(p.documentTotals.grossTotal))}` +
      (cur ? `<Currency>${el('CurrencyCode', cur.currencyCode)}${el('CurrencyAmount', kz(cur.currencyAmount))}${el('ExchangeRate', cur.exchangeRate)}</Currency>` : '') +
      `</DocumentTotals>${ret}</Invoice>`;
  }).join('');

  let rDebito = 0, rCredito = 0;
  const xmlRecibos = recibos.map(l => {
    const p = l.payload;
    const linhasXml = (p.paymentReceipt?.sourceDocuments ?? []).map(s => {
      rDebito += s.debitAmount ?? 0; rCredito += s.creditAmount ?? 0;
      return `<Line>${el('LineNumber', s.lineNo)}<SourceDocumentID>${el('OriginatingON', s.sourceDocumentID.OriginatingON)}${el('InvoiceDate', s.sourceDocumentID.documentDate)}</SourceDocumentID>` +
        `${s.debitAmount != null ? el('DebitAmount', kz(s.debitAmount)) : el('CreditAmount', kz(s.creditAmount ?? 0))}</Line>`;
    }).join('');
    return `<Payment>${el('PaymentRefNo', p.documentNo)}${el('Period', Number(p.documentDate.slice(5, 7)))}${el('TransactionDate', p.documentDate)}${el('PaymentType', p.documentType === 'RC' ? 'RC' : 'RG')}` +
      `<DocumentStatus>${el('PaymentStatus', 'N')}${el('PaymentStatusDate', l.systemEntryDate)}${el('SourceID', origem(l))}${el('SourcePayment', 'P')}</DocumentStatus>` +
      `<PaymentMethod>${el('PaymentMechanism', 'OU')}${el('PaymentAmount', kz(p.documentTotals.grossTotal))}${el('PaymentDate', p.documentDate)}</PaymentMethod>` +
      `${el('SourceID', origem(l))}${el('SystemEntryDate', l.systemEntryDate)}${el('CustomerID', idCliente(l))}${linhasXml}` +
      `<DocumentTotals>${el('TaxPayable', kz(p.documentTotals.taxPayable))}${el('NetTotal', kz(p.documentTotals.netTotal))}${el('GrossTotal', kz(p.documentTotals.grossTotal))}</DocumentTotals></Payment>`;
  }).join('');

  const cabecalho =
    `<Header>${el('AuditFileVersion', '1.01_01')}${el('CompanyID', empresa.nif)}${el('TaxRegistrationNumber', empresa.nif)}${el('TaxAccountingBasis', op.base)}` +
    `${el('CompanyName', empresa.nome, 200)}<CompanyAddress>${el('AddressDetail', empresa.morada || 'Desconhecido', 200)}${el('City', empresa.cidade || 'Desconhecido', 50)}` +
    `${el('Province', empresa.provincia)}${el('Country', 'AO')}</CompanyAddress>` +
    `${el('FiscalYear', Number(op.inicio.slice(0, 4)))}${el('StartDate', op.inicio)}${el('EndDate', op.fim)}${el('CurrencyCode', 'AOA')}` +
    `${el('DateCreated', dataLuanda(criadoEm))}${el('TaxEntity', estabelecimento === 'SEDE' ? 'Global' : estabelecimento)}` +
    `${el('ProductCompanyTaxID', software.producerTaxId || empresa.nif)}${el('SoftwareValidationNumber', software.softwareValidationNumber || '0')}` +
    `${el('ProductID', `${software.productId}/DIGITAL NORTE`)}${el('ProductVersion', software.productVersion)}` +
    `${el('Telephone', empresa.telefone, 20)}${el('Email', empresa.email)}${el('Website', empresa.website)}</Header>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    cabecalho + `<MasterFiles>${xmlClientes}${xmlProdutos}${xmlImpostos}</MasterFiles><SourceDocuments>` +
    `<SalesInvoices>${el('NumberOfEntries', facturas.length)}${el('TotalDebit', kz(debito))}${el('TotalCredit', kz(credito))}${xmlFacturas}</SalesInvoices>` +
    (recibos.length ? `<Payments>${el('NumberOfEntries', recibos.length)}${el('TotalDebit', kz(rDebito))}${el('TotalCredit', kz(rCredito))}${xmlRecibos}</Payments>` : '') +
    `</SourceDocuments></AuditFile>`;

  return {
    xml,
    nomeFicheiro: `SAFT_AO_${empresa.nif}_${op.inicio.replace(/-/g, '')}_${op.fim.replace(/-/g, '')}.xml`,
    estatisticas: { facturas: facturas.length, recibos: recibos.length, clientes: clientes.size, debito: round2(debito), credito: round2(credito) },
  };
}
