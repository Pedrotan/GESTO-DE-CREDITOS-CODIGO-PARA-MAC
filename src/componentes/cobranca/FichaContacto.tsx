import { useMemo, useState } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { ServicoHubCobranca, apiCobranca } from '@/servicos/ServicoHubCobranca';
import { ServicoCobrancaOperacional } from '@/servicos/ServicoCobrancaOperacional';
import { publicarSnapshots, trabalhoCobranca, dinheiroHub, camposCobranca, anexarNota } from '@/servicos/AgendadorHubCobranca';
import { hojeLuanda, horarioPermitido, telefoneAngola, personalizar, promessasPendentes, type ClienteHub } from '@/bibliotecas/hub-cobranca';
import { angolaHolidays } from '@/bibliotecas/feriados-angola';
import { simulateEarlySettlement, restructurePlan } from '@/bibliotecas/liquidacao-antecipada';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import { generateDebtCollectionNoticePDF } from '@/bibliotecas/pdf';
import { openWhatsApp } from '@/bibliotecas/whatsapp';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { Campo, Aviso, selectClass, type HubProps } from './comum';
import { PreferenciasCliente } from './PreferenciasCliente';
const labels: Record<string, string> = { call: 'Chamada', reply: 'Resposta recebida', message: 'Mensagem', promise: 'Promessa', promise_kept: 'Promessa cumprida', promise_broken: 'Promessa falhada', assignment: 'Atribuição', consent: 'Preferências', payment: 'Pagamento', contact: 'Contacto', negotiation: 'Proposta', agreement: 'Acordo', conversion: 'Pedido de crédito' };
const states: Record<string, string> = { queued: 'Na fila', prepared: 'Preparada; envio por confirmar', confirmed: 'Confirmado pelo operador', accepted: 'Aceite pela Meta', sent: 'Enviada', delivered: 'Entregue', read: 'Lida', received: 'Recebida', failed: 'Falhou', unknown: 'Estado incerto; confirmar na Meta', cancelled: 'Cancelada', opt_out: 'Saída das promoções', opt_in: 'Aceite promocional' };
export function FichaContacto({ row, onFechar, ...hub }: HubProps & { row: ClienteHub; onFechar: () => void }) {
  const { user } = useAuth(), { payments, credits: allCredits, companySettings, addLegalCase, legalCases } = useData();
  const [creditId, setCreditId] = useState(row.creditos[0]?.id || ''), [tipo, setTipo] = useState('call'), [notas, setNotas] = useState(''), [valor, setValor] = useState(''), [data, setData] = useState(hojeLuanda()), [resultado, setResultado] = useState('Atendido'), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [proposal, setProposal] = useState(''), [meses, setMeses] = useState(6), [taxa, setTaxa] = useState(0);
  const item = row.vencidas.find(i => i.creditId === creditId) || row.proximas.find(i => i.creditId === creditId);
  const step = item ? hub.estado.politica.passos.filter(p => p.activo && p.dia <= item.diasAtraso && p.accao !== 'juridico').at(-1) : undefined;
  const texto = item ? personalizar(step?.texto || 'Olá, {nome}. A sua prestação é de {valor}, com vencimento em {vencimento}. {pagamento}', camposCobranca(row, item, companySettings)) : '';
  const [personalizado, setPersonalizado] = useState('');
  const actor = user!;
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setMessage(''); try { await fn(); await hub.recarregar(); setMessage('Registo guardado.'); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } };
  const credit = row.creditos.find(c => c.id === creditId);
  const pending = promessasPendentes(hub.estado.cobrancas).find(p => p.creditId === creditId);
  const idsCliente = new Set(allCredits.filter(c => c.clientId === row.client.id).map(c => c.id));
  const promessasCliente = new Set(hub.estado.cobrancas.filter(p => p.kind === 'promise' && idsCliente.has(p.creditId || '')).map(p => p.id));
  const cumpridasCliente = hub.estado.cobrancas.filter(p => p.kind === 'promise_kept' && promessasCliente.has(p.relatedId || '')).length;
  const falhadasCliente = hub.estado.cobrancas.filter(p => p.kind === 'promise_broken' && promessasCliente.has(p.relatedId || '')).length;
  const timeline = useMemo(() => {
    const ids = new Set(allCredits.filter(c => c.clientId === row.client.id).map(c => c.id));
    return [
      ...hub.estado.eventos.filter(e => e.clientId === row.client.id).map(e => ({ id: e.id, when: e.createdAt, kind: e.kind, text: `${e.message} · ${states[e.status] || e.status}`, actor: e.actorName })),
      ...hub.estado.cobrancas.filter(e => ids.has(e.creditId || '')).map(e => ({ id: e.id, when: e.createdAt, kind: e.kind, text: `${e.notes}${e.amountMinor ? ` · ${dinheiroHub(e.amountMinor)}` : ''}${e.promisedDate ? ` · ${e.promisedDate}` : ''}`, actor: e.actorName })),
      ...payments.filter(p => ids.has(p.creditId) && p.status === 'confirmed' && !p.deletedAt).map(p => ({ id: p.id, when: new Date(p.registeredAt || p.paymentDate).toISOString(), kind: 'payment', text: `${dinheiroHub(Math.round(p.amount * 100))} · ${p.reference || p.id}`, actor: p.processedBy })),
      ...hub.estado.historicoAntigo.filter(e => e.clientId === row.client.id).map(e => ({ id: e.id, when: e.sentAt, kind: 'contact', text: `${e.message} · Registo antigo; entrega não verificada`, actor: e.sentBy })),
    ].sort((a, b) => b.when.localeCompare(a.when));
  }, [hub.estado, payments, row, allCredits]);
  const canContact = () => {
    const blocked = horarioPermitido(new Date(), hub.estado.politica, [...angolaHolidays(Number(hojeLuanda().slice(0, 4))).keys()]);
    if (blocked) throw new Error(blocked);
    const today = hub.estado.eventos.filter(e => e.clientId === row.client.id && hojeLuanda(e.createdAt) === hojeLuanda() && ['confirmed', 'accepted', 'sent'].includes(e.status) && ['call', 'message'].includes(e.kind));
    const n = new Set(today.map(e => JSON.parse(e.metadata || '{}').jobId || e.id)).size;
    if (n >= hub.estado.politica.limiteDiario) throw new Error('Este cliente já atingiu o limite de contactos de hoje.');
  };
  const registar = async () => {
    if (!user || !creditId || notas.trim().length < 5) throw new Error('Seleccione um crédito e descreva o contacto.');
    if (tipo === 'promise') {
      if (pending) throw new Error('Este crédito já tem uma promessa em aberto.');
      if (data < hojeLuanda()) throw new Error('A data da promessa não pode ser anterior a hoje.');
      await ServicoCobrancaOperacional.record({ kind: 'promise', creditId, amount: Number(valor), promisedDate: data, notes: notas }, actor);
    } else {
      if (tipo === 'call') canContact();
      await ServicoHubCobranca.evento({ clientId: row.client.id, creditId, kind: tipo, channel: tipo === 'call' ? 'telefone' : 'manual', message: `${tipo === 'call' ? `${resultado}: ` : ''}${notas}`, metadata: { resultado } }, actor);
    }
    setNotas('');
  };
  const preparar = async (channel: 'whatsapp' | 'email' | 'sms') => {
    canContact();
    if (!item || !texto) throw new Error('Já não existem prestações por cobrar neste crédito.');
    const msg = personalizado || proposal || texto;
    if (channel === 'whatsapp') { if (!telefoneAngola(row.client.phone)) throw new Error('Telefone angolano inválido.'); openWhatsApp(row.client.phone, msg); }
    if (channel === 'sms') { if (!telefoneAngola(row.client.phone)) throw new Error('Telefone angolano inválido.'); window.location.href = `sms:+${telefoneAngola(row.client.phone)}?body=${encodeURIComponent(msg)}`; }
    if (channel === 'email') { if (!row.client.email) throw new Error('Cliente sem e-mail.'); window.location.href = `mailto:${encodeURIComponent(row.client.email)}?subject=${encodeURIComponent('Contacto da ' + companySettings.name)}&body=${encodeURIComponent(msg)}`; }
    await ServicoHubCobranca.evento({ clientId: row.client.id, creditId, kind: 'message', channel, status: 'prepared', message: msg }, actor);
  };
  const enviarAPI = async () => {
    if (!item || !hub.cloud?.enabled) throw new Error('Configure e active primeiro o canal oficial.');
    await publicarSnapshots(hub.rows, hub.estado.perfis, hub.estado.cobrancas, payments, hub.estado.eventos);
    const job = trabalhoCobranca(row, item, hub.estado.politica, companySettings);
    if (!job?.templateName) throw new Error('Associe um modelo aprovado ao passo da régua.');
    const result = await apiCobranca('agendar', { jobs: [await anexarNota(job, row, companySettings, actor.name, hub.modelos)] });
    setMessage(`${result.queued} mensagem agendada. A entrega será confirmada pela Meta.`);
    await hub.actualizarCloud();
  };
  const simular = (kind: string) => {
    if (!credit) return;
    const installments = hub.estado.prestacoes.filter(i => i.creditId === creditId);
    if (kind === 'total') {
      const sim = simulateEarlySettlement({ kind: 'total', method: credit.amortizationMethod || 'FLAT', annualRatePercent: credit.interestRate, startDate: credit.startDate, installments, moraMinor: credit.lateInterestMinor ?? Math.round(credit.lateInterest * 100) });
      setProposal(`${row.client.name}, simulação de liquidação antecipada do contrato ${credit.id} em ${hojeLuanda()}: ${dinheiroHub(sim.payNowMinor)}. Juros futuros poupados: ${dinheiroHub(sim.interestSavedMinor)}. Sujeita à confirmação da empresa; esta proposta não altera o contrato.`);
    } else {
      const capital = installments.filter(i => i.status !== 'cancelled').reduce((s, i) => s + Math.max(0, i.principalMinor - i.paidPrincipalMinor), 0);
      const plan = restructurePlan({ outstandingCapitalMinor: capital, installments: meses, annualRatePercent: taxa, method: credit.amortizationMethod || 'FLAT', firstDueDate: data });
      setProposal(`${row.client.name}, proposta de renegociação do contrato ${credit.id}: capital ${dinheiroHub(capital)}, ${meses} prestações, taxa ${taxa}%, primeira prestação ${dinheiroHub(plan[0].totalMinor)} em ${data}. Encargos vencidos e mora serão tratados na aprovação. Simulação sujeita a análise e aprovação; o plano actual mantém-se.`);
    }
  };
  const juridico = async () => {
    if (!credit || !ServicoControloAcesso.temPermissao(actor, 'manage_legal')) throw new Error('É necessária permissão de contencioso.');
    if (row.atrasoMinor <= 0 || notas.trim().length < 10) throw new Error('Indique a justificação e confirme que existe dívida vencida.');
    if (legalCases.some(c => c.creditId === creditId && c.stage !== 'closed' && !c.deletedAt)) throw new Error('Já existe um processo aberto para este crédito.');
    await addLegalCase({ clientId: row.client.id, creditId, stage: 'interpellated', priority: row.diasAtraso > 90 ? 'critical' : 'high', debtAmount: row.vencidas.filter(i => i.creditId === creditId).reduce((s, i) => s + i.valorMinor, 0) / 100, lastAction: notas, notes: notas, updatedAt: new Date().toISOString(), usuario_id: actor.id }, actor);
    await ServicoHubCobranca.evento({ clientId: row.client.id, creditId, kind: 'agreement', channel: 'contencioso', message: `Encaminhamento ao contencioso: ${notas}` }, actor);
  };
  return <Dialog open onOpenChange={open => { if (!open) onFechar(); }}><DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{row.client.name} · Ficha de contacto</DialogTitle><DialogDescription>Contactos, pagamentos, promessas e acordos numa única linha do tempo.</DialogDescription></DialogHeader>
    <div className="grid gap-5 lg:grid-cols-2"><div className="space-y-4"><Campo nome="Contrato"><select className={selectClass} value={creditId} onChange={e => { setCreditId(e.target.value); setProposal(''); setPersonalizado(''); }}><option value="">Sem crédito activo</option>{row.creditos.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}</select></Campo>
      <p className="text-sm">Vencido: <strong>{dinheiroHub(row.atrasoMinor)}</strong> · Próximos vencimentos: {dinheiroHub(row.aVencerMinor)}</p>
      <p className="text-xs text-muted-foreground">Promessas deste cliente: {cumpridasCliente} cumpridas, {falhadasCliente} falhadas{cumpridasCliente + falhadasCliente > 0 ? ` · ${Math.round(cumpridasCliente / (cumpridasCliente + falhadasCliente) * 100)}% de cumprimento` : ''}.</p>
      {pending && <Aviso>Promessa em aberto: {dinheiroHub(pending.amountMinor || 0)} em {pending.promisedDate}. Evite contactos repetidos antes desse dia.</Aviso>}
      <Campo nome="Mensagem"><Textarea rows={6} value={personalizado || proposal || texto} onChange={e => setPersonalizado(e.target.value)} /></Campo>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !item} onClick={() => run(() => preparar('whatsapp'))}>Preparar WhatsApp</Button><Button variant="outline" disabled={busy || !item} onClick={() => run(() => preparar('sms'))}>SMS</Button><Button variant="outline" disabled={busy || !item} onClick={() => run(() => preparar('email'))}>E-mail</Button><Button variant="outline" disabled={busy || !row.vencidas.length} onClick={() => generateDebtCollectionNoticePDF(row.client, row.creditos.filter(c => row.vencidas.some(i => i.creditId === c.id)), companySettings, user?.name)}>Nota PDF</Button><Button disabled={busy || !hub.cloud?.enabled || !item} onClick={() => run(enviarAPI)}>Agendar pela API oficial</Button></div>
      <p className="text-xs text-muted-foreground">A mensagem refere-se à prestação mais antiga por pagar do contrato seleccionado. Abrir WhatsApp, SMS ou e-mail prepara a mensagem; confirme apenas depois de a enviar. A API usa o texto do modelo aprovado, com os valores actuais.</p>
      <Button variant="outline" disabled={busy || !item} onClick={() => run(async () => { canContact(); await ServicoHubCobranca.evento({ clientId: row.client.id, creditId, kind: 'message', status: 'confirmed', message: personalizado || proposal || texto, channel: 'manual', metadata: { preventiva: Boolean(item && item.diasAtraso <= 0) } }, actor); })}>Confirmar envio manual realizado</Button>
      <div className="rounded-xl border p-4 space-y-3"><h3 className="font-bold">Registar contacto ou promessa</h3><Campo nome="Tipo"><select className={selectClass} value={tipo} onChange={e => setTipo(e.target.value)}><option value="call">Chamada</option><option value="reply">Resposta recebida</option><option value="promise">Promessa de pagamento</option><option value="agreement">Acordo / negociação</option></select></Campo>{tipo === 'call' && <Campo nome="Resultado"><select className={selectClass} value={resultado} onChange={e => setResultado(e.target.value)}>{['Atendido', 'Sem resposta', 'Número indisponível', 'Pagamento já realizado', 'Retornar mais tarde'].map(r => <option key={r}>{r}</option>)}</select></Campo>}
      {tipo === 'promise' && <div className="grid grid-cols-2 gap-3"><Campo nome="Valor prometido (Kz)"><Input type="number" min="0.01" step="0.01" value={valor} onChange={e => setValor(e.target.value)} /></Campo><Campo nome="Data prometida"><Input type="date" min={hojeLuanda()} value={data} onChange={e => setData(e.target.value)} /></Campo></div>}
      <Campo nome="Descrição / justificação"><Textarea value={notas} onChange={e => setNotas(e.target.value)} /></Campo><div className="flex flex-wrap gap-2"><Button disabled={busy || !creditId} onClick={() => run(registar)}>Guardar registo</Button><Button variant="outline" disabled={busy || !creditId || row.atrasoMinor <= 0} onClick={() => run(juridico)}>Encaminhar ao contencioso</Button></div></div>
      <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Simular proposta para o cliente</summary><div className="mt-4 space-y-3"><div className="grid grid-cols-3 gap-2"><Campo nome="Meses"><Input type="number" min="1" max="120" value={meses} onChange={e => setMeses(+e.target.value)} /></Campo><Campo nome="Taxa (%)"><Input type="number" min="0" value={taxa} onChange={e => setTaxa(+e.target.value)} /></Campo><Campo nome="1.º vencimento"><Input type="date" value={data} onChange={e => setData(e.target.value)} /></Campo></div><div className="flex gap-2"><Button variant="outline" onClick={() => { try { simular('total'); } catch (e) { setMessage((e as Error).message); } }}>Liquidação antecipada</Button><Button variant="outline" onClick={() => { try { simular('plano'); } catch (e) { setMessage((e as Error).message); } }}>Renegociação</Button></div>{proposal && <p className="text-sm whitespace-pre-wrap">{proposal}</p>}</div></details>
      {ServicoControloAcesso.temPermissao(actor, 'manage_clients') && <PreferenciasCliente clientId={row.client.id} onGuardar={() => void hub.recarregar()} />}
      {message && <p role="status" className="text-sm">{message}</p>}
    </div><section className="space-y-3"><h3 className="font-bold">Linha do tempo</h3>{timeline.length ? timeline.map(e => <div key={e.id} className="border-l-2 border-primary/30 pl-4 py-2"><p className="text-xs font-semibold text-muted-foreground">{new Date(e.when).toLocaleString('pt-AO')} · {labels[e.kind] || e.kind}</p><p className="mt-1 whitespace-pre-wrap text-sm">{e.text}</p><p className="mt-1 text-xs text-muted-foreground">{e.actor}</p></div>) : <p className="text-sm text-muted-foreground">Ainda não existem contactos registados.</p>}</section></div>
  </DialogContent></Dialog>;
}
