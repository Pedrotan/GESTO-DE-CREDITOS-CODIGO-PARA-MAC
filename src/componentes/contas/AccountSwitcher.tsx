import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, Check, ChevronsUpDown, Download, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Checkbox } from '@/componentes/ui/checkbox';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/componentes/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/componentes/ui/dropdown-menu';
import { cn } from '@/bibliotecas/utils';
import { AppAccount, createAppAccount, deleteAppAccount, listAppAccounts, switchAppAccount } from '@/bibliotecas/contas';

type AccountSwitcherProps = {
    compact?: boolean;
    className?: string;
    showDelete?: boolean;
};

export function AccountSwitcher({ compact = false, className, showDelete = true }: AccountSwitcherProps) {
    const [accounts, setAccounts] = useState<AppAccount[]>([]);
    const [activeAccountId, setActiveAccountId] = useState('default');
    const [loading, setLoading] = useState(true);
    const [switching, setSwitching] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [newAccountName, setNewAccountName] = useState('');
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [backupAcknowledged, setBackupAcknowledged] = useState(false);
    const [accountToDelete, setAccountToDelete] = useState<AppAccount | null>(null);
    const [error, setError] = useState('');

    const activeAccount = useMemo(
        () => accounts.find(account => account.id === activeAccountId) || accounts[0],
        [accounts, activeAccountId]
    );

    const loadAccounts = async () => {
        try {
            setLoading(true);
            const result = await listAppAccounts();
            setAccounts(result.accounts || []);
            setActiveAccountId(result.activeAccountId || 'default');
        } catch (err: any) {
            setError(err?.message || 'Não foi possível carregar as contas.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAccounts();
    }, []);

    const handleSwitch = async (accountId: string) => {
        if (!accountId || accountId === activeAccountId || switching) return;
        try {
            setError('');
            setSwitching(true);
            await switchAppAccount(accountId);
        } catch (err: any) {
            setError(err?.message || 'Não foi possível trocar de conta.');
            setSwitching(false);
        }
    };

    const handleCreate = async () => {
        try {
            setError('');
            setSwitching(true);
            await createAppAccount(newAccountName.trim());
        } catch (err: any) {
            setError(err?.message || 'Não foi possível criar a conta.');
            setSwitching(false);
        }
    };

    const openDeleteDialog = (account: AppAccount) => {
        setError('');
        setAccountToDelete(account);
        setDeleteConfirmation('');
        setBackupAcknowledged(false);
        setDeleteOpen(true);
    };

    const handleDelete = async () => {
        if (!accountToDelete || deleting) return;
        try {
            setError('');
            setDeleting(true);
            await deleteAppAccount(accountToDelete.id, deleteConfirmation, backupAcknowledged);
            setDeleteOpen(false);
            setAccountToDelete(null);
            setDeleteConfirmation('');
            setBackupAcknowledged(false);
            await loadAccounts();
            setDeleting(false);
        } catch (err: any) {
            setError(err?.message || 'Não foi possível eliminar a conta.');
            setDeleting(false);
        }
    };

    const deleteMatches = accountToDelete
        ? deleteConfirmation.trim() === accountToDelete.name
        : false;
    const canDeleteAccount = deleteMatches && backupAcknowledged;

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size={compact ? 'sm' : 'default'}
                        className={cn(
                            'gap-2 border-blue-200 bg-blue-50/70 font-bold text-blue-800 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200',
                            compact ? 'h-9 max-w-[220px]' : 'h-11 max-w-full justify-between rounded-xl px-4',
                            className
                        )}
                        disabled={loading || switching}
                    >
                        {switching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                        <span className="min-w-0 truncate">
                            {loading ? 'A carregar contas...' : activeAccount?.name || 'Conta Principal'}
                        </span>
                        {!compact && <ChevronsUpDown className="h-4 w-4 opacity-70" />}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                    <DropdownMenuLabel className="flex items-center justify-between gap-2">
                        <span>Contas isoladas</span>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={loadAccounts}>
                            <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {accounts.map(account => (
                        <div
                            key={account.id}
                            className={cn(
                                'mx-1 flex items-start gap-2 rounded-lg px-2 py-2',
                                account.id === activeAccountId && 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
                            )}
                        >
                            <button
                                type="button"
                                onClick={() => handleSwitch(account.id)}
                                className="flex min-w-0 flex-1 items-start gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40"
                                disabled={switching || deleting || account.id === activeAccountId}
                            >
                                <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-bold">{account.name}</div>
                                    <div className="text-[11px] text-muted-foreground">
                                        {account.isDefault ? 'Banco principal existente' : 'Banco isolado'}
                                    </div>
                                </div>
                                {account.id === activeAccountId && <Check className="h-4 w-4 shrink-0" />}
                            </button>
                            {showDelete && !account.isDefault && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        openDeleteDialog(account);
                                    }}
                                    disabled={switching || deleting}
                                    title="Eliminar conta secundária"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={() => {
                            setError('');
                            setNewAccountName('');
                            setCreateOpen(true);
                        }}
                        className="cursor-pointer gap-3 rounded-lg px-3 py-3 font-bold text-blue-700"
                    >
                        <Plus className="h-4 w-4" />
                        Criar nova conta isolada
                    </DropdownMenuItem>
                    {error && (
                        <div className="px-3 py-2 text-xs font-semibold text-red-600">
                            {error}
                        </div>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Nova conta isolada</DialogTitle>
                        <DialogDescription>
                            Esta conta terá clientes, créditos, pagamentos, utilizadores e definições separados das outras contas.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="accountName">Nome da conta</Label>
                        <Input
                            id="accountName"
                            value={newAccountName}
                            onChange={(event) => setNewAccountName(event.target.value)}
                            placeholder="Ex: Filial Luanda, Empresa B..."
                            disabled={switching}
                            autoFocus
                        />
                    </div>
                    {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={switching}>
                            Cancelar
                        </Button>
                        <Button type="button" onClick={handleCreate} disabled={switching || !newAccountName.trim()} className="gap-2">
                            {switching && <Loader2 className="h-4 w-4 animate-spin" />}
                            Criar e abrir
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteOpen} onOpenChange={(open) => {
                if (deleting) return;
                setDeleteOpen(open);
                if (!open) {
                    setAccountToDelete(null);
                    setDeleteConfirmation('');
                    setBackupAcknowledged(false);
                }
            }}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-700">
                            <AlertTriangle className="h-5 w-5" />
                            Eliminar conta secundária
                        </DialogTitle>
                        <DialogDescription>
                            Esta ação remove a conta da lista de contas isoladas. Antes de continuar, é recomendado entrar nesta conta e baixar um backup dos dados.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                            <div className="flex items-start gap-3">
                                <Download className="mt-0.5 h-5 w-5 shrink-0" />
                                <div className="space-y-1">
                                    <p className="font-bold">Recomendação antes de eliminar</p>
                                    <p>
                                        Entre na conta <strong>{accountToDelete?.name}</strong>, abra as definições de backup/exportação e baixe uma cópia da base de dados. Depois volte à Conta Principal para eliminar com mais segurança.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                            <p className="font-bold">O que acontece ao confirmar:</p>
                            <ul className="mt-2 list-disc space-y-1 pl-5">
                                <li>A conta deixa de aparecer no seletor de contas.</li>
                                <li>Clientes, créditos, pagamentos, utilizadores e definições dessa conta ficam inacessíveis pelo sistema.</li>
                                <li>Por segurança, os ficheiros são arquivados numa pasta de contas eliminadas, em vez de serem apagados definitivamente.</li>
                                <li>A Conta Principal e as outras contas secundárias não são afetadas.</li>
                            </ul>
                            {accountToDelete?.id === activeAccountId && (
                                <p className="mt-3 font-semibold">
                                    Esta conta está aberta agora. Ao eliminar, o sistema muda automaticamente para a Conta Principal e recarrega a janela.
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="deleteAccountConfirmation">
                                Digite o nome da conta para confirmar
                            </Label>
                            <Input
                                id="deleteAccountConfirmation"
                                value={deleteConfirmation}
                                onChange={(event) => setDeleteConfirmation(event.target.value)}
                                placeholder={accountToDelete?.name || 'Nome da conta'}
                                disabled={deleting}
                            />
                            <p className="text-xs text-muted-foreground">
                                Conta: <span className="font-bold">{accountToDelete?.name}</span>
                            </p>
                        </div>

                        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                            <Checkbox
                                checked={backupAcknowledged}
                                onCheckedChange={(checked) => setBackupAcknowledged(checked === true)}
                                disabled={deleting}
                                className="mt-0.5"
                            />
                            <span>
                                Confirmo que fiz backup desta conta ou que compreendo o risco de eliminar sem backup.
                            </span>
                        </label>
                    </div>

                    {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={deleting || !canDeleteAccount}
                            className="gap-2"
                        >
                            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                            Eliminar conta
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
