import { useMemo } from 'react';
import { CalendarClock, FileCode2, FileText, Landmark, Layers, Percent, Receipt, RefreshCw, Send, ShieldCheck, TrendingUp, Download } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Card } from '@/componentes/ui/card';
import { formatCurrency } from '@/bibliotecas/formatters';
import { obrigacoes, diasAte } from '@/bibliotecas/fiscal/obrigacoes';
import type { ResumoFiscal, SerieFiscal } from '@/servicos/ServicoFiscal';
import { Aviso } from './comum';
import { ContextoFiscal, ESTADOS_AGT, dataPt, dataHoraPt } from './apoio';
import type { EstadoAgt } from '@/bibliotecas/fiscal/tipos';

const BARRA: Record<EstadoAgt, string> = {
  valido: 'bg-emerald-500', valido_penal: 'bg-orange-400', invalido: 'bg-red-500', pendente: 'bg-amber-400', erro_envio: 'bg-rose-400',
  enviado: 'bg-sky-400', em_validacao: 'bg-indigo-400', simulado: 'bg-slate-400', anulado: 'bg-slate-300',
};

function Kpi({ classe, icone: Icone, titulo, valor, nota }: { classe: string; icone: typeof FileText; titulo: string; valor: string; nota: string }) {
  return (
    <div className={classe}>
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/10 text-slate-950 dark:bg-white/10 dark:text-white"><Icone className="h-5 w-5" /></div>
        <p className="truncate text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">{titulo}</p>
      </div>
      <p className="my-2 truncate font-display text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{valor}</p>
      <p className="truncate text-xs font-semibold text-slate-900/75 dark:text-slate-400">{nota}</p>
    </div>
  );
}

