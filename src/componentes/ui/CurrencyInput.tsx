import * as React from "react";
import { Input } from "./input";
import { cn } from "@/bibliotecas/utils";

interface CurrencyInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    value: number;
    onValueChange: (value: number) => void;
    currency?: string;
}

export function CurrencyInput({
    value,
    onValueChange,
    currency = "AOA",
    className,
    ...props
}: CurrencyInputProps) {
    const [displayValue, setDisplayValue] = React.useState("");

    const formatValue = (val: number) => {
        return new Intl.NumberFormat("pt-AO", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(val);
    };

    React.useEffect(() => {
        // Only update display value if it's different from the formatted value
        // This prevents cursor jumping while typing
        const formatted = formatValue(value);
        setDisplayValue(current => formatted !== current.replace(` ${currency}`, "") ? `${formatted} ${currency}` : current);
    }, [value, currency]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let rawValue = e.target.value.replace(/\D/g, "");

        // Convert to number (cents to decimal)
        const numValue = parseInt(rawValue || "0", 10) / 100;

        // Internal state update
        onValueChange(numValue);

        // Visual update
        const formatted = formatValue(numValue);
        setDisplayValue(`${formatted} ${currency}`);
    };

    return (
        <div className="relative">
            <Input
                {...props}
                value={displayValue}
                onChange={handleChange}
                className={cn("pr-12", className)}
                placeholder={`0,00 ${currency}`}
            />
        </div>
    );
}

