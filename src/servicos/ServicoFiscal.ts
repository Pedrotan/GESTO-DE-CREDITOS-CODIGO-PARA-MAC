/**
 * Serviço fiscal: facturação electrónica AGT, séries, fila de comunicação, SAF-T (AO) e mapas de impostos.
 *
 * Regras principais:
 *  - A emissão nunca depende da AGT estar disponível: o documento é assinado, numerado e gravado; fica
 *    «pendente» e a fila envia-o em lotes de até 30 (registarFactura) e acompanha-o até V/I (obterEstado).
 *  - Cada série pertence a um dispositivo: vários computadores sincronizados nunca repetem números.
 *  - A numeração é sequencial sem falhas: o número é reservado na mesma transacção que grava o documento.
 *  - Documentos são imutáveis (triggers): anula-se com nota de crédito; rejeitados corrigem-se com novo número.
 *  - Todas as instruções SQL são literais (lista branca do renderer gerada por scripts/generate-sql-allowlist.mjs).
 */
import { db } from '@/bibliotecas/bd';
import { ServicoAuditoria } from '@/servicos/ServicoAuditoria';
import { getDeviceId } from '@/servicos/ServicoSincronizacaoCloud';
import { ponteAgt, type RespostaAgt, type ServicoAgt } from '@/bibliotecas/fiscal/ponte-agt';
import {
  construirDocumento, linhasDoPagamento, mensagemHashSaft, numeroDocumento, payloadAssinaturaDocumento,
  resolverPerfis, round2, temErros, validarDocumento, dataHoraLuanda, dataLuanda, DICAS_ERRO_AGT, codigoErro,
} from '@/bibliotecas/fiscal/regras';
import { construirSaft, prevalidarSaft, type LinhaSaft, type OpcoesSaft } from '@/bibliotecas/fiscal/saft-ao';
import type {
  AgtDocumento, AgtErro, AgtRetencao, AgtTipoDocumento, ConfigFiscal, EmpresaFiscal, EstadoAgt, LinhaEncargo, Problema, TipoEncargo,
} from '@/bibliotecas/fiscal/tipos';
import { TIPOS_RECIBO } from '@/bibliotecas/fiscal/tipos';
import type { Client, Credit, Payment } from '@/tipos/credito';

export const VERSAO_SOFTWARE = '3.0.3';

export const CONFIG_PADRAO: ConfigFiscal = {
  ambiente: 'homologacao',
  agtActiva: false,
  contingencia: false,
  estabelecimento: 'SEDE',
  perfis: {},
  emissaoAutomatica: false,
  software: {
    productId: 'Tango Gestao de Creditos',
    productVersion: VERSAO_SOFTWARE,
    softwareValidationNumber: '',
    jwsSoftwareSignature: '',
    producerTaxId: '',
  },
};

export interface Utilizador { id: string; name: string; role?: string }

export interface SerieFiscal {
  id: string; seriesCode: string; seriesYear: number; documentType: AgtTipoDocumento; establishment: string;
  contingency: number; status: 'A' | 'U' | 'F'; firstNumber: number; lastNumber: number; nextNumber: number;
  deviceId: string; simulated: number; agtSyncedAt: string | null; createdAt: string;
}

export interface DocumentoFiscal {
  id: string; idempotencyKey: string; documentNo: string; documentType: AgtTipoDocumento; seriesId: string; sequenceNumber: number;
  documentStatus: 'N' | 'C'; rejectedDocumentNo: string | null; referenceDocumentNo: string | null;
  documentDate: string; systemEntryDate: string; clientId: string | null; customerTaxId: string; customerCountry: string;
  customerName: string; customerAddress: string | null; creditId: string | null; paymentId: string | null;
  netTotalMinor: number; taxPayableMinor: number; grossTotalMinor: number; withholdingMinor: number;
  payload: string; jwsSignature: string; saftHash: string; saftHashControl: string; deviceId: string;
  agtStatus: EstadoAgt; agtRequestId: string | null; agtErrors: string; agtAttempts: number;
  agtLastAttemptAt: string | null; agtNextAttemptAt: string | null; agtValidatedAt: string | null;
  createdBy: string | null; createdByName: string | null; createdAt: string;
}

export interface PedidoEmissao {
  tipo: AgtTipoDocumento;
  idempotencia: string;
  cliente: { id?: string | null; nif?: string | null; nome: string; morada?: string | null; pais?: string };
  linhas?: LinhaEncargo[];
  referencia?: { documento: string; motivo: string };
  recibos?: string[];
  retencoes?: AgtRetencao[];
  creditId?: string | null;
  paymentId?: string | null;
  correcaoDe?: string;
  data?: string;
  previsualizar?: boolean;
}

export interface ResultadoEmissao { documento: Partial<AgtDocumento>; problemas: Problema[]; id?: string; duplicado?: boolean; simulado?: boolean }

const agora = () => new Date().toISOString();
const minor = (v: number) => Math.round(round2(v) * 100);
const kz = (m: number | null | undefined) => (m ?? 0) / 100;
const uuid = () => crypto.randomUUID();
const POLITICA = { primeiraConsultaMs: 60_000, baseMs: 30_000, maxMs: 30 * 60_000, prazoHoras: 24 };
const espera = (tentativas: number) => Math.min(POLITICA.baseMs * 2 ** Math.max(0, tentativas - 1), POLITICA.maxMs);
const depois = (ms: number) => new Date(Date.now() + ms).toISOString();

const parse = <T>(texto: string | null | undefined, padrao: T): T => { try { return texto ? JSON.parse(texto) as T : padrao; } catch { return padrao; } };
export const lerPayload = (d: Pick<DocumentoFiscal, 'payload'>) => parse<AgtDocumento>(d.payload, {} as AgtDocumento);
export const lerErros = (d: Pick<DocumentoFiscal, 'agtErrors'>) =>
  parse<AgtErro[]>(d.agtErrors, []).map(e => ({ ...e, hint: e.hint ?? DICAS_ERRO_AGT[codigoErro(e)] }));

class ErroFiscal extends Error {
  constructor(message: string, public problemas: Problema[] = []) { super(message); }
}
export { ErroFiscal };

