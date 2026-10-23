import { useMemo, useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Switch } from '@/componentes/ui/switch';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Edit, Plus, Trash2 } from 'lucide-react';
import { ServicoRH, type ActorRH, type Cargo, type Departamento, type Rubrica } from '@/servicos/rh/ServicoRH';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import type { TipoAusencia } from '@/bibliotecas/rh/ponto';
import { parametroEmVigor, tabelaIrtEmVigor, type IrtEscalao, type ParametroRH } from '@/bibliotecas/rh/parametros-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { NavegacaoRH, dataPt, executar, kz, paraMinor, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { useBaseRH } from './FuncionariosRH';

const NENHUM = '__nenhum__';
const pct = (valor: number) => `${(valor * 100).toLocaleString('pt-PT', { maximumFractionDigits: 2 })}%`;

export default function ConfiguracoesRH() {
    const { actor, configurar, gerir } = useActorRH();
    const base = useBaseRH();
    const irt = useCarregar(async () => ({ tabelas: await ServicoRH.tabelasIrt(), escaloes: await ServicoRH.escaloesIrt() }), { tabelas: [], escaloes: [] as IrtEscalao[] });
    const { parametros, rubricas, departamentos, cargos } = base.dados;
    const hoje = luandaTodayKey();
    const [parametro, setParametro] = useState<ParametroRH | null>(null);
    const [novaTabela, setNovaTabela] = useState(false);
    const [rubrica, setRubrica] = useState<Partial<Rubrica> | null>(null);
    const [departamento, setDepartamento] = useState<Partial<Departamento> | null>(null);
    const [cargo, setCargo] = useState<Partial<Cargo> | null>(null);
    const tiposAusencia = useCarregar(() => ServicoTempoRH.tiposAusencia(), [] as TipoAusencia[]);
    const [tipoAusencia, setTipoAusencia] = useState<Partial<TipoAusencia> | null>(null);

    const chaves = useMemo(() => [...new Set(parametros.map(p => p.chave))], [parametros]);
    const tabelaActual = tabelaIrtEmVigor(irt.dados.tabelas, hoje);

    return (
        <MainLayout title="Configurações de RH" subtitle="Parâmetros legais com vigência, tabela do IRT, rubricas e estrutura da empresa">
            <NavegacaoRH />
            {!configurar && <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Só consulta: alterar parâmetros, tabela do IRT e rubricas exige a permissão «RH: Configurações legais».</p>}
            <Tabs defaultValue="parametros">
                <TabsList className="flex-wrap">
                    <TabsTrigger value="parametros">Parâmetros legais</TabsTrigger>
                    <TabsTrigger value="irt">Tabela do IRT</TabsTrigger>
                    <TabsTrigger value="rubricas">Rubricas</TabsTrigger>
                    <TabsTrigger value="ausencias">Tipos de ausência</TabsTrigger>
                    <TabsTrigger value="estrutura">Departamentos e cargos</TabsTrigger>
                </TabsList>

                <TabsContent value="parametros">
                    <p className="mb-3 text-xs text-slate-500">Cada valor tem data de início de vigência. Um novo valor não altera o anterior: os processamentos já feitos continuam a usar a taxa do seu mês. Valide estes valores com um contabilista certificado.</p>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500 dark:bg-slate-900"><tr><th className="px-3 py-2">Parâmetro</th><th className="px-3 py-2">Valor em vigor</th><th className="px-3 py-2">Desde</th><th className="px-3 py-2">Versões</th><th /></tr></thead>
                            <tbody>
                                {chaves.map(chave => {
                                    const vigente = parametroEmVigor(parametros, chave, hoje);
                                    const versoes = parametros.filter(p => p.chave === chave);
                                    return (
                                        <tr key={chave} className="border-t border-slate-100 dark:border-slate-800">
                                            <td className="px-3 py-2"><div className="font-mono text-xs font-bold">{chave}</div><div className="text-xs text-slate-500">{versoes[0]?.descricao}</div></td>
                                            <td className="px-3 py-2 font-semibold">{vigente?.valor ?? '—'}</td>
                                            <td className="px-3 py-2">{dataPt(vigente?.vigencia_inicio)}</td>
                                            <td className="px-3 py-2 text-xs text-slate-500">{versoes.map(v => `${v.valor} (${dataPt(v.vigencia_inicio)}${v.vigencia_fim ? ` a ${dataPt(v.vigencia_fim)}` : ''})`).join(' · ')}</td>
                                            <td className="px-3 py-2 text-right">{configurar && vigente && <Button size="sm" variant="outline" onClick={() => setParametro(vigente)}>Novo valor</Button>}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                <TabsContent value="irt" className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-500">IRT do Grupo A (trabalho por conta de outrem). Quando sair um novo OGE, crie uma nova versão: os recibos antigos mantêm a tabela do seu ano.</p>
                        {configurar && <Button size="sm" onClick={() => setNovaTabela(true)}><Plus className="mr-1.5 h-4 w-4" /> Nova versão da tabela</Button>}
                    </div>
                    {irt.dados.tabelas.map(t => (
                        <div key={t.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <h3 className="font-black">IRT {t.ano}</h3>
                                {t.id === tabelaActual?.id && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">em vigor</span>}
                                <span className="text-xs text-slate-500">{t.lei_referencia} · {dataPt(t.vigencia_inicio)}{t.vigencia_fim ? ` a ${dataPt(t.vigencia_fim)}` : ''}</span>
                            </div>
                            <table className="w-full text-sm">
                                <thead className="text-left text-[11px] uppercase text-slate-500"><tr><th>Escalão</th><th>Acima de</th><th>Até</th><th>Parcela fixa</th><th>Taxa sobre o excesso</th></tr></thead>
                                <tbody>{irt.dados.escaloes.filter(e => e.tabela_id === t.id).map(e => (
                                    <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800">
                                        <td className="py-1">{e.ordem}.º</td><td>{kz(e.limite_inferior_minor)}</td><td>{e.limite_superior_minor === null ? 'sem limite' : kz(e.limite_superior_minor)}</td>
                                        <td>{kz(e.parcela_fixa_minor)}</td><td>{e.taxa === 0 ? 'Isento' : pct(e.taxa)}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    ))}
                </TabsContent>

                <TabsContent value="rubricas" className="space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">Cada linha do recibo é uma rubrica: diz se incide INSS, se incide IRT e a parte isenta de IRT. As de sistema são usadas pelo motor de cálculo.</p>
                        {configurar && <Button size="sm" onClick={() => setRubrica({ tipo: 'abono', forma: 'fixo', incide_inss: 1, incide_irt: 1, ordem_no_recibo: 100, activo: 1 })}><Plus className="mr-1.5 h-4 w-4" /> Nova rubrica</Button>}
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500 dark:bg-slate-900"><tr><th className="px-3 py-2">Código</th><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">INSS</th><th className="px-3 py-2">IRT</th><th className="px-3 py-2">Isento de IRT</th><th className="px-3 py-2">Conta</th><th /></tr></thead>
                            <tbody>{rubricas.map(r => (
                                <tr key={r.id} className={`border-t border-slate-100 dark:border-slate-800 ${r.activo ? '' : 'opacity-50'}`}>
                                    <td className="px-3 py-2 font-mono text-xs">{r.codigo}{r.sistema ? <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500 dark:bg-slate-800">sistema</span> : null}</td>
                                    <td className="px-3 py-2 font-semibold">{r.nome}</td><td className="px-3 py-2 capitalize">{r.tipo}</td>
                                    <td className="px-3 py-2">{r.incide_inss ? 'Sim' : 'Não'}</td><td className="px-3 py-2">{r.incide_irt ? 'Sim' : 'Não'}</td>
                                    <td className="px-3 py-2">{r.limite_isento_irt_minor ? `até ${kz(r.limite_isento_irt_minor)}` : r.limite_isento_irt_pct ? `até ${pct(r.limite_isento_irt_pct)} do salário base` : '—'}</td>
                                    <td className="px-3 py-2 text-xs">{r.conta_contabilistica || '—'}</td>
                                    <td className="px-3 py-2 text-right">{configurar && <Button size="icon" variant="ghost" onClick={() => setRubrica(r)}><Edit className="h-4 w-4" /></Button>}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                </TabsContent>

                <TabsContent value="ausencias" className="space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">Tipos de falta e licença. Confirme os dias e a remuneração de cada licença na Lei Geral do Trabalho em vigor.</p>
                        {configurar && <Button size="sm" onClick={() => setTipoAusencia({ justificada: 1, remunerada: 1, desconta_salario: 0 })}><Plus className="mr-1.5 h-4 w-4" /> Novo tipo</Button>}
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500 dark:bg-slate-900"><tr><th className="px-3 py-2">Código</th><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Justificada</th><th className="px-3 py-2">Remunerada</th><th className="px-3 py-2">Desconta salário</th><th className="px-3 py-2">Exige documento</th><th /></tr></thead>
                            <tbody>{tiposAusencia.dados.map(t => (
                                <tr key={t.id} className={`border-t border-slate-100 dark:border-slate-800 ${t.activo ? '' : 'opacity-50'}`}>
                                    <td className="px-3 py-2 font-mono text-xs">{t.codigo}</td><td className="px-3 py-2 font-semibold">{t.nome}</td>
                                    <td className="px-3 py-2">{t.justificada ? 'Sim' : 'Não'}</td><td className="px-3 py-2">{t.remunerada ? 'Sim' : 'Não'}</td>
                                    <td className="px-3 py-2">{t.desconta_salario ? 'Sim' : 'Não'}</td><td className="px-3 py-2">{t.exige_documento ? 'Sim' : 'Não'}</td>
                                    <td className="px-3 py-2 text-right">{configurar && <Button size="icon" variant="ghost" onClick={() => setTipoAusencia(t)}><Edit className="h-4 w-4" /></Button>}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                </TabsContent>

                <TabsContent value="estrutura" className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between"><h3 className="font-black">Departamentos</h3>{gerir && <Button size="sm" onClick={() => setDepartamento({ nome: '' })}><Plus className="mr-1.5 h-4 w-4" /> Novo</Button>}</div>
                        {departamentos.length === 0 ? <Vazio>Sem departamentos.</Vazio> : departamentos.map(d => (
                            <div key={d.id} className={`flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 ${d.activo ? '' : 'opacity-50'}`}>
                                <span><b>{d.nome}</b> · {base.dados.funcionarios.filter(f => f.departamento_id === d.id && f.estado === 'activo').length} activo(s)
                                    {d.responsavel_id ? ` · responsável: ${base.dados.funcionarios.find(f => f.id === d.responsavel_id)?.nome || '—'}` : ''}</span>
                                {gerir && <Button size="icon" variant="ghost" onClick={() => setDepartamento(d)}><Edit className="h-4 w-4" /></Button>}
                            </div>
                        ))}
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between"><h3 className="font-black">Cargos</h3>{gerir && <Button size="sm" onClick={() => setCargo({ nome: '', salario_referencia_minor: 0 })}><Plus className="mr-1.5 h-4 w-4" /> Novo</Button>}</div>
                        {cargos.length === 0 ? <Vazio>Sem cargos.</Vazio> : cargos.map(c => (
                            <div key={c.id} className={`flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 ${c.activo ? '' : 'opacity-50'}`}>
                                <span><b>{c.nome}</b> · {departamentos.find(d => d.id === c.departamento_id)?.nome || 'sem departamento'} · referência {kz(c.salario_referencia_minor)}</span>
                                {gerir && <Button size="icon" variant="ghost" onClick={() => setCargo(c)}><Edit className="h-4 w-4" /></Button>}
                            </div>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>

            {actor && parametro && <DialogoParametro parametro={parametro} actor={actor} onClose={() => setParametro(null)} onSaved={() => void base.recarregar()} />}
            {actor && novaTabela && <DialogoTabelaIrt base={irt.dados.escaloes.filter(e => e.tabela_id === tabelaActual?.id)} actor={actor} onClose={() => setNovaTabela(false)} onSaved={() => void irt.recarregar()} />}
            {actor && rubrica && <DialogoRubrica rubrica={rubrica} actor={actor} onClose={() => setRubrica(null)} onSaved={() => void base.recarregar()} />}
            {actor && departamento && <DialogoDepartamento departamento={departamento} funcionarios={base.dados.funcionarios} actor={actor} onClose={() => setDepartamento(null)} onSaved={() => void base.recarregar()} />}
            {actor && tipoAusencia && <DialogoTipoAusencia tipo={tipoAusencia} actor={actor} onClose={() => setTipoAusencia(null)} onSaved={() => void tiposAusencia.recarregar()} />}
            {actor && cargo && <DialogoCargo cargo={cargo} departamentos={departamentos} actor={actor} onClose={() => setCargo(null)} onSaved={() => void base.recarregar()} />}
        </MainLayout>
    );
}

function Moldura({ titulo, descricao, children, onClose, onConfirm, largo }: { titulo: string; descricao?: string; children: React.ReactNode; onClose: () => void; onConfirm: () => Promise<boolean>; largo?: boolean }) {
    const [aGuardar, setAGuardar] = useState(false);
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className={largo ? 'max-h-[90vh] max-w-3xl overflow-y-auto' : 'max-w-lg'}>
                <DialogHeader><DialogTitle>{titulo}</DialogTitle>{descricao && <DialogDescription>{descricao}</DialogDescription>}</DialogHeader>
                {children}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button disabled={aGuardar} onClick={async () => { setAGuardar(true); const ok = await onConfirm(); setAGuardar(false); if (ok) onClose(); }}>{aGuardar ? 'A guardar…' : 'Guardar'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const Campo = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) =>
    <div className={className}><Label className="text-xs font-bold">{label}</Label><div className="mt-1">{children}</div></div>;

type Base = { actor: ActorRH; onClose: () => void; onSaved: () => void };

function DialogoParametro({ parametro, actor, onClose, onSaved }: Base & { parametro: ParametroRH }) {
    const [valor, setValor] = useState(parametro.valor);
    const [inicio, setInicio] = useState(luandaTodayKey());
    return (
        <Moldura titulo={`Novo valor de ${parametro.chave}`} descricao={parametro.descricao || undefined} onClose={onClose}
            onConfirm={async () => { const ok = await executar(() => ServicoRH.novoValorParametro(parametro.chave, valor, inicio, actor), 'Novo valor registado'); if (ok) onSaved(); return ok; }}>
            <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Valor (fracções com ponto: 0.03 = 3%)"><Input value={valor} onChange={e => setValor(e.target.value)} /></Campo>
                <Campo label="Em vigor a partir de"><Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></Campo>
            </div>
            <p className="text-xs text-slate-500">O valor actual ({parametro.valor}) fica com vigência até à véspera e continua a ser usado nos meses anteriores.</p>
        </Moldura>
    );
}

function DialogoTabelaIrt({ base, actor, onClose, onSaved }: Base & { base: IrtEscalao[] }) {
    const ano = new Date().getFullYear() + 1;
    const [cabecalho, setCabecalho] = useState({ ano, lei: '', inicio: `${ano}-01-01` });
    const [linhas, setLinhas] = useState(base.map(e => ({ inferior: e.limite_inferior_minor / 100, superior: e.limite_superior_minor === null ? null : e.limite_superior_minor / 100, parcela: e.parcela_fixa_minor / 100, taxa: e.taxa * 100 })));
    const mudar = (i: number, campo: keyof (typeof linhas)[number], valor: number | null) => setLinhas(ls => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
    return (
        <Moldura largo titulo="Nova versão da tabela do IRT" descricao="Parte da tabela em vigor; ajuste os escalões. A tabela anterior termina na véspera do início." onClose={onClose}
            onConfirm={async () => {
                const ok = await executar(() => ServicoRH.novaTabelaIrt({
                    ano: cabecalho.ano, lei_referencia: cabecalho.lei, vigencia_inicio: cabecalho.inicio,
                    escaloes: linhas.map((l, i) => ({ ordem: i + 1, limite_inferior_minor: paraMinor(l.inferior), limite_superior_minor: l.superior === null ? null : paraMinor(l.superior), parcela_fixa_minor: paraMinor(l.parcela), taxa: Math.round(l.taxa * 1000) / 100000 })),
                }, actor), 'Nova tabela do IRT registada');
                if (ok) onSaved();
                return ok;
            }}>
            <div className="grid gap-3 sm:grid-cols-3">
                <Campo label="Ano"><Input type="number" value={cabecalho.ano} onChange={e => setCabecalho(c => ({ ...c, ano: Number(e.target.value) }))} /></Campo>
                <Campo label="Lei de referência"><Input value={cabecalho.lei} placeholder="Ex.: Lei n.º …/26 (OGE 2027)" onChange={e => setCabecalho(c => ({ ...c, lei: e.target.value }))} /></Campo>
                <Campo label="Em vigor a partir de"><Input type="date" value={cabecalho.inicio} onChange={e => setCabecalho(c => ({ ...c, inicio: e.target.value }))} /></Campo>
            </div>
            <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase text-slate-500"><tr><th>#</th><th>Acima de (Kz)</th><th>Até (Kz, vazio = sem limite)</th><th>Parcela fixa (Kz)</th><th>Taxa %</th><th /></tr></thead>
                <tbody>{linhas.map((l, i) => (
                    <tr key={i}>
                        <td className="pr-2">{i + 1}.º</td>
                        <td className="p-1"><CurrencyInput value={l.inferior} onValueChange={v => mudar(i, 'inferior', v)} /></td>
                        <td className="p-1"><CurrencyInput value={l.superior ?? 0} onValueChange={v => mudar(i, 'superior', v || null)} /></td>
                        <td className="p-1"><CurrencyInput value={l.parcela} onValueChange={v => mudar(i, 'parcela', v)} /></td>
                        <td className="p-1"><Input type="number" step="0.1" value={l.taxa} onChange={e => mudar(i, 'taxa', Number(e.target.value))} /></td>
                        <td><Button size="icon" variant="ghost" onClick={() => setLinhas(ls => ls.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></td>
                    </tr>
                ))}</tbody>
            </table>
            <Button size="sm" variant="outline" onClick={() => setLinhas(ls => [...ls, { inferior: ls[ls.length - 1]?.superior ?? 0, superior: null, parcela: 0, taxa: 0 }])}><Plus className="mr-1.5 h-4 w-4" /> Escalão</Button>
        </Moldura>
    );
}

function DialogoRubrica({ rubrica, actor, onClose, onSaved }: Base & { rubrica: Partial<Rubrica> }) {
    const [r, setR] = useState<Partial<Rubrica>>(rubrica);
    const set = (campo: keyof Rubrica, valor: unknown) => setR(p => ({ ...p, [campo]: valor }));
    return (
        <Moldura titulo={r.id ? `Editar ${r.codigo}` : 'Nova rubrica'} onClose={onClose}
            onConfirm={async () => { const ok = await executar(() => ServicoRH.guardarRubrica(r, actor), 'Rubrica guardada'); if (ok) onSaved(); return ok; }}>
            <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Código"><Input value={r.codigo || ''} disabled={Boolean(r.id)} onChange={e => set('codigo', e.target.value.toUpperCase())} /></Campo>
                <Campo label="Nome"><Input value={r.nome || ''} onChange={e => set('nome', e.target.value)} /></Campo>
                <Campo label="Tipo">
                    <Select value={r.tipo} onValueChange={v => set('tipo', v)} disabled={Boolean(r.sistema)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="abono">Abono</SelectItem><SelectItem value="desconto">Desconto</SelectItem></SelectContent>
                    </Select>
                </Campo>
                <Campo label="Forma de cálculo">
                    <Select value={r.forma} onValueChange={v => set('forma', v)} disabled={Boolean(r.sistema)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="fixo">Valor fixo</SelectItem><SelectItem value="percentagem">% do salário base</SelectItem><SelectItem value="quantidade">Quantidade × valor</SelectItem></SelectContent>
                    </Select>
                </Campo>
                {r.forma === 'percentagem' && !r.sistema && <Campo label="Percentagem (0.1 = 10%)"><Input type="number" step="0.01" value={r.percentagem ?? 0} onChange={e => set('percentagem', Number(e.target.value))} /></Campo>}
                <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={Boolean(r.incide_inss)} onCheckedChange={v => set('incide_inss', v ? 1 : 0)} /> Incide INSS</label>
                <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={Boolean(r.incide_irt)} onCheckedChange={v => set('incide_irt', v ? 1 : 0)} /> Incide IRT</label>
                <Campo label="Parte isenta de IRT (Kz por mês)"><CurrencyInput value={(r.limite_isento_irt_minor || 0) / 100} onValueChange={v => set('limite_isento_irt_minor', paraMinor(v))} /></Campo>
                <Campo label="ou % do salário base isenta (0.05 = 5%)"><Input type="number" step="0.01" value={r.limite_isento_irt_pct ?? 0} onChange={e => set('limite_isento_irt_pct', Number(e.target.value))} /></Campo>
                <Campo label="Conta contabilística"><Input value={r.conta_contabilistica || ''} placeholder="Ex.: 72.2" onChange={e => set('conta_contabilistica', e.target.value)} /></Campo>
                <Campo label="Ordem no recibo"><Input type="number" value={r.ordem_no_recibo ?? 100} onChange={e => set('ordem_no_recibo', Number(e.target.value))} /></Campo>
                {!r.sistema && r.id && <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={r.activo !== 0} onCheckedChange={v => set('activo', v ? 1 : 0)} /> Activa</label>}
            </div>
        </Moldura>
    );
}

function DialogoDepartamento({ departamento, funcionarios, actor, onClose, onSaved }: Base & { departamento: Partial<Departamento>; funcionarios: { id: string; nome: string }[] }) {
    const [d, setD] = useState(departamento);
    return (
        <Moldura titulo={d.id ? 'Editar departamento' : 'Novo departamento'} onClose={onClose}
            onConfirm={async () => { const ok = await executar(() => ServicoRH.guardarDepartamento({ id: d.id, nome: d.nome || '', responsavel_id: d.responsavel_id, activo: d.activo !== 0 }, actor), 'Departamento guardado'); if (ok) onSaved(); return ok; }}>
            <div className="grid gap-3">
                <Campo label="Nome"><Input value={d.nome || ''} onChange={e => setD(p => ({ ...p, nome: e.target.value }))} /></Campo>
                <Campo label="Responsável">
                    <Select value={d.responsavel_id || NENHUM} onValueChange={v => setD(p => ({ ...p, responsavel_id: v === NENHUM ? null : v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value={NENHUM}>—</SelectItem>{funcionarios.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
                    </Select>
                </Campo>
                {d.id && <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={d.activo !== 0} onCheckedChange={v => setD(p => ({ ...p, activo: v ? 1 : 0 }))} /> Activo</label>}
            </div>
        </Moldura>
    );
}

function DialogoCargo({ cargo, departamentos, actor, onClose, onSaved }: Base & { cargo: Partial<Cargo>; departamentos: Departamento[] }) {
    const [c, setC] = useState(cargo);
    return (
        <Moldura titulo={c.id ? 'Editar cargo' : 'Novo cargo'} onClose={onClose}
            onConfirm={async () => { const ok = await executar(() => ServicoRH.guardarCargo({ id: c.id, nome: c.nome || '', departamento_id: c.departamento_id, salario_referencia_minor: c.salario_referencia_minor, activo: c.activo !== 0 }, actor), 'Cargo guardado'); if (ok) onSaved(); return ok; }}>
            <div className="grid gap-3">
                <Campo label="Nome"><Input value={c.nome || ''} onChange={e => setC(p => ({ ...p, nome: e.target.value }))} /></Campo>
                <Campo label="Departamento">
                    <Select value={c.departamento_id || NENHUM} onValueChange={v => setC(p => ({ ...p, departamento_id: v === NENHUM ? null : v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value={NENHUM}>—</SelectItem>{departamentos.map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}</SelectContent>
                    </Select>
                </Campo>
                <Campo label="Salário de referência"><CurrencyInput value={(c.salario_referencia_minor || 0) / 100} onValueChange={v => setC(p => ({ ...p, salario_referencia_minor: paraMinor(v) }))} /></Campo>
                {c.id && <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={c.activo !== 0} onCheckedChange={v => setC(p => ({ ...p, activo: v ? 1 : 0 }))} /> Activo</label>}
            </div>
        </Moldura>
    );
}

function DialogoTipoAusencia({ tipo, actor, onClose, onSaved }: Base & { tipo: Partial<TipoAusencia> }) {
    const [t, setT] = useState(tipo);
    const interruptor = (campo: keyof TipoAusencia, rotulo: string) => (
        <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={Boolean(t[campo])} onCheckedChange={v => setT(p => ({ ...p, [campo]: v ? 1 : 0 }))} /> {rotulo}</label>
    );
    return (
        <Moldura titulo={t.id ? `Editar ${t.nome}` : 'Novo tipo de ausência'} onClose={onClose}
            onConfirm={async () => { const ok = await executar(() => ServicoTempoRH.guardarTipoAusencia(t, actor), 'Tipo de ausência guardado'); if (ok) onSaved(); return ok; }}>
            <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Código"><Input value={t.codigo || ''} disabled={Boolean(t.id)} onChange={e => setT(p => ({ ...p, codigo: e.target.value.toUpperCase() }))} /></Campo>
                <Campo label="Nome"><Input value={t.nome || ''} onChange={e => setT(p => ({ ...p, nome: e.target.value }))} /></Campo>
                {interruptor('justificada', 'Justificada')}
                {interruptor('remunerada', 'Remunerada')}
                {interruptor('desconta_salario', 'Desconta no salário')}
                {interruptor('desconta_ferias', 'Conta como férias')}
                {interruptor('exige_documento', 'Exige documento')}
                {t.id && <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={t.activo !== 0} onCheckedChange={v => setT(p => ({ ...p, activo: v ? 1 : 0 }))} /> Activo</label>}
            </div>
        </Moldura>
    );
}
