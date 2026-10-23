import { useEffect, useState } from 'react';
import { ServicoRH } from '@/servicos/rh/ServicoRH';
import { valorNumerico, valorTexto } from '@/bibliotecas/rh/parametros-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';

export type ParametrosBI = { diasAviso: number; anosValidade: number; creditoExpirado: 'aviso' | 'bloqueio' };
export const PARAMETROS_BI_OMISSAO: ParametrosBI = { diasAviso: 90, anosValidade: 10, creditoExpirado: 'aviso' };

/** Regras da validade do BI dos clientes (Configurações de RH; valores por omissão sem o módulo). */
export function useParametrosBI(): ParametrosBI {
    const [parametros, setParametros] = useState(PARAMETROS_BI_OMISSAO);
    useEffect(() => {
        let cancelado = false;
        void ServicoRH.parametros().then(lista => {
            if (cancelado) return;
            const hoje = luandaTodayKey();
            setParametros({
                diasAviso: valorNumerico(lista, 'bi_dias_aviso', hoje, 90),
                anosValidade: valorNumerico(lista, 'bi_anos_validade', hoje, 10),
                creditoExpirado: valorTexto(lista, 'bi_credito_expirado', hoje, 'aviso') === 'bloqueio' ? 'bloqueio' : 'aviso',
            });
        });
        return () => { cancelado = true; };
    }, []);
    return parametros;
}
