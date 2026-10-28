import { db } from '@/bibliotecas/bd';
import { lerSegredo, SEGREDO_CODIGO_EMPRESA } from '@/bibliotecas/cofre-segredos';
import { getScopedLocalStorageItem, setScopedLocalStorageItem } from '@/bibliotecas/contas';
import { ServicoAuditoria } from '@/servicos/ServicoAuditoria';
import { POLITICA_COBRANCA_PADRAO, validarPolitica, hojeLuanda, apurarPromessas, type CampanhaHub, type EventoHub, type PerfilCobranca, type PoliticaCobranca } from '@/bibliotecas/hub-cobranca';
import { ServicoCobrancaOperacional } from './ServicoCobrancaOperacional';
import type { CollectionEvent } from '@/bibliotecas/cobranca-operacional';
import type { Payment } from '@/tipos/credito';
import type { User } from '@/tipos/autenticacao';
import { ServicoControloAcesso } from './ServicoControloAcesso';

type Actor = Pick<User, 'id' | 'name' | 'role'> & Partial<Pick<User, 'permissions'>>;
const parse = <T>(s: string, fallback: T): T => { try { return JSON.parse(s) as T; } catch { return fallback; } };
const admin = (actor: Actor) => { if (!['admin', 'super_admin'].includes(actor.role)) throw new Error('Só administradores podem alterar esta configuração.'); };
export const perfilVazio = (clientId: string): PerfilCobranca => ({ clientId, provincia: '', balcao: '', consentimento: false });
export function baseHubApi() {
  if (location.protocol.startsWith('http')) return location.origin;
  const url = getScopedLocalStorageItem('sync_url') || 'https://tangogestaoecreditos.tech';
  return new URL(url).origin;
}
export async function apiCobranca(accao: string, dados: Record<string, unknown> = {}, codigo?: string) {
  const tenant = localStorage.getItem('tango_active_tenant_id');
  if (!tenant) throw new Error('Ligue a empresa à nuvem em Definições › Sincronização.');
  const segredo = codigo || lerSegredo(SEGREDO_CODIGO_EMPRESA);
  const response = await fetch(`${baseHubApi()}/api/cobranca`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenant, ...(segredo ? { 'x-sync-passkey': segredo } : {}) }, body: JSON.stringify({ accao, ...dados }), signal: AbortSignal.timeout(45000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) throw new Error(body?.message || `Serviço de cobrança indisponível (${response.status}).`);
  return body;
}
export class ServicoHubCobranca {
  static async encaminharAutomatico(input: { clientId: string; creditId: string; itemId: string; passo: string; valorMinor: number }, actor: Actor) {
    if (!ServicoControloAcesso.temPermissao(actor, 'manage_legal')) return false;
    if (input.valorMinor <= 0) return false;
    if (await db.get("SELECT id FROM legal_cases WHERE creditId = ? AND stage <> 'closed' AND deletedAt IS NULL", [input.creditId])) return false;
    const id = `hub-legal:${input.itemId}:${input.passo}`, now = new Date().toISOString();
    await db.transaction([
      { sql: "INSERT OR IGNORE INTO legal_cases (id, clientId, creditId, stage, priority, debtAmount, lastAction, notes, updatedAt, usuario_id) VALUES (?, ?, ?, 'interpellated', 'high', ?, ?, ?, ?, ?)", params: [id, input.clientId, input.creditId, input.valorMinor / 100, 'Passo jurídico da régua de cobrança', `Encaminhamento interno automático pela régua (${input.passo}), activado pela administração.`, now, actor.id] },
      { sql: "INSERT OR IGNORE INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'create', 'legal', ?, ?)", params: [`audit:${id}`, now, actor.id, actor.name, 'Régua de cobrança: processo interno de contencioso criado', JSON.stringify({ legalCaseId: id, creditId: input.creditId, rule: input.passo })] },
    ]);
    return true;
  }
  static async carregar() {
    const [setting, profiles, campaigns, events, installments, collections, legacy] = await Promise.all([
      db.get<{ data: string }>('SELECT data FROM hub_collection_settings WHERE id = ?', ['default']),
      db.all<{ data: string }>('SELECT data FROM hub_collection_clients'),
      db.all<{ data: string }>('SELECT data FROM hub_collection_campaigns ORDER BY updatedAt DESC'),
      db.all<EventoHub>('SELECT * FROM hub_collection_events ORDER BY createdAt DESC'),
      db.all<any>('SELECT * FROM credit_installments'),
      ServicoCobrancaOperacional.list(),
      db.all<any>('SELECT * FROM collection_messages ORDER BY sentAt DESC').catch(() => []),
    ]);
    return { politica: validarPolitica(parse(setting?.data || '{}', {})) as PoliticaCobranca, perfis: profiles.map(p => parse(p.data, perfilVazio(''))), campanhas: campaigns.map(p => parse<CampanhaHub>(p.data, {} as CampanhaHub)), eventos: events, prestacoes: installments, cobrancas: collections, historicoAntigo: legacy };
  }
  static async politica(politica: PoliticaCobranca, actor: Actor) {
    admin(actor); const valida = validarPolitica(politica);
    await db.run('INSERT INTO hub_collection_settings (id, data, updatedAt, updatedBy) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy', ['default', JSON.stringify(valida), new Date().toISOString(), actor.id]);
    await ServicoAuditoria.addLog('update', 'system', 'Alterou a régua e os horários de cobrança', actor.id, actor.name);
  }
  static async perfil(perfil: PerfilCobranca, actor: Actor) {
    const anterior = await db.get<{ data: string }>('SELECT data FROM hub_collection_clients WHERE clientId = ?', [perfil.clientId]);
    const old = parse<PerfilCobranca>(anterior?.data || '{}', perfilVazio(perfil.clientId));
    if (perfil.consentimento && !old.consentimento && (!perfil.evidencia || perfil.evidencia.trim().length < 10)) throw new Error('Registe como e quando o cliente aceitou receber promoções (mínimo 10 caracteres).');
    const now = new Date().toISOString();
    const value = { ...perfil, updatedAt: now, ...(perfil.consentimento && !old.consentimento ? { aceiteEm: now, aceitePor: actor.name, saidaEm: undefined } : !perfil.consentimento ? { saidaEm: now } : {}) };
    await db.run('INSERT INTO hub_collection_clients (clientId, data, updatedAt, updatedBy) VALUES (?, ?, ?, ?) ON CONFLICT(clientId) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy', [perfil.clientId, JSON.stringify(value), now, actor.id]);
    await this.evento({ clientId: perfil.clientId, kind: 'consent', channel: 'cadastro', status: perfil.consentimento ? 'opt_in' : 'opt_out', message: perfil.consentimento ? `Consentimento: ${perfil.evidencia}` : 'Cliente excluído das promoções', metadata: { aceiteEm: value.aceiteEm, provincia: value.provincia, balcao: value.balcao } }, actor);
    // Uma revogação tem prioridade: se houver ligação, cancelar imediatamente na fila central.
    if (!perfil.consentimento && localStorage.getItem('tango_active_tenant_id')) await apiCobranca('optOut', { clientId: perfil.clientId }).catch(() => undefined);
    return value;
  }
  static async campanha(c: CampanhaHub, actor: Actor) {
    admin(actor);
    if (!c.nome.trim() || !c.texto.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(c.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(c.fim) || c.inicio > c.fim || !Number.isFinite(c.limite) || c.limite < 0 || !Number.isFinite(c.taxa) || c.taxa < 0) throw new Error('Preencha nome, mensagem, datas e condições válidas.');
    await db.run('INSERT INTO hub_collection_campaigns (id, data, updatedAt, updatedBy) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy', [c.id, JSON.stringify(c), new Date().toISOString(), actor.id]);
    await ServicoAuditoria.addLog('update', 'system', `Campanha «${c.nome}»: ${c.estado}`, actor.id, actor.name);
  }
  static async evento(input: { id?: string; clientId: string; creditId?: string; kind: string; channel?: string; status?: string; message: string; metadata?: Record<string, unknown>; createdAt?: string }, actor: Actor) {
    if (input.id) {
      const existente = await db.get<EventoHub>('SELECT * FROM hub_collection_events WHERE id = ?', [input.id]);
      if (existente) return existente;
    }
    const evento: EventoHub = { id: input.id || crypto.randomUUID(), clientId: input.clientId, creditId: input.creditId, kind: input.kind, channel: input.channel || 'manual', status: input.status || 'confirmed', message: input.message, metadata: JSON.stringify(input.metadata || {}), actorId: actor.id, actorName: actor.name, createdAt: input.createdAt || new Date().toISOString() };
    await db.run('INSERT OR IGNORE INTO hub_collection_events (id, clientId, creditId, kind, channel, status, message, metadata, actorId, actorName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [evento.id, evento.clientId, evento.creditId || null, evento.kind, evento.channel, evento.status, evento.message, evento.metadata, evento.actorId, evento.actorName, evento.createdAt]);
    return evento;
  }
  static async reconciliarPromessas(events: CollectionEvent[], payments: Payment[], actor: Actor) {
    for (const item of apurarPromessas(events, payments, hojeLuanda())) {
      await ServicoCobrancaOperacional.record({ kind: item.cumprida ? 'promise_kept' : 'promise_broken', creditId: item.promessa.creditId!, relatedId: item.promessa.id, notes: item.cumprida ? 'Promessa cumprida: pagamento confirmado no prazo.' : 'Promessa vencida sem pagamento confirmado suficiente.' }, actor).catch(error => { if (!/UNIQUE|constraint/i.test(error.message)) throw error; });
    }
  }
  static async receberNuvem(actor: Actor) {
    const result = await apiCobranca('estado', { after: Number(getScopedLocalStorageItem('hub_cloud_cursor')) || 0 });
    for (const e of result.events || []) await this.evento({ id: `cloud:${e.id}`, clientId: e.client_id, creditId: e.credit_id, kind: e.kind, channel: 'whatsapp_api', status: e.status, message: e.message, metadata: e.metadata || {}, createdAt: e.created_at }, actor);
    // O SAIR recebido na Meta fica também registado no cadastro local, antes de preparar novos públicos.
    for (const opt of result.optOuts || []) {
      const row = await db.get<{ data: string }>('SELECT data FROM hub_collection_clients WHERE clientId = ?', [opt.client_id]);
      const perfil = parse<PerfilCobranca>(row?.data || '{}', perfilVazio(opt.client_id));
      if (perfil.consentimento && (!perfil.aceiteEm || Date.parse(perfil.aceiteEm) <= Date.parse(opt.updated_at))) await this.perfil({ ...perfil, consentimento: false, saidaEm: opt.updated_at }, actor);
    }
    setScopedLocalStorageItem('hub_cloud_cursor', String(result.cursor || 0));
    return result;
  }
}
