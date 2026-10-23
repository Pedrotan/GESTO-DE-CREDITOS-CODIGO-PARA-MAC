import { useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { FileDown } from 'lucide-react';
import { ServicoSalariosRH, ROTULO_TIPO } from '@/servicos/rh/ServicoSalariosRH';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import { gerarDeclaracaoPdf, gerarReciboPdf, periodoPt } from '@/bibliotecas/rh/pdf-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { useData } from '@/contextos/ContextoDados';
import { NavegacaoRH, dataPt, kz, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { toast } from '@/ganchos/usar-toast';
import { useBaseRH } from './FuncionariosRH';
import { LIGACOES_SALARIOS } from './ProcessamentoRH';

/** Recibos de cada funcionário e declarações (serviço/salário e rendimentos), numeradas por modelo e ano. */
export default function RecibosRH() {
    const { actor, salarios, gerir } = useActorRH();
    const { companySettings } = useData();
    const base = useBaseRH();
    const [funcionarioId, setFuncionarioId] = useState('');
    const [ano, setAno] = useState(Number(luandaTodayKey().slice(0, 4)));
    const [finalidade, setFinalidade] = useState('');
    const recibos = useCarregar(() => (funcionarioId ? ServicoSalariosRH.recibosFuncionario(funcionarioId) : Promise.resolve([])), [] as Awaited<ReturnType<typeof ServicoSalariosRH.recibosFuncionario>>, [funcionarioId]);
    const emitidos = useCarregar(() => (funcionarioId ? ServicoTempoRH.documentosEmitidos(funcionarioId) : Promise.resolve([])), [] as Awaited<ReturnType<typeof ServicoTempoRH.documentosEmitidos>>, [funcionarioId]);
    const f = base.dados.funcionarios.find(x => x.id === funcionarioId);
    const finais = recibos.dados.filter(r => ['aprovado', 'pago', 'fechado'].includes(r.estado));

    const declarar = async (modelo: 'servico' | 'rendimentos') => {
        if (!f || !actor) return;
        try {
            const contrato = base.dados.contratos.find(c => c.funcionario_id === f.id && c.estado === 'activo');
            const doAno = finais.filter(r => r.ano === ano);
            const rendimentos = { brutoMinor: doAno.reduce((s, r) => s + r.bruto_minor, 0), inssMinor: doAno.reduce((s, r) => s + r.inss_minor, 0), irtMinor: doAno.reduce((s, r) => s + r.irt_minor, 0), liquidoMinor: doAno.reduce((s, r) => s + r.liquido_minor, 0), recibos: doAno.length };
            if (modelo === 'rendimentos' && !doAno.length) throw new Error(`Não há recibos aprovados de ${ano}.`);
            const emitido = await ServicoTempoRH.emitirDocumento(f.id, modelo === 'servico' ? 'declaracao_servico' : 'declaracao_rendimentos', modelo === 'servico' ? 'DS' : 'DR',
                modelo === 'servico' ? { finalidade, salarioBaseMinor: contrato?.salario_base_minor } : { ano, ...rendimentos }, actor);
            gerarDeclaracaoPdf({
                numero: emitido.numero, modelo, ano, rendimentos, finalidade,
                funcionario: { nome: f.nome, numero: f.numero_mecanografico, bi: f.bi_numero, nif: f.nif, admissao: f.data_admissao,
                    cargo: base.dados.cargos.find(c => c.id === f.cargo_id)?.nome, departamento: base.dados.departamentos.find(d => d.id === f.departamento_id)?.nome,
                    salarioBaseMinor: contrato?.salario_base_minor, tipoContrato: contrato ? (contrato.tipo === 'indeterminado' ? 'por tempo indeterminado' : `a termo certo até ${dataPt(contrato.fim)}`) : undefined },
            }, companySettings, actor.name);
            void emitidos.recarregar();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Não foi possível emitir', description: (error as Error).message });
        }
    };

    const pdfRecibo = async (r: (typeof recibos.dados)[number]) => {
        if (!actor) return;
        gerarReciboPdf(r, await ServicoSalariosRH.linhas(r.id), { ano: r.ano, mes: r.mes, tipoRotulo: ROTULO_TIPO[r.tipo], estado: r.estado }, companySettings, actor.name);
    };

    return (
        <MainLayout title="Recibos e declarações" subtitle="Recibos de vencimento, declarações de serviço e de rendimentos">
            <NavegacaoRH extra={LIGACOES_SALARIOS} />
            {!salarios ? <Vazio>Exige a permissão «RH: Ver salários».</Vazio> : <>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <Select value={funcionarioId} onValueChange={setFuncionarioId}>
                        <SelectTrigger className="w-72"><SelectValue placeholder="Escolha o funcionário" /></SelectTrigger>
                        <SelectContent>{base.dados.funcionarios.map(x => <SelectItem key={x.id} value={x.id}>{x.nome} ({x.numero_mecanografico})</SelectItem>)}</SelectContent>
                    </Select>
                    {f && gerir && <>
                        <Input className="w-56" placeholder="Finalidade (ex.: crédito bancário)" value={finalidade} onChange={e => setFinalidade(e.target.value)} />
                        <Button variant="outline" onClick={() => void declarar('servico')}><FileDown className="mr-1.5 h-4 w-4" /> Declaração de serviço</Button>
                        <Input className="w-24" type="number" value={ano} onChange={e => setAno(Number(e.target.value))} />
                        <Button variant="outline" onClick={() => void declarar('rendimentos')}><FileDown className="mr-1.5 h-4 w-4" /> Declaração de rendimentos</Button>
                    </>}
                </div>
                {!f ? <Vazio>Escolha um funcionário.</Vazio> : (
                    <div className="grid gap-4 lg:grid-cols-2">
                        <section>
                            <h2 className="mb-2 font-black">Recibos</h2>
                            {recibos.dados.length === 0 ? <Vazio>Sem recibos.</Vazio> : recibos.dados.map(r => (
                                <div key={r.id} className="mb-1.5 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                                    <span><b>{periodoPt(r.ano, r.mes)}</b> · {ROTULO_TIPO[r.tipo]} · {r.numero_recibo} · <span className="text-slate-500">{r.estado}</span></span>
                                    <span className="flex items-center gap-2 font-black">{kz(r.liquido_minor)}<Button size="icon" variant="ghost" onClick={() => void pdfRecibo(r)}><FileDown className="h-4 w-4" /></Button></span>
                                </div>
                            ))}
                        </section>
                        <section>
                            <h2 className="mb-2 font-black">Documentos emitidos</h2>
                            {emitidos.dados.length === 0 ? <Vazio>Sem documentos emitidos.</Vazio> : emitidos.dados.map(d => (
                                <div key={d.id} className="mb-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                                    <b>{d.numero}</b> · {d.modelo.replace('_', ' ')} · {dataPt(d.emitido_em)} · {d.emitido_por_nome}
                                </div>
                            ))}
                        </section>
                    </div>
                )}
            </>}
        </MainLayout>
    );
}