const auditar = (user: Utilizador | undefined, accao: 'create' | 'update' | 'export', texto: string, dados?: Record<string, unknown>) =>
  ServicoAuditoria.addLog(accao, 'report', `Fiscal: ${texto}`, user?.id || 'system', user?.name || 'Sistema', undefined, dados, { modulo: 'fiscal' })
    .catch(erro => console.warn('[Fiscal] auditoria', erro));

// ============================================================================ empresa e configuração
export const empresaDe = (s: { name?: string; nif?: string; address?: string; phone?: string; email?: string; [k: string]: unknown }, config?: ConfigFiscal): EmpresaFiscal => ({
  nif: String(s.nif || '').replace(/\D/g, ''),
  nome: String(s.name || ''),
  morada: String(s.address || ''),
  cidade: config?.cidade || String((s as any).location || (s as any).city || ''),
  provincia: config?.provincia,
  telefone: s.phone ? String(s.phone) : undefined,
  email: s.email ? String(s.email) : undefined,
  website: (s as any).website ? String((s as any).website) : undefined,
});

export async function obterConfig(): Promise<ConfigFiscal> {
  const linha = await db.get<{ data: string }>('SELECT data FROM fiscal_settings WHERE id = ?', ['default']);
  const guardada = parse<Partial<ConfigFiscal>>(linha?.data, {});
  return { ...CONFIG_PADRAO, ...guardada, software: { ...CONFIG_PADRAO.software, ...(guardada.software ?? {}), productVersion: VERSAO_SOFTWARE }, perfis: guardada.perfis ?? {} };
}

export async function guardarConfig(config: ConfigFiscal, user: Utilizador) {
  if (config.ambiente === 'producao' && config.agtActiva && !config.software.softwareValidationNumber)
    throw new ErroFiscal('Não é possível comunicar em produção sem o número de certificação do software atribuído pela AGT.');
  await db.run(
    'INSERT INTO fiscal_settings (id, data, updatedAt, updatedBy) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy',
    ['default', JSON.stringify(config), agora(), user.id],
  );
  await auditar(user, 'update', `configuração AGT alterada (${config.ambiente}, ${config.agtActiva ? 'comunicação activa' : 'simulação'}${config.contingencia ? ', contingência' : ''})`);
}

const envelope = (config: ConfigFiscal, empresa: EmpresaFiscal, extra: Record<string, unknown>, comUUID = true) => {
  const { jwsSoftwareSignature, producerTaxId: _p, ...detalhe } = config.software;
  return {
    schemaVersion: '2.0',
    ...(comUUID ? { submissionUUID: uuid() } : {}),
    taxRegistrationNumber: empresa.nif,
    submissionTimeStamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    softwareInfo: { softwareInfoDetail: detalhe, jwsSoftwareSignature },
    ...extra,
  };
};

async function registarChamada(servico: string, r: RespostaAgt | null, docs: string[], erro?: string) {
  await db.run(
    'INSERT INTO fiscal_agt_requests (id, service, requestId, documentNos, httpStatus, resultCode, durationMs, error, deviceId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [uuid(), servico, r?.dados?.requestID ?? null, JSON.stringify(docs), r?.status ?? null, r?.dados?.resultCode != null ? String(r.dados.resultCode) : null,
      r?.ms ?? null, erro ?? r?.erroRede ?? (r && !r.ok ? errosDe(r).map(e => `${codigoErro(e)} ${e.descriptionError ?? e.errorDescription ?? ''}`).join(' | ') || `HTTP ${r.status}` : null),
      getDeviceId(), agora()],
  ).catch(e => console.warn('[Fiscal] registo de chamada', e));
}

function errosDe(r: RespostaAgt): AgtErro[] {
  const d = r.dados;
  if (!d) return [];
  const lista = d.errorList ?? d.requestErrorList ?? (Array.isArray(d) ? d : null);
  if (Array.isArray(lista)) return lista.filter((e: unknown) => e && typeof e === 'object');
  if (d.errorCode || d.idError) return [d];
  if (d.errorMessage) return [{ errorCode: 'E99', errorDescription: String(d.errorMessage) }];
  return [];
}

async function chamar(config: ConfigFiscal, servico: ServicoAgt, corpo: Record<string, unknown>, docs: string[] = []) {
  try {
    const r = await ponteAgt.chamar(config.ambiente, servico, corpo);
    await registarChamada(servico, r, docs);
    return r;
  } catch (erro) {
    await registarChamada(servico, null, docs, (erro as Error).message);
    throw erro;
  }
}

export async function testarLigacao(config: ConfigFiscal, empresa: EmpresaFiscal) {
  const r = await chamar(config, 'listarSeries', envelope(config, empresa, { establishmentNumber: config.estabelecimento }, false));
  return { ok: r.ok, status: r.status, ms: r.ms, erros: errosDe(r), erroRede: r.erroRede };
}

// ============================================================================ séries
export const listarSeries = () => db.query<SerieFiscal>('SELECT * FROM fiscal_series ORDER BY seriesYear DESC, documentType, createdAt');

