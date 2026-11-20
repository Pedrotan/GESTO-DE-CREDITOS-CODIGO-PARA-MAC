import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileDown, MessageSquareWarning, XCircle } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { ServicoPortalRH } from '@/servicos/rh/ServicoPortalRH';
import { ServicoSalariosRH, ROTULO_TIPO, type LinhaReciboRH } from '@/servicos/rh/ServicoSalariosRH';
import { ServicoReclamacoesRH, type ReclamacaoRH } from '@/servicos/rh/ServicoReclamacoesRH';
import { ServicoRecebimentoRH, ultimaPorRecibo, type RecebimentoRH } from '@/servicos/rh/ServicoRecebimentoRH';
import { gerarReciboPdf, periodoPt } from '@/bibliotecas/rh/pdf-rh';
import { useData } from '@/contextos/ContextoDados';
import type { ActorRH, Funcionario } from '@/servicos/rh/ServicoRH';
import { dataPt, executar, kz, useCarregar, Vazio } from './comum-rh';

type ReciboPortal = Awaited<ReturnType<typeof ServicoPortalRH.minhaFolhaCorreccao>>[number];
const ESTADO_RECLAMACAO = {
    pendente: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    aceite: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    recusada: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
} as const;
const ROTULO_RECLAMACAO = { pendente: 'Por responder', aceite: 'Aceite', recusada: 'Recusada' } as const;

/**
 * Folhas de salário no portal: a folha de correcção (calculada, por aprovar) para conferir e reclamar de um desconto,
 * as folhas finais (aprovadas) e as respostas do RH às reclamações.
 */
