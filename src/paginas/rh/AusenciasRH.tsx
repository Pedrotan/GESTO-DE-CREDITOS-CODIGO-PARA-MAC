import { useEffect, useMemo, useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Switch } from '@/componentes/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { CheckCircle2, FileDown, Plus, Printer, Undo2, FileCheck } from 'lucide-react';
import { ServicoRH, type ActorRH, type Funcionario } from '@/servicos/rh/ServicoRH';
import { ServicoTempoRH, type AusenciaRH } from '@/servicos/rh/ServicoTempoRH';
import { gerarDispensaPdf } from '@/bibliotecas/rh/pdf-rh';
import { printPdfFromUrl } from '@/bibliotecas/pdfPrint';
import { dataUrlToBlob } from '@/bibliotecas/relatorios-pagamentos';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import type { TipoAusencia } from '@/bibliotecas/rh/ponto';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { useData } from '@/contextos/ContextoDados';
import { NavegacaoRH, dataPt, executar, lerFicheiro, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { toast } from '@/ganchos/usar-toast';
import { useBaseRH } from './FuncionariosRH';
import { LIGACOES_TEMPO } from './LivroPontoRH';

const TODOS = '__todos__';
const CORES = { pendente: 'bg-amber-100 text-amber-800', aprovada: 'bg-emerald-100 text-emerald-700', anulada: 'bg-slate-200 text-slate-500 line-through' };

export default function AusenciasRH() {
    const { actor, gerir } = useActorRH();
    const { companySettings } = useData();
    const base = useBaseRH();
    const dados = useCarregar(async () => ({ ausencias: await ServicoTempoRH.ausencias(), tipos: await ServicoTempoRH.tiposAusencia() }), { ausencias: [] as AusenciaRH[], tipos: [] as TipoAusencia[] });
    const { ausencias, tipos } = dados.dados;
    const [estado, setEstado] = useState<string>(TODOS);
    const [funcionario, setFuncionario] = useState(TODOS);
    const [novo, setNovo] = useState<null | { dispensa: boolean }>(null);
    const [anular, setAnular] = useState<AusenciaRH | null>(null);
    const [justificar, setJustificar] = useState<AusenciaRH | null>(null);
    const nomes = useMemo(() => new Map(base.dados.funcionarios.map(f => [f.id, f] as const)), [base.dados.funcionarios]);
    const tipoDe = (id: string) => tipos.find(t => t.id === id);
    const lista = ausencias.filter(a => (estado === TODOS || a.estado === estado) && (funcionario === TODOS || a.funcionario_id === funcionario));
    const recarregar = () => void dados.recarregar();

    const dispensa = async (a: AusenciaRH, modo: 'save' | 'print') => {
        if (!actor) return;
        const f = nomes.get(a.funcionario_id);
        const tipo = tipoDe(a.tipo_id);
        try {
            const emitido = await ServicoTempoRH.emitirDispensa(a, { tipo: tipo?.nome }, actor);
            const ficheiro = gerarDispensaPdf({
                numero: emitido.numero, emitidoEm: emitido.emitido_em,
                funcionario: { nome: f?.nome || '—', numero: f?.numero_mecanografico || '—', bi: f?.bi_numero,
                    cargo: base.dados.cargos.find(c => c.id === f?.cargo_id)?.nome, departamento: base.dados.departamentos.find(d => d.id === f?.departamento_id)?.nome },
                tipo: tipo?.nome || '—', inicio: a.data_inicio, fim: a.data_fim, dias: a.dias, horas: a.horas, remunerada: Boolean(tipo?.remunerada),
                motivo: a.motivo, aprovadoPor: a.aprovado_por_nome,
            }, companySettings, actor.name, modo === 'save' ? 'save' : 'datauri');
            if (modo === 'print') {
                const url = URL.createObjectURL(dataUrlToBlob(ficheiro.dataUrl));
                await printPdfFromUrl(url, message => toast({ variant: 'destructive', title: 'Impressão', description: message || 'Não foi possível imprimir.' }), undefined, ficheiro.fileName);
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
            }
            recarregar();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Não foi possível emitir a dispensa', description: (error as Error).message });
        }
    };

    return (
        <MainLayout title="Dispensas e licenças" subtitle="Faltas, justificações, dispensas e licenças — a fonte das faltas do processamento">
            <NavegacaoRH extra={LIGACOES_TEMPO} />
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <Select value={estado} onValueChange={setEstado}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value={TODOS}>Todos os estados</SelectItem><SelectItem value="pendente">Pendentes</SelectItem><SelectItem value="aprovada">Aprovadas</SelectItem><SelectItem value="anulada">Anuladas</SelectItem></SelectContent>
                </Select>
                <Select value={funcionario} onValueChange={setFuncionario}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value={TODOS}>Todos os funcionários</SelectItem>{base.dados.funcionarios.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
                </Select>
                {gerir && <Button onClick={() => setNovo({ dispensa: false })}><Plus className="mr-1.5 h-4 w-4" /> Adicionar falta / ausência</Button>}
                {gerir && <Button variant="outline" onClick={() => setNovo({ dispensa: true })}><Plus className="mr-1.5 h-4 w-4" /> Pedido de dispensa</Button>}
            </div>
            {ausencias.filter(a => a.estado === 'pendente').length > 0 && (
                <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">{ausencias.filter(a => a.estado === 'pendente').length} ausência(s) aguardam aprovação, justificação ou documento.</p>
            )}

            {lista.length === 0 ? <Vazio>Sem ausências registadas.</Vazio> : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500 dark:bg-slate-950">
                            <tr><th className="px-3 py-2">Funcionário</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Período</th><th className="px-3 py-2">Dias / horas</th><th className="px-3 py-2">Motivo</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2 text-right">Acções</th></tr>
                        </thead>
                        <tbody>
                            {lista.map(a => {
                                const tipo = tipoDe(a.tipo_id);
                                return (
                                    <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                                        <td className="px-3 py-2 font-semibold">{nomes.get(a.funcionario_id)?.nome || '—'}</td>
                                        <td className="px-3 py-2">{tipo?.nome || '—'}{a.pedido_dispensa ? <span className="ml-1 text-[10px] text-violet-600">(pedido)</span> : null}
                                            <div className="text-[10px] text-slate-400">{tipo ? `${tipo.remunerada ? 'remunerada' : 'não remunerada'} · ${tipo.desconta_salario ? 'desconta salário' : 'não desconta'}` : ''}</div></td>
                                        <td className="px-3 py-2">{dataPt(a.data_inicio)}{a.data_fim !== a.data_inicio ? ` a ${dataPt(a.data_fim)}` : ''}</td>
                                        <td className="px-3 py-2">{a.horas > 0 ? `${a.horas} h` : `${a.dias} dia(s)`}</td>
                                        <td className="max-w-[220px] px-3 py-2 text-xs">{a.motivo || '—'}{a.motivo_anulacao ? <div className="text-red-500">Anulada: {a.motivo_anulacao}</div> : null}</td>
                                        <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CORES[a.estado]}`}>{a.estado}</span>
                                            <div className="text-[10px] text-slate-400">{a.estado === 'aprovada' ? a.aprovado_por_nome : a.estado === 'anulada' ? a.anulado_por_nome : a.criado_por_nome}</div></td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right">
                                            {gerir && actor && a.estado === 'pendente' && <Button size="icon" variant="ghost" title="Aprovar" onClick={() => void executar(() => ServicoTempoRH.aprovarAusencia(a, actor), 'Ausência aprovada').then(ok => ok && recarregar())}><CheckCircle2 className="h-4 w-4 text-emerald-600" /></Button>}
                                            {gerir && a.estado !== 'anulada' && tipo && !tipo.justificada && <Button size="icon" variant="ghost" title="Justificar" onClick={() => setJustificar(a)}><FileCheck className="h-4 w-4" /></Button>}
                                            {a.estado === 'aprovada' && (a.pedido_dispensa || tipo?.codigo === 'D') && <>
                                                <Button size="icon" variant="ghost" title="Dispensa em PDF" onClick={() => void dispensa(a, 'save')}><FileDown className="h-4 w-4" /></Button>
                                                <Button size="icon" variant="ghost" title="Imprimir dispensa" onClick={() => void dispensa(a, 'print')}><Printer className="h-4 w-4" /></Button>
                                            </>}
                                            {gerir && a.estado !== 'anulada' && <Button size="icon" variant="ghost" title="Retirar (anular)" onClick={() => setAnular(a)}><Undo2 className="h-4 w-4 text-red-600" /></Button>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {actor && novo && <DialogoNova dispensa={novo.dispensa} funcionarios={base.dados.funcionarios.filter(f => f.estado === 'activo')} tipos={tipos} actor={actor}
                onClose={() => setNovo(null)} onSaved={recarregar} />}
            {actor && anular && <DialogoAnular ausencia={anular} actor={actor} onClose={() => setAnular(null)} onSaved={recarregar} />}
            {actor && justificar && <DialogoJustificar ausencia={justificar} tipos={tipos} actor={actor} onClose={() => setJustificar(null)} onSaved={recarregar} />}
        </MainLayout>
    );
}

type Base = { actor: ActorRH; onClose: () => void; onSaved: () => void };

/** Guarda um anexo (atestado, justificação) no arquivo do funcionário, categoria Saúde e ausências. */
async function anexar(funcionarioId: string, ficheiro: File | null, nome: string, actor: ActorRH) {
    if (!ficheiro) return null;
    return ServicoRH.carregarDocumento({ funcionario_id: funcionarioId, categoria: 'saude', nome, ficheiro_nome: ficheiro.name, data_url: await lerFicheiro(ficheiro) }, 2, actor);
}

function DialogoNova({ dispensa, funcionarios, tipos, actor, onClose, onSaved }: Base & { dispensa: boolean; funcionarios: Funcionario[]; tipos: TipoAusencia[] }) {
    const activos = tipos.filter(t => t.activo !== 0);
    const [escolhidos, setEscolhidos] = useState<string[]>([]);
    const [tipoId, setTipoId] = useState(dispensa ? (activos.find(t => t.codigo === 'D')?.id || '') : (activos.find(t => t.codigo === 'F')?.id || ''));
    const [inicio, setInicio] = useState(luandaTodayKey());
    const [fim, setFim] = useState(luandaTodayKey());
    const [porHoras, setPorHoras] = useState(false);
    const [horas, setHoras] = useState(2);
    const [motivo, setMotivo] = useState('');
    const [ficheiro, setFicheiro] = useState<File | null>(null);
    const [aGuardar, setAGuardar] = useState(false);
    const tipo = activos.find(t => t.id === tipoId);
    // Os tipos podem chegar depois de o diálogo abrir: escolhe o tipo por omissão quando chegam.
    useEffect(() => {
        if (!tipoId && activos.length) setTipoId(activos.find(t => t.codigo === (dispensa ? 'D' : 'F'))?.id || activos[0].id);
    }, [activos, dispensa, tipoId]);
    const alternar = (id: string) => setEscolhidos(l => (l.includes(id) ? l.filter(x => x !== id) : dispensa ? [id] : [...l, id]));
    const guardar = async () => {
        setAGuardar(true);
        const ok = await executar(async () => {
            if (ficheiro && escolhidos.length !== 1) throw new Error('O anexo só pode ser usado com um funcionário de cada vez.');
            const documentoId = escolhidos.length === 1 ? await anexar(escolhidos[0], ficheiro, `Justificação ${tipo?.nome || ''} ${inicio}`, actor) : null;
            const r = await ServicoTempoRH.registarAusencias({ funcionarios: escolhidos, tipo_id: tipoId, data_inicio: inicio, data_fim: porHoras ? inicio : fim, horas: porHoras ? horas : 0, motivo, documento_id: documentoId, pedido_dispensa: dispensa }, actor);
            if (r.estado === 'pendente' && !dispensa) toast({ title: 'Ficou pendente', description: 'Este tipo exige documento: anexe-o e aprove a ausência.' });
        }, dispensa ? 'Pedido de dispensa registado (pendente de aprovação)' : 'Ausência registada');
        setAGuardar(false);
        if (ok) { onSaved(); onClose(); }
    };
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{dispensa ? 'Pedido de dispensa' : 'Adicionar falta / ausência'}</DialogTitle>
                    <DialogDescription>{dispensa ? 'Fica pendente até ser aprovado; depois emite-se a dispensa em PDF e a ausência entra no livro de ponto.' : 'Escolha um ou vários funcionários (faltas em massa). Os tipos que exigem documento ficam pendentes até ter o anexo.'}</DialogDescription>
                </DialogHeader>
                <div>
                    <Label className="text-xs font-bold">Funcionário(s) — {escolhidos.length} escolhido(s)</Label>
                    <div className="mt-1 grid max-h-40 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2 dark:border-slate-800">
                        {funcionarios.map(f => (
                            <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                                <input type="checkbox" checked={escolhidos.includes(f.id)} onChange={() => alternar(f.id)} /> {f.nome}
                            </label>
                        ))}
                    </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <Label className="text-xs font-bold">Tipo</Label>
                        <Select value={tipoId} onValueChange={setTipoId}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="Escolha" /></SelectTrigger>
                            <SelectContent>{activos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
                        </Select>
                        {tipo && <p className="mt-1 text-[11px] text-slate-500">{tipo.justificada ? 'Justificada' : 'Injustificada'} · {tipo.remunerada ? 'remunerada' : 'não remunerada'} · {tipo.desconta_salario ? 'desconta no salário' : 'não desconta'}{tipo.exige_documento ? ' · exige documento' : ''}</p>}
                    </div>
                    <label className="flex items-center gap-2 pt-6 text-xs font-bold"><Switch checked={porHoras} onCheckedChange={setPorHoras} /> Ausência de algumas horas</label>
                    <div><Label className="text-xs font-bold">{porHoras ? 'Dia' : 'Início'}</Label><Input className="mt-1" type="date" value={inicio} onChange={e => { setInicio(e.target.value); if (e.target.value > fim) setFim(e.target.value); }} /></div>
                    {porHoras
                        ? <div><Label className="text-xs font-bold">Horas</Label><Input className="mt-1" type="number" min={0.5} step={0.5} value={horas} onChange={e => setHoras(Number(e.target.value))} /></div>
                        : <div><Label className="text-xs font-bold">Fim</Label><Input className="mt-1" type="date" value={fim} min={inicio} onChange={e => setFim(e.target.value)} /></div>}
                    <div className="sm:col-span-2"><Label className="text-xs font-bold">Motivo</Label><Textarea className="mt-1" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} /></div>
                    <div className="sm:col-span-2"><Label className="text-xs font-bold">Anexo (atestado, justificação) — opcional</Label><Input className="mt-1" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setFicheiro(e.target.files?.[0] || null)} /></div>
                </div>
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={aGuardar || !escolhidos.length} onClick={() => void guardar()}>{aGuardar ? 'A guardar…' : 'Registar'}</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoAnular({ ausencia, actor, onClose, onSaved }: Base & { ausencia: AusenciaRH }) {
    const [motivo, setMotivo] = useState('');
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Retirar ausência</DialogTitle><DialogDescription>O registo não é apagado: fica anulado com o motivo e o seu nome. O desconto desaparece no próximo cálculo.</DialogDescription></DialogHeader>
                <Textarea rows={3} placeholder="Motivo da anulação" value={motivo} onChange={e => setMotivo(e.target.value)} />
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button variant="destructive" onClick={() => void executar(() => ServicoTempoRH.anularAusencia(ausencia, motivo, actor), 'Ausência anulada').then(ok => { if (ok) { onSaved(); onClose(); } })}>Anular</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoJustificar({ ausencia, tipos, actor, onClose, onSaved }: Base & { ausencia: AusenciaRH; tipos: TipoAusencia[] }) {
    const justificados = tipos.filter(t => t.justificada && t.activo !== 0 && !t.desconta_ferias);
    const [tipoId, setTipoId] = useState(justificados[0]?.id || '');
    const [motivo, setMotivo] = useState(ausencia.motivo || '');
    const [ficheiro, setFicheiro] = useState<File | null>(null);
    const guardar = () => executar(async () => {
        const documentoId = await anexar(ausencia.funcionario_id, ficheiro, `Justificação de falta ${ausencia.data_inicio}`, actor);
        await ServicoTempoRH.justificarAusencia(ausencia, tipoId, documentoId, motivo, actor);
    }, 'Falta justificada').then(ok => { if (ok) { onSaved(); onClose(); } });
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Justificar falta</DialogTitle><DialogDescription>Converte a falta injustificada numa justificada (com ou sem remuneração, conforme o tipo) e guarda o comprovativo.</DialogDescription></DialogHeader>
                <Select value={tipoId} onValueChange={setTipoId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{justificados.map(t => <SelectItem key={t.id} value={t.id}>{t.nome} {t.remunerada ? '(remunerada)' : '(sem remuneração)'}</SelectItem>)}</SelectContent>
                </Select>
                <Textarea rows={2} placeholder="Motivo" value={motivo} onChange={e => setMotivo(e.target.value)} />
                <Input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setFicheiro(e.target.files?.[0] || null)} />
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => void guardar()}>Justificar</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
