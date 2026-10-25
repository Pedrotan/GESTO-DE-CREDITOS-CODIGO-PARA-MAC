import { useEffect, useMemo, useState } from 'react';
import { Download, FileCode2, Fingerprint, History, Printer, ShieldCheck } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Card } from '@/componentes/ui/card';
import { Label } from '@/componentes/ui/label';
import { Input } from '@/componentes/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { toast } from '@/ganchos/usar-toast';
import { formatCurrency } from '@/bibliotecas/formatters';
import { generateSaftReportPDF } from '@/bibliotecas/fiscalPdfGenerator';
import type { Problema } from '@/bibliotecas/fiscal/tipos';
import { descarregar, ErroFiscal, ficheiroSaft, gerarSaft, listarExportacoesSaft, prevalidarPeriodo } from '@/servicos/ServicoFiscal';
import { Aviso, ListaProblemas, Vazio } from './comum';
import { ContextoFiscal, dataPt, dataHoraPt } from './apoio';

type Periodo = 'mensal' | 'trimestral' | 'semestral' | 'anual' | 'personalizado';
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const dois = (n: number) => String(n).padStart(2, '0');
const fimMes = (a: number, m: number) => `${a}-${dois(m)}-${dois(new Date(a, m, 0).getDate())}`;

function intervalo(ano: number, p: Periodo, sub: number, livre: { inicio: string; fim: string }) {
  switch (p) {
    case 'anual': return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
    case 'mensal': return { inicio: `${ano}-${dois(sub)}-01`, fim: fimMes(ano, sub) };
    case 'trimestral': return { inicio: `${ano}-${dois((sub - 1) * 3 + 1)}-01`, fim: fimMes(ano, sub * 3) };
    case 'semestral': return { inicio: `${ano}-${sub === 1 ? '01' : '07'}-01`, fim: fimMes(ano, sub * 6) };
    default: return livre;
  }
}

