import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { formatKz, formatShortKz, usageTone, type UsageMeter } from '@/bibliotecas/alcadas';
import { ServicoAuditoriaAvancada } from '@/servicos/ServicoAuditoriaAvancada';
import { Textarea } from '@/componentes/ui/textarea';

/** Converte "1 000 000,50" (ou "1000000.5") em cêntimos; vazio = null (sem teto). */
function parseKzText(text: string): number | null | 'invalid' {
    const raw = text.replace(/\s|kz/gi, '').trim();
    if (!raw) return null;
    let normalized = raw;
    if (!raw.includes(',') && /\.\d{1,2}$/.test(raw)) normalized = raw.replace('.', ',');
    normalized = normalized.replace(/\./g, '');
    if (!/^\d+(,\d{0,2})?$/.test(normalized)) return 'invalid';
    const [whole, cents = ''] = normalized.split(',');
    const value = Number(whole) * 100 + Number(cents.padEnd(2, '0'));
    return Number.isSafeInteger(value) ? value : 'invalid';
}

/** Campo de valor em Kz com máscara "1 000 000,00"; vazio significa "sem teto" quando permitido. */
export function MoneyCell({ value, onChange, invalid, title, disabled, allowEmpty = true, className, ariaLabel, emptyLabel = 'Sem teto' }: {
    value: number | null | undefined; onChange: (value: number | null) => void; invalid?: string | null; title?: string; disabled?: boolean;
    allowEmpty?: boolean; className?: string; ariaLabel?: string; emptyLabel?: string;
}) {
    const focused = useRef(false);
    const format = (minor: number | null | undefined) => minor === null || minor === undefined ? '' : formatKz(minor, false);
    const [text, setText] = useState(format(value));
    const [bad, setBad] = useState(false);
    useEffect(() => { if (!focused.current) setText(format(value)); }, [value]);
    const commit = (raw: string) => {
        const parsed = parseKzText(raw);
        if (parsed === 'invalid' || (parsed === null && !allowEmpty)) { setBad(true); return; }
        setBad(false);
        onChange(parsed);
    };
    return (
        <div className={cn('relative', className)} title={invalid || title}>
            <input
                aria-label={ariaLabel} disabled={disabled} inputMode="decimal" value={text}
                placeholder={allowEmpty ? emptyLabel : '0,00'}
                onFocus={() => { focused.current = true; }}
                onChange={event => { setText(event.target.value); commit(event.target.value); }}
                onBlur={() => { focused.current = false; setText(format(value)); }}
                className={cn('h-9 w-full min-w-[150px] rounded-md border bg-background px-2 pr-8 text-right font-mono text-[13px] tabular-nums outline-none transition-colors',
                    'focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50',
                    (invalid || bad) ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'border-input')}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">Kz</span>
        </div>
    );
}

/** Campo numérico (quantidades e percentagens); vazio = sem teto. */
export function NumberCell({ value, onChange, invalid, suffix, disabled, ariaLabel, step = 1, emptyLabel = 'Sem teto' }: {
    value: number | null | undefined; onChange: (value: number | null) => void; invalid?: string | null; suffix?: string; disabled?: boolean; ariaLabel?: string; step?: number; emptyLabel?: string;
}) {
    return (
        <div className="relative" title={invalid || undefined}>
            <input
                aria-label={ariaLabel} type="number" min={0} step={step} disabled={disabled} placeholder={emptyLabel} value={value ?? ''}
                onChange={event => onChange(event.target.value === '' ? null : Math.max(0, Number(event.target.value)))}
                className={cn('h-9 w-full min-w-[84px] rounded-md border bg-background px-2 text-right font-mono text-[13px] tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/25',
                    suffix && 'pr-7', invalid ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'border-input')}
            />
            {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">{suffix}</span>}
        </div>
    );
}

/** Motivo obrigatório com as mesmas validações da Auditoria (20+ caracteres, 3+ palavras, não repetido). */
export function JustificationField({ value, onChange, userId, label = 'Motivo (obrigatório)', placeholder, onValidity }: {
    value: string; onChange: (value: string) => void; userId?: string | null; label?: string; placeholder?: string; onValidity?: (valid: boolean) => void;
}) {
    const [message, setMessage] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        const timer = window.setTimeout(async () => {
            const result = value.trim() ? await ServicoAuditoriaAvancada.checkJustification(value, userId).catch(() => null) : 'Escreva o motivo.';
            if (!cancelled) { setMessage(result); onValidity?.(!result); }
        }, 250);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, [value, userId]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <div className="space-y-1.5">
            <label className="text-sm font-semibold">{label}</label>
            <Textarea rows={3} value={value} onChange={event => onChange(event.target.value)}
                placeholder={placeholder || 'Ex.: Ajuste aprovado pela comissão executiva para a campanha de crédito salário de novembro.'} />
            {value.trim() && (message
                ? <p className="flex items-center gap-1 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5" /> {message}</p>
                : <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Motivo válido.</p>)}
        </div>
    );
}

const TONE: Record<'green' | 'yellow' | 'red', { bar: string; text: string }> = {
    green: { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
    yellow: { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
    red: { bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400' },
};

/** Barra de consumo: "1 350 000 de 2 000 000 Kz · 68%" (verde < 70%, amarelo 70–90%, vermelho > 90%). */
export function MeterBar({ meter, label, unit = 'kz', compact }: { meter: UsageMeter; label?: string; unit?: 'kz' | 'count'; compact?: boolean }) {
    const pct = meter.pct ?? 0;
    const tone = TONE[usageTone(pct)];
    const used = unit === 'kz' ? formatShortKz(meter.used) : String(meter.used);
    const limit = meter.limit === null ? 'sem teto' : unit === 'kz' ? `${formatShortKz(meter.limit)} Kz` : String(meter.limit);
    return (
        <div className={cn('min-w-[180px]', compact ? 'space-y-0.5' : 'space-y-1')}>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
                {label && <span className="font-semibold text-muted-foreground">{label}</span>}
                <span className="ml-auto font-mono tabular-nums">
                    {used} de {limit}{meter.pct !== null && <> · <strong className={tone.text}>{String(Math.round(pct)).replace('.', ',')}%</strong></>}
                </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
                <div className={cn('h-full rounded-full transition-all duration-500', meter.limit === null ? 'bg-slate-300 dark:bg-slate-600' : tone.bar)} style={{ width: `${meter.limit === null ? 0 : Math.min(100, pct)}%` }} />
            </div>
        </div>
    );
}
