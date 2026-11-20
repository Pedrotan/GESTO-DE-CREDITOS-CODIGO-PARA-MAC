// Livro de ponto (fase 3, 2.ª parte): Escalas com arrastar e largar (F3.10), Banco de horas (F3.11) e Relógios com
// ligação directa (F3.6), mais os cartões QR do quiosque (F3.4).
import { useMemo, useState, type DragEvent } from 'react';
import { ChevronLeft, ChevronRight, Copy, CreditCard, FileSpreadsheet, FileText, KeyRound, Loader2, Plus, QrCode, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Switch } from '@/componentes/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { cn } from '@/bibliotecas/utils';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { formatarMinutos, type ConfigPonto } from '@/bibliotecas/rh/ponto-calculo';
import { horarioNaData, segundaDaSemana, type EscalaDia } from '@/bibliotecas/rh/ponto-escalas';
import { ROTULO_MOVIMENTO, type MovimentoBanco, type SaldoBanco } from '@/bibliotecas/rh/ponto-banco';
import { DIAS_SEMANA, horarioDoFuncionario } from '@/bibliotecas/rh/ponto-grelha';
import { diaSemana, somarDias, type Horario } from '@/bibliotecas/rh/ponto';
import { gerarCartoesQr, relatorioBancoHoras } from '@/bibliotecas/rh/ponto-relatorios';
import { renderReportExcel, renderReportPdf } from '@/bibliotecas/relatorios-pagamentos';
import { ServicoPontoRH } from '@/servicos/rh/ServicoPontoRH';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import { ServicoRelogiosPonto, relogioOnline, type Relogio } from '@/servicos/rh/ServicoRelogiosPonto';
import type { ActorRH, Funcionario } from '@/servicos/rh/ServicoRH';
import { executar, Indicador, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { toast } from '@/ganchos/usar-toast';
import { confirmar } from '@/bibliotecas/alerta';

const dataPt = (d: string) => d.split('-').reverse().join('/');
const sinal = (m: number) => `${m > 0 ? '+' : m < 0 ? '−' : ''}${formatarMinutos(Math.abs(m))}`;
const CORES = ['bg-sky-100 text-sky-900 border-sky-300', 'bg-violet-100 text-violet-900 border-violet-300', 'bg-amber-100 text-amber-900 border-amber-300',
    'bg-emerald-100 text-emerald-900 border-emerald-300', 'bg-rose-100 text-rose-900 border-rose-300', 'bg-indigo-100 text-indigo-900 border-indigo-300', 'bg-teal-100 text-teal-900 border-teal-300'];
const corDoTurno = (id: string, horarios: Horario[]) => CORES[Math.max(0, horarios.findIndex(h => h.id === id)) % CORES.length];
const FOLGA = '__folga__';
const NORMAL = '__normal__';

// ── Escalas ───────────────────────────────────────────────────────────────────
type Funcionarios = Array<Pick<Funcionario, 'id' | 'nome' | 'numero_mecanografico' | 'departamento_id' | 'estado' | 'data_admissao' | 'data_saida'> & { horario_id: string | null }>;

export function EscalasPonto({ actor, gerir, funcionarios, departamentos }: { actor: ActorRH | null; gerir: boolean; funcionarios: Funcionarios; departamentos: Array<{ id: string; nome: string }> }) {
    const [segunda, setSegunda] = useState(() => segundaDaSemana(luandaTodayKey()));
    const [departamento, setDepartamento] = useState('__todos');
    const [pincel, setPincel] = useState<string | null>(null);
    const datas = Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
    const dados = useCarregar(async () => {
        const [horarios, escalas] = await Promise.all([ServicoTempoRH.horarios(), ServicoPontoRH.escalas(datas[0], datas[6])]);
        return { horarios, escalas };
    }, { horarios: [] as Horario[], escalas: [] as Array<EscalaDia & { id: string }> }, [segunda]);
    const { horarios, escalas } = dados.dados;
    const turnos = horarios.filter(h => h.activo !== 0 && h.tipo !== 'rotativo');
    const lista = funcionarios.filter(f => f.estado === 'activo' && f.data_admissao <= datas[6] && (!f.data_saida || f.data_saida >= datas[0]) && (departamento === '__todos' || f.departamento_id === departamento));

    const aplicar = async (celulas: Array<{ funcionarioId: string; data: string }>, valor: string) => {
        if (!actor || !gerir || !celulas.length) return;
        const ok = await executar(() => ServicoPontoRH.guardarEscala(celulas.map(c => ({ ...c, horarioId: valor === FOLGA || valor === NORMAL ? null : valor, remover: valor === NORMAL })), actor),
            valor === NORMAL ? 'Volta ao horário normal' : 'Escala actualizada');
        if (ok) await dados.recarregar();
    };
    const largar = (e: DragEvent, funcionarioId: string, data: string) => {
        e.preventDefault();
        const valor = e.dataTransfer.getData('text/x-turno');
        if (valor) void aplicar([{ funcionarioId, data }], valor);
    };
    const copiarAnterior = async () => {
        if (!actor) return;
        if (await executar(() => ServicoPontoRH.copiarSemana(somarDias(segunda, -7), segunda, lista.map(f => f.id), actor), 'Semana anterior copiada')) await dados.recarregar();
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Button size="icon" variant="outline" onClick={() => setSegunda(somarDias(segunda, -7))} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="min-w-[190px] text-center font-black">Semana de {dataPt(datas[0])} a {dataPt(datas[6])}</span>
                <Button size="icon" variant="outline" onClick={() => setSegunda(somarDias(segunda, 7))} aria-label="Semana seguinte"><ChevronRight className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setSegunda(segundaDaSemana(luandaTodayKey()))}>Esta semana</Button>
                <Select value={departamento} onValueChange={setDepartamento}>
                    <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="__todos">Todos os departamentos</SelectItem>{departamentos.map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}</SelectContent>
                </Select>
                {gerir && <Button size="sm" variant="outline" onClick={() => void copiarAnterior()}><Copy className="mr-1.5 h-4 w-4" /> Copiar a semana anterior</Button>}
            </div>
            {gerir && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-dashed border-slate-300 p-2 text-xs dark:border-slate-700">
                    <span className="mr-1 font-bold text-slate-500">Arraste para um dia (ou escolha e clique nos dias):</span>
                    {[...turnos.map(h => ({ id: h.id, nome: `${h.nome} ${h.entrada}–${h.saida}`, cor: corDoTurno(h.id, horarios) })),
                        { id: FOLGA, nome: 'Folga', cor: 'bg-slate-200 text-slate-700 border-slate-300' }, { id: NORMAL, nome: 'Horário normal', cor: 'bg-white text-slate-600 border-slate-300' }].map(t => (
                        <button key={t.id} type="button" draggable onDragStart={e => e.dataTransfer.setData('text/x-turno', t.id)} onClick={() => setPincel(pincel === t.id ? null : t.id)}
                            className={cn('cursor-grab rounded-lg border px-2 py-1 font-bold active:cursor-grabbing', t.cor, pincel === t.id && 'ring-2 ring-slate-900 dark:ring-white')}>{t.nome}</button>
                    ))}
                    {pincel && <span className="ml-1 text-slate-500">Clique nos dias para aplicar · <button type="button" className="underline" onClick={() => setPincel(null)}>parar</button></span>}
                </div>
            )}
            {lista.length === 0 ? <Vazio>Sem funcionários activos nesta semana.</Vazio> : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <table className="w-full min-w-[760px] text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-950">
                            <tr><th className="sticky left-0 bg-slate-50 px-3 py-2 text-left dark:bg-slate-950">Funcionário</th>
                                {datas.map(d => <th key={d} className={cn('px-1 py-2 text-center', d === luandaTodayKey() && 'text-sky-600')}>{DIAS_SEMANA[diaSemana(d)]}<span className="block font-normal text-slate-500">{d.slice(8)}/{d.slice(5, 7)}</span></th>)}</tr>
                        </thead>
                        <tbody>
                            {lista.map(f => {
                                const base = horarioDoFuncionario(f, horarios);
                                return (
                                    <tr key={f.id} className="border-t border-slate-100 dark:border-slate-800">
                                        <td className="sticky left-0 bg-white px-3 py-1.5 dark:bg-slate-900"><b className="block truncate">{f.nome}</b><span className="text-[10px] text-slate-500">{base.nome}</span></td>
                                        {datas.map(d => {
                                            const lancada = escalas.find(e => e.funcionario_id === f.id && e.data === d);
                                            const r = horarioNaData(base, d, horarios, lancada);
                                            const trabalha = !r.folga && String(r.horario.dias_semana).split(',').map(Number).includes(diaSemana(d));
                                            const turno = lancada?.horario_id || (r.origem === 'ciclo' && trabalha ? r.horario.id : null);
                                            return (
                                                <td key={d} className="p-1" onDragOver={e => gerir && e.preventDefault()} onDrop={e => largar(e, f.id, d)}
                                                    onClick={() => pincel && void aplicar([{ funcionarioId: f.id, data: d }], pincel)}>
                                                    <div draggable={gerir && Boolean(lancada)} onDragStart={e => e.dataTransfer.setData('text/x-turno', lancada?.horario_id || FOLGA)}
                                                        title={lancada ? `Lançado por ${(lancada as { criado_por_nome?: string }).criado_por_nome || '—'}` : r.origem === 'ciclo' ? 'Pelo ciclo do horário rotativo' : 'Horário normal'}
                                                        className={cn('flex h-11 flex-col items-center justify-center rounded-lg border text-center leading-tight',
                                                            trabalha ? (turno ? corDoTurno(turno, horarios) : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200') : 'border-dashed border-slate-200 text-slate-400 dark:border-slate-700',
                                                            !lancada && 'opacity-70', (pincel || gerir) && 'cursor-pointer')}>
                                                        {trabalha ? <><b className="max-w-full truncate px-1">{r.horario.nome}</b><span className="text-[10px]">{r.horario.entrada}–{r.horario.saida}</span></> : <span>Folga</span>}
                                                        {lancada && <span className="sr-only">(escala)</span>}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="text-xs text-slate-500">Os dias com contorno cheio foram lançados na escala; os esbatidos seguem o horário do funcionário (fixo ou ciclo rotativo). Arrastar um dia lançado para outro copia o turno. Mês fechado: as escalas desse mês ficam só de leitura.</p>
        </div>
    );
}

// ── Banco de horas ────────────────────────────────────────────────────────────
export function BancoHorasPonto({ actor, gerir, config, funcionarios, settings, onAlterado }: {
    actor: ActorRH | null; gerir: boolean; config: ConfigPonto | null; funcionarios: Array<Pick<Funcionario, 'id' | 'nome' | 'estado'> & { banco_horas?: number | null }>;
    settings: unknown; onAlterado: () => void;
}) {
    const hoje = luandaTodayKey();
    const dados = useCarregar(async () => {
        const [movimentos, saldos] = await Promise.all([ServicoPontoRH.movimentosBanco(), ServicoPontoRH.saldosBanco(hoje, config || undefined)]);
        return { movimentos, saldos };
    }, { movimentos: [] as MovimentoBanco[], saldos: new Map<string, SaldoBanco>() }, [config]);
    const [detalhe, setDetalhe] = useState<string | null>(null);
    const [ajuste, setAjuste] = useState<{ funcionarioId: string; data: string; horas: string; motivo: string } | null>(null);
    const [folga, setFolga] = useState<{ funcionarioId: string; data: string; motivo: string } | null>(null);
    const [anular, setAnular] = useState<{ id: string; motivo: string } | null>(null);
    const activos = funcionarios.filter(f => f.estado === 'activo');
    const nomes = new Map(funcionarios.map(f => [f.id, f.nome]));
    const total = [...dados.dados.saldos.values()].reduce((s, x) => s + x.saldo, 0);
    const aExpirar = [...dados.dados.saldos.values()].reduce((s, x) => s + x.a_expirar_30d, 0);
    const recarregar = async () => { await dados.recarregar(); onAlterado(); };
    const relatorio = () => relatorioBancoHoras(funcionarios, dados.dados.saldos, dados.dados.movimentos, `${hoje.slice(0, 4)}-01-01`, hoje);

    if (config && !config.banco_horas_activo) return <Vazio>O banco de horas está desligado. Active-o em Configuração do livro de ponto (as horas extra podem ser compensadas em folgas em vez de pagas).</Vazio>;
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Indicador titulo="Saldo total" valor={sinal(total)} tom="sky" />
                <Indicador titulo="A expirar em 30 dias" valor={formatarMinutos(aExpirar)} tom="orange" />
                <Indicador titulo="Funcionários no banco" valor={activos.filter(f => f.banco_horas).length} />
                <Indicador titulo="Validade" valor={config?.banco_validade_meses ? `${config.banco_validade_meses} meses` : 'Sem prazo'} />
            </div>
            <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void renderReportPdf(relatorio(), settings, actor?.name || '', 'save')}><FileText className="mr-1.5 h-4 w-4" /> PDF</Button>
                <Button size="sm" variant="outline" onClick={() => renderReportExcel(relatorio(), settings, actor?.name || '', 'save')}><FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel</Button>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500 dark:bg-slate-950">
                        <tr><th className="px-3 py-2">Funcionário</th><th>Extra vai para o banco</th><th className="text-right">Créditos</th><th className="text-right">Débitos</th><th className="text-right">A expirar</th><th className="text-right">Saldo</th><th /></tr>
                    </thead>
                    <tbody>
                        {activos.map(f => {
                            const s = dados.dados.saldos.get(f.id);
                            return (
                                <tr key={f.id} className="border-t border-slate-100 dark:border-slate-800">
                                    <td className="px-3 py-1.5"><button type="button" className="font-semibold hover:underline" onClick={() => setDetalhe(f.id)}>{f.nome}</button></td>
                                    <td><Switch checked={Boolean(f.banco_horas)} disabled={!gerir} onCheckedChange={v => actor && void executar(() => ServicoPontoRH.definirBancoFuncionario(f.id, v, actor), v ? 'As horas extra deste funcionário passam para o banco' : 'As horas extra voltam a ser pagas').then(ok => ok && void recarregar())} /></td>
                                    <td className="text-right tabular-nums">{s ? formatarMinutos(s.creditos) : '—'}</td>
                                    <td className="text-right tabular-nums">{s ? formatarMinutos(s.debitos) : '—'}</td>
                                    <td className="text-right tabular-nums text-orange-600">{s?.a_expirar_30d ? formatarMinutos(s.a_expirar_30d) : ''}</td>
                                    <td className={cn('text-right font-black tabular-nums', (s?.saldo || 0) < 0 && 'text-red-600')}>{s ? sinal(s.saldo) : '0:00'}</td>
                                    <td className="whitespace-nowrap px-2 text-right">
                                        {gerir && <Button size="sm" variant="ghost" onClick={() => setFolga({ funcionarioId: f.id, data: hoje, motivo: '' })}>Folga</Button>}
                                        {gerir && <Button size="sm" variant="ghost" onClick={() => setAjuste({ funcionarioId: f.id, data: hoje, horas: '', motivo: '' })}>Ajuste</Button>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-slate-500">Com a opção ligada, no fecho do mês as horas extra do funcionário entram no banco (não são pagas) e as saídas antecipadas descontam. Também pode enviar as horas extra de um só dia no painel do dia. As horas mais antigas são usadas primeiro e expiram ao fim da validade.</p>

            {detalhe && (
                <Dialog open onOpenChange={v => !v && setDetalhe(null)}>
                    <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                        <DialogHeader><DialogTitle>Banco de horas: {nomes.get(detalhe)}</DialogTitle></DialogHeader>
                        <table className="w-full text-sm">
                            <thead className="text-left text-[11px] uppercase text-slate-500"><tr><th>Dia</th><th>Tipo</th><th className="text-right">Minutos</th><th>Descrição</th><th /></tr></thead>
                            <tbody>{dados.dados.movimentos.filter(m => m.funcionario_id === detalhe).map(m => (
                                <tr key={m.id} className={cn('border-t border-slate-100 dark:border-slate-800', m.anulado && 'text-slate-400 line-through')}>
                                    <td className="py-1">{dataPt(m.data)}</td><td>{ROTULO_MOVIMENTO[m.tipo]}</td><td className="text-right tabular-nums">{sinal(m.minutos)}</td>
                                    <td className="text-xs">{m.descricao}{m.criado_por_nome ? ` · ${m.criado_por_nome}` : ''}</td>
                                    <td>{gerir && !m.anulado && <Button size="icon" variant="ghost" aria-label="Anular movimento" onClick={() => setAnular({ id: m.id, motivo: '' })}><Trash2 className="h-3.5 w-3.5" /></Button>}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </DialogContent>
                </Dialog>
            )}
            {ajuste && actor && (
                <Dialog open onOpenChange={v => !v && setAjuste(null)}>
                    <DialogContent className="max-w-md">
                        <DialogHeader><DialogTitle>Ajuste do banco: {nomes.get(ajuste.funcionarioId)}</DialogTitle><DialogDescription>Horas positivas acrescentam ao saldo; negativas descontam (ex.: -2,5).</DialogDescription></DialogHeader>
                        <div className="grid gap-2">
                            <div><Label className="text-xs font-bold">Data</Label><Input type="date" value={ajuste.data} onChange={e => setAjuste({ ...ajuste, data: e.target.value })} /></div>
                            <div><Label className="text-xs font-bold">Horas</Label><Input inputMode="decimal" value={ajuste.horas} onChange={e => setAjuste({ ...ajuste, horas: e.target.value })} placeholder="ex.: 4 ou -1,5" /></div>
                            <div><Label className="text-xs font-bold">Motivo</Label><Input value={ajuste.motivo} onChange={e => setAjuste({ ...ajuste, motivo: e.target.value })} /></div>
                        </div>
                        <DialogFooter><Button variant="outline" onClick={() => setAjuste(null)}>Cancelar</Button>
                            <Button onClick={() => void executar(() => ServicoPontoRH.ajusteBanco(ajuste.funcionarioId, ajuste.data, Math.round(Number(ajuste.horas.replace(',', '.')) * 60), ajuste.motivo, actor), 'Ajuste registado').then(ok => { if (ok) { setAjuste(null); void recarregar(); } })}>Registar</Button></DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
            {folga && actor && (
                <Dialog open onOpenChange={v => !v && setFolga(null)}>
                    <DialogContent className="max-w-md">
                        <DialogHeader><DialogTitle>Folga compensatória: {nomes.get(folga.funcionarioId)}</DialogTitle><DialogDescription>Lança uma dispensa nesse dia e desconta do banco as horas previstas do dia.</DialogDescription></DialogHeader>
                        <div className="grid gap-2">
                            <div><Label className="text-xs font-bold">Dia da folga</Label><Input type="date" value={folga.data} onChange={e => setFolga({ ...folga, data: e.target.value })} /></div>
                            <div><Label className="text-xs font-bold">Motivo</Label><Input value={folga.motivo} onChange={e => setFolga({ ...folga, motivo: e.target.value })} placeholder="ex.: compensação das horas de Novembro" /></div>
                        </div>
                        <DialogFooter><Button variant="outline" onClick={() => setFolga(null)}>Cancelar</Button>
                            <Button onClick={() => void executar(() => ServicoPontoRH.folgaCompensatoria(folga.funcionarioId, folga.data, folga.motivo, actor), 'Folga compensatória lançada').then(ok => { if (ok) { setFolga(null); void recarregar(); } })}>Lançar folga</Button></DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
            {anular && actor && (
                <Dialog open onOpenChange={v => !v && setAnular(null)}>
                    <DialogContent className="max-w-md">
                        <DialogHeader><DialogTitle>Anular movimento do banco</DialogTitle></DialogHeader>
                        <Input value={anular.motivo} onChange={e => setAnular({ ...anular, motivo: e.target.value })} placeholder="Motivo (fica na auditoria)" />
                        <DialogFooter><Button variant="outline" onClick={() => setAnular(null)}>Cancelar</Button>
                            <Button variant="destructive" onClick={() => void executar(() => ServicoPontoRH.anularMovimentoBanco(anular.id, anular.motivo, actor), 'Movimento anulado').then(ok => { if (ok) { setAnular(null); void recarregar(); } })}>Anular</Button></DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

// ── Relógios ──────────────────────────────────────────────────────────────────
export function RelogiosPonto({ actor, onRecebido }: { actor: ActorRH; onRecebido: () => void }) {
    const ligado = ServicoRelogiosPonto.ligado();
    const lista = useCarregar(() => (ligado ? ServicoRelogiosPonto.relogios() : Promise.resolve([] as Relogio[])), [] as Relogio[], []);
    const [novo, setNovo] = useState<{ nome: string; localizacao: string; serial: string } | null>(null);
    const [chave, setChave] = useState<{ nome: string; deviceId: string; chave: string; serial: string | null } | null>(null);
    const [aRecolher, setARecolher] = useState(false);
    const enderecos = ServicoRelogiosPonto.enderecos();
    if (!ligado) return <Vazio>Os relógios com ligação directa precisam da empresa ligada à nuvem (Definições › Sincronização). Sem isso, use «Importar» com o ficheiro do relógio.</Vazio>;

    const recolher = async () => {
        setARecolher(true);
        try {
            const r = await ServicoRelogiosPonto.recolher(actor);
            if (r) {
                toast({ title: r.recebidas ? `${r.importadas} marcação(ões) recebida(s) dos relógios` : 'Sem marcações novas',
                    description: [r.desconhecidas.length ? `N.º sem funcionário: ${r.desconhecidas.join(', ')} (confira o n.º mecanográfico no relógio).` : '', r.bloqueadas ? `${r.bloqueadas} de meses fechados ficam à espera.` : ''].filter(Boolean).join(' ') || undefined });
                if (r.importadas) onRecebido();
            }
            await lista.recarregar();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Não foi possível recolher', description: (error as Error).message });
        } finally {
            setARecolher(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setNovo({ nome: '', localizacao: '', serial: '' })}><Plus className="mr-1.5 h-4 w-4" /> Registar relógio</Button>
                <Button size="sm" variant="outline" disabled={aRecolher} onClick={() => void recolher()}>{aRecolher ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />} Recolher marcações agora</Button>
            </div>
            {lista.dados.length === 0 ? <Vazio>Nenhum relógio registado.</Vazio> : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500 dark:bg-slate-950"><tr><th className="px-3 py-2">Relógio</th><th>Localização</th><th>N.º de série</th><th>Último contacto</th><th>Estado</th><th className="text-right">Por recolher</th><th /></tr></thead>
                        <tbody>{lista.dados.map(r => {
                            const online = relogioOnline(r);
                            return (
                                <tr key={r.device_id} className="border-t border-slate-100 dark:border-slate-800">
                                    <td className="px-3 py-1.5 font-semibold">{r.nome}<span className="block text-[10px] font-normal text-slate-500">{r.device_id}</span></td>
                                    <td className="text-xs">{r.localizacao || '—'}</td><td className="font-mono text-xs">{r.serial || '—'}</td>
                                    <td className="text-xs">{r.ultimo_contacto ? new Date(r.ultimo_contacto).toLocaleString('pt-PT') : 'Nunca'}</td>
                                    <td><span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold', online ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')}>{online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{online ? 'Online' : 'Offline'}</span></td>
                                    <td className="text-right tabular-nums">{r.pendentes}</td>
                                    <td className="whitespace-nowrap px-2 text-right">
                                        <Button size="icon" variant="ghost" title="Nova chave" aria-label="Nova chave" onClick={() => void executar(async () => { const c = await ServicoRelogiosPonto.novaChave(r.device_id, actor); setChave({ nome: r.nome, deviceId: r.device_id, chave: c, serial: r.serial }); }, 'Nova chave criada (a anterior deixou de funcionar)')}><KeyRound className="h-4 w-4" /></Button>
                                        <Button size="icon" variant="ghost" className="text-red-600" title="Remover" aria-label="Remover relógio" onClick={async () => { if (await confirmar(`Remover o relógio «${r.nome}»? As marcações por recolher deste relógio perdem-se.`)) void executar(() => ServicoRelogiosPonto.remover(r.device_id, actor), 'Relógio removido').then(() => lista.recarregar()); }}><Trash2 className="h-4 w-4" /></Button>
                                    </td>
                                </tr>
                            );
                        })}</tbody>
                    </table>
                </div>
            )}
            {enderecos && (
                <div className="rounded-2xl border border-slate-200 p-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
                    <p className="mb-1 font-black text-slate-800 dark:text-slate-100">Como ligar o relógio</p>
                    <p><b>ZKTeco e compatíveis (ADMS / «Cloud Server»):</b> no relógio, em Comunicação › Definições da nuvem, servidor <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{enderecos.host}</code>, porta 80, sem proxy. Registe aqui o relógio com o seu n.º de série (Sistema › Informação do dispositivo).</p>
                    <p className="mt-1"><b>Outros relógios ou serviço na rede da empresa:</b> <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">POST {enderecos.https}/api/ponto/relogio/&lt;id do relógio&gt;/marcacoes</code> com o cabeçalho <code>x-device-key</code> e o corpo <code>{'{"marcacoes":[{"funcionario":"123","data_hora":"2026-11-18 08:03","tipo":"entrada"}]}'}</code>.</p>
                    <p className="mt-1">O n.º do funcionário no relógio tem de ser o n.º mecanográfico da ficha. As marcações entram no livro de ponto a cada 2 minutos com o livro aberto (e na tarefa de alertas); um relógio sem contacto há mais de 1 hora gera um alerta.</p>
                </div>
            )}
            {novo && (
                <Dialog open onOpenChange={v => !v && setNovo(null)}>
                    <DialogContent className="max-w-md">
                        <DialogHeader><DialogTitle>Registar relógio</DialogTitle></DialogHeader>
                        <div className="grid gap-2">
                            <div><Label className="text-xs font-bold">Nome</Label><Input value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} placeholder="ex.: Entrada principal" /></div>
                            <div><Label className="text-xs font-bold">Localização</Label><Input value={novo.localizacao} onChange={e => setNovo({ ...novo, localizacao: e.target.value })} placeholder="ex.: Loja da Maianga" /></div>
                            <div><Label className="text-xs font-bold">N.º de série (relógios ZKTeco / ADMS)</Label><Input value={novo.serial} onChange={e => setNovo({ ...novo, serial: e.target.value.toUpperCase() })} placeholder="opcional" /></div>
                        </div>
                        <DialogFooter><Button variant="outline" onClick={() => setNovo(null)}>Cancelar</Button>
                            <Button disabled={!novo.nome.trim()} onClick={() => void executar(async () => {
                                const r = await ServicoRelogiosPonto.registar(novo, actor);
                                setChave({ nome: novo.nome, deviceId: r.deviceId, chave: r.chave, serial: novo.serial || null });
                                setNovo(null); await lista.recarregar();
                            }, 'Relógio registado')}>Registar</Button></DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
            {chave && (
                <Dialog open onOpenChange={v => !v && setChave(null)}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader><DialogTitle>Dados de ligação: {chave.nome}</DialogTitle><DialogDescription>A chave só aparece agora. Guarde-a no relógio ou no serviço intermédio; se a perder, crie uma nova.</DialogDescription></DialogHeader>
                        <div className="space-y-2 text-sm">
                            <p>Id do relógio: <code className="select-all rounded bg-slate-100 px-1 dark:bg-slate-800">{chave.deviceId}</code></p>
                            <p>Chave (x-device-key): <code className="select-all break-all rounded bg-slate-100 px-1 dark:bg-slate-800">{chave.chave}</code></p>
                            {chave.serial && <p>Relógio ZKTeco: servidor <code>{enderecos?.host}</code>, porta 80. O n.º de série <b>{chave.serial}</b> identifica-o (não precisa da chave).</p>}
                        </div>
                        <DialogFooter><Button onClick={() => { void navigator.clipboard?.writeText(chave.chave); toast({ title: 'Chave copiada' }); }}><Copy className="mr-1.5 h-4 w-4" /> Copiar a chave</Button></DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

// ── Cartões QR do quiosque ────────────────────────────────────────────────────
export function CartoesQrPonto({ actor, funcionarios, empresa, onAlterado }: { actor: ActorRH; funcionarios: Funcionario[]; empresa: string; onAlterado: () => void }) {
    const activos = useMemo(() => funcionarios.filter(f => f.estado === 'activo'), [funcionarios]);
    const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
    const [aGerar, setAGerar] = useState(false);
    const emitir = async (ids: string[]) => {
        if (!ids.length) return;
        if (!await confirmar(`Emitir ${ids.length} cartão(ões) novo(s)? Os cartões anteriores destes funcionários deixam de funcionar.`)) return;
        setAGerar(true);
        try {
            const cartoes = [];
            for (const id of ids) {
                const f = activos.find(x => x.id === id)!;
                cartoes.push({ nome: f.nome, numero: f.numero_mecanografico, codigo: await ServicoPontoRH.gerarCartaoQr(id, actor) });
            }
            await gerarCartoesQr(cartoes, empresa);
            toast({ title: `${cartoes.length} cartão(ões) emitido(s)`, description: 'Imprima o PDF: o código só existe nesse ficheiro.' });
            setEscolhidos(new Set());
            onAlterado();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Não foi possível emitir', description: (error as Error).message });
        } finally {
            setAGerar(false);
        }
    };
    return (
        <div className="mt-4 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-black"><QrCode className="h-4 w-4" /> Cartões QR do quiosque</h3>
                <Button size="sm" disabled={!escolhidos.size || aGerar} onClick={() => void emitir([...escolhidos])}>{aGerar ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CreditCard className="mr-1.5 h-4 w-4" />} Emitir {escolhidos.size || ''} cartão(ões)</Button>
            </div>
            <p className="mb-2 text-xs text-slate-500">O funcionário mostra o cartão à câmara do quiosque (ou a um leitor USB). Só fica guardada uma impressão (hash) do código.</p>
            <div className="max-h-48 space-y-1 overflow-y-auto">
                {activos.map(f => (
                    <label key={f.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={escolhidos.has(f.id)} onChange={e => { const s = new Set(escolhidos); if (e.target.checked) s.add(f.id); else s.delete(f.id); setEscolhidos(s); }} />
                        <span className="flex-1 truncate">{f.nome}</span>
                        {(f as { qr_ponto_hash?: string | null }).qr_ponto_hash
                            ? <><span className="text-xs text-emerald-600">tem cartão</span><button type="button" className="text-xs text-red-600 underline" onClick={() => void executar(() => ServicoPontoRH.retirarCartaoQr(f.id, actor), 'Cartão retirado').then(ok => ok && onAlterado())}>retirar</button></>
                            : <span className="text-xs text-slate-400">sem cartão</span>}
                    </label>
                ))}
            </div>
            <button type="button" className="mt-1 text-xs underline" onClick={() => setEscolhidos(new Set(activos.map(f => f.id)))}>Escolher todos</button>
        </div>
    );
}
