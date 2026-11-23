import { useState } from 'react';
import { Button } from '@/componentes/ui/button';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Loader2, Radar } from 'lucide-react';
import { executar } from '@/componentes/rh/comum-rh';
import { SeloScreening, dataHoraPt, type LinhaCompliance } from './comum-compliance';
import { ROTULO_FONTE_LISTA, ROTULO_PAPEL, ROTULO_RESULTADO, type Candidato, type PessoaPesquisa, type ResultadoFonte } from '@/bibliotecas/compliance/screening';
import type { ClienteKyc } from '@/bibliotecas/compliance/kyc';
import { ROTULO_MOTIVO_SCREENING, ServicoScreening, lerResultados, type DadosScreening } from '@/servicos/compliance/ServicoScreening';
import type { ActorCompliance } from '@/servicos/compliance/ServicoCompliance';
import { cn } from '@/bibliotecas/utils';

const COR_RESULTADO: Record<ResultadoFonte, string> = {
    NO_MATCH: 'text-emerald-700 dark:text-emerald-400', POTENTIAL_MATCH: 'text-amber-700 dark:text-amber-300', NOT_CHECKED: 'text-slate-500', ERROR: 'text-red-700 dark:text-red-300',
};

export function ScreeningCliente({ linha, scr, actor, registar, decidir, aoMudar }: {
    linha: LinhaCompliance; scr: DadosScreening; actor: ActorCompliance | null; registar: boolean; decidir: boolean; aoMudar: () => void;
}) {
    const [aExecutar, setAExecutar] = useState(false);
    const [decisao, setDecisao] = useState<{ candidato: Candidato; pessoa: PessoaPesquisa } | null>(null);
    const { ultimo, estado, pendentes } = linha.screening;
    const resultados = ultimo ? lerResultados(ultimo) : [];
    const decisoes = scr.decisoes.filter(d => d.client_id === linha.cliente.id);
    const historico = scr.screenings.filter(s => s.client_id === linha.cliente.id);

    const executarAgora = async () => {
        if (!actor) return;
        setAExecutar(true);
        await executar(() => ServicoScreening.executar(linha.cliente as unknown as ClienteKyc, linha.perfil?.beneficiario_efectivo, scr, 'manual', actor), 'Screening registado');
        setAExecutar(false);
        aoMudar();
    };

    return (
        <section id="screening" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="flex min-w-0 items-center gap-2.5">
                    <Radar className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
                    <div className="min-w-0">
                        <h2 className="text-base font-bold">Screening PEP e sanções</h2>
                        <p className="text-[13px] text-slate-500 dark:text-slate-400">{ultimo ? `Último: ${dataHoraPt(ultimo.criado_em)} · ${ultimo.criado_por_nome || '—'} · ${ROTULO_MOTIVO_SCREENING[ultimo.motivo]}` : 'Ainda não executado'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <SeloScreening estado={estado} />
                    {registar && <Button size="sm" onClick={executarAgora} disabled={aExecutar}>{aExecutar && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{ultimo ? 'Repetir' : 'Executar'}</Button>}
                </div>
            </div>
            <div className="space-y-4 p-5">
                {estado === 'confirmada' && (
                    <p className="rounded-xl bg-red-600 p-3 text-sm font-semibold text-white">Correspondência confirmada com lista de sanções. Não conceder crédito nem movimentar fundos; aplicar as medidas restritivas e tratar a comunicação às autoridades em separado.</p>
                )}
                {estado === 'desactualizado' && <p className="text-xs text-sky-700 dark:text-sky-300">As listas mudaram depois deste screening: repita-o.</p>}
                {!ultimo ? <p className="text-sm text-slate-500">Sem screening. Enquanto não for feito, conta como «não verificado» na avaliação de risco.</p> : (
                    <div className="space-y-3">
                        {resultados.map(r => (
                            <div key={`${r.pessoa.papel}:${r.pessoa.nome}`} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                                <div className="mb-1.5 text-sm"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">{ROTULO_PAPEL[r.pessoa.papel]}</span> · <strong>{r.pessoa.nome}</strong></div>
                                <ul className="grid gap-1 sm:grid-cols-3">
                                    {r.fontes.map(f => (
                                        <li key={f.fonte} className="text-xs" title={f.nota || undefined}>
                                            <span className="text-slate-500">{ROTULO_FONTE_LISTA[f.fonte]}:</span> <strong className={COR_RESULTADO[f.resultado]}>{ROTULO_RESULTADO[f.resultado]}</strong>
                                            {f.versao?.dataLista && <span className="text-slate-400"> (lista {f.versao.dataLista.split('-').reverse().join('/')})</span>}
                                            {f.nota && <span className="block text-[11px] text-slate-500">{f.nota}</span>}
                                        </li>
                                    ))}
                                </ul>
                                {r.fontes.flatMap(f => f.candidatos).map(c => {
                                    const pendente = pendentes.some(p => p.fonte === c.fonte && p.ref === c.ref && p.pessoa.nome === r.pessoa.nome);
                                    const decidida = decisoes.find(d => d.fonte === c.fonte && d.ref === c.ref);
                                    return (
                                        <div key={`${c.fonte}:${c.ref}`} className={cn('mt-2 rounded-lg border p-2.5 text-xs', pendente ? 'border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-800')}>
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span><strong className="text-sm">{c.nomeLista}</strong> · {ROTULO_FONTE_LISTA[c.fonte]} {c.ref} · <span className="font-mono">{c.pontuacao}%</span></span>
                                                {pendente && decidir && <Button size="sm" variant="outline" onClick={() => setDecisao({ candidato: c, pessoa: r.pessoa })}>Decidir</Button>}
                                                {pendente && !decidir && <span className="font-semibold text-amber-700">Por decidir</span>}
                                            </div>
                                            <p className="mt-1 text-slate-600 dark:text-slate-400">{c.motivos.join(' · ')}</p>
                                            <p className="text-slate-500">
                                                {c.programa ? `Programa/regime: ${c.programa}` : ''}{c.nascimentos.length ? ` · Nascimento: ${c.nascimentos.join(', ')}` : ''}{c.nacionalidades.length ? ` · ${c.nacionalidades.join(', ')}` : ''}
                                            </p>
                                            {decidida && <p className={cn('mt-1 font-semibold', decidida.decisao === 'confirmada' ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-400')}>
                                                {decidida.decisao === 'confirmada' ? 'Confirmada' : 'Falso positivo'} por {decidida.decidido_por_nome}, {dataHoraPt(decidida.decidido_em)}: <span className="font-normal">{decidida.fundamento}</span>
                                            </p>}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                )}
                {historico.length > 1 && (
                    <details className="text-xs text-slate-600 dark:text-slate-400">
                        <summary className="cursor-pointer font-semibold">Histórico ({historico.length} screenings)</summary>
                        <ul className="mt-1 space-y-0.5">{historico.map(s => <li key={s.id}>{dataHoraPt(s.criado_em)} · {ROTULO_MOTIVO_SCREENING[s.motivo]} · {ROTULO_RESULTADO[s.resultado]} · {s.criado_por_nome}</li>)}</ul>
                    </details>
                )}
            </div>
            {decisao && actor && ultimo && (
                <DialogoDecidir candidato={decisao.candidato} pessoa={decisao.pessoa} onClose={() => setDecisao(null)}
                    onSave={(d, f) => ServicoScreening.decidir({ screening: ultimo, candidato: decisao.candidato, pessoa: decisao.pessoa, decisao: d, fundamento: f, decisoes: scr.decisoes, nomeCliente: String(linha.cliente.name) }, actor)}
                    aoGuardar={aoMudar} />
            )}
        </section>
    );
}

function DialogoDecidir({ candidato: c, pessoa, onClose, onSave, aoGuardar }: {
    candidato: Candidato; pessoa: PessoaPesquisa; onClose: () => void; aoGuardar: () => void; onSave: (d: 'falso_positivo' | 'confirmada', fundamento: string) => Promise<unknown>;
}) {
    const [fundamento, setFundamento] = useState('');
    const [aGuardar, setAGuardar] = useState(false);
    const decidir = async (d: 'falso_positivo' | 'confirmada') => {
        setAGuardar(true);
        const ok = await executar(() => onSave(d, fundamento), d === 'confirmada' ? 'Correspondência confirmada' : 'Registado como falso positivo');
        setAGuardar(false);
        if (ok) { aoGuardar(); onClose(); }
    };
    const valido = fundamento.trim().length >= 15;
    return (
        <Dialog open onOpenChange={x => !x && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Decidir possível correspondência</DialogTitle>
                    <DialogDescription>{ROTULO_PAPEL[pessoa.papel]} «{pessoa.nome}»{pessoa.nascimento ? `, nascido(a) em ${pessoa.nascimento.split('-').reverse().join('/')}` : ''} ↔ «{c.nomeLista}» ({ROTULO_FONTE_LISTA[c.fonte]} {c.ref}).</DialogDescription>
                </DialogHeader>
                <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                    <p><strong>Motivos:</strong> {c.motivos.join(' · ')}</p>
                    {c.nascimentos.length > 0 && <p><strong>Nascimento na lista:</strong> {c.nascimentos.join(', ')}</p>}
                    {c.nacionalidades.length > 0 && <p><strong>Nacionalidade na lista:</strong> {c.nacionalidades.join(', ')}</p>}
                    {c.programa && <p><strong>Programa/regime:</strong> {c.programa}</p>}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">Compare data de nascimento, nacionalidade, documento e outros dados. Semelhança de nomes, por si só, não confirma nada. Um falso positivo não volta a ser pedido para este nome e esta entrada.</p>
                <div className="space-y-1"><Label className="text-xs">Fundamento</Label><Textarea rows={3} value={fundamento} onChange={e => setFundamento(e.target.value)} placeholder="Dados comparados e conclusão (ex.: data de nascimento e nacionalidade diferentes)" /></div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button variant="outline" className="border-red-300 text-red-700" disabled={aGuardar || !valido} onClick={() => decidir('confirmada')}>Confirmar correspondência</Button>
                    <Button disabled={aGuardar || !valido} onClick={() => decidir('falso_positivo')}>É falso positivo</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
