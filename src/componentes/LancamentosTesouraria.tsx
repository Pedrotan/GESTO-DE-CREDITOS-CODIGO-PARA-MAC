import { useState } from 'react';
import { LimitesAprovacao } from './LimitesAprovacao';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
import { CHART_OF_ACCOUNTS } from '@/bibliotecas/plano-contas';
type Kind='capital_entry'|'loan_received'|'expense'|'transfer'|'provision'|'provision_release'|'custom';
const labels:Record<Kind,string>={capital_entry:'Entrada de capital',loan_received:'Financiamento obtido',expense:'Despesa',transfer:'Transferência caixa/banco',provision:'Constituição de provisões',provision_release:'Reversão de provisões',custom:'Lançamento livre'};
export function LancamentosTesouraria({onSaved}:{onSaved:()=>Promise<void>}) {
    const {user}=useAuth();const [kind,setKind]=useState<Kind>('capital_entry'),[amount,setAmount]=useState(''),[description,setDescription]=useState(''),[liquid,setLiquid]=useState<'cash'|'bank'>('bank'),[debit,setDebit]=useState('expenses'),[credit,setCredit]=useState('bank');
    const [busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[key,setKey]=useState(()=>crypto.randomUUID());
    const admin=['admin','super_admin'].includes(user?.role || '');
    const save=async()=>{
        if(!user || busy || !admin)return;setBusy(true);setError('');setNote('');
        try{const entry=await ServicoFinanceiro.registerJournalEntry({kind,amount:Number(amount),description,idempotencyKey:key,actorId:user.id,actorName:user.name,actorRole:user.role,liquidAccount:liquid,debitAccount:debit,creditAccount:credit});
            setNote('Lançamento '+entry.id+' registado. Correções exigem estorno.');setKey(crypto.randomUUID());setAmount('');setDescription('');await onSaved();}
        catch(e:any){setError(e.message || 'Não foi possível guardar.');}finally{setBusy(false);}
    };
    return <div className="space-y-3"><h3 className="font-semibold">Lançamentos de tesouraria e provisões</h3><p className="text-sm text-muted-foreground">Os movimentos geram partidas dobradas e respeitam períodos fechados e o saldo disponível quando o controlo está ativo. Provisões estimadas só afetam os resultados depois de serem contabilizadas aqui. Para despesas com comprovativo, use a página Despesas.</p>
        {error && <p role="alert" className="text-destructive">{error}</p>}{note && <p role="status">{note}</p>}
        {!admin?<p>Registo reservado a administradores.</p>:<><div className="grid gap-3 sm:grid-cols-2"><label>Operação<select disabled={busy} className="w-full rounded border bg-background p-2" value={kind} onChange={e=>{setKind(e.target.value as Kind);setKey(crypto.randomUUID());}}>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Valor (AOA)<Input disabled={busy} type="number" min="0.01" step="0.01" value={amount} onChange={e=>{setAmount(e.target.value);setKey(crypto.randomUUID());}} /></label>
            {['capital_entry','loan_received','expense'].includes(kind) && <label>Conta de disponibilidades<select className="w-full rounded border bg-background p-2" value={liquid} onChange={e=>setLiquid(e.target.value as 'cash'|'bank')}><option value="bank">Bancos</option><option value="cash">Caixa</option></select></label>}
            {kind==='transfer' && <label>Conta de origem<select className="w-full rounded border bg-background p-2" value={credit} onChange={e=>setCredit(e.target.value)}><option value="bank">Bancos → Caixa</option><option value="cash">Caixa → Bancos</option></select></label>}
            {kind==='custom' && <>{[['debit','Conta a débito'],['credit','Conta a crédito']].map(([side,label])=><label key={side}>{label}<select className="w-full rounded border bg-background p-2" value={side==='debit'?debit:credit} onChange={e=>side==='debit'?setDebit(e.target.value):setCredit(e.target.value)}>{CHART_OF_ACCOUNTS.filter(a=>!['portfolio','receivable_interest','receivable_late_interest','written_off_memo','written_off_memo_contra'].includes(a.account)).map(a=><option key={a.account} value={a.account}>{a.name}</option>)}</select></label>)}</>}
        </div><label>Descrição e motivo<Input disabled={busy} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descreva a origem e finalidade do movimento" /></label><Button disabled={busy || Number(amount)<=0 || !Number.isFinite(Number(amount)) || description.trim().length<5} onClick={()=>void save()}>{busy?'A guardar…':'Registar lançamento'}</Button></>}
    <LimitesAprovacao /></div>;
}
