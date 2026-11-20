/**
 * Regras da facturação electrónica AGT que se conseguem aplicar localmente, ANTES do envio:
 * arredondamentos, construção do documento a partir dos encargos do crédito e as validações
 * FE-RNG-0xx verificáveis no próprio sistema (E12, E13, E15–E17, E19, E21–E26, E29…).
 * Sem dependências do browser nem do Node — usado pela página, pelo serviço e pelos testes.
 */
import type {
  AgtDocumentoPorAssinar, AgtImposto, AgtLinha, AgtRetencao, AgtTipoDocumento, ConfigFiscal,
  LinhaEncargo, PerfisFiscais, Problema, TipoEncargo,
} from './tipos.ts';
import { TIPOS_RECIBO } from './tipos.ts';

// ---------------------------------------------------------------------------- arredondamentos
/** Arredondamento matemático a 2 casas (meio para cima), seguro contra erros de vírgula flutuante. */
export function round2(n: number): number {
  return Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
}

/** taxContribution: por excesso para o cêntimo seguinte (23,144 → 23,15 · 0,001844 → 0,01 · 5,9999999 → 6,00). */
export function arredondarImposto(n: number): number {
  if (n <= 0) return 0;
  const centimos = n * 100;
  const proximo = Math.round(centimos);
  if (Math.abs(centimos - proximo) < 1e-6) return proximo / 100;
  return Math.ceil(centimos) / 100;
}

