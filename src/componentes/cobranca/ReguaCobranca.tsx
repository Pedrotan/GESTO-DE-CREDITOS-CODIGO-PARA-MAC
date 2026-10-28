import { useEffect, useState } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { ServicoHubCobranca, apiCobranca } from '@/servicos/ServicoHubCobranca';
import type { HubProps } from './comum';
import { Aviso, Campo, selectClass } from './comum';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
export function ReguaCobranca({ estado, recarregar, cloud, modelos }: HubProps) {
  const { user } = useAuth(), [p, setP] = useState(estado.politica), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => setP(estado.politica), [estado.politica]);
  const admin = ['admin', 'super_admin'].includes(user?.role || '');
  const save = async () => { if (!user) return; setBusy(true); try { await ServicoHubCobranca.politica(p, user); if (cloud?.connected) await apiCobranca('politica', { politica: p }); await recarregar(); setMessage('Régua guardada.'); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } };
  return <div className="space-y-5"><Aviso>Os contactos respeitam a hora de Angola, os fins de semana, os feriados e o limite por cliente. O passo «Contencioso» aparece para revisão; a administração pode activar abaixo a criação de processos internos pela régua.</Aviso>
    <fieldset disabled={!admin || busy} className="space-y-5">
      <div className="grid gap-4 rounded-2xl border p-4 sm:grid-cols-3">{([['inicioHora', 'Início (hora)', 0, 23], ['fimHora', 'Fim (hora)', 1, 24], ['limiteDiario', 'Contactos por cliente/dia', 1, 5], ['diasPreventivos', 'Antecedência da lista (dias)', 1, 60], ['intervaloPromocoesDias', 'Dias entre promoções', 7, 365], ['intervaloEnvioSegundos', 'Intervalo entre envios (segundos)', 30, 3600]] as const).map(([key, label, min, max]) => <Campo key={key} nome={label}><Input type="number" min={min} max={max} value={p[key]} onChange={e => setP({ ...p, [key]: Number(e.target.value) })} /></Campo>)}</div>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={p.automatico} onChange={e => setP({ ...p, automatico: e.target.checked })} />Preparar e agendar lembretes automaticamente quando o canal oficial estiver activo.</label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={p.juridicoAutomatico} onChange={e => setP({ ...p, juridicoAutomatico: e.target.checked })} />Criar processo interno de contencioso ao atingir o passo jurídico, quando executado por um utilizador com permissão de contencioso.</label>
      <Campo nome="Datas adicionais sem contactos (AAAA-MM-DD, separadas por vírgula)"><Input value={p.feriadosAdicionais.join(', ')} onChange={e => setP({ ...p, feriadosAdicionais: e.target.value.split(',').map(x => x.trim()) })} /></Campo>
      <div className="space-y-3">{p.passos.map((s, index) => <section key={s.id} className="space-y-3 rounded-2xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-4"><Campo nome="Dia relativo ao vencimento"><Input type="number" min={-60} max={365} value={s.dia} onChange={e => setP({ ...p, passos: p.passos.map((x, i) => i === index ? { ...x, dia: Number(e.target.value) } : x) })} /></Campo><Campo nome="Acção"><select className={selectClass} value={s.accao} onChange={e => setP({ ...p, passos: p.passos.map((x, i) => i === index ? { ...x, accao: e.target.value } : x) })}><option value="lembrete">Lembrete</option><option value="aviso">Aviso de cobrança</option><option value="negociacao">Negociação</option><option value="juridico">Contencioso</option></select></Campo><Campo nome="Tom"><Input value={s.tom} onChange={e => setP({ ...p, passos: p.passos.map((x, i) => i === index ? { ...x, tom: e.target.value } : x) })} /></Campo><Campo nome="Modelo Meta (UTILITY)"><select className={selectClass} value={s.modeloMeta || ''} onChange={e => setP({ ...p, passos: p.passos.map((x, i) => i === index ? { ...x, modeloMeta: e.target.value } : x) })}><option value="">Ainda não configurado</option>{modelos.filter(m => m.category === 'UTILITY' && m.language === 'pt_PT').map(m => <option key={m.id} value={m.name}>{m.name}</option>)}</select></Campo></div>
        <Campo nome="Texto para contacto manual"><Textarea value={s.texto} onChange={e => setP({ ...p, passos: p.passos.map((x, i) => i === index ? { ...x, texto: e.target.value } : x) })} /></Campo>
        <div className="flex justify-between"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.activo} onChange={e => setP({ ...p, passos: p.passos.map((x, i) => i === index ? { ...x, activo: e.target.checked } : x) })} />Passo activo</label><Button variant="ghost" onClick={() => setP({ ...p, passos: p.passos.filter((_, i) => i !== index) })}>Remover passo</Button></div>
      </section>)}</div>
      <p className="text-xs text-muted-foreground">Variáveis: {'{nome}, {valor}, {vencimento}, {pagamento}, {empresa}'}. Para a API, o modelo aprovado deve ter 4 parâmetros no corpo, nesta ordem: nome, valor, vencimento, dados de pagamento.</p>
      <div className="flex gap-2"><Button variant="outline" onClick={() => setP({ ...p, passos: [...p.passos, { id: crypto.randomUUID(), dia: 45, accao: 'aviso', tom: 'Formal', texto: '{nome}, contacte a {empresa} sobre {valor}.', activo: true }] })}>Adicionar passo</Button><Button disabled={busy} onClick={save}>Guardar régua</Button></div>
    </fieldset>{!admin && <p className="text-sm text-muted-foreground">Só administradores alteram a régua.</p>}{message && <p role="status">{message}</p>}
  </div>;
}
