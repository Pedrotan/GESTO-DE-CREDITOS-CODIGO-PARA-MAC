import { useState } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { latestCollectionEvents } from '@/bibliotecas/cobranca-operacional';
import { hojeLuanda, promessasPendentes } from '@/bibliotecas/hub-cobranca';
import { ServicoCobrancaOperacional } from '@/servicos/ServicoCobrancaOperacional';
import { dinheiroHub } from '@/servicos/AgendadorHubCobranca';
import { Input } from '@/componentes/ui/input';
import { Button } from '@/componentes/ui/button';
import { Campo, Aviso, selectClass, type HubProps } from './comum';
export function EquipaHub({ estado, rows, recarregar }: HubProps) {
  const { user, users } = useAuth(), { payments, credits } = useData();
  const [gestor, setGestor] = useState(''), [credito, setCredito] = useState(''), [meta, setMeta] = useState(''), [mes, setMes] = useState(hojeLuanda().slice(0, 7)), [notas, setNotas] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const assignments = latestCollectionEvents(estado.cobrancas, 'assignment'), targets = latestCollectionEvents(estado.cobrancas, 'target');
  const admin = ['admin', 'super_admin'].includes(user?.role || '');
  const owner = (id: string) => assignments.get(id)?.agentId || credits.find(c => c.id === id)?.usuario_id || credits.find(c => c.id === id)?.requestedBy;
  const save = async (kind: 'target' | 'assignment') => { if (!user) return; setBusy(true); try { await ServicoCobrancaOperacional.record({ kind, creditId: kind === 'assignment' ? credito : undefined, agentId: gestor, agentName: gestor === '__team__' ? 'Equipa' : users.find(u => u.id === gestor)?.name, amount: kind === 'target' ? Number(meta) : undefined, monthKey: mes, notes: notas }, user); await recarregar(); setMessage('Registo guardado.'); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } };
  const received = payments.filter(p => p.status === 'confirmed' && !p.deletedAt && hojeLuanda(p.paymentDate).slice(0, 7) === mes && estado.eventos.some(e => e.creditId === p.creditId && ['confirmed', 'sent', 'delivered', 'read'].includes(e.status) && Date.parse(e.createdAt) <= new Date(p.registeredAt || p.paymentDate).getTime()));
  const pending = promessasPendentes(estado.cobrancas);
  return <div className="space-y-5"><Aviso>A fila pode ser filtrada pelo operador atribuído. O valor recuperado contabiliza pagamentos confirmados depois de um contacto, sem atribuir causalidade ao contacto.</Aviso>
    <div className="overflow-x-auto rounded-2xl border"><table className="w-full text-sm"><thead><tr className="bg-muted/50 text-left"><th className="p-3">Operador</th><th>Clientes na fila</th><th>Recuperado no mês</th><th>Meta do mês</th><th>Promessas cumpridas / falhadas</th><th>Em aberto</th></tr></thead><tbody>{[...users.filter(u => u.status !== 'blocked'), { id: '__team__', name: 'Equipa' }].map(u => {
      const team = u.id === '__team__', ids = new Set(credits.filter(c => team || owner(c.id) === u.id).map(c => c.id));
      const value = received.filter(p => ids.has(p.creditId)).reduce((s, p) => s + Math.round(p.amount * 100), 0);
      const good = estado.cobrancas.filter(e => e.kind === 'promise_kept' && hojeLuanda(e.createdAt).slice(0, 7) === mes && (team || estado.cobrancas.find(p => p.id === e.relatedId)?.actorId === u.id)).length;
      const bad = estado.cobrancas.filter(e => e.kind === 'promise_broken' && hojeLuanda(e.createdAt).slice(0, 7) === mes && (team || estado.cobrancas.find(p => p.id === e.relatedId)?.actorId === u.id)).length;
      const target = targets.get(`${u.id}:${mes}`)?.amountMinor || 0;
      return <tr key={u.id} className="border-t"><td className="p-3 font-semibold">{u.name}</td><td>{rows.filter(r => r.atrasoMinor > 0 && r.creditos.some(c => ids.has(c.id))).length}</td><td>{dinheiroHub(value)}</td><td>{dinheiroHub(target)}{target > 0 && <span className="block text-xs text-muted-foreground">{Math.round(value / target * 100)}%</span>}</td><td>{good} / {bad}{good + bad > 0 && <span className="block text-xs">{Math.round(good / (good + bad) * 100)}% de cumprimento</span>}</td><td>{pending.filter(p => team || p.actorId === u.id).length}</td></tr>;
    })}</tbody></table></div>
    <Campo nome="Mês de análise"><Input type="month" value={mes} onChange={e => setMes(e.target.value)} /></Campo>
    {admin && <section className="rounded-2xl border p-5 space-y-4"><h3 className="font-bold">Distribuir trabalho e definir metas</h3><div className="grid gap-3 sm:grid-cols-2"><Campo nome="Operador"><select className={selectClass} value={gestor} onChange={e => setGestor(e.target.value)}><option value="">Seleccione</option>{users.filter(u => u.status !== 'blocked').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}<option value="__team__">Equipa (meta)</option></select></Campo><Campo nome="Crédito para atribuição"><select className={selectClass} value={credito} onChange={e => setCredito(e.target.value)}><option value="">Seleccione</option>{rows.flatMap(r => r.creditos.map(c => <option key={c.id} value={c.id}>{r.client.name} · {c.id}</option>))}</select></Campo><Campo nome="Meta mensal (Kz)"><Input type="number" min="0" step="0.01" value={meta} onChange={e => setMeta(e.target.value)} /></Campo><Campo nome="Justificação"><Input value={notas} onChange={e => setNotas(e.target.value)} /></Campo></div><div className="flex gap-2"><Button disabled={busy || !gestor || gestor === '__team__' || !credito} onClick={() => save('assignment')}>Atribuir crédito ao operador</Button><Button variant="outline" disabled={busy || !gestor || !meta} onClick={() => save('target')}>Guardar meta</Button></div>{message && <p role="status">{message}</p>}</section>}
  </div>;
}