export default function PainelFiscal({ ctx, resumo, incluiSimulados, periodo, series, ultimoSaft, porFacturar, aCorrer, onEnviar, onIr, onFacturar, onRelatorioEconomico }: {
  ctx: ContextoFiscal; resumo: ResumoFiscal; incluiSimulados: boolean; periodo: { inicio: string; fim: string }; series: SerieFiscal[];
  ultimoSaft?: { fileName: string; createdAt: string } | null; porFacturar: number; aCorrer: boolean;
  onEnviar: () => void; onIr: (separador: string) => void; onFacturar: () => void; onRelatorioEconomico: () => void;
}) {
  const proximos = useMemo(() => obrigacoes().filter(o => o.recorrencia !== 'continua').sort((a, b) => +a.data - +b.data).slice(0, 3), []);
  const total = Object.values(resumo.porEstado).reduce((s, n) => s + (n ?? 0), 0);
  const n = (e: EstadoAgt) => resumo.porEstado[e] ?? 0;
  const validos = n('valido') + n('valido_penal');
  const comunicaveis = total - n('simulado');
  const taxa = comunicaveis ? Math.round((validos / comunicaveis) * 100) : 0;
  const minhas = series.filter(s => s.status !== 'F');
  const maximo = Math.max(1, ...[...resumo.porDia.values()].map(d => d.n));
  const dias = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Africa/Luanda' }));

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {!/^\d{10}$/.test(ctx.empresa.nif) && <Aviso tom="erro" titulo="NIF da empresa em falta">Preencha o NIF (10 dígitos) em Definições › Empresa antes de emitir documentos fiscais.</Aviso>}
        {!ctx.config.agtActiva && <Aviso tom="info" titulo="Modo simulação">A comunicação com a AGT está desligada. Use séries de simulação para testar; esses documentos não têm validade fiscal e não entram no SAF-T. <button className="font-semibold underline" onClick={() => onIr('configuracao')}>Configurar a ligação</button></Aviso>}
        {ctx.config.contingencia && <Aviso tom="aviso" titulo="Modo de contingência activo">Os documentos estão a ser emitidos em séries de contingência. Desligue-o logo que a comunicação com a AGT volte.</Aviso>}
        {resumo.atrasados.length > 0 && <Aviso tom="erro" titulo={`${resumo.atrasados.length} documento(s) perto das 24 horas sem chegar à AGT`}>Depois de 24 horas a AGT marca o documento como válido com penalização. Primeiro: {resumo.atrasados[0].documentNo}.</Aviso>}
        {resumo.rejeitados > 0 && <Aviso tom="erro" titulo={`${resumo.rejeitados} documento(s) rejeitado(s) pela AGT`}>Cada um tem de ser corrigido com um número novo (estado C). <button className="font-semibold underline" onClick={() => onIr('documentos')}>Ver documentos</button></Aviso>}
        {porFacturar > 0 && <Aviso tom="aviso" titulo={`${porFacturar} pagamento(s) com juros ou mora ainda sem factura`}>A factura deve ser emitida até 5 dias úteis após a cobrança. {ctx.podeGerir && <button className="font-semibold underline" onClick={onFacturar}>Facturar agora</button>}</Aviso>}
        {minhas.filter(s => (s.nextNumber - s.firstNumber) / Math.max(1, s.lastNumber - s.firstNumber + 1) > 0.9).map(s =>
          <Aviso key={s.id} tom="aviso" titulo={`Série ${s.seriesCode} acima de 90%`}>Peça uma extensão à AGT para não interromper a emissão de {s.documentType}.</Aviso>)}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi classe="card-kpi-sky" icone={FileText} titulo="Documentos emitidos" valor={String(resumo.documentos)} nota={`${dataPt(periodo.inicio)} – ${dataPt(periodo.fim)}${incluiSimulados ? ' · simulação' : ''}`} />
        <Kpi classe="card-kpi-mint" icone={Landmark} titulo="Base tributável" valor={formatCurrency(resumo.base)} nota="Juros, mora e comissões facturados" />
        <Kpi classe="card-kpi-purple" icone={Percent} titulo="Impostos liquidados" valor={formatCurrency(resumo.impostos)} nota="IVA + Imposto de Selo" />
        <Kpi classe="card-kpi-amber" icone={Receipt} titulo="Total facturado" valor={formatCurrency(resumo.total)} nota={`${resumo.clientes} cliente(s) · retenções ${formatCurrency(resumo.retencoes)}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2.5"><ShieldCheck className="h-5 w-5 text-primary" /></div>
              <div>
                <h3 className="font-bold">Comunicação à AGT</h3>
                <p className="text-xs text-muted-foreground">{ctx.config.agtActiva ? (ctx.config.ambiente === 'producao' ? 'Produção' : 'Homologação') : 'Simulação'} · NIF {ctx.empresa.nif || '—'}</p>
              </div>
            </div>
            {ctx.podeGerir && ctx.config.agtActiva && <Button variant="outline" size="sm" className="gap-2" onClick={onEnviar} disabled={aCorrer}>{aCorrer ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar e actualizar estados</Button>}
          </div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div><p className="text-3xl font-black tabular-nums">{taxa}%</p><p className="text-xs text-muted-foreground">dos documentos do período validados pela AGT</p></div>
            <p className="text-xs text-muted-foreground">{n('pendente') + n('erro_envio')} por enviar · {n('enviado') + n('em_validacao')} em validação · {n('invalido')} rejeitados</p>
          </div>
          {total > 0 ? (
            <>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Documentos por estado na AGT">
                {(Object.keys(resumo.porEstado) as EstadoAgt[]).filter(e => n(e)).map(e => <div key={e} className={BARRA[e]} style={{ width: `${(n(e) / total) * 100}%` }} title={`${ESTADOS_AGT[e].label}: ${n(e)}`} />)}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                {(Object.keys(resumo.porEstado) as EstadoAgt[]).filter(e => n(e)).map(e => <span key={e}>{ESTADOS_AGT[e].label}: <b className="tabular-nums text-foreground">{n(e)}</b></span>)}
              </div>
            </>
          ) : <p className="text-xs text-muted-foreground">Ainda não há documentos no período.</p>}
          <p className="mb-2 mt-6 text-xs font-semibold">Documentos emitidos — últimos 30 dias</p>
          <div className="flex h-24 items-end gap-[3px]">
            {dias.map(dia => {
              const v = resumo.porDia.get(dia);
              return <div key={dia} title={`${dataPt(dia)}: ${v?.n ?? 0} doc. · ${formatCurrency(v?.total ?? 0)}`} className="flex-1 rounded-t bg-primary/80"
                style={{ height: `${v ? Math.max(6, (v.n / maximo) * 100) : 3}%`, opacity: v ? 1 : 0.15 }} />;
            })}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 font-bold"><CalendarClock className="h-4 w-4" />Próximos prazos</h3><Button variant="ghost" size="sm" onClick={() => onIr('calendario')}>Ver todos</Button></div>
            <ul className="space-y-3">
              {proximos.map(o => {
                const d = diasAte(o.data);
                return <li key={o.id} className="flex items-center justify-between gap-3 text-xs"><div className="min-w-0"><p className="truncate font-semibold">{o.titulo}</p><p className="text-muted-foreground">{o.data.toLocaleDateString('pt-AO')}</p></div>
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${d <= 7 ? 'bg-red-100 text-red-700' : d <= 30 ? 'bg-amber-100 text-amber-800' : 'bg-muted'}`}>{d <= 0 ? 'hoje' : `${d} dias`}</span></li>;
              })}
            </ul>
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 font-bold"><Layers className="h-4 w-4" />Séries deste computador</h3><Button variant="ghost" size="sm" onClick={() => onIr('series')}>Gerir</Button></div>
            {minhas.length ? <ul className="space-y-3">{minhas.slice(0, 5).map(s => {
              const usados = s.nextNumber - s.firstNumber;
              const pct = Math.min(100, (usados / Math.max(1, s.lastNumber - s.firstNumber + 1)) * 100);
              return <li key={s.id}><div className="mb-1 flex justify-between text-[11px]"><span className="font-mono font-semibold">{s.seriesCode}</span><span className="text-muted-foreground">{usados} usados</span></div>
                <div className="h-1.5 rounded-full bg-muted"><div className={`h-1.5 rounded-full ${pct > 90 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(pct, 1)}%` }} /></div></li>;
            })}</ul> : <p className="text-xs text-muted-foreground">Sem séries activas: não é possível emitir neste computador.</p>}
          </Card>
          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-2 font-bold"><FileCode2 className="h-4 w-4" />Último SAF-T</h3><Button variant="ghost" size="sm" onClick={() => onIr('saft')}>Gerar</Button></div>
            <p className="break-all text-xs text-muted-foreground">{ultimoSaft ? <><span className="font-mono">{ultimoSaft.fileName}</span><br />{dataHoraPt(ultimoSaft.createdAt)}</> : 'Ainda não foi gerado nenhum SAF-T.'}</p>
          </Card>
        </div>
      </div>

      <Card className="border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-5 dark:border-blue-900/40 dark:from-blue-950/30 dark:to-indigo-950/30">
        <div className="flex flex-wrap items-center gap-4">
          <div className="rounded-lg bg-blue-100 p-3 dark:bg-blue-900/50"><TrendingUp className="h-6 w-6 text-blue-700 dark:text-blue-300" /></div>
          <div className="min-w-0"><h3 className="font-bold text-blue-900 dark:text-blue-200">Relatório Económico Global</h3><p className="text-sm text-blue-700 dark:text-blue-300">Performance, lucros, perdas e métricas operacionais.</p></div>
          <Button onClick={onRelatorioEconomico} className="ml-auto gap-2 bg-blue-700 text-white hover:bg-blue-800"><Download className="h-4 w-4" />Baixar relatório (PDF)</Button>
        </div>
      </Card>
      <p className="text-[11px] text-muted-foreground">{incluiSimulados ? 'Modo simulação: os valores incluem documentos de simulação, sem validade fiscal.' : 'Os valores excluem documentos de simulação e recibos (que só liquidam facturas já contadas).'}</p>
    </div>
  );
}
