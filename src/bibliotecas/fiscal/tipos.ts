/**
 * Tipos da Facturação Electrónica da AGT (schemaVersion 2.0) e do SAF-T (AO) 1.01_01.
 * Os nomes dos campos AGT seguem a especificação técnica publicada no Quiosque AGT.
 */

export type AgtAmbiente = 'homologacao' | 'producao';

export const AGT_TIPOS_DOCUMENTO = {
  FA: 'Factura de Adiantamento',
  FT: 'Factura',
  FR: 'Factura/Recibo',
  FG: 'Factura Global',
  GF: 'Factura Genérica',
  AC: 'Aviso de Cobrança',
  AR: 'Aviso de Cobrança/Recibo',
  TV: 'Talão de Venda',
  RC: 'Recibo em numerário',
  RG: 'Recibo Geral',
  RE: 'Estorno ou Recibo de Estorno',
  ND: 'Nota de Débito',
  NC: 'Nota de Crédito',
  AF: 'Factura/Recibo de Autofacturação',
  RP: 'Prémio ou Recibo de Prémio',
  RA: 'Resseguro Aceite',
  CS: 'Imputação a Co-seguradoras',
  LD: 'Imputação a Co-seguradora Líder',
} as const;
export type AgtTipoDocumento = keyof typeof AGT_TIPOS_DOCUMENTO;

/** Tipos que levam paymentReceipt em vez de linhas. */
export const TIPOS_RECIBO: AgtTipoDocumento[] = ['AR', 'RC', 'RG'];

export const AGT_TIPOS_OPERACAO = {
  SE: 'Serviços de educação',
  SS: 'Serviços de saúde',
  STP: 'Transporte de passageiros',
  SR: 'Serviços sujeitos a royalties',
  SIF: 'Intermediação financeira ou seguradora',
  SHS: 'Hotelaria e similares',
  ST: 'Telecomunicações',
  SG: 'Prestação de serviço (geral)',
  TB: 'Transmissão de bens',
  AS: 'Arrendamento e subarrendamento',
  QT: 'Quotas',
  RD: 'Repasse de despesas',
} as const;
export type AgtTipoOperacao = keyof typeof AGT_TIPOS_OPERACAO;

export type TipoImposto = 'IVA' | 'IS' | 'IEC' | 'CEOC' | 'NS';
export type TipoRetencao = 'IRT' | 'II' | 'IS' | 'IVA' | 'IP' | 'IAC' | 'OU' | 'IRPC' | 'IRPS';

export interface SoftwareInfoDetail {
  productId: string;
  productVersion: string;
  softwareValidationNumber: string;
  signatureVersion?: number;
}

export interface SoftwareInfo {
  softwareInfoDetail: SoftwareInfoDetail;
  jwsSoftwareSignature: string;
}

export interface AgtImposto {
  taxType: TipoImposto;
  taxCountryRegion: string;
  taxCode?: string;
  taxBase?: number;
  taxPercentage?: number;
  taxAmount?: number;
  taxContribution?: number;
  taxExemptionCode?: string;
}

export interface AgtLinha {
  lineNumber: number;
  operationType: AgtTipoOperacao;
  operationDate?: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  unitOfMeasure: string;
  unitPriceBase: number;
  unitPrice: number;
  referenceInfo?: { reference: string; reason?: string };
  debitAmount?: number;
  creditAmount?: number;
  taxes?: AgtImposto[];
  settlementAmount: number;
}

export interface AgtRecibo {
  sourceDocuments: Array<{
    lineNo: number;
    sourceDocumentID: { OriginatingON: string; documentDate: string };
    debitAmount?: number;
    creditAmount?: number;
  }>;
}

export interface AgtTotais {
  taxPayable: number;
  netTotal: number;
  grossTotal: number;
  currency?: { currencyCode: string; currencyAmount: number; exchangeRate: number };
}

export interface AgtRetencao {
  withholdingTaxType: TipoRetencao;
  withholdingTaxDescription?: string;
  withholdingTaxAmount: number;
}

export interface AgtDocumento {
  documentNo: string;
  documentStatus: 'N' | 'C';
  rejectedDocumentNo?: string;
  jwsDocumentSignature: string;
  documentDate: string;
  documentType: AgtTipoDocumento;
  eacCode?: string;
  systemEntryDate: string;
  customerCountry: string;
  customerTaxID: string;
  companyName: string;
  lines?: AgtLinha[];
  paymentReceipt?: AgtRecibo;
  documentTotals: AgtTotais;
  withholdingTaxList?: AgtRetencao[];
}

export type AgtDocumentoPorAssinar = Omit<AgtDocumento, 'jwsDocumentSignature'>;

export interface AgtErro {
  idError?: string;
  descriptionError?: string;
  errorCode?: string;
  errorDescription?: string;
  documentNo?: string;
  hint?: string;
}

/** Estado interno da comunicação de um documento à AGT. */
export type EstadoAgt =
  | 'pendente' | 'enviado' | 'em_validacao' | 'valido' | 'valido_penal'
  | 'invalido' | 'erro_envio' | 'simulado' | 'anulado';

export type TipoEncargo =
  | 'juros' | 'juros_mora' | 'comissao_abertura' | 'comissao_gestao'
  | 'seguro' | 'imposto_selo_capital' | 'outros';

/** Linha de negócio (lado do sistema de créditos) antes de ser convertida para o formato AGT. */
export interface LinhaEncargo {
  tipo: TipoEncargo;
  descricao: string;
  quantidade?: number;
  valor: number;            // sem impostos
  desconto?: number;
  unidade?: string;
  /** Linha só de imposto (ex.: IS sobre o capital mutuado, que não é receita). */
  soImposto?: boolean;
}

export interface PerfilFiscal {
  label: string;
  operationType: AgtTipoOperacao;
  productCode: string;
  taxType: TipoImposto;
  taxCode?: string;
  taxPercentage: number;
  taxExemptionCode?: string;
  taxExemptionReason?: string;
  /** Valores por confirmar pelo contabilista certificado. */
  porConfirmar?: boolean;
}

export type PerfisFiscais = Record<TipoEncargo, PerfilFiscal>;

/** Dados do software certificado (fornecidos pela AGT ao produtor na certificação). */
export interface DadosSoftware {
  productId: string;
  productVersion: string;
  softwareValidationNumber: string;
  signatureVersion?: number;
  /** jwsSoftwareSignature: o produtor assina uma vez o softwareInfoDetail e distribui o resultado. */
  jwsSoftwareSignature: string;
  /** NIF do produtor (cabeçalho SAF-T: ProductCompanyTaxID). */
  producerTaxId: string;
}

export interface ConfigFiscal {
  ambiente: AgtAmbiente;
  agtActiva: boolean;
  contingencia: boolean;
  estabelecimento: string;
  dataAdesao?: string;
  eacCode?: string;
  cidade?: string;
  provincia?: string;
  perfis: Partial<PerfisFiscais>;
  software: DadosSoftware;
  /** Emitir automaticamente a Factura/Recibo quando um pagamento é confirmado. */
  emissaoAutomatica: boolean;
}

/** Identidade da empresa (vem das definições já existentes no sistema). */
export interface EmpresaFiscal {
  nif: string;
  nome: string;
  morada: string;
  cidade: string;
  provincia?: string;
  telefone?: string;
  email?: string;
  website?: string;
}

export interface Problema {
  nivel: 'erro' | 'aviso';
  codigo: string;
  mensagem: string;
  campo?: string;
  documentNo?: string;
}
