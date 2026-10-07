import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Banknote, Building2, CheckCircle2, CreditCard, FileUp, Hash, Landmark, Loader2, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Checkbox } from '@/componentes/ui/checkbox';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { SearchableSelect } from '@/componentes/ui/SearchableSelect';
import { formatCurrency } from '@/bibliotecas/formatters';
import { formatLuandaDate, luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { cn } from '@/bibliotecas/utils';
import { PAYMENT_METHODS, type PaymentRow } from '@/bibliotecas/pagamentos-analise';
import { ServicoPagamentos, type Actor, type ImputationPreview, type PaymentDraft } from '@/servicos/ServicoPagamentos';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import type { Credit, Payment, PaymentMethod } from '@/tipos/credito';
import { RestanteLimite } from '@/componentes/alcadas/RestanteLimite';

const STEPS = ['Cliente e contrato', 'Data-valor e valor', 'Imputação', 'Método e comprovativo', 'Confirmar'];
const METHOD_ICONS: Record<PaymentMethod, React.ComponentType<{ className?: string }>> = {
    cash: Banknote, transfer: Building2, deposit: Landmark, multicaixa: Smartphone, tpa: CreditCard, reference: Hash,
};
const PAYABLE = ['active', 'overdue', 'defaulted', 'renegotiated'];
const kz = (minor: number) => formatCurrency(minor / 100);
const dateOf = (key: string) => formatLuandaDate(`${key}T12:00:00Z`);

async function readProof(file: File): Promise<NonNullable<PaymentDraft['proof']>> {
    if (file.size > 1_500_000) throw new Error('O comprovativo tem de ter no máximo 1,5 MB.');
    if (!/^(image\/(png|jpe?g|webp)|application\/pdf)$/.test(file.type)) throw new Error('Use uma imagem (PNG, JPG, WEBP) ou um PDF.');
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
        reader.readAsDataURL(file);
    });
    return { fileName: file.name, mimeType: file.type, dataUrl };
}

