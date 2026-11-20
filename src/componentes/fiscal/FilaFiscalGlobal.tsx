import { useEffect, useRef } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import { empresaDe, facturarPagamentos, iniciarFilaFiscal, obterConfig, pagamentosPorFacturar, pararFilaFiscal } from '@/servicos/ServicoFiscal';

/**
 * Corre a fila de comunicação à AGT em segundo plano enquanto a aplicação está aberta (não só na página
 * Relatórios Fiscais) e, se activado, factura automaticamente os pagamentos confirmados com juros ou mora.
 * Só arranca para quem tem a permissão «Documentos Fiscais».
 */
export function FilaFiscalGlobal() {
  const { user } = useAuth();
  const dados = useData();
  const ref = useRef(dados);
  ref.current = dados;
  const pode = Boolean(user && ServicoControloAcesso.temPermissao(user, 'manage_fiscal'));

  useEffect(() => {
    if (!pode || !user) return;
    iniciarFilaFiscal(async () => {
      const config = await obterConfig();
      const { companySettings, payments, credits, clients } = ref.current;
      const empresa = empresaDe(companySettings as any, config);
      if (!/^\d{10}$/.test(empresa.nif)) return null;
      return {
        config, empresa,
        automatico: async () => {
          const pendentes = await pagamentosPorFacturar(payments, credits, clients, config.dataAdesao);
          if (pendentes.length) await facturarPagamentos(pendentes.slice(0, 20), { config, empresa, user: { id: user.id, name: user.name, role: user.role } });
        },
      };
    });
    return () => pararFilaFiscal();
  }, [pode, user]);
  return null;
}