// ---------------------------------------------------------------------------- datas (Luanda)
/** "AAAA-MM-DDThh:mm:ss" na hora de Luanda (systemEntryDate e SAF-T). */
export function dataHoraLuanda(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Luanda', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((acc, x) => ({ ...acc, [x.type]: x.value }), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}
export const dataLuanda = (d: Date = new Date()) => dataHoraLuanda(d).slice(0, 10);

// ---------------------------------------------------------------------------- perfis fiscais
/**
 * Perfis por defeito para uma instituição de crédito. Os marcados porConfirmar têm de ser revistos pelo
 * contabilista certificado (códigos de isenção do Anexo 6.4 e verbas de IS do Anexo 6.3 da especificação AGT).
 * Uma linha isenta sem código de motivo é bloqueada antes do envio.
 */
export const PERFIS_PADRAO: PerfisFiscais = {
  juros: { label: 'Juros remuneratórios', operationType: 'SIF', productCode: 'JUROS', taxType: 'IVA', taxCode: 'ISE', taxPercentage: 0, taxExemptionCode: '', taxExemptionReason: 'Isento — concessão de crédito', porConfirmar: true },
  juros_mora: { label: 'Juros de mora', operationType: 'SIF', productCode: 'JUROS-MORA', taxType: 'IVA', taxCode: 'ISE', taxPercentage: 0, taxExemptionCode: '', taxExemptionReason: 'Isento — concessão de crédito', porConfirmar: true },
  comissao_abertura: { label: 'Comissão de abertura/dossier', operationType: 'SIF', productCode: 'COM-ABERT', taxType: 'IVA', taxCode: 'NOR', taxPercentage: 14, porConfirmar: true },
  comissao_gestao: { label: 'Comissão de gestão', operationType: 'SIF', productCode: 'COM-GEST', taxType: 'IVA', taxCode: 'NOR', taxPercentage: 14, porConfirmar: true },
  seguro: { label: 'Seguro de crédito (repasse)', operationType: 'RD', productCode: 'SEGURO', taxType: 'NS', taxPercentage: 0, taxExemptionCode: '', porConfirmar: true },
  imposto_selo_capital: { label: 'Imposto de Selo sobre utilização de crédito', operationType: 'SIF', productCode: 'IS-CREDITO', taxType: 'IS', taxCode: '', taxPercentage: 0, porConfirmar: true },
  outros: { label: 'Outros serviços', operationType: 'SG', productCode: 'SERV', taxType: 'IVA', taxCode: 'NOR', taxPercentage: 14 },
};

export function resolverPerfis(config: Pick<ConfigFiscal, 'perfis'>): PerfisFiscais {
  const out = { ...PERFIS_PADRAO } as PerfisFiscais;
  for (const [k, v] of Object.entries(config.perfis ?? {})) {
    if (k in PERFIS_PADRAO) out[k as TipoEncargo] = { ...PERFIS_PADRAO[k as TipoEncargo], ...v };
  }
  return out;
}

// ---------------------------------------------------------------------------- pagamentos → linhas
/**
 * Linhas fiscais de um pagamento de prestação. O CAPITAL amortizado não é receita e não é facturado:
 * só juros remuneratórios e juros de mora (e comissões/seguros quando existirem).
 */
export function linhasDoPagamento(p: {
  numeroCredito: string; juros: number; jurosMora?: number; comissao?: number; seguro?: number; referencia?: string;
}): LinhaEncargo[] {
  const ref = `Crédito ${p.numeroCredito}${p.referencia ? ` · ${p.referencia}` : ''}`;
  const linhas: LinhaEncargo[] = [];
  if (p.juros > 0) linhas.push({ tipo: 'juros', descricao: `Juros remuneratórios · ${ref}`, valor: round2(p.juros) });
  if ((p.jurosMora ?? 0) > 0) linhas.push({ tipo: 'juros_mora', descricao: `Juros de mora · ${ref}`, valor: round2(p.jurosMora!) });
  if ((p.comissao ?? 0) > 0) linhas.push({ tipo: 'comissao_gestao', descricao: `Comissão de gestão · ${ref}`, valor: round2(p.comissao!) });
  if ((p.seguro ?? 0) > 0) linhas.push({ tipo: 'seguro', descricao: `Seguro de crédito · ${ref}`, valor: round2(p.seguro!) });
  return linhas;
}

// ---------------------------------------------------------------------------- construção
export const NIF_CONSUMIDOR_FINAL = '999999999';

export interface DadosDocumento {
  tipo: AgtTipoDocumento;
  numero: string;
  data: string;
  dataSistema: string;
  estado?: 'N' | 'C';
  documentoRejeitado?: string;
  cliente: { nif?: string | null; pais?: string; nome: string };
  linhas?: LinhaEncargo[];
  referencia?: { documento: string; motivo: string };
  recibos?: Array<{ documento: string; data: string; base: number; imposto: number; notaCredito?: boolean }>;
  retencoes?: AgtRetencao[];
  divisa?: { codigo: string; cambio: number };
  dataOperacao?: string;
}

export const numeroDocumento = (tipo: AgtTipoDocumento, serie: string, seq: number) => `${tipo} ${serie}/${seq}`;

export function construirDocumento(d: DadosDocumento, config: Pick<ConfigFiscal, 'perfis' | 'eacCode'>): AgtDocumentoPorAssinar {
  const perfis = resolverPerfis(config);
  const recibo = TIPOS_RECIBO.includes(d.tipo);
  const notaCredito = d.tipo === 'NC';
  const pais = (d.cliente.pais ?? 'AO').toUpperCase();
  const nif = (d.cliente.nif ?? '').trim().toUpperCase() || (pais === 'AO' ? NIF_CONSUMIDOR_FINAL : '');

  let lines: AgtLinha[] | undefined;
  let paymentReceipt: AgtDocumentoPorAssinar['paymentReceipt'];
  let base = 0;
  let imposto = 0;

  if (!recibo) {
    lines = (d.linhas ?? []).map((l, i) => {
      const p = perfis[l.tipo];
      const qtd = l.quantidade ?? 1;
      const desconto = round2(l.desconto ?? 0);
      if (l.soImposto) {
        const taxBase = round2(l.valor * qtd);
        const contrib = arredondarImposto(taxBase * p.taxPercentage / 100);
        imposto += contrib;
        return limpar({
          lineNumber: i + 1, operationType: p.operationType, operationDate: d.dataOperacao,
          productCode: p.productCode, productDescription: l.descricao.slice(0, 200),
          quantity: 1, unitOfMeasure: l.unidade ?? 'UN', unitPriceBase: 0, unitPrice: 0,
          taxes: [limpar({ taxType: p.taxType, taxCountryRegion: 'AO', taxCode: p.taxCode || undefined, taxBase, taxPercentage: p.taxPercentage, taxContribution: contrib }) as AgtImposto],
          settlementAmount: 0,
        }) as AgtLinha;
      }
      const valor = round2(round2(l.valor * qtd) - desconto);
      const contrib = arredondarImposto(valor * p.taxPercentage / 100);
      base += valor;
      imposto += contrib;
      return limpar({
        lineNumber: i + 1, operationType: p.operationType, operationDate: d.dataOperacao,
        productCode: p.productCode, productDescription: l.descricao.slice(0, 200),
        quantity: qtd, unitOfMeasure: l.unidade ?? 'UN', unitPriceBase: round2(l.valor), unitPrice: qtd > 0 ? round2(valor / qtd) : 0,
        referenceInfo: notaCredito && d.referencia ? { reference: d.referencia.documento, reason: d.referencia.motivo.slice(0, 60) } : undefined,
        ...(notaCredito ? { debitAmount: valor } : { creditAmount: valor }),
        taxes: [limpar({ taxType: p.taxType, taxCountryRegion: 'AO', taxCode: p.taxCode || undefined, taxPercentage: p.taxPercentage, taxContribution: contrib, taxExemptionCode: p.taxExemptionCode || undefined }) as AgtImposto],
        settlementAmount: desconto,
      }) as AgtLinha;
    });
  } else {
    const fontes = d.recibos ?? [];
    paymentReceipt = {
      sourceDocuments: fontes.map((f, i) => ({
        lineNo: i + 1,
        sourceDocumentID: { OriginatingON: f.documento, documentDate: f.data },
        ...(f.notaCredito ? { debitAmount: round2(f.base) } : { creditAmount: round2(f.base) }),
      })),
    };
    for (const f of fontes) {
      const s = f.notaCredito ? -1 : 1;
      base += s * f.base;
      imposto += s * f.imposto;
    }
  }

  base = round2(base);
  imposto = round2(imposto);
  const documentTotals: AgtDocumentoPorAssinar['documentTotals'] = { taxPayable: imposto, netTotal: base, grossTotal: round2(base + imposto) };
  if (d.divisa && d.divisa.codigo !== 'AOA') {
    documentTotals.currency = { currencyCode: d.divisa.codigo, exchangeRate: d.divisa.cambio, currencyAmount: round2(documentTotals.grossTotal * d.divisa.cambio) };
  }

  return limpar({
    documentNo: d.numero,
    documentStatus: d.estado ?? 'N',
    rejectedDocumentNo: d.documentoRejeitado,
    documentDate: d.data,
    documentType: d.tipo,
    eacCode: config.eacCode || undefined,
    systemEntryDate: d.dataSistema,
    customerTaxID: nif,
    customerCountry: pais,
    companyName: d.cliente.nome.slice(0, 200),
    lines,
    paymentReceipt,
    documentTotals,
    withholdingTaxList: d.retencoes?.length ? d.retencoes.map(r => ({ ...r, withholdingTaxAmount: round2(r.withholdingTaxAmount) })) : undefined,
  }) as AgtDocumentoPorAssinar;
}

/** Campos assinados no jwsDocumentSignature (especificação de registarFactura). */
export function payloadAssinaturaDocumento(doc: AgtDocumentoPorAssinar, nifEmissor: string) {
  return {
    documentNo: doc.documentNo,
    taxRegistrationNumber: nifEmissor,
    documentType: doc.documentType,
    documentDate: doc.documentDate,
    customerTaxID: doc.customerTaxID,
    customerCountry: doc.customerCountry,
    companyName: doc.companyName,
    documentTotals: { taxPayable: doc.documentTotals.taxPayable, netTotal: doc.documentTotals.netTotal, grossTotal: doc.documentTotals.grossTotal },
  };
}

/** Mensagem do hash encadeado SAF-T (AO): InvoiceDate;SystemEntryDate;InvoiceNo;GrossTotal;HashAnterior. */
export const mensagemHashSaft = (p: { data: string; dataSistema: string; numero: string; total: number; hashAnterior: string }) =>
  [p.data, p.dataSistema, p.numero, p.total.toFixed(2), p.hashAnterior].join(';');

// ---------------------------------------------------------------------------- validação
const NIF_EMPRESA = /^\d{10}$/;
const NIF_SINGULAR = /^\d{9}[A-Z]{2}\d{3}$/;

export const nifAngolanoValido = (nif: string) =>
  nif === NIF_CONSUMIDOR_FINAL || NIF_EMPRESA.test(nif) || NIF_SINGULAR.test(nif.toUpperCase());

export function validarDocumento(doc: AgtDocumentoPorAssinar, ctx: { config: Pick<ConfigFiscal, 'perfis' | 'dataAdesao'>; encargos?: TipoEncargo[] }): Problema[] {
  const out: Problema[] = [];
  const erro = (codigo: string, mensagem: string, campo?: string) => out.push({ nivel: 'erro', codigo, mensagem, campo, documentNo: doc.documentNo });
  const aviso = (codigo: string, mensagem: string, campo?: string) => out.push({ nivel: 'aviso', codigo, mensagem, campo, documentNo: doc.documentNo });

  if (doc.documentNo.length < 8 || doc.documentNo.length > 60) erro('E02', 'O número do documento deve ter entre 8 e 60 caracteres', 'documentNo');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.documentDate)) erro('E02', 'Data do documento inválida (AAAA-MM-DD)', 'documentDate');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(doc.systemEntryDate)) erro('E02', 'Data de sistema inválida', 'systemEntryDate');
  if (doc.documentStatus === 'C' && !doc.rejectedDocumentNo) erro('E01', 'A correcção tem de indicar o documento rejeitado', 'rejectedDocumentNo');
  if (doc.documentStatus === 'C' && doc.rejectedDocumentNo === doc.documentNo) erro('E46', 'A correcção tem de usar um novo número de documento', 'documentNo');
  if (!doc.companyName.trim()) erro('E01', 'Nome do cliente em falta', 'companyName');

  if (doc.customerCountry === 'AO') {
    if (!nifAngolanoValido(doc.customerTaxID)) aviso('E11', `O NIF do cliente "${doc.customerTaxID}" não parece válido — a AGT pode rejeitar`, 'customerTaxID');
  } else if (!doc.customerTaxID) erro('E10', 'Cliente estrangeiro sem identificação fiscal', 'customerTaxID');

  if (ctx.config.dataAdesao && doc.documentDate < ctx.config.dataAdesao)
    erro('E29', `Data anterior à adesão à facturação electrónica (${ctx.config.dataAdesao})`, 'documentDate');

  const recibo = TIPOS_RECIBO.includes(doc.documentType);
  if (recibo) {
    if (doc.lines?.length) erro('E26', 'Recibos (AR/RC/RG) não levam linhas', 'lines');
    if (!doc.paymentReceipt?.sourceDocuments.length) erro('E27', 'Recibo sem documentos liquidados', 'paymentReceipt');
  } else {
    if (!doc.lines?.length) erro('E26', 'Documento sem linhas — não há juros, mora ou comissões a facturar', 'lines');
    if (doc.paymentReceipt) erro('E27', 'paymentReceipt só é permitido em AR/RC/RG', 'paymentReceipt');
  }

  let somaBase = 0, somaImposto = 0, creditos = 0, debitos = 0;
  (doc.lines ?? []).forEach((l, i) => {
    const onde = `lines[${i}]`;
    if (l.lineNumber !== i + 1) erro('E12', `Linha ${i + 1}: numeração fora de sequência`, onde);
    if (l.debitAmount != null && l.creditAmount != null) erro('E15', `Linha ${l.lineNumber}: débito e crédito em simultâneo`, onde);
    const valor = l.creditAmount ?? l.debitAmount;
    const temBase = l.taxes?.some(t => t.taxBase != null);
    if (temBase && valor != null) erro('E19', `Linha ${l.lineNumber}: taxBase não pode coexistir com débito/crédito`, onde);
    if (valor != null) {
      const esperado = round2(l.quantity * l.unitPriceBase - l.settlementAmount);
      if (Math.abs(esperado - valor) > 0.01) erro('E21', `Linha ${l.lineNumber}: valor ${valor} ≠ quantidade × preço − desconto (${esperado})`, onde);
      if (l.creditAmount != null) creditos += l.creditAmount;
      if (l.debitAmount != null) debitos += l.debitAmount;
      somaBase += valor;
    }
    if (!l.taxes?.length) erro('E01', `Linha ${l.lineNumber}: sem imposto (use NS com motivo se não sujeito)`, onde);
    for (const t of l.taxes ?? []) {
      somaImposto += t.taxContribution ?? 0;
      if (t.taxType === 'IVA' && !t.taxCode) erro('E01', `Linha ${l.lineNumber}: IVA sem código de taxa`, onde);
      if ((t.taxCode === 'ISE' || t.taxType === 'NS') && !t.taxExemptionCode)
        erro('E01', `Linha ${l.lineNumber}: falta o código de motivo de isenção (Anexo 6.4) — configure em Configuração AGT › Perfis fiscais`, onde);
      if (t.taxExemptionCode && t.taxExemptionCode.length !== 3) erro('E02', `Linha ${l.lineNumber}: o código de isenção tem 3 caracteres`, onde);
      if (t.taxType === 'IS' && temBase && !t.taxPercentage) erro('E01', `Linha ${l.lineNumber}: taxa de Imposto de Selo não configurada`, onde);
    }
    if (doc.documentType === 'NC' && !l.referenceInfo) erro('E13', `Linha ${l.lineNumber}: nota de crédito sem documento de origem`, onde);
    if ((doc.documentType === 'GF' || doc.documentType === 'FG') && !l.operationDate) erro('E01', `Linha ${l.lineNumber}: data da operação obrigatória`, onde);
  });

  if (!recibo) {
    const t = doc.documentTotals;
    if (Math.abs(round2(somaImposto) - t.taxPayable) > 0.001) erro('E22', `Total de imposto ${t.taxPayable} ≠ soma das linhas ${round2(somaImposto)}`, 'documentTotals');
    if (Math.abs(round2(somaBase) - t.netTotal) > 0.001) erro('E23', `Total sem imposto ${t.netTotal} ≠ soma das linhas ${round2(somaBase)}`, 'documentTotals');
    if (Math.abs(round2(t.netTotal + t.taxPayable) - t.grossTotal) > 0.001) erro('E24', 'Total com imposto ≠ base + imposto', 'documentTotals');
    if (doc.documentType === 'NC' && creditos > debitos) erro('E16', 'Nota de crédito com créditos superiores aos débitos', 'lines');
    if (doc.documentType !== 'NC' && debitos > creditos) erro('E17', 'Documento com débitos superiores aos créditos', 'lines');
  }

  const cur = doc.documentTotals.currency;
  if (cur && Math.abs(round2(doc.documentTotals.grossTotal * cur.exchangeRate) - cur.currencyAmount) > 0.001)
    erro('E25', 'O contravalor não confere com total × câmbio', 'documentTotals.currency');

  if (ctx.encargos?.length) {
    const perfis = resolverPerfis(ctx.config);
    for (const e of new Set(ctx.encargos)) if (perfis[e]?.porConfirmar) aviso('PERFIL', `Perfil fiscal "${perfis[e].label}" ainda não confirmado pelo contabilista`, 'perfis');
  }
  return out;
}

