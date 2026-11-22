import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/componentes/ui/popover';
import { Input } from '@/componentes/ui/input';
import { Button } from '@/componentes/ui/button';
import { cn } from '@/bibliotecas/utils';
import { linkAccao } from './estilos-contactos';
import { corAvatar, iniciais, ROTULO_TIPO, type TipoCliente } from '@/bibliotecas/contactos/agenda-contactos';

// Peças partilhadas pela tabela, pela ficha e pela modal da agenda de contactos.

export function Avatar({ id, nome, grande }: { id: string; nome: string; grande?: boolean }) {
    return (
        <span aria-hidden="true" style={{ background: corAvatar(id) }}
            className={cn('flex shrink-0 items-center justify-center rounded-full font-bold text-white', grande ? 'h-14 w-14 text-lg' : 'h-9 w-9 text-xs')}>
            {iniciais(nome)}
        </span>
    );
}

export function BadgeTipo({ tipo }: { tipo: TipoCliente }) {
    return (
        <span className={cn('inline-block rounded-full px-2 py-px text-[11px] font-semibold',
            tipo === 'APOSENTADO' ? 'bg-[#FEF0C7] text-[#93370D] dark:bg-amber-950/60 dark:text-amber-300'
                : tipo === 'ESTRANGEIRO' ? 'bg-[#F4F3FF] text-[#5925DC] dark:bg-violet-950/60 dark:text-violet-300'
                    : 'bg-[#F2F4F7] text-[#344054] dark:bg-slate-800 dark:text-slate-300')}>
            {ROTULO_TIPO[tipo]}
        </span>
    );
}

/** «+ Adicionar …» que abre um pequeno popover com o campo e «Guardar», sem sair da página. */
export function EdicaoRapida({ rotulo, tipo = 'text', placeholder, valorInicial = '', onGuardar, disabled, children }: {
    rotulo: string; tipo?: 'text' | 'email' | 'tel'; placeholder?: string; valorInicial?: string; disabled?: boolean;
    onGuardar: (valor: string) => Promise<boolean>; children?: React.ReactNode;
}) {
    const [aberto, setAberto] = useState(false);
    const [valor, setValor] = useState(valorInicial);
    const [aGuardar, setAGuardar] = useState(false);
    return (
        <Popover open={aberto} onOpenChange={v => { setAberto(v); if (v) setValor(valorInicial); }}>
            <PopoverTrigger asChild disabled={disabled}>
                {children ?? <button type="button" className={linkAccao} disabled={disabled} title={disabled ? 'Sem permissão para editar contactos' : undefined}>+ Adicionar {rotulo}</button>}
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
                <form className="space-y-2" onSubmit={async e => {
                    e.preventDefault();
                    setAGuardar(true);
                    const ok = await onGuardar(valor);
                    setAGuardar(false);
                    if (ok) setAberto(false);
                }}>
                    <label className="text-xs font-semibold text-[#344054] dark:text-slate-300" htmlFor={`edicao-${rotulo}`}>{rotulo[0].toUpperCase() + rotulo.slice(1)}</label>
                    <Input id={`edicao-${rotulo}`} type={tipo} autoFocus value={valor} placeholder={placeholder} onChange={e => setValor(e.target.value)} />
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>Cancelar</Button>
                        <Button type="submit" size="sm" disabled={aGuardar || !valor.trim()} className="bg-[#0B4A2F] text-white hover:bg-[#064E30]">{aGuardar ? 'A guardar…' : 'Guardar'}</Button>
                    </div>
                </form>
            </PopoverContent>
        </Popover>
    );
}
