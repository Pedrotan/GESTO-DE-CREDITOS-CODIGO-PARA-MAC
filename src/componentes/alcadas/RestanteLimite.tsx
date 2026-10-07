import { useEffect, useState } from 'react';
import { ArrowUpRight, Ban, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { OPERATION_LABELS, formatKz, type Evaluation, type OperationType, type UsageSnapshot } from '@/bibliotecas/alcadas';
import { ServicoAlcadas } from '@/servicos/ServicoAlcadas';
import { MeterBar } from './campos';

/**
 * Antes de submeter uma operação: quanto resta do limite do utilizador (dia e mês) e o que vai acontecer
 * (aprovação direta, subida na cadeia com o nível exigido, ou bloqueio). A decisão final é do servidor.
 */
export function RestanteLimite({ operationType, amount, clientId, className }: { operationType: OperationType; amount: number; clientId?: string | null; className?: string }) {
    const { user } = useAuth();
    const [result, setResult] = useState<{ evaluation: Evaluation; usage: UsageSnapshot } | null>(null);
    const [loading, setLoading] = useState(false);
    const amountMinor = Math.round((Number(amount) || 0) * 100);
    useEffect(() => {
        if (!user || !(amountMinor > 0)) { setResult(null); return; }
        let cancelled = false;
        setLoading(true);
        const timer = window.setTimeout(async () => {
            const preview = await ServicoAlcadas.preview({ actor: { id: user.id, name: user.name, role: user.role, branchId: (user as any).branchId || null }, operationType, amountMinor, clientId }).catch(() => null);
            if (!cancelled) { setResult(preview); setLoading(false); }
        }, 350);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, [user, operationType, amountMinor, clientId]);
    if (!user || !(amountMinor > 0)) return null;
    if (!result) return loading ? <p className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}><Loader2 className="h-3.5 w-3.5 animate-spin" /> A verificar a sua alçada…</p> : null;
    const { evaluation, usage } = result;
    const limit = evaluation.limit;
    const tone = evaluation.decision === 'allow' ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30'
        : evaluation.decision === 'escalate' ? 'border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30' : 'border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30';
    const projected = (used: number, cap: number | null | undefined) => ({ used: used + amountMinor, limit: cap ?? null, pct: cap ? Math.round(((used + amountMinor) / cap) * 1000) / 10 : null });
    return (
        <div className={cn('space-y-2 rounded-xl border p-3 text-sm', tone, className)} aria-live="polite">
            <p className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4 text-primary" /> A sua alçada — {OPERATION_LABELS[operationType]}</p>
            {limit.allowed ? (
                <>
                    <p className="text-xs">Por operação: <strong>{limit.source === 'desativado' ? 'limites desativados' : formatKz(limit.perOperationMinor)}</strong>
                        {evaluation.remaining.dailyMinor !== null && <> · resta hoje <strong>{formatKz(evaluation.remaining.dailyMinor)}</strong></>}
                        {evaluation.remaining.monthlyMinor !== null && <> · resta este mês <strong>{formatKz(evaluation.remaining.monthlyMinor)}</strong></>}
                        {limit.source === 'temporaria' && <span className="ml-1 rounded-full bg-emerald-200 px-1.5 text-[10px] font-bold text-emerald-900">exceção temporária</span>}
                        {limit.source === 'individual' && <span className="ml-1 rounded-full bg-amber-200 px-1.5 text-[10px] font-bold text-amber-900">limite individual</span>}</p>
                    {limit.dailyMinor != null && limit.source !== 'desativado' && <MeterBar label="Hoje, com esta operação" meter={projected(usage.scope.dayMinor, limit.dailyMinor)} compact />}
                    {limit.monthlyMinor != null && limit.source !== 'desativado' && <MeterBar label="Este mês, com esta operação" meter={projected(usage.scope.monthMinor, limit.monthlyMinor)} compact />}
                </>
            ) : <p className="text-xs">O seu perfil não tem limite definido para esta operação.</p>}
            {evaluation.decision === 'allow' && <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Dentro da sua alçada.</p>}
            {evaluation.decision === 'escalate' && <div className="text-xs text-amber-900 dark:text-amber-200">
                <p className="flex items-center gap-1.5 font-semibold"><ArrowUpRight className="h-4 w-4" /> {operationType === 'credit_approval' ? 'Vai para a fila de Aprovações' : 'Precisa de aprovação superior'}: {evaluation.required?.name || 'nível superior'}</p>
                <ul className="mt-0.5 list-disc pl-5">{evaluation.reasons.slice(0, 3).map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
            {evaluation.decision === 'block' && <div className="text-xs text-red-800 dark:text-red-300">
                <p className="flex items-center gap-1.5 font-semibold"><Ban className="h-4 w-4" /> Não é possível com estes valores</p>
                <ul className="mt-0.5 list-disc pl-5">{evaluation.reasons.slice(0, 3).map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
        </div>
    );
}
