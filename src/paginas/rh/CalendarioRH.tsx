import { useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Switch } from '@/componentes/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { ChevronLeft, ChevronRight, Edit, Plus } from 'lucide-react';
import { ServicoTempoRH, type AusenciaRH } from '@/servicos/rh/ServicoTempoRH';
import { datasDoMes, diaSemana, feriadoNaData, horasSemanais, type Feriado, type Horario, type TipoAusencia } from '@/bibliotecas/rh/ponto';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { NavegacaoRH, dataPt, executar, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import type { ActorRH } from '@/servicos/rh/ServicoRH';
import { useBaseRH } from './FuncionariosRH';
import { LIGACOES_TEMPO } from './LivroPontoRH';

const TODOS = '__todos__';
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export default function CalendarioRH() {
    const { actor, configurar } = useActorRH();
    const base = useBaseRH();
    const dados = useCarregar(async () => ({
        horarios: await ServicoTempoRH.horarios(), feriados: await ServicoTempoRH.feriados(), ausencias: await ServicoTempoRH.ausencias(), tipos: await ServicoTempoRH.tiposAusencia(),
    }), { horarios: [] as Horario[], feriados: [] as Feriado[], ausencias: [] as AusenciaRH[], tipos: [] as TipoAusencia[] });
    const { horarios, feriados, ausencias, tipos } = dados.dados;
    const hoje = luandaTodayKey();
    const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
    const [mes, setMes] = useState(Number(hoje.slice(5, 7)));
    const [departamento, setDepartamento] = useState(TODOS);
    const [horario, setHorario] = useState<Partial<Horario> | null>(null);
    const [feriado, setFeriado] = useState<Partial<Feriado> | null>(null);
    const mover = (delta: number) => { const d = new Date(Date.UTC(ano, mes - 1 + delta, 1)); setAno(d.getUTCFullYear()); setMes(d.getUTCMonth() + 1); };

    const funcionarios = base.dados.funcionarios.filter(f => f.estado === 'activo' && (departamento === TODOS || f.departamento_id === departamento));
    const ids = new Set(funcionarios.map(f => f.id));
    const nome = (id: string) => base.dados.funcionarios.find(f => f.id === id)?.nome.split(' ')[0] || '—';
    const datas = datasDoMes(ano, mes);
    const vazios = diaSemana(datas[0]) - 1;
    const eventos = (d: string) => {
        const lista: Array<{ texto: string; cor: string }> = [];
        const fer = feriadoNaData(feriados, d);
        if (fer) lista.push({ texto: fer.nome, cor: 'bg-slate-200 text-slate-700' });
        for (const a of ausencias) if (a.estado === 'aprovada' && ids.has(a.funcionario_id) && a.data_inicio <= d && a.data_fim >= d) {
            const t = tipos.find(x => x.id === a.tipo_id);
            lista.push({ texto: `${nome(a.funcionario_id)}: ${t?.desconta_ferias ? 'férias' : t?.nome.toLowerCase() || 'ausência'}`, cor: t?.desconta_ferias ? 'bg-sky-100 text-sky-800' : t?.justificada ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700' });
        }
        for (const f of funcionarios) if (f.data_nascimento?.slice(5, 10) === d.slice(5, 10)) lista.push({ texto: `🎂 ${nome(f.id)}`, cor: 'bg-pink-100 text-pink-700' });
        for (const c of base.dados.contratos) if (c.estado === 'activo' && ids.has(c.funcionario_id) && c.fim === d) lista.push({ texto: `Fim do contrato: ${nome(c.funcionario_id)}`, cor: 'bg-orange-100 text-orange-800' });
        return lista;
    };

    return (
        <MainLayout title="Horários e calendário" subtitle="Turnos, feriados e calendário da empresa">
            <NavegacaoRH extra={LIGACOES_TEMPO} />
            <Tabs defaultValue="calendario">
                <TabsList><TabsTrigger value="calendario">Calendário</TabsTrigger><TabsTrigger value="horarios">Horários</TabsTrigger><TabsTrigger value="feriados">Feriados</TabsTrigger></TabsList>

                <TabsContent value="calendario">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Button size="icon" variant="outline" onClick={() => mover(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                        <span className="min-w-[150px] text-center font-black capitalize">{new Date(Date.UTC(ano, mes - 1, 15)).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
                        <Button size="icon" variant="outline" onClick={() => mover(1)}><ChevronRight className="h-4 w-4" /></Button>
                        <Select value={departamento} onValueChange={setDepartamento}>
                            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value={TODOS}>Todos os departamentos</SelectItem>{base.dados.departamentos.map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-xs">
                        {DIAS.map(d => <div key={d} className="py-1 text-center font-black uppercase text-slate-500">{d}</div>)}
                        {Array.from({ length: vazios }, (_, i) => <div key={`v${i}`} />)}
                        {datas.map(d => (
                            <div key={d} className={`min-h-[86px] rounded-xl border p-1.5 ${d === hoje ? 'border-sky-400' : 'border-slate-200 dark:border-slate-800'} ${diaSemana(d) > 5 ? 'bg-slate-50 dark:bg-slate-900/60' : 'bg-white dark:bg-slate-900'}`}>
                                <div className="mb-1 font-black text-slate-500">{Number(d.slice(8))}</div>
                                <div className="space-y-0.5">{eventos(d).map((e, i) => <div key={i} className={`truncate rounded px-1 py-0.5 text-[10px] font-semibold ${e.cor}`} title={e.texto}>{e.texto}</div>)}</div>
                            </div>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="horarios" className="space-y-2">
                    <div className="flex justify-end">{configurar && <Button size="sm" onClick={() => setHorario({ entrada: '08:00', saida: '17:00', intervalo_min: 60, dias_semana: '1,2,3,4,5', tolerancia_min: 10 })}><Plus className="mr-1.5 h-4 w-4" /> Novo horário</Button>}</div>
                    {horarios.length === 0 ? <Vazio>Sem horários.</Vazio> : horarios.map(h => (
                        <div key={h.id} className={`flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-800 ${h.activo ? '' : 'opacity-50'}`}>
                            <span><b>{h.nome}</b> · {h.entrada}–{h.saida} · intervalo {h.intervalo_min} min · tolerância {h.tolerancia_min} min · {String(h.dias_semana).split(',').map(n => DIAS[Number(n) - 1]).join(', ')} · {horasSemanais(h)} h/semana
                                · {base.dados.funcionarios.filter(f => f.horario_id === h.id || (!f.horario_id && h.id === 'horario-normal')).length} funcionário(s)</span>
                            {configurar && <Button size="icon" variant="ghost" onClick={() => setHorario(h)}><Edit className="h-4 w-4" /></Button>}
                        </div>
                    ))}
                    <p className="text-xs text-slate-500">Os funcionários sem horário escolhido na ficha seguem o «Horário normal».</p>
                </TabsContent>

                <TabsContent value="feriados" className="space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">Nos feriados não se contam faltas; o trabalho nesses dias conta todo como hora extra (acréscimo de feriado). Carnaval e Sexta-feira Santa mudam todos os anos: acrescente-os com a data do ano.</p>
                        {configurar && <Button size="sm" onClick={() => setFeriado({ data: hoje, tipo: 'empresa', recorrente: 0 })}><Plus className="mr-1.5 h-4 w-4" /> Feriado ou dia da empresa</Button>}
                    </div>
                    {feriados.map(f => (
                        <div key={f.id} className={`flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2 text-sm dark:border-slate-800 ${f.activo ? '' : 'opacity-50'}`}>
                            <span><b>{f.recorrente ? f.data.slice(5).split('-').reverse().join('/') : dataPt(f.data)}</b> · {f.nome} · {f.tipo === 'nacional' ? 'nacional' : 'da empresa'}{f.recorrente ? ' · todos os anos' : ''}</span>
                            {configurar && <Button size="icon" variant="ghost" onClick={() => setFeriado(f)}><Edit className="h-4 w-4" /></Button>}
                        </div>
                    ))}
                </TabsContent>
            </Tabs>
            {actor && horario && <DialogoHorario horario={horario} actor={actor} onClose={() => setHorario(null)} onSaved={() => void dados.recarregar()} />}
            {actor && feriado && <DialogoFeriado feriado={feriado} actor={actor} onClose={() => setFeriado(null)} onSaved={() => void dados.recarregar()} />}
        </MainLayout>
    );
}

type Base = { actor: ActorRH; onClose: () => void; onSaved: () => void };

function DialogoHorario({ horario, actor, onClose, onSaved }: Base & { horario: Partial<Horario> }) {
    const [h, setH] = useState(horario);
    const dias = new Set(String(h.dias_semana || '').split(',').filter(Boolean).map(Number));
    const alternar = (n: number) => { const s = new Set(dias); if (s.has(n)) s.delete(n); else s.add(n); setH(p => ({ ...p, dias_semana: [...s].sort().join(',') })); };
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{h.id ? 'Editar horário' : 'Novo horário'}</DialogTitle></DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2"><Label className="text-xs font-bold">Nome</Label><Input className="mt-1" value={h.nome || ''} onChange={e => setH(p => ({ ...p, nome: e.target.value }))} /></div>
                    <div><Label className="text-xs font-bold">Entrada</Label><Input className="mt-1" type="time" value={h.entrada || ''} onChange={e => setH(p => ({ ...p, entrada: e.target.value }))} /></div>
                    <div><Label className="text-xs font-bold">Saída</Label><Input className="mt-1" type="time" value={h.saida || ''} onChange={e => setH(p => ({ ...p, saida: e.target.value }))} /></div>
                    <div><Label className="text-xs font-bold">Intervalo (min)</Label><Input className="mt-1" type="number" value={h.intervalo_min ?? 60} onChange={e => setH(p => ({ ...p, intervalo_min: Number(e.target.value) }))} /></div>
                    <div><Label className="text-xs font-bold">Tolerância de atraso (min)</Label><Input className="mt-1" type="number" value={h.tolerancia_min ?? 10} onChange={e => setH(p => ({ ...p, tolerancia_min: Number(e.target.value) }))} /></div>
                    <div className="sm:col-span-2"><Label className="text-xs font-bold">Dias de trabalho</Label>
                        <div className="mt-1 flex flex-wrap gap-1">{DIAS.map((d, i) => (
                            <button key={d} type="button" onClick={() => alternar(i + 1)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${dias.has(i + 1) ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>{d}</button>
                        ))}</div>
                    </div>
                    {h.id && <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={h.activo !== 0} onCheckedChange={v => setH(p => ({ ...p, activo: v ? 1 : 0 }))} /> Activo</label>}
                </div>
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={() => void executar(() => ServicoTempoRH.guardarHorario(h, actor), 'Horário guardado').then(ok => { if (ok) { onSaved(); onClose(); } })}>Guardar</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoFeriado({ feriado, actor, onClose, onSaved }: Base & { feriado: Partial<Feriado> }) {
    const [f, setF] = useState(feriado);
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{f.id ? 'Editar feriado' : 'Novo feriado ou dia da empresa'}</DialogTitle></DialogHeader>
                <div className="grid gap-3">
                    <div><Label className="text-xs font-bold">Nome</Label><Input className="mt-1" value={f.nome || ''} onChange={e => setF(p => ({ ...p, nome: e.target.value }))} /></div>
                    <div><Label className="text-xs font-bold">Data</Label><Input className="mt-1" type="date" value={f.data?.startsWith('2000-') ? `${hojeAno()}${f.data.slice(4)}` : f.data || ''} onChange={e => setF(p => ({ ...p, data: e.target.value }))} /></div>
                    <Select value={f.tipo || 'empresa'} onValueChange={v => setF(p => ({ ...p, tipo: v as Feriado['tipo'] }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="nacional">Feriado nacional</SelectItem><SelectItem value="empresa">Dia da empresa</SelectItem></SelectContent>
                    </Select>
                    <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={Boolean(f.recorrente)} onCheckedChange={v => setF(p => ({ ...p, recorrente: v ? 1 : 0 }))} /> Repete-se todos os anos</label>
                    {f.id && <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={f.activo !== 0} onCheckedChange={v => setF(p => ({ ...p, activo: v ? 1 : 0 }))} /> Activo</label>}
                </div>
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={() => void executar(() => ServicoTempoRH.guardarFeriado({ id: f.id, data: f.data || '', nome: f.nome || '', tipo: f.tipo || 'empresa', recorrente: Boolean(f.recorrente), activo: f.activo !== 0 }, actor), 'Feriado guardado').then(ok => { if (ok) { onSaved(); onClose(); } })}>Guardar</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const hojeAno = () => luandaTodayKey().slice(0, 4);
