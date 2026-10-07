import { cn } from '@/bibliotecas/utils';

/**
 * Ícone do Kwanza: substitui o símbolo de dólar ($) em todo o sistema. Aceita as mesmas classes de
 * tamanho que os ícones lucide (h-4 w-4, h-5 w-5…) e herda a cor do texto.
 */
export function KzIcon({ className }: { className?: string }) {
    return (
        <span aria-hidden="true" className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center text-[11px] font-black leading-none tracking-tighter', className)}>
            Kz
        </span>
    );
}