export async function solicitarSerie(p: { tipo: AgtTipoDocumento; ano: number; contingencia: boolean }, config: ConfigFiscal, empresa: EmpresaFiscal, user: Utilizador) {
  const hoje = new Date();
  const posDezembro = hoje.getMonth() === 11 && hoje.getDate() > 15;
  if (p.ano !== hoje.getFullYear() && !(posDezembro && p.ano === hoje.getFullYear() + 1))
    throw new ErroFiscal('Só é possível pedir séries para o ano corrente (ou para o seguinte, depois de 15 de Dezembro).');
  const deviceId = getDeviceId();

  if (!config.agtActiva) {
    const codigo = `${p.tipo}${String(p.ano).slice(2)}SIM${deviceId.slice(0, 4).toUpperCase()}${Date.now().toString(36).slice(-3).toUpperCase()}${p.contingencia ? 'C' : 'N'}`;
    await db.run(
      'INSERT INTO fiscal_series (id, seriesCode, seriesYear, documentType, establishment, contingency, status, firstNumber, lastNumber, nextNumber, deviceId, simulated, agtSyncedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [uuid(), codigo, p.ano, p.tipo, config.estabelecimento, p.contingencia ? 1 : 0, 'A', 1, 999999, 1, deviceId, 1, null, agora()],
    );
    await auditar(user, 'create', `série de simulação ${codigo} criada`);
    return { codigo, simulada: true };
  }

  const r = await chamar(config, 'solicitarSerie', envelope(config, empresa, {
    seriesYear: p.ano, documentType: p.tipo, establishmentNumber: config.estabelecimento, seriesContingencyIndicator: p.contingencia ? 'C' : 'N',
  }));
  const f = r.dados?.seriesFEResult;
  if (!r.ok || !f?.seriesCode) throw new ErroFiscal(r.erroRede || 'A AGT recusou o pedido de série', errosDe(r).map(e => ({ nivel: 'erro' as const, codigo: codigoErro(e), mensagem: `${e.descriptionError ?? e.errorDescription ?? ''} ${DICAS_ERRO_AGT[codigoErro(e)] ?? ''}`.trim() })));
  await db.run(
    'INSERT INTO fiscal_series (id, seriesCode, seriesYear, documentType, establishment, contingency, status, firstNumber, lastNumber, nextNumber, deviceId, simulated, agtSyncedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [uuid(), f.seriesCode, p.ano, p.tipo, config.estabelecimento, p.contingencia ? 1 : 0, 'A', Number(f.firstDocumentNo), Number(f.lastDocumentNo), Number(f.firstDocumentNo), deviceId, 0, agora(), agora()],
  );
  await auditar(user, 'create', `série ${f.seriesCode} atribuída pela AGT (${p.tipo}/${p.ano})`, f);
  return { codigo: f.seriesCode as string, simulada: false };
}

export async function sincronizarSeries(config: ConfigFiscal, empresa: EmpresaFiscal, user: Utilizador) {
  const r = await chamar(config, 'listarSeries', envelope(config, empresa, { establishmentNumber: config.estabelecimento }, false));
  if (!r.ok) throw new ErroFiscal(r.erroRede || 'Falha ao listar séries na AGT');
  const lista: any[] = r.dados?.seriesInfo ?? r.dados?.seriresInfo ?? [];
  const locais = new Map((await listarSeries()).map(s => [s.seriesCode, s]));
  let novas = 0, actualizadas = 0;
  for (const s of lista) {
    if (s.invoicingMethod && s.invoicingMethod !== 'FESF') continue;
    const estado = String(s.seriesStatus ?? 'A').trim().slice(0, 1) as SerieFiscal['status'];
    const ultimo = Number(s.lastDocumentApproved ?? 1);
    const local = locais.get(s.seriesCode);
    if (local) {
      await db.run('UPDATE fiscal_series SET status = ?, lastNumber = ?, agtSyncedAt = ? WHERE id = ?', [estado, ultimo, agora(), local.id]);
      actualizadas++;
    } else {
      // Série criada noutro sistema ou noutro computador: fica associada a este dispositivo só se nunca tiver sido usada.
      const proximo = s.lastDocumentCreated ? Number(String(s.lastDocumentCreated).split('/').pop()) + 1 : Number(s.firstDocumentApproved ?? 1);
      await db.run(
        'INSERT INTO fiscal_series (id, seriesCode, seriesYear, documentType, establishment, contingency, status, firstNumber, lastNumber, nextNumber, deviceId, simulated, agtSyncedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid(), s.seriesCode, Number(s.seriesYear), s.documentType, config.estabelecimento, s.seriesContingencyIndicator === 'C' ? 1 : 0, estado,
          Number(s.firstDocumentApproved ?? 1), ultimo, Number.isFinite(proximo) ? proximo : 1, getDeviceId(), 0, agora(), agora()],
      );
      novas++;
    }
  }
  await auditar(user, 'update', `séries sincronizadas com a AGT (${novas} novas, ${actualizadas} actualizadas)`);
  return { total: lista.length, novas, actualizadas };
}

// ============================================================================ emissão
const PRODUTO_PARA_ENCARGO: Record<string, TipoEncargo> = {
  JUROS: 'juros', 'JUROS-MORA': 'juros_mora', 'COM-ABERT': 'comissao_abertura', 'COM-GEST': 'comissao_gestao',
  SEGURO: 'seguro', 'IS-CREDITO': 'imposto_selo_capital',
};
const linhasDoDocumento = (p: AgtDocumento): LinhaEncargo[] => (p.lines ?? []).map(l => {
  const base = l.taxes?.find(t => t.taxBase != null)?.taxBase;
  return {
    tipo: PRODUTO_PARA_ENCARGO[l.productCode] ?? 'outros', descricao: l.productDescription,
    quantidade: base != null ? 1 : l.quantity, valor: base ?? l.unitPriceBase, desconto: l.settlementAmount || undefined,
    unidade: l.unitOfMeasure, soImposto: base != null,
  };
});

