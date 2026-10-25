import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Card } from '@/componentes/ui/card';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { obrigacoes, diasAte } from '@/bibliotecas/fiscal/obrigacoes';

interface Lembrete { id: string; titulo: string; data: string; nota?: string }
const CHAVE = 'tango.fiscal.lembretes';
const ler = (): Lembrete[] => { try { return JSON.parse(localStorage.getItem(CHAVE) ?? '[]'); } catch { return []; } };

export default function CalendarioFiscal() {
  const [lembretes, setLembretes] = useState<Lembrete[]>(ler);
  const [novo, setNovo] = useState({ titulo: '', data: '', nota: '' });
  useEffect(() => { try { localStorage.setItem(CHAVE, JSON.stringify(lembretes)); } catch { /* armazenamento indisponível */ } }, [lembretes]);

  const itens = useMemo(() => [
    ...obrigacoes().map(o => ({ ...o, proprio: false })),
    ...lembretes.map(l => ({ id: l.id, titulo: l.titulo, descricao: l.nota ?? '', data: new Date(`${l.data}T23:59`), recorrencia: 'personalizada' as const, base: 'Lembrete adicionado neste computador', proprio: true, verificar: false, aplicavel: undefined })),
  ].sort((a, b) => (a.recorrencia === 'continua' ? -1 : b.recorrencia === 'continua' ? 1 : +a.data - +b.data)), [lembretes]);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="overflow-hidden lg:col-span-2">
        <h3 className="flex items-center gap-2 border-b p-4 font-bold"><CalendarClock className="h-4 w-4" />Calendário fiscal</h3>
        <ul className="divide-y">{itens.map(o => {
          const continua = o.recorrencia === 'continua';
          const d = diasAte(o.data);
          return (
            <li key={o.id} className="flex gap-4 px-4 py-4">
              <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg text-center ${continua ? 'bg-sky-100 text-sky-800' : d <= 7 ? 'bg-red-100 text-red-700' : d <= 30 ? 'bg-amber-100 text-amber-800' : 'bg-muted'}`}>
                {continua ? <span className="text-[10px] font-bold">SEMPRE</span> : <div className="leading-none"><div className="text-base font-bold">{o.data.getDate()}</div><div className="text-[10px] uppercase">{o.data.toLocaleDateString('pt-AO', { month: 'short' })}</div></div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{o.titulo}</p>
                  {!continua && <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${d <= 7 ? 'bg-red-100 text-red-700' : d <= 30 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{d <= 0 ? 'hoje' : `faltam ${d} dias`}</span>}
                  {o.verificar && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">confirmar prazo</span>}</div>
                <p className="mt-1 text-xs text-muted-foreground">{o.descricao}</p>
                {o.aplicavel && <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><AlertTriangle className="h-3 w-3" />{o.aplicavel}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground/80">{o.base}{!continua && ` · ${o.data.toLocaleDateString('pt-AO')}`}</p>
              </div>
              {o.proprio && <Button size="icon" variant="ghost" aria-label="Remover lembrete" onClick={() => setLembretes(l => l.filter(x => x.id !== o.id))}><Trash2 className="h-4 w-4" /></Button>}
            </li>);
        })}</ul>
      </Card>
      <Card className="h-fit space-y-3 p-5">
        <h3 className="flex items-center gap-2 font-bold"><Plus className="h-4 w-4" />Adicionar lembrete</h3>
        <div><Label className="text-xs">Obrigação</Label><Input value={novo.titulo} onChange={e => setNovo({ ...novo, titulo: e.target.value })} placeholder="Ex.: pagamento de retenções" /></div>
        <div><Label className="text-xs">Data limite</Label><Input type="date" value={novo.data} onChange={e => setNovo({ ...novo, data: e.target.value })} /></div>
        <div><Label className="text-xs">Nota</Label><Input value={novo.nota} onChange={e => setNovo({ ...novo, nota: e.target.value })} /></div>
        <Button className="w-full gap-2" disabled={!novo.titulo || !novo.data} onClick={() => { setLembretes(l => [...l, { id: crypto.randomUUID(), ...novo }]); setNovo({ titulo: '', data: '', nota: '' }); }}><Plus className="h-4 w-4" />Adicionar</Button>
        <p className="text-[11px] text-muted-foreground">Os lembretes ficam guardados neste computador.</p>
      </Card>
    </div>
  );
}
