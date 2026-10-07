import { useEffect, useMemo, useState } from 'react';
import { CalendarX2, Loader2, Package, Plus, RotateCcw, Save, Scale, ShieldAlert, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Switch } from '@/componentes/ui/switch';
import { Badge } from '@/componentes/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { DecimalInput } from '@/componentes/ui/DecimalInput';
import { useToast } from '@/componentes/ui/use-toast';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { DEFAULT_SIMULATOR_CONFIG, type SimulatorConfig, type SimulatorProduct } from '@/bibliotecas/config-simulador';
import { AMORTIZATION_LABELS } from '@/bibliotecas/simulador-credito';
import { angolaHolidays } from '@/bibliotecas/feriados-angola';
import { formatDate } from '@/bibliotecas/formatters';
import { ServicoConfigSimulador } from '@/servicos/ServicoConfigSimulador';
import { useConfigSimulador } from '@/ganchos/usar-config-simulador';

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
        <Label className="text-xs font-semibold">{label}</Label>
        {children}
        {hint && <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
);

const slug = (name: string) => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'produto';

/** Definições › Simulador e Produtos: produtos, Imposto do Selo, taxa de esforço, risco, mora e validade. */
export function ConfiguracaoSimulador() {
    const { user } = useAuth();
    const { addLog } = useData();
    const { toast } = useToast();
    const { config: saved, loading } = useConfigSimulador();
    const [draft, setDraft] = useState<SimulatorConfig>(saved);
    const [busy, setBusy] = useState(false);
    const [newHoliday, setNewHoliday] = useState('');
    const admin = ['admin', 'super_admin'].includes(String(user?.role || ''));

    useEffect(() => { setDraft(saved); }, [saved]);

    const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
    const year = new Date().getFullYear();
    const national = useMemo(() => [...angolaHolidays(year).entries()].sort(([a], [b]) => a.localeCompare(b)), [year]);

    const set = (changes: Partial<SimulatorConfig>) => setDraft(prev => ({ ...prev, ...changes }));
    const setProduct = (index: number, changes: Partial<SimulatorProduct>) => setDraft(prev => ({
        ...prev, products: prev.products.map((product, position) => position === index ? { ...product, ...changes } : product),
    }));

    const addProduct = () => {
        const base = DEFAULT_SIMULATOR_CONFIG.products[0];
        let id = 'novo-produto';
        for (let suffix = 2; draft.products.some(product => product.id === id); suffix++) id = `novo-produto-${suffix}`;
        setDraft(prev => ({ ...prev, products: [...prev.products, { ...base, id, name: 'Novo produto' }] }));
    };

    const save = async () => {
        if (!user) return;
        setBusy(true);
        try {
            const products = draft.products.map(product => product.id.startsWith('novo-produto') ? { ...product, id: slug(product.name) } : product);
            const result = await ServicoConfigSimulador.save({ ...draft, products }, user.name);
            await addLog('update', 'system', 'Actualizou a configuração do simulador de crédito (produtos, Imposto do Selo, taxa de esforço e risco).', user.id, user.name, saved, result);
            toast({ title: 'Configuração do simulador guardada', description: 'Os produtos e parâmetros ficam disponíveis em todos os dispositivos da empresa.' });
        } catch (error: any) {
            toast({ title: 'Não foi possível guardar', description: error?.message || 'Verifique os valores indicados.', variant: 'destructive' });
        } finally { setBusy(false); }
    };

    if (loading) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A carregar a configuração do simulador…</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="font-bold">Simulador e Produtos</p>
                    <p className="text-sm text-muted-foreground">Estes parâmetros alimentam o Simulador, a Ficha de Simulação (PDF) e os pedidos de crédito convertidos. São partilhados por todos os dispositivos da empresa.</p>
                    {!admin && <p className="mt-1 text-xs font-semibold text-amber-600">Só um administrador pode alterar estes valores.</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" className="gap-2" disabled={!admin || busy} onClick={() => setDraft(DEFAULT_SIMULATOR_CONFIG)}><RotateCcw className="h-4 w-4" /> Valores padrão</Button>
                    <Button size="sm" className="gap-2" disabled={!admin || busy || !dirty} onClick={() => void save()}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
                    </Button>
                </div>
            </div>

            <Card className="card-elevated border-none shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5 text-primary" /> Produtos de crédito</CardTitle>
                    <CardDescription>Limites de montante e prazo, TAN, comissões e sistema de amortização por omissão de cada produto.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {draft.products.map((product, index) => (
                        <div key={`${product.id}-${index}`} className="space-y-4 rounded-xl border p-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <Input value={product.name} disabled={!admin} onChange={event => setProduct(index, { name: event.target.value })} className="h-9 max-w-xs font-bold" />
                                <div className="flex items-center gap-2 text-sm">
                                    <Switch checked={product.active} disabled={!admin} onCheckedChange={active => setProduct(index, { active })} />
                                    {product.active ? <Badge variant="success">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}
                                </div>
                                <Button variant="ghost" size="sm" className="ml-auto gap-1 text-destructive" disabled={!admin || draft.products.length <= 1}
                                    onClick={() => setDraft(prev => ({ ...prev, products: prev.products.filter((_, position) => position !== index) }))}>
                                    <Trash2 className="h-4 w-4" /> Remover
                                </Button>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Field label="Montante mínimo"><CurrencyInput value={product.minAmount} disabled={!admin} onValueChange={minAmount => setProduct(index, { minAmount })} /></Field>
                                <Field label="Montante máximo"><CurrencyInput value={product.maxAmount} disabled={!admin} onValueChange={maxAmount => setProduct(index, { maxAmount })} /></Field>
                                <Field label="Prazo mínimo"><DecimalInput digits={0} suffix="meses" value={product.minMonths} disabled={!admin} min={1} max={600} onValueChange={minMonths => setProduct(index, { minMonths })} /></Field>
                                <Field label="Prazo máximo"><DecimalInput digits={0} suffix="meses" value={product.maxMonths} disabled={!admin} min={1} max={600} onValueChange={maxMonths => setProduct(index, { maxMonths })} /></Field>
                                <Field label="Regime da taxa">
                                    <Select value={product.rateType} disabled={!admin} onValueChange={rateType => setProduct(index, { rateType: rateType as SimulatorProduct['rateType'] })}>
                                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="fixed">Taxa fixa</SelectItem><SelectItem value="variable">Taxa variável (indexante + spread)</SelectItem></SelectContent>
                                    </Select>
                                </Field>
                                {product.rateType === 'fixed'
                                    ? <Field label="TAN (taxa anual nominal)"><DecimalInput suffix="%" value={product.annualRate} disabled={!admin} min={0} max={500} onValueChange={annualRate => setProduct(index, { annualRate })} /></Field>
                                    : <Field label="Spread sobre o indexante" hint={`TAN = ${draft.indexName} + spread`}><DecimalInput suffix="p.p." value={product.spread} disabled={!admin} min={-100} max={500} onValueChange={spread => setProduct(index, { spread })} /></Field>}
                                <Field label="Comissão de abertura">
                                    <div className="flex gap-2">
                                        <Select value={product.openingFee.mode} disabled={!admin} onValueChange={mode => setProduct(index, { openingFee: { ...product.openingFee, mode: mode as 'percent' | 'fixed' } })}>
                                            <SelectTrigger className="h-10 w-24"><SelectValue /></SelectTrigger>
                                            <SelectContent><SelectItem value="percent">%</SelectItem><SelectItem value="fixed">Kz</SelectItem></SelectContent>
                                        </Select>
                                        <div className="flex-1">
                                            {product.openingFee.mode === 'percent'
                                                ? <DecimalInput suffix="%" value={product.openingFee.value} disabled={!admin} min={0} max={100} onValueChange={value => setProduct(index, { openingFee: { ...product.openingFee, value } })} />
                                                : <CurrencyInput value={product.openingFee.value} disabled={!admin} onValueChange={value => setProduct(index, { openingFee: { ...product.openingFee, value } })} />}
                                        </div>
                                    </div>
                                </Field>
                                <Field label="Comissão de processamento" hint="Cobrada em cada prestação."><CurrencyInput value={product.processingFee} disabled={!admin} onValueChange={processingFee => setProduct(index, { processingFee })} /></Field>
                                <Field label="Seguro (opcional)" hint="% mensal sobre o capital em dívida; 0 = sem seguro."><DecimalInput digits={3} suffix="% / mês" value={product.insuranceRate} disabled={!admin} min={0} max={100} onValueChange={insuranceRate => setProduct(index, { insuranceRate })} /></Field>
                                <Field label="Sistema de amortização por omissão">
                                    <Select value={product.system} disabled={!admin} onValueChange={system => setProduct(index, { system: system as SimulatorProduct['system'] })}>
                                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="price">{AMORTIZATION_LABELS.price}</SelectItem><SelectItem value="sac">{AMORTIZATION_LABELS.sac}</SelectItem></SelectContent>
                                    </Select>
                                </Field>
                            </div>
                        </div>
                    ))}
                    <Button variant="outline" className="gap-2" disabled={!admin} onClick={addProduct}><Plus className="h-4 w-4" /> Adicionar produto</Button>
                </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
                <Card className="card-elevated border-none shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5 text-primary" /> Imposto do Selo</CardTitle>
                        <CardDescription>Taxas da Tabela do Imposto do Selo (verba 17). Confirme os valores em vigor junto da AGT antes de alterar.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                        <Field label="Utilização — prazo até 1 ano"><DecimalInput suffix="%" digits={2} value={draft.stampDuty.upToOneYear} disabled={!admin} min={0} max={100} onValueChange={upToOneYear => set({ stampDuty: { ...draft.stampDuty, upToOneYear } })} /></Field>
                        <Field label="Utilização — mais de 1 ano"><DecimalInput suffix="%" digits={2} value={draft.stampDuty.overOneYear} disabled={!admin} min={0} max={100} onValueChange={overOneYear => set({ stampDuty: { ...draft.stampDuty, overOneYear } })} /></Field>
                        <Field label="Utilização — 5 anos ou mais"><DecimalInput suffix="%" digits={2} value={draft.stampDuty.fiveYearsOrMore} disabled={!admin} min={0} max={100} onValueChange={fiveYearsOrMore => set({ stampDuty: { ...draft.stampDuty, fiveYearsOrMore } })} /></Field>
                        <Field label="Sobre os juros de cada prestação"><DecimalInput suffix="%" digits={2} value={draft.stampDuty.interest} disabled={!admin} min={0} max={100} onValueChange={interest => set({ stampDuty: { ...draft.stampDuty, interest } })} /></Field>
                    </CardContent>
                </Card>

                <Card className="card-elevated border-none shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-primary" /> Taxa de esforço e risco</CardTitle>
                        <CardDescription>Limite da taxa de esforço e ajuste da TAN conforme o nível de risco calculado.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                        <Field label="Taxa de esforço máxima" hint="Verde abaixo de 30%, amarelo até ao limite, vermelho acima."><DecimalInput suffix="%" value={draft.effortLimit} disabled={!admin} min={1} max={100} onValueChange={effortLimit => set({ effortLimit })} /></Field>
                        <Field label="Ajuste — risco baixo"><DecimalInput suffix="p.p." value={draft.riskSpread.low} disabled={!admin} min={-100} max={100} onValueChange={low => set({ riskSpread: { ...draft.riskSpread, low } })} /></Field>
                        <Field label="Ajuste — risco médio"><DecimalInput suffix="p.p." value={draft.riskSpread.medium} disabled={!admin} min={-100} max={100} onValueChange={medium => set({ riskSpread: { ...draft.riskSpread, medium } })} /></Field>
                        <Field label="Ajuste — risco elevado"><DecimalInput suffix="p.p." value={draft.riskSpread.high} disabled={!admin} min={-100} max={100} onValueChange={high => set({ riskSpread: { ...draft.riskSpread, high } })} /></Field>
                    </CardContent>
                </Card>

                <Card className="card-elevated border-none shadow-lg">
                    <CardHeader>
                        <CardTitle>Mora, validade e encargos</CardTitle>
                        <CardDescription>Usados na secção de incumprimento e na validade da Ficha de Simulação.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                        <Field label="Sobretaxa de mora" hint="Juro de mora = TAN + sobretaxa (anual)."><DecimalInput suffix="p.p." value={draft.lateSurcharge} disabled={!admin} min={0} max={100} onValueChange={lateSurcharge => set({ lateSurcharge })} /></Field>
                        <Field label="Validade da simulação"><DecimalInput digits={0} suffix="dias" value={draft.validityDays} disabled={!admin} min={1} max={365} onValueChange={validityDays => set({ validityDays })} /></Field>
                        <Field label="Comissão de abertura e IS de utilização">
                            <Select value={draft.feePayment} disabled={!admin} onValueChange={feePayment => set({ feePayment: feePayment as SimulatorConfig['feePayment'] })}>
                                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="deducted">Descontadas no desembolso</SelectItem><SelectItem value="financed">Financiadas (somadas ao capital)</SelectItem></SelectContent>
                            </Select>
                        </Field>
                    </CardContent>
                </Card>

                <Card className="card-elevated border-none shadow-lg">
                    <CardHeader>
                        <CardTitle>Taxa variável</CardTitle>
                        <CardDescription>Indexante de referência dos produtos com taxa variável (TAN = indexante + spread).</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                        <Field label="Indexante"><Input value={draft.indexName} disabled={!admin} onChange={event => set({ indexName: event.target.value })} /></Field>
                        <Field label="Valor actual do indexante" hint="Actualize com a taxa publicada pelo BNA."><DecimalInput suffix="%" digits={3} value={draft.indexValue} disabled={!admin} min={0} max={500} onValueChange={indexValue => set({ indexValue })} /></Field>
                    </CardContent>
                </Card>
            </div>

            <Card className="card-elevated border-none shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><CalendarX2 className="h-5 w-5 text-primary" /> Dias sem expediente</CardTitle>
                    <CardDescription>Os vencimentos que calham num fim-de-semana, feriado nacional ou numa destas datas passam para o dia útil seguinte.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 lg:grid-cols-2">
                    <div>
                        <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Feriados nacionais de {year} (automáticos)</p>
                        <div className="max-h-56 space-y-1 overflow-auto rounded-lg border p-2 text-sm">
                            {national.map(([key, name]) => (
                                <div key={key} className="flex justify-between gap-3 rounded px-2 py-1 odd:bg-muted/40"><span>{name}</span><span className="tabular-nums text-muted-foreground">{formatDate(`${key}T12:00:00`)}</span></div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Datas adicionais (tolerâncias de ponto, feriados locais)</p>
                        <div className="mb-3 flex gap-2">
                            <Input type="date" value={newHoliday} disabled={!admin} onChange={event => setNewHoliday(event.target.value)} className="w-48" />
                            <Button variant="outline" disabled={!admin || !newHoliday || draft.extraHolidays.includes(newHoliday)}
                                onClick={() => { set({ extraHolidays: [...draft.extraHolidays, newHoliday].sort() }); setNewHoliday(''); }}>
                                <Plus className="mr-1 h-4 w-4" /> Adicionar
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {draft.extraHolidays.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma data adicional.</p>}
                            {draft.extraHolidays.map(date => (
                                <Badge key={date} variant="outline" className="gap-1 py-1">
                                    {formatDate(`${date}T12:00:00`)}
                                    {admin && <button type="button" className="ml-1 text-destructive" aria-label="Remover data" onClick={() => set({ extraHolidays: draft.extraHolidays.filter(item => item !== date) })}>×</button>}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