export default function SaftFiscal({ ctx, empresaPdf, clientesTotal }: { ctx: ContextoFiscal; empresaPdf: unknown; clientesTotal: number }) {
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [periodo, setPeriodo] = useState<Periodo>('mensal');
  const [sub, setSub] = useState(agora.getMonth() + 1);
  const [livre, setLivre] = useState({ inicio: `${agora.getFullYear()}-01-01`, fim: agora.toISOString().slice(0, 10) });
  const [validacao, setValidacao] = useState<{ documentos: number; problemas: Problema[] } | null>(null);
  const [ocupado, setOcupado] = useState<'v' | 'g' | null>(null);
  const [historico, setHistorico] = useState<Awaited<ReturnType<typeof listarExportacoesSaft>>>([]);
  const [ultimo, setUltimo] = useState<{ nomeFicheiro: string; sha256: string; estatisticas: { facturas: number; recibos: number; clientes: number; debito: number; credito: number } } | null>(null);

  const r = useMemo(() => intervalo(ano, periodo, sub, livre), [ano, periodo, sub, livre]);
  const carregar = () => listarExportacoesSaft().then(setHistorico).catch(() => setHistorico([]));
  useEffect(() => { carregar(); }, []);
  useEffect(() => { setValidacao(null); setUltimo(null); }, [r]);
  const temErros = validacao?.problemas.some(p => p.nivel === 'erro');

  const gerar = async (forcar = false) => {
    setOcupado('g');
    try {
      const out = await gerarSaft({ inicio: r.inicio, fim: r.fim, base: 'F' }, ctx.config, ctx.empresa, ctx.user, forcar);
      descarregar(out.nomeFicheiro, out.xml);
      setUltimo(out); setValidacao({ documentos: out.estatisticas.facturas + out.estatisticas.recibos, problemas: out.problemas });
      toast.success(`SAF-T gerado: ${out.nomeFicheiro}`);
      carregar();
    } catch (e) {
      if (e instanceof ErroFiscal && e.problemas.length) setValidacao(v => ({ documentos: v?.documentos ?? 0, problemas: e.problemas }));
      toast.error((e as Error).message);
    } finally { setOcupado(null); }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="p-5 lg:col-span-3">
        <div className="mb-5 flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2.5"><FileCode2 className="h-5 w-5 text-primary" /></div>
          <div><h3 className="font-bold">Ficheiro SAF-T (AO)</h3><p className="text-xs text-muted-foreground">Standard Audit File for Tax Purposes · versão 1.01_01 · vertente de facturação</p></div></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label className="text-xs">Ano fiscal</Label><Select value={String(ano)} onValueChange={v => setAno(Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            {[0, 1, 2, 3].map(k => agora.getFullYear() - k).map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Período</Label><Select value={periodo} onValueChange={v => { setPeriodo(v as Periodo); setSub(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="mensal">Mensal</SelectItem><SelectItem value="trimestral">Trimestral</SelectItem><SelectItem value="semestral">Semestral</SelectItem>
            <SelectItem value="anual">Anual</SelectItem><SelectItem value="personalizado">Personalizado</SelectItem></SelectContent></Select></div>
          {periodo === 'mensal' && <div><Label className="text-xs">Mês</Label><Select value={String(sub)} onValueChange={v => setSub(Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent></Select></div>}
          {periodo === 'trimestral' && <div><Label className="text-xs">Trimestre</Label><Select value={String(sub)} onValueChange={v => setSub(Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 4].map(t => <SelectItem key={t} value={String(t)}>{t}.º trimestre</SelectItem>)}</SelectContent></Select></div>}
          {periodo === 'semestral' && <div><Label className="text-xs">Semestre</Label><Select value={String(sub)} onValueChange={v => setSub(Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1.º semestre</SelectItem><SelectItem value="2">2.º semestre</SelectItem></SelectContent></Select></div>}
        </div>
        {periodo === 'personalizado' && <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><Label className="text-xs">De</Label><Input type="date" value={livre.inicio} onChange={e => setLivre({ ...livre, inicio: e.target.value })} /></div>
          <div><Label className="text-xs">Até</Label><Input type="date" value={livre.fim} onChange={e => setLivre({ ...livre, fim: e.target.value })} /></div></div>}
        <p className="mt-3 text-xs text-muted-foreground">Período: <b className="text-foreground">{dataPt(r.inicio)}</b> a <b className="text-foreground">{dataPt(r.fim)}</b>{r.inicio.slice(0, 4) !== r.fim.slice(0, 4) && <span className="ml-2 text-red-600">— o SAF-T tem de ficar dentro do mesmo exercício</span>}</p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="flex-1 gap-2" disabled={!ctx.podeGerir || ocupado !== null || r.inicio > r.fim} onClick={async () => {
            setOcupado('v');
            try { setValidacao(await prevalidarPeriodo({ inicio: r.inicio, fim: r.fim, base: 'F' }, ctx.config, ctx.empresa)); }
            catch (e) { toast.error((e as Error).message); } finally { setOcupado(null); }
          }}><ShieldCheck className="h-4 w-4" />1. Pré-validar</Button>
          <Button className="flex-1 gap-2" disabled={!ctx.podeGerir || !validacao || temErros || ocupado !== null} onClick={() => gerar(false)}
            title={!validacao ? 'Pré-valide primeiro' : temErros ? 'Corrija os erros primeiro' : undefined}><Download className="h-4 w-4" />2. Gerar e baixar SAF-T (XML)</Button>
        </div>
        {temErros && ctx.isSuperAdmin && <button className="mt-2 text-[11px] text-red-700 underline"
          onClick={() => window.confirm('Gerar com erros? O ficheiro pode ser recusado pela AGT; a operação fica registada na auditoria.') && gerar(true)}>Gerar mesmo assim (Super Administrador)</button>}
        <Button variant="ghost" size="sm" className="mt-3 gap-2" onClick={() => generateSaftReportPDF(empresaPdf, { fiscalYear: ano, startDate: new Date(`${r.inicio}T12:00:00`), endDate: new Date(`${r.fim}T12:00:00`) },
          { clients: ultimo?.estatisticas.clientes ?? clientesTotal, invoices: ultimo?.estatisticas.facturas ?? validacao?.documentos ?? 0, payments: ultimo?.estatisticas.recibos ?? 0 })}><Printer className="h-4 w-4" />Relatório síntese (PDF)</Button>

        {validacao && <div className="mt-5 space-y-3"><p className="text-xs text-muted-foreground">{validacao.documentos} documento(s) no período (séries de simulação excluídas).</p>
          <ListaProblemas problemas={validacao.problemas} vazio="Pré-validação sem erros — pode gerar o ficheiro." /></div>}
        {ultimo && <div className="mt-4"><Aviso tom="ok" titulo={ultimo.nomeFicheiro}>{ultimo.estatisticas.facturas} facturas · {ultimo.estatisticas.recibos} recibos · {ultimo.estatisticas.clientes} clientes · crédito {formatCurrency(ultimo.estatisticas.credito)} · débito {formatCurrency(ultimo.estatisticas.debito)}
          <span className="mt-1 flex items-center gap-1 break-all font-mono text-[10px]"><Fingerprint className="h-3 w-3 shrink-0" />SHA-256 {ultimo.sha256}</span></Aviso></div>}
      </Card>

      <div className="space-y-5 lg:col-span-2">
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" />Antes de submeter</h3>
          <ol className="list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground">
            <li>Confirme que todos os documentos do período estão <b className="text-foreground">validados pela AGT</b> (sem pendentes nem rejeitados).</li>
            <li>A pré-validação verifica sequências, hashes encadeados (recalculados), NIF, totais e isenções.</li>
            <li>Valide o XML no validador da AGT antes de o submeter no Portal do Contribuinte.</li>
            <li>Cada exportação fica arquivada aqui com a sua impressão digital SHA-256.</li>
          </ol>
        </Card>
        <Card className="overflow-hidden">
          <h3 className="flex items-center gap-2 border-b p-4 font-bold"><History className="h-4 w-4" />Exportações anteriores</h3>
          {!historico.length ? <Vazio icone={History} titulo="Ainda sem exportações" /> : (
            <ul className="max-h-[420px] divide-y overflow-auto">{historico.map(x => (
              <li key={x.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                <div className="min-w-0"><p className="truncate font-mono font-semibold">{x.fileName}</p>
                  <p className="text-muted-foreground">{dataPt(x.startDate)} – {dataPt(x.endDate)} · {x.invoicesCount + x.paymentsCount} doc. · {(x.fileSize / 1024).toFixed(0)} KB{x.warnings ? ` · ${x.warnings} avisos` : ''}</p>
                  <p className="text-muted-foreground">{dataHoraPt(x.createdAt)}{x.createdByName ? ` · ${x.createdByName}` : ''}</p></div>
                <Button size="icon" variant="ghost" aria-label={`Baixar ${x.fileName}`} onClick={async () => { const f = await ficheiroSaft(x.id); if (f) descarregar(f.fileName, f.xml); }}><Download className="h-4 w-4" /></Button>
              </li>))}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