export async function emitir(pedido: PedidoEmissao, ctx: { config: ConfigFiscal; empresa: EmpresaFiscal; user: Utilizador }, tentativa = 1): Promise<ResultadoEmissao> {
  const { config, empresa, user } = ctx;
  if (!/^\d{10}$/.test(empresa.nif)) throw new ErroFiscal('O NIF da empresa (Definições › Empresa) tem de ter 10 dígitos antes de emitir documentos fiscais.');

  if (!pedido.previsualizar) {
    const existente = await db.get<DocumentoFiscal>('SELECT * FROM fiscal_documents WHERE idempotencyKey = ?', [pedido.idempotencia]);
    if (existente) return { id: existente.id, documento: lerPayload(existente), problemas: [], duplicado: true };
  }

  const data = pedido.data ?? dataLuanda();
  const ano = Number(data.slice(0, 4));
  const serie = await db.get<SerieFiscal>(
    "SELECT * FROM fiscal_series WHERE deviceId = ? AND documentType = ? AND seriesYear = ? AND contingency = ? AND establishment = ? AND status IN ('A','U') AND nextNumber <= lastNumber ORDER BY simulated, createdAt LIMIT 1",
    [getDeviceId(), pedido.tipo, ano, config.contingencia ? 1 : 0, config.estabelecimento],
  );
  if (!serie) throw new ErroFiscal(`Este computador não tem série ${config.contingencia ? 'de contingência ' : ''}activa para ${pedido.tipo}/${ano}. Peça uma em Relatórios Fiscais › Séries.`);
  const simulado = serie.simulated === 1;
  const numero = numeroDocumento(pedido.tipo, serie.seriesCode, serie.nextNumber);

  let recibos: Parameters<typeof construirDocumento>[0]['recibos'];
  if (pedido.recibos?.length) {
    recibos = [];
    for (const n of pedido.recibos) {
      const o = await db.get<DocumentoFiscal>('SELECT * FROM fiscal_documents WHERE documentNo = ?', [n]);
      if (!o) throw new ErroFiscal(`Documento ${n} não encontrado`);
      recibos.push({ documento: o.documentNo, data: o.documentDate, base: kz(o.netTotalMinor), imposto: kz(o.taxPayableMinor), notaCredito: o.documentType === 'NC' });
    }
  }

  const porAssinar = construirDocumento({
    tipo: pedido.tipo, numero, data, dataSistema: dataHoraLuanda(), estado: pedido.correcaoDe ? 'C' : 'N', documentoRejeitado: pedido.correcaoDe,
    cliente: { nif: pedido.cliente.nif, pais: pedido.cliente.pais, nome: pedido.cliente.nome },
    linhas: pedido.linhas, referencia: pedido.referencia, recibos, retencoes: pedido.retencoes,
  }, config);

  const problemas = validarDocumento(porAssinar, { config, encargos: pedido.linhas?.map(l => l.tipo) });
  if (pedido.correcaoDe) {
    const o = await db.get<DocumentoFiscal>('SELECT * FROM fiscal_documents WHERE documentNo = ?', [pedido.correcaoDe]);
    if (!o) problemas.push({ nivel: 'erro', codigo: 'E14', mensagem: `Documento ${pedido.correcaoDe} não existe` });
    else if (o.agtStatus !== 'invalido') problemas.push({ nivel: 'erro', codigo: 'CORR', mensagem: 'Só documentos rejeitados pela AGT se corrigem; para anular use uma nota de crédito.' });
  }
  if (pedido.referencia) {
    const base = await db.get<DocumentoFiscal>('SELECT * FROM fiscal_documents WHERE documentNo = ?', [pedido.referencia.documento]);
    if (!base) problemas.push({ nivel: 'erro', codigo: 'E14', mensagem: `Documento de origem ${pedido.referencia.documento} desconhecido` });
    else {
      const creditado = await db.get<{ total: number }>("SELECT COALESCE(SUM(grossTotalMinor), 0) AS total FROM fiscal_documents WHERE documentType = 'NC' AND referenceDocumentNo = ?", [pedido.referencia.documento]);
      if ((creditado?.total ?? 0) + minor(porAssinar.documentTotals.grossTotal) > base.grossTotalMinor)
        problemas.push({ nivel: 'erro', codigo: 'E42', mensagem: 'O total creditado excede o valor ainda não anulado do documento de origem' });
    }
  }
  if (simulado) problemas.push({ nivel: 'aviso', codigo: 'SIM', mensagem: 'Série de simulação: o documento não é comunicado à AGT nem entra no SAF-T.' });

  if (pedido.previsualizar) return { documento: porAssinar, problemas, simulado };
  if (temErros(problemas)) throw new ErroFiscal('O documento não passou na validação fiscal', problemas);

  // Assinatura e hash fora do navegador. Em séries de simulação, sem chaves, usam-se marcas de simulação.
  let jws: string, hash: string;
  const anterior = await db.get<{ saftHash: string }>('SELECT saftHash FROM fiscal_documents WHERE seriesId = ? ORDER BY sequenceNumber DESC LIMIT 1', [serie.id]);
  const mensagem = mensagemHashSaft({ data, dataSistema: porAssinar.systemEntryDate, numero, total: porAssinar.documentTotals.grossTotal, hashAnterior: anterior?.saftHash ?? '' });
  try {
    jws = await ponteAgt.assinarDocumento(payloadAssinaturaDocumento(porAssinar, empresa.nif));
    [hash] = await ponteAgt.hashesSaft([mensagem]);
  } catch (erro) {
    if (!simulado) throw new ErroFiscal(`Não foi possível assinar o documento: ${(erro as Error).message}`);
    jws = 'SIMULACAO';
    hash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(mensagem)))));
  }
  const documento: AgtDocumento = { ...porAssinar, jwsDocumentSignature: jws };
  const id = uuid();
  const retencao = round2((documento.withholdingTaxList ?? []).reduce((s, w) => s + w.withholdingTaxAmount, 0));

  try {
    await db.transaction([
      { sql: "UPDATE fiscal_series SET nextNumber = nextNumber + 1, status = 'U' WHERE id = ? AND nextNumber = ?", params: [serie.id, serie.nextNumber], expectChanges: 1 },
      {
        sql: 'INSERT INTO fiscal_documents (id, idempotencyKey, documentNo, documentType, seriesId, sequenceNumber, documentStatus, rejectedDocumentNo, referenceDocumentNo, documentDate, systemEntryDate, clientId, customerTaxId, customerCountry, customerName, customerAddress, creditId, paymentId, netTotalMinor, taxPayableMinor, grossTotalMinor, withholdingMinor, payload, jwsSignature, saftHash, saftHashControl, deviceId, agtStatus, agtErrors, agtAttempts, agtNextAttemptAt, createdBy, createdByName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [id, pedido.idempotencia, numero, pedido.tipo, serie.id, serie.nextNumber, documento.documentStatus, pedido.correcaoDe ?? null,
          pedido.referencia?.documento ?? null, data, documento.systemEntryDate, pedido.cliente.id ?? null, documento.customerTaxID, documento.customerCountry,
          documento.companyName, pedido.cliente.morada ?? null, pedido.creditId ?? null, pedido.paymentId ?? null,
          minor(documento.documentTotals.netTotal), minor(documento.documentTotals.taxPayable), minor(documento.documentTotals.grossTotal), minor(retencao),
          JSON.stringify(documento), jws, hash, '1', getDeviceId(), simulado ? 'simulado' : 'pendente', '[]', 0, agora(), user.id, user.name, agora()],
      },
    ]);
  } catch (erro) {
    // Outro posto (modo cliente) usou o mesmo número entretanto: volta a reservar.
    if (/concorr/i.test((erro as Error).message) && tentativa < 3) return emitir(pedido, ctx, tentativa + 1);
    throw erro;
  }
  await auditar(user, 'create', `${pedido.correcaoDe ? 'correcção ' : ''}${numero} emitido (${round2(documento.documentTotals.grossTotal)} Kz, cliente ${documento.customerTaxID})`, { documentNo: numero, paymentId: pedido.paymentId });
  return { id, documento, problemas, simulado };
}

