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
import { datasDoMes, diaSemana, feriadoNaData, horasSemanais, type Feriado, type Horario, type TipoAusencia, type TipoHorario } from '@/bibliotecas/rh/ponto';
import { cicloDoHorario } from '@/bibliotecas/rh/ponto-escalas';
import { calendarioDoAno, categoriaDe, type DiaCalendario, type FeriadoRegistado, type OpcoesCalendario, type TipoDiaCalendario } from '@/bibliotecas/rh/calendario-laboral';
import { ServicoFeriasRH } from '@/servicos/rh/ServicoFeriasRH';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { NavegacaoRH, dataPt, executar, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import type { ActorRH } from '@/servicos/rh/ServicoRH';
import { useBaseRH } from './FuncionariosRH';
import { LIGACOES_TEMPO } from './LivroPontoRH';

const TODOS = '__todos__';
const ROTULO_TIPO: Record<TipoHorario, string> = { fixo: 'Fixo', rotativo: 'Rotativo / escala', flexivel: 'Flexível', noturno: 'Nocturno' };
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export default function CalendarioRH() {
    const { actor, configurar } = useActorRH();
    const base = useBaseRH();
    const dados = useCarregar(async () => ({
        horarios: await ServicoTempoRH.horarios(), feriados: await ServicoTempoRH.feriados(), ausencias: await ServicoTempoRH.ausencias(), tipos: await ServicoTempoRH.tiposAusencia(),
        registados: await ServicoTempoRH.feriadosRegistados(), opcoes: await ServicoTempoRH.opcoesCalendario(),
    }), { horarios: [] as Horario[], feriados: [] as Feriado[], ausencias: [] as AusenciaRH[], tipos: [] as TipoAusencia[], registados: [] as FeriadoRegistado[], opcoes: {} as OpcoesCalendario });
    const { horarios, feriados, ausencias, tipos, registados, opcoes } = dados.dados;
    const hoje = luandaTodayKey();
    const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
    const [mes, setMes] = useState(Number(hoje.slice(5, 7)));
    const [departamento, setDepartamento] = useState(TODOS);
    const [horario, setHorario] = useState<Partial<Horario> | null>(null);
    const [feriado, setFeriado] = useState<Partial<FeriadoRegistado> | null>(null);
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
                            <span><b>{h.nome}</b>{h.tipo && h.tipo !== 'fixo' && <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-sky-800">{ROTULO_TIPO[h.tipo]}</span>} · {h.entrada}–{h.saida} · intervalo {h.intervalo_min} min · tolerância {h.tolerancia_min} min · {String(h.dias_semana).split(',').map(n => DIAS[Number(n) - 1]).join(', ')} · {horasSemanais(h)} h/semana
                                · {base.dados.funcionarios.filter(f => f.horario_id === h.id || (!f.horario_id && h.id === 'horario-normal')).length} funcionário(s)</span>
                            {configurar && <Button size="icon" variant="ghost" onClick={() => setHorario(h)}><Edit className="h-4 w-4" /></Button>}
                        </div>
                    ))}
                    <p className="text-xs text-slate-500">Os funcionários sem horário escolhido na ficha seguem o «Horário normal».</p>
                </TabsContent>

                <TabsContent value="feriados" className="space-y-2">
                    <FeriadosDoAno registados={registados} opcoes={opcoes} configurar={configurar} actor={actor} onEditar={setFeriado}
                        onNovo={() => setFeriado({ data: hoje, tipo: 'empresa', recorrente: 0, categoria: 'tolerancia' })} onMudou={() => void dados.recarregar()} />
                </TabsContent>
            </Tabs>
            {actor && horario && <DialogoHorario horario={horario} horarios={horarios} actor={actor} onClose={() => setHorario(null)} onSaved={() => void dados.recarregar()} />}
            {actor && feriado && <DialogoFeriado feriado={feriado} actor={actor} onClose={() => setFeriado(null)} onSaved={() => void dados.recarregar()} />}
        </MainLayout>
    );
}

