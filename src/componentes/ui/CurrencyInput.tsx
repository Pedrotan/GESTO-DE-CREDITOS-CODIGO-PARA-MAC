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
 * Campo monetário com máscara do Kwanza: o utilizador escreve 25000 e vê "25.000"; a vírgula separa as casas
 * decimais (o ponto escrito no fim, como no teclado numérico, passa a vírgula). Ao sair do campo fica
 * "25.000,00 Kz". Letras e outros caracteres são ignorados; o valor entregue é sempre um número.
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
        // Aceita dígitos e um separador decimal: a vírgula, ou o ponto acabado de escrever no fim. Os outros
        // pontos são os separadores de milhares da própria máscara e são ignorados.
        let raw = event.target.value.replace(/\s/g, "");
        if (!raw.includes(",") && raw.endsWith(".")) raw = `${raw.slice(0, -1)},`;
        raw = raw.replace(/[^\d,]/g, "");
        const [integerPart, ...rest] = raw.split(",");
        const decimals = rest.join("").slice(0, 2);
        const digits = integerPart.replace(/^0+(?=\d)/, "");
        const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
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

type MoneyInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'step'> & {
    value: string | number | null | undefined;
    /** Recebe o valor como um <input type="number">: event.target.value é o número em texto ("25000.5") ou "" se vazio. */
    onChange?: (event: { target: { value: string }; currentTarget: { value: string } }) => void;
    min?: number | string;
    step?: number | string;
    currency?: string;
};

/**
 * Substituto directo de <Input type="number"> para valores em Kz: a mesma API (value/onChange com
 * event.target.value) mas com a máscara "25.000,00 Kz". O número entregue nunca tem formatação.
 */
export function MoneyInput({ value, onChange, min: _min, step: _step, ...props }: MoneyInputProps) {
    const numeric = Number(value);
    return (
        <CurrencyInput
            {...props}
            value={Number.isFinite(numeric) ? numeric : 0}
            onValueChange={next => {
                const text = next ? String(next) : '';
                onChange?.({ target: { value: text }, currentTarget: { value: text } });
            }}
        />
    );
}
