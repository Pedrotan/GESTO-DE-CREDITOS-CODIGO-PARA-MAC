import { useEffect, useState } from 'react';
import { Search, Send } from 'lucide-react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { latestCollectionEvents } from '@/bibliotecas/cobranca-operacional';
import { telefoneAngola, destinatariosUnicos } from '@/bibliotecas/hub-cobranca';
import { apiCobranca } from '@/servicos/ServicoHubCobranca';
import { dinheiroHub, publicarSnapshots, trabalhoCobranca, anexarNota } from '@/servicos/AgendadorHubCobranca';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Checkbox } from '@/componentes/ui/checkbox';
import { selectClass, Vazio, type HubProps } from './comum';
export function ListaCobranca({ preventiva, abrirFicha, ...hub }: HubProps & { preventiva: boolean; abrirFicha: (id: string) => void }) {
  const { user, users } = useAuth(), { companySettings, payments } = useData();
  const [search, setSearch] = useState(''), [gestor, setGestor] = useState(''), [faixa, setFaixa] = useState(''), [selected, setSelected] = useState<Set<string>>(new Set()), [page, setPage] = useState(1), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { setPage(1); setSelected(new Set()); }, [preventiva, search, gestor, faixa]);
  const assignments = latestCollectionEvents(hub.estado.cobrancas, 'assignment');
  const agentOf = (id: string) => assignments.get(id)?.agentId || hub.rows.flatMap(r => r.creditos).find(c => c.id === id)?.usuario_id;
  const list = hub.rows.filter(r => preventiva ? r.proximas.length > 0 : r.atrasoMinor > 0).filter(r => {
    const q = search.toLowerCase().trim();
    if (q && ![r.client.name, r.client.nif, r.client.phone, ...r.creditos.map(c => c.id)].some(v => String(v || '').toLowerCase().includes(q))) return false;
    if (gestor && !r.creditos.some(c => agentOf(c.id) === gestor)) return false;
    if (faixa && !preventiva) { const [min, max] = faixa.split(':').map(Number); if (r.diasAtraso < min || r.diasAtraso > max) return false; }
    return true;
  }).sort((a, b) => preventiva ? a.proximas[0].vencimento.localeCompare(b.proximas[0].vencimento) : b.diasAtraso - a.diasAtraso);
  const pages = Math.max(1, Math.ceil(list.length / 20)), current = Math.min(page, pages), visible = list.slice((current - 1) * 20, current * 20);
  const send = async () => {
    setBusy(true); try {
      await publicarSnapshots(hub.rows, hub.estado.perfis, hub.estado.cobrancas, payments, hub.estado.eventos);
      const items = list.filter(r => selected.has(r.client.id)).map(r => ({ row: r, phone: r.client.phone }));
      const unique = destinatariosUnicos(items);
      const jobs = [];
      for (const { row } of unique.validos) {
        const j = trabalhoCobranca(row, preventiva ? row.proximas[0] : row.vencidas[0], hub.estado.politica, companySettings);
        if (j?.templateName) jobs.push(await anexarNota(j, row, companySettings, user!.name, hub.modelos));
      }
      if (!jobs.length) throw new Error('Associe um modelo aprovado ao passo da régua e confirme os números seleccionados.');
      let queued = 0;
      for (let offset = 0; offset < jobs.length; offset += 500) queued += (await apiCobranca('agendar', { jobs: jobs.slice(offset, offset + 500) })).queued;
      setMessage(`${queued} mensagens na fila; ${items.length - jobs.length} excluídas por telefone duplicado/inválido ou modelo em falta.`); setSelected(new Set()); await hub.actualizarCloud();
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="space-y-4"><div className="flex flex-wrap items-end gap-3"><div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Nome, NIF, telefone ou contrato" value={search} onChange={e => setSearch(e.target.value)} aria-label="Pesquisar cliente" /></div><select aria-label="Filtrar operador" className={`${selectClass} sm:w-48`} value={gestor} onChange={e => setGestor(e.target.value)}><option value="">Todos os operadores</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>{!preventiva && <select aria-label="Antiguidade da dívida" className={`${selectClass} sm:w-40`} value={faixa} onChange={e => setFaixa(e.target.value)}><option value="">Todas as faixas</option><option value="1:30">1–30 dias</option><option value="31:60">31–60 dias</option><option value="61:90">61–90 dias</option><option value="91:99999">Mais de 90 dias</option></select>}<Button disabled={busy || !selected.size || !hub.cloud?.enabled} onClick={send}><Send className="mr-2 h-4 w-4" />Enviar seleccionados ({selected.size})</Button></div>
    {!hub.cloud?.enabled && <p className="text-xs text-muted-foreground">O envio em lote estará disponível ao activar o canal oficial. Na ficha do cliente pode preparar um contacto manual.</p>}{message && <p role="status" className="rounded-xl border p-3 text-sm">{message}</p>}
    {list.length ? <><div className="overflow-x-auto rounded-2xl border bg-card"><table className="w-full text-sm"><thead><tr className="bg-muted/50 text-left"><th className="p-3"><Checkbox aria-label="Seleccionar clientes desta página" checked={visible.length > 0 && visible.every(r => selected.has(r.client.id))} onCheckedChange={checked => setSelected(s => { const next = new Set(s); for (const r of visible) if (checked) next.add(r.client.id); else next.delete(r.client.id); return next; })} /></th><th className="p-3">Cliente</th><th className="p-3">{preventiva ? 'A vencer' : 'Valor vencido'}</th><th className="p-3">{preventiva ? 'Vencimento' : 'Antiguidade'}</th><th className="p-3">Último contacto</th><th className="p-3">Responsável</th><th className="p-3">Ficha</th></tr></thead><tbody>{visible.map(r => {
      const last = hub.estado.eventos.find(e => e.clientId === r.client.id && ['call', 'message', 'reply'].includes(e.kind));
      const owner = users.find(u => u.id === agentOf(r.creditos[0]?.id));
      return <tr key={r.client.id} className="border-t"><td className="p-3"><Checkbox aria-label={`Seleccionar ${r.client.name}`} checked={selected.has(r.client.id)} onCheckedChange={checked => setSelected(s => { const next = new Set(s); if (checked) next.add(r.client.id); else next.delete(r.client.id); return next; })} /></td><td className="p-3"><button className="text-left font-bold hover:underline" onClick={() => abrirFicha(r.client.id)}>{r.client.name}</button><p className="text-xs text-muted-foreground">{r.client.phone || 'Sem telefone'}{!telefoneAngola(r.client.phone) && ' · número inválido'}</p></td><td className="p-3 whitespace-nowrap font-semibold tabular-nums">{dinheiroHub(preventiva ? r.aVencerMinor : r.atrasoMinor)}</td><td className="p-3 whitespace-nowrap">{preventiva ? r.proximas[0].vencimento.split('-').reverse().join('/') : `${r.diasAtraso} dias`}</td><td className="p-3 text-xs">{last ? `${new Date(last.createdAt).toLocaleString('pt-AO')} · ${last.actorName}` : 'Sem contacto'}</td><td className="p-3">{owner?.name || 'Não atribuído'}</td><td className="p-3"><Button variant="outline" size="sm" onClick={() => abrirFicha(r.client.id)}>Abrir ficha</Button></td></tr>;
    })}</tbody></table></div><div className="flex items-center justify-between text-sm"><span>{list.length} clientes · página {current} de {pages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={current <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button><Button size="sm" variant="outline" disabled={current >= pages} onClick={() => setPage(p => p + 1)}>Seguinte</Button></div></div></> : <Vazio>{preventiva ? 'Não existem prestações a vencer no período seleccionado.' : 'Sem prestações vencidas neste filtro. Consulte os próximos vencimentos e as campanhas.'}</Vazio>}
  </div>;
}
