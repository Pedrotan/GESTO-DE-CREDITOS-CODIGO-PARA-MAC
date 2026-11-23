import { useEffect, useMemo, useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Download, FileText, Lock } from 'lucide-react';
import { Indicador, executar } from '@/componentes/rh/comum-rh';
import { NavegacaoCompliance, useActorCompliance, useCompliance } from '@/componentes/compliance/comum-compliance';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { db } from '@/bibliotecas/bd';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import { calcularIndicadores, ROTULO_DECISAO, ROTULO_ESTADO_CASO, ROTULO_PRIORIDADE, ROTULO_TIPO_CASO } from '@/bibliotecas/compliance/casos';
import { RELATORIOS, gerarRelatorio, tabelaParaCsv, type DadosRelatorio, type TipoRelatorio } from '@/bibliotecas/compliance/relatorios';
import { ROTULO_DILIGENCIA, ROTULO_ESTADO_KYC } from '@/bibliotecas/compliance/kyc';
import { ROTULO_DECISAO as ROTULO_DECISAO_RISCO, ROTULO_NIVEL, type DecisaoRisco, type NivelRisco } from '@/bibliotecas/compliance/motor-risco';
import { ROTULO_ESTADO_SCREENING } from '@/bibliotecas/compliance/screening';
import { ROTULO_ESTADO_ALERTA, ROTULO_GRAVIDADE } from '@/bibliotecas/compliance/monitorizacao';
import { ROTULO_ESTADO_BI } from '@/bibliotecas/rh/bi-validade';
import { formatarCelula, gerarRelatorioPdf } from '@/bibliotecas/rh/pdf-rh';
import { descarregarPdf } from '@/componentes/rh/accoes-funcionario';
import { ServicoCasos } from '@/servicos/compliance/ServicoCasos';
import { cn } from '@/bibliotecas/utils';

const ACCOES: Record<string, string> = { create: 'Criou', update: 'Alterou', approve: 'Decidiu', reject: 'Recusou', view: 'Consultou', export: 'Exportou', delete: 'Apagou' };
const inicioDoMes = (hoje: string) => `${hoje.slice(0, 8)}01`;
const fmt = (v: number | null, sufixo = '') => (v === null ? '—' : `${v.toLocaleString('pt-PT')}${sufixo}`);

