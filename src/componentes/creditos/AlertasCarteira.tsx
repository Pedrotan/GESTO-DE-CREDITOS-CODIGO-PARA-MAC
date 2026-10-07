import { useMemo, useState } from 'react';
import { BellRing, CalendarClock, MessageCircle, Phone, Receipt, ShieldAlert, TimerOff, TriangleAlert } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { formatCurrency } from '@/bibliotecas/formatters';
import { getWhatsAppLink } from '@/bibliotecas/whatsapp';
import type { CreditAlert, PortfolioRow } from '@/bibliotecas/carteira-credito';
import { Button } from '@/componentes/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/componentes/ui/sheet';
import { ServicoCarteira } from '@/servicos/ServicoCarteira';

const GROUPS: Array<{ kinds: CreditAlert['kind'][]; label: string; icon: typeof BellRing; css: string }> = [
    { kinds: ['due_today'], label: 'Vencem hoje', icon: CalendarClock, css: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100' },
    { kinds: ['due_soon'], label: 'Vencem nos próximos 3 dias', icon: CalendarClock, css: 'border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100' },
    { kinds: ['overdue_today'], label: 'Entraram em atraso hoje', icon: TriangleAlert, css: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100' },
    { kinds: ['aging_30', 'aging_60', 'aging_90'], label: 'Passaram de 30, 60 ou 90 dias', icon: ShieldAlert, css: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100' },
    { kinds: ['promise_broken'], label: 'Promessas falhadas', icon: TimerOff, css: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100' },
];

export function AlertasCarteira({ alerts, phoneOf, onPay, onOpen, actor }: {
    alerts: CreditAlert[]; phoneOf: (clientId: string) => string; onPay: (row: PortfolioRow) => void; onOpen: (row: PortfolioRow) => void;
    actor: { id: string; name: string; role: string; permissions?: string[] } | null;
}) {
    const [open, setOpen] = useState<number | null>(null);
    const [notice, setNotice] = useState('');
    const groups = useMemo(() => GROUPS.map(group => ({ ...group, items: alerts.filter(alert => group.kinds.includes(alert.kind)) })), [alerts]);
    if (!alerts.length) return null;
    const selected = open === null ? null : groups[open];
    const remind = async (row: PortfolioRow) => {
        const phone = phoneOf(row.clientId);
        const text = `Olá ${row.clientName}, lembramos o pagamento do seu crédito ${row.reference}${row.daysOverdue > 0 ? `, em atraso há ${row.daysOverdue} dia(s)` : ''}: ${formatCurrency((row.nextDueMinor || row.overdueMinor) / 100)}. Obrigado.`;
        window.open(getWhatsAppLink(phone, text), '_blank');
        if (actor) await ServicoCarteira.recordReminders([row.id], 'WhatsApp', actor).then(() => setNotice(`Lembrete a ${row.clientName} registado no histórico de cobrança.`)).catch(error => setNotice(error.message));
    };
    return (
        <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-sm">
                <span className="flex items-center gap-1.5 px-2 text-sm font-bold"><BellRing className="h-4 w-4 text-primary" /> Alertas</span>
                {groups.map((group, index) => group.items.length > 0 && (
                    <button key={group.label} type="button" onClick={() => setOpen(index)}
                        className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-transform hover:scale-[1.03]', group.css)}>
                        <group.icon className="h-3.5 w-3.5" /> {group.label} <strong>({group.items.length})</strong>
                    </button>
                ))}
            </div>
            <Sheet open={open !== null} onOpenChange={value => { if (!value) { setOpen(null); setNotice(''); } }}>
                <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
                    <SheetHeader>
                        <SheetTitle>{selected?.label}</SheetTitle>
                        <SheetDescription>Ligue, envie um lembrete ou registe o pagamento diretamente daqui.</SheetDescription>
                    </SheetHeader>
                    {notice && <p className="mt-3 rounded-md bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</p>}
                    <div className="mt-4 space-y-2">
                        {selected?.items.map(alert => (
                            <div key={alert.id} className="space-y-2 rounded-xl border p-3">
                                <button type="button" className="text-left" onClick={() => onOpen(alert.row)}>
                                    <p className="font-semibold hover:underline">{alert.row.clientName}</p>
                                    <p className="text-xs text-muted-foreground">{alert.row.reference} · {alert.label} · {alert.detail}</p>
                                </button>
                                <div className="flex flex-wrap gap-1.5">
                                    <Button asChild size="sm" variant="outline" className="h-8 gap-1"><a href={`tel:${phoneOf(alert.row.clientId)}`}><Phone className="h-3.5 w-3.5" /> Ligar</a></Button>
                                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => void remind(alert.row)}><MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> Lembrete WhatsApp</Button>
                                    <Button asChild size="sm" variant="outline" className="h-8 gap-1"><a href={`sms:${phoneOf(alert.row.clientId)}`}><MessageCircle className="h-3.5 w-3.5" /> SMS</a></Button>
                                    <Button size="sm" className="h-8 gap-1" onClick={() => onPay(alert.row)}><Receipt className="h-3.5 w-3.5" /> Registar pagamento</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
