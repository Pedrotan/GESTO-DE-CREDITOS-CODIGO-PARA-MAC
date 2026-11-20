// Menu de acções da célula (F1.8), diálogos de falta, motivo e observação, «Resolver pendentes» (F1.14) e
// confirmação das acções em massa (F2.4).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleSlash, Clock, FileText, History, MessageSquare, Pencil, Trash2, Eye } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { cn } from '@/bibliotecas/utils';
import type { DiaPonto } from '@/bibliotecas/rh/ponto-calculo';
import type { TipoAusencia } from '@/bibliotecas/rh/ponto';
import type { LinhaGrelha } from '@/bibliotecas/rh/ponto-grelha';
import type { AcaoCelula } from '@/servicos/rh/ServicoPontoRH';
import { lerFicheiro } from '@/componentes/rh/comum-rh';
import { NOME_ESTADO } from './ponto-ui';

const dataPt = (d: string) => d.split('-').reverse().join('/');

export type AccaoMenu = AcaoCelula | 'editar' | 'falta_dialogo' | 'observacao' | 'historico' | 'detalhes';

/** Menu flutuante junto à célula (dias passados e hoje; nos futuros só dispensa e licença; mês fechado só consulta). */
export function MenuCelula({ alvo, dia, nome, editavel, onEscolher, onFechar }: {
    alvo: HTMLElement; dia: DiaPonto; nome: string; editavel: boolean; onEscolher: (accao: AccaoMenu) => void; onFechar: () => void;
}) {
    const caixa = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    useLayoutEffect(() => {
        const r = alvo.getBoundingClientRect();
        const largura = 248;
        const altura = caixa.current?.offsetHeight || 320;
        const x = Math.min(window.innerWidth - largura - 8, Math.max(8, r.left + r.width / 2 - largura / 2));
        const y = r.bottom + altura + 8 > window.innerHeight ? Math.max(8, r.top - altura - 4) : r.bottom + 4;
        setPos({ x, y });
    }, [alvo]);
    useEffect(() => {
        const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node) && e.target !== alvo) onFechar(); };
        const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { onFechar(); alvo.focus(); } };
        window.addEventListener('mousedown', fora);
        window.addEventListener('keydown', tecla);
        return () => { window.removeEventListener('mousedown', fora); window.removeEventListener('keydown', tecla); };
    }, [alvo, onFechar]);

    const futuro = dia.estado === 'FUTURO';
    const descanso = dia.estado === 'FR' || dia.estado === 'FS';
    const itens: Array<{ id: AccaoMenu; texto: string; icone: typeof Clock; tecla?: string; cor?: string; mostra: boolean }> = [
        { id: 'presente', texto: 'Marcar presente (horário previsto)', icone: CheckCircle2, tecla: 'P', cor: 'text-emerald-600', mostra: editavel && !futuro && !descanso },
        { id: 'editar', texto: 'Registar / editar horas', icone: Pencil, tecla: 'E', mostra: editavel && !futuro },
        { id: 'falta', texto: 'Lançar falta injustificada', icone: CircleSlash, tecla: 'F', cor: 'text-red-600', mostra: editavel && !futuro && !descanso },
        { id: 'falta_dialogo', texto: 'Lançar falta justificada ou de meio dia…', icone: FileText, tecla: 'J', cor: 'text-amber-600', mostra: editavel && !futuro && !descanso },
        { id: 'dispensa', texto: 'Lançar dispensa', icone: Clock, cor: 'text-violet-600', mostra: editavel && !descanso },
        { id: 'licenca', texto: 'Lançar licença', icone: Clock, cor: 'text-pink-600', mostra: editavel && !descanso },
        { id: 'observacao', texto: 'Adicionar observação', icone: MessageSquare, mostra: editavel && !futuro },
        { id: 'limpar', texto: 'Limpar o dia…', icone: Trash2, tecla: 'Del', cor: 'text-red-600', mostra: editavel && !futuro },
        { id: 'detalhes', texto: 'Ver detalhes', icone: Eye, mostra: !editavel || futuro },
        { id: 'historico', texto: 'Ver histórico de alterações', icone: History, mostra: true },
    ];
    return (
        <div ref={caixa} role="menu" style={{ left: pos.x, top: pos.y, width: 248 }}
            className="fixed z-[60] rounded-xl border border-slate-200 bg-white p-1.5 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <p className="px-2 pb-1.5 pt-0.5 text-[11px] font-bold text-slate-500">{nome} · {dataPt(dia.data)} · {NOME_ESTADO[dia.estado] || dia.estado}</p>
            {itens.filter(i => i.mostra).map(i => (
                <button key={i.id} type="button" role="menuitem" onClick={() => onEscolher(i.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
                    <i.icone className={cn('h-4 w-4 shrink-0', i.cor)} />
                    <span className="flex-1">{i.texto}</span>
                    {i.tecla && <kbd className="rounded border px-1 text-[10px] text-slate-400">{i.tecla}</kbd>}
                </button>
            ))}
        </div>
    );
}

/** Falta justificada (tipo à escolha) ou falta de meio dia, com motivo e documento opcional. */
export function DialogoFalta({ dia, nome, tipos, permiteAnexo, onConfirmar, onFechar }: {
    dia: DiaPonto; nome: string; tipos: TipoAusencia[]; permiteAnexo: boolean;
    onConfirmar: (v: { acao: 'falta' | 'falta_justificada'; tipoId?: string; meioDia: 'manha' | 'tarde' | null; motivo: string; anexo: { nome: string; dataUrl: string } | null }) => Promise<boolean>;
    onFechar: () => void;
}) {
    const justificadas = tipos.filter(t => t.activo !== 0 && t.justificada && !t.desconta_ferias && !['D', 'L'].includes(t.codigo));
    const [tipo, setTipo] = useState<string>(justificadas.find(t => t.codigo === 'FJ')?.id || justificadas[0]?.id || '');
    const [injustificada, setInjustificada] = useState(false);
    const [periodo, setPeriodo] = useState<'dia' | 'manha' | 'tarde'>('dia');
    const [motivo, setMotivo] = useState('');
    const [anexo, setAnexo] = useState<{ nome: string; dataUrl: string } | null>(null);
    const [aGuardar, setAGuardar] = useState(false);
    return (
        <Dialog open onOpenChange={v => !v && onFechar()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Lançar falta</DialogTitle><DialogDescription>{nome} · {dataPt(dia.data)}</DialogDescription></DialogHeader>
                <div className="grid gap-3">
                    <div className="flex gap-2">
                        <Button type="button" size="sm" variant={!injustificada ? 'default' : 'outline'} onClick={() => setInjustificada(false)}>Justificada</Button>
                        <Button type="button" size="sm" variant={injustificada ? 'default' : 'outline'} onClick={() => setInjustificada(true)}>Injustificada</Button>
                    </div>
                    {!injustificada && (
                        <div><Label className="text-xs font-bold">Tipo</Label>
                            <Select value={tipo} onValueChange={setTipo}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>{justificadas.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}{t.desconta_salario ? ' (desconta)' : ''}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    )}
                    <div><Label className="text-xs font-bold">Período</Label>
                        <Select value={periodo} onValueChange={v => setPeriodo(v as typeof periodo)}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="dia">Dia inteiro</SelectItem><SelectItem value="manha">Meio dia (manhã)</SelectItem><SelectItem value="tarde">Meio dia (tarde)</SelectItem></SelectContent>
                        </Select>
                    </div>
                    <div><Label className="text-xs font-bold">Motivo</Label><Textarea className="mt-1" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: consulta médica com declaração" /></div>
                    {permiteAnexo && (
                        <div><Label className="text-xs font-bold">Documento (opcional)</Label>
                            <Input className="mt-1" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={async e => { const ficheiro = e.target.files?.[0]; setAnexo(ficheiro ? { nome: ficheiro.name, dataUrl: await lerFicheiro(ficheiro) } : null); }} />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onFechar}>Cancelar</Button>
                    <Button disabled={aGuardar || (!injustificada && !tipo)} onClick={async () => {
                        setAGuardar(true);
                        const ok = await onConfirmar({ acao: injustificada ? 'falta' : 'falta_justificada', tipoId: injustificada ? undefined : tipo, meioDia: periodo === 'dia' ? null : periodo, motivo, anexo });
                        setAGuardar(false);
                        if (ok) onFechar();
                    }}>Lançar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Pede um texto (motivo obrigatório ou observação) antes de confirmar. */
export function DialogoTexto({ titulo, descricao, rotulo, inicial = '', obrigatorio = true, confirmar = 'Confirmar', perigo, onConfirmar, onFechar }: {
    titulo: string; descricao: string; rotulo: string; inicial?: string; obrigatorio?: boolean; confirmar?: string; perigo?: boolean;
    onConfirmar: (texto: string) => Promise<boolean>; onFechar: () => void;
}) {
    const [texto, setTexto] = useState(inicial);
    const [aGuardar, setAGuardar] = useState(false);
    const curto = obrigatorio && texto.trim().length < 5;
    return (
        <Dialog open onOpenChange={v => !v && onFechar()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{titulo}</DialogTitle><DialogDescription>{descricao}</DialogDescription></DialogHeader>
                <div><Label className="text-xs font-bold">{rotulo}</Label><Textarea autoFocus className="mt-1" rows={3} value={texto} onChange={e => setTexto(e.target.value)} /></div>
                {obrigatorio && <p className="text-xs text-slate-500">Obrigatório (pelo menos 5 caracteres): fica na auditoria.</p>}
                <DialogFooter>
                    <Button variant="outline" onClick={onFechar}>Cancelar</Button>
                    <Button variant={perigo ? 'destructive' : 'default'} disabled={aGuardar || curto} onClick={async () => { setAGuardar(true); const ok = await onConfirmar(texto.trim()); setAGuardar(false); if (ok) onFechar(); }}>{confirmar}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Lista de todos os dias «?» do mês filtrado, para resolver um a um ou de uma vez (F1.14). */
export function ResolverPendentes({ linhas, podeEditar, onAccao, onEditar, onFechar }: {
    linhas: LinhaGrelha[]; podeEditar: (l: LinhaGrelha) => boolean;
    onAccao: (celulas: Array<{ funcionarioId: string; data: string }>, acao: 'presente' | 'falta' | 'falta_dialogo') => Promise<void>;
    onEditar: (funcionarioId: string, data: string) => void; onFechar: () => void;
}) {
    const hoje = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
    const grupos = linhas.map(l => ({ l, dias: l.dias.filter(d => d.estado === 'SEM_REGISTO' && d.data < hoje) })).filter(g => g.dias.length);
    const total = grupos.reduce((s, g) => s + g.dias.length, 0);
    const [aCorrer, setACorrer] = useState(false);
    const correr = async (celulas: Array<{ funcionarioId: string; data: string }>, acao: 'presente' | 'falta' | 'falta_dialogo') => { setACorrer(true); await onAccao(celulas, acao); setACorrer(false); };
    return (
        <Dialog open onOpenChange={v => !v && onFechar()}>
            <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Resolver pendentes</DialogTitle>
                    <DialogDescription>{total ? `${total} dia(s) útil(eis) sem registo. «Sem registo» nunca desconta no salário: só a falta lançada desconta.` : 'Não há dias por resolver. 🎉'}</DialogDescription>
                </DialogHeader>
                <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
                    {grupos.map(({ l, dias }) => (
                        <div key={l.funcionario.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                            <p className="mb-2 font-bold">{l.funcionario.nome} <span className="text-xs font-normal text-slate-500">({dias.length})</span></p>
                            {dias.map(d => (
                                <div key={d.data} className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 py-1.5 text-sm dark:border-slate-800">
                                    <span className="w-28 font-semibold tabular-nums">{dataPt(d.data)}</span>
                                    {podeEditar(l) ? (
                                        <>
                                            <Button size="sm" variant="outline" disabled={aCorrer} onClick={() => void correr([{ funcionarioId: l.funcionario.id, data: d.data }], 'presente')}>Presente</Button>
                                            <Button size="sm" variant="outline" className="text-red-600" disabled={aCorrer} onClick={() => void correr([{ funcionarioId: l.funcionario.id, data: d.data }], 'falta')}>Falta</Button>
                                            <Button size="sm" variant="outline" className="text-amber-700" disabled={aCorrer} onClick={() => void correr([{ funcionarioId: l.funcionario.id, data: d.data }], 'falta_dialogo')}>Falta justif.</Button>
                                            <Button size="sm" variant="ghost" onClick={() => onEditar(l.funcionario.id, d.data)}>Editar horas</Button>
                                        </>
                                    ) : <span className="text-xs text-slate-400">Sem permissão para este departamento</span>}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onFechar}>Fechar</Button>
                    {total > 0 && <Button disabled={aCorrer} onClick={() => void correr(grupos.filter(g => podeEditar(g.l)).flatMap(g => g.dias.map(d => ({ funcionarioId: g.l.funcionario.id, data: d.data }))), 'presente')}>Marcar todos como presentes</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Barra que aparece com células seleccionadas (F2.4). */
export function BarraAccoesMassa({ quantidade, onAccao, onCancelar }: { quantidade: number; onAccao: (acao: AcaoCelula) => void; onCancelar: () => void }) {
    return (
        <div className="sticky bottom-3 z-40 mx-auto mt-3 flex w-fit flex-wrap items-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 py-2.5 shadow-xl dark:border-blue-900 dark:bg-slate-900">
            <span className="text-sm font-bold">{quantidade} célula(s) seleccionada(s)</span>
            <Button size="sm" variant="outline" onClick={() => onAccao('presente')}>Marcar presentes</Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={() => onAccao('falta')}>Lançar falta</Button>
            <Button size="sm" variant="outline" className="text-amber-700" onClick={() => onAccao('falta_justificada')}>Lançar falta justificada</Button>
            <Button size="sm" variant="outline" className="text-violet-700" onClick={() => onAccao('dispensa')}>Lançar dispensa</Button>
            <Button size="sm" variant="outline" onClick={() => onAccao('limpar')}>Limpar</Button>
            <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
        </div>
    );
}
