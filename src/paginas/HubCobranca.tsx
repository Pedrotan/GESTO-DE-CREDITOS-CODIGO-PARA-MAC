import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, MessageCircle, RefreshCw, Users, ShieldCheck, ListChecks, Megaphone, HandCoins, Settings2 } from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { ServicoHubCobranca, apiCobranca } from '@/servicos/ServicoHubCobranca';
import { dinheiroHub } from '@/servicos/AgendadorHubCobranca';
import { clientesDoHub, indicadoresHub, pontualidadeHub, apurarPromessas, promessasPendentes, hojeLuanda } from '@/bibliotecas/hub-cobranca';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Badge } from '@/componentes/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/componentes/ui/tabs';
import { Skeleton } from '@/componentes/ui/skeleton';
import { FichaContacto } from '@/componentes/cobranca/FichaContacto';
import { CampanhasHub } from '@/componentes/cobranca/CampanhasHub';
import { ReguaCobranca } from '@/componentes/cobranca/ReguaCobranca';
import { CanalWhatsApp } from '@/componentes/cobranca/CanalWhatsApp';
import { EquipaHub } from '@/componentes/cobranca/EquipaHub';
import { ListaCobranca } from '@/componentes/cobranca/ListaCobranca';
import { Metrica, Aviso, Vazio, type EstadoHub, type HubProps } from '@/componentes/cobranca/comum';
const abas = [['painel', 'Visão geral', HandCoins], ['vencer', 'A vencer', CalendarClock], ['atrasos', 'Em atraso', ListChecks], ['promessas', 'Promessas', MessageCircle], ['campanhas', 'Campanhas', Megaphone], ['equipa', 'Equipa e metas', Users], ['regua', 'Régua de cobrança', Settings2], ['canal', 'WhatsApp oficial', ShieldCheck]] as const;
export default function HubCobranca() {
  const dados = useData(), { user } = useAuth();
  const [estado, setEstado] = useState<EstadoHub | null>(null), [erro, setErro] = useState(''), [aba, setAba] = useState('painel'), [ficha, setFicha] = useState<string | null>(null), [cloud, setCloud] = useState<any>(null), [modelos, setModelos] = useState<any[]>([]), [pesquisa, setPesquisa] = useState('');
  const recarregar = useCallback(async () => {
    try { let value = await ServicoHubCobranca.carregar(); if (user && apurarPromessas(value.cobrancas, dados.payments).length) { await ServicoHubCobranca.reconciliarPromessas(value.cobrancas, dados.payments, user); value = await ServicoHubCobranca.carregar(); } setEstado(value); setErro(''); }
    catch (e) { setErro((e as Error).message); }
  }, [user, dados.payments]);
  const actualizarCloud = useCallback(async () => {
    if (!user) return;
    try { const result = await ServicoHubCobranca.receberNuvem(user); setCloud(result); if (result.connected) { const templates = await apiCobranca('modelos'); setModelos(templates.templates); } await recarregar(); }
    catch (e) { setCloud({ connected: false, enabled: false, error: (e as Error).message }); }
  }, [user, recarregar]);
  useEffect(() => { void recarregar(); }, [recarregar]);
  useEffect(() => { void actualizarCloud(); }, [actualizarCloud]);
  useEffect(() => { const timer = setInterval(() => void recarregar(), 60000); return () => clearInterval(timer); }, [recarregar]);
  const rows = useMemo(() => clientesDoHub(dados.clients, dados.credits, estado?.prestacoes || [], estado?.politica.diasPreventivos || 7), [dados.clients, dados.credits, estado]);
  if (!user) return null;
  if (!estado) return <MainLayout title="Hub de Cobrança" subtitle="A preparar a carteira de cobrança"><div className="space-y-4" role="status" aria-label="A carregar cobrança">{erro ? <><p role="alert">{erro}</p><Button onClick={recarregar}>Tentar novamente</Button></> : <><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-14" /><Skeleton className="h-80" /></>}</div></MainLayout>;
  const hub: HubProps = { estado, rows, recarregar, cloud, modelos, actualizarCloud };
  const kpi = indicadoresHub(rows, estado.eventos, estado.cobrancas, dados.payments), vencidos = rows.filter(r => r.atrasoMinor > 0), proximos = rows.filter(r => r.proximas.length > 0), pending = promessasPendentes(estado.cobrancas);
  const pontualidade = pontualidadeHub(estado.prestacoes, estado.eventos, dados.credits);
  return <MainLayout title="Hub de Cobrança" subtitle="Prevenção, recuperação, contactos e campanhas com acompanhamento"><div className="space-y-5"><div className="flex flex-wrap justify-between gap-3"><div className="flex gap-2"><Badge variant="outline">{cloud?.connected ? 'Meta configurada' : 'Contactos manuais disponíveis'}</Badge><Badge variant="outline">{vencidos.length} clientes com prestações vencidas</Badge></div><Button variant="outline" onClick={() => void actualizarCloud()}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button></div>
    <div className="flex flex-wrap items-center gap-2"><Input className="sm:max-w-md" placeholder="Abrir ficha de qualquer cliente (nome ou NIF)" value={pesquisa} onChange={e => setPesquisa(e.target.value)} aria-label="Pesquisar ficha de cliente" />{pesquisa.trim() && rows.filter(r => `${r.client.name} ${r.client.nif}`.toLowerCase().includes(pesquisa.toLowerCase())).slice(0, 5).map(r => <Button key={r.client.id} variant="outline" onClick={() => { setFicha(r.client.id); setPesquisa(''); }}>{r.client.name}</Button>)}</div>
    {erro && <p role="status" className="rounded-xl border p-3 text-sm">{erro}</p>}
    <Tabs value={aba} onValueChange={setAba}><TabsList className="w-full justify-start h-auto p-1">{abas.map(([id, label, Icon]) => <TabsTrigger key={id} value={id} className="gap-1.5 py-2"><Icon className="h-4 w-4" />{label}</TabsTrigger>)}</TabsList>
      <TabsContent value="painel" className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metrica titulo="Recuperado no mês após contacto" valor={dinheiroHub(kpi.recuperadoMinor)} classe="card-kpi-mint" /><Metrica titulo="Créditos contactados com pagamento" valor={kpi.taxa === null ? 'Sem base' : `${kpi.taxa}%`} nota="Pagamentos confirmados após contacto no mês" classe="card-kpi-sky" /><Metrica titulo="Mensagens enviadas hoje" valor={kpi.mensagensHoje} nota="Envio confirmado; sem contar aberturas do WhatsApp" classe="card-kpi-purple" /><Metrica titulo="Promessas no mês" valor={`${kpi.cumpridas} / ${kpi.falhadas}`} nota="Cumpridas / falhadas" classe="card-kpi-amber" /></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpi.faixas.map(f => <Metrica key={f.label} titulo={f.label} valor={dinheiroHub(f.valorMinor)} nota={`${f.clientes} clientes`} />)}</div>
        <div className="grid gap-3 sm:grid-cols-3"><Metrica titulo="Prestações pagas em dia" valor={pontualidade.taxa === null ? 'Sem base' : pontualidade.taxa + '%'} /><Metrica titulo="Antes / depois dos lembretes" valor={(pontualidade.antes === null ? '—' : pontualidade.antes + '%') + ' / ' + (pontualidade.depois === null ? '—' : pontualidade.depois + '%')} nota="Comparação histórica; sem atribuir causalidade" /><Metrica titulo="Atraso médio das prestações em aberto" valor={pontualidade.diasMedios + ' dias'} /></div>
        <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border bg-card p-5 space-y-3"><h2 className="flex items-center gap-2 font-bold"><CalendarClock className="h-5 w-5 text-primary" />Próximos vencimentos</h2>{proximos.length ? proximos.slice(0, 8).map(r => <button key={r.client.id} className="flex w-full justify-between gap-3 border-t py-3 text-left text-sm" onClick={() => setFicha(r.client.id)}><span>{r.client.name}<span className="block text-xs text-muted-foreground">{r.proximas[0].vencimento}</span></span><strong>{dinheiroHub(r.aVencerMinor)}</strong></button>) : <Vazio>Sem vencimentos nos próximos {estado.politica.diasPreventivos} dias.</Vazio>}<Button variant="outline" onClick={() => setAba('vencer')}>Ver cobrança preventiva</Button></section>
          <section className="rounded-2xl border bg-card p-5 space-y-3"><h2 className="font-bold">Campanhas e tarefas</h2><p className="text-sm">{estado.campanhas.filter(c => c.estado === 'agendada' && c.fim >= hojeLuanda()).length} campanhas agendadas · {pending.length} promessas em aberto</p>{vencidos.filter(r => estado.politica.passos.some(p => p.activo && p.accao === 'juridico' && r.diasAtraso >= p.dia)).slice(0, 5).map(r => <button key={r.client.id} className="block text-left text-sm font-medium underline" onClick={() => setFicha(r.client.id)}>Revisão de contencioso: {r.client.name} · {r.diasAtraso} dias</button>)}{!vencidos.length && <Aviso>A carteira não tem prestações vencidas. Acompanhe os próximos vencimentos e as campanhas activas.</Aviso>}<div className="flex gap-2"><Button variant="outline" onClick={() => setAba('campanhas')}>Abrir campanhas</Button><Button variant="outline" onClick={() => setAba('promessas')}>Ver promessas</Button></div></section></div>
      </TabsContent><TabsContent value="vencer"><ListaCobranca {...hub} preventiva abrirFicha={setFicha} /></TabsContent><TabsContent value="atrasos"><ListaCobranca {...hub} preventiva={false} abrirFicha={setFicha} /></TabsContent>
      <TabsContent value="promessas"><div className="space-y-4"><h2 className="font-bold">Promessas de pagamento</h2><p className="text-sm text-muted-foreground">O cumprimento é apurado com pagamentos confirmados no prazo. Registe uma promessa na ficha do cliente.</p>{pending.length ? pending.map(p => { const row = rows.find(r => r.creditos.some(c => c.id === p.creditId)); return <div key={p.id} className="rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{row?.client.name || p.creditId}</p><p className="text-sm">{dinheiroHub(p.amountMinor || 0)} em {p.promisedDate} · {p.actorName}</p><p className="text-xs text-muted-foreground">{p.notes}</p></div>{row && <Button variant="outline" onClick={() => setFicha(row.client.id)}>Abrir ficha</Button>}</div>; }) : <Vazio>Sem promessas pendentes.</Vazio>}<div className="rounded-xl border p-4 text-sm"><p>Cumpridas no mês: {kpi.cumpridas} · Falhadas: {kpi.falhadas}</p>{kpi.cumpridas + kpi.falhadas > 0 && <p>Taxa de cumprimento: {Math.round(kpi.cumpridas / (kpi.cumpridas + kpi.falhadas) * 100)}%</p>}</div></div></TabsContent>
      <TabsContent value="campanhas"><CampanhasHub {...hub} /></TabsContent><TabsContent value="equipa"><EquipaHub {...hub} /></TabsContent><TabsContent value="regua"><ReguaCobranca {...hub} /></TabsContent><TabsContent value="canal"><CanalWhatsApp {...hub} /></TabsContent>
    </Tabs>{ficha && rows.find(r => r.client.id === ficha) && <FichaContacto key={ficha} {...hub} row={rows.find(r => r.client.id === ficha)!} onFechar={() => setFicha(null)} />}
  </div></MainLayout>;
}
