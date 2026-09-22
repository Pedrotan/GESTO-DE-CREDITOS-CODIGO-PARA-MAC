export type AppAccount = {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    lastOpenedAt?: string;
    isDefault?: boolean;
    dbExists?: boolean;
};

export type AccountsListResult = {
    activeAccountId: string;
    accounts: AppAccount[];
};

export const ACTIVE_ACCOUNT_STORAGE_KEY = 'tango_active_account_id';

export const getActiveAccountIdFromStorage = () => {
    if (typeof localStorage === 'undefined') return 'default';
    return localStorage.getItem(ACTIVE_ACCOUNT_STORAGE_KEY) || 'default';
};

export const scopedStorageKey = (key: string, accountId = getActiveAccountIdFromStorage()) => `${key}:${accountId}`;

export const getScopedLocalStorageItem = (key: string) => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(scopedStorageKey(key));
};

export const setScopedLocalStorageItem = (key: string, value: string) => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(scopedStorageKey(key), value);
};

export const removeScopedLocalStorageItem = (key: string) => {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(scopedStorageKey(key));
};

const clearAccountRuntimeState = (nextAccountId: string) => {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
    }

    if (typeof localStorage === 'undefined') return;

    localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, nextAccountId);

    [
        'cached_company_settings',
        'sync_enabled',
        'sync_url',
        'sync_passkey',
        'is_master',
        'user_last_context'
    ].forEach(key => localStorage.removeItem(key));
};

const reloadAfterAccountSwitch = () => {
    if (typeof window === 'undefined') return;
    window.setTimeout(() => window.location.reload(), 120);
};

export const listAppAccounts = async (): Promise<AccountsListResult> => {
    const api = (window as any).electronAPI;
    if (!api?.listAccounts) {
        const fallback = {
            activeAccountId: getActiveAccountIdFromStorage(),
            accounts: [{
                id: getActiveAccountIdFromStorage(),
                name: 'Conta Principal',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isDefault: true,
                dbExists: true
            }]
        };
        return fallback;
    }

    const result = await api.listAccounts();
    if (result?.activeAccountId) {
        localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, result.activeAccountId);
    }
    return result;
};

export const createAppAccount = async (name: string) => {
    const api = (window as any).electronAPI;
    if (!api?.createAccount) {
        throw new Error('Gestão de contas está disponível apenas no aplicativo desktop.');
    }

    const result = await api.createAccount(name);
    if (!result?.success) {
        throw new Error(result?.error || 'Não foi possível criar a conta.');
    }

    const newAccountId = result.account?.id;
    if (!newAccountId) {
        throw new Error('A conta foi criada, mas o identificador não foi devolvido.');
    }

    const switchResult = await api.switchAccount(newAccountId);
    if (!switchResult?.success) {
        throw new Error(switchResult?.error || 'A conta foi criada, mas não foi possível abri-la.');
    }

    clearAccountRuntimeState(newAccountId);
    reloadAfterAccountSwitch();

    return { ...result, relaunching: false, reloadRequired: true };
};

export const switchAppAccount = async (accountId: string) => {
    const api = (window as any).electronAPI;
    if (!api?.switchAccount) {
        throw new Error('Gestão de contas está disponível apenas no aplicativo desktop.');
    }

    const result = await api.switchAccount(accountId);
    if (!result?.success) {
        throw new Error(result?.error || 'Não foi possível alternar a conta.');
    }

    clearAccountRuntimeState(accountId);
    reloadAfterAccountSwitch();

    return result;
};

export const deleteAppAccount = async (accountId: string, confirmation: string, backupAcknowledged: boolean) => {
    const api = (window as any).electronAPI;
    if (!api?.deleteAccount) {
        throw new Error('Gestao de contas esta disponivel apenas no aplicativo desktop.');
    }

    const result = await api.deleteAccount(accountId, confirmation, backupAcknowledged);
    if (!result?.success) {
        throw new Error(result?.error || 'Nao foi possivel eliminar a conta.');
    }

    if (result.reloadRequired && result.activeAccountId) {
        clearAccountRuntimeState(result.activeAccountId);
        reloadAfterAccountSwitch();
    }

    return result;
};
