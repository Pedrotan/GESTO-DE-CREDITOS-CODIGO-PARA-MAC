import { useEffect } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { db } from '@/bibliotecas/bd';
import { toDateKey } from '@/bibliotecas/periodos';
import { latestCollectionEvents } from '@/bibliotecas/cobranca-operacional';
import { ServicoCobrancaOperacional } from '@/servicos/ServicoCobrancaOperacional';
let running=false;
export function LembretesCobranca() {
    const {user}=useAuth(),{credits,isDataLoading,addNotification}=useData();
    useEffect(()=>{
        if(!user || isDataLoading || !['admin','super_admin','manager'].includes(user.role))return;
        let stopped=false;
        const check=async()=>{
            if(running || stopped)return;running=true;
            try{
                const day=toDateKey(new Date()),id='collection-reminder:'+user.id+':'+day;
                if(await db.get('SELECT id FROM notifications WHERE id = ?',[id]))return;
                const assignments=latestCollectionEvents(await ServicoCobrancaOperacional.list(),'assignment');
                const allowed=new Set(credits.filter(c=>!c.deletedAt && !['pending_approval','rejected','cancelled','paid'].includes(c.status) &&
                    (user.role!=='manager' || (assignments.get(c.id)?.agentId || c.requestedBy || c.usuario_id)===user.id)).map(c=>c.id));
                const schedule=await db.all<any>('SELECT creditId,dueDate,principalMinor,interestMinor,lateInterestMinor,paidPrincipalMinor,paidInterestMinor,paidLateInterestMinor FROM credit_installments');
                const candidates=schedule.filter(i=>{
                    const delta=Math.round((Date.parse(String(i.dueDate).slice(0,10))-Date.parse(day))/86400000);
                    const remaining=Number(i.principalMinor)+Number(i.interestMinor)+Number(i.lateInterestMinor || 0)-Number(i.paidPrincipalMinor || 0)-Number(i.paidInterestMinor || 0)-Number(i.paidLateInterestMinor || 0);
                    return allowed.has(i.creditId) && [3,-1].includes(delta) && remaining>0;
                });
                if(candidates.length && !stopped)await addNotification({id,userId:user.id,title:'Lembretes de cobrança preparados',message:candidates.length+' prestações a vencer em 3 dias ou no primeiro dia de atraso. Consulte Cobrança e gestores em Contabilidade para preparar os contactos.',type:'warning',source:'system',read:false,timestamp:new Date()});
            }catch(error){console.warn('[Cobrança] Não foi possível preparar os lembretes internos.',error instanceof Error?error.message:'Erro de leitura');}
            finally{running=false;}
        };
        void check();const interval=setInterval(()=>void check(),30*60*1000);return()=>{stopped=true;clearInterval(interval);};
    },[user,credits,isDataLoading,addNotification]);
    return null;
}