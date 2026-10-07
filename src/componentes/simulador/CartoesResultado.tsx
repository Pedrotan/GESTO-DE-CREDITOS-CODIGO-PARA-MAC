import { HandCoins, Percent, Receipt, Scale } from 'lucide-react';
import { KzIcon } from '@/componentes/ui/KzIcon';
import { cn } from '@/bibliotecas/utils';
import { formatCurrency, formatPercent } from '@/bibliotecas/formatters';
import type { SimulationResult } from '@/bibliotecas/simulador-credito';
import type { RateType } from '@/bibliotecas/config-simulador';
import { effortTone } from './modelo';

type Props = {
    result: SimulationResult;
    system: 'price' | 'sac';
    rateType: RateType;
    effort: number | null;
    effortLimit: number;
    feePayment: 'deducted' | 'financed';
};

const Card = ({ tone, icon, label, value, children, wide }: { tone: string; icon: React.ReactNode; label: string; value: React.ReactNode; children?: React.ReactNode; wide?: boolean }) => (
    <div className={cn(tone, 'min-w-0', wide && 'md:col-span-2 2xl:col-span-1')}>
        <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/10 text-slate-950 dark:bg-white/10 dark:text-white">{icon}</div>
            <p className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-900/70 dark:text-slate-400">{label}</p>
        </div>
        <div className="my-2"><p className="truncate font-display text-xl font-black tracking-tight text-slate-950 dark:text-white sm:text-2xl">{value}</p></div>
        <div className="text-xs font-semibold text-slate-900/75 dark:text-slate-400">{children}</div>
    </div>
);

/** Os cinco cartões do simulador: prestação, montante a receber, MTIC, TAN/TAEG e taxa de esforço. */
export function CartoesResultado({ result, system, rateType, effort, effortLimit, feePayment }: Props) {
    const tone = effortTone(effort, effortLimit);
    const barColor = tone === 'red' ? 'bg-red-500' : tone === 'yellow' ? 'bg-amber-500' : 'bg-emerald-500';
    const scale = Math.max(effortLimit * 1.5, 50);
    const width = effort === null ? 0 : Math.min(100, (effort / scale) * 100);
    const limitPosition = Math.min(100, (effortLimit / scale) * 100);

    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            <Card tone="card-kpi-sky" icon={<KzIcon />} label={system === 'price' ? 'Prestação Mensal' : '1.ª Prestação'} value={formatCurrency(result.installment)}>
                <p className="truncate">sem encargos: {formatCurrency(result.installmentBase)}</p>
                {system === 'sac' && <p className="truncate opacity-80">Prestações decrescentes</p>}
            </Card>
            <Card tone="card-kpi-mint" icon={<HandCoins className="h-5 w-5" />} label="Montante a Receber" value={formatCurrency(result.netReceived)}>
                <p className="truncate">{feePayment === 'financed' ? `Encargos financiados: ${formatCurrency(result.upfrontCharges)}` : `Descontos: ${formatCurrency(result.upfrontDeducted)}`}</p>
                <p className="truncate opacity-80">Comissão {formatCurrency(result.openingFee)} · IS {formatCurrency(result.stampDutyUse)}</p>
            </Card>
            <Card tone="card-kpi-amber" icon={<Receipt className="h-5 w-5" />} label="MTIC" value={formatCurrency(result.mtic)}>
                <p className="truncate">Juros {formatCurrency(result.totalInterest)}</p>
                <p className="truncate opacity-80">Comissões {formatCurrency(result.totalCommissions)} · Impostos {formatCurrency(result.totalTaxes)}{result.totalInsurance > 0 ? ` · Seguros ${formatCurrency(result.totalInsurance)}` : ''}</p>
            </Card>
            <Card tone="card-kpi-purple" icon={<Percent className="h-5 w-5" />} label="TAN / TAEG" value={<>{formatPercent(result.annualRate)} <span className="text-base font-bold opacity-70">/ {result.taeg === null ? '—' : formatPercent(result.taeg)}</span></>}>
                <p className="truncate">Taxa mensal: {formatPercent(result.monthlyRate, 4)}</p>
                <p className="truncate opacity-80">Taxa {rateType === 'variable' ? 'variável' : 'fixa'}</p>
            </Card>
            <Card wide tone={tone === 'red' ? 'card-kpi-coral' : tone === 'yellow' ? 'card-kpi-amber' : tone === 'green' ? 'card-kpi-mint' : 'card-kpi-neutral'}
                icon={<Scale className="h-5 w-5" />} label="Taxa de Esforço" value={effort === null ? '—' : formatPercent(effort, 1)}>
                {effort === null ? <p>Indique o rendimento mensal líquido</p> : (
                    <div className="space-y-1">
                        <div className="relative h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                            <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${width}%` }} />
                            <div className="absolute inset-y-0 w-0.5 bg-slate-900 dark:bg-white" style={{ left: `${limitPosition}%` }} title={`Limite ${formatPercent(effortLimit, 0)}`} />
                        </div>
                        <p className="truncate">Limite: {formatPercent(effortLimit, 0)} · {tone === 'red' ? 'acima do limite' : tone === 'yellow' ? 'próximo do limite' : 'confortável'}</p>
                    </div>
                )}
            </Card>
        </div>
    );
}