export const temErros = (p: Problema[]) => p.some(x => x.nivel === 'erro');

/** URL do QR Code AGT (espaços do número → %20). */
export const urlQrAgt = (nifEmissor: string, documentNo: string) =>
  `https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor=${encodeURIComponent(nifEmissor)}&document=${documentNo.replace(/ /g, '%20')}`;

/** Mensagens legíveis para os códigos de erro AGT mais frequentes. */
export const DICAS_ERRO_AGT: Record<string, string> = {
  E01: 'Falta um campo obrigatório.', E02: 'Formato inválido de um campo.',
  E04: 'Número de documentos não confere com o pedido.',
  E06: 'O contribuinte não aderiu à facturação electrónica.', E07: 'O software não está certificado pela AGT.',
  E08: 'Assinatura do produtor de software inválida.', E09: 'Documento já existe na AGT (duplicado).',
  E11: 'NIF do cliente desconhecido na AGT.', E12: 'Numeração das linhas com quebra ou repetição.',
  E13: 'Falta o documento de origem (nota de crédito).', E21: 'Valor da linha ≠ quantidade × preço.',
  E22: 'Total de imposto ≠ soma das linhas.', E23: 'Total sem imposto ≠ soma das linhas.', E24: 'Total com imposto incorrecto.',
  E28: 'O emissor não aderiu à facturação electrónica.', E29: 'Data anterior à adesão à facturação electrónica.',
  E34: 'Série inexistente para o contribuinte.', E36: 'A série foi criada por outro software.',
  E37: 'Tipo de documento diferente do da série.', E38: 'Ano do documento diferente do da série.',
  E40: 'A assinatura do pedido não confere com os dados.', E46: 'Correcções exigem um número de documento novo.',
  E48: 'Estabelecimento desconhecido — registe-o no Portal do Contribuinte.',
  E95: 'NIF emissor diferente.', E96: 'Pedido ainda em processamento.', E97: 'Consulta prematura — aguardar.', E98: 'Demasiados pedidos — aguardar.',
};
export const codigoErro = (e: { idError?: string; errorCode?: string }) => e.idError ?? e.errorCode ?? '';

function limpar<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
