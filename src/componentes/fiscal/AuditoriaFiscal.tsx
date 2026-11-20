import { useEffect, useState } from 'react';
import { Network, ScrollText } from 'lucide-react';
import { Card } from '@/componentes/ui/card';
import { Button } from '@/componentes/ui/button';
import { eventosFiscais, listarChamadas } from '@/servicos/ServicoFiscal';
import { Vazio } from './comum';
import { dataHoraPt } from './apoio';

export default function AuditoriaFiscal() {
  const [vista, setVista] = useState<'eventos' | 'agt'>('eventos');
  const [eventos, setEventos] = useState<Awaited<ReturnType<typeof eventosFiscais>>>([]);
  const [chamadas, setChamadas] = useState<Awaited<ReturnType<typeof listarChamadas>>>([]);
  useEffect(() => {
    if (vista === 'eventos') eventosFiscais().then(setEventos).catch(() => setEventos([]));
    else listarChamadas().then(setChamadas).catch(() => setChamadas([]));
  }, [vista]);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div><h3 className="flex items-center gap-2 font-bold"><ScrollText className="h-4 w-4" />Auditoria fiscal</h3><p className="text-xs text-muted-foreground">Registo imutável das operações fiscais e das comunicações com a AGT</p></div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <Button size="sm" variant={vista === 'eventos' ? 'secondary' : 'ghost'} onClick={() => setVista('eventos')}>Operações</Button>
          <Button size="sm" variant={vista === 'agt' ? 'secondary' : 'ghost'} onClick={() => setVista('agt')}>Chamadas à AGT</Button>
        </div>
      </div>
      {vista === 'eventos' ? (!eventos.length ? <Vazio icone={ScrollText} titulo="Ainda sem operações fiscais" /> : (
        <ul className="divide-y">{eventos.map(e => (
          <li key={e.id} className="grid gap-1 px-4 py-2.5 text-xs sm:grid-cols-[150px_1fr_160px]">
            <span className="text-muted-foreground">{dataHoraPt(e.timestamp)}</span>
            <span>{e.details.replace(/^Fiscal:\s*/, '')}</span>
            <span className="text-muted-foreground sm:text-right">{e.userName ?? 'Sistema'}</span>
          </li>))}</ul>
      )) : (!chamadas.length ? <Vazio icone={Network} titulo="Ainda sem chamadas à AGT" /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs">
          <thead className="border-b text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2 text-left">Data</th><th className="text-left">Serviço</th><th className="text-left">HTTP</th><th className="text-left">Resultado</th><th className="text-left">requestID</th><th className="text-right">Docs</th><th className="text-right">ms</th><th className="px-4 text-left">Erro</th></tr></thead>
          <tbody className="divide-y">{chamadas.map(c => {
            const docs = (() => { try { return JSON.parse(c.documentNos) as string[]; } catch { return []; } })();
            return (
              <tr key={c.id}>
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{dataHoraPt(c.createdAt)}</td>
                <td className="font-mono font-semibold">{c.service}</td>
                <td><span className={`rounded px-1.5 py-0.5 font-semibold ${c.httpStatus && c.httpStatus < 300 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>{c.httpStatus ?? 'rede'}</span></td>
                <td>{c.resultCode ?? '—'}</td><td className="font-mono">{c.requestId ?? '—'}</td>
                <td className="text-right" title={docs.join('\n')}>{docs.length}</td><td className="text-right tabular-nums">{c.durationMs ?? '—'}</td>
                <td className="max-w-[280px] truncate px-4 text-red-600" title={c.error ?? ''}>{c.error}</td>
              </tr>);
          })}</tbody>
        </table></div>
      ))}
    </Card>
  );
}
