import { useMemo } from 'react';
import { Crown, GitCompareArrows, Plus, Trash2, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { Label } from '@/componentes/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { DecimalInput } from '@/componentes/ui/DecimalInput';
import { cn } from '@/bibliotecas/utils';
import { formatCurrency, formatPercent } from '@/bibliotecas/formatters';
import { AMORTIZATION_LABELS, effortRate, simulateCredit, type SimulationResult } from '@/bibliotecas/simulador-credito';
import type { SimulatorConfig } from '@/bibliotecas/config-simulador';
import { buildInput, effortTone, type SimulatorForm } from './modelo';

export type Scenario = { id: string; name: string; form: SimulatorForm; annualRate: number };
export const MAX_SCENARIOS = 3;

type Props = {
    scenarios: Scenario[];
    config: SimulatorConfig;
    onChange: (scenarios: Scenario[]) => void;
    onAddCurrent: () => void;
    onApply: (scenario: Scenario) => void;
};

const METRICS: Array<{ label: string; value: (result: SimulationResult, effort: number | null) => string; key?: 'mtic' | 'taeg' }> = [
    { label: 'Prestação mensal', value: result => formatCurrency(result.installment) },
    { label: 'Prestação sem encargos', value: result => formatCurrency(result.installmentBase) },
    { label: 'Montante a receber', value: result => formatCurrency(result.netReceived) },
    { label: 'Total de juros', value: result => formatCurrency(result.totalInterest) },
    { label: 'Comissões', value: result => formatCurrency(result.totalCommissions) },
    { label: 'Impostos (IS)', value: result => formatCurrency(result.totalTaxes) },
    { label: 'Seguros', value: result => formatCurrency(result.totalInsurance) },
    { label: 'MTIC', value: result => formatCurrency(result.mtic), key: 'mtic' },
    { label: 'TAEG', value: result => (result.taeg === null ? '—' : formatPercent(result.taeg)), key: 'taeg' },
    { label: 'Taxa de esforço', value: (_, effort) => (effort === null ? '—' : formatPercent(effort, 1)) },
];

/** Compara até três cenários lado a lado e destaca o mais económico (menor TAEG; empate: menor MTIC). */
export function ComparadorCenarios({ scenarios, config, onChange, onAddCurrent, onApply }: Props) {
    const computed = useMemo(() => scenarios.map(scenario => {
        const result = simulateCredit(buildInput(scenario.form, config, scenario.annualRate));
        return { scenario, result, effort: result.valid ? effortRate(result.maxInstallment, scenario.form.otherDebts, scenario.form.income) : null };
    }), [scenarios, config]);

    const cheapest = useMemo(() => {
        const valid = computed.filter(item => item.result.valid && item.result.taeg !== null);
        if (valid.length < 2) return null;
        return valid.reduce((best, item) => {
            const a = item.result.taeg as number, b = best.result.taeg as number;
            if (a < b - 1e-9) return item;
            if (Math.abs(a - b) <= 1e-9 && item.result.mtic < best.result.mtic) return item;
            return best;
        }).scenario.id;
    }, [computed]);

    const update = (id: string, changes: Partial<Omit<Scenario, 'form'>> & { form?: Partial<SimulatorForm> }) => onChange(scenarios.map(scenario => scenario.id === id
        ? { ...scenario, ...changes, form: { ...scenario.form, ...(changes.form || {}) } }
        : scenario));

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2"><GitCompareArrows className="h-5 w-5 text-indigo-600" /> Comparar Cenários</CardTitle>
                        <CardDescription>Até {MAX_SCENARIOS} cenários. O mais económico é o de menor TAEG (custo total efectivo); em caso de empate, o de menor MTIC.</CardDescription>
                    </div>
                    <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700" disabled={scenarios.length >= MAX_SCENARIOS} onClick={onAddCurrent}>
                        <Plus className="h-4 w-4" /> Adicionar a simulação actual
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {scenarios.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center text-muted-foreground">
                        <GitCompareArrows className="mb-3 h-10 w-10 opacity-30" />
                        <p>Configure uma simulação no separador Simulador e adicione-a aqui.</p>
                        <p className="text-sm">Depois altere o montante, o prazo, a TAN ou o sistema de cada cenário para comparar.</p>
                    </div>
                ) : (
                    <div className={cn('grid gap-4', scenarios.length === 1 ? 'md:grid-cols-1' : scenarios.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
                        {computed.map(({ scenario, result, effort }, index) => {
                            const best = cheapest === scenario.id;
                            const tone = effortTone(effort, config.effortLimit);
                            return (
                                <div key={scenario.id} className={cn('relative space-y-4 rounded-2xl border p-4 transition-all', best ? 'border-emerald-500 bg-emerald-500/5 shadow-lg ring-2 ring-emerald-500/30' : 'bg-card')}>
                                    {best && <Badge className="absolute -top-3 left-4 gap-1 bg-emerald-600 text-white hover:bg-emerald-600"><Crown className="h-3 w-3" /> Mais económico</Badge>}
                                    <div className="flex items-center justify-between">
                                        <p className="font-black">Cenário {String.fromCharCode(65 + index)}</p>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onChange(scenarios.filter(item => item.id !== scenario.id))} title="Remover cenário"><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                    <div className="grid gap-3">
                                        <div className="space-y-1"><Label className="text-xs">Montante</Label><CurrencyInput value={scenario.form.principal} onValueChange={principal => update(scenario.id, { form: { principal } })} /></div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1"><Label className="text-xs">Prazo</Label><DecimalInput digits={0} suffix="meses" min={1} max={600} value={scenario.form.months} onValueChange={months => update(scenario.id, { form: { months } })} /></div>
                                            <div className="space-y-1"><Label className="text-xs">TAN</Label><DecimalInput suffix="%" min={0} max={500} value={scenario.annualRate} onValueChange={annualRate => update(scenario.id, { annualRate })} /></div>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Sistema de amortização</Label>
                                            <Select value={scenario.form.system} onValueChange={system => update(scenario.id, { form: { system: system as SimulatorForm['system'] } })}>
                                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                                <SelectContent><SelectItem value="price">{AMORTIZATION_LABELS.price}</SelectItem><SelectItem value="sac">{AMORTIZATION_LABELS.sac}</SelectItem></SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    {!result.valid ? <p className="text-sm text-muted-foreground">Indique o montante e o prazo.</p> : (
                                        <dl className="divide-y rounded-xl border text-sm">
                                            {METRICS.map(metric => (
                                                <div key={metric.label} className={cn('flex items-center justify-between gap-2 px-3 py-1.5', metric.key && 'bg-muted/40 font-bold')}>
                                                    <dt className="text-muted-foreground">{metric.label}</dt>
                                                    <dd className={cn('tabular-nums', metric.label === 'Taxa de esforço' && (tone === 'red' ? 'text-red-600' : tone === 'yellow' ? 'text-amber-600' : tone === 'green' ? 'text-emerald-600' : ''))}>{metric.value(result, effort)}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                    )}
                                    <Button variant="outline" size="sm" className="w-full gap-2" disabled={!result.valid} onClick={() => onApply(scenario)}><Upload className="h-4 w-4" /> Usar este cenário no simulador</Button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
