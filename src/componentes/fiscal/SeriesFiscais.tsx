import { useState } from 'react';
import { Layers, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Card } from '@/componentes/ui/card';
import { Label } from '@/componentes/ui/label';
import { Switch } from '@/componentes/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { toast } from '@/ganchos/usar-toast';
import { getDeviceId } from '@/servicos/ServicoSincronizacaoCloud';
import { ErroFiscal, sincronizarSeries, solicitarSerie, type SerieFiscal } from '@/servicos/ServicoFiscal';
import type { AgtTipoDocumento } from '@/bibliotecas/fiscal/tipos';
import { Aviso, ListaProblemas, Vazio } from './comum';
import { ContextoFiscal, TIPOS_DOC, aposFechar, dataHoraPt } from './apoio';

export default function SeriesFiscais({ ctx, series }: { ctx: ContextoFiscal; series: SerieFiscal[] }) {
  const [aberto, setAberto] = useState(false);
  const [aSincronizar, setASincronizar] = useState(false);
  const dispositivo = getDeviceId();
  const ano = new Date().getFullYear();
  const minhas = series.filter(s => s.deviceId === dispositivo);
  const activas = new Set(minhas.filter(s => s.seriesYear === ano && s.status !== 'F' && !s.contingency).map(s => s.documentType));
  const emFalta = (['FR', 'NC'] as AgtTipoDocumento[]).filter(t => !activas.has(t));

  return (
    <div className="space-y-4">
      {emFalta.length > 0 && <Aviso tom="aviso" titulo={`Este computador ainda não tem séries ${ano} para: ${emFalta.join(', ')}`}>
        FR é usada para facturar os juros e a mora das prestações; NC para anulações. Cada computador numera na sua própria série, para que dois postos sincronizados nunca repitam números.</Aviso>}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2.5"><Layers className="h-5 w-5 text-primary" /></div>
            <div><h3 className="font-bold">Séries de numeração</h3><p className="text-xs text-muted-foreground">Atribuídas pela AGT por tipo de documento, ano e estabelecimento</p></div></div>
          {ctx.podeAdministrar && <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2" disabled={!ctx.config.agtActiva || aSincronizar} title={!ctx.config.agtActiva ? 'Active a comunicação com a AGT' : undefined}
              onClick={async () => { setASincronizar(true); try { const r = await sincronizarSeries(ctx.config, ctx.empresa, ctx.user); toast.success(`${r.novas} nova(s), ${r.actualizadas} actualizada(s)`); ctx.recarregar(); } catch (e) { toast.error((e as Error).message); } finally { setASincronizar(false); } }}>
              <RefreshCw className={`h-4 w-4 ${aSincronizar ? 'animate-spin' : ''}`} />Sincronizar com a AGT</Button>
            <Button size="sm" className="gap-2" onClick={() => setAberto(true)}><Plus className="h-4 w-4" />Pedir série</Button>
          </div>}
        </div>
        {!series.length ? <Vazio icone={Layers} titulo="Nenhuma série registada">Peça as séries à AGT para começar a emitir.</Vazio> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b text-[11px] uppercase tracking-wide text-muted-foreground"><tr>
                <th className="px-4 py-2">Série</th><th className="px-2">Tipo</th><th className="px-2">Ano</th><th className="px-2">Utilização</th><th className="px-2">Estado</th><th className="px-2">Computador</th><th className="px-4">Origem</th></tr></thead>
              <tbody className="divide-y">{series.map(s => {
                const total = s.lastNumber - s.firstNumber + 1;
                const usados = s.nextNumber - s.firstNumber;
                const pct = Math.min(100, (usados / Math.max(1, total)) * 100);
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5 font-mono text-xs font-bold">{s.seriesCode}{s.contingency ? <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] text-amber-800">contingência</span> : null}</td>
                    <td className="px-2 text-xs">{s.documentType} — {TIPOS_DOC[s.documentType] ?? ''}</td>
                    <td className="px-2 text-xs">{s.seriesYear}</td>
                    <td className="w-56 px-2"><div className="h-1.5 rounded-full bg-muted"><div className={`h-1.5 rounded-full ${pct > 90 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(1, pct)}%` }} /></div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{usados} emitidos · próximo n.º {s.nextNumber} de {s.lastNumber.toLocaleString('pt-AO')}</p></td>
                    <td className="px-2 text-xs">{{ A: 'Aberta', U: 'Em uso', F: 'Fechada' }[s.status]}</td>
                    <td className="px-2 text-xs">{s.deviceId === dispositivo ? <b>Este</b> : <span className="text-muted-foreground">Outro</span>}</td>
                    <td className="px-4 text-xs text-muted-foreground">{s.simulated ? 'Simulação' : `AGT · ${dataHoraPt(s.agtSyncedAt)}`}</td>
                  </tr>);
              })}</tbody>
            </table>
          </div>
        )}
      </Card>
      <PedirSerie aberto={aberto} onFechar={() => setAberto(false)} ctx={ctx} />
    </div>
  );
}

function PedirSerie({ aberto, onFechar, ctx }: { aberto: boolean; onFechar: () => void; ctx: ContextoFiscal }) {
  const hoje = new Date();
  const proximoAno = hoje.getMonth() === 11 && hoje.getDate() > 15;
  const [tipo, setTipo] = useState<AgtTipoDocumento>('FR');
  const [ano, setAno] = useState(String(hoje.getFullYear()));
  const [contingencia, setContingencia] = useState(false);
  const [erro, setErro] = useState<ErroFiscal | null>(null);
  const [ocupado, setOcupado] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={o => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Pedir série</DialogTitle>
          <DialogDescription>{ctx.config.agtActiva ? `O pedido é feito à AGT (${ctx.config.ambiente === 'producao' ? 'produção' : 'homologação'}) para o estabelecimento ${ctx.config.estabelecimento}.` : 'Comunicação com a AGT desligada: será criada uma série de SIMULAÇÃO, sem validade fiscal.'}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div><Label className="text-xs">Tipo de documento</Label>
            <Select value={tipo} onValueChange={v => setTipo(v as AgtTipoDocumento)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              {['FR', 'FT', 'NC', 'ND', 'RG'].map(t => <SelectItem key={t} value={t}>{t} — {TIPOS_DOC[t]}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Ano (o seguinte só depois de 15 de Dezembro)</Label>
            <Select value={ano} onValueChange={setAno}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value={String(hoje.getFullYear())}>{hoje.getFullYear()}</SelectItem>
              {proximoAno && <SelectItem value={String(hoje.getFullYear() + 1)}>{hoje.getFullYear() + 1}</SelectItem>}</SelectContent></Select></div>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>Série de contingência<span className="block text-xs text-muted-foreground">Só para emitir quando a AGT está indisponível.</span></span>
            <Switch checked={contingencia} onCheckedChange={setContingencia} /></label>
          {erro && <><Aviso tom="erro">{erro.message}</Aviso>{erro.problemas.length > 0 && <ListaProblemas problemas={erro.problemas} />}</>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button disabled={ocupado} onClick={async () => {
            setOcupado(true); setErro(null);
            try { const r = await solicitarSerie({ tipo, ano: Number(ano), contingencia }, ctx.config, ctx.empresa, ctx.user); onFechar(); ctx.recarregar(); aposFechar(() => toast.success(`Série ${r.codigo} criada${r.simulada ? ' (simulação)' : ''}`)); }
            catch (e) { setErro(e instanceof ErroFiscal ? e : new ErroFiscal((e as Error).message)); } finally { setOcupado(false); }
          }}>Pedir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
