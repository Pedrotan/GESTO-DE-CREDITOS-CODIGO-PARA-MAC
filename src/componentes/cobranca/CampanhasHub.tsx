import { useState } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { ServicoHubCobranca, apiCobranca } from '@/servicos/ServicoHubCobranca';
import { publicoCampanha, ofertaCampanha, trabalhosCampanha, publicarSnapshots } from '@/servicos/AgendadorHubCobranca';
import { hojeLuanda, personalizar, telefoneAngola, type CampanhaHub } from '@/bibliotecas/hub-cobranca';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Campo, Aviso, Vazio, Metrica, selectClass, type HubProps } from './comum';
const nova = (): CampanhaHub => ({ id: crypto.randomUUID(), nome: '', inicio: hojeLuanda(), fim: hojeLuanda(), estado: 'rascunho', segmento: 'em_dia', mesesInactivo: 3, provincia: '', balcao: '', limite: 0, taxa: 0, texto: 'Olá, {nome}. Conheça a nossa proposta até {limite_pre_aprovado}, com taxa de {taxa}, válida até {validade}. Condições sujeitas a análise e ao limite disponível no cadastro.', modeloMeta: '', idioma: 'pt_PT', parcelas: {}, criadaEm: new Date().toISOString() });
export function CampanhasHub(hub: HubProps) {
  const { user } = useAuth(), { credits, payments } = useData();
  const [c, setC] = useState<CampanhaHub | null>(null), [previewId, setPreviewId] = useState(''), [numeroTeste, setNumeroTeste] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [conversionId, setConversionId] = useState('');
  const admin = ['admin', 'super_admin'].includes(user?.role || '');
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setMessage(''); try { await fn(); await hub.recarregar(); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } };
  const publico = c ? publicoCampanha(c, hub.rows, hub.estado.perfis, credits, payments, hub.estado.eventos, hub.estado.politica.intervaloPromocoesDias) : { elegiveis: [], excluidos: [] };
  const row = publico.elegiveis.find(r => r.client.id === previewId) || publico.elegiveis[0];
  const fields = c && row ? ofertaCampanha(c, row) : null;
  const meta = c ? hub.modelos.find(m => m.name === c.modeloMeta && m.language === c.idioma) : null;
  const actualTemplate = meta?.components?.find((x: any) => x.type === 'BODY')?.text;
  const shown = c && fields ? actualTemplate ? actualTemplate.replace(/\{\{(\d+)\}\}/g, (_: string, n: string) => Object.values(fields)[+n - 1] || '') : `${personalizar(c.texto, fields)}\nPara deixar de receber promoções, responda SAIR.` : '';
  const save = async (estado = c?.estado) => {
    if (!c || !user) return;
    const next = { ...c, estado: estado! };
    await ServicoHubCobranca.campanha(next, user); setC(next); setMessage('Campanha guardada.');
  };
  const agendar = async () => {
    if (!c || !hub.cloud?.enabled || !meta) throw new Error('Ligue o canal oficial e seleccione um modelo aprovado antes de agendar.');
    if (!/SAIR/i.test(actualTemplate || '')) throw new Error('O modelo aprovado deve informar o cliente de que pode responder SAIR.');
    if (!publico.elegiveis.length) throw new Error('O público não tem destinatários elegíveis.');
    if (c.imagem && !c.mediaId) throw new Error('Importe o anexo guardado na Meta antes de agendar.');
    if (c.fim < hojeLuanda()) throw new Error('A validade da campanha já terminou.');
    await publicarSnapshots(hub.rows, hub.estado.perfis, hub.estado.cobrancas, payments, hub.estado.eventos);
    const jobs = trabalhosCampanha(c, publico.elegiveis, hub.estado.politica);
    for (let offset = 0; offset < jobs.length; offset += 500) await apiCobranca('agendar', { jobs: jobs.slice(offset, offset + 500) });
    await save('agendada'); await hub.actualizarCloud(); setMessage(`${jobs.length} mensagens preparadas na fila faseada.`);
  };
  const test = async () => {
    if (!c || !fields || !hub.cloud?.enabled) throw new Error('Configure o canal e um público para preparar o teste.');
    const phone = telefoneAngola(numeroTeste); if (!phone) throw new Error('Indique o seu número angolano válido.');
    const id = `test:${phone}`;
    await apiCobranca('snapshot', { clients: [{ id, phone, items: [], atrasoMinor: 0, consentimento: false }] });
    await apiCobranca('agendar', { jobs: [{ ...trabalhosCampanha(c, [row], hub.estado.politica)[0], id: `test:${crypto.randomUUID()}`, clientId: id, phone, purpose: 'test', scheduledAt: new Date().toISOString() }] });
    setMessage('Teste agendado para o seu número, respeitando os horários de contacto.');
  };
  const attach = async (file?: File) => {
    if (!c || !file) return;
    if (!['image/png', 'image/jpeg', 'application/pdf'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('Use PNG, JPEG ou PDF com até 2 MB.');
    const data = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
    let mediaId: string | undefined;
    if (hub.cloud?.connected) mediaId = (await apiCobranca('anexo', { mime: file.type, filename: file.name, base64: data.split(',')[1] })).mediaId;
    setC({ ...c, imagem: data, anexoNome: file.name, mediaId });
  };
  const campaignStats = (id: string) => {
    const ev = hub.estado.eventos.filter(e => { try { return JSON.parse(e.metadata).campaignId === id; } catch { return false; } });
    const set = (states: string[]) => new Set(ev.filter(e => states.includes(e.status)).map(e => JSON.parse(e.metadata).jobId || e.id)).size;
    return { sent: set(['sent', 'delivered', 'read']), delivered: set(['delivered', 'read']), read: set(['read']), replies: new Set(ev.filter(e => e.kind === 'reply').map(e => e.clientId)).size, converted: new Set(ev.filter(e => e.kind === 'conversion').map(e => e.creditId)).size, exits: new Set(ev.filter(e => e.status === 'opt_out').map(e => e.clientId)).size };
  };
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Campanhas de promoção</h2><p className="text-sm text-muted-foreground">Públicos com aceite, mensagens personalizadas e resultados confirmados.</p></div>{admin && <Button onClick={() => { setC(nova()); setMessage(''); }}>Criar campanha</Button>}</div>
    <Aviso>As promoções excluem clientes em atraso, sem aceite ou que pediram para sair. Números repetidos recebem uma única mensagem. O limite da oferta nunca ultrapassa o crédito disponível no cadastro.</Aviso>
    {!hub.estado.campanhas.length && <Vazio>Ainda não existem campanhas. Pode preparar o conteúdo e o público antes de ligar a Meta.</Vazio>}
    {hub.estado.campanhas.map(campaign => { const s = campaignStats(campaign.id); return <section key={campaign.id} className="rounded-2xl border bg-card p-5 space-y-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-bold">{campaign.nome}</h3><p className="text-sm text-muted-foreground">{campaign.inicio} a {campaign.fim} · {campaign.estado}</p></div><Button variant="outline" onClick={() => { setC(campaign); setMessage(''); }}>Abrir campanha</Button></div><div className="grid grid-cols-2 gap-2 lg:grid-cols-6">{[['Enviadas', s.sent], ['Entregues', s.delivered], ['Lidas', s.read], ['Respostas', s.replies], ['Pedidos de crédito', s.converted], ['Saídas', s.exits]].map(([label, n]) => <Metrica key={label} titulo={String(label)} valor={n} />)}</div></section>; })}
    {c && <Dialog open onOpenChange={open => { if (!open) setC(null); }}><DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>{c.nome || 'Nova campanha'}</DialogTitle><DialogDescription>Prepare o público, confirme as mensagens e agende o envio oficial.</DialogDescription></DialogHeader><div className="grid gap-6 lg:grid-cols-2"><fieldset disabled={busy || !admin} className="space-y-4">
      <Campo nome="Nome"><Input value={c.nome} onChange={e => setC({ ...c, nome: e.target.value })} /></Campo><div className="grid grid-cols-2 gap-3"><Campo nome="Início"><Input type="date" value={c.inicio} onChange={e => setC({ ...c, inicio: e.target.value })} /></Campo><Campo nome="Fim / validade"><Input type="date" value={c.fim} onChange={e => setC({ ...c, fim: e.target.value })} /></Campo></div>
      <Campo nome="Segmento"><select className={selectClass} value={c.segmento} onChange={e => setC({ ...c, segmento: e.target.value })}>{[['todos', 'Todos com aceite'], ['bons_pagadores', 'Bons pagadores (histórico ≥ 80)'], ['renovacao', 'Crédito liquidado nos últimos 90 dias'], ['em_dia', 'Prestações em dia'], ['inactivos', 'Clientes inactivos'], ['aniversariantes', 'Aniversariantes do mês'], ['provincia', 'Por província'], ['balcao', 'Por balcão']].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Campo>
      {c.segmento === 'inactivos' && <Campo nome="Meses sem actividade"><Input type="number" min="1" value={c.mesesInactivo} onChange={e => setC({ ...c, mesesInactivo: +e.target.value })} /></Campo>}
      <div className="grid grid-cols-2 gap-3"><Campo nome="Província (opcional)"><Input value={c.provincia} onChange={e => setC({ ...c, provincia: e.target.value })} /></Campo><Campo nome="Balcão (opcional)"><Input value={c.balcao} onChange={e => setC({ ...c, balcao: e.target.value })} /></Campo></div>
      <div className="grid grid-cols-2 gap-3"><Campo nome="Limite da oferta (Kz)"><Input type="number" min="0" value={c.limite} onChange={e => setC({ ...c, limite: +e.target.value })} /></Campo><Campo nome="Taxa promocional (%)"><Input type="number" min="0" step="0.01" value={c.taxa} onChange={e => setC({ ...c, taxa: +e.target.value })} /></Campo></div>
      <Campo nome="Mensagem do rascunho"><Textarea rows={5} value={c.texto} onChange={e => setC({ ...c, texto: e.target.value })} /></Campo><p className="text-xs text-muted-foreground">{'{nome}, {limite_pre_aprovado}, {taxa}, {validade}'}. As condições estão sujeitas à análise de crédito.</p>
      <Campo nome="Modelo aprovado (MARKETING)"><select className={selectClass} value={`${c.modeloMeta}|${c.idioma}`} onChange={e => { const [modeloMeta, idioma] = e.target.value.split('|'); setC({ ...c, modeloMeta, idioma }); }}><option value="|pt_PT">Configurar depois de ligar a Meta</option>{hub.modelos.filter(m => m.category === 'MARKETING').map(m => <option key={m.id} value={`${m.name}|${m.language}`}>{m.name} · {m.language}</option>)}</select></Campo><p className="text-xs text-muted-foreground">O corpo aprovado usa 4 parâmetros: nome, limite, taxa e validade; deve incluir a instrução de responder SAIR.</p>
      <Campo nome="Imagem / panfleto ou PDF"><Input type="file" accept="image/png,image/jpeg,application/pdf" onChange={e => run(() => attach(e.target.files?.[0]))} /></Campo>{c.anexoNome && <p className="text-sm">{c.anexoNome} · {c.mediaId ? 'Importado na Meta' : 'Guardado no rascunho; importe na Meta antes de enviar'}</p>}
      {c.imagem && !c.mediaId && <Button variant="outline" disabled={!hub.cloud?.connected || busy} onClick={() => run(async () => { const mime = c.imagem!.slice(5, c.imagem!.indexOf(';')); const result = await apiCobranca('anexo', { mime, filename: c.anexoNome, base64: c.imagem!.split(',')[1] }); setC({ ...c, mediaId: result.mediaId }); })}>Importar anexo guardado na Meta</Button>}
      <Campo nome="Primeiro envio (hora de Angola)"><Input type="datetime-local" value={c.proximoEnvio?.replace('+01:00', '') || ''} onChange={e => setC({ ...c, proximoEnvio: e.target.value ? `${e.target.value}+01:00` : undefined })} /></Campo>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => run(() => save())}>Guardar rascunho</Button><Button disabled={!hub.cloud?.enabled} onClick={() => run(agendar)}>Agendar público elegível</Button><Button variant="outline" disabled={c.estado !== 'agendada'} onClick={() => run(async () => { await apiCobranca('pausarCampanha', { campaignId: c.id }); await save('pausada'); })}>Pausar</Button></div>
    </fieldset><section className="space-y-4"><div className="grid grid-cols-2 gap-3"><Metrica titulo="Destinatários elegíveis" valor={publico.elegiveis.length} /><Metrica titulo="Excluídos pelas regras" valor={publico.excluidos.length} /></div><Campo nome="Pré-visualizar por cliente"><select className={selectClass} value={row?.client.id || ''} onChange={e => setPreviewId(e.target.value)}>{publico.elegiveis.map(r => <option key={r.client.id} value={r.client.id}>{r.client.name} · {r.phone}</option>)}</select></Campo>
      {row && <div className="grid grid-cols-2 gap-3"><Campo nome="Oferta deste cliente (Kz)"><Input disabled={!admin} type="number" value={c.parcelas[row.client.id]?.limite ?? c.limite} onChange={e => setC({ ...c, parcelas: { ...c.parcelas, [row.client.id]: { limite: +e.target.value, taxa: c.parcelas[row.client.id]?.taxa ?? c.taxa } } })} /></Campo><Campo nome="Taxa deste cliente (%)"><Input disabled={!admin} type="number" value={c.parcelas[row.client.id]?.taxa ?? c.taxa} onChange={e => setC({ ...c, parcelas: { ...c.parcelas, [row.client.id]: { limite: c.parcelas[row.client.id]?.limite ?? c.limite, taxa: +e.target.value } } })} /></Campo></div>}
      <div className="rounded-2xl border bg-emerald-50 p-5 text-sm text-slate-900 whitespace-pre-wrap dark:bg-emerald-950 dark:text-slate-100">{shown || 'Seleccione um público com consentimento para pré-visualizar.'}{c.imagem?.startsWith('data:image') && <img className="mt-4 max-h-64 rounded-lg" src={c.imagem} alt="Panfleto da campanha" />}</div>
      <Campo nome="O seu número para o teste"><Input value={numeroTeste} onChange={e => setNumeroTeste(e.target.value)} placeholder="+244 9XX XXX XXX" /></Campo><Button variant="outline" disabled={busy || !hub.cloud?.enabled || !row} onClick={() => run(test)}>Agendar teste para o meu número</Button>
      <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-semibold">Ver exclusões</summary><div className="max-h-60 overflow-y-auto text-xs space-y-2 mt-3">{publico.excluidos.map((x, i) => <p key={i}>{x.row.client?.name} · {x.motivo}</p>)}</div></details>
      <section className="rounded-xl border p-4 space-y-3"><h4 className="font-semibold">Atribuir pedido de crédito à campanha</h4><p className="text-xs text-muted-foreground">Seleccione um pedido real do cliente. Cada pedido conta uma única vez.</p><select className={selectClass} value={conversionId} onChange={e => setConversionId(e.target.value)}><option value="">Seleccione o pedido</option>{credits.filter(cr => !cr.deletedAt && cr.status === 'pending_approval' && hojeLuanda(cr.createdAt) >= c.inicio).map(cr => <option key={cr.id} value={cr.id}>{cr.clientName} · {cr.id}</option>)}</select><Button variant="outline" disabled={!admin || !conversionId || busy} onClick={() => run(async () => { const cr = credits.find(x => x.id === conversionId)!; await ServicoHubCobranca.evento({ id: `campaign-conversion:${conversionId}`, clientId: cr.clientId, creditId: conversionId, kind: 'conversion', message: `Pedido de crédito atribuído à campanha ${c.nome}`, metadata: { campaignId: c.id } }, user!); setMessage('Conversão registada.'); })}>Registar conversão</Button></section>
    </section></div>{message && <p role="status" className="text-sm">{message}</p>}</DialogContent></Dialog>}
  </div>;
}
