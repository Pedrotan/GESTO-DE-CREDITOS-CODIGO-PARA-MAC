import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '@/contextos/ContextoDados';
import { buildJournal, type JournalEntry } from '@/bibliotecas/relatorios-contabeis';
import type { AuditResult } from '@/bibliotecas/auditoria-contabil';
import type { SealVerification } from '@/bibliotecas/selo-contabilistico';
import { ServicoDefinicoesPartilhadas } from '@/servicos/ServicoDefinicoesPartilhadas';
import {
    DEFAULT_ACCOUNTING_CONFIG, ServicoContabilidadeGeral,
    type AccountingConfig, type AccountingRequest, type AuditRunRecord, type DailyCloseRecord, type LedgerSnapshot, type PanicLock,
} from '@/servicos/ServicoContabilidadeGeral';

export type AccountCatalog = Record<string, { code?: string; name?: string }>;

export type ContabilidadeState = {
    snapshot: LedgerSnapshot | null;
    journal: JournalEntry[];
    evaluation: AuditResult | null;
    seals: SealVerification | null;
    config: AccountingConfig;
    panic: PanicLock | null;
    runs: AuditRunRecord[];
    closes: DailyCloseRecord[];
    requests: AccountingRequest[];
    catalog: AccountCatalog;
    loading: boolean;
    error: string;
    loadedAt: string | null;
};

const EMPTY: ContabilidadeState = {
    snapshot: null, journal: [], evaluation: null, seals: null, config: DEFAULT_ACCOUNTING_CONFIG, panic: null,
    runs: [], closes: [], requests: [], catalog: {}, loading: true, error: '', loadedAt: null,
};

/**
 * Estado da página de Contabilidade: o razão completo (fonte única de verdade), a avaliação automática
 * das regras de auditoria (sem gravar), o histórico, os pedidos, os fechos e o congelamento. Recarrega
 * sozinho depois de qualquer movimento financeiro registado na aplicação.
 */
export function useContabilidade() {
    const { accountingEntries, payments, credits } = useData();
    const [state, setState] = useState<ContabilidadeState>(EMPTY);
    const loadingRef = useRef(false);
    const pendingRef = useRef(false);

    const load = useCallback(async () => {
        if (loadingRef.current) { pendingRef.current = true; return; }
        loadingRef.current = true;
        setState(previous => ({ ...previous, loading: true, error: '' }));
        try {
            const [{ result, snapshot, seals, config }, panic, runs, closes, requests, catalogRaw] = await Promise.all([
                ServicoContabilidadeGeral.evaluate('full'),
                ServicoContabilidadeGeral.getPanicLock(),
                ServicoContabilidadeGeral.listAuditRuns(300),
                ServicoContabilidadeGeral.listDailyCloses(),
                ServicoContabilidadeGeral.listRequests(),
                ServicoDefinicoesPartilhadas.get('accounting_account_catalog').catch(() => null),
            ]);
            let catalog: AccountCatalog = {};
            try { catalog = catalogRaw ? JSON.parse(catalogRaw) : {}; } catch { catalog = {}; }
            setState({
                snapshot, journal: buildJournal(snapshot.entries as any, snapshot.transactions as any, snapshot.lines as any),
                evaluation: result, seals, config, panic, runs, closes, requests, catalog,
                loading: false, error: '', loadedAt: new Date().toISOString(),
            });
        } catch (error: any) {
            setState(previous => ({ ...previous, loading: false, error: error?.message || 'Não foi possível carregar a contabilidade.' }));
        } finally {
            loadingRef.current = false;
            if (pendingRef.current) { pendingRef.current = false; void load(); }
        }
    }, []);

    // Recarrega (com um pequeno atraso) quando os lançamentos, pagamentos ou créditos mudam.
    useEffect(() => {
        const timer = window.setTimeout(() => { void load(); }, 400);
        return () => window.clearTimeout(timer);
    }, [load, accountingEntries, payments, credits]);

    // O congelamento pode vir de outro dispositivo pela sincronização: confirma-o periodicamente.
    useEffect(() => {
        const timer = window.setInterval(() => {
            void ServicoContabilidadeGeral.getPanicLock().then(panic => setState(previous =>
                JSON.stringify(previous.panic) === JSON.stringify(panic) ? previous : { ...previous, panic })).catch(() => undefined);
        }, 30_000);
        return () => window.clearInterval(timer);
    }, []);

    const hashStatus = useMemo(() => {
        const status = new Map<string, 'tampered' | 'chain' | 'unsealed' | 'no_lines'>();
        for (const finding of state.evaluation?.findings || []) {
            const entryRef = finding.references.find(reference => reference.kind === 'entry');
            if (!entryRef) continue;
            if (finding.rule === 'integrity_hash' || finding.rule === 'integrity_seal' || finding.rule === 'unbalanced_entry') status.set(entryRef.id, 'tampered');
            else if (finding.rule === 'integrity_chain' && !status.has(entryRef.id)) status.set(entryRef.id, 'chain');
            else if (finding.rule === 'unsealed_entry' && !status.has(entryRef.id)) status.set(entryRef.id, 'unsealed');
            else if (finding.rule === 'missing_double_entry' && !status.has(entryRef.id)) status.set(entryRef.id, 'no_lines');
        }
        return status;
    }, [state.evaluation]);

    return { ...state, reload: load, hashStatus };
}

export type ContabilidadeData = ReturnType<typeof useContabilidade>;
