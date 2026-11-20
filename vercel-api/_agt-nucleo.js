import crypto from 'node:crypto';

// Núcleo da ligação à AGT (Facturação Electrónica), partilhado pelo processo principal do Electron e pela API
// da VPS. As chaves privadas nunca chegam ao navegador: aqui assinam-se os documentos (jwsDocumentSignature),
// os pedidos (jwsSignature) e o hash encadeado do SAF-T, e fazem-se as chamadas HTTP aos serviços da AGT.
//
// Para não servir de "oráculo" de assinaturas, só se assinam:
//  - documentos com exactamente os 8 campos da especificação de registarFactura;
//  - pedidos que o próprio núcleo envia à AGT, com os campos de assinatura tirados do corpo enviado.

export const AGT_URLS = {
  homologacao: 'https://sifphml.minfin.gov.ao/sigt/fe/v1',
  producao: 'https://sifp.minfin.gov.ao/sigt/fe/v1',
};

/** Campos assinados no jwsSignature de cada serviço (além de taxRegistrationNumber). */
export const AGT_CAMPOS_ASSINATURA = {
  solicitarSerie: ['seriesYear', 'documentType', 'establishmentNumber', 'seriesContingencyIndicator'],
  listarSeries: [],
  registarFactura: null, // sem jwsSignature: cada documento já leva a sua assinatura
  obterEstado: ['requestID'],
  consultarFactura: ['documentNo'],
  listarFacturas: ['queryStartDate', 'queryEndDate'],
  validarDocumento: ['documentNo', 'action', 'deductibleVATPercentage', 'nonDeductibleAmount'],
};

const CAMPOS_DOCUMENTO = ['documentNo', 'taxRegistrationNumber', 'documentType', 'documentDate', 'customerTaxID', 'customerCountry', 'companyName', 'documentTotals'];
const CAMPOS_TOTAIS = ['taxPayable', 'netTotal', 'grossTotal'];

export const base64url = (input) => Buffer.from(input).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');

/** JSON canónico da AGT: compacto, aspas duplas, números sem formatação, sem campos undefined. */
export const jsonCanonico = (valor) => JSON.stringify(valor, (_k, v) => (v === undefined ? undefined : v));

export const assinarJws = (payload, chave) => {
  const cabecalho = { alg: 'RS256', typ: process.env.AGT_JWS_TYP || 'JWT' };
  const entrada = `${base64url(jsonCanonico(cabecalho))}.${base64url(jsonCanonico(payload))}`;
  const assinatura = crypto.createSign('RSA-SHA256').update(entrada).end().sign(chave);
  return `${entrada}.${base64url(assinatura)}`;
};

export const verificarJws = (jws, chave) => {
  const [h, p, s] = String(jws).split('.');
  if (!h || !p || !s) return { valida: false, payload: null };
  const publica = chave.type === 'private' ? crypto.createPublicKey(chave) : chave;
  const b64 = (x) => Buffer.from(x.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const valida = crypto.createVerify('RSA-SHA256').update(`${h}.${p}`).end().verify(publica, b64(s));
  return { valida, payload: JSON.parse(b64(p).toString('utf8')) };
};

/** Lê e valida uma chave privada RSA em PEM. */
export const lerChavePrivada = (pem, minimoBits = 2048) => {
  let chave;
  try { chave = crypto.createPrivateKey({ key: String(pem), format: 'pem' }); }
  catch { throw new Error('O ficheiro não contém uma chave privada PEM válida.'); }
  if (chave.asymmetricKeyType !== 'rsa') throw new Error('A chave tem de ser RSA.');
  const bits = chave.asymmetricKeyDetails?.modulusLength ?? 0;
  if (bits < minimoBits) throw new Error(`A chave tem ${bits} bits; o mínimo é ${minimoBits}.`);
  return chave;
};

export const descreverChave = (chave) => {
  const publica = crypto.createPublicKey(chave).export({ type: 'spki', format: 'der' });
  return {
    carregada: true,
    bits: chave.asymmetricKeyDetails?.modulusLength,
    impressao: crypto.createHash('sha256').update(publica).digest('hex').match(/.{2}/g).slice(0, 12).join(':'),
  };
};

/** jwsDocumentSignature: só aceita o objecto com os campos da especificação, na ordem da especificação. */
export const assinarDocumento = (payload, nif, chave) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Documento inválido.');
  const chaves = Object.keys(payload);
  if (chaves.length !== CAMPOS_DOCUMENTO.length || chaves.some((k, i) => k !== CAMPOS_DOCUMENTO[i])) throw new Error('Campos do documento a assinar não correspondem à especificação AGT.');
  if (String(payload.taxRegistrationNumber) !== String(nif)) throw new Error('O NIF do documento não é o NIF do emissor configurado.');
  const totais = payload.documentTotals;
  if (!totais || Object.keys(totais).join() !== CAMPOS_TOTAIS.join() || CAMPOS_TOTAIS.some(k => typeof totais[k] !== 'number' || !Number.isFinite(totais[k])))
    throw new Error('Totais do documento inválidos.');
  if (typeof payload.documentNo !== 'string' || payload.documentNo.length < 8 || payload.documentNo.length > 60) throw new Error('Número de documento inválido.');
  return assinarJws(payload, chave);
};

