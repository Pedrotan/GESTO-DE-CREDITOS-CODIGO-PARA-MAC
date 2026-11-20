import type { Client, Credit, Payment } from '@/tipos/credito';
import type { InstallmentRow } from '@/bibliotecas/carteira-credito';
import { customerPaymentScore, type CollectionEvent } from './cobranca-operacional';
export { POLITICA_COBRANCA_PADRAO, validarPolitica, telefoneAngola, hojeLuanda, horarioPermitido, personalizar, destinatariosUnicos, elegibilidadePromocao, passoDaRegua } from '../../vercel-api/_cobranca-regras.js';
import { hojeLuanda, diasEntre, diaValido } from '../../vercel-api/_cobranca-regras.js';

export type PassoCobranca = { id: string; dia: number; accao: string; tom: string; texto: string; activo: boolean; modeloMeta?: string };
export type PoliticaCobranca = { automatico: boolean; juridicoAutomatico: boolean; inicioHora: number; fimHora: number; limiteDiario: number; intervaloPromocoesDias: number; diasPreventivos: number; intervaloEnvioSegundos: number; feriadosAdicionais: string[]; passos: PassoCobranca[] };
export type PerfilCobranca = { clientId: string; provincia: string; balcao: string; consentimento: boolean; aceiteEm?: string; aceitePor?: string; evidencia?: string; saidaEm?: string; updatedAt?: string };
export type EventoHub = { id: string; clientId: string; creditId?: string; kind: string; channel: string; status: string; message: string; metadata: string; actorId: string; actorName: string; createdAt: string };
export type CampanhaHub = { id: string; nome: string; inicio: string; fim: string; estado: 'rascunho' | 'agendada' | 'pausada' | 'concluida'; segmento: string; mesesInactivo: number; provincia: string; balcao: string; texto: string; limite: number; taxa: number; modeloMeta: string; idioma: string; imagem?: string; mediaId?: string; anexoNome?: string; parcelas: Record<string, { limite: number; taxa: number }>; proximoEnvio?: string; criadaEm: string };
export type PrestacaoHub = { id: string; creditId: string; clientId: string; vencimento: string; valorMinor: number; diasAtraso: number; numero: number; hoje: string };
export type ClienteHub = { client: Client; creditos: Credit[]; vencidas: PrestacaoHub[]; proximas: PrestacaoHub[]; atrasoMinor: number; aVencerMinor: number; diasAtraso: number; score: ReturnType<typeof customerPaymentScore> };
const n = (v: unknown) => Number(v) || 0;
export const valorAberto = (i: InstallmentRow) => Math.max(0, n(i.principalMinor) + n(i.interestMinor) + n(i.lateInterestMinor) - n(i.paidPrincipalMinor) - n(i.paidInterestMinor) - n(i.paidLateInterestMinor));
export function clientesDoHub(clients: Client[], credits: Credit[], installments: InstallmentRow[], dias = 7, hoje = hojeLuanda()): ClienteHub[] {
  return clients.filter(c => !c.deletedAt).map(client => {
    const creditos = credits.filter(c => c.clientId === client.id && !c.deletedAt && ['active', 'overdue', 'defaulted', 'renegotiated'].includes(c.status));
    const ids = new Set(creditos.map(c => c.id));
    const schedule = installments.filter(i => ids.has(i.creditId) && i.status !== 'cancelled');
    const items: PrestacaoHub[] = schedule.filter(i => valorAberto(i) > 0 && diaValido(String(i.dueDate).slice(0, 10))).map(i => ({ id: i.id, creditId: i.creditId, clientId: client.id, vencimento: String(i.dueDate).slice(0, 10), valorMinor: valorAberto(i), diasAtraso: diasEntre(String(i.dueDate).slice(0, 10), hoje), numero: i.installmentNumber, hoje }));
    // Contratos antigos sem plano: manter a dívida visível, mas nunca inventar uma prestação futura.
    for (const c of creditos) if (!installments.some(i => i.creditId === c.id)) {
      const vencimento = hojeLuanda(c.dueDate), valor = c.totalDueMinor ?? Math.round(c.totalDue * 100);
      if (diaValido(vencimento) && valor > 0) items.push({ id: `credito:${c.id}`, creditId: c.id, clientId: client.id, vencimento, valorMinor: valor, diasAtraso: diasEntre(vencimento, hoje), numero: 1, hoje });
    }
    const vencidas = items.filter(i => i.diasAtraso > 0).sort((a, b) => b.diasAtraso - a.diasAtraso);
    const proximas = items.filter(i => i.diasAtraso <= 0 && i.diasAtraso >= -dias).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    return { client, creditos, vencidas, proximas, atrasoMinor: vencidas.reduce((s, i) => s + i.valorMinor, 0), aVencerMinor: proximas.reduce((s, i) => s + i.valorMinor, 0), diasAtraso: Math.max(0, ...vencidas.map(i => i.diasAtraso)), score: customerPaymentScore(installments.filter(i => credits.some(c => c.id === i.creditId && c.clientId === client.id && !c.deletedAt) && i.status !== 'cancelled'), hoje) };
  });
}
export function faixasDivida(rows: ClienteHub[]) {
  return [[1, 30], [31, 60], [61, 90], [91, Infinity]].map(([min, max]) => {
    const list = rows.filter(r => r.diasAtraso >= min && r.diasAtraso <= max);
    return { label: min === 91 ? 'Mais de 90 dias' : `${min}–${max} dias`, clientes: list.length, valorMinor: list.reduce((s, r) => s + r.atrasoMinor, 0) };
  });
}
export function pontualidadeHub(installments: InstallmentRow[], events: EventoHub[], credits: Credit[], hoje = hojeLuanda()) {
  const ids = new Set(credits.filter(c => !c.deletedAt && !['cancelled', 'rejected', 'pending_approval'].includes(c.status)).map(c => c.id));
  const observadas = installments.filter(i => ids.has(i.creditId) && i.status !== 'cancelled' && diaValido(String(i.dueDate).slice(0, 10)) && String(i.dueDate).slice(0, 10) <= hoje);
  const taxa = (items: InstallmentRow[]) => items.length ? Math.round(items.filter(i => valorAberto(i) === 0 && i.paidAt && hojeLuanda(i.paidAt) <= String(i.dueDate).slice(0, 10)).length / items.length * 100) : null;
  const primeiro = events.filter(e => ['confirmed', 'sent', 'delivered', 'read'].includes(e.status) && (() => { try { return JSON.parse(e.metadata || '{}').preventiva === true; } catch { return false; } })()).map(e => hojeLuanda(e.createdAt)).sort()[0];
  const atrasadas = observadas.filter(i => valorAberto(i) > 0 && String(i.dueDate).slice(0, 10) < hoje);
  return { taxa: taxa(observadas), antes: primeiro ? taxa(observadas.filter(i => i.dueDate.slice(0, 10) < primeiro)) : null, depois: primeiro ? taxa(observadas.filter(i => i.dueDate.slice(0, 10) >= primeiro)) : null, diasMedios: atrasadas.length ? Math.round(atrasadas.reduce((sum, i) => sum + diasEntre(i.dueDate.slice(0, 10), hoje), 0) / atrasadas.length) : 0 };
}
export function segmentoCampanha(row: ClienteHub, perfil: PerfilCobranca | undefined, c: CampanhaHub, credits: Credit[], payments: Payment[], hoje = hojeLuanda()) {
  if (c.provincia && perfil?.provincia.toLowerCase() !== c.provincia.toLowerCase()) return false;
  if (c.balcao && perfil?.balcao.toLowerCase() !== c.balcao.toLowerCase()) return false;
  const todos = credits.filter(x => x.clientId === row.client.id && !x.deletedAt);
  const pag = payments.filter(p => p.status === 'confirmed' && !p.deletedAt && todos.some(x => x.id === p.creditId));
  switch (c.segmento) {
    case 'bons_pagadores': return row.score.score !== null && row.score.score >= 80 && row.score.unpaid === 0;
    case 'renovacao': return todos.some(x => x.status === 'paid' && x.paidAt && diasEntre(hojeLuanda(x.paidAt), hoje) >= 0 && diasEntre(hojeLuanda(x.paidAt), hoje) <= 90);
    case 'em_dia': return row.creditos.length > 0 && row.atrasoMinor === 0;
    case 'inactivos': { const ultimo = [...pag.map(p => hojeLuanda(p.paymentDate)), ...todos.map(x => hojeLuanda(x.createdAt)), hojeLuanda(row.client.createdAt)].sort().at(-1)!; return row.creditos.length === 0 && diasEntre(ultimo, hoje) >= c.mesesInactivo * 30; }
    case 'aniversariantes': return String(row.client.birthDate || '').slice(5, 7) === hoje.slice(5, 7);
    case 'provincia': return Boolean(c.provincia);
    case 'balcao': return Boolean(c.balcao);
    default: return true;
  }
}
export function promessasPendentes(events: CollectionEvent[]) { return events.filter(e => e.kind === 'promise' && !events.some(d => d.relatedId === e.id && ['promise_kept', 'promise_broken'].includes(d.kind))); }
export function apurarPromessas(events: CollectionEvent[], payments: Payment[], hoje = hojeLuanda()) {
  return promessasPendentes(events).flatMap(p => {
    const recebidos = payments.filter(x => x.creditId === p.creditId && x.status === 'confirmed' && !x.deletedAt && new Date(x.registeredAt || x.paymentDate).getTime() >= Date.parse(p.createdAt) && hojeLuanda(x.paymentDate) <= String(p.promisedDate)).reduce((s, x) => s + Math.round(x.amount * 100), 0);
    const cumprida = recebidos >= n(p.amountMinor);
    return cumprida || String(p.promisedDate) < hoje ? [{ promessa: p, cumprida, recebidos }] : [];
  });
}
export function indicadoresHub(rows: ClienteHub[], eventos: EventoHub[], promises: CollectionEvent[], payments: Payment[], hoje = hojeLuanda()) {
  const reais = eventos.filter(e => ['sent', 'delivered', 'read', 'confirmed'].includes(e.status));
  const contactos = reais.filter(e => e.creditId && ['message', 'call'].includes(e.kind));
  const elegiveis = new Set(contactos.filter(e => hojeLuanda(e.createdAt).slice(0, 7) === hoje.slice(0, 7)).map(e => e.creditId));
  const recuperados = payments.filter(p => p.status === 'confirmed' && !p.deletedAt && hojeLuanda(p.paymentDate).slice(0, 7) === hoje.slice(0, 7) && contactos.some(c => c.creditId === p.creditId && Date.parse(c.createdAt) <= new Date(p.registeredAt || p.paymentDate).getTime()));
  const comPagamento = new Set(recuperados.map(p => p.creditId));
  return { recuperadoMinor: recuperados.reduce((s, p) => s + Math.round(p.amount * 100), 0), taxa: elegiveis.size ? Math.round([...elegiveis].filter(id => comPagamento.has(id)).length / elegiveis.size * 100) : null, mensagensHoje: new Set(reais.filter(e => e.kind === 'message' && ['sent', 'confirmed'].includes(e.status) && hojeLuanda(e.createdAt) === hoje).map(e => JSON.parse(e.metadata || '{}').jobId || e.id)).size, cumpridas: promises.filter(e => e.kind === 'promise_kept' && hojeLuanda(e.createdAt).slice(0, 7) === hoje.slice(0, 7)).length, falhadas: promises.filter(e => e.kind === 'promise_broken' && hojeLuanda(e.createdAt).slice(0, 7) === hoje.slice(0, 7)).length, faixas: faixasDivida(rows) };
}
