import { useMemo } from 'react';
import { Download, Landmark, Percent, Printer, Receipt, Scale } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Card } from '@/componentes/ui/card';
import { formatCurrency } from '@/bibliotecas/formatters';
import { mapaImpostos, type DocumentoFiscal } from '@/servicos/ServicoFiscal';
import { Aviso, Vazio } from './comum';
import { dataPt, exportarCsv } from './apoio';

export default function ImpostosFiscal({ documentos, periodo, incluirSimulados }: { documentos: DocumentoFiscal[]; periodo: { inicio: string; fim: string }; incluirSimulados: boolean }) {
  const { linhas, retencoes } = useMemo(() => mapaImpostos(documentos, incluirSimulados), [documentos, incluirSimulados]);
  const soma = (f: (l: (typeof linhas)[number]) => boolean, k: 'base' | 'valor') => linhas.filter(f).reduce((s, l) => s + l[k], 0);
  const iva = soma(l => l.imposto === 'IVA', 'valor');
  const is = soma(l => l.imposto === 'IS', 'valor');
  const isento = soma(l => l.codigo === 'ISE' || l.imposto === 'NS', 'base');
  const ret = retencoes.reduce((s, r) => s + r.valor, 0);
  const meses = [...new Set(linhas.map(l => l.mes))];
  const agregado = useMemo(() => {
    const m = new Map<string, { imposto: string; codigo: string; taxa: number; isencao: string; base: number; valor: number }>();
    for (const l of linhas) {
      const k = `${l.imposto}|${l.codigo}|${l.taxa}|${l.isencao}`;
      const x = m.get(k) ?? { imposto: l.imposto, codigo: l.codigo, taxa: l.taxa, isencao: l.isencao, base: 0, valor: 0 };
      x.base += l.base; x.valor += l.valor; m.set(k, x);
    }
    return [...m.values()];
  }, [linhas]);

  const Cartao = ({ classe, icone: Icone, titulo, valor }: { classe: string; icone: typeof Percent; titulo: string; valor: number }) => (
    <div className={classe}><div className="flex items-center gap-2"><Icone className="h-4 w-4" /><p className="text-sm font-bold">{titulo}</p></div><p className="mt-2 font-display text-2xl font-black">{formatCurrency(valor)}</p></div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao classe="card-kpi-purple" icone={Percent} titulo="IVA liquidado" valor={iva} />
        <Cartao classe="card-kpi-sky" icone={Landmark} titulo="Imposto de Selo" valor={is} />
        <Cartao classe="card-kpi-mint" icone={Scale} titulo="Isento / não sujeito" valor={isento} />
        <Cartao classe="card-kpi-amber" icone={Receipt} titulo="Retido pelos clientes" valor={ret} />
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div><h3 className="font-bold">Mapa de impostos liquidados</h3><p className="text-xs text-muted-foreground">{dataPt(periodo.inicio)} a {dataPt(periodo.fim)} · {incluirSimulados ? 'modo simulação: inclui documentos de simulação' : 'exclui rejeitados, anulados e simulações'} · notas de crédito a subtrair</p></div>
          <div className="flex gap-2 print:hidden">
            <Button size="sm" variant="outline" className="gap-2" disabled={!linhas.length} onClick={() => exportarCsv(`mapa_impostos_${periodo.inicio}_${periodo.fim}.csv`, linhas.map(l => ({
              Mes: l.mes, Imposto: l.imposto, Codigo: l.codigo, Taxa: l.taxa, Isencao: l.isencao, Base: l.base.toFixed(2), Imposto_Liquidado: l.valor.toFixed(2), Documentos: l.documentos })))}><Download className="h-4 w-4" />CSV</Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir</Button>
          </div>
        </div>
        {!agregado.length ? <Vazio icone={Percent} titulo="Sem impostos no período" /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead className="border-b text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2 text-left">Imposto</th><th className="text-left">Código</th><th className="text-right">Taxa</th><th className="text-left">Isenção</th><th className="text-right">Base</th><th className="px-4 text-right">Imposto</th></tr></thead>
            <tbody className="divide-y">{agregado.map((l, i) => (
              <tr key={i}><td className="px-4 py-2 font-semibold">{l.imposto}</td><td>{l.codigo || '—'}</td><td className="text-right tabular-nums">{l.taxa}%</td><td className="font-mono">{l.isencao || '—'}</td>
                <td className="text-right tabular-nums">{formatCurrency(l.base)}</td><td className="px-4 text-right font-semibold tabular-nums">{formatCurrency(l.valor)}</td></tr>))}</tbody>
          </table></div>
        )}
      </Card>
      {meses.length > 1 && <Card className="overflow-hidden"><h3 className="border-b p-4 font-bold">Evolução mensal</h3>
        <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="px-4 py-2 text-left">Mês</th><th className="text-right">IVA</th><th className="text-right">Imposto de Selo</th><th className="px-4 text-right">Base</th></tr></thead>
          <tbody className="divide-y">{meses.map(m => (
            <tr key={m}><td className="px-4 py-1.5">{m}</td>
              <td className="text-right tabular-nums">{formatCurrency(soma(l => l.mes === m && l.imposto === 'IVA', 'valor'))}</td>
              <td className="text-right tabular-nums">{formatCurrency(soma(l => l.mes === m && l.imposto === 'IS', 'valor'))}</td>
              <td className="px-4 text-right tabular-nums">{formatCurrency(soma(l => l.mes === m, 'base'))}</td></tr>))}</tbody>
        </table></div></Card>}
      <Aviso tom="info">Este mapa apoia o apuramento. As declarações oficiais devem ser revistas e submetidas pelo contabilista certificado.</Aviso>
    </div>
  );
}
