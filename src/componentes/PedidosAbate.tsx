import { useEffect, useState } from 'react';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { ServicoContabilidadeGeral, type AccountingRequest } from '@/servicos/ServicoContabilidadeGeral';
import { formatCurrency } from '@/bibliotecas/formatters';
export function PedidosAbate() {
    const {credits}=useData(),{user}=useAuth();
    const [requests,setRequests]=useState<AccountingRequest[]>([]),[creditId,setCreditId]=useState(''),[reason,setReason]=useState(''),[decisionReasons,setDecisionReasons]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
    const admin=['admin','super_admin'].includes(user?.role || '');
    const load=async()=>setRequests((await ServicoContabilidadeGeral.listRequests()).filter(r=>r.kind==='writeoff'));
    useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
    const action=async(work:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await work();await load();}catch(e:any){setError(e.message || 'Não foi possível concluir.');}finally{setBusy(false);}};
    const eligible=credits.filter(c=>!c.deletedAt && ['overdue','defaulted'].includes(c.status) && c.totalDue>0);
    return <div className="space-y-4"><h3 className="font-semibold">Abates de créditos incobráveis</h3>
        <p className="text-sm text-muted-foreground">O abate retira o ativo contabilístico e conserva a dívida e o histórico para cobrança futura. Não é um perdão ao cliente. Exige aprovação de outro administrador e usa provisões contabilizadas antes de reconhecer a perda restante.</p>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {admin && <div className="rounded-xl border p-4 space-y-3"><label>Crédito<select className="w-full rounded border bg-background p-2" value={creditId} onChange={e=>setCreditId(e.target.value)}><option value="">Selecione um crédito em atraso</option>{eligible.map(c=><option key={c.id} value={c.id}>{c.clientName} · {c.id} · {formatCurrency(c.totalDue)}</option>)}</select></label><label>Motivo do pedido<Input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Documente o motivo (mínimo 10 caracteres)" /></label>
            <Button disabled={busy || !creditId || reason.trim().length<10} onClick={()=>void action(async()=>{const c=credits.find(c=>c.id===creditId)!;await ServicoContabilidadeGeral.createRequest({kind:'writeoff',targetId:creditId,description:'Abate do crédito de '+c.clientName,reason},{id:user!.id,name:user!.name,role:user!.role});setReason('');})}>Pedir aprovação do abate</Button></div>}
        <Button variant="outline" disabled={busy} onClick={()=>void action(load)}>Atualizar pedidos</Button>
        {requests.map(r=><div className="rounded-xl border p-3 space-y-2" key={r.id}><strong>{r.description || r.targetId}</strong><p className="text-sm">Estado: {r.status==='pending'?'Pendente':r.status==='approved'?'Aprovado':'Rejeitado'} · Pedido por {r.requestedBy} em {new Date(r.requestedAt).toLocaleString('pt-AO')}</p><p className="text-sm">{r.reason}</p>{r.decidedBy && <p className="text-sm">Decidido por {r.decidedBy} · {r.decisionReason} · Lançamento: {r.resultEntryId || 'Sem lançamento'}</p>}
            {r.status==='pending' && admin && r.requestedById!==user?.id && <><Input aria-label={'Motivo da decisão '+r.id} value={decisionReasons[r.id] || ''} onChange={e=>setDecisionReasons(prev=>({...prev,[r.id]:e.target.value}))} placeholder="Motivo da decisão (mínimo 10 caracteres)" /><div className="flex gap-2">{[true,false].map(approve=><Button key={String(approve)} variant={approve?'default':'outline'} disabled={busy || (decisionReasons[r.id] || '').trim().length<10} onClick={()=>void action(()=>ServicoContabilidadeGeral.decideRequest(r,approve,decisionReasons[r.id],{id:user!.id,name:user!.name,role:user!.role},{reversePayment:async()=>{throw new Error('Este painel só decide abates.');}}))}>{approve?'Aprovar e contabilizar':'Rejeitar'}</Button>)}</div></>}
            {r.status==='pending' && r.requestedById===user?.id && <p className="text-sm text-muted-foreground">Outro administrador deve decidir este pedido.</p>}
        </div>)}
        {!requests.length && <p>Sem pedidos de abate registados.</p>}
    </div>;
}