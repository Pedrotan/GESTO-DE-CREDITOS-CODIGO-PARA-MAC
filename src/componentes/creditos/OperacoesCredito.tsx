// Operações especiais da ficha do crédito (Parte H): liquidação antecipada (total ou parcial, com simulação antes
// de confirmar), reestruturação (novo plano com aprovação de outra pessoa), contencioso, abate (pedido aprovado na
// Contabilidade), transferência de gestor e envio do extrato. Todas usam os serviços existentes; nenhuma fórmula
// nova de juros: o plano vem do gerador de prestações e a mora do cálculo de juros de mora.
import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { formatCurrency } from '@/bibliotecas/formatters';
import { luandaDateKey, luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { simulateEarlySettlement, type EarlyMode, type EarlySettlement, type PlanItem } from '@/bibliotecas/liquidacao-antecipada';
import { buildRestructuring } from '@/bibliotecas/reestruturacao';
import type { InstallmentRow, PortfolioRow } from '@/bibliotecas/carteira-credito';
import { getWhatsAppLink } from '@/bibliotecas/whatsapp';
import { downloadDataUrl } from '@/bibliotecas/relatorios-pagamentos';
import { cn } from '@/bibliotecas/utils';
import { ServicoCarteira } from '@/servicos/ServicoCarteira';
import { ServicoContabilidadeGeral } from '@/servicos/ServicoContabilidadeGeral';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { generateCreditReport } from './RelatoriosCreditos';
import type { Credit, Payment } from '@/tipos/credito';

export type Actor = { id: string; name: string; role: string; permissions?: string[] };
const kz = (minor: number) => formatCurrency(minor / 100);
const dateLabel = (value: string) => luandaDateKey(value).split('-').reverse().join('/');

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>;
}
function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'red' | 'green' }) {
    return (
        <div className={cn('flex items-center justify-between gap-3 py-1 text-sm', strong && 'border-t pt-2 font-bold')}>
            <span className="text-muted-foreground">{label}</span>
            <span className={cn(tone === 'red' && 'text-red-700 dark:text-red-400', tone === 'green' && 'text-emerald-700 dark:text-emerald-400')}>{value}</span>
        </div>
    );
}
function PlanTable({ plan, title }: { plan: PlanItem[]; title: string }) {
    if (!plan.length) return null;
    return (
        <div className="rounded-lg border">
            <p className="border-b bg-muted/40 px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
            <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background"><tr className="text-muted-foreground"><th className="p-2 text-left">N.º</th><th className="p-2 text-left">Vencimento</th><th className="p-2 text-right">Capital</th><th className="p-2 text-right">Juros</th><th className="p-2 text-right">Prestação</th></tr></thead>
                    <tbody>{plan.map(item => <tr key={`${item.number}-${item.dueDate}`} className="border-t"><td className="p-2">{item.number}</td><td className="p-2">{dateLabel(item.dueDate)}</td><td className="p-2 text-right">{kz(item.principalMinor)}</td><td className="p-2 text-right">{kz(item.interestMinor)}</td><td className="p-2 text-right font-semibold">{kz(item.totalMinor)}</td></tr>)}</tbody>
                </table>
            </div>
        </div>
    );
}
const ReasonBox = ({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) => (
    <Field label="Motivo (obrigatório, fica na auditoria)"><Textarea rows={3} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></Field>
);

// ── Liquidação antecipada ──────────────────────────────────────────────────────────

export function LiquidacaoAntecipadaDialog({ open, onClose, credit, row, installments, actor, onSettled }: {
    open: boolean; onClose: () => void; credit: Credit; row: PortfolioRow; installments: InstallmentRow[]; actor: Actor | null;
    /** Depois de gravar o plano, abre o registo do pagamento do valor a pagar hoje. */
    onSettled: (payNowMinor: number) => void;
}) {
    const [kind, setKind] = useState<'total' | 'partial'>('total');
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState<EarlyMode>('reduce_installment');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const simulation = useMemo((): { result: EarlySettlement | null; error: string } => {
        try {
            return { result: simulateEarlySettlement({ method: credit.amortizationMethod || 'FLAT', annualRatePercent: Number(credit.interestRate) || 0, startDate: credit.startDate,
                installments, moraMinor: row.moraMinor, kind, capitalMinor: Math.round(Number(amount || 0) * 100), mode }), error: '' };
        } catch (cause: any) { return { result: null, error: cause?.message || 'Não foi possível simular.' }; }
    }, [credit, installments, row.moraMinor, kind, amount, mode]);
    const sim = simulation.result;
    const confirm = async () => {
        if (!sim || !actor) return;
        setBusy(true); setError('');
        try {
            const done = await ServicoCarteira.earlySettlement({ credit, simulation: sim, reason, actor });
            onClose();
            onSettled(done.payNowMinor);
        } catch (cause: any) { setError(cause?.message || 'Não foi possível gravar a liquidação antecipada.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
            <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Liquidação antecipada · {row.reference}</DialogTitle>
                    <DialogDescription>Simule antes de confirmar. Ao confirmar, o plano é gravado e abre-se o registo do pagamento do valor a pagar hoje (imputação de sempre: mora, juros e capital).</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-3">
                        <div className="inline-flex w-full rounded-lg border p-0.5">
                            {(['total', 'partial'] as const).map(value => (
                                <button key={value} type="button" onClick={() => setKind(value)} className={cn('flex-1 rounded-md px-3 py-1.5 text-sm font-semibold', kind === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                                    {value === 'total' ? 'Total' : 'Parcial'}
                                </button>
                            ))}
                        </div>
                        {kind === 'partial' && (
                            <>
                                <Field label="Capital a antecipar (Kz)"><Input type="number" min={0} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="Ex.: 300000" /></Field>
                                <Field label="Depois da antecipação">
                                    <Select value={mode} onValueChange={value => setMode(value as EarlyMode)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="reduce_installment">Reduzir a prestação (mantém o prazo)</SelectItem>
                                            <SelectItem value="reduce_term">Reduzir o prazo (mantém a prestação)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Field>
                            </>
                        )}
                        <ReasonBox value={reason} onChange={setReason} placeholder="Ex.: o cliente recebeu o subsídio de férias e antecipa parte do capital." />
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-3">
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Simulação a {sim ? dateLabel(sim.asOfKey) : '—'}</p>
                        {sim ? (
                            <>
                                <Line label="Capital em dívida" value={kz(sim.outstandingCapitalMinor)} />
                                <Line label="Prestações em atraso" value={kz(sim.overdueMinor)} tone={sim.overdueMinor ? 'red' : undefined} />
                                <Line label="Juros decorridos até hoje" value={kz(sim.accruedInterestMinor)} />
                                <Line label="Mora" value={kz(sim.moraMinor)} tone={sim.moraMinor ? 'red' : undefined} />
                                <Line label="Capital antecipado" value={kz(sim.capitalMinor)} />
                                <Line label="A pagar hoje" value={kz(sim.payNowMinor)} strong />
                                <Line label="Juros que deixa de pagar" value={kz(sim.interestSavedMinor)} tone="green" />
                                {sim.kind === 'partial' && (
                                    <>
                                        <Line label="Prestações: antes → depois" value={`${sim.oldCount} → ${sim.newCount}`} />
                                        <Line label="Prestação: antes → depois" value={`${kz(sim.oldInstallmentMinor)} → ${kz(sim.newInstallmentMinor)}`} />
                                    </>
                                )}
                            </>
                        ) : <p className="text-sm text-destructive">{simulation.error}</p>}
                    </div>
                </div>
                {sim && sim.kind === 'partial' && <PlanTable plan={sim.newPlan} title="Novo plano das prestações por vencer" />}
                {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
                    <Button disabled={busy || !sim || !actor || reason.trim().length < 20} onClick={() => void confirm()}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Confirmar e registar o pagamento</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Reestruturação ────────────────────────────────────────────────────────────────

export function ReestruturacaoDialog({ open, onClose, credit, row, installments, actor, onRequested }: {
    open: boolean; onClose: () => void; credit: Credit; row: PortfolioRow; installments: InstallmentRow[]; actor: Actor | null; onRequested: () => void;
}) {
    const nextMonth = useMemo(() => { const [y, m, d] = luandaTodayKey().split('-').map(Number); return new Date(Date.UTC(y, m, Math.min(d, 28))).toISOString().slice(0, 10); }, []);
    const [months, setMonths] = useState(String(Math.max(1, row.totalCount - row.paidCount) * 2));
    const [rate, setRate] = useState(String(credit.interestRate));
    const [method, setMethod] = useState<'PRICE' | 'SAC' | 'FLAT'>((['PRICE', 'SAC', 'FLAT'].includes(String(credit.amortizationMethod)) ? credit.amortizationMethod : 'PRICE') as any);
    const [first, setFirst] = useState(nextMonth);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const preview = useMemo(() => {
        try { return { value: buildRestructuring({ installments, months: Number(months), ratePercent: Number(rate), method, firstDueKey: first }), error: '' }; }
        catch (cause: any) { return { value: null, error: cause?.message || 'Não foi possível simular.' }; }
    }, [installments, months, rate, method, first]);
    const submit = async () => {
        if (!preview.value || !actor) return;
        setBusy(true); setError('');
        try {
            await ServicoCarteira.requestRestructure({ credit, plan: preview.value.plan, replacedIds: preview.value.replacedIds, reason, actor,
                params: { months: Number(months), ratePercent: Number(rate), method, firstDueKey: first, overdueInterestMinor: preview.value.overdueInterestMinor } });
            onClose(); onRequested();
        } catch (cause: any) { setError(cause?.message || 'Não foi possível pedir a reestruturação.'); } finally { setBusy(false); }
    };
    const total = preview.value?.plan.reduce((sum, item) => sum + item.totalMinor, 0) || 0;
    return (
        <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
            <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Reestruturar · {row.reference}</DialogTitle>
                    <DialogDescription>O pedido fica pendente até ser aprovado por um administrador ou diretor de crédito diferente de quem o pede. O plano original fica no histórico.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Novo prazo (meses)"><Input type="number" min={1} max={120} value={months} onChange={event => setMonths(event.target.value)} /></Field>
                    <Field label="TAN (%)"><Input type="number" min={0} step="0.01" value={rate} onChange={event => setRate(event.target.value)} /></Field>
                    <Field label="Método">
                        <Select value={method} onValueChange={value => setMethod(value as any)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="PRICE">Prestação constante (PRICE)</SelectItem><SelectItem value="SAC">Amortização constante (SAC)</SelectItem><SelectItem value="FLAT">Taxa fixa (FLAT)</SelectItem></SelectContent>
                        </Select>
                    </Field>
                    <Field label="1.ª prestação"><Input type="date" value={first} min={luandaTodayKey()} onChange={event => setFirst(event.target.value)} /></Field>
                </div>
                {preview.value ? (
                    <div className="grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-2">
                        <Line label="Capital reescalonado" value={kz(preview.value.capitalMinor)} />
                        <Line label="Juros vencidos incluídos na 1.ª" value={kz(preview.value.overdueInterestMinor)} />
                        <Line label="Prestações: antes → depois" value={`${preview.value.oldCount} → ${preview.value.plan.length}`} />
                        <Line label="Prestação: antes → depois" value={`${kz(row.installmentMinor)} → ${kz(preview.value.plan[1]?.totalMinor || preview.value.plan[0]?.totalMinor || 0)}`} />
                        <Line label="Total do novo plano" value={kz(total)} strong />
                        <Line label="Mora já lançada" value={`${kz(row.moraMinor)} (mantém-se)`} />
                    </div>
                ) : <p className="text-sm text-destructive">{preview.error}</p>}
                {preview.value && <PlanTable plan={preview.value.plan} title="Novo plano de prestações" />}
                <ReasonBox value={reason} onChange={setReason} placeholder="Ex.: perda de rendimento comprovada; o cliente propõe pagar em 24 meses com a mesma TAN." />
                {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
                    <Button disabled={busy || !preview.value || !actor || reason.trim().length < 20} onClick={() => void submit()}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Pedir aprovação</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Decisão de reestruturação (aprovação) ──────────────────────────────────────────

export function DecisaoReestruturacao({ open, onClose, requestId, approve, actor, onDecided }: {
    open: boolean; onClose: () => void; requestId: string | null; approve: boolean; actor: Actor | null; onDecided: () => void;
}) {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const run = async () => {
        if (!requestId || !actor) return;
        setBusy(true); setError('');
        try { await ServicoCarteira.decideRestructure(requestId, approve, reason, actor); setReason(''); onClose(); onDecided(); }
        catch (cause: any) { setError(cause?.message || 'Não foi possível registar a decisão.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{approve ? 'Aprovar a reestruturação' : 'Rejeitar a reestruturação'}</DialogTitle>
                    <DialogDescription>{approve ? 'O novo plano substitui as prestações em aberto e o crédito passa a "Reestruturado".' : 'O plano atual mantém-se.'}</DialogDescription>
                </DialogHeader>
                <ReasonBox value={reason} onChange={setReason} placeholder="Fundamentação da decisão." />
                {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
                    <Button variant={approve ? 'default' : 'destructive'} disabled={busy || reason.trim().length < 20} onClick={() => void run()}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{approve ? 'Aprovar' : 'Rejeitar'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Contencioso e abate ───────────────────────────────────────────────────────────

export function ContenciosoDialog({ open, onClose, credit, row, actor, onDone }: { open: boolean; onClose: () => void; credit: Credit; row: PortfolioRow; actor: Actor | null; onDone: () => void }) {
    const [priority, setPriority] = useState<'normal' | 'high' | 'critical'>(row.daysOverdue > 90 ? 'critical' : row.daysOverdue > 60 ? 'high' : 'normal');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const debt = row.outstandingMinor + row.interestOutstandingMinor + row.moraMinor;
    const run = async () => {
        if (!actor) return;
        setBusy(true); setError('');
        try { await ServicoCarteira.sendToLegal({ credit, debtMinor: debt, priority, reason, actor }); onClose(); onDone(); }
        catch (cause: any) { setError(cause?.message || 'Não foi possível abrir o processo.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Enviar para contencioso · {row.reference}</DialogTitle>
                    <DialogDescription>Abre um processo no módulo de Contencioso (fase: interpelação) com a dívida atual. O crédito passa a "Contencioso".</DialogDescription>
                </DialogHeader>
                <div className="rounded-xl border bg-muted/20 p-3">
                    <Line label="Capital em dívida" value={kz(row.outstandingMinor)} />
                    <Line label="Juros por receber" value={kz(row.interestOutstandingMinor)} />
                    <Line label="Mora" value={kz(row.moraMinor)} />
                    <Line label="Dívida total" value={kz(debt)} strong />
                    <Line label="Dias de atraso" value={String(row.daysOverdue)} tone={row.daysOverdue ? 'red' : undefined} />
                </div>
                <Field label="Prioridade">
                    <Select value={priority} onValueChange={value => setPriority(value as any)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="critical">Crítica</SelectItem></SelectContent>
                    </Select>
                </Field>
                <ReasonBox value={reason} onChange={setReason} placeholder="Ex.: 95 dias de atraso, três promessas falhadas e sem resposta aos contactos." />
                {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
                    <Button variant="destructive" disabled={busy || !actor || reason.trim().length < 20} onClick={() => void run()}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Enviar para contencioso</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function AbateDialog({ open, onClose, credit, row, actor, onDone }: { open: boolean; onClose: () => void; credit: Credit; row: PortfolioRow; actor: Actor | null; onDone: () => void }) {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const run = async () => {
        if (!actor) return;
        setBusy(true); setError('');
        try {
            await ServicoContabilidadeGeral.createRequest({ kind: 'writeoff', targetId: credit.id, amountMinor: row.outstandingMinor, description: `Abate do crédito ${row.reference} de ${credit.clientName}`, reason }, actor);
            onClose(); onDone();
        } catch (cause: any) { setError(cause?.message || 'Não foi possível pedir o abate.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Pedir abate · {row.reference}</DialogTitle>
                    <DialogDescription>O pedido segue para a Contabilidade (Pedidos de aprovação). Outro administrador aprova; só então são feitos o lançamento (provisões e perda) e a passagem a "Abatido". O crédito continua em cobrança.</DialogDescription>
                </DialogHeader>
                <div className="rounded-xl border bg-muted/20 p-3">
                    <Line label="Capital a abater" value={kz(row.outstandingMinor)} />
                    <Line label="Juros e mora por receber" value={kz(row.interestOutstandingMinor + row.moraMinor)} />
                    <Line label="Dias de atraso" value={String(row.daysOverdue)} tone="red" />
                </div>
                <ReasonBox value={reason} onChange={setReason} placeholder="Ex.: incobrável — processo judicial sem bens penhoráveis, parecer jurídico de 12/09." />
                {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
                    <Button variant="destructive" disabled={busy || !actor || reason.trim().length < 20} onClick={() => void run()}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Pedir aprovação do abate</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Transferência de gestor ───────────────────────────────────────────────────────

export function TransferirGestorDialog({ open, onClose, row, users, actor, onDone }: { open: boolean; onClose: () => void; row: PortfolioRow; users: Array<{ id: string; name: string }>; actor: Actor | null; onDone: () => void }) {
    const [target, setTarget] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const run = async () => {
        const user = users.find(item => item.id === target);
        if (!user || !actor) return;
        setBusy(true); setError('');
        try { await ServicoCarteira.transferManager([row.id], user, reason, actor); onClose(); onDone(); }
        catch (cause: any) { setError(cause?.message || 'Não foi possível transferir.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Transferir para outro gestor</DialogTitle>
                    <DialogDescription>Gestor atual: {row.managerName}. A transferência fica no histórico do crédito e na auditoria.</DialogDescription>
                </DialogHeader>
                <Select value={target} onValueChange={setTarget}>
                    <SelectTrigger><SelectValue placeholder="Escolha o novo gestor" /></SelectTrigger>
                    <SelectContent>{users.filter(user => user.id !== row.managerId).map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent>
                </Select>
                <ReasonBox value={reason} onChange={setReason} placeholder="Ex.: o gestor titular saiu da agência; redistribuição da carteira." />
                {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
                    <Button disabled={busy || !target || !actor || reason.trim().length < 20} onClick={() => void run()}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Transferir</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Extrato para o cliente ────────────────────────────────────────────────────────

export function ExtratoDialog({ open, onClose, row, rows, installments, payments, client, settings, actor }: {
    open: boolean; onClose: () => void; row: PortfolioRow; rows: PortfolioRow[]; installments: InstallmentRow[]; payments: Payment[];
    client: { phone?: string; email?: string } | undefined; settings: any; actor: Actor | null;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const today = luandaTodayKey();
    const message = `Olá ${row.clientName}, segue o extrato do seu crédito ${row.reference} a ${today.split('-').reverse().join('/')}: capital em dívida ${kz(row.outstandingMinor)}${row.daysOverdue ? `, ${row.daysOverdue} dia(s) de atraso` : ''}${row.nextDueKey ? `, próxima prestação a ${row.nextDueKey.split('-').reverse().join('/')} (${kz(row.nextDueMinor)})` : ''}. ${settings?.name || ''}`.trim();
    const run = async (channel: 'download' | 'whatsapp' | 'email') => {
        if (!actor) return;
        setBusy(channel); setError(''); setNotice('');
        try {
            const file = await generateCreditReport('extrato', { rows, installments, payments, dateKey: today, monthKey: today.slice(0, 7), creditId: row.id, todayKey: today }, settings, actor, 'pdf', false);
            if (channel === 'email' && client?.email && settings?.smtpHost && settings?.smtpUser && settings?.smtpPassword && (window as any).electronAPI?.sendEmail) {
                const result = await (window as any).electronAPI.sendEmail({
                    smtpSettings: { host: settings.smtpHost, port: settings.smtpPort, user: settings.smtpUser, pass: settings.smtpPassword, secure: settings.smtpSecure, fromName: settings.smtpFromName || settings.name },
                    emailOptions: { to: client.email, subject: `Extrato do crédito ${row.reference}`, html: `<p>${message}</p>`, attachments: [{ filename: file.fileName, content: file.dataUrl.split(',')[1], encoding: 'base64' }] },
                });
                if (!result?.success) throw new Error(result?.error || 'O servidor de email recusou o envio.');
                setNotice(`Extrato enviado por email para ${client.email}.`);
                return;
            }
            downloadDataUrl(file.dataUrl, file.fileName);
            if (channel === 'whatsapp') { window.open(getWhatsAppLink(client?.phone || '', `${message}\n(Segue em anexo o extrato em PDF.)`), '_blank'); setNotice('O PDF foi descarregado: anexe-o na conversa de WhatsApp que se abriu.'); }
            else if (channel === 'email') {
                if (!client?.email) throw new Error('O cliente não tem email registado.');
                window.open(`mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(`Extrato do crédito ${row.reference}`)}&body=${encodeURIComponent(`${message}\n\n(O extrato foi descarregado: anexe o ficheiro ${file.fileName}.)`)}`);
                setNotice('O PDF foi descarregado e abriu-se o email com a mensagem preparada.');
            } else setNotice('Extrato descarregado.');
        } catch (cause: any) { setError(cause?.message || 'Não foi possível gerar o extrato.'); } finally { setBusy(null); }
    };
    return (
        <Dialog open={open} onOpenChange={value => { if (!value && !busy) { setNotice(''); setError(''); onClose(); } }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Extrato do crédito · {row.reference}</DialogTitle>
                    <DialogDescription>PDF com o plano, os pagamentos e o saldo à data de hoje. O envio fica no histórico de relatórios.</DialogDescription>
                </DialogHeader>
                <p className="rounded-md bg-muted/50 p-2 text-xs">{message}</p>
                {notice && <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</p>}
                {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
                <DialogFooter className="gap-2 sm:justify-between">
                    <Button variant="outline" disabled={!!busy} onClick={() => void run('download')}>{busy === 'download' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Descarregar PDF</Button>
                    <div className="flex gap-2">
                        <Button variant="outline" disabled={!!busy || !client?.phone} onClick={() => void run('whatsapp')}>{busy === 'whatsapp' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}WhatsApp</Button>
                        <Button disabled={!!busy || !client?.email} onClick={() => void run('email')}>{busy === 'email' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Email</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
