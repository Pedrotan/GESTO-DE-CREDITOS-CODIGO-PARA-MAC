// Regras sem dependências de Node: partilhadas pelo Hub e pelo trabalhador da VPS.
export const hojeLuanda = (now = new Date()) => {
  const timestamp = new Date(now).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp + 3600000).toISOString().slice(0, 10) : '';
};
export const diaValido = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export const somarDias = (key, days) => new Date(Date.parse(key) + days * 86400000).toISOString().slice(0, 10);
export const telefoneAngola = value => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00244')) digits = digits.slice(2);
  if (digits.length === 9) digits = '244' + digits;
  return /^2449\d{8}$/.test(digits) ? digits : null;
};
export const POLITICA_COBRANCA_PADRAO = {
  automatico: false, juridicoAutomatico: false, inicioHora: 8, fimHora: 19, limiteDiario: 1, intervaloPromocoesDias: 7,
  diasPreventivos: 7, intervaloEnvioSegundos: 60, feriadosAdicionais: [],
  passos: [
    { id: 'd-3', dia: -3, accao: 'lembrete', tom: 'Informativo', texto: 'Olá, {nome}. A sua prestação de {valor} vence em {vencimento}. {pagamento} Obrigado, {empresa}.', activo: true },
    { id: 'd-1', dia: -1, accao: 'lembrete', tom: 'Informativo', texto: 'Olá, {nome}. Lembramos a prestação de {valor}, com vencimento em {vencimento}. {pagamento}', activo: true },
    { id: 'd0', dia: 0, accao: 'lembrete', tom: 'Informativo', texto: 'Olá, {nome}. A prestação de {valor} vence hoje. {pagamento} Se já pagou, envie o comprovativo.', activo: true },
    { id: 'd1', dia: 1, accao: 'aviso', tom: 'Simpático', texto: 'Olá, {nome}. Consta uma prestação vencida de {valor}, em {vencimento}. {pagamento} Se já pagou, contacte-nos.', activo: true },
    { id: 'd7', dia: 7, accao: 'aviso', tom: 'Firme', texto: '{nome}, o valor vencido é {valor}, incluindo a mora apurada. Solicitamos a regularização. {pagamento}', activo: true },
    { id: 'd15', dia: 15, accao: 'negociacao', tom: 'Negocial', texto: 'Olá, {nome}. Queremos encontrar uma solução para {valor} em atraso. Contacte a {empresa} para avaliar uma renegociação.', activo: true },
    { id: 'd30', dia: 30, accao: 'juridico', tom: 'Formal', texto: 'Avaliar encaminhamento ao contencioso.', activo: true },
  ],
};
export function validarPolitica(raw) {
  const p = { ...POLITICA_COBRANCA_PADRAO, ...raw };
  for (const [key, min, max] of [['inicioHora', 0, 23], ['fimHora', 1, 24], ['limiteDiario', 1, 5], ['intervaloPromocoesDias', 7, 365], ['diasPreventivos', 1, 60], ['intervaloEnvioSegundos', 30, 3600]]) {
    if (!Number.isInteger(p[key]) || p[key] < min || p[key] > max) throw new Error(`Configuração inválida: ${key}.`);
  }
  if (p.inicioHora >= p.fimHora) throw new Error('A hora de fim deve ser posterior à de início.');
  if (!Array.isArray(p.passos) || !p.passos.length || p.passos.length > 30) throw new Error('Defina entre 1 e 30 passos.');
  const ids = new Set();
  p.passos = p.passos.map(s => {
    if (!/^[\w-]{1,50}$/.test(s.id) || ids.has(s.id) || !Number.isInteger(s.dia) || s.dia < -60 || s.dia > 365 || !['lembrete', 'aviso', 'negociacao', 'juridico'].includes(s.accao) || !String(s.texto || '').trim() || String(s.texto).length > 4000) throw new Error('Passo da régua inválido ou repetido.');
    ids.add(s.id); return { ...s, activo: Boolean(s.activo) };
  }).sort((a, b) => a.dia - b.dia);
  p.feriadosAdicionais = (p.feriadosAdicionais || []).filter(diaValido);
  p.automatico = p.automatico === true;
  p.juridicoAutomatico = p.juridicoAutomatico === true;
  return p;
}
export function horarioPermitido(now, politica, feriados = []) {
  const key = hojeLuanda(now), local = new Date(new Date(now).getTime() + 3600000);
  if ([0, 6].includes(local.getUTCDay())) return 'Fim de semana';
  if (feriados.includes(key) || (politica.feriadosAdicionais || []).includes(key)) return 'Feriado ou dia sem expediente';
  const hora = local.getUTCHours() + local.getUTCMinutes() / 60;
  if (hora < politica.inicioHora || hora >= politica.fimHora) return 'Fora do horário permitido';
  return null;
}
export function passoDaRegua(item, politica, feitos = [], promiseDate) {
  const age = Number(item.diasAtraso);
  if (promiseDate && promiseDate > item.hoje) return null;
  const passos = politica.passos.filter(s => s.activo && s.dia <= age && (age >= 0 || s.dia < 0));
  const ultimo = passos.at(-1);
  if (!ultimo || feitos.includes(ultimo.id)) return null;
  return ultimo;
}
export function personalizar(texto, campos) {
  return String(texto || '').replace(/\{([\w_]+)\}/g, (match, nome) => Object.hasOwn(campos, nome) ? String(campos[nome] ?? '') : match);
}
export function destinatariosUnicos(rows) {
  const seen = new Set(), validos = [], rejeitados = [];
  for (const row of rows) {
    const phone = telefoneAngola(row.phone);
    if (!phone) { rejeitados.push({ ...row, motivo: 'Telefone inválido' }); continue; }
    if (seen.has(phone)) { rejeitados.push({ ...row, motivo: 'Telefone duplicado' }); continue; }
    seen.add(phone); validos.push({ ...row, phone });
  }
  return { validos, rejeitados };
}
export function elegibilidadePromocao({ consentimento, saida, atrasoMinor, ultimoEnvio }, now = new Date(), intervalo = 7) {
  if (!consentimento || saida) return 'Sem consentimento promocional válido';
  if (Number(atrasoMinor) > 0) return 'Cliente com prestações em atraso';
  if (ultimoEnvio && new Date(now).getTime() - Date.parse(ultimoEnvio) < intervalo * 86400000) return 'Limite de frequência promocional';
  return null;
}
export const pediuSaida = text => /^(SAIR|PARAR|STOP|CANCELAR|REMOVER)$/iu.test(String(text || '').trim());
export function estadoMensagem(actual, novo) {
  const ordem = { queued: 0, sending: 1, accepted: 2, sent: 3, delivered: 4, read: 5 };
  if (novo === 'failed') return ['delivered', 'read'].includes(actual) ? actual : 'failed';
  if (!(novo in ordem)) return actual;
  return (ordem[novo] ?? -1) > (ordem[actual] ?? -1) ? novo : actual;
}
export function payloadMeta({ phone, templateName, language = 'pt_PT', parameters = [], mediaId, mediaType = 'image', filename }) {
  const to = telefoneAngola(phone);
  if (!to || !/^[a-z0-9_]{1,512}$/.test(templateName || '') || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language)) throw new Error('Número ou modelo Meta inválido.');
  const components = [];
  if (mediaId) {
    if (!['image', 'document'].includes(mediaType)) throw new Error('Anexo inválido.');
    components.push({ type: 'header', parameters: [{ type: mediaType, [mediaType]: { id: mediaId, ...(mediaType === 'document' ? { filename: filename || 'documento.pdf' } : {}) } }] });
  }
  if (parameters.length) components.push({ type: 'body', parameters: parameters.map(value => ({ type: 'text', text: String(value) })) });
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template: { name: templateName, language: { code: language }, ...(components.length ? { components } : {}) } };
}
