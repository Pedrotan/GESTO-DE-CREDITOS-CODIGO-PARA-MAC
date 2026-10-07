import { useEffect } from 'react';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { getScopedLocalStorageItem, setScopedLocalStorageItem } from '@/bibliotecas/contas';
import { ServicoIntegridadeContabilistica } from '@/servicos/ServicoIntegridadeContabilistica';

let running = false;
export function VerificacaoContabilisticaDiaria() {
    const { isDataLoading, addNotification } = useData();
    const { user } = useAuth();
    useEffect(() => {
        if (isDataLoading || !user || !['admin','super_admin','manager'].includes(user.role)) return;
        let cancelled = false;
        const check = async () => {
            const now = new Date();
            const day = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
            if (running || cancelled || getScopedLocalStorageItem('accounting_daily_check') === day) return;
            running = true;
            try {
                const report = await ServicoIntegridadeContabilistica.scan();
                if (cancelled) return;
                if (report.findings.length) await addNotification({ id: crypto.randomUUID(), userId: user.id,
                    title: 'Divergências contabilísticas', message: report.findings.length + ' alertas identificados na verificação diária. Consulte Contabilidade e Auditoria.',
                    type: 'warning', read: false, timestamp: new Date(), source: 'system' });
                setScopedLocalStorageItem('accounting_daily_report', JSON.stringify({ checkedAt: report.checkedAt, findings: report.findings }));
                setScopedLocalStorageItem('accounting_daily_check', day);
            } catch (error: any) {
                if (!cancelled && getScopedLocalStorageItem('accounting_daily_failure') !== day) {
                    await addNotification({ id: crypto.randomUUID(),userId:user.id,title:'Falha na verificação contabilística',
                        message:error.message || 'Não foi possível concluir a verificação diária.',type:'error',read:false,timestamp:new Date(),source:'system' });
                    setScopedLocalStorageItem('accounting_daily_failure',day);
                }
            } finally { running=false; }
        };
        void check();
        const interval=setInterval(()=>{ void check(); }, 5*60*1000);
        return ()=>{ cancelled=true; clearInterval(interval); };
    },[isDataLoading,user,addNotification]);
    return null;
}