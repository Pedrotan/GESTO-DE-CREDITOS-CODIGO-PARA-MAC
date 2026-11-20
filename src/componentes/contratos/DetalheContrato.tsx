import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    CheckCircle2, Circle, CreditCard, Download, ExternalLink, Eye, FileText, Loader2, MessageCircle, Scale, Upload,
} from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/componentes/ui/sheet';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Separator } from '@/componentes/ui/separator';
import { useToast } from '@/componentes/ui/use-toast';
import { luandaDateKey } from '@/bibliotecas/fuso-angola';
import type { InstallmentRow } from '@/bibliotecas/carteira-credito';
import { CONTRACT_STATES, kz, type ContractDocument, type ContractRow } from '@/bibliotecas/contratos-analise';
import { ServicoCarteira } from '@/servicos/ServicoCarteira';

const DOCS: Array<{ kind: string; label: string }> = [
    { kind: 'contrato', label: 'Contrato assinado' },
    { kind: 'bi', label: 'Bilhete de Identidade' },
    { kind: 'comprovativo', label: 'Comprovativo de rendimentos' },
    { kind: 'livranca', label: 'Garantia (livrança)' },
];
const dateText = (key: string | null | undefined) => key ? `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}` : '—';
const num = (value: unknown) => Number(value) || 0;

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
    return (
        <div className="min-w-0 rounded-lg border p-2.5">
            <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
            <p className={`truncate text-sm font-bold ${tone || ''}`} title={value}>{value}</p>
        </div>
    );
}

