import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '@/contextos/ContextoDados';
import { db } from '@/bibliotecas/bd';
import * as C from '@/bibliotecas/carteira-credito';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { buildContractRows, type ContractDocument, type ContractRow } from '@/bibliotecas/contratos-analise';
import { ServicoCarteira } from '@/servicos/ServicoCarteira';
import { ServicoConfigSimulador } from '@/servicos/ServicoConfigSimulador';
import type { Contract } from '@/tipos/credito';

/**
 * Dados da página de Contratos: os contratos visíveis do contexto, cada um com a linha da carteira (mesmo cálculo
 * da página de Créditos: saldo, atraso e liquidação a partir do plano de prestações) e os documentos do crédito.
 * Só lê da base; recarrega quando os créditos ou os pagamentos do contexto mudam.
 */
export function useContratos(contracts: Contract[], numbers: Map<string, string>) {
    const { credits: contextCredits, payments: contextPayments, allClients, clients, users } = useData() as any;
    const [data, setData] = useState<Awaited<ReturnType<typeof ServicoCarteira.loadPortfolioData>> | null>(null);
    const [documents, setDocuments] = useState<ContractDocument[]>([]);
    const [productNames, setProductNames] = useState<Map<string, string>>(new Map());
    const [version, setVersion] = useState(0);
    const today = luandaTodayKey();

    const reload = useCallback(() => setVersion(value => value + 1), []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [portfolio, docs] = await Promise.all([
                    ServicoCarteira.loadPortfolioData(),
                    db.all<ContractDocument>('SELECT creditId, kind, fileName, uploadedAt FROM credit_documents WHERE deletedAt IS NULL').catch(() => []),
                ]);
                if (cancelled) return;
                setData(portfolio);
                setDocuments(docs);
            } catch (error) {
                console.error('[Contratos] Falha ao carregar a carteira:', error);
            }
        })();
        return () => { cancelled = true; };
    }, [contextCredits, contextPayments, version]);
    useEffect(() => { void ServicoConfigSimulador.load().then(config => setProductNames(new Map(config.products.map(item => [item.id, item.name])))).catch(() => undefined); }, []);

    const clientList = useMemo(() => (allClients?.length ? allClients : clients) || [], [allClients, clients]);
    const installments: C.InstallmentRow[] = useMemo(() => data?.installments || [], [data]);
    const portfolio = useMemo(() => data ? C.buildPortfolio(data.credits, {
        installments: data.installments, payments: data.payments, legalCreditIds: data.legalCreditIds, writtenOffIds: data.writtenOffIds,
        escalatedIds: data.escalatedIds, clients: clientList, users: users || [], productOf: data.productOf, productNames, deletedCredits: data.deletedCredits,
    }) : [], [data, clientList, users, productNames]);

    const rows: ContractRow[] = useMemo(() => buildContractRows({ contracts, portfolio, installments, clients: clientList, numbers, documents, today }),
        [contracts, portfolio, installments, clientList, numbers, documents, today]);

    return { rows, installments, documents, loading: !data, reload, today, users: (users || []) as Array<{ id: string; name: string }> };
}
