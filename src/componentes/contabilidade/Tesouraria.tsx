import { useEffect, useMemo, useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { useToast } from '@/componentes/ui/use-toast';
import { formatDate, formatDateTime } from '@/bibliotecas/formatters';
import { CHART_OF_ACCOUNTS, accountName, entryTypeLabel } from '@/bibliotecas/plano-contas';
import { balanceAt, type DateRange, type JournalEntry } from '@/bibliotecas/relatorios-contabeis';
import { reconcileBank, type BankMovement } from '@/bibliotecas/controlo-contabilistico';
import { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
import { ServicoExtratosBancarios, type StoredBankImport } from '@/servicos/ServicoExtratosBancarios';
import { CaixaOperador } from '@/componentes/CaixaOperador';
import { DecisoesDivergencias } from '@/componentes/DecisoesDivergencias';
import { AvisoErro, BotoesExportar, Indicador, SeccaoCabecalho, TabelaPaginada, type Coluna } from './comum';
import { isAdminRole, money, JOURNAL_KIND_INFO, type JournalKind } from './formato';
import type { ContabilidadeData } from './useContabilidade';
import { useNomeUtilizador } from './utilizadores';

const PROTECTED = new Set(['portfolio', 'receivable_interest', 'receivable_late_interest', 'written_off_memo', 'written_off_memo_contra']);

export function DialogoLancamento({ open, onOpenChange, initialKind = 'capital_entry', initialAmount, data }: {
    open: boolean; onOpenChange: (open: boolean) => void; initialKind?: JournalKind; initialAmount?: number; data: ContabilidadeData;
}) {
    const { user } = useAuth();
    const { refreshData } = useData();
    const { toast } = useToast();
    const [kind, setKind] = useState<JournalKind>(initialKind);
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [liquid, setLiquid] = useState<'cash' | 'bank'>('bank');
    const [from, setFrom] = useState<'cash' | 'bank'>('bank');
    const [debit, setDebit] = useState('expenses');
    const [credit, setCredit] = useState('bank');
    const [key, setKey] = useState(() => crypto.randomUUID());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const admin = isAdminRole(user?.role);

    useEffect(() => {
        if (!open) return;
        setKind(initialKind); setAmount(initialAmount ? String(initialAmount) : ''); setDescription(''); setError(''); setKey(crypto.randomUUID());
    }, [open, initialKind, initialAmount]);

    const cash = balanceAt(data.journal, 'cash', null), bank = balanceAt(data.journal, 'bank', null);
    const numeric = Number(String(amount).replace(',', '.'));
    const valid = Number.isFinite(numeric) && numeric > 0 && description.trim().length >= 5 && (kind !== 'custom' || (debit !== credit));
    const accounts = CHART_OF_ACCOUNTS.filter(item => !PROTECTED.has(item.account));

    const save = async () => {
        if (!user || !valid) return;
        setBusy(true); setError('');
        try {
            const entry = await ServicoFinanceiro.registerJournalEntry({
                kind, amount: Math.round(numeric * 100) / 100, description, idempotencyKey: `ui-${key}`,
                actorId: user.id, actorName: user.name, actorRole: user.role,
                liquidAccount: liquid, creditAccount: kind === 'transfer' ? from : credit, debitAccount: debit,
            });
            toast({ title: 'Lançamento registado', description: `${JOURNAL_KIND_INFO[kind].label} · ${money(entry.amountTotalMinor ?? Math.round(numeric * 100))}. Correcções fazem-se por estorno.` });
            onOpenChange(false);
            await refreshData();
            await data.reload();
        } catch (failure: any) {
            setError(failure?.message || 'Não foi possível registar o lançamento.');
        } finally { setBusy(false); }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Novo lançamento de tesouraria</DialogTitle>
                    <DialogDescription>Gera partidas dobradas na cadeia de integridade. Não pode ser editado nem apagado: correcções fazem-se por estorno aprovado.</DialogDescription>
                </DialogHeader>
                <AvisoErro message={error} />
                {!admin ? <p className="text-sm text-muted-foreground">Registo reservado a administradores.</p> : (
                    <div className="space-y-3">
                        <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">Operação</span>
                            <Select value={kind} onValueChange={value => { setKind(value as JournalKind); setKey(crypto.randomUUID()); }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{(Object.keys(JOURNAL_KIND_INFO) as JournalKind[]).map(item => <SelectItem key={item} value={item}>{JOURNAL_KIND_INFO[item].label}</SelectItem>)}</SelectContent>
                            </Select>
                        </label>
                        <p className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">{JOURNAL_KIND_INFO[kind].description}</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">Valor (AOA)</span>
                                <Input inputMode="decimal" value={amount} onChange={event => { setAmount(event.target.value); setKey(crypto.randomUUID()); }} placeholder="0,00" />
                            </label>
                            {['capital_entry', 'loan_received', 'expense'].includes(kind) && (
                                <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">Conta de disponibilidades</span>
                                    <Select value={liquid} onValueChange={value => setLiquid(value as 'cash' | 'bank')}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="bank">Bancos (saldo {money(bank)})</SelectItem><SelectItem value="cash">Caixa (saldo {money(cash)})</SelectItem></SelectContent>
                                    </Select>
                                </label>
                            )}
                            {kind === 'transfer' && (
                                <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">Sentido</span>
                                    <Select value={from} onValueChange={value => setFrom(value as 'cash' | 'bank')}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="cash">Caixa → Bancos (depósito)</SelectItem><SelectItem value="bank">Bancos → Caixa (levantamento)</SelectItem></SelectContent>
                                    </Select>
                                </label>
                            )}
                        </div>
                        {kind === 'custom' && (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {([['debit', 'Conta a débito', debit, setDebit], ['credit', 'Conta a crédito', credit, setCredit]] as const).map(([side, label, value, setter]) => (
                                    <label key={side} className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">{label}</span>
                                        <Select value={value} onValueChange={setter}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>{accounts.map(item => <SelectItem key={item.account} value={item.account}>{item.code} · {accountName(item.account, data.catalog)}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </label>
                                ))}
                            </div>
                        )}
                        <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">Descrição e motivo (mínimo 5 caracteres)</span>
                            <Textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: realização do capital social conforme escritura" />
                        </label>
                        <p className="text-xs text-muted-foreground">Disponibilidades actuais: Caixa {money(cash)} · Bancos {money(bank)}. Saídas acima do saldo são recusadas quando o controlo de saldo está activo.</p>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    {admin && <Button disabled={busy || !valid} onClick={() => void save()}>{busy ? 'A registar…' : 'Registar lançamento'}</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const inRange = (timestamp: string, range: DateRange) => {
    const time = new Date(timestamp).getTime();
    return (!range.start || time >= range.start.getTime()) && (!range.end || time <= range.end.getTime());
};

export function LancamentosManuais({ data, range, rangeLabel, onNew }: { data: ContabilidadeData; range: DateRange; rangeLabel: string; onNew: (kind?: JournalKind) => void }) {
    const userName = useNomeUtilizador();
    const rows = data.journal.filter(entry => ['manual', 'expense', 'provision', 'journal_reversal'].includes(entry.sourceType) && inRange(entry.timestamp, range))
        .sort((a, b) => b.sequence - a.sequence);
    const columns: Coluna<JournalEntry>[] = [
        { key: 'seq', header: 'N.º', render: entry => <span className="font-mono text-xs">{String(entry.sequence).padStart(5, '0')}</span> },
        { key: 'date', header: 'Data', className: 'whitespace-nowrap', render: entry => <span className="text-xs">{formatDateTime(entry.timestamp)}</span> },
        { key: 'type', header: 'Operação', render: entry => <Badge variant="outline">{entryTypeLabel(entry.type)}</Badge> },
        { key: 'desc', header: 'Descrição', className: 'min-w-[220px]', render: entry => <div><p>{entry.description}</p>{entry.justification && <p className="text-[11px] italic text-muted-foreground">{entry.justification}</p>}</div> },
        { key: 'lines', header: 'Contas', className: 'min-w-[220px]', render: entry => <ul className="text-xs">{entry.lines.map(line => <li key={line.id}>{line.side === 'debit' ? 'D' : 'C'} · {accountName(line.account, data.catalog)}</li>)}</ul> },
        { key: 'amount', header: 'Valor', align: 'right', className: 'whitespace-nowrap font-mono font-semibold', render: entry => money(entry.totalMinor) },
        { key: 'user', header: 'Registado por', render: entry => <span className="text-xs">{userName(entry.processedBy)}</span> },
    ];
    return (
        <div className="space-y-4">
            <SeccaoCabecalho title="Lançamentos de tesouraria" description={`Entradas de capital, financiamentos, despesas, transferências internas e provisões (${rangeLabel}). Para estornar, use o Diário: o estorno precisa da aprovação de outro administrador.`}
                actions={<>
                    <BotoesExportar build={() => ({
                        title: 'Lançamentos de tesouraria', subtitle: rangeLabel, fileName: `tesouraria-${rangeLabel}`, numericColumns: [4],
                        head: ['N.º', 'Data', 'Operação', 'Descrição', 'Valor', 'Registado por'],
                        body: rows.map(entry => [String(entry.sequence), formatDateTime(entry.timestamp), entryTypeLabel(entry.type), entry.description, money(entry.totalMinor), userName(entry.processedBy)]),
                    })} />
                    <Button size="sm" className="gap-2" onClick={() => onNew()}><Plus className="h-4 w-4" />Novo lançamento</Button>
                </>} />
            <div className="grid gap-3 md:grid-cols-3">
                {(['capital_entry', 'expense', 'transfer'] as JournalKind[]).map(kind => (
                    <button key={kind} type="button" onClick={() => onNew(kind)} className="rounded-xl border bg-card p-4 text-left transition hover:border-primary hover:shadow-md">
                        <p className="font-bold">{JOURNAL_KIND_INFO[kind].label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{JOURNAL_KIND_INFO[kind].description}</p>
                    </button>
                ))}
            </div>
            <TabelaPaginada columns={columns} rows={rows} rowKey={entry => entry.id} empty="Sem lançamentos de tesouraria no período." />
        </div>
    );
}

export function ReconciliacaoBancaria({ data, range, rangeLabel }: { data: ContabilidadeData; range: DateRange; rangeLabel: string }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [imports, setImports] = useState<StoredBankImport[]>([]);
    const [importId, setImportId] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = async (select?: string) => {
        const rows = await ServicoExtratosBancarios.list();
        setImports(rows);
        setImportId(select || rows[0]?.id || '');
    };
    useEffect(() => { void load().catch(failure => setError(failure.message)); }, []);
    const bank: BankMovement[] = useMemo(() => {
        const selected = imports.find(item => item.id === importId);
        try { return selected ? JSON.parse(selected.movements) : []; } catch { return []; }
    }, [imports, importId]);
    const dateKey = (value: string | Date) => { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
    const system: BankMovement[] = useMemo(() => (data.snapshot?.payments || [])
        .filter(payment => !payment.deletedAt && payment.status === 'confirmed' && payment.method !== 'cash' && inRange(String(payment.paymentDate), range))
        .map(payment => ({ id: payment.id, date: dateKey(payment.paymentDate), amountMinor: Number(payment.amountMinor ?? Math.round(Number(payment.amount || 0) * 100)), reference: String((payment as any).reference || payment.id) })),
    [data.snapshot, range]);
    const bankInRange = bank.filter(item => inRange(`${item.date}T12:00:00`, range));
    const result = useMemo(() => reconcileBank(bankInRange, system), [bankInRange, system]);
    const matched = result.bank.filter(item => item.state === 'matched');
    const ambiguous = result.bank.filter(item => item.state === 'ambiguous');
    const missing = result.bank.filter(item => item.state === 'missing-system');

    const importFile = async (file?: File) => {
        if (!file || !user) return;
        setBusy(true); setError('');
        try {
            const XLSX = await import('xlsx');
            const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
            const items = XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]]);
            const occurrences = new Map<string, number>();
            const parsed = items.map((row, index) => {
                const date = String(row.Data ?? row.data ?? '').trim();
                const amount = Number(String(row.Valor ?? row.valor ?? '').replace(/\s/g, '').replace(',', '.'));
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime()) || !Number.isFinite(amount) || !amount || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
                    throw new Error(`Linha ${index + 2} inválida. Use as colunas Data (AAAA-MM-DD), Valor e Referencia.`);
                }
                const reference = String(row.Referencia ?? row.referencia ?? row['Referência'] ?? '');
                const fingerprint = JSON.stringify([date, Math.round(amount * 100), reference]);
                const occurrence = occurrences.get(fingerprint) || 0; occurrences.set(fingerprint, occurrence + 1);
                return { id: `bank:${fingerprint}:${occurrence}`, date, amountMinor: Math.round(amount * 100), reference };
            });
            const id = await ServicoExtratosBancarios.save(parsed, file.name, { id: user.id, name: user.name });
            await load(id);
            toast({ title: 'Extrato importado', description: `${parsed.length} movimento(s) guardados. Nenhum pagamento é criado automaticamente.` });
        } catch (failure: any) { setError(failure?.message || 'Extrato inválido.'); }
        finally { setBusy(false); }
    };

    const columns: Coluna<any>[] = [
        { key: 'date', header: 'Data', render: item => formatDate(item.date) },
        { key: 'ref', header: 'Referência', render: item => <span className="font-mono text-xs">{item.reference || '—'}</span> },
        { key: 'amount', header: 'Valor', align: 'right', className: 'font-mono', render: item => money(item.amountMinor) },
        { key: 'state', header: 'Correspondência', render: item => item.state === 'matched' ? <Badge variant="success">Pagamento {item.paymentId}</Badge> : item.state === 'ambiguous' ? <Badge variant="warning">Ambígua</Badge> : <Badge variant="destructive">Sem registo no sistema</Badge> },
    ];
    return (
        <div className="space-y-4">
            <SeccaoCabecalho title="Reconciliação bancária" description={`Compare o extrato do banco com os pagamentos por transferência e referência registados no sistema (${rangeLabel}). Ficheiro CSV ou Excel com as colunas Data (AAAA-MM-DD), Valor e Referencia.`}
                actions={<>
                    <BotoesExportar build={() => ({
                        title: 'Reconciliação bancária', subtitle: rangeLabel, fileName: `reconciliacao-${rangeLabel}`, numericColumns: [2],
                        head: ['Data', 'Referência', 'Valor', 'Estado'],
                        body: [...result.bank.map(item => [item.date, item.reference, money(item.amountMinor), item.state === 'matched' ? `Conciliado (${item.paymentId})` : item.state === 'ambiguous' ? 'Ambíguo' : 'Sem registo no sistema']),
                            ...result.unmatchedSystem.map(item => [item.date, item.reference, money(item.amountMinor), `Pagamento ${item.id} sem movimento no extrato`])],
                    })} />
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted">
                        <Upload className="h-4 w-4" />{busy ? 'A importar…' : 'Importar extrato'}
                        <input type="file" accept=".csv,.xlsx,.xls" className="hidden" disabled={busy} onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }} />
                    </label>
                </>} />
            <AvisoErro message={error} />
            <Select value={importId} onValueChange={setImportId}>
                <SelectTrigger className="max-w-xl"><SelectValue placeholder="Seleccione um extrato importado" /></SelectTrigger>
                <SelectContent>{imports.map(item => <SelectItem key={item.id} value={item.id}>{item.fileName} · {formatDateTime(item.importedAt)} · {item.actorName}</SelectItem>)}</SelectContent>
            </Select>
            <div className="grid gap-3 md:grid-cols-4">
                <Indicador label="Conciliados" value={matched.length} tone="good" hint={money(matched.reduce((sum, item) => sum + item.amountMinor, 0))} />
                <Indicador label="Ambíguos" value={ambiguous.length} tone={ambiguous.length ? 'warn' : 'default'} />
                <Indicador label="No banco, sem registo" value={missing.length} tone={missing.length ? 'bad' : 'default'} hint={money(missing.reduce((sum, item) => sum + item.amountMinor, 0))} />
                <Indicador label="No sistema, sem extrato" value={result.unmatchedSystem.length} tone={result.unmatchedSystem.length ? 'warn' : 'default'} hint={money(result.unmatchedSystem.reduce((sum, item) => sum + item.amountMinor, 0))} />
            </div>
            {bank.length === 0 ? <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Importe um extrato para comparar com os pagamentos do período.</p> : (
                <>
                    <TabelaPaginada columns={columns} rows={result.bank} rowKey={item => item.id} empty="Sem movimentos do extrato neste período." />
                    {(ambiguous.length + missing.length + result.unmatchedSystem.length) > 0 && (
                        <div className="rounded-xl border bg-card p-4">
                            <p className="mb-2 font-bold">Diferenças a justificar</p>
                            <DecisoesDivergencias items={[
                                ...[...ambiguous, ...missing].map(item => ({ id: item.id, source: 'bank', description: `${item.date} · ${money(item.amountMinor)} · ${item.reference} · ${item.state === 'ambiguous' ? 'Correspondência ambígua' : 'Sem registo no sistema'}` })),
                                ...result.unmatchedSystem.map(item => ({ id: `system-bank:${item.id}`, source: 'bank', description: `${item.date} · ${money(item.amountMinor)} · Pagamento ${item.id} sem correspondência no extrato` })),
                            ]} />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export function CaixaPorOperador() {
    return (
        <div>
            <SeccaoCabecalho title="Caixa por operador" description="Abertura e fecho diário do caixa de cada operador, com o valor esperado (recebimentos em numerário) e o contado. Diferenças exigem motivo e aparecem na auditoria." />
            <div className="rounded-xl border bg-card p-4"><CaixaOperador /></div>
        </div>
    );
}
