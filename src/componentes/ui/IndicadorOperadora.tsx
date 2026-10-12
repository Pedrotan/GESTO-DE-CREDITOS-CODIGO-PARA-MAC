import { Phone, Smartphone, TriangleAlert } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { analisarTelefoneAngola, digitosNacionais, type OperadoraMovel } from '@/bibliotecas/operadoras-telefone';

const CORES: Record<OperadoraMovel, string> = {
    Unitel: 'bg-orange-50 text-orange-700 ring-orange-200',
    Movicel: 'bg-sky-50 text-sky-700 ring-sky-200',
    Africell: 'bg-violet-50 text-violet-700 ring-violet-200',
};

/** Mostra, por baixo de um campo de telefone, a operadora do número ou o motivo de não ser válido. */
export function IndicadorOperadora({ valor, className }: { valor?: string | null; className?: string }) {
    const digitos = digitosNacionais(valor || '');
    if (digitos.length < 2) return null;
    const resultado = analisarTelefoneAngola(valor || '');
    // Enquanto escreve, só avisa de um prefixo errado; o número incompleto não é erro ainda.
    if (!resultado.valido && digitos.length < 9 && !resultado.mensagem.startsWith('O prefixo')) {
        const prefixo = analisarTelefoneAngola(digitos.padEnd(9, '0'));
        if (prefixo.valido) return null;
        return (
            <p className={cn('mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-red-600', className)}>
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> {prefixo.mensagem}
            </p>
        );
    }
    if (!resultado.valido) {
        return (
            <p className={cn('mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-red-600', className)}>
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> {resultado.mensagem}
            </p>
        );
    }
    return (
        <span className={cn(
            'mt-1.5 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1',
            resultado.operadora ? CORES[resultado.operadora] : 'bg-slate-50 text-slate-600 ring-slate-200',
            className
        )}>
            {resultado.fixo ? <Phone className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
            {resultado.fixo ? 'Telefone fixo' : resultado.operadora}
        </span>
    );
}
