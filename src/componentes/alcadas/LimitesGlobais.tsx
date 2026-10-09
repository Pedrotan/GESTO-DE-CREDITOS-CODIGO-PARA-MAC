import type { ReactNode } from 'react';
import { Building2, Landmark, Package, Scale, Users, Wallet } from 'lucide-react';
import { Switch } from '@/componentes/ui/switch';
import { formatKz, sumUsage, type GlobalLimits } from '@/bibliotecas/alcadas';
import { MeterBar, MoneyCell, NumberCell } from './campos';
import type { AlcadasState } from './useAlcadas';

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
    return (
        <div className="grid items-start gap-2 sm:grid-cols-[1fr_220px]">
            <div><p className="text-sm font-semibold">{label}</p>{help && <p className="text-xs text-muted-foreground">{help}</p>}</div>
            {children}
        </div>
    );
}

export function LimitesGlobais({ state }: { state: AlcadasState }) {
    const draft = state.draft!;
    const global = draft.global;
    const update = (patch: Partial<GlobalLimits>) => state.setDraft(policy => { policy.global = { ...policy.global, ...patch }; return policy; });
    const company = sumUsage(state.data?.ledger || [], 'disbursement', 'all', 'all', state.now);
    const regulatoryCap = global.regulatory.enabled && global.regulatory.ownFundsMinor > 0 ? Math.floor(global.regulatory.ownFundsMinor * global.regulatory.singleClientPct / 100) : null;
    const meter = (used: number, limit: number | null) => ({ used, limit, pct: limit ? Math.round((used / limit) * 1000) / 10 : null });

    return (
        <div className="grid gap-6 xl:grid-cols-2">
            <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm md:p-6">
                <h3 className="flex items-center gap-2 text-lg font-bold"><Users className="h-5 w-5 text-primary" /> Exposição por cliente e grupo</h3>
                <Field label="Exposição máxima por cliente" help="Soma do capital em dívida de todos os créditos do cliente, incluindo o novo. Acima disto exige dupla aprovação.">
                    <MoneyCell ariaLabel="Exposição máxima por cliente" value={global.clientExposureMinor} invalid={state.issueByPath.get('global.clientExposureMinor')} onChange={value => update({ clientExposureMinor: value })} />
                </Field>
                <Field label="Exposição máxima por grupo de clientes relacionados" help="Família (irmãos, pais), empresa e sócios: mesmos pais, pai/mãe cliente ou o mesmo telefone.">
                    <MoneyCell ariaLabel="Exposição máxima por grupo" value={global.groupExposureMinor} invalid={state.issueByPath.get('global.groupExposureMinor')} onChange={value => update({ groupExposureMinor: value })} />
                </Field>
                <div className="space-y-3 rounded-xl border border-dashed p-3">
                    <label className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-sm font-semibold"><Scale className="h-4 w-4 text-primary" /> Aplicar limites regulamentares</span>
                        <Switch checked={global.regulatory.enabled} onCheckedChange={enabled => update({ regulatory: { ...global.regulatory, enabled } })} />
                    </label>
                    {global.regulatory.enabled && (
                        <>
                            <Field label="Fundos próprios da empresa"><MoneyCell ariaLabel="Fundos próprios" allowEmpty={false} value={global.regulatory.ownFundsMinor} onChange={value => update({ regulatory: { ...global.regulatory, ownFundsMinor: value ?? 0 } })} /></Field>
                            <Field label="Máximo por cliente (% dos fundos próprios)"><NumberCell ariaLabel="Percentagem regulamentar" value={global.regulatory.singleClientPct} suffix="%" step={0.5} onChange={value => update({ regulatory: { ...global.regulatory, singleClientPct: value ?? 0 } })} /></Field>
                            <p className="text-xs">Exposição máxima regulamentar por cliente: <strong>{regulatoryCap === null ? 'indique os fundos próprios' : formatKz(regulatoryCap)}</strong>. Acima dela a operação é recusada.</p>
                        </>
                    )}
                </div>
            </section>

            <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm md:p-6">
                <h3 className="flex items-center gap-2 text-lg font-bold"><Building2 className="h-5 w-5 text-primary" /> Volume de desembolsos da empresa</h3>
                <Field label="Máximo por dia (toda a empresa)" help="Dia civil, das 00:00 às 23:59 de Angola.">
                    <MoneyCell ariaLabel="Desembolsos da empresa por dia" value={global.companyDailyDisbursementMinor} invalid={state.issueByPath.get('global.companyDailyDisbursementMinor')} onChange={value => update({ companyDailyDisbursementMinor: value })} />
                </Field>
                <Field label="Máximo por mês (toda a empresa)" help="Do dia 1 ao último dia do mês.">
                    <MoneyCell ariaLabel="Desembolsos da empresa por mês" value={global.companyMonthlyDisbursementMinor} onChange={value => update({ companyMonthlyDisbursementMinor: value })} />
                </Field>
                <label className="flex items-start justify-between gap-3 rounded-xl bg-muted/40 p-3">
                    <span><span className="flex items-center gap-2 text-sm font-semibold"><Wallet className="h-4 w-4 text-primary" /> Ligar ao saldo de caixa disponível</span>
                        <span className="text-xs text-muted-foreground">Nenhum desembolso é feito acima do saldo de Caixa e Bancos (quando o controlo de caixa da contabilidade está ativo).</span></span>
                    <Switch checked={global.linkToCash} onCheckedChange={linkToCash => update({ linkToCash })} />
                </label>
                <div className="space-y-3 rounded-xl border p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold"><Landmark className="h-4 w-4 text-primary" /> Consumo da empresa</p>
                    <MeterBar label="Hoje" meter={meter(company.dayMinor, global.companyDailyDisbursementMinor)} />
                    <MeterBar label="Este mês" meter={meter(company.monthMinor, global.companyMonthlyDisbursementMinor)} />
                </div>
            </section>

            <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm md:p-6 xl:col-span-2">
                <div>
                    <h3 className="flex items-center gap-2 text-lg font-bold"><Package className="h-5 w-5 text-primary" /> Limites por produto de crédito</h3>
                    <p className="text-sm text-muted-foreground">Produtos do Simulador (Definições › Produtos de Crédito). O montante máximo do produto continua a valer; aqui define a alçada do produto: acima dela o pedido sobe na cadeia. Vazio = sem limite próprio.</p>
                </div>
                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                            <tr><th className="p-2 text-left">Produto</th><th className="p-2 text-right">Montante no simulador</th><th className="p-2 text-right">Alçada por operação</th><th className="p-2 text-right">Volume mensal</th></tr>
                        </thead>
                        <tbody>
                            {state.products.map(product => {
                                const limit = global.products[product.id] || { perOperationMinor: null, monthlyMinor: null };
                                const set = (patch: Partial<typeof limit>) => state.setDraft(policy => {
                                    const next = { ...limit, ...patch };
                                    if (next.perOperationMinor === null && next.monthlyMinor === null) delete policy.global.products[product.id];
                                    else policy.global.products[product.id] = next;
                                    return policy;
                                });
                                return (
                                    <tr key={product.id} className="border-t">
                                        <td className="p-2"><p className="font-semibold">{product.name}</p>{!product.active && <p className="text-[11px] text-muted-foreground">Inativo no simulador</p>}</td>
                                        <td className="p-2 text-right font-mono text-xs">{formatKz(product.minAmount * 100)} a {formatKz(product.maxAmount * 100)}</td>
                                        <td className="w-56 p-2"><MoneyCell ariaLabel={`Alçada do produto ${product.name}`} emptyLabel="Sem limite próprio" value={limit.perOperationMinor} onChange={value => set({ perOperationMinor: value })} /></td>
                                        <td className="w-56 p-2"><MoneyCell ariaLabel={`Volume mensal do produto ${product.name}`} emptyLabel="Sem limite próprio" value={limit.monthlyMinor} onChange={value => set({ monthlyMinor: value })} /></td>
                                    </tr>
                                );
                            })}
                            {!state.products.length && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Sem produtos configurados no simulador.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
