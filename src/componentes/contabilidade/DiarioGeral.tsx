import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Undo2, ShieldCheck, ShieldAlert, ShieldQuestion, Link2 } from 'lucide-react';
import { Input } from '@/componentes/ui/input';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useToast } from '@/componentes/ui/use-toast';
import { formatDateTime } from '@/bibliotecas/formatters';
import { accountName, entryTypeLabel, SOURCE_TYPE_LABELS } from '@/bibliotecas/plano-contas';
import type { DateRange, JournalEntry } from '@/bibliotecas/relatorios-contabeis';
import { ServicoContabilidadeGeral } from '@/servicos/ServicoContabilidadeGeral';
import { BotoesExportar, SeccaoCabecalho, TabelaPaginada, type Coluna } from './comum';
import { money } from './formato';
import type { ContabilidadeData } from './useContabilidade';
import { useNomeUtilizador } from './utilizadores';

const HASH_LABELS = { valid: 'Válido', tampered: 'Adulterado', chain: 'Cadeia quebrada', unsealed: 'Sem selo', no_lines: 'Sem partidas' } as const;
type HashKey = keyof typeof HASH_LABELS;

const inRange = (timestamp: string, range: DateRange) => {
    const time = new Date(timestamp).getTime();
    return (!range.start || time >= range.start.getTime()) && (!range.end || time <= range.end.getTime());
};
const shortId = (value?: string | null) => value ? (value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value) : '';