export function AssistentePagamento({ open, onOpenChange, credits, clients, rows, numbers, actor, initialCreditId, onRegisterConfirmed, onDone }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    credits: Credit[];
    clients: Array<{ id: string; name: string; nif?: string; phone?: string }>;
    rows: PaymentRow[];
    numbers: Map<string, string>;
    actor: Actor;
    initialCreditId?: string;
    /** Regista um pagamento confirmado pelo contexto de dados (saldos, contrato e limites actualizados). */
    onRegisterConfirmed: (payment: Payment) => Promise<void>;
    onDone: (result: { payment: Payment; pending: boolean }) => void;
}) {
    const [step, setStep] = useState(0);
    const [clientId, setClientId] = useState('');
    const [creditId, setCreditId] = useState('');
    const [valueDateKey, setValueDateKey] = useState(luandaTodayKey());
    const [amount, setAmount] = useState(0);
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [reference, setReference] = useState('');
    const [proof, setProof] = useState<PaymentDraft['proof']>(null);
    const [preview, setPreview] = useState<ImputationPreview | null>(null);
    const [previewError, setPreviewError] = useState('');
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [acknowledged, setAcknowledged] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    // Protecção contra duplo clique: um único pedido em curso e a mesma chave de idempotência por assistente.
    const inFlight = useRef(false);
    const identity = useRef({ id: '', key: '' });
    const today = luandaTodayKey();
    const canBackdate = ServicoControloAcesso.temPermissao(actor as any, 'pagamentos.data_retroativa');

    useEffect(() => {
        if (!open) return;
        const uuid = crypto.randomUUID();
        identity.current = { id: `pag-${uuid}`, key: `wizard:${uuid}` };
        inFlight.current = false;
        const credit = initialCreditId ? credits.find(item => item.id === initialCreditId) : undefined;
        setStep(credit ? 1 : 0); setClientId(credit?.clientId || ''); setCreditId(credit?.id || ''); setValueDateKey(luandaTodayKey());
        setAmount(0); setMethod('cash'); setReference(''); setProof(null); setPreview(null); setPreviewError('');
        setErrors([]); setWarnings([]); setAcknowledged(false); setSubmitting(false);
    }, [open, initialCreditId, credits]);

    const payable = useMemo(() => credits.filter(credit => PAYABLE.includes(credit.status) && !credit.deletedAt), [credits]);
    const clientOptions = useMemo(() => {
        const ids = new Set(payable.map(credit => credit.clientId));
        return clients.filter(client => ids.has(client.id)).map(client => ({ value: client.id, label: client.name, subLabel: client.nif || client.phone || '', keywords: `${client.nif || ''} ${client.phone || ''}` }));
    }, [clients, payable]);
    const contractOptions = useMemo(() => payable.filter(credit => !clientId || credit.clientId === clientId).map(credit => ({
        value: credit.id, label: `${numbers.get(credit.id) || credit.id.slice(0, 8)} · ${credit.clientName}`,
        subLabel: `Em dívida ${formatCurrency(credit.totalDue)} · ${credit.paidInstallments}/${credit.installments} prestações pagas`, keywords: credit.id,
    })), [payable, clientId, numbers]);
    const credit = payable.find(item => item.id === creditId);

    // Pré-visualização: prestações em dívida e mora até à data-valor; imputação do valor indicado.
    useEffect(() => {
        if (!open || !creditId || !/^\d{4}-\d{2}-\d{2}$/.test(valueDateKey)) { setPreview(null); return; }
        let cancelled = false;
        setLoadingPreview(true);
        const timer = setTimeout(() => {
            ServicoPagamentos.previewImputation(creditId, valueDateKey, amount > 0 ? amount : undefined)
                .then(result => { if (!cancelled) { setPreview(result); setPreviewError(''); } })
                .catch(error => {
                    if (cancelled) return;
                    setPreviewError(error instanceof Error ? error.message : String(error));
                    ServicoPagamentos.previewImputation(creditId, valueDateKey).then(result => { if (!cancelled) setPreview(result); }).catch(() => undefined);
                })
                .finally(() => { if (!cancelled) setLoadingPreview(false); });
        }, 250);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [open, creditId, valueDateKey, amount]);

    const draft: PaymentDraft = { creditId, valueDateKey, amount, method, reference, proof };
    const stepErrors = (): string[] => {
        if (step === 0 && !creditId) return ['Escolha o cliente e o contrato.'];
        if (step === 1) {
            const list: string[] = [];
            if (!valueDateKey) list.push('Indique a data-valor.');
            else if (valueDateKey > today) list.push('A data-valor não pode ser futura.');
            else if (valueDateKey < today && !canBackdate) list.push('Datas retroactivas exigem a permissão «Registar com data retroactiva».');
            if (!(amount > 0)) list.push('Indique um valor maior que zero.');
            else if (preview && Math.round(amount * 100) > preview.totalDueMinor) list.push(`O valor excede a dívida total na data-valor (${kz(preview.totalDueMinor)}).`);
            return list;
        }
        if (step === 3) {
            if (PAYMENT_METHODS[method].proofRequired && !proof) return [`O comprovativo é obrigatório para ${PAYMENT_METHODS[method].label.toLowerCase()}.`];
        }
        return [];
    };
    const next = () => {
        const list = stepErrors();
        setErrors(list);
        if (!list.length) setStep(value => Math.min(STEPS.length - 1, value + 1));
    };

    const confirm = async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        setSubmitting(true);
        setErrors([]);
        try {
            const check = await ServicoPagamentos.checkDraft(draft, actor, rows, credit?.clientId || '');
            if (check.errors.length) { setErrors(check.errors); return; }
            if (check.warnings.length && !acknowledged) { setWarnings(check.warnings); return; }
            const payment = ServicoPagamentos.buildPayment(draft, { id: identity.current.id, idempotencyKey: identity.current.key, clientName: credit?.clientName || '', actor });
            if (payment.status === 'pending') {
                const result = await ServicoPagamentos.registerPending(payment, proof);
                if (result.duplicate) { setErrors(['Este pagamento já tinha sido registado (pedido repetido ignorado).']); return; }
                onDone({ payment, pending: true });
            } else {
                await onRegisterConfirmed({ ...payment, hasProof: 0 });
                if (proof) await ServicoPagamentos.attachProof(payment.id, proof, actor);
                onDone({ payment, pending: false });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setErrors([/UNIQUE|idempot/i.test(message) ? 'Este pagamento já foi registado (duplo clique ou pedido repetido).' : message]);
        } finally {
            inFlight.current = false;
            setSubmitting(false);
        }
    };

    const allocation = preview?.allocation;
    const methodInfo = PAYMENT_METHODS[method];

    return (
        <Dialog open={open} onOpenChange={value => { if (!submitting) onOpenChange(value); }}>
            <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Registar pagamento</DialogTitle>
                    <DialogDescription>Passo {step + 1} de {STEPS.length}: {STEPS[step]}</DialogDescription>
                </DialogHeader>
                <ol className="grid grid-cols-5 gap-1.5" aria-label="Passos">
                    {STEPS.map((label, index) => (
                        <li key={label} className={cn('rounded-md px-2 py-1.5 text-center text-[11px] font-semibold leading-tight',
                            index === step ? 'bg-sidebar-primary text-sidebar-primary-foreground' : index < step ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
                            {index + 1}. {label}
                        </li>
                    ))}
                </ol>

                <div className="min-h-[260px] space-y-4 py-2">
                    {step === 0 && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label>Cliente</Label>
                                <SearchableSelect options={clientOptions} value={clientId} onValueChange={value => { setClientId(value); setCreditId(''); }} placeholder="Pesquisar cliente (nome, NIF, telefone)" searchPlaceholder="Nome, NIF ou telefone..." />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Contrato</Label>
                                <SearchableSelect options={contractOptions} value={creditId} onValueChange={value => { setCreditId(value); const found = payable.find(item => item.id === value); if (found) setClientId(found.clientId); }}
                                    placeholder="Escolher contrato" searchPlaceholder="Número ou cliente..." emptyMessage="Sem contratos activos." />
                            </div>
                        </div>
                    )}
                    {(step === 0 || step === 1) && creditId && (
                        <div className="rounded-lg border">
                            <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-2 text-sm">
                                <span className="font-semibold">Prestações em dívida (mora calculada até {dateOf(valueDateKey)})</span>
                                {loadingPreview && <Loader2 className="h-4 w-4 animate-spin" />}
                            </div>
                            {preview?.open.length ? (
                                <div className="max-h-56 overflow-y-auto text-sm">
                                    <div className="grid grid-cols-6 gap-2 px-3 py-1.5 text-[11px] font-bold uppercase text-muted-foreground">
                                        <span>Prest.</span><span>Vencimento</span><span className="text-right">Capital</span><span className="text-right">Juros</span><span className="text-right">Mora</span><span className="text-right">Em dívida</span>
                                    </div>
                                    {preview.open.map(item => (
                                        <div key={item.n} className={cn('grid grid-cols-6 gap-2 border-t px-3 py-1.5 tabular-nums', item.overdue && 'bg-red-50 dark:bg-red-500/10')}>
                                            <span>{item.n}.ª</span><span>{dateOf(item.dueDateKey)}{item.overdue ? ' ⚠' : ''}</span>
                                            <span className="text-right">{kz(item.principalMinor)}</span><span className="text-right">{kz(item.interestMinor)}</span>
                                            <span className="text-right">{kz(item.lateMinor)}</span><span className="text-right font-semibold">{kz(item.owedMinor)}</span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between border-t bg-muted/40 px-3 py-2 font-bold">
                                        <span>Dívida total na data-valor{preview.moraMinor ? ` (inclui ${kz(preview.moraMinor)} de mora nova)` : ''}</span><span>{kz(preview.totalDueMinor)}</span>
                                    </div>
                                </div>
                            ) : <p className="px-3 py-4 text-sm text-muted-foreground">{loadingPreview ? 'A calcular...' : 'Sem prestações em dívida.'}</p>}
                        </div>
                    )}
                    {step === 1 && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="value-date">Data-valor (dia em que o cliente pagou)</Label>
                                <Input id="value-date" type="date" max={today} value={valueDateKey} onChange={event => setValueDateKey(event.target.value)} />
                                <p className="text-xs text-muted-foreground">{canBackdate ? 'Datas anteriores a hoje recalculam a mora até essa data.' : 'Só pode usar a data de hoje (sem permissão para datas retroactivas).'}</p>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Valor recebido (Kz)</Label>
                                <CurrencyInput value={amount} onValueChange={setAmount} placeholder="0,00" />
                                {preview && (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {preview.open[0] && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAmount(preview.open[0].owedMinor / 100)}>Prestação mais antiga</Button>}
                                        {preview.open.some(item => item.overdue) && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAmount(preview.open.filter(item => item.overdue).reduce((sum, item) => sum + item.owedMinor, 0) / 100)}>Todo o atraso</Button>}
                                        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAmount(preview.totalDueMinor / 100)}>Dívida total</Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {step === 2 && allocation && (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">O valor é imputado pela ordem legal: primeiro a mora, depois os juros e por fim o capital, da prestação mais antiga para a mais recente.</p>
                            <div className="grid gap-3 sm:grid-cols-4">
                                {[['Juros de mora', allocation.lateInterestMinor, 'text-red-600'], ['Juros', allocation.interestMinor, 'text-amber-600'], ['Imposto do Selo', 0, 'text-slate-500'], ['Capital', allocation.principalMinor, 'text-indigo-600']].map(([label, value, color]) => (
                                    <div key={label as string} className="rounded-lg border p-3">
                                        <p className="text-xs font-semibold text-muted-foreground">{label as string}</p>
                                        <p className={cn('text-lg font-black tabular-nums', color as string)}>{kz(value as number)}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="rounded-lg border text-sm">
                                <div className="grid grid-cols-5 gap-2 bg-muted/50 px-3 py-1.5 text-[11px] font-bold uppercase text-muted-foreground">
                                    <span>Prestação</span><span className="text-right">Mora</span><span className="text-right">Juros</span><span className="text-right">Capital</span><span className="text-right">Situação</span>
                                </div>
                                {preview!.detail.map(item => (
                                    <div key={item.n} className="grid grid-cols-5 gap-2 border-t px-3 py-1.5 tabular-nums">
                                        <span>{item.n}.ª</span><span className="text-right">{kz(item.lateMinor)}</span><span className="text-right">{kz(item.interestMinor)}</span>
                                        <span className="text-right">{kz(item.principalMinor)}</span><span className={cn('text-right font-semibold', item.settled ? 'text-emerald-600' : 'text-amber-600')}>{item.settled ? 'Liquidada' : 'Parcial'}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between border-t bg-muted/40 px-3 py-2 font-semibold">
                                    <span>Capital em dívida após o pagamento</span><span>{kz(preview!.balanceAfterMinor)}</span>
                                </div>
                            </div>
                            {methodInfo.needsValidation && <p className="text-xs text-amber-700 dark:text-amber-300">Nota: por transferência ou depósito, a imputação definitiva é feita na validação, com a mesma regra.</p>}
                        </div>
                    )}
                    {step === 2 && !allocation && <p className="text-sm text-destructive">{previewError || 'Não foi possível calcular a imputação.'}</p>}
                    {step === 3 && (
                        <div className="space-y-4">
                            <div className="grid gap-2 sm:grid-cols-3">
                                {(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map(key => {
                                    const Icon = METHOD_ICONS[key];
                                    return (
                                        <button key={key} type="button" onClick={() => setMethod(key)} aria-pressed={method === key}
                                            className={cn('flex items-center gap-2 rounded-lg border p-3 text-left text-sm font-semibold transition-colors', method === key ? 'border-primary bg-primary/10 ring-2 ring-primary/30' : 'hover:bg-muted')}>
                                            <Icon className="h-4 w-4 shrink-0" /> {PAYMENT_METHODS[key].label}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="reference">Referência {method === 'cash' ? '(opcional)' : '(n.º da operação, talão ou referência)'}</Label>
                                    <Input id="reference" maxLength={120} value={reference} onChange={event => setReference(event.target.value)} placeholder="Ex.: BAI-778899" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Comprovativo {methodInfo.proofRequired ? <span className="text-destructive">(obrigatório)</span> : '(opcional)'}</Label>
                                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-muted">
                                        <FileUp className="h-4 w-4" />
                                        <span className="truncate">{proof ? proof.fileName : 'Escolher imagem ou PDF (máx. 1,5 MB)'}</span>
                                        <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden"
                                            onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { setProof(await readProof(file)); setErrors([]); } catch (error) { setErrors([error instanceof Error ? error.message : String(error)]); } }} />
                                    </label>
                                </div>
                            </div>
                            {/* Numerário: alçada de recebimento (acima dela, só por transferência). */}
                            {method === 'cash' && <RestanteLimite operationType="cash_receipt" amount={amount} />}
                            {methodInfo.needsValidation && (
                                <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    Entra como «Pendente de validação» e só conta como arrecadado depois de alguém com permissão confirmar a entrada no banco.
                                </p>
                            )}
                        </div>
                    )}
                    {step === 4 && (
                        <div className="space-y-3 text-sm">
                            <div className="grid gap-x-6 gap-y-2 rounded-lg border p-4 sm:grid-cols-2">
                                <p><span className="text-muted-foreground">Cliente:</span> <b>{credit?.clientName}</b></p>
                                <p><span className="text-muted-foreground">Contrato:</span> <b>{numbers.get(creditId)}</b></p>
                                <p><span className="text-muted-foreground">Data-valor:</span> <b>{dateOf(valueDateKey)}</b></p>
                                <p><span className="text-muted-foreground">Valor:</span> <b>{formatCurrency(amount)}</b></p>
                                <p><span className="text-muted-foreground">Método:</span> <b>{methodInfo.label}</b></p>
                                <p><span className="text-muted-foreground">Referência:</span> <b>{reference || '—'}</b></p>
                                {allocation && <p className="sm:col-span-2"><span className="text-muted-foreground">Imputação:</span> <b>mora {kz(allocation.lateInterestMinor)} · juros {kz(allocation.interestMinor)} · capital {kz(allocation.principalMinor)}</b></p>}
                                <p className="sm:col-span-2"><span className="text-muted-foreground">Resultado:</span> <b>{methodInfo.needsValidation ? 'pendente de validação (sem recibo até à validação)' : 'confirmado, com recibo e lançamento contabilístico na mesma operação'}</b></p>
                            </div>
                            {warnings.length > 0 && (
                                <div className="space-y-2 rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                                    {warnings.map(item => <p key={item} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{item}</p>)}
                                    <label className="flex items-center gap-2 font-semibold"><Checkbox checked={acknowledged} onCheckedChange={value => setAcknowledged(Boolean(value))} /> Confirmo que não é um pagamento duplicado</label>
                                </div>
                            )}
                        </div>
                    )}
                    {errors.length > 0 && (
                        <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                            {errors.map(item => <p key={item} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{item}</p>)}
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
                    <Button variant="ghost" onClick={() => step === 0 ? onOpenChange(false) : (setErrors([]), setStep(step - 1))} disabled={submitting}>
                        {step === 0 ? 'Cancelar' : <><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</>}
                    </Button>
                    {step < STEPS.length - 1 ? (
                        <Button onClick={next} disabled={(step === 2 && !allocation) || loadingPreview && step === 1}>Seguinte <ArrowRight className="ml-1 h-4 w-4" /></Button>
                    ) : (
                        <Button onClick={confirm} disabled={submitting || (warnings.length > 0 && !acknowledged)} className="gap-2">
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            {submitting ? 'A registar...' : methodInfo.needsValidation ? 'Registar como pendente' : 'Confirmar e emitir recibo'}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
