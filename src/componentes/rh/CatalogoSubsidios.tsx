// Configurações › Subsídios e abonos: catálogo da empresa (sobre as rubricas existentes). O que se cria aqui aparece de
// imediato no cadastro e na ficha de cada funcionário; a incidência de IRT/INSS é configurável e pode ficar «a confirmar».
import { useMemo, useState, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/componentes/ui/sheet';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { Switch } from '@/componentes/ui/switch';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Plus } from 'lucide-react';
import { ServicoRH, type ActorRH, type FuncionarioRubrica, type Rubrica } from '@/servicos/rh/ServicoRH';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { cn } from '@/bibliotecas/utils';
import { executar, kz, paraMinor } from './comum-rh';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
type Incidencia = 'sim' | 'nao' | 'confirmar';

/** Descrição do cálculo de uma rubrica do catálogo («30% do salário base», «2.000,00 Kz por dia trabalhado»…). */
export function calculoRubrica(r: Pick<Rubrica, 'forma' | 'percentagem' | 'por_dia' | 'valor_padrao_minor' | 'periodicidade' | 'mes_pagamento'>) {
    const base = r.por_dia ? `${r.valor_padrao_minor ? kz(r.valor_padrao_minor) : 'Valor'} por dia trabalhado`
        : r.forma === 'percentagem' ? `${Math.round(r.percentagem * 1000) / 10}% do salário base`
        : r.forma === 'quantidade' ? 'Quantidade × valor' : `Valor fixo${r.valor_padrao_minor ? ` · padrão ${kz(r.valor_padrao_minor)}` : ''}`;
    return r.periodicidade === 'anual' ? `${base} · anual (${MESES[(r.mes_pagamento || 1) - 1]})` : r.periodicidade === 'pontual' ? `${base} · pontual` : base;
}

/** Selo de incidência (IRT/INSS): sim, isento ou a confirmar. */
export function SeloIncidencia({ rotulo, r, campo }: { rotulo: string; r: Rubrica; campo: 'incide_irt' | 'incide_inss' }) {
    const estado = r.incidencia_confirmada === 0 ? 'confirmar' : r[campo] ? 'sim' : 'nao';
    return (
        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
            estado === 'confirmar' ? 'bg-rh-warn-bg text-rh-warn ring-1 ring-amber-200' : estado === 'sim' ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' : 'bg-rh-success-bg text-rh-success')}>
            {estado === 'confirmar' ? 'A confirmar' : estado === 'sim' ? `Incide ${rotulo}` : `Isento de ${rotulo}`}
        </span>
    );
}

export function CatalogoSubsidios({ rubricas, atribuicoes, actor, podeEditar, onChange }: {
    rubricas: Rubrica[]; atribuicoes: FuncionarioRubrica[]; actor: ActorRH | null; podeEditar: boolean; onChange: () => void;
}) {
    const [edicao, setEdicao] = useState<Partial<Rubrica> | null>(null);
    const hoje = luandaTodayKey();
    const catalogo = rubricas.filter(r => !r.sistema && r.tipo === 'abono');
    const contagem = useMemo(() => {
        const m = new Map<string, Set<string>>();
        for (const a of atribuicoes) if (!a.fim || a.fim >= hoje) m.set(a.rubrica_id, (m.get(a.rubrica_id) || new Set()).add(a.funcionario_id));
        return m;
    }, [atribuicoes, hoje]);
    const porConfirmar = catalogo.filter(r => r.activo && r.incidencia_confirmada === 0);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-extrabold text-rh-text dark:text-white">Subsídios e abonos</h2>
                    <p className="mt-1 text-sm text-rh-muted dark:text-slate-400">Catálogo da empresa. O que for criado aqui aparece no cadastro e na ficha de cada funcionário.</p>
                </div>
                {podeEditar && <Button className="h-10 bg-rh-navy hover:bg-rh-navy-2" onClick={() => setEdicao({ tipo: 'abono', classe: 'subsidio', forma: 'percentagem', percentagem: 0, incide_inss: 1, incide_irt: 1, incidencia_confirmada: 0, periodicidade: 'mensal', activo: 1, ordem_no_recibo: 50 })}>
                    <Plus className="mr-2 h-4 w-4" /> Novo subsídio
                </Button>}
            </div>
            {porConfirmar.length > 0 && (
                <p role="status" className="rounded-xl border border-amber-200 bg-rh-warn-bg px-4 py-3 text-sm text-amber-950">
                    <b>Incidência por confirmar:</b> {porConfirmar.map(r => r.nome).join(', ')}. O processamento salarial fica bloqueado para quem os tiver atribuídos até definir se incide IRT e INSS (confirme com o contabilista).
                </p>
            )}
            <div className="overflow-x-auto rounded-xl border border-rh-border bg-white dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-rh-border bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                            <th className="px-4 py-3">Nome</th><th className="px-4 py-3">Cálculo</th><th className="px-4 py-3">IRT</th><th className="px-4 py-3">INSS</th>
                            <th className="px-4 py-3 text-right">Funcionários</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"><span className="sr-only">Editar</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {catalogo.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-rh-muted">Ainda não há subsídios no catálogo.</td></tr> : catalogo.map(r => (
                            <tr key={r.id} className={cn('border-b border-slate-100 dark:border-slate-800', !r.activo && 'opacity-60')}>
                                <td className="px-4 py-3"><div className="font-semibold">{r.nome}</div><div className="text-xs text-rh-muted">{r.classe === 'subsidio' ? 'Subsídio' : 'Abono'} · {r.codigo}{r.auto_atribuir ? ' · atribuído a novos funcionários' : ''}</div></td>
                                <td className="px-4 py-3">{calculoRubrica(r)}</td>
                                <td className="px-4 py-3"><SeloIncidencia rotulo="IRT" r={r} campo="incide_irt" /></td>
                                <td className="px-4 py-3"><SeloIncidencia rotulo="INSS" r={r} campo="incide_inss" /></td>
                                <td className="px-4 py-3 text-right tabular-nums">{contagem.get(r.id)?.size || 0}</td>
                                <td className="px-4 py-3"><span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', r.activo ? 'bg-rh-success-bg text-rh-success' : 'bg-slate-100 text-slate-500')}>{r.activo ? 'Activo' : 'Inactivo'}</span></td>
                                <td className="px-4 py-3 text-right">{podeEditar && <button type="button" className="text-[13px] font-semibold text-rh-link hover:underline" onClick={() => setEdicao(r)}>Editar</button>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-rh-muted">A incidência de IRT e INSS de cada subsídio, e eventuais limites de isenção, devem ser confirmados com o contabilista e a legislação em vigor. Alterar uma percentagem afecta só os meses ainda não aprovados: os meses aprovados guardam o valor calculado.</p>
            {actor && edicao && <PainelSubsidio inicial={edicao} actor={actor} onClose={() => setEdicao(null)} onSaved={onChange} />}
        </div>
    );
}

function Interruptor({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
    return <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-700 dark:text-slate-200"><Switch checked={checked} onCheckedChange={onChange} />{children}</label>;
}

function PainelSubsidio({ inicial, actor, onClose, onSaved }: { inicial: Partial<Rubrica>; actor: ActorRH; onClose: () => void; onSaved: () => void }) {
    const [r, setR] = useState<Partial<Rubrica>>(inicial);
    const [aGuardar, setAGuardar] = useState(false);
    const set = (parte: Partial<Rubrica>) => setR(p => ({ ...p, ...parte }));
    const forma: 'percentagem' | 'fixo' | 'por_dia' = r.por_dia ? 'por_dia' : r.forma === 'percentagem' ? 'percentagem' : 'fixo';
    const incidencia = (campo: 'incide_irt' | 'incide_inss'): Incidencia => (r.incidencia_confirmada === 0 ? 'confirmar' : r[campo] ? 'sim' : 'nao');
    const mudarIncidencia = (campo: 'incide_irt' | 'incide_inss', v: Incidencia) => {
        const outro = campo === 'incide_irt' ? 'incide_inss' : 'incide_irt';
        // «A confirmar» vale para os dois: guarda-se como sujeito (o mais prudente) e o processamento bloqueia até ser definido.
        if (v === 'confirmar') set({ incidencia_confirmada: 0, incide_irt: 1, incide_inss: 1 });
        else set({ incidencia_confirmada: 1, [campo]: v === 'sim' ? 1 : 0, ...(r.incidencia_confirmada === 0 ? { [outro]: 1 } : {}) });
    };
    const guardar = async () => {
        setAGuardar(true);
        const ok = await executar(() => ServicoRH.guardarRubrica(r, actor), r.id ? 'Subsídio actualizado' : 'Subsídio criado');
        setAGuardar(false);
        if (ok) { onSaved(); onClose(); }
    };
    const campo = 'flex flex-col gap-1.5';
    const rotulo = 'text-[13px] font-semibold text-slate-700 dark:text-slate-200';
    const opcao = (activa: boolean) => cn('flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-[13px] font-semibold', activa ? 'border-2 border-rh-navy bg-indigo-50/60 dark:border-white dark:bg-slate-800' : 'border-rh-input-border dark:border-slate-700');

    return (
        <Sheet open onOpenChange={v => !v && onClose()}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]">
                <div className="bg-rh-navy px-6 py-5 text-white">
                    <SheetTitle className="text-xl font-extrabold text-white">{r.id ? `Editar ${inicial.nome}` : 'Novo subsídio'}</SheetTitle>
                    <SheetDescription className="mt-1 text-[13px] text-indigo-200">Fica disponível para atribuir a qualquer funcionário.</SheetDescription>
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                    <div className="grid grid-cols-3 gap-3.5">
                        <div className={cn(campo, 'col-span-2')}><label htmlFor="sub-nome" className={rotulo}>Nome *</label><Input id="sub-nome" className="h-10" value={r.nome || ''} placeholder="Ex.: Subsídio de transporte" onChange={e => set({ nome: e.target.value })} /></div>
                        <div className={campo}><label htmlFor="sub-codigo" className={rotulo}>Código</label><Input id="sub-codigo" className="h-10" value={r.codigo || ''} disabled={Boolean(r.id)} placeholder="SUB_TRP" onChange={e => set({ codigo: e.target.value.toUpperCase() })} /></div>
                    </div>
                    <div className={campo}>
                        <label htmlFor="sub-tipo" className={rotulo}>Tipo *</label>
                        <Select value={r.classe === 'subsidio' ? 'subsidio' : 'abono'} onValueChange={v => set({ classe: v as 'abono' | 'subsidio', tipo: 'abono' })}>
                            <SelectTrigger id="sub-tipo" className="h-10"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="abono">Abono (soma ao salário)</SelectItem><SelectItem value="subsidio">Subsídio</SelectItem></SelectContent>
                        </Select>
                    </div>
                    <fieldset className={campo}>
                        <legend className={cn(rotulo, 'mb-1.5')}>Forma de cálculo *</legend>
                        <div className="grid grid-cols-3 gap-2">
                            {([['percentagem', '% do salário base'], ['fixo', 'Valor fixo'], ['por_dia', 'Por dia trabalhado']] as const).map(([v, t]) => (
                                <label key={v} className={opcao(forma === v)}>
                                    <input type="radio" name="sub-forma" checked={forma === v} onChange={() => set(v === 'percentagem' ? { forma: 'percentagem', por_dia: 0 } : v === 'fixo' ? { forma: 'fixo', por_dia: 0 } : { forma: 'fixo', por_dia: 1, proporcional_faltas: 0 })} />{t}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <div className="grid grid-cols-2 gap-3.5">
                        {forma === 'percentagem'
                            ? <div className={campo}><label htmlFor="sub-pct" className={rotulo}>Percentagem *</label>
                                <div className="relative"><Input id="sub-pct" type="number" min={0} max={1000} step="0.1" className="h-10 pr-8" value={Math.round((r.percentagem || 0) * 10000) / 100} onChange={e => set({ percentagem: (Number(e.target.value) || 0) / 100 })} /><span className="absolute right-3 top-2.5 text-sm text-slate-500">%</span></div></div>
                            : <div className={campo}><label htmlFor="sub-valor" className={rotulo}>{forma === 'por_dia' ? 'Valor por dia *' : 'Valor padrão'}</label>
                                <CurrencyInput id="sub-valor" className="h-10" value={(r.valor_padrao_minor || 0) / 100} onValueChange={v => set({ valor_padrao_minor: paraMinor(v) })} />
                                {forma === 'fixo' && <span className="text-xs text-rh-muted">Pode ser alterado por funcionário.</span>}</div>}
                        <div className={campo}><label htmlFor="sub-periodo" className={rotulo}>Periodicidade</label>
                            <Select value={r.periodicidade || 'mensal'} onValueChange={v => set({ periodicidade: v as Rubrica['periodicidade'], mes_pagamento: v === 'anual' ? r.mes_pagamento || 12 : null })}>
                                <SelectTrigger id="sub-periodo" className="h-10"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="mensal">Mensal</SelectItem><SelectItem value="anual">Anual (mês definido)</SelectItem><SelectItem value="pontual">Pontual</SelectItem></SelectContent>
                            </Select></div>
                        {r.periodicidade === 'anual' && <div className={campo}><label htmlFor="sub-mes" className={rotulo}>Mês de pagamento</label>
                            <Select value={String(r.mes_pagamento || 12)} onValueChange={v => set({ mes_pagamento: Number(v) })}>
                                <SelectTrigger id="sub-mes" className="h-10"><SelectValue /></SelectTrigger>
                                <SelectContent>{MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                            </Select></div>}
                    </div>
                    <div className="space-y-3 rounded-xl border border-rh-border p-3.5 dark:border-slate-700">
                        {(['incide_irt', 'incide_inss'] as const).map(c => (
                            <div key={c} className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm text-slate-700 dark:text-slate-200">{c === 'incide_irt' ? 'Sujeito a IRT' : 'Sujeito a Segurança Social (INSS)'}</span>
                                <div className="flex gap-1" role="radiogroup" aria-label={c === 'incide_irt' ? 'Incidência de IRT' : 'Incidência de INSS'}>
                                    {([['sim', 'Sim'], ['nao', 'Não'], ['confirmar', 'A confirmar']] as const).map(([v, t]) => (
                                        <button key={v} type="button" role="radio" aria-checked={incidencia(c) === v} onClick={() => mudarIncidencia(c, v)}
                                            className={cn('h-8 rounded-lg border px-2.5 text-xs font-semibold', incidencia(c) === v ? (v === 'confirmar' ? 'border-amber-400 bg-rh-warn-bg text-rh-warn' : 'border-rh-navy bg-rh-navy text-white') : 'border-rh-input-border text-slate-600 dark:border-slate-700 dark:text-slate-300')}>
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {forma !== 'por_dia' && <Interruptor checked={Boolean(r.proporcional_faltas)} onChange={v => set({ proporcional_faltas: v ? 1 : 0 })}>Descontar proporcionalmente nas faltas</Interruptor>}
                        <Interruptor checked={Boolean(r.auto_atribuir)} onChange={v => set({ auto_atribuir: v ? 1 : 0 })}>Atribuir automaticamente a novos funcionários</Interruptor>
                        {r.id && <Interruptor checked={r.activo !== 0} onChange={v => set({ activo: v ? 1 : 0 })}>Activo (os inactivos não aparecem no cadastro; as atribuições existentes mantêm-se até terminarem)</Interruptor>}
                    </div>
                    <details className="rounded-xl border border-rh-border p-3.5 text-sm dark:border-slate-700">
                        <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">Isenção de IRT e contabilidade</summary>
                        <div className="mt-3 grid grid-cols-2 gap-3.5">
                            <div className={campo}><label htmlFor="sub-isento" className={rotulo}>Parte isenta de IRT (Kz/mês)</label><CurrencyInput id="sub-isento" className="h-10" value={(r.limite_isento_irt_minor || 0) / 100} onValueChange={v => set({ limite_isento_irt_minor: paraMinor(v) })} /></div>
                            <div className={campo}><label htmlFor="sub-conta" className={rotulo}>Conta contabilística</label><Input id="sub-conta" className="h-10" value={r.conta_contabilistica || ''} placeholder="Ex.: 72.2" onChange={e => set({ conta_contabilistica: e.target.value })} /></div>
                        </div>
                    </details>
                    <div className={campo}><label htmlFor="sub-desc" className={rotulo}>Descrição</label><Textarea id="sub-desc" rows={3} value={r.descricao || ''} onChange={e => set({ descricao: e.target.value })} /></div>
                </div>
                <div className="flex justify-end gap-2.5 border-t border-rh-border px-6 py-3.5 dark:border-slate-800">
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button className="bg-rh-navy hover:bg-rh-navy-2" disabled={aGuardar} onClick={() => void guardar()}>{aGuardar ? 'A guardar…' : 'Guardar subsídio'}</Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
