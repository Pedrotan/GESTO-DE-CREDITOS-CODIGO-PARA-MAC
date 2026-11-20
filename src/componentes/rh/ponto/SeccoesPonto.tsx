// Secções do Livro de ponto além da grelha: painel «Hoje» (F3.12), justificações por decidir (F3.8), auditoria
// (F2.11), configuração com PIN do quiosque (secção 4.6, F3.4), importação do relógio (F3.5) e fecho do mês (F2.5–F2.9).
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Lock, LockOpen, Phone, RefreshCw, Upload, XCircle } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Switch } from '@/componentes/ui/switch';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { cn } from '@/bibliotecas/utils';
import { horaDe, type ConfigPonto } from '@/bibliotecas/rh/ponto-calculo';
import { lerTabelaCsv, MAPEAMENTO_ANTERIOR, relatorioErros, type LinhaPrevia, type MapeamentoCsv } from '@/bibliotecas/rh/ponto-importacao';
import { relatorioAuditoria } from '@/bibliotecas/rh/ponto-relatorios';
import { renderReportExcel } from '@/bibliotecas/relatorios-pagamentos';
import { getScopedLocalStorageItem, setScopedLocalStorageItem } from '@/bibliotecas/contas';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { MOTIVOS_JUSTIFICACAO, ServicoPontoRH, type EstadoPeriodo, type Justificacao, type PeriodoPonto } from '@/servicos/rh/ServicoPontoRH';
import type { ActorRH, Funcionario } from '@/servicos/rh/ServicoRH';
import { abrirDataUrl, executar, Indicador, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { ServicoRelogiosPonto } from '@/servicos/rh/ServicoRelogiosPonto';
import { CartoesQrPonto } from './ExtrasPonto';
import { avisar } from '@/bibliotecas/alerta';

/** O servidor tem o e-mail (SMTP) configurado? Sem isso os alertas ficam só no sistema. */
function EstadoEmail() {
    const estado = useCarregar(() => ServicoRelogiosPonto.estadoEmail(), null as Awaited<ReturnType<typeof ServicoRelogiosPonto.estadoEmail>>, []);
    if (estado.aCarregar || estado.dados?.email) return null;
    return <p className="mt-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{estado.dados ? 'O servidor ainda não tem o envio de e-mail configurado (SMTP): os alertas continuam no sistema e seguem por e-mail quando for configurado.' : 'Sem ligação à nuvem: o envio de e-mail precisa da empresa ligada ao servidor.'}</p>;
}

const dataPt = (d: string) => d.split('-').reverse().join('/');

// ── Hoje ──────────────────────────────────────────────────────────────────────
export function PainelHojePonto({ actor, gerir, onLancarFalta }: { actor: ActorRH | null; gerir: boolean; onLancarFalta?: (funcionarioId: string, data: string) => Promise<void> }) {
    const hoje = useCarregar(() => ServicoPontoRH.hoje(), null as Awaited<ReturnType<typeof ServicoPontoRH.hoje>> | null, []);
    useEffect(() => {
        const t = window.setInterval(() => void hoje.recarregar(), 60_000); // actualização automática a cada 60 s
        return () => window.clearInterval(t);
    }, [hoje.recarregar]);
    const h = hoje.dados;
    if (!h) return <Vazio>A carregar…</Vazio>;
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="font-black">Hoje, {dataPt(h.hoje)}: {horaDe(h.agora)}</h2>
                <Button size="icon" variant="ghost" onClick={() => void hoje.recarregar()} title="Actualizar"><RefreshCw className={cn('h-4 w-4', hoje.aCarregar && 'animate-spin')} /></Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Indicador titulo="Presentes" valor={h.presentes} tom="emerald" />
                <Indicador titulo="Atrasados" valor={h.atrasados.length} tom="orange" />
                <Indicador titulo="Ausentes" valor={h.ausentes.length + h.faltas.length} tom="red" />
                <Indicador titulo="Férias" valor={h.ferias} tom="sky" />
                <Indicador titulo="Licença / dispensa" valor={h.licenca} />
            </div>
            {h.ausentes.length > 0 && (
                <div className="mt-4">
                    <p className="mb-1.5 text-xs font-black uppercase text-slate-500">Ausentes sem justificação (depois das {h.config.hora_alerta_sem_marcacao})</p>
                    {h.ausentes.map(a => (
                        <div key={a.funcionario.id} className="flex flex-wrap items-center gap-2 border-t border-slate-100 py-1.5 text-sm dark:border-slate-800">
                            <span className="flex-1 font-semibold">{a.funcionario.nome}: sem marcação</span>
                            {(a.funcionario as Funcionario).telefone && <a className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs" href={`tel:${(a.funcionario as Funcionario).telefone}`}><Phone className="h-3 w-3" /> Ligar</a>}
                            {gerir && onLancarFalta && actor && <Button size="sm" variant="outline" className="text-red-600" onClick={() => void onLancarFalta(a.funcionario.id, h.hoje).then(() => hoje.recarregar())}>Lançar falta</Button>}
                        </div>
                    ))}
                </div>
            )}
            {h.atrasados.length > 0 && (
                <div className="mt-4">
                    <p className="mb-1.5 text-xs font-black uppercase text-slate-500">Atrasados</p>
                    {h.atrasados.map(a => <p key={a.funcionario.id} className="border-t border-slate-100 py-1.5 text-sm dark:border-slate-800"><b>{a.funcionario.nome}</b>: entrou {horaDe(a.dia.primeira_entrada)} ({a.dia.minutos_atraso} min)</p>)}
                </div>
            )}
            {h.semSaida.length > 0 && (
                <div className="mt-4">
                    <p className="mb-1.5 text-xs font-black uppercase text-slate-500">Entrada sem saída</p>
                    {h.semSaida.map(a => <p key={a.funcionario.id} className="border-t border-slate-100 py-1.5 text-sm dark:border-slate-800">{a.funcionario.nome}: entrou {horaDe(a.dia.primeira_entrada)}, saída prevista {horaDe(a.dia.saida_prevista)}</p>)}
                </div>
            )}
        </section>
    );
}

// ── Justificações ─────────────────────────────────────────────────────────────
export function JustificacoesPonto({ actor, nomes, podeDecidir, onDecidido }: { actor: ActorRH; nomes: Map<string, string>; podeDecidir: (funcionarioId: string) => boolean; onDecidido: () => void }) {
    const lista = useCarregar(() => ServicoPontoRH.justificacoes(), [] as Justificacao[], []);
    const [rejeitar, setRejeitar] = useState<{ id: string; comentario: string } | null>(null);
    const decidir = async (id: string, aprovar: boolean, comentario = '') => {
        if (await executar(() => ServicoPontoRH.decidirJustificacao(id, aprovar, comentario, actor), aprovar ? 'Justificação aprovada' : 'Justificação rejeitada')) { setRejeitar(null); await lista.recarregar(); onDecidido(); }
    };
    if (!lista.dados.length) return <Vazio>Sem pedidos de justificação.</Vazio>;
    return (
        <div className="space-y-2">
            {lista.dados.map(j => (
                <div key={j.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p><b>{nomes.get(j.funcionario_id) || '—'}</b> · {dataPt(j.data_inicio)}{j.data_fim !== j.data_inicio ? ` a ${dataPt(j.data_fim)}` : ''} · {MOTIVOS_JUSTIFICACAO.find(m => m.codigo === j.motivo_codigo)?.nome}</p>
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', j.estado === 'pendente' ? 'bg-amber-100 text-amber-800' : j.estado === 'aprovada' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700')}>{j.estado}</span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">{j.motivo}</p>
                    {j.comentario && <p className="text-xs text-slate-500">Comentário: {j.comentario}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                        {j.anexo_nome && <Button size="sm" variant="outline" onClick={() => void ServicoPontoRH.anexoJustificacao(j.id).then(a => a?.anexo_data_url && abrirDataUrl(a.anexo_data_url, a.anexo_nome))}><Download className="mr-1 h-3.5 w-3.5" /> {j.anexo_nome}</Button>}
                        {j.estado === 'pendente' && podeDecidir(j.funcionario_id) && (
                            <>
                                <Button size="sm" onClick={() => void decidir(j.id, true)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aprovar</Button>
                                <Button size="sm" variant="outline" className="text-red-600" onClick={() => setRejeitar({ id: j.id, comentario: '' })}><XCircle className="mr-1 h-3.5 w-3.5" /> Rejeitar</Button>
                            </>
                        )}
                        {j.decidido_por_nome && <span className="text-xs text-slate-500">{j.estado} por {j.decidido_por_nome} em {j.decidido_em ? new Date(j.decidido_em).toLocaleString('pt-PT') : ''}</span>}
                    </div>
                    {rejeitar?.id === j.id && (
                        <div className="mt-2 flex gap-2"><Input value={rejeitar.comentario} onChange={e => setRejeitar({ ...rejeitar, comentario: e.target.value })} placeholder="Motivo da rejeição (o funcionário recebe-o)" />
                            <Button size="sm" variant="destructive" disabled={rejeitar.comentario.trim().length < 5} onClick={() => void decidir(j.id, false, rejeitar.comentario)}>Rejeitar</Button></div>
                    )}
                </div>
            ))}
        </div>
    );
}

// ── Auditoria ─────────────────────────────────────────────────────────────────
export function AuditoriaPonto({ funcionarios, settings, userName }: { funcionarios: Array<{ id: string; nome: string }>; settings: unknown; userName: string }) {
    const hoje = luandaTodayKey();
    const [filtro, setFiltro] = useState({ de: `${hoje.slice(0, 7)}-01`, ate: hoje, funcionarioId: '', utilizador: '', accao: '' });
    const registos = useCarregar(() => ServicoPontoRH.auditoria({ ...filtro, funcionarioId: filtro.funcionarioId || null, utilizador: filtro.utilizador || null, accao: filtro.accao || null }), [] as Awaited<ReturnType<typeof ServicoPontoRH.auditoria>>, [filtro]);
    const utilizadores = useMemo(() => [...new Set(registos.dados.map(r => r.userName))].sort(), [registos.dados]);
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
                <div><Label className="text-xs font-bold">De</Label><Input className="mt-1 w-40" type="date" value={filtro.de} onChange={e => setFiltro({ ...filtro, de: e.target.value })} /></div>
                <div><Label className="text-xs font-bold">Até</Label><Input className="mt-1 w-40" type="date" value={filtro.ate} onChange={e => setFiltro({ ...filtro, ate: e.target.value })} /></div>
                <FiltroLista rotulo="Funcionário" valor={filtro.funcionarioId} opcoes={funcionarios.map(f => [f.id, f.nome])} onChange={v => setFiltro({ ...filtro, funcionarioId: v })} />
                <FiltroLista rotulo="Utilizador" valor={filtro.utilizador} opcoes={utilizadores.map(u => [u, u])} onChange={v => setFiltro({ ...filtro, utilizador: v })} />
                <FiltroLista rotulo="Acção" valor={filtro.accao} opcoes={[['create', 'Criar'], ['update', 'Editar'], ['cancel', 'Anular'], ['approve', 'Aprovar'], ['reject', 'Rejeitar'], ['close', 'Fechar'], ['reopen', 'Reabrir'], ['import', 'Importar']]} onChange={v => setFiltro({ ...filtro, accao: v })} />
                <Button variant="outline" onClick={() => renderReportExcel(relatorioAuditoria(registos.dados, filtro.de, filtro.ate), settings, userName, 'save')}><FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel</Button>
            </div>
            {registos.dados.length === 0 ? <Vazio>Sem alterações neste período.</Vazio> : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500 dark:bg-slate-950"><tr><th className="px-3 py-2">Quando</th><th>Utilizador</th><th>Acção</th><th>Descrição</th><th>Antes → depois</th></tr></thead>
                        <tbody>{registos.dados.map(r => {
                            let motivo = '';
                            try { motivo = JSON.parse(r.metadata || '{}').motivo || ''; } catch { /* antigos */ }
                            return (
                                <tr key={r.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                                    <td className="whitespace-nowrap px-3 py-2 text-xs">{new Date(r.timestamp).toLocaleString('pt-PT')}</td>
                                    <td className="text-xs">{r.userName}</td><td className="text-xs">{r.action}</td>
                                    <td className="text-xs">{r.details}{motivo ? <span className="block text-slate-500">Motivo: {motivo}</span> : null}</td>
                                    <td className="max-w-[260px] break-words text-[11px] text-slate-500">{r.previousState || '—'} → {r.newState || '—'}</td>
                                </tr>
                            );
                        })}</tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function FiltroLista({ rotulo, valor, opcoes, onChange }: { rotulo: string; valor: string; opcoes: Array<[string, string]>; onChange: (v: string) => void }) {
    return (
        <div><Label className="text-xs font-bold">{rotulo}</Label>
            <Select value={valor || '__todos'} onValueChange={v => onChange(v === '__todos' ? '' : v)}>
                <SelectTrigger className="mt-1 w-48"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__todos">Todos</SelectItem>{opcoes.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}</SelectContent>
            </Select>
        </div>
    );
}

// ── Configuração ──────────────────────────────────────────────────────────────
const CAMPOS: Array<{ campo: keyof ConfigPonto; rotulo: string; tipo: 'numero' | 'hora' | 'sim' | 'texto'; ajuda?: string }> = [
    { campo: 'tolerancia_entrada_min', rotulo: 'Tolerância de entrada (min)', tipo: 'numero' },
    { campo: 'tolerancia_saida_min', rotulo: 'Tolerância de saída (min)', tipo: 'numero' },
    { campo: 'tolerancia_cumulativa', rotulo: 'Acima da tolerância conta o atraso todo', tipo: 'sim', ajuda: 'Desligado: conta só o que passa da tolerância.' },
    { campo: 'minimo_extra_min', rotulo: 'Mínimo de horas extra por dia (min)', tipo: 'numero' },
    { campo: 'arredondamento_min', rotulo: 'Arredondamento das horas extra (0, 5, 10, 15)', tipo: 'numero' },
    { campo: 'pausa_almoco_auto_min', rotulo: 'Pausa automática sem marcações de pausa (min)', tipo: 'numero' },
    { campo: 'inicio_noturno', rotulo: 'Início do trabalho nocturno', tipo: 'hora' },
    { campo: 'fim_noturno', rotulo: 'Fim do trabalho nocturno', tipo: 'hora' },
    { campo: 'limite_extra_diario_min', rotulo: 'Alerta: horas extra por dia acima de (min)', tipo: 'numero' },
    { campo: 'limite_extra_anual_min', rotulo: 'Alerta: horas extra por ano acima de (min)', tipo: 'numero' },
    { campo: 'hora_alerta_sem_marcacao', rotulo: 'Hora do alerta «sem marcação»', tipo: 'hora' },
    { campo: 'alerta_atrasos_mes', rotulo: 'Alerta a partir de N atrasos no mês', tipo: 'numero' },
    { campo: 'lancar_falta_automatica', rotulo: 'Permitir converter pendentes em faltas ao validar', tipo: 'sim' },
    { campo: 'exigir_fecho_para_salarios', rotulo: 'O processamento salarial só usa meses fechados', tipo: 'sim' },
    { campo: 'autoregisto_app', rotulo: 'Funcionários marcam o ponto no portal', tipo: 'sim' },
    { campo: 'exigir_geolocalizacao', rotulo: 'Exigir estar na área permitida', tipo: 'sim' },
    { campo: 'local_latitude', rotulo: 'Latitude do local de trabalho', tipo: 'texto' },
    { campo: 'local_longitude', rotulo: 'Longitude do local de trabalho', tipo: 'texto' },
    { campo: 'raio_permitido_m', rotulo: 'Raio da área permitida (m)', tipo: 'numero' },
    { campo: 'exigir_selfie', rotulo: 'Exigir fotografia na marcação', tipo: 'sim' },
    { campo: 'banco_horas_activo', rotulo: 'Banco de horas activo', tipo: 'sim', ajuda: 'Horas extra podem ser compensadas em folgas em vez de pagas.' },
    { campo: 'banco_validade_meses', rotulo: 'Validade das horas do banco (meses, 0 = sem prazo)', tipo: 'numero' },
    { campo: 'notificacoes_ambiente', rotulo: 'Avisos do ponto como notificação do Windows/navegador', tipo: 'sim' },
    { campo: 'alertas_email', rotulo: 'Enviar os alertas também por e-mail', tipo: 'sim', ajuda: 'Ao RH e, nos avisos pessoais, ao e-mail da ficha do funcionário.' },
    { campo: 'email_rh', rotulo: 'E-mail do RH para os alertas', tipo: 'texto' },
];

export function ConfiguracaoPonto({ config, actor, funcionarios, empresa, ano, mes, onFechar, onGuardado }: {
    config: ConfigPonto; actor: ActorRH; funcionarios: Funcionario[]; empresa: string; ano: number; mes: number; onFechar: () => void; onGuardado: () => void;
}) {
    const [valores, setValores] = useState<Record<string, string | boolean>>(() => Object.fromEntries(CAMPOS.map(c => [c.campo, typeof config[c.campo] === 'boolean' ? config[c.campo] as boolean : String(config[c.campo] ?? '')])));
    const [pins, setPins] = useState<Record<string, string>>({});
    const [progresso, setProgresso] = useState<string | null>(null);
    const guardar = async () => {
        const alteradas = Object.fromEntries(CAMPOS.filter(c => String(valores[c.campo]) !== String(typeof config[c.campo] === 'boolean' ? config[c.campo] : config[c.campo] ?? '')).map(c => [c.campo, valores[c.campo]]));
        if (await executar(() => ServicoPontoRH.guardarConfiguracao(alteradas, actor), 'Configuração do ponto guardada (em vigor a partir de hoje)')) onGuardado();
    };
    const usarLocalizacao = () => navigator.geolocation?.getCurrentPosition(p => setValores(v => ({ ...v, local_latitude: p.coords.latitude.toFixed(6), local_longitude: p.coords.longitude.toFixed(6) })));
    return (
        <Dialog open onOpenChange={v => !v && onFechar()}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Configuração do livro de ponto</DialogTitle>
                    <DialogDescription>As alterações valem a partir de hoje (os meses anteriores mantêm os valores da altura). Confirme os limites de horas extra e de trabalho nocturno com a Lei Geral do Trabalho e o contabilista.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    {CAMPOS.map(c => (
                        <div key={c.campo} className={cn(c.tipo === 'sim' && 'flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-2.5 dark:border-slate-800')}>
                            <Label className="text-xs font-bold">{c.rotulo}{c.ajuda && <span className="block font-normal text-slate-500">{c.ajuda}</span>}</Label>
                            {c.tipo === 'sim'
                                ? <Switch checked={Boolean(valores[c.campo])} onCheckedChange={v => setValores({ ...valores, [c.campo]: v })} />
                                : <Input className="mt-1" type={c.tipo === 'hora' ? 'time' : c.tipo === 'numero' ? 'number' : 'text'} value={String(valores[c.campo] ?? '')} onChange={e => setValores({ ...valores, [c.campo]: e.target.value })} />}
                        </div>
                    ))}
                    <Button variant="outline" size="sm" className="sm:col-span-2" onClick={usarLocalizacao}>Usar a localização deste dispositivo como local de trabalho</Button>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                    <h3 className="mb-2 text-sm font-black">PIN do quiosque</h3>
                    <p className="mb-2 text-xs text-slate-500">4 a 6 algarismos por funcionário. O PIN não é guardado: só uma impressão (hash). Deixe vazio e guarde para retirar.</p>
                    <div className="max-h-56 space-y-1.5 overflow-y-auto">
                        {funcionarios.filter(f => f.estado === 'activo').map(f => (
                            <div key={f.id} className="flex items-center gap-2 text-sm">
                                <span className="flex-1 truncate">{f.nome} {(f as any).pin_ponto_hash ? <span className="text-xs text-emerald-600">(tem PIN)</span> : null}</span>
                                <Input className="w-28" inputMode="numeric" maxLength={6} value={pins[f.id] ?? ''} onChange={e => setPins({ ...pins, [f.id]: e.target.value.replace(/\D/gu, '') })} placeholder="PIN" />
                                <Button size="sm" variant="outline" disabled={pins[f.id] === undefined} onClick={() => void executar(() => ServicoPontoRH.definirPin(f.id, pins[f.id] || '', actor), pins[f.id] ? 'PIN definido' : 'PIN retirado').then(ok => ok && setPins(p => { const n = { ...p }; delete n[f.id]; return n; }))}>Guardar</Button>
                            </div>
                        ))}
                    </div>
                </div>
                <CartoesQrPonto actor={actor} funcionarios={funcionarios} empresa={empresa} onAlterado={onGuardado} />
                {valores.alertas_email && <EstadoEmail />}
                <DialogFooter className="flex-wrap gap-2">
                    <Button variant="outline" disabled={progresso !== null} onClick={async () => {
                        setProgresso('0%');
                        await executar(() => ServicoPontoRH.recalcularMes(ano, mes, actor, (feito, total) => setProgresso(`${Math.round(feito / total * 100)}%`)), 'Mês recalculado');
                        setProgresso(null); onGuardado();
                    }}>{progresso !== null ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> A recalcular {progresso}</> : <><RefreshCw className="mr-1.5 h-4 w-4" /> Recalcular o mês</>}</Button>
                    <Button variant="outline" onClick={onFechar}>Fechar</Button>
                    <Button onClick={() => void guardar()}>Guardar configuração</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Importação do relógio ─────────────────────────────────────────────────────
const CHAVE_MAPAS = 'ponto_mapeamentos_csv';
type MapasGuardados = Record<string, MapeamentoCsv>;
const lerMapas = (): MapasGuardados => { try { return JSON.parse(getScopedLocalStorageItem(CHAVE_MAPAS) || '{}'); } catch { return {}; } };

export function ImportarPonto({ actor, funcionarios, onFechar, onImportado }: { actor: ActorRH; funcionarios: Funcionario[]; onFechar: () => void; onImportado: () => void }) {
    const [texto, setTexto] = useState('');
    const [modelo, setModelo] = useState('');
    const [mapa, setMapa] = useState<MapeamentoCsv>(MAPEAMENTO_ANTERIOR);
    const [previa, setPrevia] = useState<LinhaPrevia[] | null>(null);
    const [associacoes, setAssociacoes] = useState<Record<string, string>>({});
    const [resultado, setResultado] = useState<string | null>(null);
    const mapas = lerMapas();
    const colunas = useMemo(() => (texto ? lerTabelaCsv(texto)[0] || [] : []), [texto]);
    const opcao = (campo: keyof MapeamentoCsv, rotulo: string, opcional = true) => (
        <div><Label className="text-xs font-bold">{rotulo}</Label>
            <Select value={mapa[campo] === null ? '__nenhuma' : String(mapa[campo])} onValueChange={v => setMapa({ ...mapa, [campo]: v === '__nenhuma' ? null : Number(v) })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{opcional && <SelectItem value="__nenhuma">(nenhuma)</SelectItem>}{colunas.map((c, i) => <SelectItem key={i} value={String(i)}>{i + 1}. {c || '(vazia)'}</SelectItem>)}</SelectContent>
            </Select>
        </div>
    );
    const desconhecidos = [...new Set((previa || []).filter(l => l.estado === 'funcionario_desconhecido').map(l => l.numero))];
    const contagem = (estado: string) => (previa || []).filter(l => l.estado === estado).length;
    return (
        <Dialog open onOpenChange={v => !v && onFechar()}>
            <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Importar marcações do relógio</DialogTitle>
                    <DialogDescription>1. Carregue o ficheiro · 2. Escolha as colunas · 3. Confira a pré-visualização · 4. Importe. As linhas repetidas são ignoradas.</DialogDescription>
                </DialogHeader>
                <Input type="file" accept=".csv,.txt" onChange={async e => { const f = e.target.files?.[0]; setTexto(f ? await f.text() : ''); setPrevia(null); setResultado(null); }} />
                {texto && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-end gap-2">
                            {Object.keys(mapas).length > 0 && (
                                <div><Label className="text-xs font-bold">Modelo de relógio guardado</Label>
                                    <Select value="" onValueChange={v => { setModelo(v); setMapa(mapas[v]); setPrevia(null); }}>
                                        <SelectTrigger className="mt-1 w-56"><SelectValue placeholder="Escolher…" /></SelectTrigger>
                                        <SelectContent>{Object.keys(mapas).map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            )}
                            <div><Label className="text-xs font-bold">Formato</Label>
                                <Select value={mapa.modo} onValueChange={v => setMapa({ ...mapa, modo: v as MapeamentoCsv['modo'] })}>
                                    <SelectTrigger className="mt-1 w-64"><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="entrada_saida">Entrada e saída na mesma linha</SelectItem><SelectItem value="marcacoes">Uma marcação por linha</SelectItem></SelectContent>
                                </Select>
                            </div>
                            <label className="flex items-center gap-2 pb-2 text-xs"><input type="checkbox" checked={mapa.cabecalho} onChange={e => setMapa({ ...mapa, cabecalho: e.target.checked })} /> A 1.ª linha é o cabeçalho</label>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                            {opcao('numero', 'N.º do funcionário', false)}
                            {opcao('data_hora', 'Data e hora (mesma coluna)')}
                            {opcao('data', 'Data')}
                            {mapa.modo === 'marcacoes' ? <>{opcao('hora', 'Hora')}{opcao('tipo', 'Tipo (entrada/saída)')}</> : <>{opcao('entrada', 'Entrada')}{opcao('saida', 'Saída')}</>}
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                            <div><Label className="text-xs font-bold">Guardar este mapeamento como</Label><Input className="mt-1 w-56" value={modelo} onChange={e => setModelo(e.target.value)} placeholder="Ex.: ZKTeco da entrada" /></div>
                            <Button variant="outline" disabled={!modelo.trim()} onClick={() => setScopedLocalStorageItem(CHAVE_MAPAS, JSON.stringify({ ...mapas, [modelo.trim()]: mapa }))}>Guardar mapeamento</Button>
                            <Button onClick={() => void executar(async () => setPrevia(await ServicoPontoRH.previsualizarImportacao(texto, mapa)), 'Pré-visualização pronta')}>Pré-visualizar</Button>
                        </div>
                    </div>
                )}
                {previa && (
                    <div className="space-y-2">
                        <p className="text-sm">✅ {contagem('valida')} válidas · 🔁 {contagem('duplicada')} duplicadas (ignoradas) · ❓ {contagem('funcionario_desconhecido')} funcionário não encontrado · ⚠️ {contagem('data_invalida')} com data inválida</p>
                        {desconhecidos.length > 0 && (
                            <div className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                                <p className="mb-1.5 font-bold">Associar números desconhecidos</p>
                                {desconhecidos.map(n => (
                                    <div key={n} className="mb-1 flex items-center gap-2"><span className="w-20 font-mono">{n || '(vazio)'}</span>
                                        <Select value={associacoes[n] || '__nao'} onValueChange={v => setAssociacoes({ ...associacoes, [n]: v === '__nao' ? '' : v })}>
                                            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                                            <SelectContent><SelectItem value="__nao">Ignorar</SelectItem>{funcionarios.map(f => <SelectItem key={f.id} value={f.id}>{f.nome} (n.º {f.numero_mecanografico})</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-slate-50 text-left dark:bg-slate-950"><tr><th className="px-2 py-1">Linha</th><th>N.º</th><th>Funcionário</th><th>Dia</th><th>Hora</th><th>Tipo</th><th>Estado</th></tr></thead>
                                <tbody>{previa.slice(0, 500).map((l, i) => (
                                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800"><td className="px-2 py-1">{l.linha}</td><td>{l.numero}</td><td>{l.nome || '—'}</td><td>{l.data ? dataPt(l.data) : '—'}</td><td>{l.data_hora?.slice(11) || '—'}</td><td>{l.tipo || '—'}</td>
                                        <td>{{ valida: '✅', duplicada: '🔁', funcionario_desconhecido: '❓', data_invalida: '⚠️' }[l.estado]} {l.detalhe}</td></tr>
                                ))}</tbody>
                            </table>
                        </div>
                    </div>
                )}
                {resultado && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">{resultado}</p>}
                <DialogFooter className="gap-2">
                    {previa && previa.some(l => l.estado !== 'valida') && <Button variant="outline" onClick={() => { const a = document.createElement('a'); a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(relatorioErros(previa))}`; a.download = 'erros-importacao-ponto.csv'; a.click(); }}><Download className="mr-1.5 h-4 w-4" /> Relatório de erros</Button>}
                    <Button variant="outline" onClick={onFechar}>Fechar</Button>
                    <Button disabled={!previa || (!contagem('valida') && !Object.values(associacoes).some(Boolean))} onClick={() => void executar(async () => {
                        const r = await ServicoPontoRH.importar(previa!, associacoes, actor);
                        setResultado(`${r.importadas} importada(s), ${r.ignoradas} ignorada(s), ${r.erros} com erro${r.mesesBloqueados.length ? ` (meses fechados ou processados: ${r.mesesBloqueados.join(', ')})` : ''}.`);
                        setPrevia(null); onImportado();
                    }, 'Importação concluída')}><Upload className="mr-1.5 h-4 w-4" /> Importar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Período (validação, fecho e reabertura) ───────────────────────────────────
export const ROTULO_PERIODO: Record<EstadoPeriodo, string> = { aberto: 'Aberto', em_validacao: 'Em validação', validado: 'Validado', fechado: 'Fechado' };

export function DialogoPeriodo({ modo, ano, mes, departamentos, periodos, permiteConverter, problemas, actor, onFechar, onFeito }: {
    modo: 'validar' | 'fechar' | 'reabrir'; ano: number; mes: number; departamentos: Array<{ id: string; nome: string }>; periodos: PeriodoPonto[];
    permiteConverter: boolean; problemas: { pendentes: number; incompletos: number }; actor: ActorRH; onFechar: () => void; onFeito: () => void;
}) {
    const [departamento, setDepartamento] = useState(departamentos[0]?.id || '');
    const [converter, setConverter] = useState(false);
    const [motivo, setMotivo] = useState('');
    const [aCorrer, setACorrer] = useState(false);
    const correr = async (fn: () => Promise<unknown>, msg: string) => { setACorrer(true); const ok = await executar(fn, msg); setACorrer(false); if (ok) { onFeito(); onFechar(); } };
    const titulo = { validar: 'Validar o mês', fechar: 'Fechar o mês', reabrir: 'Reabrir o mês' }[modo];
    return (
        <Dialog open onOpenChange={v => !v && onFechar()}>
            <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{titulo}: {String(mes).padStart(2, '0')}/{ano}</DialogTitle>
                    <DialogDescription>{modo === 'fechar' ? 'Ao fechar, o ponto e as ausências do mês ficam bloqueados e os totais (faltas, atrasos, horas extra por tipo, nocturno) passam para o processamento salarial.'
                        : modo === 'reabrir' ? 'A reabertura fica na auditoria. Se o salário do mês já foi calculado, fica marcado como desactualizado.'
                        : 'O chefe valida o seu departamento; o RH aprova. Só é possível sem dias por resolver nem marcações incompletas.'}</DialogDescription>
                </DialogHeader>
                {modo === 'validar' && (
                    <div className="space-y-2">
                        <Label className="text-xs font-bold">Departamento</Label>
                        <Select value={departamento} onValueChange={setDepartamento}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{departamentos.map(d => <SelectItem key={d.id} value={d.id}>{d.nome} · {ROTULO_PERIODO[periodos.find(p => p.departamento_id === d.id)?.estado || 'aberto']}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                )}
                {modo !== 'reabrir' && (problemas.pendentes > 0 || problemas.incompletos > 0) && (
                    <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        <p className="flex items-center gap-1.5 font-bold"><AlertTriangle className="h-4 w-4" /> {problemas.pendentes} dia(s) sem registo · {problemas.incompletos} marcação(ões) incompleta(s)</p>
                        {problemas.incompletos > 0 && <p className="mt-1">As marcações incompletas têm de ser corrigidas (entrada sem saída).</p>}
                        {permiteConverter
                            ? <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={converter} onChange={e => setConverter(e.target.checked)} /> Converter os dias sem registo em faltas injustificadas</label>
                            : <p className="mt-1">Resolva-os com «Resolver pendentes» (a conversão automática em faltas está desligada na configuração).</p>}
                    </div>
                )}
                {modo === 'reabrir' && <div><Label className="text-xs font-bold">Motivo (obrigatório)</Label><Textarea className="mt-1" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} /></div>}
                <DialogFooter>
                    <Button variant="outline" onClick={onFechar}>Cancelar</Button>
                    {modo === 'validar' && <Button disabled={aCorrer || !departamento} onClick={() => void correr(() => ServicoPontoRH.validarMes(ano, mes, departamento, actor, { converterPendentes: converter }), 'Mês validado')}><CheckCircle2 className="mr-1.5 h-4 w-4" /> Validar</Button>}
                    {modo === 'fechar' && <Button disabled={aCorrer} onClick={() => void correr(() => ServicoPontoRH.fecharMes(ano, mes, actor, { converterPendentes: converter }), 'Mês fechado: os totais seguem para o processamento salarial')}><Lock className="mr-1.5 h-4 w-4" /> Fechar o mês</Button>}
                    {modo === 'reabrir' && <Button variant="destructive" disabled={aCorrer || motivo.trim().length < 5} onClick={() => void correr(async () => {
                        const r = await ServicoPontoRH.reabrirMes(ano, mes, motivo, actor);
                        if (r.processamentoDesactualizado) void avisar('O salário deste mês já tinha sido calculado. O processamento fica marcado como desactualizado: reabra-o e volte a calcular depois de corrigir o ponto.', 'warning');
                    }, 'Mês reaberto')}><LockOpen className="mr-1.5 h-4 w-4" /> Reabrir</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

