import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Ban, BookOpen, CheckCircle2, Copy, FileText, Landmark, Mail, MessageCircle, Paperclip, Printer, Receipt, ShieldCheck, Upload } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/componentes/ui/sheet';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Separator } from '@/componentes/ui/separator';
import { PdfCanvasViewer } from '@/componentes/ui/PdfCanvasViewer';
import { InvestigacaoAuditoria } from '@/componentes/auditoria/InvestigacaoAuditoria';
import { formatCurrency } from '@/bibliotecas/formatters';
import { formatLuandaDate, formatLuandaDateTime, formatRegistration } from '@/bibliotecas/fuso-angola';
import { cn } from '@/bibliotecas/utils';
import { PAYMENT_STATUS, type PaymentRow } from '@/bibliotecas/pagamentos-analise';
import { ServicoPagamentos } from '@/servicos/ServicoPagamentos';

type Extra = {
    proof?: { fileName: string; mimeType: string; dataUrl: string; uploadedAt: string; uploadedBy: string };
    entries: Awaited<ReturnType<typeof ServicoPagamentos.accountingEntries>>;
    audit: Awaited<ReturnType<typeof ServicoPagamentos.auditTrail>>;
    bank: { state: 'not_applicable' | 'matched' | 'unmatched'; detail: string };
};

const ENTRY_LABELS: Record<string, string> = { payment: 'Recebimento', reversal: 'Estorno', restore: 'Reposição', late_interest: 'Juros de mora' };
const ACTION_LABELS: Record<string, string> = { create: 'Registo', update: 'Validação / alteração', delete: 'Anulação', export: 'Exportação', import: 'Importação', restore: 'Reposição' };

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <div className={cn('truncate text-sm font-medium', mono && 'font-mono text-xs')}>{value || '—'}</div>
        </div>
    );
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-bold"><Icon className="h-4 w-4 text-primary" /> {title}</h3>
            {children}
        </section>
    );
}

