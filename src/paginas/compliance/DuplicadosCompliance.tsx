import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Loader2 } from 'lucide-react';
import { Vazio, dataPt, executar } from '@/componentes/rh/comum-rh';
import { NavegacaoCompliance, dataHoraPt, useActorCompliance, useCompliance } from '@/componentes/compliance/comum-compliance';
import { ROTULO_DECISAO_DUPLICADO, ROTULO_MOTIVO, type DecisaoDuplicado, type GrupoDuplicado } from '@/bibliotecas/compliance/duplicados';
import { mascararDocumento } from '@/bibliotecas/compliance/kyc';
import { ServicoCompliance, lerJson } from '@/servicos/compliance/ServicoCompliance';
import { cn } from '@/bibliotecas/utils';

export default function DuplicadosCompliance() {
    const comp = useCompliance();
    const { actor, decidir } = useActorCompliance();
    const [rever, setRever] = useState<GrupoDuplicado | null>(null);
    const cliente = (id: string) => comp.clientes.find(c => c.id === id);

    return (
        <MainLayout title="Compliance" subtitle="Possíveis duplicados e dados partilhados entre clientes">
            <NavegacaoCompliance />
            <div className="mb-4">
                <h1 className="text-2xl font-extrabold">Possíveis duplicados</h1>
                <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
                    Clientes com o mesmo BI/NIF, IBAN, telefone, email ou nome e data de nascimento. Pode ser um homónimo, uma família que partilha o contacto
                    ou um erro de cadastro: cada grupo é revisto e a conclusão fica registada. Enquanto não for esclarecido, conta como sinal de risco na avaliação.
                </p>
            </div>

            {comp.aCarregar && !comp.linhas.length ? <div className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>
                : !comp.gruposPorRever.length ? <Vazio>Não há possíveis duplicados por rever.</Vazio> : (
                <div className="space-y-3">
                    {comp.gruposPorRever.map(g => (
                        <article key={g.chave} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold', g.gravidade === 'alta' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200')}>
                                        {g.gravidade === 'alta' ? 'Prioridade alta' : 'Prioridade média'}
                                    </span>
                                    <h2 className="text-sm font-bold">{ROTULO_MOTIVO[g.motivo]} <span className="font-mono font-normal text-slate-500">{g.valor}</span></h2>
                                </div>
                                {decidir && <Button size="sm" variant="outline" onClick={() => setRever(g)}>Rever</Button>}
                            </div>
                            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {g.clientes.map(id => {
                                    const c = cliente(id);
                                    return (
                                        <li key={id} className="rounded-xl border border-slate-100 p-2.5 text-sm dark:border-slate-800">
                                            <Link to={`/compliance/clientes/${id}`} className="font-semibold hover:underline">{c?.name || 'Cliente'}</Link>
                                            <div className="text-xs text-slate-500">{c?.clientNumber ? `N.º ${c.clientNumber} · ` : ''}<span className="font-mono">{mascararDocumento(c?.nif)}</span></div>
                                            <div className="text-xs text-slate-500">Nascimento {dataPt(c?.birthDate)} · cadastro {dataPt(c?.createdAt ? String(c.createdAt) : null)}</div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </article>
                    ))}
                </div>
            )}

            {comp.dados.revisoes.length > 0 && (
                <section className="mt-8">
                    <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Revisões registadas</h2>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800">
                                <tr><th className="px-4 py-2.5">Data</th><th className="px-3 py-2.5">Motivo</th><th className="px-3 py-2.5">Clientes</th><th className="px-3 py-2.5">Conclusão</th><th className="px-3 py-2.5">Por</th></tr>
                            </thead>
                            <tbody>
                                {comp.dados.revisoes.map(r => (
                                    <tr key={r.id} className="border-b border-slate-50 align-top last:border-0 dark:border-slate-800/60">
                                        <td className="whitespace-nowrap px-4 py-2.5 text-xs">{dataHoraPt(r.decidido_em)}</td>
                                        <td className="px-3 py-2.5 text-xs">{ROTULO_MOTIVO[r.motivo as keyof typeof ROTULO_MOTIVO] || r.motivo}</td>
                                        <td className="px-3 py-2.5 text-xs">{lerJson<string[]>(r.clientes, []).map(id => cliente(id)?.name || 'Cliente removido').join(', ')}</td>
                                        <td className="px-3 py-2.5 text-xs"><strong>{ROTULO_DECISAO_DUPLICADO[r.decisao]}</strong><div className="text-slate-500">{r.justificacao}</div></td>
                                        <td className="px-3 py-2.5 text-xs">{r.decidido_por_nome}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {rever && actor && <DialogoRever grupo={rever} nomes={rever.clientes.map(id => cliente(id)?.name || id)} onClose={() => setRever(null)}
                onSave={(d, j) => ServicoCompliance.reverDuplicado(rever, rever.clientes.map(id => cliente(id)?.name || id), d, j, actor)} aoGuardar={() => void comp.recarregar()} />}
        </MainLayout>
    );
}

function DialogoRever({ grupo, nomes, onClose, onSave, aoGuardar }: {
    grupo: GrupoDuplicado; nomes: string[]; onClose: () => void; aoGuardar: () => void; onSave: (d: DecisaoDuplicado, j: string) => Promise<unknown>;
}) {
    const [decisao, setDecisao] = useState<DecisaoDuplicado | ''>('');
    const [justificacao, setJustificacao] = useState('');
    const [aGuardar, setAGuardar] = useState(false);
    const guardar = async () => {
        if (!decisao) return;
        setAGuardar(true);
        const ok = await executar(() => onSave(decisao, justificacao), 'Revisão registada');
        setAGuardar(false);
        if (ok) { aoGuardar(); onClose(); }
    };
    const exigeCorreccao = decisao === 'mesma_pessoa' || decisao === 'erro_cadastro';
    return (
        <Dialog open onOpenChange={x => !x && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Rever possível duplicado</DialogTitle>
                    <DialogDescription>{ROTULO_MOTIVO[grupo.motivo]}: {nomes.join(', ')}. A conclusão fica registada e não se altera.</DialogDescription>
                </DialogHeader>
                <div className="space-y-1"><Label className="text-xs">Conclusão</Label>
                    <Select value={decisao || undefined} onValueChange={v => setDecisao(v as DecisaoDuplicado)}>
                        <SelectTrigger><SelectValue placeholder="Escolha a conclusão" /></SelectTrigger>
                        <SelectContent>{(Object.keys(ROTULO_DECISAO_DUPLICADO) as DecisaoDuplicado[]).map(d => <SelectItem key={d} value={d}>{ROTULO_DECISAO_DUPLICADO[d]}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                {exigeCorreccao && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Corrija depois o cadastro (unir ou corrigir as fichas). Até lá, o grupo continua a contar como sinal de risco.</p>}
                {decisao === 'suspeita_fraude' && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">A suspeita continua a contar como sinal de risco. A abertura de investigação chega com a gestão de casos (fase seguinte).</p>}
                <div className="space-y-1"><Label className="text-xs">Justificação</Label><Textarea rows={3} value={justificacao} onChange={e => setJustificacao(e.target.value)} placeholder="O que foi confirmado e como (documentos vistos, contacto com o cliente…)" /></div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={guardar} disabled={aGuardar || !decisao || justificacao.trim().length < 10}>Registar revisão</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
