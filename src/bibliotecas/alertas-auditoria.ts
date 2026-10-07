import type { Finding } from './controlo-contabilistico';
type AuditRow = {id:string;timestamp:string;userId?:string;userName?:string;entity?:string;previousState?:string;newState?:string;metadata?:string};
type EntryRow = {id:string;type:string;timestamp:string;usuario_id?:string};
const objectOf=(value?:string):Record<string,unknown>=>{try { const parsed=JSON.parse(value || '{}');return parsed && typeof parsed==='object' && !Array.isArray(parsed)?parsed:{}; } catch {return {};}};
export function auditRiskFindings(logs: AuditRow[], entries: EntryRow[]): Finding[] {
    const findings:Finding[]=[];
    for(const log of logs) {
        const before=objectOf(log.previousState), after=objectOf(log.newState), metadata=objectOf(log.metadata);
        if(metadata.periodId && typeof metadata.reason==='string') findings.push({id:'audit-reopen:'+log.id,severity:'warning',entityId:log.id,message:'Reabertura de período '+metadata.periodId+' por '+(log.userName || log.userId || 'utilizador')+'. Rever a justificação.'});
        if(log.entity==='credit' && metadata.decision==='approved' && before.requestedBy && before.requestedBy===log.userId)
            findings.push({id:'audit-self-approval:'+log.id,severity:'error',entityId:log.id,message:'O mesmo utilizador solicitou e aprovou o crédito. Rever segregação de funções.'});
        if(log.entity==='credit' && before.status && !['pending_approval','rejected','cancelled'].includes(String(before.status))) {
            const changed=['interestRate','principalAmountMinor','principalAmount'].filter(key=>before[key]!==undefined && after[key]!==undefined && before[key]!==after[key]);
            if(changed.length) findings.push({id:'audit-credit-change:'+log.id,severity:'warning',entityId:log.id,message:'Taxa ou capital alterados num crédito já concedido. Rever motivo, autorização e lançamentos.'});
            const beforeInterest=Number(before.outstandingInterestMinor), afterInterest=Number(after.outstandingInterestMinor);
            if(Number.isFinite(beforeInterest) && Number.isFinite(afterInterest) && afterInterest<beforeInterest && metadata.operation==='adjustment')
                findings.push({id:'audit-discount:'+log.id,severity:'warning',entityId:log.id,message:'Redução manual de juros. Rever desconto e autorização.'});
        }
    }
    const reversals=new Map<string,EntryRow[]>();
    for(const entry of entries.filter(e=>e.type==='reversal' || e.type==='payment_reversal')) {
        const key=(entry.usuario_id || 'Não identificado')+':'+entry.timestamp.slice(0,10);
        reversals.set(key,[...(reversals.get(key)||[]),entry]);
    }
    for(const [key,group] of reversals) if(group.length>=3) findings.push({id:'audit-reversals:'+key,severity:'warning',entityId:group[0].id,
        message:group.length+' estornos de pagamentos pelo mesmo operador no mesmo dia. Limiar de revisão: 3; não constitui prova de irregularidade.'});
    return findings;
}