export function DiarioGeral({ data, range, rangeLabel }: { data: ContabilidadeData; range: DateRange; rangeLabel: string }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const userName = useNomeUtilizador();
    const [search, setSearch] = useState('');
    const [type, setType] = useState('all');
    const [account, setAccount] = useState('all');
    const [operator, setOperator] = useState('all');
    const [hash, setHash] = useState<'all' | HashKey>('all');
    const [reversal, setReversal] = useState<JournalEntry | null>(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    const reversedIds = useMemo(() => new Set(data.journal.filter(entry => entry.type === 'journal_reversal').map(entry => entry.sourceId)), [data.journal]);
    const reversedPayments = useMemo(() => new Set((data.snapshot?.payments || []).filter(payment => payment.deletedAt).map(payment => payment.id)), [data.snapshot]);
    const pendingTargets = useMemo(() => new Set(data.requests.filter(request => request.status === 'pending').map(request => request.targetId)), [data.requests]);
    const statusOf = (entry: JournalEntry): HashKey => data.hashStatus.get(entry.id) || (entry.hasLines ? 'valid' : 'no_lines');

    const reversalState = (entry: JournalEntry): { allowed: boolean; reason?: string; target?: string } => {
        if (entry.paymentId && entry.type === 'payment') {
            if (reversedPayments.has(entry.paymentId)) return { allowed: false, reason: 'Pagamento já estornado' };
            return pendingTargets.has(`payment:${entry.paymentId}`) ? { allowed: false, reason: 'Pedido pendente' } : { allowed: true, target: `payment:${entry.paymentId}` };
        }
        if (['manual', 'expense', 'provision'].includes(entry.sourceType)) {
            if (reversedIds.has(entry.id)) return { allowed: false, reason: 'Já estornado' };
            return pendingTargets.has(entry.id) ? { allowed: false, reason: 'Pedido pendente' } : { allowed: true, target: entry.id };
        }
        return { allowed: false, reason: 'Estorna-se na operação de origem' };
    };

    const options = useMemo(() => ({
        types: [...new Set(data.journal.map(entry => entry.type))].sort(),
        accounts: [...new Set(data.journal.flatMap(entry => entry.lines.map(line => line.account)))].sort(),
        operators: [...new Set(data.journal.map(entry => entry.processedBy || '').filter(Boolean))].sort((a, b) => userName(a).localeCompare(userName(b))),
    }), [data.journal, userName]);

    const rows = useMemo(() => {
        const query = search.trim().toLowerCase();
        return data.journal.filter(entry => {
            if (!inRange(entry.timestamp, range)) return false;
            if (type !== 'all' && entry.type !== type) return false;
            if (account !== 'all' && !entry.lines.some(line => line.account === account)) return false;
            if (operator !== 'all' && entry.processedBy !== operator) return false;
            if (hash !== 'all' && statusOf(entry) !== hash) return false;
            if (!query) return true;
            return [entry.id, entry.description, entry.creditId, entry.paymentId, userName(entry.processedBy), entry.justification, String(entry.sequence)]
                .filter(Boolean).join(' ').toLowerCase().includes(query);
        }).sort((a, b) => b.sequence - a.sequence);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.journal, data.hashStatus, range, search, type, account, operator, hash, userName]);

    const totals = rows.reduce((sum, entry) => ({
        debit: sum.debit + entry.lines.filter(line => line.side === 'debit').reduce((total, line) => total + line.amountMinor, 0),
        credit: sum.credit + entry.lines.filter(line => line.side === 'credit').reduce((total, line) => total + line.amountMinor, 0),
    }), { debit: 0, credit: 0 });

    const hashBadge = (key: HashKey) => {
        const Icon = key === 'valid' ? ShieldCheck : key === 'unsealed' || key === 'no_lines' ? ShieldQuestion : ShieldAlert;
        const tone = key === 'valid' ? 'text-emerald-600' : key === 'unsealed' || key === 'no_lines' ? 'text-amber-600' : 'text-red-600';
        return <span className={`inline-flex items-center gap-1 text-xs font-semibold ${tone}`}><Icon className="h-3.5 w-3.5" />{HASH_LABELS[key]}</span>;
    };

    const columns: Coluna<JournalEntry>[] = [
        { key: 'seq', header: 'N.º', render: entry => <span className="font-mono text-xs font-bold">{String(entry.sequence).padStart(5, '0')}</span> },
        { key: 'date', header: 'Data', className: 'whitespace-nowrap', render: entry => <span className="text-xs">{formatDateTime(entry.timestamp)}</span> },
        {
            key: 'desc', header: 'Lançamento', className: 'min-w-[240px]', render: entry => (
                <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">{entryTypeLabel(entry.type)}</Badge>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{SOURCE_TYPE_LABELS[entry.sourceType] || entry.sourceType}</span>
                    </div>
                    <p className="font-medium leading-snug">{entry.description}</p>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                        {entry.creditId && <Link to={`/creditos?search=${encodeURIComponent(entry.creditId)}`} title={`Crédito ${entry.creditId}`} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono hover:underline"><Link2 className="h-3 w-3" />Contrato {shortId(entry.creditId)}</Link>}
                        {entry.paymentId && <Link to={`/pagamentos?search=${encodeURIComponent(entry.paymentId)}`} title={`Pagamento ${entry.paymentId}`} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono hover:underline"><Link2 className="h-3 w-3" />Pagamento {shortId(entry.paymentId)}</Link>}
                    </div>
                    {entry.justification && <p className="text-[11px] italic text-muted-foreground">Motivo: {entry.justification}</p>}
                </div>
            )
        },
        {
            key: 'lines', header: 'Contas (débito / crédito)', className: 'min-w-[280px]', render: entry => (
                <ul className="space-y-0.5 text-xs">
                    {entry.lines.map(line => (
                        <li key={line.id} className={`flex justify-between gap-3 ${line.side === 'credit' ? 'pl-4 text-muted-foreground' : 'font-medium'}`}>
                            <span className="truncate">{line.side === 'debit' ? 'D' : 'C'} · {accountName(line.account, data.catalog)}</span>
                            <span className="whitespace-nowrap font-mono">{money(line.amountMinor)}</span>
                        </li>
                    ))}
                    {!entry.lines.length && <li className="text-amber-600">Sem linhas de partidas dobradas</li>}
                </ul>
            )
        },
        { key: 'debit', header: 'Débito', align: 'right', className: 'whitespace-nowrap', render: entry => <span className="font-mono font-semibold">{money(entry.lines.filter(line => line.side === 'debit').reduce((sum, line) => sum + line.amountMinor, 0))}</span> },
        { key: 'credit', header: 'Crédito', align: 'right', className: 'whitespace-nowrap', render: entry => <span className="font-mono font-semibold">{money(entry.lines.filter(line => line.side === 'credit').reduce((sum, line) => sum + line.amountMinor, 0))}</span> },
        { key: 'user', header: 'Utilizador', render: entry => <span className="text-xs">{userName(entry.processedBy)}</span> },
        { key: 'hash', header: 'Hash', render: entry => <span title={entry.integrityHash || ''}>{hashBadge(statusOf(entry))}</span> },
        {
            key: 'actions', header: '', align: 'right', render: entry => {
                const state = reversalState(entry);
                return state.allowed
                    ? <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => { setReason(''); setReversal(entry); }}><Undo2 className="h-3.5 w-3.5" />Estornar</Button>
                    : <span className="text-[11px] text-muted-foreground">{state.reason}</span>;
            }
        },
    ];

    const requestReversal = async () => {
        if (!reversal || !user) return;
        const state = reversalState(reversal);
        if (!state.allowed || !state.target) return;
        setBusy(true);
        try {
            await ServicoContabilidadeGeral.createRequest({
                kind: 'reversal', targetId: state.target, amountMinor: reversal.totalMinor,
                description: `Estorno do lançamento n.º ${reversal.sequence}: ${reversal.description}`, reason,
            }, { id: user.id, name: user.name, role: user.role });
            toast({ title: 'Pedido de estorno criado', description: 'Outro administrador tem de aprovar o estorno em Auditoria › Pedidos de aprovação.' });
            setReversal(null);
            await data.reload();
        } catch (error: any) {
            toast({ title: 'Não foi possível pedir o estorno', description: error?.message, variant: 'destructive' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <SeccaoCabecalho
                title="Diário Geral"
                description={`Todos os lançamentos em partidas dobradas, numerados pela ordem de registo (${rangeLabel}). Cada lançamento mostra as contas a débito e a crédito, o responsável, a origem e o estado da cadeia de integridade.`}
                actions={<BotoesExportar build={() => ({
                    title: 'Diário Geral', subtitle: rangeLabel, fileName: `diario-${rangeLabel}`, numericColumns: [5, 6],
                    head: ['N.º', 'Data', 'Tipo', 'Descrição', 'Conta', 'Débito', 'Crédito', 'Utilizador', 'Referência', 'Hash'],
                    body: rows.flatMap(entry => (entry.lines.length ? entry.lines : [null]).map((line, index) => [
                        index === 0 ? String(entry.sequence) : '', index === 0 ? formatDateTime(entry.timestamp) : '', index === 0 ? entryTypeLabel(entry.type) : '',
                        index === 0 ? entry.description : '', line ? accountName(line.account, data.catalog) : '—',
                        line?.side === 'debit' ? money(line.amountMinor) : '', line?.side === 'credit' ? money(line.amountMinor) : '',
                        index === 0 ? userName(entry.processedBy) : '', index === 0 ? entry.paymentId || entry.creditId || entry.id : '', index === 0 ? HASH_LABELS[statusOf(entry)] : '',
                    ])),
                    footer: [['', '', '', 'Totais', '', money(totals.debit), money(totals.credit), '', '', '']],
                })} />}
            />
            <div className="mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
                <div className="relative xl:col-span-2">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="N.º, descrição, contrato, pagamento ou utilizador…" className="pl-9" />
                </div>
                <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{options.types.map(item => <SelectItem key={item} value={item}>{entryTypeLabel(item)}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={account} onValueChange={setAccount}>
                    <SelectTrigger><SelectValue placeholder="Conta" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todas as contas</SelectItem>{options.accounts.map(item => <SelectItem key={item} value={item}>{accountName(item, data.catalog)}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={operator} onValueChange={setOperator}>
                    <SelectTrigger><SelectValue placeholder="Utilizador" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todos os utilizadores</SelectItem>{options.operators.map(item => <SelectItem key={item} value={item}>{userName(item)}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={hash} onValueChange={value => setHash(value as any)}>
                    <SelectTrigger><SelectValue placeholder="Hash" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todos os estados de hash</SelectItem>{(Object.keys(HASH_LABELS) as HashKey[]).map(item => <SelectItem key={item} value={item}>{HASH_LABELS[item]}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">{rows.length} lançamento(s) · Débitos {money(totals.debit)} · Créditos {money(totals.credit)} · {totals.debit === totals.credit ? 'equilibrado' : 'DESEQUILIBRADO'}</p>
            <TabelaPaginada columns={columns} rows={rows} rowKey={entry => entry.id} pageSize={20}
                rowClassName={entry => ['tampered', 'chain'].includes(statusOf(entry)) ? 'bg-red-50/70 dark:bg-red-950/20' : undefined} />

            <Dialog open={!!reversal} onOpenChange={open => !open && setReversal(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Pedir estorno do lançamento n.º {reversal?.sequence}</DialogTitle>
                        <DialogDescription>
                            O estorno gera um lançamento inverso e nunca apaga o original. Fica pendente até outro administrador o aprovar.
                        </DialogDescription>
                    </DialogHeader>
                    {reversal && (
                        <div className="space-y-3 text-sm">
                            <div className="rounded-lg border bg-muted/40 p-3">
                                <p className="font-semibold">{reversal.description}</p>
                                <p className="text-xs text-muted-foreground">{formatDateTime(reversal.timestamp)} · {money(reversal.totalMinor)} · {userName(reversal.processedBy)}</p>
                            </div>
                            <label className="block space-y-1">
                                <span className="text-xs font-semibold text-muted-foreground">Motivo do estorno (obrigatório, mínimo 10 caracteres)</span>
                                <Textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} placeholder="Ex.: pagamento registado em duplicado no mesmo dia" />
                            </label>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReversal(null)}>Cancelar</Button>
                        <Button disabled={busy || reason.trim().length < 10} onClick={() => void requestReversal()}>{busy ? 'A enviar…' : 'Pedir aprovação do estorno'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