/** Hash encadeado do SAF-T (AO): RSA-SHA1 em Base64. O XSD limita-o a 172 caracteres (chave de 1024 bits). */
export const hashSaft = (mensagem, chave) => {
  const texto = String(mensagem);
  if (!/^\d{4}-\d{2}-\d{2};\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2};[^;]{8,60};-?\d+\.\d{2};[A-Za-z0-9+/=]*$/.test(texto)) throw new Error('Mensagem de hash SAF-T inválida.');
  const hash = crypto.createSign('RSA-SHA1').update(texto, 'utf8').end().sign(chave).toString('base64');
  if (hash.length > 172) throw new Error('A chave do hash SAF-T tem de ser RSA de 1024 bits (o XSD limita o Hash a 172 caracteres).');
  return hash;
};

/**
 * Envia um pedido a um serviço da AGT. Acrescenta o jwsSignature quando o serviço o exige, assinando os campos
 * definidos na especificação a partir do próprio corpo enviado.
 */
export const chamarAgt = async ({ ambiente, servico, corpo, nif, chave, fetchImpl = fetch, timeoutMs = 30_000 }) => {
  if (!(servico in AGT_CAMPOS_ASSINATURA)) throw new Error('Serviço AGT desconhecido.');
  if (!(ambiente in AGT_URLS)) throw new Error('Ambiente AGT inválido.');
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new Error('Pedido inválido.');
  if (String(corpo.taxRegistrationNumber) !== String(nif)) throw new Error('O NIF do pedido não é o NIF do emissor configurado.');
  if (servico === 'registarFactura') {
    if (!Array.isArray(corpo.documents) || corpo.documents.length < 1 || corpo.documents.length > 30) throw new Error('registarFactura aceita entre 1 e 30 documentos.');
    if (corpo.numberOfEntries !== corpo.documents.length) throw new Error('numberOfEntries não corresponde ao número de documentos.');
  }
  const campos = AGT_CAMPOS_ASSINATURA[servico];
  const enviar = { ...corpo };
  if (campos) {
    const assinar = { taxRegistrationNumber: String(nif) };
    for (const c of campos) if (corpo[c] !== undefined) assinar[c] = corpo[c];
    enviar.jwsSignature = assinarJws(assinar, chave);
  }
  const inicio = Date.now();
  const controlo = new AbortController();
  const temporizador = setTimeout(() => controlo.abort(), timeoutMs);
  try {
    const resposta = await fetchImpl(`${AGT_URLS[ambiente]}/${servico}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(enviar),
      signal: controlo.signal,
    });
    const texto = await resposta.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { dados = { errorMessage: texto.slice(0, 500) }; }
    return { ok: resposta.ok, status: resposta.status, dados, ms: Date.now() - inicio };
  } catch (erro) {
    const mensagem = erro?.name === 'AbortError' ? `Sem resposta da AGT em ${Math.round(timeoutMs / 1000)} s` : (erro?.message || String(erro));
    return { ok: false, status: 0, dados: null, erroRede: mensagem, ms: Date.now() - inicio };
  } finally {
    clearTimeout(temporizador);
  }
};