type Base = { actor: ActorRH; onClose: () => void; onSaved: () => void };

function DialogoHorario({ horario, horarios, actor, onClose, onSaved }: Base & { horario: Partial<Horario>; horarios: Horario[] }) {
    const [h, setH] = useState<Partial<Horario>>({ tipo: 'fixo', ...horario });
    const dias = new Set(String(h.dias_semana || '').split(',').filter(Boolean).map(Number));
    const alternar = (n: number) => { const s = new Set(dias); if (s.has(n)) s.delete(n); else s.add(n); setH(p => ({ ...p, dias_semana: [...s].sort().join(',') })); };
    const ciclo = h.tipo === 'rotativo' ? cicloDoHorario({ tipo: 'rotativo', ciclo: h.ciclo || '[]' }) : [];
    const setCiclo = (novo: string[]) => setH(p => ({ ...p, ciclo: JSON.stringify(novo) }));
    // Turnos que podem entrar no ciclo: os outros horários que não são rotativos.
    const turnos = horarios.filter(x => x.activo !== 0 && x.tipo !== 'rotativo' && x.id !== h.id);
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
                <DialogHeader><DialogTitle>{h.id ? 'Editar horário' : 'Novo horário'}</DialogTitle></DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2"><Label className="text-xs font-bold">Nome</Label><Input className="mt-1" value={h.nome || ''} onChange={e => setH(p => ({ ...p, nome: e.target.value }))} /></div>
                    <div className="sm:col-span-2"><Label className="text-xs font-bold">Tipo</Label>
                        <Select value={h.tipo || 'fixo'} onValueChange={v => setH(p => ({ ...p, tipo: v as TipoHorario, ...(v === 'rotativo' && !p.ciclo ? { ciclo: '[]', ciclo_inicio: luandaTodayKey() } : {}), ...(v === 'flexivel' && !p.faixa_inicio ? { faixa_inicio: '10:00', faixa_fim: '15:00', minimo_diario_min: 480 } : {}) }))}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="fixo">Fixo: mesmo horário nos dias escolhidos</SelectItem>
                                <SelectItem value="rotativo">Rotativo / escala: ciclo de N dias (ex.: 2 manhã, 2 noite, 4 folgas)</SelectItem>
                                <SelectItem value="flexivel">Flexível: horas mínimas por dia com faixa obrigatória</SelectItem>
                                <SelectItem value="noturno">Nocturno: sai no dia seguinte (o dia é o da entrada)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div><Label className="text-xs font-bold">{h.tipo === 'flexivel' ? 'Pode entrar a partir de' : 'Entrada'}</Label><Input className="mt-1" type="time" value={h.entrada || ''} onChange={e => setH(p => ({ ...p, entrada: e.target.value }))} /></div>
                    <div><Label className="text-xs font-bold">{h.tipo === 'flexivel' ? 'Pode sair até' : h.tipo === 'noturno' ? 'Saída (dia seguinte)' : 'Saída'}</Label><Input className="mt-1" type="time" value={h.saida || ''} onChange={e => setH(p => ({ ...p, saida: e.target.value }))} /></div>
                    <div><Label className="text-xs font-bold">Intervalo (min)</Label><Input className="mt-1" type="number" value={h.intervalo_min ?? 60} onChange={e => setH(p => ({ ...p, intervalo_min: Number(e.target.value) }))} /></div>
                    <div><Label className="text-xs font-bold">Tolerância de atraso (min)</Label><Input className="mt-1" type="number" value={h.tolerancia_min ?? 10} onChange={e => setH(p => ({ ...p, tolerancia_min: Number(e.target.value) }))} /></div>
                    {h.tipo === 'flexivel' && (<>
                        <div><Label className="text-xs font-bold">Faixa obrigatória: início</Label><Input className="mt-1" type="time" value={h.faixa_inicio || ''} onChange={e => setH(p => ({ ...p, faixa_inicio: e.target.value }))} /></div>
                        <div><Label className="text-xs font-bold">Faixa obrigatória: fim</Label><Input className="mt-1" type="time" value={h.faixa_fim || ''} onChange={e => setH(p => ({ ...p, faixa_fim: e.target.value }))} /></div>
                        <div className="sm:col-span-2"><Label className="text-xs font-bold">Horas mínimas por dia</Label>
                            <Input className="mt-1" type="number" step="0.5" value={(Number(h.minimo_diario_min) || 0) / 60} onChange={e => setH(p => ({ ...p, minimo_diario_min: Math.round(Number(e.target.value) * 60) }))} />
                            <p className="mt-1 text-[11px] text-slate-500">Conta atraso quem chega depois do início da faixa e saída antecipada quem sai antes do fim; horas extra são as que passam do mínimo.</p>
                        </div>
                    </>)}
                    {h.tipo === 'rotativo' ? (
                        <div className="space-y-2 sm:col-span-2">
                            <div className="flex flex-wrap items-end gap-2">
                                <div><Label className="text-xs font-bold">Dia 1 do ciclo</Label><Input className="mt-1 w-40" type="date" value={h.ciclo_inicio || ''} onChange={e => setH(p => ({ ...p, ciclo_inicio: e.target.value }))} /></div>
                                <Button type="button" size="sm" variant="outline" onClick={() => setCiclo([...ciclo, turnos[0]?.id || ''])}><Plus className="mr-1 h-3.5 w-3.5" /> Dia de trabalho</Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => setCiclo([...ciclo, ''])}><Plus className="mr-1 h-3.5 w-3.5" /> Folga</Button>
                            </div>
                            {ciclo.length === 0 && <p className="text-xs text-slate-500">Acrescente os dias do ciclo pela ordem. Os turnos são os outros horários: crie primeiro, por exemplo, «Manhã 06–14» e «Noite 22–06».</p>}
                            <div className="grid gap-1.5 sm:grid-cols-2">
                                {ciclo.map((id, i) => (
                                    <div key={i} className="flex items-center gap-1.5">
                                        <span className="w-12 text-xs font-black text-slate-500">Dia {i + 1}</span>
                                        <Select value={id || '__folga__'} onValueChange={v => setCiclo(ciclo.map((x, j) => (j === i ? (v === '__folga__' ? '' : v) : x)))}>
                                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__folga__">Folga</SelectItem>
                                                {turnos.map(x => <SelectItem key={x.id} value={x.id}>{x.nome} ({x.entrada}–{x.saida})</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Retirar dia" onClick={() => setCiclo(ciclo.filter((_, j) => j !== i))}>×</Button>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[11px] text-slate-500">O ciclo repete-se a partir do dia 1. No ecrã «Escalas» pode trocar os turnos de dias concretos.</p>
                        </div>
                    ) : (
                        <div className="sm:col-span-2"><Label className="text-xs font-bold">Dias de trabalho</Label>
                            <div className="mt-1 flex flex-wrap gap-1">{DIAS.map((d, i) => (
                                <button key={d} type="button" onClick={() => alternar(i + 1)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${dias.has(i + 1) ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>{d}</button>
                            ))}</div>
                        </div>
                    )}
                    {h.id && <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={h.activo !== 0} onCheckedChange={v => setH(p => ({ ...p, activo: v ? 1 : 0 }))} /> Activo</label>}
                </div>
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={() => void executar(() => ServicoTempoRH.guardarHorario(h, actor), 'Horário guardado').then(ok => { if (ok) { onSaved(); onClose(); } })}>Guardar</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const ROTULO_CATEGORIA: Record<TipoDiaCalendario, string> = {
    nacional: 'Feriado nacional', ponte: 'Ponte', tolerancia: 'Tolerância de ponto', local: 'Feriado municipal / local', empresa: 'Dia da empresa', data_internacional: 'Data internacional (não é folga)',
};
const COR_CATEGORIA: Record<TipoDiaCalendario, string> = {
    nacional: 'bg-red-500', ponte: 'bg-amber-500', tolerancia: 'bg-violet-500', local: 'bg-teal-500', empresa: 'bg-slate-500', data_internacional: 'bg-indigo-500',
};

/** Feriados do ano: os gerados pela lei (com as pontes, que o RH activa ou desactiva) e os acrescentados. */
function FeriadosDoAno({ registados, opcoes, configurar, actor, onEditar, onNovo, onMudou }: {
    registados: FeriadoRegistado[]; opcoes: OpcoesCalendario; configurar: boolean; actor: ActorRH | null;
    onEditar: (f: Partial<FeriadoRegistado>) => void; onNovo: () => void; onMudou: () => void;
}) {
    const [ano, setAno] = useState(Number(hojeAno()));
    const dias = [...calendarioDoAno(ano, registados, opcoes).values()];
    const pontes = dias.filter(d => d.tipo === 'ponte');
    const alternar = (d: DiaCalendario, activo: boolean) => actor && void executar(async () => {
        await ServicoTempoRH.alternarDiaGerado(d, activo, actor);
        // Sem «gerir RH» o recálculo não corre aqui (fica para quem gere as férias).
        await ServicoFeriasRH.recalcularPlanos(actor).catch(() => 0);
    }, activo ? 'Dia activado' : 'Dia desactivado').then(ok => ok && onMudou());
    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" aria-label="Ano anterior" onClick={() => setAno(a => a - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="min-w-[64px] text-center text-lg font-black">{ano}</span>
                    <Button size="icon" variant="outline" aria-label="Ano seguinte" onClick={() => setAno(a => a + 1)}><ChevronRight className="h-4 w-4" /></Button>
                    <span className="text-xs text-slate-500">{dias.filter(d => d.folga && d.activo && d.tipo !== 'ponte').length} feriados · {pontes.filter(d => d.activo).length} de {pontes.length} pontes activas</span>
                </div>
                {configurar && <Button size="sm" onClick={onNovo}><Plus className="mr-1.5 h-4 w-4" /> Tolerância, feriado local ou data</Button>}
            </div>
            <p className="text-xs text-slate-500">
                Os feriados nacionais (Lei n.º 11/18), o Carnaval e a Sexta-Feira Santa são gerados todos os anos. As pontes (feriado à terça → segunda; à quinta → sexta)
                {opcoes.pontesDesde ? ` geram-se a partir de ${opcoes.pontesDesde}` : ' geram-se automaticamente'} e confirmam-se com o decreto do Governo: desactive as que não forem concedidas.
                Nos dias sem trabalho não se contam faltas nem dias de férias; mudar um dia recalcula os planos de férias ainda não aprovados.
            </p>
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                {dias.map(d => (
                    <div key={d.data} className={`flex items-center gap-3 border-b border-slate-100 px-4 py-2 text-sm last:border-0 dark:border-slate-800 ${d.activo ? '' : 'opacity-50'}`}>
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${COR_CATEGORIA[d.tipo]}`} aria-hidden="true" />
                        <span className="w-36 shrink-0 font-bold tabular-nums">{dataPt(d.data)} · {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][new Date(`${d.data}T12:00:00Z`).getUTCDay()]}</span>
                        <span className="min-w-0 flex-1">{d.nome}{d.internacional ? ' (internacional)' : ''}{d.local ? ` · ${d.local}` : ''}
                            <span className="ml-2 text-xs text-slate-500">{ROTULO_CATEGORIA[d.tipo]}{d.origem === 'gerado' ? ' · gerado' : ''}</span></span>
                        {configurar && actor && d.origem === 'gerado' && (d.tipo === 'ponte' || d.tipo === 'nacional') && (
                            <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={d.activo} onCheckedChange={v => alternar(d, v)} aria-label={`${d.activo ? 'Desactivar' : 'Activar'} ${d.nome}`} /> {d.activo ? 'Activo' : 'Desactivado'}</label>
                        )}
                        {configurar && d.origem === 'manual' && d.registoId && (
                            <Button size="icon" variant="ghost" aria-label={`Editar ${d.nome}`} onClick={() => onEditar(registados.find(r => r.id === d.registoId) || {})}><Edit className="h-4 w-4" /></Button>
                        )}
                    </div>
                ))}
            </div>
            {registados.some(r => r.activo === 0 && categoriaDe(r) !== 'ponte' && !r.id.startsWith('excepcao-')) && (
                <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-500">Desactivados</p>
                    {registados.filter(r => r.activo === 0 && categoriaDe(r) !== 'ponte' && !r.id.startsWith('excepcao-')).map(r => (
                        <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-1.5 text-sm opacity-60 dark:border-slate-800">
                            <span>{r.recorrente ? r.data.slice(5).split('-').reverse().join('/') : dataPt(r.data)} · {r.nome}</span>
                            {configurar && <Button size="icon" variant="ghost" aria-label={`Editar ${r.nome}`} onClick={() => onEditar(r)}><Edit className="h-4 w-4" /></Button>}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}

function DialogoFeriado({ feriado, actor, onClose, onSaved }: Base & { feriado: Partial<FeriadoRegistado> }) {
    const [f, setF] = useState<Partial<FeriadoRegistado>>({ ...feriado, categoria: feriado.categoria || (feriado.tipo === 'nacional' ? 'nacional' : 'empresa') });
    const categoria = (f.categoria || 'empresa') as TipoDiaCalendario;
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{f.id ? 'Editar dia do calendário' : 'Novo dia do calendário'}</DialogTitle></DialogHeader>
                <div className="grid gap-3">
                    <div><Label className="text-xs font-bold">Tipo</Label>
                        <Select value={categoria} onValueChange={v => setF(p => ({ ...p, categoria: v }))}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>{(['tolerancia', 'local', 'empresa', 'ponte', 'nacional', 'data_internacional'] as const).map(c => <SelectItem key={c} value={c}>{ROTULO_CATEGORIA[c]}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div><Label className="text-xs font-bold">Nome</Label><Input className="mt-1" value={f.nome || ''} placeholder={categoria === 'tolerancia' ? 'Ex.: Tolerância de ponto (decreto presidencial)' : categoria === 'local' ? 'Ex.: Dia do município' : ''} onChange={e => setF(p => ({ ...p, nome: e.target.value }))} /></div>
                    <div><Label className="text-xs font-bold">Data</Label><Input className="mt-1" type="date" value={f.data?.startsWith('2000-') ? `${hojeAno()}${f.data.slice(4)}` : f.data || ''} onChange={e => setF(p => ({ ...p, data: e.target.value }))} /></div>
                    {categoria === 'local' && <div><Label className="text-xs font-bold">Local de trabalho / município</Label><Input className="mt-1" value={f.local || ''} onChange={e => setF(p => ({ ...p, local: e.target.value }))} /></div>}
                    {categoria === 'data_internacional' && <p className="text-xs text-slate-500">Aparece a azul no calendário só para informação: conta como dia normal de trabalho.</p>}
                    <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={Boolean(f.recorrente)} onCheckedChange={v => setF(p => ({ ...p, recorrente: v ? 1 : 0 }))} /> Repete-se todos os anos</label>
                    {f.id && <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={f.activo !== 0} onCheckedChange={v => setF(p => ({ ...p, activo: v ? 1 : 0 }))} /> Activo</label>}
                </div>
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={() => void executar(async () => {
                        await ServicoTempoRH.guardarFeriado({ id: f.id, data: f.data || '', nome: f.nome || '', tipo: f.tipo || 'empresa', recorrente: Boolean(f.recorrente), activo: f.activo !== 0, categoria, local: f.local ?? null }, actor);
                        // Sem «gerir RH» o recálculo não corre aqui (fica para quem gere as férias).
                        await ServicoFeriasRH.recalcularPlanos(actor).catch(() => 0);
                    }, 'Dia do calendário guardado').then(ok => { if (ok) { onSaved(); onClose(); } })}>Guardar</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const hojeAno = () => luandaTodayKey().slice(0, 4);
