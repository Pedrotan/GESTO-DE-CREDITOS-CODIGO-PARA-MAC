import { useMemo, useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { FileDown, FileSpreadsheet, UserSquare } from 'lucide-react';
import { RELATORIOS_RH, mesesDoPeriodo, type Base, type FiltroRH } from '@/bibliotecas/rh/relatorios-rh';
import { formatarCelula, gerarFichaIndividualPdf, gerarRelatorioPdf } from '@/bibliotecas/rh/pdf-rh';
import { valorNumerico } from '@/bibliotecas/rh/parametros-rh';
import { exportToExcel } from '@/bibliotecas/ExcelHelper';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { ServicoRH, CATEGORIAS_DOCUMENTO } from '@/servicos/rh/ServicoRH';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import { ServicoSalariosRH } from '@/servicos/rh/ServicoSalariosRH';
import { ServicoFeriasRH } from '@/servicos/rh/ServicoFeriasRH';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { useData } from '@/contextos/ContextoDados';
import { NavegacaoRH, dataPt, kz, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { toast } from '@/ganchos/usar-toast';
import { useBaseRH } from './FuncionariosRH';

const TODOS = '__todos__';

/** Relatórios de RH com filtros de período, departamento e estado; exportação para PDF e Excel. */
export default function RelatoriosRH() {
    const { actor, salarios } = useActorRH();
    const { companySettings } = useData();
    const base = useBaseRH();
    const hoje = luandaTodayKey();
    const [relatorio, setRelatorio] = useState<string>(salarios ? 'folha' : 'absentismo');
    const [de, setDe] = useState(`${hoje.slice(0, 7)}-01`);
    const [ate, setAte] = useState(hoje);
    const [departamento, setDepartamento] = useState(TODOS);
    const [estado, setEstado] = useState<FiltroRH['estado']>('todos');
    const [ficha, setFicha] = useState('');
    const extra = useCarregar(async () => {
        const meses = mesesDoPeriodo(de, ate).slice(0, 24);
        const [recibos, linhas, ausencias, tipos, horarios, feriados, planos, documentos, pontos] = await Promise.all([
            salarios ? ServicoSalariosRH.todosRecibos() : Promise.resolve([]), salarios ? ServicoSalariosRH.linhasTempo() : Promise.resolve([]),
            ServicoTempoRH.ausencias(), ServicoTempoRH.tiposAusencia(), ServicoTempoRH.horarios(), ServicoTempoRH.feriados(), ServicoFeriasRH.planos(), ServicoRH.documentos(),
            Promise.all(meses.map(m => ServicoTempoRH.pontosMes(m.ano, m.mes))).then(l => l.flat()),
        ]);
        return { recibos, linhas, ausencias, tipos, horarios, feriados, planos, documentos, pontos };
    }, null as null | Record<string, unknown>, [de, ate, salarios]);

    const disponiveis = RELATORIOS_RH.filter(r => salarios || !r.salarial);
    const definicao = disponiveis.find(r => r.id === relatorio) || disponiveis[0];
    const filtro: FiltroRH = { de, ate, departamentoId: departamento === TODOS ? null : departamento, estado, hoje };
    const tabela = useMemo(() => {
        if (!extra.dados || !definicao || de > ate) return null;
        const dados: Base = { ...(extra.dados as Omit<Base, 'funcionarios' | 'departamentos' | 'cargos' | 'contratos' | 'diasFeriasPadrao'>),
            funcionarios: base.dados.funcionarios, departamentos: base.dados.departamentos, cargos: base.dados.cargos, contratos: base.dados.contratos,
            diasFeriasPadrao: valorNumerico(base.dados.parametros, 'dias_ferias_ano', hoje, 22) } as Base;
        return definicao.gerar(dados, filtro);
    }, [extra.dados, definicao, base.dados, de, ate, departamento, estado, hoje]); // eslint-disable-line react-hooks/exhaustive-deps
    const descricaoFiltros = [departamento !== TODOS ? base.dados.departamentos.find(d => d.id === departamento)?.nome : '', estado !== 'todos' ? `estado: ${estado}` : ''].filter(Boolean).join(' · ');

    const excel = () => {
        if (!tabela) return;
        const linhas = tabela.linhas.map(l => Object.fromEntries(tabela.colunas.map((c, i) => [c.titulo, l[i] ?? ''])));
        if (tabela.totais) linhas.push(Object.fromEntries(tabela.colunas.map((c, i) => [c.titulo, tabela.totais![i] ?? ''])));
        exportToExcel(linhas, `${tabela.titulo.normalize('NFD').replace(/[̀-ͯ]/gu, '').replace(/[^\w]+/gu, '-')}-${de}-${ate}`);
    };

    const fichaIndividual = async () => {
        const f = base.dados.funcionarios.find(x => x.id === ficha);
        if (!f || !actor) return;
        try {
            const [contratos, historico, ausencias, documentos, tipos] = await Promise.all([ServicoRH.contratos(f.id), salarios ? ServicoRH.historicoSalarial(f.id) : Promise.resolve([]),
                ServicoTempoRH.ausencias(), ServicoRH.documentos(f.id), ServicoTempoRH.tiposAusencia()]);
            const nome = (lista: Array<{ id: string; nome: string }>, id: string | null) => lista.find(x => x.id === id)?.nome || '—';
            gerarFichaIndividualPdf(f.nome, [
                { titulo: 'Dados pessoais e identificação', pares: [['N.º mecanográfico', f.numero_mecanografico], ['Data de nascimento', dataPt(f.data_nascimento)], ['BI', `${f.bi_numero || '—'} (validade ${dataPt(f.bi_validade)})`],
                    ['NIF', f.nif || '—'], ['N.º INSS', f.numero_inss || '—'], ['Telefone / email', [f.telefone, f.email].filter(Boolean).join(' · ') || '—'], ['Morada', f.morada || '—'],
                    ['IBAN', salarios ? f.iban || '—' : '•••'], ['Cargo / departamento', `${nome(base.dados.cargos, f.cargo_id)} · ${nome(base.dados.departamentos, f.departamento_id)}`],
                    ['Admissão / saída', `${dataPt(f.data_admissao)}${f.data_saida ? ` — ${dataPt(f.data_saida)}` : ''}`], ['Estado', f.estado]] },
                { titulo: 'Contratos', tabela: { colunas: ['Tipo', 'Início', 'Fim', 'Salário base', 'Estado'], linhas: contratos.map(c => [c.tipo, dataPt(c.inicio), dataPt(c.fim), salarios ? kz(c.salario_base_minor) : '•••', c.estado]) } },
                ...(salarios ? [{ titulo: 'Histórico salarial', tabela: { colunas: ['Data de efeito', 'Anterior', 'Novo', 'Motivo'], linhas: historico.map(h => [dataPt(h.data_efeito), h.salario_anterior_minor === null ? '—' : kz(h.salario_anterior_minor), kz(h.salario_novo_minor), h.motivo]) } }] : []),
                { titulo: 'Ausências', tabela: { colunas: ['Tipo', 'Período', 'Dias / horas', 'Estado'], linhas: ausencias.filter(a => a.funcionario_id === f.id).map(a => [tipos.find(t => t.id === a.tipo_id)?.nome || '—', `${dataPt(a.data_inicio)} a ${dataPt(a.data_fim)}`, a.horas ? `${a.horas} h` : `${a.dias} d`, a.estado]) } },
                { titulo: 'Documentos', tabela: { colunas: ['Documento', 'Categoria', 'Validade', 'Estado'], linhas: documentos.filter(d => !d.confidencial).map(d => [d.nome, CATEGORIAS_DOCUMENTO.find(c => c.id === d.categoria)?.nome || d.categoria, dataPt(d.data_validade), d.estado]) } },
            ], companySettings, actor.name);
        } catch (error) { toast({ variant: 'destructive', title: 'Não foi possível gerar a ficha', description: (error as Error).message }); }
    };

    return (
        <MainLayout title="Relatórios de RH" subtitle="Mapas de INSS e IRT, custos, absentismo, férias e efectivos — PDF e Excel">
            <NavegacaoRH extra={[{ path: '/rh/relatorios', label: 'Relatórios' }]} />
            <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-6">
                <div className="md:col-span-2"><Label className="text-xs font-bold">Relatório</Label>
                    <Select value={definicao?.id} onValueChange={setRelatorio}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{disponiveis.map(r => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}</SelectContent></Select>
                </div>
                <div><Label className="text-xs font-bold">De</Label><Input className="mt-1" type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
                <div><Label className="text-xs font-bold">Até</Label><Input className="mt-1" type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
                <div><Label className="text-xs font-bold">Departamento</Label>
                    <Select value={departamento} onValueChange={setDepartamento}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value={TODOS}>Todos</SelectItem>{base.dados.departamentos.map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}</SelectContent></Select>
                </div>
                <div><Label className="text-xs font-bold">Estado</Label>
                    <Select value={estado} onValueChange={v => setEstado(v as FiltroRH['estado'])}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="activo">Activos</SelectItem><SelectItem value="suspenso">Suspensos</SelectItem><SelectItem value="cessado">Cessados</SelectItem></SelectContent></Select>
                </div>
            </div>

            {!tabela ? <Vazio>{de > ate ? 'O início do período tem de ser antes do fim.' : 'A carregar…'}</Vazio> : (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                        <div><h2 className="text-lg font-black">{tabela.titulo}</h2><p className="text-xs text-slate-500">{tabela.subtitulo}{descricaoFiltros ? ` · ${descricaoFiltros}` : ''}</p></div>
                        <div className="flex gap-2">
                            <Button variant="outline" disabled={!actor} onClick={() => actor && gerarRelatorioPdf(tabela, descricaoFiltros, companySettings, actor.name)}><FileDown className="mr-1.5 h-4 w-4" /> PDF</Button>
                            <Button variant="outline" onClick={excel}><FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel</Button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500 dark:bg-slate-950">
                                <tr>{tabela.colunas.map(c => <th key={c.titulo} className={`px-3 py-2 ${['kz', 'numero', 'pct'].includes(c.tipo) ? 'text-right' : ''}`}>{c.titulo}</th>)}</tr>
                            </thead>
                            <tbody>
                                {tabela.linhas.length === 0 ? <tr><td colSpan={tabela.colunas.length} className="px-3 py-6 text-center text-slate-500">Sem dados para os filtros escolhidos.</td></tr>
                                    : tabela.linhas.map((l, i) => <tr key={i} className="border-t border-slate-100 dark:border-slate-800">{l.map((v, j) => <td key={j} className={`px-3 py-1.5 ${['kz', 'numero', 'pct'].includes(tabela.colunas[j].tipo) ? 'text-right' : ''}`}>{formatarCelula(v, tabela.colunas[j].tipo)}</td>)}</tr>)}
                            </tbody>
                            {tabela.totais && <tfoot><tr className="border-t-2 border-slate-300 font-black">{tabela.totais.map((v, j) => <td key={j} className={`px-3 py-2 ${['kz', 'numero', 'pct'].includes(tabela.colunas[j].tipo) ? 'text-right' : ''}`}>{formatarCelula(v, tabela.colunas[j].tipo)}</td>)}</tr></tfoot>}
                        </table>
                    </div>
                    {tabela.nota && <p className="mt-2 text-xs text-slate-500">{tabela.nota}</p>}
                </section>
            )}

            <section className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <UserSquare className="h-5 w-5 text-slate-500" /><b className="text-sm">Ficha individual</b>
                <Select value={ficha} onValueChange={setFicha}><SelectTrigger className="w-72"><SelectValue placeholder="Escolha o funcionário" /></SelectTrigger>
                    <SelectContent>{base.dados.funcionarios.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent></Select>
                <Button variant="outline" disabled={!ficha} onClick={() => void fichaIndividual()}><FileDown className="mr-1.5 h-4 w-4" /> Ficha (PDF)</Button>
            </section>
        </MainLayout>
    );
}