export async function corrigirRejeitado(docId: string, ctx: { config: ConfigFiscal; empresa: EmpresaFiscal; user: Utilizador }) {
  const o = await db.get<DocumentoFiscal>('SELECT * FROM fiscal_documents WHERE id = ?', [docId]);
  if (!o) throw new ErroFiscal('Documento não encontrado');
  const p = lerPayload(o);
  return emitir({
    tipo: p.documentType, idempotencia: `corr:${o.documentNo}`,
    cliente: { id: o.clientId, nif: p.customerTaxID, nome: p.companyName, morada: o.customerAddress, pais: p.customerCountry },
    linhas: TIPOS_RECIBO.includes(p.documentType) ? undefined : linhasDoDocumento(p),
    recibos: p.paymentReceipt?.sourceDocuments.map(s => s.sourceDocumentID.OriginatingON),
    referencia: o.referenceDocumentNo ? { documento: o.referenceDocumentNo, motivo: p.lines?.[0]?.referenceInfo?.reason ?? 'Correcção' } : undefined,
    retencoes: p.withholdingTaxList, creditId: o.creditId, paymentId: null, correcaoDe: o.documentNo,
  }, ctx);
}

export async function anularComNotaCredito(docId: string, motivo: string, ctx: { config: ConfigFiscal; empresa: EmpresaFiscal; user: Utilizador }) {
  if (motivo.trim().length < 5) throw new ErroFiscal('Indique o motivo da anulação.');
  const o = await db.get<DocumentoFiscal>('SELECT * FROM fiscal_documents WHERE id = ?', [docId]);
  if (!o) throw new ErroFiscal('Documento não encontrado');
  if (o.documentType === 'NC') throw new ErroFiscal('Uma nota de crédito não se anula com outra nota de crédito.');
  const p = lerPayload(o);
  if (!p.lines?.length) throw new ErroFiscal('Recibos anulam-se com documento de estorno, não com nota de crédito.');
  const r = await emitir({
    tipo: 'NC', idempotencia: `nc:${o.documentNo}`,
    cliente: { id: o.clientId, nif: p.customerTaxID, nome: p.companyName, morada: o.customerAddress, pais: p.customerCountry },
    linhas: linhasDoDocumento(p), referencia: { documento: o.documentNo, motivo: motivo.trim() }, creditId: o.creditId,
  }, ctx);
  await auditar(ctx.user, 'update', `${o.documentNo} anulado pela nota de crédito ${r.documento.documentNo}: ${motivo.trim()}`);
  return r;
}

// ============================================================================ pagamentos → facturas
export interface PagamentoPorFacturar { payment: Payment; credit?: Credit; client?: Client; juros: number; mora: number }

export async function pagamentosPorFacturar(payments: Payment[], credits: Credit[], clients: Client[], desde?: string): Promise<PagamentoPorFacturar[]> {
  const facturados = new Set((await db.query<{ paymentId: string }>('SELECT paymentId FROM fiscal_documents WHERE paymentId IS NOT NULL')).map(r => r.paymentId));
  const creditos = new Map(credits.map(c => [c.id, c]));
  const clientes = new Map(clients.map(c => [c.id, c]));
  return payments
    .filter(p => p.status === 'confirmed' && !p.deletedAt && !facturados.has(p.id))
    .filter(p => !desde || dataLuanda(new Date(p.paymentDate)) >= desde)
    .map(p => {
      const credit = creditos.get(p.creditId);
      return { payment: p, credit, client: credit ? clientes.get(credit.clientId) : undefined,
        juros: round2(Number(p.allocatedToInterest || 0)), mora: round2(Number(p.allocatedToLateInterest || 0)) };
    })
    .filter(x => x.juros + x.mora > 0)
    .sort((a, b) => +new Date(a.payment.paymentDate) - +new Date(b.payment.paymentDate));
}

export function pedidoDoPagamento(x: PagamentoPorFacturar): PedidoEmissao {
  const numeroCredito = x.credit ? x.credit.id.slice(0, 8).toUpperCase() : x.payment.creditId.slice(0, 8).toUpperCase();
  const recibo = x.payment.receiptYear && x.payment.receiptSeq ? `recibo RC ${x.payment.receiptYear}/${x.payment.receiptSeq}` : undefined;
  return {
    tipo: 'FR', idempotencia: `pay:${x.payment.id}`,
    cliente: { id: x.client?.id ?? x.credit?.clientId, nif: x.client?.nif, nome: x.client?.name ?? x.payment.clientName, morada: x.client?.address },
    linhas: linhasDoPagamento({ numeroCredito, juros: x.juros, jurosMora: x.mora, referencia: recibo }),
    creditId: x.payment.creditId, paymentId: x.payment.id,
  };
}

export async function facturarPagamentos(lista: PagamentoPorFacturar[], ctx: { config: ConfigFiscal; empresa: EmpresaFiscal; user: Utilizador }) {
  const resultado = { emitidos: 0, falhas: [] as Array<{ pagamento: string; erro: string }> };
  for (const x of lista) {
    try { await emitir(pedidoDoPagamento(x), ctx); resultado.emitidos++; }
    catch (erro) { resultado.falhas.push({ pagamento: x.payment.id, erro: (erro as Error).message }); }
  }
  return resultado;
}

