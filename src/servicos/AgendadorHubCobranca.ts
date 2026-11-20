import { ServicoHubCobranca, apiCobranca } from './ServicoHubCobranca';
import { clientesDoHub, hojeLuanda, telefoneAngola, passoDaRegua, personalizar, promessasPendentes, elegibilidadePromocao, segmentoCampanha, destinatariosUnicos, type CampanhaHub, type ClienteHub, type PerfilCobranca, type PoliticaCobranca, type PrestacaoHub } from '@/bibliotecas/hub-cobranca';
import type { Client, Credit, Payment } from '@/tipos/credito';
import { companyBankAccount, generateDebtCollectionNoticePDF } from '@/bibliotecas/pdf';
import { ServicoControloAcesso } from './ServicoControloAcesso';

export const dinheiroHub = (minor: number) => (minor / 100).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Kz';
export function pagamentoHub(company: any) {
  const bank = companyBankAccount(company);
  return bank?.iban ? `IBAN: ${bank.iban} · Titular: ${bank.holder || company.name}.` : 'Contacte a empresa para obter os dados de pagamento.';
}
export function camposCobranca(row: ClienteHub, item: PrestacaoHub, company: any) {
  return { nome: row.client.name, nome_cliente: row.client.name, valor: dinheiroHub(item.valorMinor), vencimento: item.vencimento.split('-').reverse().join('/'), data_vencimento: item.vencimento, dias_atraso: Math.max(0, item.diasAtraso), pagamento: `${pagamentoHub(company)} Referência do contrato: ${item.creditId}.`, empresa: company.name || 'Empresa' };
}
export async function publicarSnapshots(rows: ClienteHub[], perfis: PerfilCobranca[], collections: any[], payments: Payment[] = [], events: any[] = []) {
  const pending = promessasPendentes(collections);
  for (let offset = 0; offset < rows.length; offset += 200) await apiCobranca('snapshot', { clients: rows.slice(offset, offset + 200).map(row => {
    const perfil = perfis.find(p => p.clientId === row.client.id);
    const manualContactsToday = events.filter(e => e.clientId === row.client.id && e.status === 'confirmed' && ['call', 'message'].includes(e.kind) && e.channel !== 'whatsapp_api' && hojeLuanda(e.createdAt) === hojeLuanda()).length;
    return { id: row.client.id, phone: row.client.phone, atrasoMinor: row.atrasoMinor, manualContactsToday, consentimento: perfil?.consentimento === true, aceiteEm: perfil?.aceiteEm, promessa: pending.filter(p => row.creditos.some(c => c.id === p.creditId)).map(p => ({ id: p.id, creditId: p.creditId, dia: p.promisedDate, amountMinor: Math.max(0, (p.amountMinor || 0) - payments.filter(x => x.creditId === p.creditId && x.status === 'confirmed' && !x.deletedAt && new Date(x.registeredAt || x.paymentDate).getTime() >= Date.parse(p.createdAt) && hojeLuanda(x.paymentDate) <= String(p.promisedDate)).reduce((sum, x) => sum + Math.round(x.amount * 100), 0)) })), failedPromises: collections.filter(p => p.kind === 'promise_broken' && row.creditos.some(c => c.id === p.creditId)).map(p => p.id), items: [...row.vencidas, ...row.proximas].map(i => ({ id: i.id, valorMinor: i.valorMinor, vencimento: i.vencimento })) };
  }) });
}
export async function anexarNota(job: any, row: ClienteHub, company: any, actorName: string, templates: any[]) {
  const template = templates.find(t => t.name === job.templateName && t.language === job.language);
  if (template?.components?.some((c: any) => c.type === 'HEADER' && c.format === 'DOCUMENT')) {
    const uri = generateDebtCollectionNoticePDF(row.client, row.creditos.filter(c => c.id === job.creditId), company, actorName, 'datauristring') as string;
    if (!uri?.includes(',')) throw new Error('Não foi possível preparar o PDF da cobrança.');
    const result = await apiCobranca('anexo', { filename: 'nota-cobranca.pdf', mime: 'application/pdf', base64: uri.split(',')[1] });
    return { ...job, mediaId: result.mediaId, mediaType: 'document', filename: 'nota-cobranca.pdf' };
  }
  return job;
}
export function trabalhoCobranca(row: ClienteHub, item: PrestacaoHub, policy: PoliticaCobranca, company: any, stepId?: string) {
  const step = policy.passos.find(s => s.id === stepId) || passoDaRegua(item, policy);
  if (!step || step.accao === 'juridico') return null;
  const campos = camposCobranca(row, item, company);
  return { id: `collection:${item.id}:${step.id}`, clientId: row.client.id, phone: telefoneAngola(row.client.phone), creditId: item.creditId, itemId: item.id, stepId: step.id, preventiva: item.diasAtraso <= 0, purpose: 'collection', templateName: step.modeloMeta || '', language: 'pt_PT', parameters: [campos.nome, campos.valor, campos.vencimento, campos.pagamento], preview: personalizar(step.texto, campos), scheduledAt: new Date().toISOString() };
}
export function publicoCampanha(c: CampanhaHub, rows: ClienteHub[], perfis: PerfilCobranca[], credits: Credit[], payments: Payment[], eventos: any[], intervalo = 7) {
  const elegiveis: any[] = [], excluidos: any[] = [];
  for (const row of rows) {
    const p = perfis.find(x => x.clientId === row.client.id);
    if (!segmentoCampanha(row, p, c, credits, payments)) continue;
    const ultimoEnvio = eventos.filter(e => e.clientId === row.client.id && ['accepted', 'sent', 'delivered', 'read', 'confirmed', 'unknown'].includes(e.status) && JSON.parse(e.metadata || '{}').campaignId).map(e => e.createdAt).sort().at(-1);
    const reason = elegibilidadePromocao({ consentimento: p?.consentimento, saida: p?.saidaEm, atrasoMinor: row.atrasoMinor, ultimoEnvio }, new Date(), intervalo);
    if (reason) excluidos.push({ row, motivo: reason }); else elegiveis.push({ ...row, phone: row.client.phone });
  }
  const unique = destinatariosUnicos(elegiveis);
  return { elegiveis: unique.validos as (ClienteHub & { phone: string })[], excluidos: [...excluidos, ...unique.rejeitados.map(r => ({ row: r, motivo: r.motivo }))] };
}
export function ofertaCampanha(c: CampanhaHub, row: ClienteHub) {
  const custom = c.parcelas[row.client.id];
  // A promoção não aumenta automaticamente o limite de crédito já aprovado no cadastro.
  const limite = Math.max(0, Math.min(custom?.limite ?? c.limite, row.client.availableCredit || 0));
  return { nome: row.client.name, limite_pre_aprovado: dinheiroHub(Math.round(limite * 100)), taxa: `${custom?.taxa ?? c.taxa}%`, validade: c.fim.split('-').reverse().join('/') };
}
export function trabalhosCampanha(c: CampanhaHub, publico: ClienteHub[], politica: PoliticaCobranca) {
  const base = Math.max(Date.now(), Date.parse(c.proximoEnvio || `${c.inicio}T08:00:00+01:00`));
  return publico.map((row, index) => {
    const fields = ofertaCampanha(c, row);
    return { id: `campaign:${c.id}:${row.client.id}`, campaignId: c.id, clientId: row.client.id, phone: row.client.phone, purpose: 'marketing', expiresAt: c.fim, templateName: c.modeloMeta, language: c.idioma || 'pt_PT', parameters: [fields.nome, fields.limite_pre_aprovado, fields.taxa, fields.validade], mediaId: c.mediaId, mediaType: c.anexoNome?.toLowerCase().endsWith('.pdf') ? 'document' : 'image', filename: c.anexoNome, preview: `${personalizar(c.texto, fields)}\nPara deixar de receber promoções, responda SAIR.`, scheduledAt: new Date(base + index * politica.intervaloEnvioSegundos * 1000).toISOString() };
  });
}
let running = false;
export async function cicloHub(dados: { clients: Client[]; credits: Credit[]; payments: Payment[]; companySettings: any; refreshData?: () => Promise<void> }, actor: any) {
  if (running || !actor || !ServicoControloAcesso.temPermissao(actor, 'manage_payments')) return;
  running = true;
  try {
    const state = await ServicoHubCobranca.carregar();
    await ServicoHubCobranca.reconciliarPromessas(state.cobrancas, dados.payments, actor);
    const rows = clientesDoHub(dados.clients, dados.credits, state.prestacoes, 60);
    if (state.politica.juridicoAutomatico) {
      const pending = promessasPendentes(state.cobrancas);
      for (const row of rows) {
        const item = row.vencidas[0]; if (!item || pending.some(p => p.creditId === item.creditId && String(p.promisedDate) >= hojeLuanda())) continue;
        let passo = passoDaRegua(item, state.politica);
        if (state.cobrancas.some(p => p.kind === 'promise_broken' && p.creditId === item.creditId)) passo = state.politica.passos.find(p => p.activo && p.dia > (passo?.dia ?? 0)) || passo;
        if (passo?.accao === 'juridico' && await ServicoHubCobranca.encaminharAutomatico({ clientId: row.client.id, creditId: item.creditId, itemId: item.id, passo: passo.id, valorMinor: row.vencidas.filter(i => i.creditId === item.creditId).reduce((sum, i) => sum + i.valorMinor, 0) }, actor)) await dados.refreshData?.();
      }
    }
    const cloud = await ServicoHubCobranca.receberNuvem(actor);
    if (!cloud.connected || !cloud.enabled) return;
    await publicarSnapshots(rows, state.perfis, state.cobrancas, dados.payments, state.eventos);
    if (state.politica.automatico) {
      const jobs: any[] = [], promises = promessasPendentes(state.cobrancas);
      for (const row of rows) {
        const item = row.vencidas[0] || row.proximas[0]; if (!item || !telefoneAngola(row.client.phone)) continue;
        const promessa = promises.find(p => p.creditId === item.creditId);
        if (promessa && String(promessa.promisedDate) > hojeLuanda()) continue;
        let job = trabalhoCobranca(row, item, state.politica, dados.companySettings);
        if (promessa && promessa.promisedDate === hojeLuanda()) {
          const modelo = state.politica.passos.find(p => p.activo && p.accao === 'lembrete' && p.modeloMeta);
          if (modelo) job = { ...trabalhoCobranca(row, item, state.politica, dados.companySettings, modelo.id)!, id: `promise:${promessa.id}`, purpose: 'promise', promiseId: promessa.id } as any;
        }
        // Uma promessa falhada avança para o próximo passo comercial da régua.
        const broken = state.cobrancas.filter(p => p.kind === 'promise_broken' && p.creditId === item.creditId).at(-1);
        if (broken && !promessa) {
          const current = passoDaRegua(item, state.politica);
          const next = state.politica.passos.find(p => p.activo && p.dia > (current?.dia ?? 0) && p.accao !== 'juridico');
          if (next) job = { ...trabalhoCobranca(row, item, state.politica, dados.companySettings, next.id)!, id: `promise-next:${broken.id}:${next.id}`, escalatedPromiseId: broken.id } as any;
        }
        if (job?.templateName) jobs.push(job);
      }
      const conhecidos = new Set((cloud.jobs || []).map((j: any) => j.id));
      const novos = jobs.filter(j => !conhecidos.has(j.id)).slice(0, 100);
      if (novos.length) {
        const templates = (await apiCobranca('modelos')).templates;
        const preparados = [];
        for (const j of novos) preparados.push(await anexarNota(j, rows.find(r => r.client.id === j.clientId)!, dados.companySettings, actor.name, templates));
        await apiCobranca('agendar', { jobs: preparados });
      }
    }
    for (const c of state.campanhas.filter(c => c.estado === 'agendada' && c.fim >= hojeLuanda())) {
      const publico = publicoCampanha(c, rows, state.perfis, dados.credits, dados.payments, state.eventos, state.politica.intervaloPromocoesDias);
      const jobs = trabalhosCampanha(c, publico.elegiveis, state.politica);
      for (let offset = 0; offset < jobs.length; offset += 500) await apiCobranca('agendar', { jobs: jobs.slice(offset, offset + 500) });
    }
  } finally { running = false; }
}
