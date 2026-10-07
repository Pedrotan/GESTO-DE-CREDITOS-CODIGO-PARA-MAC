import * as React from 'react';
import { Input } from './input';
import { cn } from '@/bibliotecas/utils';
import { formatDecimal, parseDecimalInput } from '@/bibliotecas/formatters';

interface DecimalInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
    value: number;
    onValueChange: (value: number) => void;
    /** Casas decimais mostradas ao sair do campo (0 para inteiros). */
    digits?: number;
    /** Texto fixo à direita (ex.: "%", "meses", "Kz"). */
    suffix?: string;
    min?: number;
    max?: number;
}

/**
 * Campo numérico à maneira angolana: vírgula decimal e espaço nos milhares ("24,50"), em vez do
 * "24.5"/"0.0" dos campos type="number". Aceita também o ponto ao escrever.
 */
export function DecimalInput({ value, onValueChange, digits = 2, suffix, min, max, className, onFocus, onBlur, ...props }: DecimalInputProps) {
    const focused = React.useRef(false);
    const show = React.useCallback((number: number) => (Number.isFinite(number) ? formatDecimal(number, digits) : ''), [digits]);
    const [text, setText] = React.useState(() => show(value));

    React.useEffect(() => { if (!focused.current) setText(show(value)); }, [value, show]);

    const clamp = (number: number) => {
        let result = number;
        if (min !== undefined) result = Math.max(min, result);
        if (max !== undefined) result = Math.min(max, result);
        return result;
    };

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const raw = event.target.value.replace(/[^\d,.\s -]/g, '');
        setText(raw);
        const parsed = parseDecimalInput(raw);
        if (Number.isFinite(parsed)) onValueChange(digits === 0 ? Math.round(parsed) : parsed);
        else if (!raw.trim()) onValueChange(0);
    };

    return (
        <div className="relative">
            <Input
                {...props}
                inputMode={digits === 0 ? 'numeric' : 'decimal'}
                value={text}
                onChange={handleChange}
                onFocus={(event) => { focused.current = true; onFocus?.(event); }}
                onBlur={(event) => {
                    focused.current = false;
                    const clamped = clamp(Number.isFinite(value) ? value : 0);
                    if (clamped !== value) onValueChange(clamped);
                    setText(show(clamped));
                    onBlur?.(event);
                }}
                className={cn('tabular-nums', suffix && 'pr-14', className)}
            />
            {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">{suffix}</span>}
        </div>
    );
}