export default function RelatoriosCompliance() {
    const comp = useCompliance();
    const { user } = useAuth();
    const { companySettings } = useData() as { companySettings?: unknown };
    const { actor } = useActorCompliance();
    const hoje = luandaTodayKey();
    const [tipo, setTipo] = useState<TipoRelatorio>('kyc');
    const [de, setDe] = useState(inicioDoMes(hoje));
    const [ate, setAte] = useState(hoje);
    const [auditoria, setAuditoria] = useState<DadosRelatorio['auditoria']>([]);
    const exportar = !!user && ServicoControloAcesso.temPermissao(user, 'compliance_reports');
    const mostrarDocumento = !!user && ServicoControloAcesso.temPermissao(user, 'clients_export_id');

    useEffect(() => {
        if (tipo !== 'auditoria') return;
        void db.query<{ timestamp: string; userName: string | null; action: string; details: string }>(
            "SELECT timestamp, userName, action, details FROM audit_logs WHERE entity = 'compliance' AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT 5000", [`${de}T00:00:00`, `${ate}T23:59:59.999Z`])
            .then(r => setAuditoria(r.map(a => ({ data: a.timestamp, utilizador: a.userName, accao: ACCOES[a.action] || a.action, detalhes: a.details }))))
            .catch(() => setAuditoria([]));
    }, [tipo, de, ate]);

    const nomeCliente = (id: string | null) => (id ? comp.clientes.find(c => c.id === id)?.name || 'Cliente' : null);
    const dados = useMemo<DadosRelatorio>(() => {
        const { cas, alr, avaliacoes } = comp.dados;
        return {
            clientes: comp.linhas.map(l => ({
                nome: String(l.cliente.name), numero: l.cliente.clientNumber || null, documento: l.cliente.nif || null, estadoKyc: ROTULO_ESTADO_KYC[l.kyc.estado], completude: l.kyc.completude,
                documentoEstado: ROTULO_ESTADO_BI[l.kyc.documento.estado], documentoValidade: l.kyc.documento.validade, documentoCodigo: l.kyc.documento.estado,
                diligencia: ROTULO_DILIGENCIA[l.kyc.diligencia], verificadoPor: l.perfil?.kyc_verificado_por_nome || null, verificadoEm: l.perfil?.kyc_verificado_em || null,
                nivel: l.nivel ? ROTULO_NIVEL[l.nivel] : null, pontuacao: l.perfil?.pontuacao_risco ?? null, proximaRevisao: l.perfil?.proxima_revisao || null,
                pepDeclarado: l.perfil?.pep === 1 ? true : l.perfil?.pep === 0 ? false : null, pepFuncao: l.perfil?.pep_funcao || null, pepConfirmado: l.screening.pepConfirmado,
                screeningEstado: ROTULO_ESTADO_SCREENING[l.screening.estado], screeningEm: l.screening.ultimo?.criado_em || null, screeningPendentes: l.screening.pendentes.length,
            })),
            avaliacoes: avaliacoes.map(a => ({ cliente: nomeCliente(a.client_id) || '', data: a.criado_em, versao: a.modelo_versao, pontuacao: a.pontuacao, nivel: ROTULO_NIVEL[a.nivel],
                decisao: ROTULO_DECISAO_RISCO[a.decisao as DecisaoRisco] || a.decisao, por: a.criado_por_nome, revistoPor: a.revisto_por_nome, nivelFinal: a.nivel_final ? ROTULO_NIVEL[a.nivel_final as NivelRisco] : null })),
            alertas: alr.alertas.map(a => ({ data: a.data_operacao || a.detectado_em, titulo: a.titulo, gravidade: ROTULO_GRAVIDADE[a.gravidade], cliente: nomeCliente(a.client_id), estado: ROTULO_ESTADO_ALERTA[a.estado],
                responsavel: a.responsavel_nome, resultado: a.resultado ? ROTULO_ESTADO_ALERTA[a.resultado] : null, conclusao: a.conclusao })),
            casos: cas.casos.map(c => {
                const d = (t: string) => cas.decisoes.find(x => x.caso_id === c.id && x.tipo === t);
                const r = (x: ReturnType<typeof d>) => (x ? ROTULO_DECISAO[x.decisao as keyof typeof ROTULO_DECISAO] : null);
                return { numero: c.numero, cliente: nomeCliente(c.client_id) || '', tipo: ROTULO_TIPO_CASO[c.tipo], prioridade: ROTULO_PRIORIDADE[c.prioridade], estado: ROTULO_ESTADO_CASO[c.estado],
                    abertoEm: c.aberto_em, prazo: c.prazo, conclusao: r(d('conclusao')), uif: r(d('uif')), encerradoEm: c.encerrado_em };
            }),
            auditoria,
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [comp.linhas, comp.dados, auditoria]);

    const tabela = useMemo(() => gerarRelatorio(tipo, dados, { de, ate, mostrarDocumento }), [tipo, dados, de, ate, mostrarDocumento]);
    const ind = useMemo(() => calcularIndicadores({
        hoje, clientes: comp.linhas.map(l => ({ kycCompleto: l.kyc.estado === 'verificado', nivel: l.nivel })),
        alertas: comp.dados.alr.alertas, casos: comp.dados.cas.casos, decisoesScreening: comp.dados.scr.decisoes, decisoesCasos: comp.dados.cas.decisoes,
    }), [hoje, comp.linhas, comp.dados]);

    const filtros = { relatorio: tipo, ...(RELATORIOS[tipo].periodo ? { de, ate } : { situacaoEm: ate }) };
    const csv = () => actor && executar(async () => {
        await ServicoCasos.registarExportacao(tabela.titulo, 'csv', tabela.linhas.length, filtros, actor);
        const url = URL.createObjectURL(new Blob([tabelaParaCsv(tabela)], { type: 'text/csv;charset=utf-8' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: `${tabela.titulo.replace(/[^\w]+/gu, '-')}-${ate}.csv` });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'Relatório exportado (registado na auditoria)');
    const pdf = () => actor && executar(async () => {
        await ServicoCasos.registarExportacao(tabela.titulo, 'pdf', tabela.linhas.length, filtros, actor);
        descarregarPdf(gerarRelatorioPdf({ ...tabela, nota: [tabela.nota, 'Documento interno de Compliance — distribuição restrita.'].filter(Boolean).join(' ') },
            '', companySettings, actor.name, 'datauri'));
    }, 'Relatório exportado (registado na auditoria)');

    return (
        <MainLayout title="Compliance" subtitle="Indicadores e relatórios">
            <NavegacaoCompliance />
            <h1 className="mb-1 text-2xl font-extrabold">Indicadores e relatórios</h1>
            <p className="mb-4 max-w-3xl text-sm text-slate-600 dark:text-slate-400">Indicadores de desempenho do Compliance e relatórios de KYC, risco, PEP, sanções, alertas, investigações, documentos e auditoria. Cada exportação fica registada.</p>

            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Indicador titulo="KYC completo e verificado" valor={fmt(ind.kycCompletoPct, '%')} nota={`Baixo ${ind.clientesPorNivel.baixo || 0} · Médio ${ind.clientesPorNivel.medio || 0} · Elevado ${ind.clientesPorNivel.elevado || 0}`} tom={(ind.kycCompletoPct ?? 0) >= 80 ? 'emerald' : 'orange'} />
                <Indicador titulo="Alertas pendentes" valor={ind.alertasPendentes} nota={`${ind.alertasPendentesMais7Dias} há mais de 7 dias · resolução média ${fmt(ind.tempoMedioAlertaDias, ' dias')}`} tom={ind.alertasPendentesMais7Dias ? 'red' : 'slate'} />
                <Indicador titulo="Falsos positivos" valor={fmt(ind.alertasFalsosPositivosPct, '%')} nota={`dos alertas concluídos · screening ${fmt(ind.screeningFalsosPositivosPct, '%')}`} tom="slate" />
                <Indicador titulo="Investigações em curso" valor={ind.casosAbertos} nota={`${ind.casosForaDoPrazo} fora do prazo · duração média ${fmt(ind.tempoMedioCasoDias, ' dias')} · ${ind.comunicacoesUif} comunicadas à UIF`} tom={ind.casosForaDoPrazo ? 'red' : 'slate'} />
            </div>

            <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
                <nav aria-label="Relatórios" className="space-y-1">
                    {(Object.keys(RELATORIOS) as TipoRelatorio[]).map(t => (
                        <button key={t} type="button" onClick={() => setTipo(t)} aria-current={tipo === t ? 'page' : undefined}
                            className={cn('w-full rounded-xl border px-3 py-2.5 text-left transition-colors', tipo === t ? 'border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/30' : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800')}>
                            <span className="block text-sm font-bold">{RELATORIOS[t].titulo}</span>
                            <span className="block text-[11px] text-slate-500">{RELATORIOS[t].descricao}</span>
                        </button>
                    ))}
                </nav>
                <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                        <div className="flex flex-wrap items-end gap-2">
                            {RELATORIOS[tipo].periodo && <div className="space-y-1"><Label className="text-xs">De</Label><Input type="date" value={de} max={ate} onChange={e => setDe(e.target.value)} className="w-40" /></div>}
                            <div className="space-y-1"><Label className="text-xs">{RELATORIOS[tipo].periodo ? 'Até' : 'Situação em'}</Label><Input type="date" value={ate} onChange={e => setAte(e.target.value)} className="w-40" disabled={!RELATORIOS[tipo].periodo} /></div>
                        </div>
                        {exportar ? (
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={csv} disabled={!tabela.linhas.length}><Download className="mr-1 h-4 w-4" />CSV</Button>
                                <Button size="sm" onClick={pdf} disabled={!tabela.linhas.length}><FileText className="mr-1 h-4 w-4" />PDF</Button>
                            </div>
                        ) : <span className="flex items-center gap-1 text-xs text-slate-500"><Lock className="h-3.5 w-3.5" />Exportar exige «Compliance: Relatórios e exportação»</span>}
                    </div>
                    <p className="mb-2 text-xs text-slate-500">{tabela.subtitulo} · {tabela.linhas.length} linha(s){!mostrarDocumento ? ' · documentos mascarados' : ''}</p>
                    {tabela.nota && <p className="mb-2 text-xs font-semibold text-violet-700 dark:text-violet-300">{tabela.nota}</p>}
                    <div className="max-h-[520px] overflow-auto rounded-xl border border-slate-100 dark:border-slate-800">
                        <table className="w-full min-w-[720px] text-xs">
                            <thead className="sticky top-0 bg-slate-50 text-left dark:bg-slate-800"><tr>{tabela.colunas.map((c, j) => <th key={j} className="px-2.5 py-2 font-bold">{c.titulo}</th>)}</tr></thead>
                            <tbody>
                                {!tabela.linhas.length ? <tr><td colSpan={tabela.colunas.length} className="px-2.5 py-6 text-center text-slate-500">Sem dados para os filtros escolhidos.</td></tr>
                                    : tabela.linhas.slice(0, 500).map((l, i) => (
                                        <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                                            {l.map((v, j) => <td key={j} className={cn('px-2.5 py-1.5 align-top', ['kz', 'numero', 'pct'].includes(tabela.colunas[j].tipo) && 'text-right')}>{formatarCelula(v, tabela.colunas[j].tipo)}</td>)}
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                    {tabela.linhas.length > 500 && <p className="mt-2 text-xs text-slate-500">A mostrar 500 de {tabela.linhas.length} linhas; a exportação inclui todas.</p>}
                </section>
            </div>
        </MainLayout>
    );
}
