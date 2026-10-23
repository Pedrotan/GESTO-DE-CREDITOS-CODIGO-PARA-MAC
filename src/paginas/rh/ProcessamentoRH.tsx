import { useMemo, useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { AlertTriangle, Calculator, CheckCircle2, FileDown, Lock, Plus, Trash2, Undo2, Wallet, Banknote } from 'lucide-react';
import { ServicoSalariosRH, ROTULO_TIPO, type Processamento, type Recibo, type LinhaReciboRH, type RubricaPontual } from '@/servicos/rh/ServicoSalariosRH';
import type { TipoProcessamento } from '@/bibliotecas/rh/motor-salarial';
import { ficheiroTransferencias, gerarFolhaPdf, gerarReciboPdf, gerarRecibosPdf, periodoPt } from '@/bibliotecas/rh/pdf-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { useData } from '@/contextos/ContextoDados';
import { NavegacaoRH, dataPt, executar, kz, paraMinor, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { useBaseRH } from './FuncionariosRH';

export const LIGACOES_SALARIOS = [
    { path: '/rh/processamento', label: 'Processamento salarial' },
    { path: '/rh/recibos', label: 'Recibos e declarações' },
];
const CORES_ESTADO: Record<string, string> = {
    aberto: 'bg-slate-100 text-slate-700', calculado: 'bg-sky-100 text-sky-800', aprovado: 'bg-violet-100 text-violet-800',
    pago: 'bg-amber-100 text-amber-800', fechado: 'bg-emerald-100 text-emerald-800',
};
const ETAPAS = ['aberto', 'calculado', 'aprovado', 'pago', 'fechado'];

export const cabecalhoPdf = (p: Processamento) => {
    let irt: string | null = null;
    try { irt = p.parametros_json ? JSON.parse(p.parametros_json).irt_tabela : null; } catch { irt = null; }
    return { ano: p.ano, mes: p.mes, tipoRotulo: ROTULO_TIPO[p.tipo], estado: p.estado, irtTabela: irt };
};

export default function ProcessamentoRH() {
    const { actor, calcular, aprovar, salarios } = useActorRH();
    const { companySettings } = useData();
    const base = useBaseRH();
    const lista = useCarregar(() => ServicoSalariosRH.processamentos(), [] as Processamento[]);
    const [seleccionado, setSeleccionado] = useState<string | null>(null);
    const [abrir, setAbrir] = useState(false);
    const p = lista.dados.find(x => x.id === seleccionado) || null;
    const detalhe = useCarregar(async () => (p ? { recibos: await ServicoSalariosRH.recibos(p.id), pontuais: await ServicoSalariosRH.pontuais(p.id) } : { recibos: [] as Recibo[], pontuais: [] as RubricaPontual[] }),
        { recibos: [] as Recibo[], pontuais: [] as RubricaPontual[] }, [p?.id, p?.estado, p?.calculado_em]);
    const [recibo, setRecibo] = useState<Recibo | null>(null);
    const [pontual, setPontual] = useState(false);
    const [reabrir, setReabrir] = useState(false);
    const [pagar, setPagar] = useState(false);
    const recarregar = async () => { await lista.recarregar(); await detalhe.recarregar(); };
    const accao = (fn: () => Promise<unknown>, msg: string) => executar(fn, msg).then(ok => { if (ok) void recarregar(); return ok; });

    const pdfRecibos = async () => {
        if (!p || !actor) return;
        const todas = await ServicoSalariosRH.linhasProcessamento(p.id);
        gerarRecibosPdf(detalhe.dados.recibos.map(r => ({ recibo: r, linhas: todas.filter(l => l.recibo_id === r.id) })), cabecalhoPdf(p), companySettings, actor.name);
    };
    const transferencias = () => {
        if (!p) return;
        const csv = ficheiroTransferencias(detalhe.dados.recibos, `${ROTULO_TIPO[p.tipo]} ${String(p.mes).padStart(2, '0')}/${p.ano}`);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `transferencias-${p.ano}-${String(p.mes).padStart(2, '0')}-${p.tipo}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    };

    if (!salarios) return <MainLayout title="Processamento salarial"><NavegacaoRH extra={LIGACOES_SALARIOS} /><Vazio>Exige a permissão «RH: Ver salários».</Vazio></MainLayout>;

    return (
        <MainLayout title="Processamento salarial" subtitle="Abrir mês, calcular, rever, aprovar, pagar e fechar">
            <NavegacaoRH extra={LIGACOES_SALARIOS} />
            <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
                <section className="space-y-2">
                    {calcular && <Button className="w-full" onClick={() => setAbrir(true)}><Plus className="mr-1.5 h-4 w-4" /> Abrir processamento</Button>}
                    {lista.dados.length === 0 ? <Vazio>Sem processamentos.</Vazio> : lista.dados.map(x => (
                        <button key={x.id} type="button" onClick={() => setSeleccionado(x.id)}
                            className={`w-full rounded-2xl border p-3 text-left text-sm ${x.id === seleccionado ? 'border-slate-900 bg-slate-50 dark:border-white dark:bg-slate-800' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
                            <div className="flex items-center justify-between"><b>{periodoPt(x.ano, x.mes)}</b><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CORES_ESTADO[x.estado]}`}>{x.estado}</span></div>
                            <div className="text-xs text-slate-500">{ROTULO_TIPO[x.tipo]}{x.descricao ? ` · ${x.descricao}` : ''} · {x.num_recibos} recibo(s)</div>
                            {x.num_recibos > 0 && <div className="mt-1 text-xs font-bold">Líquido {kz(x.total_liquido_minor)}</div>}
                        </button>
                    ))}
                </section>

                <section>
                    {!p ? <Vazio>Escolha um processamento à esquerda.</Vazio> : (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h2 className="text-lg font-black">{ROTULO_TIPO[p.tipo]} — {periodoPt(p.ano, p.mes)}</h2>
                                    <div className="flex gap-1">{ETAPAS.map(e => <span key={e} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ETAPAS.indexOf(e) <= ETAPAS.indexOf(p.estado) ? CORES_ESTADO[e] : 'bg-slate-50 text-slate-300'}`}>{e}</span>)}</div>
                                </div>
                                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
                                    {[['Bruto', p.total_bruto_minor], ['INSS 3%', p.total_inss_trab_minor], ['IRT', p.total_irt_minor], ['Outros', p.total_outros_minor], ['Líquido', p.total_liquido_minor], ['INSS empresa', p.total_inss_emp_minor]].map(([n, v]) => (
                                        <div key={n as string} className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800"><div className="text-[11px] uppercase text-slate-500">{n}</div><div className="font-black">{kz(v as number)}</div></div>
                                    ))}
                                </div>
                                <p className="mt-2 text-xs text-slate-500">
                                    {p.calculado_por_nome && `Calculado por ${p.calculado_por_nome} (${dataPt(p.calculado_em)}). `}
                                    {p.aprovado_por_nome && `Aprovado por ${p.aprovado_por_nome} (${dataPt(p.aprovado_em)}). `}
                                    {p.pago_por_nome && `Pago por ${p.pago_por_nome} (${p.conta_pagamento === 'cash' ? 'caixa' : 'banco'}, ${dataPt(p.pago_em)}). `}
                                    {p.fechado_por_nome && `Fechado por ${p.fechado_por_nome} (${dataPt(p.fechado_em)}): lançamentos na contabilidade feitos.`}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {actor && calcular && ['aberto', 'calculado'].includes(p.estado) && <Button onClick={() => void accao(() => ServicoSalariosRH.calcular(p, actor), 'Processamento calculado')}><Calculator className="mr-1.5 h-4 w-4" /> {p.estado === 'aberto' ? 'Calcular' : 'Recalcular'}</Button>}
                                    {actor && calcular && ['aberto', 'calculado'].includes(p.estado) && <Button variant="outline" onClick={() => setPontual(true)}><Plus className="mr-1.5 h-4 w-4" /> Rubrica do mês</Button>}
                                    {actor && aprovar && p.estado === 'calculado' && <Button className="bg-violet-600 hover:bg-violet-700" onClick={() => void accao(() => ServicoSalariosRH.aprovar(p, actor), 'Processamento aprovado')}><CheckCircle2 className="mr-1.5 h-4 w-4" /> Aprovar</Button>}
                                    {actor && aprovar && p.estado === 'aprovado' && <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => setPagar(true)}><Wallet className="mr-1.5 h-4 w-4" /> Pagar</Button>}
                                    {actor && aprovar && p.estado === 'pago' && <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void accao(() => ServicoSalariosRH.fechar(p, actor), 'Mês fechado e lançado na contabilidade')}><Lock className="mr-1.5 h-4 w-4" /> Fechar e lançar</Button>}
                                    {actor && ['calculado', 'aprovado', 'pago'].includes(p.estado) && (calcular || aprovar) && <Button variant="outline" onClick={() => setReabrir(true)}><Undo2 className="mr-1.5 h-4 w-4" /> Reabrir</Button>}
                                    {actor && calcular && p.estado === 'aberto' && <Button variant="outline" className="text-red-600" onClick={() => void accao(() => ServicoSalariosRH.apagarAberto(p, actor), 'Processamento apagado').then(ok => ok && setSeleccionado(null))}><Trash2 className="mr-1.5 h-4 w-4" /> Apagar</Button>}
                                    {detalhe.dados.recibos.length > 0 && actor && <>
                                        <Button variant="outline" onClick={() => gerarFolhaPdf(detalhe.dados.recibos, cabecalhoPdf(p), companySettings, actor.name)}><FileDown className="mr-1.5 h-4 w-4" /> Folha (PDF)</Button>
                                        <Button variant="outline" onClick={() => void pdfRecibos()}><FileDown className="mr-1.5 h-4 w-4" /> Todos os recibos (PDF)</Button>
                                        {['aprovado', 'pago', 'fechado'].includes(p.estado) && <Button variant="outline" onClick={transferencias}><Banknote className="mr-1.5 h-4 w-4" /> Ficheiro de transferências</Button>}
                                    </>}
                                </div>
                            </div>

                            {detalhe.dados.pontuais.length > 0 && (
                                <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                                    <h3 className="mb-1 text-xs font-black uppercase text-slate-500">Rubricas do mês</h3>
                                    {detalhe.dados.pontuais.map(r => (
                                        <div key={r.id} className="flex items-center justify-between border-t border-slate-100 py-1 dark:border-slate-800">
                                            <span>{base.dados.funcionarios.find(f => f.id === r.funcionario_id)?.nome} · {base.dados.rubricas.find(x => x.id === r.rubrica_id)?.nome} · {kz(r.valor_minor)}{r.descricao ? ` · ${r.descricao}` : ''}</span>
                                            {actor && calcular && ['aberto', 'calculado'].includes(p.estado) && <Button size="icon" variant="ghost" onClick={() => void accao(() => ServicoSalariosRH.retirarPontual(p, r.id, actor), 'Rubrica retirada')}><Trash2 className="h-4 w-4" /></Button>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {detalhe.dados.recibos.length === 0 ? <Vazio>{p.estado === 'aberto' ? 'Carregue em «Calcular» para correr o motor para todos os funcionários.' : 'Sem recibos.'}</Vazio> : (
                                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500 dark:bg-slate-950">
                                            <tr><th className="px-3 py-2">Funcionário</th><th className="px-3 py-2 text-right">Bruto</th><th className="px-3 py-2 text-right">INSS</th><th className="px-3 py-2 text-right">IRT</th><th className="px-3 py-2 text-right">Outros</th><th className="px-3 py-2 text-right">Líquido</th><th className="px-3 py-2">Avisos</th></tr>
                                        </thead>
                                        <tbody>{detalhe.dados.recibos.map(r => {
                                            const avisos: string[] = r.avisos_json ? JSON.parse(r.avisos_json) : [];
                                            return (
                                                <tr key={r.id} onClick={() => setRecibo(r)} className={`cursor-pointer border-t border-slate-100 dark:border-slate-800 ${avisos.length ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                                                    <td className="px-3 py-2 font-semibold">{r.nome}<div className="text-[11px] font-normal text-slate-400">{r.numero_recibo}</div></td>
                                                    <td className="px-3 py-2 text-right">{kz(r.bruto_minor)}</td><td className="px-3 py-2 text-right">{kz(r.inss_minor)}</td>
                                                    <td className="px-3 py-2 text-right">{kz(r.irt_minor)}</td><td className="px-3 py-2 text-right">{kz(r.outros_descontos_minor)}</td>
                                                    <td className="px-3 py-2 text-right font-black">{kz(r.liquido_minor)}</td>
                                                    <td className="px-3 py-2 text-xs text-amber-800">{avisos.length ? <span className="flex items-start gap-1"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{avisos.join(' ')}</span> : ''}</td>
                                                </tr>
                                            );
                                        })}</tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </section>
            </div>

            {actor && abrir && <DialogoAbrir funcionarios={base.dados.funcionarios.filter(f => f.estado !== 'cessado')} onClose={() => setAbrir(false)}
                onConfirm={async input => { let id = ''; const ok = await executar(async () => { id = await ServicoSalariosRH.abrir(input, actor); }, 'Processamento aberto'); if (ok) { await lista.recarregar(); setSeleccionado(id); } return ok; }} />}
            {actor && p && recibo && <DialogoRecibo recibo={recibo} processamento={p} settings={companySettings} actorName={actor.name} onClose={() => setRecibo(null)} />}
            {actor && p && pontual && <DialogoPontual funcionarios={detalhe.dados.recibos.length ? base.dados.funcionarios.filter(f => detalhe.dados.recibos.some(r => r.funcionario_id === f.id)) : base.dados.funcionarios.filter(f => f.estado === 'activo')}
                rubricas={base.dados.rubricas.filter(r => r.activo && !r.sistema)} onClose={() => setPontual(false)}
                onConfirm={input => accao(() => ServicoSalariosRH.acrescentarPontual(p, input, actor), 'Rubrica acrescentada: recalcule o processamento')} />}
            {actor && p && reabrir && <DialogoTexto titulo="Reabrir processamento" descricao={p.estado === 'calculado' ? 'Volta a «aberto» para corrigir o ponto ou as rubricas e recalcular.' : 'Só o Super Administrador reabre um processamento aprovado ou pago (volta a «calculado»). Indique a justificação.'}
                rotulo="Reabrir" onClose={() => setReabrir(false)} onConfirm={motivo => accao(() => ServicoSalariosRH.reabrir(p, motivo, actor), 'Processamento reaberto')} />}
            {actor && p && pagar && <DialogoPagar onClose={() => setPagar(false)} onConfirm={conta => accao(() => ServicoSalariosRH.pagar(p, conta, actor), 'Processamento marcado como pago')} />}
        </MainLayout>
    );
}

function DialogoAbrir({ funcionarios, onClose, onConfirm }: { funcionarios: Array<{ id: string; nome: string }>; onClose: () => void; onConfirm: (i: { ano: number; mes: number; tipo: TipoProcessamento; funcionarios?: string[]; descricao?: string }) => Promise<boolean> }) {
    const hoje = luandaTodayKey();
    const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
    const [mes, setMes] = useState(Number(hoje.slice(5, 7)));
    const [tipo, setTipo] = useState<TipoProcessamento>('normal');
    const [descricao, setDescricao] = useState('');
    const [escolhidos, setEscolhidos] = useState<string[]>([]);
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Abrir processamento</DialogTitle><DialogDescription>O normal inclui todos os funcionários activos do mês; férias, Natal e acerto podem ser só de alguns.</DialogDescription></DialogHeader>
                <div className="grid gap-3 sm:grid-cols-3">
                    <div><Label className="text-xs font-bold">Ano</Label><Input className="mt-1" type="number" value={ano} onChange={e => setAno(Number(e.target.value))} /></div>
                    <div><Label className="text-xs font-bold">Mês</Label><Input className="mt-1" type="number" min={1} max={12} value={mes} onChange={e => setMes(Number(e.target.value))} /></div>
                    <div><Label className="text-xs font-bold">Tipo</Label>
                        <Select value={tipo} onValueChange={v => setTipo(v as TipoProcessamento)}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>{(Object.keys(ROTULO_TIPO) as TipoProcessamento[]).map(t => <SelectItem key={t} value={t}>{ROTULO_TIPO[t]}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="sm:col-span-3"><Label className="text-xs font-bold">Descrição (opcional)</Label><Input className="mt-1" value={descricao} onChange={e => setDescricao(e.target.value)} /></div>
                </div>
                {tipo !== 'normal' && (
                    <div>
                        <Label className="text-xs font-bold">Funcionários {tipo === 'acerto' ? '(obrigatório)' : '(vazio = todos os activos)'}</Label>
                        <div className="mt-1 grid max-h-40 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-800">
                            {funcionarios.map(f => <label key={f.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={escolhidos.includes(f.id)} onChange={() => setEscolhidos(l => l.includes(f.id) ? l.filter(x => x !== f.id) : [...l, f.id])} /> {f.nome}</label>)}
                        </div>
                    </div>
                )}
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={() => void onConfirm({ ano, mes, tipo, descricao, funcionarios: tipo === 'normal' ? undefined : escolhidos }).then(ok => ok && onClose())}>Abrir</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoRecibo({ recibo, processamento, settings, actorName, onClose }: { recibo: Recibo; processamento: Processamento; settings: unknown; actorName: string; onClose: () => void }) {
    const linhas = useCarregar(() => ServicoSalariosRH.linhas(recibo.id), [] as LinhaReciboRH[], [recibo.id]);
    const linha = (n: string, v: React.ReactNode, forte = false) => <div className={`flex justify-between py-0.5 ${forte ? 'font-black' : ''}`}><span className="text-slate-500">{n}</span><span>{v}</span></div>;
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader><DialogTitle>{recibo.nome}</DialogTitle><DialogDescription>Recibo {recibo.numero_recibo} · {ROTULO_TIPO[processamento.tipo]} · {periodoPt(processamento.ano, processamento.mes)}</DialogDescription></DialogHeader>
                <table className="w-full text-sm">
                    <thead className="text-left text-[11px] uppercase text-slate-500"><tr><th>Rubrica</th><th className="text-right">Qtd.</th><th className="text-right">Abonos</th><th className="text-right">Descontos</th></tr></thead>
                    <tbody>{linhas.dados.map(l => (
                        <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1">{l.descricao}{l.isento_irt_minor ? <span className="ml-1 text-[10px] text-emerald-600">(isento IRT {kz(l.isento_irt_minor)})</span> : null}</td>
                            <td className="text-right">{l.quantidade !== 1 ? l.quantidade : ''}</td><td className="text-right">{l.tipo === 'abono' ? kz(l.valor_minor) : ''}</td><td className="text-right">{l.tipo === 'desconto' ? kz(l.valor_minor) : ''}</td></tr>
                    ))}</tbody>
                </table>
                <div className="grid gap-x-8 text-sm sm:grid-cols-2">
                    <div>{linha('Valor-dia', kz(recibo.valor_dia_minor))}{linha('Valor-hora', kz(recibo.valor_hora_minor))}{linha('Dias trabalhados', recibo.dias_trabalhados)}{linha('Remuneração bruta', kz(recibo.bruto_minor), true)}{linha('Base de INSS', kz(recibo.base_inss_minor))}</div>
                    <div>{linha('INSS do trabalhador', kz(recibo.inss_minor))}{linha('Parte isenta de IRT', kz(recibo.isento_irt_minor))}{linha('Matéria colectável', kz(recibo.base_irt_minor))}{linha(`IRT${recibo.escalao_irt ? ` (${recibo.escalao_irt}.º escalão)` : ''}`, kz(recibo.irt_minor))}{linha('Outros descontos', kz(recibo.outros_descontos_minor))}{linha('Líquido', kz(recibo.liquido_minor), true)}{linha('INSS da empresa', kz(recibo.inss_emp_minor))}{linha('Custo para a empresa', kz(recibo.custo_empresa_minor))}</div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => gerarReciboPdf(recibo, linhas.dados, cabecalhoPdf(processamento), settings, actorName)}><FileDown className="mr-1.5 h-4 w-4" /> Recibo (PDF)</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoPontual({ funcionarios, rubricas, onClose, onConfirm }: { funcionarios: Array<{ id: string; nome: string }>; rubricas: Array<{ id: string; nome: string; tipo: string }>; onClose: () => void; onConfirm: (i: { funcionario_id: string; rubrica_id: string; valor_minor: number; descricao: string }) => Promise<boolean> }) {
    const [funcionario, setFuncionario] = useState(funcionarios[0]?.id || '');
    const [rubrica, setRubrica] = useState(rubricas.find(r => r.nome.startsWith('Prémio'))?.id || rubricas[0]?.id || '');
    const [valor, setValor] = useState(0);
    const [descricao, setDescricao] = useState('');
    const ordenados = useMemo(() => [...rubricas].sort((a, b) => a.tipo.localeCompare(b.tipo)), [rubricas]);
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Rubrica do mês</DialogTitle><DialogDescription>Prémio, adiantamento ou outra rubrica só deste processamento. Depois, recalcule.</DialogDescription></DialogHeader>
                <Select value={funcionario} onValueChange={setFuncionario}><SelectTrigger><SelectValue placeholder="Funcionário" /></SelectTrigger><SelectContent>{funcionarios.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent></Select>
                <Select value={rubrica} onValueChange={setRubrica}><SelectTrigger><SelectValue placeholder="Rubrica" /></SelectTrigger><SelectContent>{ordenados.map(r => <SelectItem key={r.id} value={r.id}>{r.nome} ({r.tipo})</SelectItem>)}</SelectContent></Select>
                <CurrencyInput value={valor} onValueChange={setValor} />
                <Input placeholder="Descrição (opcional)" value={descricao} onChange={e => setDescricao(e.target.value)} />
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => void onConfirm({ funcionario_id: funcionario, rubrica_id: rubrica, valor_minor: paraMinor(valor), descricao }).then(ok => ok && onClose())}>Acrescentar</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoTexto({ titulo, descricao, rotulo, onClose, onConfirm }: { titulo: string; descricao: string; rotulo: string; onClose: () => void; onConfirm: (t: string) => Promise<boolean> }) {
    const [texto, setTexto] = useState('');
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{titulo}</DialogTitle><DialogDescription>{descricao}</DialogDescription></DialogHeader>
                <Textarea rows={3} placeholder="Motivo" value={texto} onChange={e => setTexto(e.target.value)} />
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => void onConfirm(texto).then(ok => ok && onClose())}>{rotulo}</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoPagar({ onClose, onConfirm }: { onClose: () => void; onConfirm: (c: 'bank' | 'cash') => Promise<boolean> }) {
    const [conta, setConta] = useState<'bank' | 'cash'>('bank');
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Pagar salários</DialogTitle><DialogDescription>Gere o ficheiro de transferências para o banco e marque como pago. Ao fechar, os lançamentos saem desta conta.</DialogDescription></DialogHeader>
                <Select value={conta} onValueChange={v => setConta(v as 'bank' | 'cash')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bank">Banco</SelectItem><SelectItem value="cash">Caixa</SelectItem></SelectContent></Select>
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => void onConfirm(conta).then(ok => ok && onClose())}>Marcar como pago</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
