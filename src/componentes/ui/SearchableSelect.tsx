import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/bibliotecas/utils";
import { Button } from "@/componentes/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/componentes/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/componentes/ui/popover";

interface Option {
    value: string;
    label: string;
    disabled?: boolean;
    subLabel?: string;
}

interface SearchableSelectProps {
    options: Option[];
    value?: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    className?: string;
    disabled?: boolean;
}

export function SearchableSelect({
    options,
    value,
    onValueChange,
    placeholder = "Selecionar opção...",
    searchPlaceholder = "Pesquisar...",
    emptyMessage = "Nenhum resultado encontrado.",
    className,
    disabled = false,
}: SearchableSelectProps) {
    const [open, setOpen] = React.useState(false);

    const selectedOption = options.find((opt) => opt.value === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between font-normal h-11", className)}
                    disabled={disabled}
                >
                    <span className="truncate">
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command className="w-full">
                    <CommandInput placeholder={searchPlaceholder} className="h-9" />
                    <CommandList>
                        <CommandEmpty>{emptyMessage}</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => (
                                <CommandItem
                                    key={option.value}
                                    value={option.label}
                                    disabled={option.disabled}
                                    onSelect={() => {
                                        onValueChange(option.value);
                                        setOpen(false);
                                    }}
                                    className={cn(
                                        "flex flex-col items-start gap-0.5 px-3 py-2",
                                        option.disabled && "opacity-50 grayscale pointer-events-none"
                                    )}
                                >
                                    <div className="flex w-full items-center justify-between">
                                        <span className="font-medium">{option.label}</span>
                                        <Check
                                            className={cn(
                                                "h-4 w-4",
                                                value === option.value ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                    </div>
                                    {option.subLabel && (
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-tight">
                                            {option.subLabel}
                                        </span>
                                    )}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