export function FolhasFuncionario({ f, actor, finais }: { f: Funcionario; actor: ActorRH; finais: ReciboPortal[] }) {
    const { companySettings } = useData();
    const dados = useCarregar(async () => {
        const [correccao, reclamacoes, recebimentos] = await Promise.all([ServicoPortalRH.minhaFolhaCorreccao(f.id), ServicoReclamacoesRH.doFuncionario(f.id), ServicoRecebimentoRH.doFuncionario(f.id)]);
        return { correccao, reclamacoes, recebimentos };
    }, { correccao: [] as ReciboPortal[], reclamacoes: [] as ReclamacaoRH[], recebimentos: [] as RecebimentoRH[] }, [f.id]);
    const recepcao = ultimaPorRecibo(dados.dados.recebimentos);
    const [naoRecebi, setNaoRecebi] = useState<ReciboPortal | null>(null);
    const [observacao, setObservacao] = useState('');
    const confirmarRecepcao = async (r: ReciboPortal, estado: 'recebido' | 'nao_recebido', obs?: string) => {
        const ok = await executar(() => ServicoRecebimentoRH.confirmar({ funcionario_id: f.id, recibo_id: r.id, processamento_id: r.processamento_id, estado, observacao: obs }, actor),
            estado === 'recebido' ? 'Recepção do salário confirmada' : 'Aviso enviado ao RH');
        if (ok) { setNaoRecebi(null); setObservacao(''); void dados.recarregar(); }
    };
    const [aberto, setAberto] = useState<string | null>(null);
    const linhas = useCarregar(() => (aberto ? ServicoSalariosRH.linhas(aberto) : Promise.resolve([] as LinhaReciboRH[])), [] as LinhaReciboRH[], [aberto]);
    const [reclamar, setReclamar] = useState<{ recibo: ReciboPortal; linha: LinhaReciboRH | null } | null>(null);
    const [motivo, setMotivo] = useState('');

    const pdf = (r: ReciboPortal) => void ServicoSalariosRH.linhas(r.id).then(l => gerarReciboPdf(r, l,
        { ano: r.ano, mes: r.mes, tipoRotulo: ROTULO_TIPO[r.tipo], estado: r.estado }, companySettings, actor.name));
    const enviar = async () => {
        if (!reclamar) return;
        const ok = await executar(() => ServicoReclamacoesRH.reclamar({
            funcionario_id: f.id, processamento_id: reclamar.recibo.processamento_id, recibo_id: reclamar.recibo.id,
            codigo: reclamar.linha?.codigo, descricao: reclamar.linha?.descricao, valor_minor: reclamar.linha?.valor_minor, motivo,
        }, actor), 'Reclamação enviada ao RH');
        if (ok) { setReclamar(null); setMotivo(''); void dados.recarregar(); }
    };
    const reclamacoesDe = (processamentoId: string) => dados.dados.reclamacoes.filter(x => x.processamento_id === processamentoId);

    return (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-black">As minhas folhas de salário</h2>

            {dados.dados.correccao.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                    <div className="flex items-start gap-2 text-sm">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <p><b>Folha de correcção.</b> O salário foi calculado mas ainda não foi aprovado. Confira os valores; se algum desconto estiver errado, carregue em <b>Reclamar</b> nessa linha.</p>
                    </div>
                    {dados.dados.correccao.map(r => (
                        <div key={r.id} className="mt-2 rounded-xl border border-amber-200 bg-white dark:border-amber-900/60 dark:bg-slate-900">
                            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                                <span><b>{periodoPt(r.ano, r.mes)}</b> · {ROTULO_TIPO[r.tipo]} · <span className="font-bold text-amber-700 dark:text-amber-300">por aprovar</span></span>
                                <span className="flex items-center gap-1 font-black">{kz(r.liquido_minor)}
                                    <Button size="icon" variant="ghost" title="Folha de correcção (PDF)" onClick={() => pdf(r)}><FileDown className="h-4 w-4" /></Button>
                                    <Button size="sm" variant="outline" onClick={() => setAberto(aberto === r.id ? null : r.id)}>
                                        {aberto === r.id ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />} Conferir
                                    </Button>
                                </span>
                            </div>
                            {aberto === r.id && (
                                <div className="border-t border-amber-100 px-3 py-2 dark:border-amber-900/50">
                                    <table className="w-full text-sm">
                                        <tbody>
                                            {linhas.dados.map(l => (
                                                <tr key={l.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                                                    <td className="py-1.5">{l.descricao}{l.quantidade !== 1 ? <span className="text-slate-500"> × {l.quantidade}</span> : null}</td>
                                                    <td className={`py-1.5 text-right font-bold tabular-nums ${l.tipo === 'desconto' ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-300'}`}>
                                                        {l.tipo === 'desconto' ? '−' : ''}{kz(l.valor_minor)}
                                                    </td>
                                                    <td className="w-28 py-1.5 text-right">
                                                        {l.tipo === 'desconto' && <Button size="sm" variant="ghost" className="h-7 text-amber-700 hover:bg-amber-50 dark:text-amber-300" onClick={() => setReclamar({ recibo: r, linha: l })}>
                                                            <MessageSquareWarning className="mr-1 h-3.5 w-3.5" /> Reclamar
                                                        </Button>}
                                                    </td>
                                                </tr>
                                            ))}
                                            {/* INSS e IRT não são linhas do recibo (são calculados sobre ele): também se pode reclamar deles. */}
                                            {([['INSS', 'Segurança Social (INSS)', r.inss_minor], ['IRT', 'Imposto sobre o rendimento (IRT)', r.irt_minor]] as const).filter(([, , v]) => v > 0).map(([codigo, descricao, valor]) => (
                                                <tr key={codigo} className="border-b border-slate-100 dark:border-slate-800">
                                                    <td className="py-1.5">{descricao}</td>
                                                    <td className="py-1.5 text-right font-bold tabular-nums text-red-600 dark:text-red-400">−{kz(valor)}</td>
                                                    <td className="w-28 py-1.5 text-right">
                                                        <Button size="sm" variant="ghost" className="h-7 text-amber-700 hover:bg-amber-50 dark:text-amber-300" onClick={() => setReclamar({ recibo: r, linha: { id: codigo, recibo_id: r.id, codigo, descricao, tipo: 'desconto', quantidade: 1, valor_minor: valor } as unknown as LinhaReciboRH })}>
                                                            <MessageSquareWarning className="mr-1 h-3.5 w-3.5" /> Reclamar
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr><td className="py-1.5 font-black">Líquido a receber</td><td className="py-1.5 text-right font-black">{kz(r.liquido_minor)}</td><td /></tr>
                                        </tbody>
                                    </table>
                                    <Button size="sm" variant="link" className="px-0 text-amber-700 dark:text-amber-300" onClick={() => setReclamar({ recibo: r, linha: null })}>Reclamar de outro valor</Button>
                                </div>
                            )}
                            {reclamacoesDe(r.processamento_id).length > 0 && (
                                <div className="border-t border-amber-100 px-3 py-2 text-xs dark:border-amber-900/50">
                                    {reclamacoesDe(r.processamento_id).map(x => <LinhaReclamacao key={x.id} r={x} />)}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <h3 className="mb-2 mt-4 text-sm font-black text-slate-600 dark:text-slate-300">Folhas finais (aprovadas)</h3>
            {finais.length === 0 ? <Vazio>Ainda não há folhas aprovadas.</Vazio> : finais.map(r => {
                const pago = r.estado === 'pago' || r.estado === 'fechado';
                const conf = recepcao.get(r.id);
                return (
                    <div key={r.id} className="mb-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                        <div className="flex items-center justify-between">
                            <span><b>{periodoPt(r.ano, r.mes)}</b> · {ROTULO_TIPO[r.tipo]} · <span className="text-emerald-700 dark:text-emerald-300">{r.estado}</span></span>
                            <span className="flex items-center gap-2 font-black">{kz(r.liquido_minor)}
                                <Button size="icon" variant="ghost" title="Folha final (PDF)" onClick={() => pdf(r)}><FileDown className="h-4 w-4" /></Button>
                            </span>
                        </div>
                        {/* Recepção do salário: só depois de o RH marcar como pago. */}
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            {!pago ? <span className="text-slate-500">Aprovado · aguarda pagamento</span>
                                : conf?.estado === 'recebido' ? <span className="flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Recepção confirmada em {dataPt(conf.criado_em)}</span>
                                    : <>
                                        {conf?.estado === 'nao_recebido' && <span className="flex items-center gap-1 font-bold text-red-600"><XCircle className="h-3.5 w-3.5" /> Avisou que não recebeu ({dataPt(conf.criado_em)})</span>}
                                        <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700" onClick={() => void confirmarRecepcao(r, 'recebido')}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Confirmar recepção</Button>
                                        {conf?.estado !== 'nao_recebido' && <Button size="sm" variant="outline" className="h-7 border-red-200 text-red-700 hover:bg-red-50" onClick={() => setNaoRecebi(r)}>Não recebi</Button>}
                                    </>}
                        </div>
                    </div>
                );
            })}

            {dados.dados.reclamacoes.some(x => !dados.dados.correccao.some(r => r.processamento_id === x.processamento_id)) && (
                <>
                    <h3 className="mb-2 mt-4 text-sm font-black text-slate-600 dark:text-slate-300">As minhas reclamações</h3>
                    {dados.dados.reclamacoes.filter(x => !dados.dados.correccao.some(r => r.processamento_id === x.processamento_id)).map(x => <LinhaReclamacao key={x.id} r={x} />)}
                </>
            )}

            <Dialog open={Boolean(naoRecebi)} onOpenChange={o => { if (!o) setNaoRecebi(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Não recebi o salário</DialogTitle>
                        <DialogDescription>{naoRecebi ? `${periodoPt(naoRecebi.ano, naoRecebi.mes)} · ${kz(naoRecebi.liquido_minor)}` : ''}. O RH recebe o aviso no processamento do mês.</DialogDescription>
                    </DialogHeader>
                    <Label htmlFor="obs-recepcao">O que aconteceu?</Label>
                    <Textarea id="obs-recepcao" rows={3} value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex.: o valor ainda não entrou na minha conta do BAI." />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setNaoRecebi(null)}>Cancelar</Button>
                        <Button variant="destructive" disabled={observacao.trim().length < 5} onClick={() => naoRecebi && void confirmarRecepcao(naoRecebi, 'nao_recebido', observacao)}>Enviar aviso</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(reclamar)} onOpenChange={o => { if (!o) setReclamar(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reclamar da folha de correcção</DialogTitle>
                        <DialogDescription>
                            {reclamar?.linha ? `${reclamar.linha.descricao}: ${kz(reclamar.linha.valor_minor)}` : 'Outro valor da folha'} · {reclamar ? periodoPt(reclamar.recibo.ano, reclamar.recibo.mes) : ''}. O RH responde antes de aprovar o salário.
                        </DialogDescription>
                    </DialogHeader>
                    <Label htmlFor="motivo-reclamacao">Porque está errado?</Label>
                    <Textarea id="motivo-reclamacao" rows={4} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: estive presente nos dias 3 e 4; as faltas descontadas não estão certas." />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReclamar(null)}>Cancelar</Button>
                        <Button className="bg-amber-600 hover:bg-amber-700" disabled={motivo.trim().length < 10} onClick={() => void enviar()}>Enviar reclamação</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}

function LinhaReclamacao({ r }: { r: ReclamacaoRH }) {
    return (
        <div className="mb-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span><b>{r.descricao || 'Reclamação'}</b>{r.valor_minor ? ` · ${kz(r.valor_minor)}` : ''} · {dataPt(r.criado_em)}</span>
                <span className={`rounded-full px-2 py-0.5 font-bold ${ESTADO_RECLAMACAO[r.estado]}`}>{ROTULO_RECLAMACAO[r.estado]}</span>
            </div>
            <p className="mt-0.5 text-slate-600 dark:text-slate-300">{r.motivo}</p>
            {r.resposta && <p className="mt-1 rounded bg-slate-50 px-2 py-1 dark:bg-slate-800"><b>Resposta do RH</b> ({r.respondido_por_nome}): {r.resposta}</p>}
        </div>
    );
}
