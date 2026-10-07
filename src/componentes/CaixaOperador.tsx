import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { ServicoCaixa, type CashSession } from '@/servicos/ServicoCaixa';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { formatCurrency } from '@/bibliotecas/formatters';
export function CaixaOperador() {
    const { user }=useAuth();
    const [session,setSession]=useState<CashSession>();
    const [history,setHistory]=useState<CashSession[]>([]);
    const [opening,setOpening]=useState('');
    const [counted,setCounted]=useState('');
    const [reason,setReason]=useState('');
    const [expected,setExpected]=useState(0);
    const [busy,setBusy]=useState(false);
    const [error,setError]=useState('');
    const refresh=useCallback(async()=>{
        if (!user) return;
        const now=new Date(), day=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
        const current=await ServicoCaixa.current(user.id,day);
        setSession(current); setHistory(await ServicoCaixa.list(user.id));
        setExpected(current?.status==='open'?await ServicoCaixa.expected(current):Number(current?.expectedMinor || 0));
    },[user]);
    useEffect(()=>{ void refresh().catch(e=>setError(e.message)); },[refresh]);
    const run=async(operation:()=>Promise<void>)=>{
        if (busy) return;
        setBusy(true); setError('');
        try { await operation(); await refresh(); }
        catch(e:any) { setError(e.message || 'Operação de caixa não concluída.'); }
        finally { setBusy(false); }
    };
    if (!user) return null;
    return <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Caixa de {user.name}. A abertura regista o dinheiro contado, sem criar receita. O movimento esperado usa apenas lançamentos em caixa atribuídos ao operador após a abertura.</p>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {!session && <div className="flex flex-wrap gap-3"><Input type="number" min="0" step="0.01" aria-label="Saldo inicial de caixa" placeholder="Saldo inicial contado (AOA)" value={opening} onChange={e=>setOpening(e.target.value)} className="max-w-xs" />
            <Button disabled={busy || !opening} onClick={()=>void run(async()=>{
                const now=new Date(),day=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
                await ServicoCaixa.open(user.id,user.name,Number(opening),day);
            })}>Abrir caixa</Button></div>}
        {session?.status==='open' && <div className="space-y-3"><p className="font-semibold">Saldo inicial: {formatCurrency(session.openingMinor/100)} · Saldo esperado: {formatCurrency(expected/100)}</p>
            <Input type="number" min="0" step="0.01" aria-label="Saldo contado de caixa" placeholder="Saldo contado (AOA)" value={counted} onChange={e=>setCounted(e.target.value)} className="max-w-xs" />
            <Input aria-label="Justificação da diferença de caixa" placeholder="Justifique qualquer diferença (mínimo 10 caracteres)" value={reason} onChange={e=>setReason(e.target.value)} />
            <div className="flex gap-3"><Button disabled={busy || !counted} onClick={()=>void run(()=>ServicoCaixa.close(session,Number(counted),reason))}>Fechar caixa</Button>
                <Button variant="outline" disabled={busy} onClick={()=>void run(refresh)}>Atualizar saldo esperado</Button></div></div>}
        {session?.status==='closed' && <p className="rounded-lg bg-muted p-3">Caixa de hoje fechado. O fecho e o histórico são imutáveis.</p>}
        <div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{['Dia','Estado','Inicial','Esperado','Contado','Diferença','Justificação'].map(v=><th key={v} className="p-2 text-left">{v}</th>)}</tr></thead>
            <tbody>{history.map(item=><tr key={item.id} className="border-t"><td className="p-2">{item.sessionDate}</td><td>{item.status==='closed'?'Fechado':'Aberto'}</td><td>{formatCurrency(item.openingMinor/100)}</td>
                <td>{item.expectedMinor==null?'—':formatCurrency(item.expectedMinor/100)}</td><td>{item.countedMinor==null?'—':formatCurrency(item.countedMinor/100)}</td>
                <td>{item.countedMinor==null?'—':formatCurrency((item.countedMinor-Number(item.expectedMinor))/100)}</td><td>{item.reason || '—'}</td></tr>)}</tbody></table></div>
    </div>;
}