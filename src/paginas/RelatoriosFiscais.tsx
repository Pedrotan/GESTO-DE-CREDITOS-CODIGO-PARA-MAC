import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, FileCode2, FileText, LayoutDashboard, Layers, Percent, RefreshCw, ScrollText, Settings2, ShieldAlert, ShieldCheck, FlaskConical } from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import { toast } from '@/ganchos/usar-toast';
import { generateEconomicReport } from '@/bibliotecas/economicReportGenerator';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import {
  CONFIG_PADRAO, empresaDe, listarDocumentos, listarExportacoesSaft, listarSeries, obterConfig, pagamentosPorFacturar, processarFila, resumir,
  type DocumentoFiscal, type PagamentoPorFacturar, type SerieFiscal,
} from '@/servicos/ServicoFiscal';
import type { ConfigFiscal } from '@/bibliotecas/fiscal/tipos';
import type { ContextoFiscal } from '@/componentes/fiscal/apoio';
import { hojeLuanda } from '@/componentes/fiscal/apoio';
import PainelFiscal from '@/componentes/fiscal/PainelFiscal';
import DocumentosFiscais from '@/componentes/fiscal/DocumentosFiscais';
import SeriesFiscais from '@/componentes/fiscal/SeriesFiscais';
import SaftFiscal from '@/componentes/fiscal/SaftFiscal';
import ImpostosFiscal from '@/componentes/fiscal/ImpostosFiscal';
import CalendarioFiscal from '@/componentes/fiscal/CalendarioFiscal';
import ConfiguracaoAgt from '@/componentes/fiscal/ConfiguracaoAgt';
import AuditoriaFiscal from '@/componentes/fiscal/AuditoriaFiscal';

const SEPARADORES = [
  { id: 'painel', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'documentos', label: 'Facturação electrónica', icon: FileText },
  { id: 'series', label: 'Séries', icon: Layers },
  { id: 'saft', label: 'SAF-T (AO)', icon: FileCode2 },
  { id: 'impostos', label: 'Mapa de impostos', icon: Percent },
  { id: 'calendario', label: 'Calendário fiscal', icon: CalendarClock },
  { id: 'configuracao', label: 'Configuração AGT', icon: Settings2 },
  { id: 'auditoria', label: 'Auditoria', icon: ScrollText },
];
const CHAVE_SEPARADOR = 'tango.fiscal.separador';