// ============================================================================ fila de comunicação
export async function processarFila(config: ConfigFiscal, empresa: EmpresaFiscal) {
  if (!config.agtActiva) return { enviados: 0, consultados: 0 };
  const deviceId = getDeviceId();
  let enviados = 0, consultados = 0;

  // 1) Envio (lotes de 30, só os documentos emitidos neste computador)
  const pendentes = await db.query<DocumentoFiscal>(
    "SELECT * FROM fiscal_documents WHERE deviceId = ? AND agtStatus IN ('pendente','erro_envio') AND (agtNextAttemptAt IS NULL OR agtNextAttemptAt <= ?) ORDER BY systemEntryDate LIMIT 30",
    [deviceId, agora()],
  );
  if (pendentes.length) {
    const nums = pendentes.map(d => d.documentNo);
    let r: RespostaAgt | null = null;
    try { r = await chamar(config, 'registarFactura', envelope(config, empresa, { numberOfEntries: pendentes.length, documents: pendentes.map(lerPayload) }), nums); }
    catch (erro) { r = { success: false, ok: false, status: 0, dados: null, erroRede: (erro as Error).message, ms: 0 }; }
    const erros = errosDe(r);
    const porDoc = new Map<string, AgtErro[]>();
    for (const e of erros) if (e.documentNo) porDoc.set(e.documentNo, [...(porDoc.get(e.documentNo) ?? []), e]);
    const requestID = r.dados?.requestID as string | undefined;
    const duplicado = erros.some(e => codigoErro(e) === 'E09');
    const reTentavel = !r.ok && (r.status === 0 || r.status === 429 || r.status >= 500 || erros.some(e => ['E96', 'E97', 'E98', 'E99'].includes(codigoErro(e))));
    const instrucoes = pendentes.map(d => {
      const proprios = porDoc.get(d.documentNo);
      if (proprios?.length && !reTentavel)
        return { sql: "UPDATE fiscal_documents SET agtStatus = 'invalido', agtErrors = ?, agtLastAttemptAt = ?, agtNextAttemptAt = NULL, agtAttempts = agtAttempts + 1 WHERE id = ?", params: [JSON.stringify(proprios), agora(), d.id] };
      if ((r!.ok || duplicado) && requestID)
        return { sql: "UPDATE fiscal_documents SET agtStatus = 'enviado', agtRequestId = ?, agtErrors = '[]', agtLastAttemptAt = ?, agtNextAttemptAt = ?, agtAttempts = agtAttempts + 1 WHERE id = ?", params: [requestID, agora(), depois(POLITICA.primeiraConsultaMs), d.id] };
      const n = d.agtAttempts + 1;
      const detalhe = erros.length ? erros : [{ errorCode: 'NET', errorDescription: r!.erroRede ?? `HTTP ${r!.status}` }];
      return { sql: "UPDATE fiscal_documents SET agtStatus = 'erro_envio', agtErrors = ?, agtLastAttemptAt = ?, agtNextAttemptAt = ?, agtAttempts = ? WHERE id = ?", params: [JSON.stringify(detalhe), agora(), reTentavel || !erros.length ? depois(espera(n)) : null, n, d.id] };
    });
    await db.transaction(instrucoes);
    if (r.ok) enviados = pendentes.length - porDoc.size;
  }

  // 2) Acompanhamento (obterEstado)
  const pedidos = await db.query<{ agtRequestId: string; tentativas: number }>(
    "SELECT agtRequestId, MAX(agtAttempts) AS tentativas FROM fiscal_documents WHERE deviceId = ? AND agtStatus IN ('enviado','em_validacao') AND agtRequestId IS NOT NULL AND (agtNextAttemptAt IS NULL OR agtNextAttemptAt <= ?) GROUP BY agtRequestId LIMIT 20",
    [deviceId, agora()],
  );
  for (const { agtRequestId, tentativas } of pedidos) {
    await consultarPedido(config, empresa, agtRequestId, Number(tentativas) + 1);
    consultados++;
  }
  return { enviados, consultados };
}

async function consultarPedido(config: ConfigFiscal, empresa: EmpresaFiscal, requestID: string, n: number) {
  let r: RespostaAgt;
  try { r = await chamar(config, 'obterEstado', envelope(config, empresa, { requestID })); }
  catch { r = { success: false, ok: false, status: 0, dados: null, ms: 0 }; }
  const codigo = Number(r.dados?.resultCode);
  if (!r.ok || codigo === 7 || codigo === 8) {
    await db.run("UPDATE fiscal_documents SET agtStatus = 'em_validacao', agtAttempts = ?, agtNextAttemptAt = ? WHERE agtRequestId = ? AND agtStatus IN ('enviado','em_validacao')", [n, depois(espera(n)), requestID]);
    return;
  }
  if (codigo === 9) {
    await db.run("UPDATE fiscal_documents SET agtStatus = 'pendente', agtRequestId = NULL, agtNextAttemptAt = ? WHERE agtRequestId = ?", [agora(), requestID]);
    return;
  }
  const lista: Array<{ documentNo: string; documentStatus: 'V' | 'I'; errorList?: AgtErro[] }> = r.dados?.documentStatusList ?? [];
  const docs = await db.query<DocumentoFiscal>('SELECT * FROM fiscal_documents WHERE agtRequestId = ?', [requestID]);
  const porNumero = new Map(docs.map(d => [d.documentNo, d]));
  const instrucoes = lista.flatMap(s => {
    const d = porNumero.get(s.documentNo);
    if (!d) return [];
    if (s.documentStatus === 'V') {
      const atrasado = d.agtLastAttemptAt && (Date.parse(d.agtLastAttemptAt) - Date.parse(d.createdAt)) > POLITICA.prazoHoras * 3_600_000;
      return [{ sql: "UPDATE fiscal_documents SET agtStatus = ?, agtValidatedAt = ?, agtErrors = '[]', agtNextAttemptAt = NULL WHERE id = ?", params: [atrasado ? 'valido_penal' : 'valido', agora(), d.id] }];
    }
    return [{ sql: "UPDATE fiscal_documents SET agtStatus = 'invalido', agtErrors = ?, agtNextAttemptAt = NULL WHERE id = ?", params: [JSON.stringify(s.errorList ?? []), d.id] }];
  });
  if (instrucoes.length) await db.transaction(instrucoes);
}

export async function consultarAgora(docId: string, config: ConfigFiscal, empresa: EmpresaFiscal) {
  const d = await db.get<DocumentoFiscal>('SELECT * FROM fiscal_documents WHERE id = ?', [docId]);
  if (!d) throw new ErroFiscal('Documento não encontrado');
  if (d.agtRequestId && ['enviado', 'em_validacao'].includes(d.agtStatus)) await consultarPedido(config, empresa, d.agtRequestId, d.agtAttempts + 1);
  if (['pendente', 'erro_envio'].includes(d.agtStatus))
    await db.run('UPDATE fiscal_documents SET agtNextAttemptAt = ? WHERE id = ?', [agora(), d.id]);
  return processarFila(config, empresa);
}