export function DetalhePagamento({ row, open, onOpenChange, clientPhone, actions }: {
    row: PaymentRow | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clientPhone?: string;
    actions: {
        print: (row: PaymentRow, kind: 'a4' | 'thermal') => void;
        download: (row: PaymentRow, kind: 'a4' | 'thermal' | 'second') => void;
        whatsapp: (row: PaymentRow) => void;
        email: (row: PaymentRow) => void;
        cancel: (row: PaymentRow) => void;
        validate: (row: PaymentRow) => void;
        attachProof: (row: PaymentRow, file: File) => Promise<void>;
        canCancel: boolean;
        canValidate: boolean;
    };
}) {
    const [extra, setExtra] = useState<Extra | null>(null);
    const [version, setVersion] = useState(0);
    const [historyOpen, setHistoryOpen] = useState(false);

    useEffect(() => {
        if (!row || !open) return;
        let cancelled = false;
        setExtra(null);
        (async () => {
            const [proof, entries, audit, bank] = await Promise.all([
                row.payment.hasProof ? ServicoPagamentos.getProof(row.id) : Promise.resolve(undefined),
                ServicoPagamentos.accountingEntries(row.id),
                ServicoPagamentos.auditTrail(row.id),
                ServicoPagamentos.bankReconciliation(row.payment),
            ]);
            if (!cancelled) setExtra({ proof: proof || undefined, entries, audit, bank });
        })().catch(error => console.error('[Pagamentos] Falha ao carregar o detalhe:', error));
        return () => { cancelled = true; };
    }, [row, open, version]);

    if (!row) return null;
    const status = PAYMENT_STATUS[row.status];
    const hasReceipt = Boolean(row.receipt);
    const p = row.payment;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
                <SheetHeader className="space-y-1 pr-6 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                        <SheetTitle className="font-mono text-lg">{row.receipt || 'Pagamento por validar'}</SheetTitle>
                        <Badge variant={status?.variant || 'default'}>{status?.label || row.status}</Badge>
                    </div>
                    <SheetDescription>
                        {formatCurrency(row.total)} · {row.methodLabel} · data-valor {formatLuandaDate(`${row.valueDateKey}T12:00:00Z`)}
                    </SheetDescription>
                </SheetHeader>

                {row.status === 'cancelled' && (
                    <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                        <p className="font-bold text-destructive">ANULADO em {formatLuandaDateTime(p.cancelledAt)}</p>
                        <p>Por {p.cancelledBy || '—'}{p.cancelApprovedBy ? ` · aprovado por ${p.cancelApprovedBy}` : ''}</p>
                        <p className="text-muted-foreground">Motivo: {p.cancelReason || '—'}</p>
                    </div>
                )}
                {row.status === 'pending' && (
                    <div className="mt-4 flex gap-2 rounded-lg border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>Pendente de validação: ainda não conta como arrecadado. A imputação, o recibo e o lançamento são gerados quando alguém com permissão confirmar a entrada no banco.</p>
                    </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                    {row.status === 'pending' && actions.canValidate && <Button size="sm" className="gap-1.5" onClick={() => actions.validate(row)}><CheckCircle2 className="h-4 w-4" /> Validar transferência</Button>}
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={!hasReceipt} onClick={() => actions.print(row, 'a4')}><Printer className="h-4 w-4" /> Imprimir recibo</Button>
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={!hasReceipt} onClick={() => actions.print(row, 'thermal')}><Receipt className="h-4 w-4" /> Talão 80 mm</Button>
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={!hasReceipt} onClick={() => actions.download(row, 'second')}><Copy className="h-4 w-4" /> 2.ª via</Button>
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={!hasReceipt || row.status === 'cancelled' || !clientPhone} onClick={() => actions.whatsapp(row)}><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={!hasReceipt || row.status === 'cancelled'} onClick={() => actions.email(row)}><Mail className="h-4 w-4" /> Email</Button>
                    {row.status !== 'cancelled' && actions.canCancel && (
                        <Button size="sm" variant="outline" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => actions.cancel(row)}><Ban className="h-4 w-4" /> Anular</Button>
                    )}
                </div>

                <div className="mt-6 space-y-6">
                    <Section icon={FileText} title="Resumo do pagamento e do cliente">
                        <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
                            <Field label="Cliente" value={row.clientName} />
                            <Field label="Telefone" value={clientPhone} />
                            <Field label="Contrato" value={<Link className="text-primary hover:underline" to={`/creditos?search=${encodeURIComponent(row.creditId)}`}>{row.contract}</Link>} />
                            <Field label="Produto / carteira" value={row.product} />
                            <Field label="Data-valor" value={formatLuandaDate(`${row.valueDateKey}T12:00:00Z`)} />
                            <Field label="Registado em" value={`${formatRegistration(row.registeredAt)} (Luanda)`} />
                            <Field label="Operador" value={row.operator} />
                            <Field label="Gestor do cliente" value={row.managerName} />
                            <Field label="Método" value={row.methodLabel} />
                            <Field label="Referência" value={row.reference} mono />
                            {p.validatedAt && <Field label="Validado" value={`${formatLuandaDateTime(p.validatedAt)} por ${p.validatedBy}`} />}
                            {row.batchId && <Field label="Lote de importação" value={row.batchId.slice(0, 8)} mono />}
                        </div>
                    </Section>

                    <Section icon={BookOpen} title="Imputação">
                        {row.status === 'pending' ? <p className="text-sm text-muted-foreground">Calculada na validação (mora → juros → capital, da prestação mais antiga para a mais recente).</p> : (
                            <div className="overflow-hidden rounded-lg border text-sm">
                                <div className="grid grid-cols-5 gap-2 bg-muted/60 px-3 py-2 text-[11px] font-bold uppercase text-muted-foreground">
                                    <span>Prestação</span><span className="text-right">Mora</span><span className="text-right">Juros</span><span className="text-right">I. Selo</span><span className="text-right">Capital</span>
                                </div>
                                {(row.installments.length ? row.installments : [{ n: 0, principalMinor: Math.round(row.principal * 100), interestMinor: Math.round(row.interest * 100), lateMinor: Math.round(row.late * 100), settled: false }]).map(item => (
                                    <div key={item.n} className="grid grid-cols-5 gap-2 border-t px-3 py-1.5 tabular-nums">
                                        <span>{item.n ? `${item.n}.ª${item.settled ? ' ✓' : ''}` : 'Contrato'}</span>
                                        <span className="text-right">{formatCurrency(item.lateMinor / 100)}</span>
                                        <span className="text-right">{formatCurrency(item.interestMinor / 100)}</span>
                                        <span className="text-right">{formatCurrency(0)}</span>
                                        <span className="text-right">{formatCurrency(item.principalMinor / 100)}</span>
                                    </div>
                                ))}
                                <div className="grid grid-cols-5 gap-2 border-t bg-muted/40 px-3 py-2 font-bold tabular-nums">
                                    <span>Total</span><span className="text-right">{formatCurrency(row.late)}</span><span className="text-right">{formatCurrency(row.interest)}</span>
                                    <span className="text-right">{formatCurrency(row.other)}</span><span className="text-right">{formatCurrency(row.principal)}</span>
                                </div>
                                {row.balanceAfter !== null && <p className="border-t px-3 py-2 text-xs text-muted-foreground">Capital em dívida após o pagamento: <b>{formatCurrency(row.balanceAfter)}</b></p>}
                            </div>
                        )}
                    </Section>

                    <Section icon={Paperclip} title="Comprovativo">
                        {!extra ? <div className="h-16 animate-pulse rounded-lg bg-muted" /> : extra.proof ? (
                            <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">{extra.proof.fileName} · anexado por {extra.proof.uploadedBy} em {formatLuandaDateTime(extra.proof.uploadedAt)}</p>
                                {extra.proof.mimeType === 'application/pdf'
                                    ? <PdfCanvasViewer source={extra.proof.dataUrl} className="max-h-96 overflow-auto rounded-lg border" />
                                    : <img src={extra.proof.dataUrl} alt="Comprovativo do pagamento" className="max-h-96 w-full rounded-lg border object-contain" />}
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                                <span>Sem comprovativo anexado.</span>
                                {row.status !== 'cancelled' && (
                                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                                        <Upload className="h-3.5 w-3.5" /> Anexar
                                        <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden"
                                            onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { await actions.attachProof(row, file); setVersion(value => value + 1); } }} />
                                    </label>
                                )}
                            </div>
                        )}
                    </Section>

                    <Section icon={Landmark} title="Lançamento contabilístico e conciliação bancária">
                        {!extra ? <div className="h-16 animate-pulse rounded-lg bg-muted" /> : (
                            <div className="space-y-2">
                                {extra.entries.length ? extra.entries.map(entry => (
                                    <div key={entry.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                                        <div className="min-w-0">
                                            <p className="font-semibold">{ENTRY_LABELS[entry.type] || entry.type} · {formatCurrency(entry.amountTotal)}</p>
                                            <p className="truncate text-xs text-muted-foreground">{formatLuandaDateTime(entry.timestamp)} · Débito {entry.debit} / Crédito {entry.credit}</p>
                                        </div>
                                        <Link to={`/contabilidade?search=${encodeURIComponent(entry.id)}`} className="shrink-0 text-xs font-semibold text-primary hover:underline">Abrir na Contabilidade</Link>
                                    </div>
                                )) : <p className="text-sm text-muted-foreground">{row.status === 'pending' ? 'O lançamento é gerado na validação.' : 'Sem lançamentos associados.'}</p>}
                                <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm', extra.bank.state === 'matched' ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-muted/50 text-muted-foreground')}>
                                    <ShieldCheck className="h-4 w-4 shrink-0" />
                                    <span><b>{extra.bank.state === 'matched' ? 'Conciliado' : extra.bank.state === 'not_applicable' ? 'Não aplicável' : 'Por conciliar'}:</b> {extra.bank.detail}</span>
                                </div>
                            </div>
                        )}
                    </Section>

                    <Section icon={ShieldCheck} title="Histórico de auditoria">
                        {!extra ? <div className="h-16 animate-pulse rounded-lg bg-muted" /> : extra.audit.length ? (
                            <ol className="relative space-y-3 border-l pl-4">
                                {extra.audit.map(item => (
                                    <li key={item.id} className="text-sm">
                                        <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                                        <p className="font-semibold">{ACTION_LABELS[item.action] || item.action} · {item.userName || 'Sistema'}</p>
                                        <p className="text-xs text-muted-foreground">{formatLuandaDateTime(item.timestamp)}</p>
                                        <p className="text-xs">{item.details}</p>
                                        {(() => { try { const reason = JSON.parse(item.metadata || '{}').reason || JSON.parse(item.metadata || '{}').justification; return reason ? <p className="text-xs italic text-muted-foreground">Motivo: {reason}</p> : null; } catch { return null; } })()}
                                    </li>
                                ))}
                            </ol>
                        ) : <p className="text-sm text-muted-foreground">Sem registos de auditoria.</p>}
                    </Section>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setHistoryOpen(true)}><ShieldCheck className="h-4 w-4" /> Histórico completo na auditoria</Button>
                    <InvestigacaoAuditoria target={historyOpen ? { mode: 'entity', key: row.id, label: row.receipt || 'Pagamento' } : null} events={[]} onClose={() => setHistoryOpen(false)} extraTerms={row.receipt ? [row.receipt] : []} />
                    <Separator />
                    <p className="pb-4 text-[11px] text-muted-foreground">ID interno: <span className="font-mono">{row.id}</span></p>
                </div>
            </SheetContent>
        </Sheet>
    );
}