export default function RelatoriosFiscais() {
  const { user } = useAuth();
  const { clients, credits, payments, logs, companySettings } = useData();
  const [separador, setSeparador] = useState(() => { try { return localStorage.getItem(CHAVE_SEPARADOR) || 'painel'; } catch { return 'painel'; } });
  const [periodo, setPeriodo] = useState(() => ({ inicio: `${hojeLuanda().slice(0, 4)}-01-01`, fim: hojeLuanda() }));
  const [config, setConfig] = useState<ConfigFiscal>(CONFIG_PADRAO);
  const [documentos, setDocumentos] = useState<DocumentoFiscal[]>([]);
  const [series, setSeries] = useState<SerieFiscal[]>([]);
  const [porFacturar, setPorFacturar] = useState<PagamentoPorFacturar[]>([]);
  const [ultimoSaft, setUltimoSaft] = useState<{ fileName: string; createdAt: string } | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [aEnviar, setAEnviar] = useState(false);
  const [facturacaoAberta, setFacturacaoAberta] = useState(false);

  useEffect(() => { try { localStorage.setItem(CHAVE_SEPARADOR, separador); } catch { /* sem armazenamento */ } }, [separador]);

  const carregar = useCallback(async () => {
    setACarregar(true);
    try {
      const [c, docs, s, saft] = await Promise.all([obterConfig(), listarDocumentos(periodo.inicio, periodo.fim), listarSeries(), listarExportacoesSaft()]);
      setConfig(c); setDocumentos(docs); setSeries(s); setUltimoSaft(saft[0] ?? null);
      setPorFacturar(await pagamentosPorFacturar(payments, credits, clients, c.dataAdesao));
    } catch (e) {
      toast.error(`Não foi possível carregar os dados fiscais: ${(e as Error).message}`);
    } finally { setACarregar(false); }
  }, [periodo, payments, credits, clients]);
  useEffect(() => { carregar(); }, [carregar]);

  const empresa = useMemo(() => empresaDe(companySettings as any, config), [companySettings, config]);
  const soSimulacao = !config.agtActiva;
  const resumo = useMemo(() => resumir(documentos, soSimulacao), [documentos, soSimulacao]);

  if (!user) return null;
  const ctx: ContextoFiscal = {
    config, empresa, user: { id: user.id, name: user.name, role: user.role },
    podeGerir: ServicoControloAcesso.temPermissao(user, 'manage_fiscal'),
    podeAdministrar: ['admin', 'super_admin'].includes(String(user.role)),
    isSuperAdmin: user.role === 'super_admin',
    recarregar: carregar,
  };
  if (!ctx.podeGerir) {
    return (
      <MainLayout title="Acesso negado" subtitle="Sem permissão">
        <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-destructive"><ShieldAlert className="h-16 w-16" /><p>Precisa da permissão «Documentos Fiscais».</p></div>
      </MainLayout>
    );
  }

  const estadoLigacao = !config.agtActiva
    ? { texto: 'Simulação', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200', Icone: FlaskConical }
    : { texto: config.ambiente === 'producao' ? 'AGT · Produção' : 'AGT · Homologação', cls: config.ambiente === 'producao' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800', Icone: ShieldCheck };

  const enviar = async () => {
    setAEnviar(true);
    try { const r = await processarFila(config, empresa); toast.success(`${r.enviados} enviado(s) · ${r.consultados} pedido(s) consultado(s)`); await carregar(); }
    catch (e) { toast.error((e as Error).message); } finally { setAEnviar(false); }
  };

  const relatorioEconomico = () => {
    try { generateEconomicReport({ clients, credits, payments, logs, companySettings, userName: user.name }); toast.success('Relatório económico gerado'); }
    catch { toast.error('Não foi possível gerar o relatório económico.'); }
  };

  return (
    <MainLayout title="Relatórios Fiscais" subtitle="Facturação electrónica AGT, SAF-T (AO), impostos e conformidade fiscal">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${estadoLigacao.cls}`}>
          <estadoLigacao.Icone className="h-3.5 w-3.5" />{estadoLigacao.texto}{config.contingencia && ' · contingência'}
        </span>
        {['painel', 'documentos', 'impostos'].includes(separador) && (
          <div className="flex flex-wrap items-end gap-2">
            <div><Label className="text-xs">De</Label><Input type="date" className="w-40" value={periodo.inicio} onChange={e => setPeriodo(p => ({ ...p, inicio: e.target.value }))} /></div>
            <div><Label className="text-xs">Até</Label><Input type="date" className="w-40" value={periodo.fim} onChange={e => setPeriodo(p => ({ ...p, fim: e.target.value }))} /></div>
            <Button variant="outline" className="gap-2" onClick={carregar} disabled={aCarregar}><RefreshCw className={`h-4 w-4 ${aCarregar ? 'animate-spin' : ''}`} />Actualizar</Button>
          </div>
        )}
      </div>

      <Tabs value={separador} onValueChange={setSeparador}>
        <TabsList className="mb-5 h-auto w-full gap-1 bg-transparent p-0">
          {SEPARADORES.map(s => (
            <TabsTrigger key={s.id} value={s.id} className="gap-1.5 rounded-lg border border-transparent px-3 py-2 data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <s.icon className="h-4 w-4" />{s.label}
              {s.id === 'documentos' && resumo.rejeitados > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] text-white">{resumo.rejeitados}</span>}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="painel">
          <PainelFiscal ctx={ctx} resumo={resumo} incluiSimulados={soSimulacao} periodo={periodo} series={series.filter(s => s.status !== 'F')} ultimoSaft={ultimoSaft}
            porFacturar={porFacturar.length} aCorrer={aEnviar} onEnviar={enviar} onIr={setSeparador}
            onFacturar={() => { setSeparador('documentos'); setFacturacaoAberta(true); }} onRelatorioEconomico={relatorioEconomico} />
        </TabsContent>
        <TabsContent value="documentos">
          <DocumentosFiscais ctx={ctx} documentos={documentos} porFacturar={porFacturar} clientes={clients} creditos={credits} empresaPdf={companySettings}
            abrirFacturacao={facturacaoAberta} onAbrirFacturacao={() => setFacturacaoAberta(true)} onFecharFacturacao={() => setFacturacaoAberta(false)} />
        </TabsContent>
        <TabsContent value="series"><SeriesFiscais ctx={ctx} series={series} /></TabsContent>
        <TabsContent value="saft"><SaftFiscal ctx={ctx} empresaPdf={companySettings} clientesTotal={clients.length} /></TabsContent>
        <TabsContent value="impostos"><ImpostosFiscal documentos={documentos} periodo={periodo} incluirSimulados={soSimulacao} /></TabsContent>
        <TabsContent value="calendario"><CalendarioFiscal /></TabsContent>
        <TabsContent value="configuracao"><ConfiguracaoAgt ctx={ctx} /></TabsContent>
        <TabsContent value="auditoria"><AuditoriaFiscal /></TabsContent>
      </Tabs>
    </MainLayout>
  );
}