let temporizador: ReturnType<typeof setInterval> | null = null;
/** Corre a fila enquanto a aplicação está aberta (e emite automaticamente, se activado). */
export function iniciarFilaFiscal(obterContexto: () => Promise<{ config: ConfigFiscal; empresa: EmpresaFiscal; automatico?: () => Promise<void> } | null>, intervaloMs = 60_000) {
  if (temporizador) return;
  let aCorrer = false;
  const ciclo = async () => {
    if (aCorrer) return;
    aCorrer = true;
    try {
      const ctx = await obterContexto();
      if (!ctx) return;
      if (ctx.config.emissaoAutomatica && ctx.automatico) await ctx.automatico();
      await processarFila(ctx.config, ctx.empresa);
    } catch (erro) {
      console.warn('[Fiscal] fila AGT', erro);
    } finally { aCorrer = false; }
  };
  temporizador = setInterval(ciclo, intervaloMs);
  void ciclo();
}
export function pararFilaFiscal() { if (temporizador) clearInterval(temporizador); temporizador = null; }

// ============================================================================ consultas
export const listarDocumentos = (inicio: string, fim: string) =>
  db.query<DocumentoFiscal>('SELECT * FROM fiscal_documents WHERE documentDate >= ? AND documentDate <= ? ORDER BY systemEntryDate DESC', [inicio, fim]);

export const obterDocumento = (id: string) => db.get<DocumentoFiscal>('SELECT * FROM fiscal_documents WHERE id = ?', [id]);

export const listarChamadas = () => db.query<{ id: string; service: string; requestId: string | null; documentNos: string; httpStatus: number | null; resultCode: string | null; durationMs: number | null; error: string | null; createdAt: string }>(
  'SELECT * FROM fiscal_agt_requests ORDER BY createdAt DESC LIMIT 300');

export const chamadasDoDocumento = (documentNo: string) => db.query<{ service: string; httpStatus: number | null; resultCode: string | null; durationMs: number | null; error: string | null; createdAt: string }>(
  'SELECT service, httpStatus, resultCode, durationMs, error, createdAt FROM fiscal_agt_requests WHERE documentNos LIKE ? ORDER BY createdAt DESC LIMIT 30', [`%"${documentNo}"%`]);

export const eventosFiscais = () => db.query<{ id: string; timestamp: string; userName: string | null; action: string; details: string }>(
  "SELECT id, timestamp, userName, action, details FROM audit_logs WHERE details LIKE 'Fiscal:%' ORDER BY timestamp DESC LIMIT 300");

export interface ResumoFiscal {
  documentos: number; base: number; impostos: number; total: number; retencoes: number; clientes: number;
  porEstado: Partial<Record<EstadoAgt, number>>; porDia: Map<string, { n: number; total: number }>;
  atrasados: DocumentoFiscal[]; rejeitados: number;
}

/** Totais do período. Em modo simulação (sem documentos reais) os de simulação contam, para o painel não ficar vazio. */
export function resumir(docs: DocumentoFiscal[], incluirSimulados = false): ResumoFiscal {
  const r: ResumoFiscal = { documentos: 0, base: 0, impostos: 0, total: 0, retencoes: 0, clientes: 0, porEstado: {}, porDia: new Map(), atrasados: [], rejeitados: 0 };
  const clientes = new Set<string>();
  const limite = Date.now() - 20 * 3_600_000;
  for (const d of docs) {
    r.porEstado[d.agtStatus] = (r.porEstado[d.agtStatus] ?? 0) + 1;
    if (d.agtStatus === 'invalido') r.rejeitados++;
    if (['pendente', 'erro_envio'].includes(d.agtStatus) && Date.parse(d.createdAt) < limite) r.atrasados.push(d);
    if (TIPOS_RECIBO.includes(d.documentType) || (d.agtStatus === 'simulado' && !incluirSimulados)) continue;
    const s = d.documentType === 'NC' ? -1 : 1;
    r.documentos++;
    r.base += s * kz(d.netTotalMinor);
    r.impostos += s * kz(d.taxPayableMinor);
    r.total += s * kz(d.grossTotalMinor);
    r.retencoes += kz(d.withholdingMinor);
    clientes.add(d.customerTaxId === '999999999' ? `CF` : d.customerTaxId);
    const dia = r.porDia.get(d.documentDate) ?? { n: 0, total: 0 };
    r.porDia.set(d.documentDate, { n: dia.n + 1, total: dia.total + s * kz(d.grossTotalMinor) });
  }
  r.clientes = clientes.size;
  r.base = round2(r.base); r.impostos = round2(r.impostos); r.total = round2(r.total); r.retencoes = round2(r.retencoes);
  return r;
}

export interface LinhaMapaImpostos { mes: string; imposto: string; codigo: string; taxa: number; isencao: string; base: number; valor: number; documentos: number }
export function mapaImpostos(docs: DocumentoFiscal[], incluirSimulados = false) {
  const linhas = new Map<string, LinhaMapaImpostos & { ids: Set<string> }>();
  const retencoes = new Map<string, { tipo: string; valor: number; documentos: number }>();
  for (const d of docs) {
    if (['invalido', 'anulado'].includes(d.agtStatus) || (d.agtStatus === 'simulado' && !incluirSimulados)) continue;
    const p = lerPayload(d);
    const s = d.documentType === 'NC' ? -1 : 1;
    for (const l of p.lines ?? []) for (const t of l.taxes ?? []) {
      const chave = `${d.documentDate.slice(0, 7)}|${t.taxType}|${t.taxCode ?? ''}|${t.taxPercentage ?? 0}|${t.taxExemptionCode ?? ''}`;
      const x = linhas.get(chave) ?? { mes: d.documentDate.slice(0, 7), imposto: t.taxType, codigo: t.taxCode ?? '', taxa: t.taxPercentage ?? 0, isencao: t.taxExemptionCode ?? '', base: 0, valor: 0, documentos: 0, ids: new Set<string>() };
      x.base = round2(x.base + s * (l.creditAmount ?? l.debitAmount ?? t.taxBase ?? 0));
      x.valor = round2(x.valor + s * (t.taxContribution ?? 0));
      x.ids.add(d.id); x.documentos = x.ids.size;
      linhas.set(chave, x);
    }
    for (const w of p.withholdingTaxList ?? []) {
      const x = retencoes.get(w.withholdingTaxType) ?? { tipo: w.withholdingTaxType, valor: 0, documentos: 0 };
      x.valor = round2(x.valor + w.withholdingTaxAmount); x.documentos++;
      retencoes.set(w.withholdingTaxType, x);
    }
  }
  return { linhas: [...linhas.values()].map(({ ids: _ids, ...x }) => x).sort((a, b) => a.mes.localeCompare(b.mes) || a.imposto.localeCompare(b.imposto)), retencoes: [...retencoes.values()] };
}

