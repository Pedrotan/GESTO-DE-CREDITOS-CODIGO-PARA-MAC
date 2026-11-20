// Painel lateral do dia (F1.9): marcações com origem e autor, acrescentar, corrigir e anular (motivo obrigatório),
// resumo calculado, observação e histórico de alterações deste dia.
import { useState } from 'react';
import { Loader2, Plus, Undo2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/componentes/ui/sheet';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { cn } from '@/bibliotecas/utils';
import { formatarMinutos, horaDe, type TipoMarcacao } from '@/bibliotecas/rh/ponto-calculo';
import { ServicoPontoRH, type MarcacaoRH } from '@/servicos/rh/ServicoPontoRH';
import type { ActorRH } from '@/servicos/rh/ServicoRH';
import { executar, useCarregar } from '@/componentes/rh/comum-rh';
import { COR_ESTADO, NOME_ESTADO, ORIGEM, TIPO_MARCACAO } from './ponto-ui';

const dataPt = (d: string) => d.split('-').reverse().join('/');
type Edicao = { marcacaoId: string | null; hora: string; tipo: TipoMarcacao; diaSeguinte: boolean; motivo: string };

export function PainelDiaPonto({ funcionarioId, data, actor, editavel, onAlterado, onFechar }: {
    funcionarioId: string; data: string; actor: ActorRH; editavel: boolean; onAlterado: () => void; onFechar: () => void;
}) {
    const detalhe = useCarregar(() => ServicoPontoRH.dia(funcionarioId, data), null as Awaited<ReturnType<typeof ServicoPontoRH.dia>> | null, [funcionarioId, data]);
    const [edicao, setEdicao] = useState<Edicao | null>(null);
    const [anular, setAnular] = useState<{ id: string; motivo: string } | null>(null);
    const [observacao, setObservacao] = useState<string | null>(null);
    const [aGuardar, setAGuardar] = useState(false);
    const d = detalhe.dados;
    const recarregar = async () => { await detalhe.recarregar(); onAlterado(); };
    const correr = async (fn: () => Promise<unknown>, msg: string) => { setAGuardar(true); const ok = await executar(fn, msg); setAGuardar(false); if (ok) { setEdicao(null); setAnular(null); await recarregar(); } };

    // Marcações actuais: as novas, ou o registo da versão anterior apresentado como entrada e saída.
    type LinhaMarcacao = Omit<Partial<MarcacaoRH>, 'origem'> & { id: string; data_hora: string; tipo: TipoMarcacao | null; origem: string };
    const marcacoes: LinhaMarcacao[] = d
        ? d.marcacoes.length ? d.marcacoes : d.legado?.entrada
            ? [{ id: `legado:${funcionarioId}:${data}:e`, data_hora: `${data}T${d.legado.entrada}`, tipo: 'entrada' as const, origem: d.legado.origem === 'importado' ? 'csv' : 'manual', criado_por_nome: 'Versão anterior' },
                ...(d.legado.saida ? [{ id: `legado:${funcionarioId}:${data}:s`, data_hora: `${data}T${d.legado.saida}`, tipo: 'saida' as const, origem: 'manual', criado_por_nome: 'Versão anterior' }] : [])]
            : []
        : [];
    const c = d?.calculo;
    return (
        <Sheet open onOpenChange={v => !v && onFechar()}>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>{d?.funcionario.nome || '…'}</SheetTitle>
                    <SheetDescription>{dataPt(data)}{d ? ` · horário previsto ${d.horario.entrada}–${d.horario.saida}${d.horario.intervalo_min ? ` (pausa ${d.horario.intervalo_min} min)` : ''}` : ''}</SheetDescription>
                </SheetHeader>
                {!d || !c ? <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin" /> : (
                    <div className="mt-4 space-y-5 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={cn('rounded-md px-2 py-1 text-xs font-black', COR_ESTADO[c.estado])}>{NOME_ESTADO[c.estado] || c.estado}</span>
                            {c.feriado && <span className="text-xs text-slate-500">{c.feriado}</span>}
                            {c.aviso && <span className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">⚠ {c.aviso}</span>}
                        </div>

                        <section>
                            <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Marcações</h3>
                            {marcacoes.length === 0 && <p className="text-xs text-slate-500">Sem marcações.</p>}
                            <ul className="space-y-1.5">
                                {marcacoes.map(m => (
                                    <li key={m.id} className={cn('flex items-start justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800', m.anulada && 'opacity-60')}>
                                        <div>
                                            <p className={cn('font-bold tabular-nums', m.anulada && 'line-through')}>
                                                {horaDe(m.data_hora)}{m.data_hora.slice(0, 10) !== data ? ' (dia seguinte)' : ''} · {m.tipo ? TIPO_MARCACAO[m.tipo] : 'Sem tipo'}
                                            </p>
                                            <p className="text-[11px] text-slate-500">{ORIGEM[m.origem] || m.origem}{m.criado_por_nome ? ` · ${m.criado_por_nome}` : ''}{m.pendente_validacao ? ' · marcada sem internet: rever' : ''}</p>
                                            {m.motivo && !m.anulada && <p className="text-[11px] text-slate-500">Motivo: {m.motivo}</p>}
                                            {m.anulada ? <p className="text-[11px] text-red-600">Anulada{m.anulada_por_nome ? ` por ${m.anulada_por_nome}` : ''}: {m.motivo_anulacao}</p> : null}
                                            {m.latitude != null && <p className="text-[11px] text-slate-500">📍 {Number(m.latitude).toFixed(5)}, {Number(m.longitude).toFixed(5)}</p>}
                                            {m.foto_data_url && <img src={m.foto_data_url} alt="Fotografia da marcação" className="mt-1 h-16 w-16 rounded object-cover" />}
                                        </div>
                                        {editavel && !m.anulada && (
                                            <div className="flex shrink-0 gap-1">
                                                <Button size="sm" variant="ghost" onClick={() => setEdicao({ marcacaoId: m.id, hora: horaDe(m.data_hora) || '08:00', tipo: m.tipo || 'entrada', diaSeguinte: m.data_hora.slice(0, 10) !== data, motivo: '' })}>Corrigir</Button>
                                                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setAnular({ id: m.id, motivo: '' })}><Undo2 className="h-3.5 w-3.5" /></Button>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                            {editavel && !edicao && <Button size="sm" variant="outline" className="mt-2" onClick={() => setEdicao({ marcacaoId: null, hora: marcacoes.length ? d.horario.saida : d.horario.entrada, tipo: marcacoes.length ? 'saida' : 'entrada', diaSeguinte: false, motivo: '' })}><Plus className="mr-1 h-4 w-4" /> Adicionar marcação</Button>}
                            {edicao && (
                                <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div><Label className="text-xs font-bold">Hora</Label><Input className="mt-1" type="time" value={edicao.hora} onChange={e => setEdicao({ ...edicao, hora: e.target.value })} /></div>
                                        <div><Label className="text-xs font-bold">Tipo</Label>
                                            <Select value={edicao.tipo} onValueChange={v => setEdicao({ ...edicao, tipo: v as TipoMarcacao })}>
                                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                                <SelectContent>{Object.entries(TIPO_MARCACAO).map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={edicao.diaSeguinte} onChange={e => setEdicao({ ...edicao, diaSeguinte: e.target.checked })} /> No dia seguinte (turno nocturno)</label>
                                    <div><Label className="text-xs font-bold">Motivo (obrigatório)</Label><Textarea className="mt-1" rows={2} value={edicao.motivo} onChange={e => setEdicao({ ...edicao, motivo: e.target.value })} placeholder="Ex.: esqueceu-se de marcar a saída" /></div>
                                    <div className="flex justify-end gap-2">
                                        <Button size="sm" variant="ghost" onClick={() => setEdicao(null)}>Cancelar</Button>
                                        <Button size="sm" disabled={aGuardar || edicao.motivo.trim().length < 5} onClick={() => void correr(() => edicao.marcacaoId
                                            ? ServicoPontoRH.editarMarcacao({ funcionarioId, data, marcacaoId: edicao.marcacaoId, hora: edicao.hora, tipo: edicao.tipo, diaSeguinte: edicao.diaSeguinte, motivo: edicao.motivo }, actor)
                                            : ServicoPontoRH.adicionarMarcacao({ funcionarioId, data, hora: edicao.hora, tipo: edicao.tipo, diaSeguinte: edicao.diaSeguinte, motivo: edicao.motivo }, actor), 'Marcação guardada')}>Guardar</Button>
                                    </div>
                                </div>
                            )}
                            {anular && (
                                <div className="mt-2 space-y-2 rounded-xl bg-red-50 p-3 dark:bg-red-950/30">
                                    <Label className="text-xs font-bold">Motivo da anulação (obrigatório)</Label>
                                    <Textarea rows={2} value={anular.motivo} onChange={e => setAnular({ ...anular, motivo: e.target.value })} />
                                    <p className="text-[11px] text-slate-500">A marcação não é apagada: fica anulada, com o motivo e o seu nome.</p>
                                    <div className="flex justify-end gap-2">
                                        <Button size="sm" variant="ghost" onClick={() => setAnular(null)}>Cancelar</Button>
                                        <Button size="sm" variant="destructive" disabled={aGuardar || anular.motivo.trim().length < 5} onClick={() => void correr(() => ServicoPontoRH.anularMarcacao({ funcionarioId, data, marcacaoId: anular.id, motivo: anular.motivo }, actor), 'Marcação anulada')}>Anular</Button>
                                    </div>
                                </div>
                            )}
                        </section>

                        <section className="grid grid-cols-2 gap-2">
                            {[['Trabalhado', formatarMinutos(c.minutos_trabalhados)], ['Pausa', formatarMinutos(c.minutos_pausa)], ['Atraso', `${c.minutos_atraso} min (tolerância ${d.config.tolerancia_entrada_min})`],
                                ['Saída antecipada', `${c.minutos_saida_antecipada} min`], ['Horas extra', `${formatarMinutos(c.minutos_extra)}${c.tipo_extra && c.tipo_extra !== 'util' ? ` (${c.tipo_extra})` : ''}`], ['Nocturno', formatarMinutos(c.minutos_noturnos)]]
                                .map(([rotulo, valor]) => <div key={rotulo} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60"><p className="text-[10px] font-bold uppercase text-slate-500">{rotulo}</p><p className="font-black tabular-nums">{valor}</p></div>)}
                            {c.incompleto && <p className="col-span-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠ Entrada sem saída: não conta horas extra e impede validar o mês até ser corrigida.</p>}
                            {editavel && d.config.banco_horas_activo && c.minutos_extra > 0 && (
                                <Button size="sm" variant="outline" className="col-span-2" disabled={aGuardar}
                                    onClick={() => void correr(() => ServicoPontoRH.extraParaBanco(funcionarioId, data, actor), 'Horas extra enviadas para o banco de horas (não serão pagas)')}>
                                    Enviar as {formatarMinutos(c.minutos_extra)} de horas extra para o banco de horas
                                </Button>
                            )}
                        </section>

                        <section>
                            <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Observação</h3>
                            <Textarea rows={2} disabled={!editavel} value={observacao ?? d.legado?.observacoes ?? ''} onChange={e => setObservacao(e.target.value)} />
                            {editavel && observacao !== null && <Button size="sm" className="mt-1.5" disabled={aGuardar} onClick={() => void correr(() => ServicoPontoRH.observacao(funcionarioId, data, observacao, actor), 'Observação guardada').then(() => setObservacao(null))}>Guardar observação</Button>}
                        </section>

                        <section>
                            <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Histórico</h3>
                            {d.historico.length === 0 ? <p className="text-xs text-slate-500">Sem alterações registadas.</p> : (
                                <ul className="space-y-1.5">{d.historico.map(h => {
                                    let motivo = '';
                                    try { motivo = JSON.parse(h.metadata || '{}').motivo || ''; } catch { /* metadados antigos */ }
                                    return <li key={h.id} className="rounded-lg border-l-2 border-slate-300 pl-2 text-xs"><p className="font-semibold">{h.details}</p><p className="text-slate-500">{new Date(h.timestamp).toLocaleString('pt-PT')} · {h.userName}{motivo ? ` · ${motivo}` : ''}</p></li>;
                                })}</ul>
                            )}
                        </section>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
