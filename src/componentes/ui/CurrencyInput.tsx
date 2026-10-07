import * as React from "react";
import { Input } from "./input";
import { cn } from "@/bibliotecas/utils";
import { formatDecimal, KWANZA_SYMBOL } from "@/bibliotecas/formatters";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
    value: number;
    onValueChange: (value: number) => void;
    currency?: string;
}

const symbolFor = (currency?: string) => ['', 'AOA', 'KZ'].includes(String(currency || '').toUpperCase()) ? KWANZA_SYMBOL : String(currency);

/**
 * Campo monetário com máscara angolana: o utilizador escreve 1000000 e vê "1 000 000"; a vírgula separa
 * as casas decimais (o ponto também é aceite e convertido). Ao sair do campo fica "1 000 000,00".
 */
export function CurrencyInput({
    value,
    onValueChange,
    currency = "AOA",
    className,
    onFocus,
    onBlur,
    ...props
}: CurrencyInputProps) {
    const focused = React.useRef(false);
    const [text, setText] = React.useState(() => (value ? formatDecimal(value, 2) : ""));

    React.useEffect(() => {
        if (!focused.current) setText(value ? formatDecimal(value, 2) : "");
    }, [value]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        // Aceita dígitos e um separador decimal (vírgula; o ponto escrito no fim também conta como vírgula).
        let raw = event.target.value.replace(/\s/g, "");
        if (!raw.includes(",") && /\.\d{0,2}$/.test(raw)) raw = raw.replace(/\.(\d{0,2})$/, ",$1");
        raw = raw.replace(/[^\d,]/g, "");
        const [integerPart, ...rest] = raw.split(",");
        const decimals = rest.join("").slice(0, 2);
        const digits = integerPart.replace(/^0+(?=\d)/, "");
        const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        setText(raw.includes(",") ? `${grouped || "0"},${decimals}` : grouped);
        const numeric = Number(`${digits || "0"}.${decimals || "0"}`);
        onValueChange(Number.isFinite(numeric) ? numeric : 0);
    };

    return (
        <div className="relative">
            <Input
                {...props}
                inputMode="decimal"
                value={text}
                onChange={handleChange}
                onFocus={(event) => { focused.current = true; onFocus?.(event); }}
                onBlur={(event) => { focused.current = false; setText(value ? formatDecimal(value, 2) : ""); onBlur?.(event); }}
                className={cn("pr-12 tabular-nums", className)}
                placeholder={props.placeholder ?? "0,00"}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">{symbolFor(currency)}</span>
        </div>
    );
}