/** Painel de detalhe do contrato, ao lado da lista: resumo, ciclo de vida, próximas prestações, documentos e acções. */
export function DetalheContrato({ row, installments, documents, today, actor, onClose, onPreview, onDownload, onWhatsApp, onChanged }: {
    row: ContractRow | null;
    installments: InstallmentRow[];
    documents: ContractDocument[];
    today: string;
    actor: { id: string; name: string; role: string } | null;
    onClose: () => void;
    onPreview: (row: ContractRow) => void;
    onDownload: (row: ContractRow) => void;
    onWhatsApp: (row: ContractRow) => void;
    onChanged: () => void;
}) {
    const navigate = useNavigate();
    const { toast } = useToast();
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploadKind, setUploadKind] = useState('contrato');
    const [busy, setBusy] = useState(false);

    const plan = useMemo(() => row ? installments.filter(item => item.creditId === row.id && item.status !== 'cancelled' && (num(item.principalMinor) + num(item.interestMinor)) > 0)
        .sort((a, b) => num(a.installmentNumber) - num(b.installmentNumber)) : [], [row, installments]);
    const upcoming = useMemo(() => {
        let marked = false;
        return plan.map(item => {
            const due = luandaDateKey(item.dueDate);
            const owed = num(item.principalMinor) + num(item.interestMinor) - num(item.paidPrincipalMinor) - num(item.paidInterestMinor);
            let status: 'Paga' | 'Em atraso' | 'Próxima' | 'Por vencer' = 'Por vencer';
            if (owed <= 0) status = 'Paga';
            else if (due < today) status = 'Em atraso';
            else if (!marked) { status = 'Próxima'; marked = true; }
            return { item, due, owed, status };
        }).filter(entry => entry.status !== 'Paga').slice(0, 6);
    }, [plan, today]);
    const docs = useMemo(() => row ? documents.filter(doc => doc.creditId === row.id) : [], [row, documents]);

    if (!row) return <Sheet open={false} onOpenChange={() => onClose()}><SheetContent side="right" /></Sheet>;
    const credit = row.portfolio?.credit;
    const contractDoc = docs.filter(doc => doc.kind === 'contrato').sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))[0];
    const steps = [
        { label: 'Pedido submetido', date: credit?.requestedAt || credit?.createdAt || row.contract.createdAt, detail: credit?.requestedBy },
        { label: 'Aprovado', date: credit?.approvedBy ? (credit?.startDate || null) : null, detail: credit?.approvedBy, done: !!credit?.approvedBy || ['em_dia', 'atraso', 'liquidado'].includes(row.state) },
        { label: 'Contrato assinado', date: contractDoc?.uploadedAt || null, detail: contractDoc ? 'Cópia carregada' : 'Cópia assinada em falta', done: !!contractDoc },
        { label: 'Desembolsado', date: credit?.startDate || row.contract.startDate, done: ['em_dia', 'atraso', 'liquidado'].includes(row.state) },
        { label: 'Liquidado', date: row.portfolio?.paidOffKey || null, done: row.state === 'liquidado' },
    ].map(step => ({ ...step, done: step.done ?? !!step.date }));

    const upload = async (file: File | undefined) => {
        if (!file || !actor) return;
        setBusy(true);
        try {
            const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Não foi possível ler o ficheiro.')); reader.readAsDataURL(file); });
            await ServicoCarteira.addDocument({ creditId: row.id, kind: uploadKind, fileName: file.name, mimeType: file.type, dataUrl }, actor);
            toast({ title: 'Documento carregado', description: `${file.name} ficou anexado ao contrato ${row.number}.` });
            onChanged();
        } catch (error) {
            toast({ title: 'Não foi possível carregar', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
        } finally {
            setBusy(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };
    const chooseFile = (kind: string) => { setUploadKind(kind); fileRef.current?.click(); };

    return (
        <Sheet open onOpenChange={open => { if (!open) onClose(); }}>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
                <SheetHeader className="space-y-1 pr-6 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-black" title={row.id}>{row.number}</span>
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${CONTRACT_STATES[row.state].badge}`}>{CONTRACT_STATES[row.state].label}</span>
                        <Badge variant="outline" className="text-[10px]">Risco {row.risk}</Badge>
                    </div>
                    <SheetTitle className="text-xl">{row.clientName}</SheetTitle>
                    <SheetDescription>
                        NIF/BI {row.nif || '—'} · {row.phone || 'sem telefone'} · Gestor: {row.managerName}
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-4 grid grid-cols-2 gap-2">
                    <Fact label="Montante" value={kz(row.amountMinor)} />
                    <Fact label="Saldo em dívida" value={kz(row.outstandingMinor)} />
                    <Fact label="Em atraso" value={kz(row.overdueMinor)} tone={row.overdueMinor > 0 ? 'text-orange-600' : ''} />
                    <Fact label="Reembolsado" value={kz(row.repaidMinor)} />
                    <Fact label="Taxa e prazo" value={`${row.rate ? `${String(row.rate).replace('.', ',')}%` : '—'} · ${row.totalCount || '—'} prestações`} />
                    <Fact label="Vigência" value={`${dateText(row.startKey)} a ${dateText(row.endKey)}`} />
                    <Fact label="Produto" value={row.product} />
                    <Fact label="Juros de mora por cobrar" value={kz(row.moraMinor)} tone={row.moraMinor > 0 ? 'text-red-600' : ''} />
                </div>

                <Separator className="my-4" />
                <h3 className="mb-2 text-sm font-bold">Ciclo de vida</h3>
                <ol className="space-y-2">
                    {steps.map(step => (
                        <li key={step.label} className="flex items-start gap-2 text-sm">
                            {step.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                            <div className="min-w-0">
                                <p className={step.done ? 'font-semibold' : 'text-muted-foreground'}>{step.label}</p>
                                <p className="text-xs text-muted-foreground">{step.date ? dateText(luandaDateKey(step.date as any)) : '—'}{step.detail ? ` · ${step.detail}` : ''}</p>
                            </div>
                        </li>
                    ))}
                </ol>

                <Separator className="my-4" />
                <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-bold">Plano de pagamentos</h3>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigate(`/creditos/${row.id}`)}>Plano completo <ExternalLink className="ml-1 h-3 w-3" /></Button>
                </div>
                {upcoming.length === 0 ? (
                    <p className="rounded-lg bg-muted/30 py-3 text-center text-xs text-muted-foreground">{plan.length ? 'Todas as prestações estão pagas.' : 'Sem plano de prestações registado.'}</p>
                ) : (
                    <ul className="divide-y rounded-lg border text-sm">
                        {upcoming.map(entry => (
                            <li key={entry.item.id} className="flex items-center justify-between gap-2 px-3 py-2">
                                <span className="font-semibold">{entry.item.installmentNumber}.ª · {dateText(entry.due)}</span>
                                <span className="ml-auto font-semibold">{kz(entry.owed)}</span>
                                <span className={`w-20 text-right text-[11px] font-bold ${entry.status === 'Em atraso' ? 'text-red-600' : entry.status === 'Próxima' ? 'text-amber-600' : 'text-muted-foreground'}`}>{entry.status}</span>
                            </li>
                        ))}
                    </ul>
                )}

                <Separator className="my-4" />
                <h3 className="mb-2 text-sm font-bold">Documentos</h3>
                <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={event => void upload(event.target.files?.[0])} />
                <ul className="space-y-2">
                    {DOCS.map(doc => {
                        const found = docs.filter(item => item.kind === doc.kind);
                        const expiring = doc.kind === 'bi' && row.idExpiresDuringContract;
                        const status = found.length ? (expiring ? 'A expirar' : 'OK') : 'Em falta';
                        const tone = status === 'OK' ? 'text-emerald-600' : status === 'A expirar' ? 'text-amber-600' : 'text-red-600';
                        return (
                            <li key={doc.kind} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold">{doc.label}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {found.length ? `${found[0].fileName} · ${dateText(luandaDateKey(found[0].uploadedAt))}` : 'Não carregado'}
                                        {doc.kind === 'bi' && row.idExpiryKey ? ` · validade ${dateText(row.idExpiryKey)}` : ''}
                                    </p>
                                </div>
                                <span className={`text-[11px] font-bold ${tone}`}>{status}</span>
                                {found.length > 0 && !expiring
                                    ? <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate(`/creditos/${row.id}`)}>Abrir</Button>
                                    : <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy || !actor} onClick={() => chooseFile(doc.kind)}>
                                        {busy && uploadKind === doc.kind ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} {expiring ? 'Actualizar' : 'Carregar'}
                                    </Button>}
                            </li>
                        );
                    })}
                </ul>

                <Separator className="my-4" />
                <h3 className="mb-2 text-sm font-bold">Acções</h3>
                <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => onDownload(row)}><Download className="h-4 w-4" /> Gerar PDF do contrato</Button>
                    <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => onPreview(row)}><Eye className="h-4 w-4" /> Ver e editar contrato</Button>
                    <Button variant="outline" size="sm" className="justify-start gap-2" disabled={!row.phone} onClick={() => onWhatsApp(row)}><MessageCircle className="h-4 w-4 text-emerald-600" /> Enviar por WhatsApp</Button>
                    <Button variant="outline" size="sm" className="justify-start gap-2" disabled={!['em_dia', 'atraso'].includes(row.state)} onClick={() => navigate(`/pagamentos?search=${encodeURIComponent(row.number)}`)}><CreditCard className="h-4 w-4" /> Registar pagamento</Button>
                    <Button variant="outline" size="sm" className="col-span-2 justify-start gap-2" onClick={() => navigate(`/creditos/${row.id}`)}>
                        <Scale className="h-4 w-4" /> Ficha do crédito: aditamento, liquidação antecipada, reestruturação, contencioso
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
