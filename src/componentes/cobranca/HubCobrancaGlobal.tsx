import { useEffect, useRef } from 'react';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
export function HubCobrancaGlobal() {
  const dados = useData(), { user } = useAuth(), ref = useRef(dados);
  ref.current = dados;
  useEffect(() => {
    if (!user || dados.isDataLoading || !localStorage.getItem('tango_active_tenant_id')) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try { const { cicloHub } = await import('@/servicos/AgendadorHubCobranca'); if (!stopped) await cicloHub(ref.current, user); }
      catch (error) { console.debug('[Hub] Fila aguardando ligação/configuração:', (error as Error).message); }
    };
    void tick(); const timer = setInterval(() => void tick(), 60000);
    return () => { stopped = true; clearInterval(timer); };
  }, [user, dados.isDataLoading]);
  return null;
}
