import { db } from '@/bibliotecas/bd';
import { ServicoDefinicoesPartilhadas } from '@/servicos/ServicoDefinicoesPartilhadas';
import { deriveContractPrefix, normalizeContractPrefix, setContractNumbering } from '@/bibliotecas/pagamentos-analise';

// O que sai da contabilidade quando um cliente ou um contrato é eliminado, e a numeração dos contratos.
//
// Os lançamentos contabilísticos são imutáveis (triggers, cadeia de hashes e selos): não se apagam linhas, o que
// partiria a auditoria e criaria divergências em todos os computadores. Em vez disso, os lançamentos de um cliente
// ou crédito eliminado (com «Contabilidade» marcada) ou apagado definitivamente deixam de entrar no diário, no
// balancete e nos relatórios. Cada lançamento é equilibrado, por isso o balancete continua certo. Se o cliente ou
// o crédito for restaurado, os lançamentos voltam a aparecer.

export const ACCOUNTING_HIDDEN_KEY = 'accounting_hidden_v1';
export const CONTRACT_PREFIX_KEY = 'contract_number_prefix';

type HiddenList = { clients: string[]; credits: string[] };
type Removal = { clients: Set<string>; credits: Set<string> };

let removal: Removal = { clients: new Set(), credits: new Set() };

const readHiddenList = async (): Promise<HiddenList> => {
    try {
        const parsed = JSON.parse((await ServicoDefinicoesPartilhadas.get(ACCOUNTING_HIDDEN_KEY)) || 'null');
        return { clients: Array.isArray(parsed?.clients) ? parsed.clients : [], credits: Array.isArray(parsed?.credits) ? parsed.credits : [] };
    } catch {
        return { clients: [], credits: [] };
    }
};

const cachedCompanyName = () => {
    try {
        const account = localStorage.getItem('tango_active_account_id') || 'default';
        const saved = localStorage.getItem(`cached_company_settings:${account}`) || localStorage.getItem('company_settings');
        return saved ? String(JSON.parse(saved)?.name || '') : '';
    } catch {
        return '';
    }
};

const isPurged = (deletedBy?: string | null) => String(deletedBy || '').startsWith('purged:');

/** Conjuntos de clientes e créditos cujos lançamentos saem da contabilidade (função pura, para testes). */
export function computeAccountingRemoval(input: {
    deletedClients: Array<{ id: string; deletedBy?: string | null }>;
    deletedCredits: Array<{ id: string; clientId?: string | null; deletedBy?: string | null }>;
    hidden: HiddenList;
}): Removal {
    const hiddenClients = new Set(input.hidden.clients);
    const hiddenCredits = new Set(input.hidden.credits);
    const clients = new Set(input.deletedClients.filter(c => isPurged(c.deletedBy) || hiddenClients.has(c.id)).map(c => c.id));
    const credits = new Set(input.deletedCredits
        .filter(c => isPurged(c.deletedBy) || hiddenCredits.has(c.id) || (c.clientId && clients.has(c.clientId)))
        .map(c => c.id));
    return { clients, credits };
}

/** Carrega da base de dados a numeração dos contratos e o que saiu da contabilidade. */
export async function loadDataRemovalState(companyName?: string | null): Promise<void> {
    const [allCredits, deletedClients, deletedCredits, hidden, prefix] = await Promise.all([
        db.all<{ id: string; createdAt: string; startDate: string }>('SELECT id, createdAt, startDate FROM credits'),
        db.all<{ id: string; deletedBy: string }>('SELECT id, deletedBy FROM clients WHERE deletedAt IS NOT NULL'),
        db.all<{ id: string; clientId: string; deletedBy: string }>('SELECT id, clientId, deletedBy FROM credits WHERE deletedAt IS NOT NULL'),
        readHiddenList(),
        ServicoDefinicoesPartilhadas.get(CONTRACT_PREFIX_KEY).catch(() => null),
    ]);
    setContractNumbering({
        prefix: normalizeContractPrefix(prefix) || deriveContractPrefix(companyName || cachedCompanyName()),
        credits: (allCredits || []).map(c => ({ id: c.id, createdAt: c.createdAt as any, startDate: c.startDate as any })),
    });
    removal = computeAccountingRemoval({ deletedClients: deletedClients || [], deletedCredits: deletedCredits || [], hidden });
}

/** O lançamento (ou entrada do diário) pertence a um cliente ou crédito retirado da contabilidade. */
export const isRemovedFromAccounting = (entry: { clientId?: string | null; creditId?: string | null }) =>
    Boolean((entry.clientId && removal.clients.has(entry.clientId)) || (entry.creditId && removal.credits.has(entry.creditId)));

/** Marca clientes e/ou créditos para os lançamentos saírem da contabilidade (vale em todos os dispositivos). */
export async function hideFromAccounting(ids: { clients?: string[]; credits?: string[] }, userId?: string | null): Promise<void> {
    const current = await readHiddenList();
    const next: HiddenList = {
        clients: Array.from(new Set([...current.clients, ...(ids.clients || [])])),
        credits: Array.from(new Set([...current.credits, ...(ids.credits || [])])),
    };
    await ServicoDefinicoesPartilhadas.set(ACCOUNTING_HIDDEN_KEY, JSON.stringify(next), userId);
}

export async function saveContractPrefix(prefix: string, userId?: string | null): Promise<string> {
    const value = normalizeContractPrefix(prefix);
    await ServicoDefinicoesPartilhadas.set(CONTRACT_PREFIX_KEY, value, userId);
    return value;
}