// ============================================================================ SAF-T
async function linhasSaft(inicio: string, fim: string): Promise<LinhaSaft[]> {
  const docs = await db.query<DocumentoFiscal & { simulated: number }>(
    'SELECT d.*, s.simulated FROM fiscal_documents d JOIN fiscal_series s ON s.id = d.seriesId WHERE d.documentDate >= ? AND d.documentDate <= ? AND s.simulated = 0 ORDER BY d.documentType, d.seriesId, d.sequenceNumber',
    [inicio, fim],
  );
  return docs.map(d => ({
    documentNo: d.documentNo, documentType: d.documentType, seriesId: d.seriesId, sequenceNumber: d.sequenceNumber, documentDate: d.documentDate,
    systemEntryDate: d.systemEntryDate, clientId: d.clientId, customerAddress: d.customerAddress, payload: lerPayload(d),
    saftHash: d.saftHash, saftHashControl: d.saftHashControl, agtStatus: d.agtStatus, createdByName: d.createdByName,
  }));
}

/** Verifica o encadeamento dos hashes recalculando-os (RSA PKCS#1 v1.5 é determinística). */
async function verificarHashes(linhas: LinhaSaft[]): Promise<Problema[]> {
  const porSerie = new Map<string, LinhaSaft[]>();
  for (const l of linhas) porSerie.set(l.seriesId, [...(porSerie.get(l.seriesId) ?? []), l]);
  const mensagens: Array<{ l: LinhaSaft; m: string }> = [];
  for (const [serie, lista] of porSerie) {
    lista.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    const ancora = await db.get<{ saftHash: string }>('SELECT saftHash FROM fiscal_documents WHERE seriesId = ? AND sequenceNumber < ? ORDER BY sequenceNumber DESC LIMIT 1', [serie, lista[0].sequenceNumber]);
    let anterior = ancora?.saftHash ?? '';
    for (const l of lista) {
      mensagens.push({ l, m: mensagemHashSaft({ data: l.documentDate, dataSistema: l.payload.systemEntryDate, numero: l.documentNo, total: l.payload.documentTotals.grossTotal, hashAnterior: anterior }) });
      anterior = l.saftHash;
    }
  }
  const problemas: Problema[] = [];
  for (let i = 0; i < mensagens.length; i += 500) {
    const lote = mensagens.slice(i, i + 500);
    const hashes = await ponteAgt.hashesSaft(lote.map(x => x.m));
    lote.forEach((x, k) => { if (hashes[k] !== x.l.saftHash) problemas.push({ nivel: 'erro', codigo: 'HASH', mensagem: 'Hash encadeado não confere — documento alterado ou fora de ordem', documentNo: x.l.documentNo }); });
  }
  return problemas;
}

export async function prevalidarPeriodo(op: OpcoesSaft, config: ConfigFiscal, empresa: EmpresaFiscal) {
  const linhas = await linhasSaft(op.inicio, op.fim);
  const problemas = prevalidarSaft(linhas, empresa, config.software);
  try { problemas.push(...await verificarHashes(linhas)); }
  catch (erro) { problemas.push({ nivel: 'aviso', codigo: 'HASH', mensagem: `Hashes não verificados: ${(erro as Error).message}` }); }
  if (!linhas.length) problemas.push({ nivel: 'aviso', codigo: 'VAZIO', mensagem: 'Não há documentos (fora de séries de simulação) no período' });
  return { documentos: linhas.length, problemas };
}

export async function gerarSaft(op: OpcoesSaft, config: ConfigFiscal, empresa: EmpresaFiscal, user: Utilizador, forcar = false) {
  const { problemas } = await prevalidarPeriodo(op, config, empresa);
  if (temErros(problemas) && !forcar) throw new ErroFiscal('A pré-validação encontrou erros — corrija-os antes de gerar o SAF-T', problemas);
  const linhas = await linhasSaft(op.inicio, op.fim);
  const out = construirSaft(linhas, empresa, resolverPerfis(config), config.software, op, config.estabelecimento);
  const bytes = new TextEncoder().encode(out.xml);
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  const id = uuid();
  await db.run(
    'INSERT INTO fiscal_saft_exports (id, fiscalYear, startDate, endDate, basis, fileName, fileSize, sha256, invoicesCount, paymentsCount, totalDebitMinor, totalCreditMinor, warnings, xml, createdBy, createdByName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, Number(op.inicio.slice(0, 4)), op.inicio, op.fim, op.base, out.nomeFicheiro, bytes.length, sha256, out.estatisticas.facturas, out.estatisticas.recibos,
      minor(out.estatisticas.debito), minor(out.estatisticas.credito), problemas.filter(p => p.nivel === 'aviso').length, out.xml, user.id, user.name, agora()],
  );
  await auditar(user, 'export', `SAF-T ${out.nomeFicheiro} gerado${forcar ? ' com erros (forçado)' : ''} · SHA-256 ${sha256.slice(0, 16)}…`, { ...op, sha256 });
  return { id, ...out, sha256, problemas };
}

export const listarExportacoesSaft = () => db.query<{ id: string; fiscalYear: number; startDate: string; endDate: string; basis: string; fileName: string; fileSize: number; sha256: string; invoicesCount: number; paymentsCount: number; warnings: number; createdByName: string | null; createdAt: string }>(
  'SELECT id, fiscalYear, startDate, endDate, basis, fileName, fileSize, sha256, invoicesCount, paymentsCount, warnings, createdByName, createdAt FROM fiscal_saft_exports ORDER BY createdAt DESC LIMIT 100');

export async function ficheiroSaft(id: string) {
  return db.get<{ fileName: string; xml: string }>('SELECT fileName, xml FROM fiscal_saft_exports WHERE id = ?', [id]);
}

export function descarregar(nome: string, conteudo: string | Blob, tipo = 'application/xml') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}
