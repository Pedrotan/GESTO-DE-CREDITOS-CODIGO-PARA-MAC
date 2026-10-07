import { useEffect, useState } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { ServicoCobrancaOperacional } from '@/servicos/ServicoCobrancaOperacional';
import { customerPaymentScore, latestCollectionEvents, type CollectionEvent, type CollectionKind } from '@/bibliotecas/cobranca-operacional';
import { formatCurrency } from '@/bibliotecas/formatters';
import { getWhatsAppLink } from '@/bibliotecas/whatsapp';
import { toDateKey } from '@/bibliotecas/periodos';
const labels:Record<CollectionKind,string>={contact:'Contacto',promise:'Promessa de pagamento',promise_kept:'Promessa cumprida',promise_broken:'Promessa não cumprida',assignment:'Atribuição de gestor',target:'Meta mensal'};
export function CobrancaOperacional({installments,from,to}:{installments:any[];from:string;to:string}) {
    const {user,users}=useAuth(); const {credits,clients,payments}=useData();
    const [events,setEvents]=useState<CollectionEvent[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
    const [selected,setSelected]=useState(''),[kind,setKind]=useState<CollectionKind>('contact'),[notes,setNotes]=useState('');
    const [agent,setAgent]=useState(''),[amount,setAmount]=useState(''),[date,setDate]=useState(toDateKey(new Date())),[month,setMonth]=useState(from.slice(0,7)),[related,setRelated]=useState('');
    const [agentFilter,setAgentFilter]=useState('');
    const load=async()=>setEvents(await ServicoCobrancaOperacional.list());
    useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
    const assignments=latestCollectionEvents(events,'assignment'),targets=latestCollectionEvents(events,'target');
    const admin=['admin','super_admin'].includes(user?.role || '');
    const active=credits.filter(c=>!c.deletedAt && !['pending_approval','rejected','cancelled'].includes(c.status));
    const assigned=(id:string,origin?:string)=>assignments.get(id)?.agentId || origin || 'Não atribuído';
    const agentName=(id:string)=>users.find(u=>u.id===id)?.name || events.find(e=>e.agentId===id)?.agentName || id;
    const save=async()=>{
        if(!user || busy) return; setBusy(true);setError('');
        try {await ServicoCobrancaOperacional.record({creditId:kind==='target'?undefined:selected,kind,notes,agentId:agent || undefined,agentName:users.find(u=>u.id===agent)?.name,
            monthKey:kind==='target'?month:undefined,amount:['promise','target'].includes(kind)?Number(amount):undefined,promisedDate:kind==='promise'?date:undefined,
            relatedId:related || undefined},{id:user.id,name:user.name,role:user.role});await load();setNotes('');setAmount('');}
        catch(e:any){setError(e.message || 'Não foi possível guardar.');}finally{setBusy(false);}
    };
    const queue=[...active].filter(c=>c.daysOverdue>0 && c.totalDue>0 && (!agentFilter || assigned(c.id,c.requestedBy || c.usuario_id)===agentFilter)).sort((a,b)=>b.daysOverdue-a.daysOverdue || b.totalDue-a.totalDue);
    const agents=Array.from(new Set(active.map(c=>assigned(c.id,c.requestedBy || c.usuario_id)).concat(events.filter(e=>e.kind==='target').map(e=>e.agentId || '')))).filter(Boolean);
    const scores=new Map(clients.map(client=>{
        const ids=new Set(active.filter(c=>c.clientId===client.id).map(c=>c.id));
        return [client.id,customerPaymentScore(installments.filter(i=>ids.has(i.creditId)),toDateKey(new Date()))] as const;
    }));
    const pendingPromises=events.filter(e=>e.kind==='promise' && !events.some(done=>done.relatedId===e.id && ['promise_kept','promise_broken'].includes(done.kind)));
    const reminders=installments.filter(i=>{
        const delta=Math.round((Date.parse(i.dueDate.slice(0,10))-Date.parse(toDateKey(new Date())))/86400000);
        const remaining=Number(i.principalMinor)+Number(i.interestMinor)+Number(i.lateInterestMinor || 0)-Number(i.paidPrincipalMinor || 0)-Number(i.paidInterestMinor || 0)-Number(i.paidLateInterestMinor || 0);
        return [3,-1].includes(delta) && remaining>0 && active.some(c=>c.id===i.creditId);
    });
    return <div className="space-y-5">
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-3 items-center"><h3 className="font-semibold">Fila diária de cobrança</h3><select className="rounded border bg-background p-2" aria-label="Filtrar gestor" value={agentFilter} onChange={e=>setAgentFilter(e.target.value)}><option value="">Todos os gestores</option>{agents.map(id=><option key={id} value={id}>{agentName(id)}</option>)}</select><Button variant="outline" disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))}>Atualizar histórico</Button></div>
        {queue.length===0 && <p className="text-muted-foreground">Sem créditos em atraso no filtro selecionado.</p>}
        {queue.map(c=>{
            const score=scores.get(c.clientId);
            return <div className="rounded-xl border p-3" key={c.id}><div className="flex flex-wrap justify-between gap-2"><p><strong>{c.clientName}</strong> · {c.daysOverdue} dias · {formatCurrency(c.totalDue)}</p><Button variant="outline" onClick={()=>{setSelected(c.id);setKind('contact');}}>Registar contacto</Button></div>
                <p className="text-sm text-muted-foreground">Gestor: {agentName(assigned(c.id,c.requestedBy || c.usuario_id))} · Crédito {c.id}</p><p className="text-sm">Classificação interna: {score?.score==null?'Histórico insuficiente':score.score+'/100 · '+score.label} · {score?.observed || 0} prestações observadas</p></div>;
        })}
        <div className="rounded-xl border p-4 space-y-3"><h3 className="font-semibold">Registar ação de cobrança</h3><div className="grid gap-3 sm:grid-cols-2">
            <label>Ação<select className="w-full rounded border bg-background p-2" value={kind} onChange={e=>setKind(e.target.value as CollectionKind)}>{Object.entries(labels).filter(([key])=>admin || !['assignment','target'].includes(key)).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
            {kind!=='target' && <label>Crédito<select className="w-full rounded border bg-background p-2" value={selected} onChange={e=>{setSelected(e.target.value);setRelated('');}}><option value="">Selecione um crédito</option>{active.map(c=><option key={c.id} value={c.id}>{c.clientName} · {c.id}</option>)}</select></label>}
            {['assignment','target'].includes(kind) && <label>Gestor<select className="w-full rounded border bg-background p-2" value={agent} onChange={e=>setAgent(e.target.value)}><option value="">Selecione um gestor</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
            {['promise','target'].includes(kind) && <label>Valor (AOA)<Input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} /></label>}
            {kind==='promise' && <label>Data prometida<Input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>}
            {kind==='target' && <label>Mês da meta<Input type="month" value={month} onChange={e=>setMonth(e.target.value)} /></label>}
            {['promise_kept','promise_broken'].includes(kind) && <label>Promessa<select className="w-full rounded border bg-background p-2" value={related} onChange={e=>setRelated(e.target.value)}><option value="">Selecione uma promessa</option>{pendingPromises.filter(e=>e.creditId===selected).map(e=><option key={e.id} value={e.id}>{e.promisedDate} · {formatCurrency((e.amountMinor || 0)/100)}</option>)}</select></label>}
        </div><label>Notas e motivo<Input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Resultado do contacto, compromisso ou motivo" /></label><Button disabled={busy || notes.trim().length<5 || (kind!=='target' && !selected)} onClick={()=>void save()}>{busy?'A guardar…':'Guardar no histórico'}</Button></div>
        <h3 className="font-semibold">Promessas pendentes ({pendingPromises.length})</h3>
        {pendingPromises.map(e=><p key={e.id} className="text-sm border-t py-2">{credits.find(c=>c.id===e.creditId)?.clientName || e.creditId} · {e.promisedDate} · {formatCurrency((e.amountMinor || 0)/100)} · {e.notes}</p>)}
        <h3 className="font-semibold">Metas e desempenho no período {from} a {to}</h3>
        {agents.map(id=>{
            const own=active.filter(c=>assigned(c.id,c.requestedBy || c.usuario_id)===id),ids=new Set(own.map(c=>c.id));
            const collected=payments.filter(p=>ids.has(p.creditId) && p.status==='confirmed' && !p.deletedAt && toDateKey(new Date(p.paymentDate))>=from && toDateKey(new Date(p.paymentDate))<=to).reduce((s,p)=>s+Math.round(p.amount*100),0);
            const target=targets.get(id+':'+from.slice(0,7))?.amountMinor;
            const open=own.filter(c=>c.totalDue>0);
            const granted=own.filter(c=>toDateKey(new Date(c.createdAt))>=from && toDateKey(new Date(c.createdAt))<=to);
            return <div key={id} className="rounded border p-3 text-sm"><strong>{agentName(id)}</strong> · Concedidos: {granted.length} · Cobrado: {formatCurrency(collected/100)} · Taxa de atraso: {open.length?(100*open.filter(c=>c.daysOverdue>0).length/open.length).toFixed(1):'0'}%
                <p>Meta de {from.slice(0,7)}: {target==null?'Não definida':formatCurrency(target/100)}{target && from.slice(0,7)===to.slice(0,7)?' · Cumprimento: '+(100*collected/target).toFixed(1)+'%':''}</p></div>;
        })}
        <h3 className="font-semibold">Lembretes preparados: 3 dias antes e 1.º dia de atraso</h3><p className="text-sm text-muted-foreground">Sem fornecedor de mensagens configurado, o sistema prepara a lista. Abrir o WhatsApp exige confirmação do envio no próprio WhatsApp.</p>
        {reminders.map(i=>{
            const c=credits.find(c=>c.id===i.creditId),client=clients.find(x=>x.id===c?.clientId);
            const message='Olá '+(client?.name || c?.clientName)+'. Recordamos a prestação com vencimento em '+i.dueDate.slice(0,10)+'. Consulte o seu plano de pagamento ou contacte a nossa equipa.';
            return <div key={i.id} className="border-t py-2 text-sm">{client?.name || c?.clientName} · {i.dueDate.slice(0,10)}{client?.phone && <a className="ml-3 underline text-primary" href={getWhatsAppLink(client.phone,message)} target="_blank" rel="noopener noreferrer">Preparar no WhatsApp</a>}</div>;
        })}
        <details><summary className="cursor-pointer font-semibold">Histórico de cobrança ({events.length})</summary>{events.map(e=><p className="border-t py-2 text-sm" key={e.id}>{new Date(e.createdAt).toLocaleString('pt-AO')} · {e.actorName} · {labels[e.kind]} · {credits.find(c=>c.id===e.creditId)?.clientName || e.agentName} · {e.notes}</p>)}</details>
        <p className="text-xs text-muted-foreground">Classificação: 100 − 60 × proporção de prestações vencidas ainda não liquidadas − 40 × atraso máximo/90 (limitado a 90 dias). Usa prestações observadas, incluindo pagas com atraso. É apoio interno e não decide a concessão. Desempenho atribuído ao gestor atual; o histórico conserva atribuições anteriores.</p>
    </div>;
}