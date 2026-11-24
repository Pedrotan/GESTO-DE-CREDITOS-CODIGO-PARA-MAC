import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Checkbox } from '@/componentes/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { ArrowLeft, Check, ClipboardCheck, Gauge, Loader2, Save, ShieldAlert, UserCheck, Users, X } from 'lucide-react';
import { SeloBI, Vazio, dataPt, executar } from '@/componentes/rh/comum-rh';
import { COR_BARRA_NIVEL, NavegacaoCompliance, SeloKyc, SeloRisco, dataHoraPt, useActorCompliance, useCompliance } from '@/componentes/compliance/comum-compliance';
import { DOCUMENTOS_SUPORTE, ROTULO_DILIGENCIA, documentosEntregues, ehEmpresa, mascararDocumento, type ClienteKyc, type DocumentoSuporte } from '@/bibliotecas/compliance/kyc';
import { ROTULO_DECISAO, ROTULO_NIVEL, type DecisaoRisco, type NivelRisco, type RegraDisparada, type ResultadoFactor } from '@/bibliotecas/compliance/motor-risco';
import { ROTULO_DECISAO_DUPLICADO, ROTULO_MOTIVO } from '@/bibliotecas/compliance/duplicados';
import {
    CONTROLOS_VERIFICACAO, ROTULO_FONTE, ROTULO_TIPO_VERIFICACAO, ServicoCompliance, lerJson,
    type AvaliacaoRisco, type FonteVerificacao, type PerfilCompliance, type TipoVerificacao, type VerificacaoKyc,
} from '@/servicos/compliance/ServicoCompliance';
import { cn } from '@/bibliotecas/utils';
import { ScreeningCliente } from '@/componentes/compliance/ScreeningCliente';
import { AlertasCliente } from '@/componentes/compliance/AlertasCliente';
import { InvestigacoesCliente } from '@/componentes/compliance/casos-comum';
import { SeccaoControloCredito } from '@/componentes/compliance/ControloCreditoCompliance';

function Seccao({ titulo, descricao, accao, children, icone: Icone }: { titulo: string; descricao?: string; accao?: ReactNode; children: ReactNode; icone?: typeof Gauge }) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="flex min-w-0 items-center gap-2.5">
                    {Icone && <Icone className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />}
                    <div className="min-w-0">
                        <h2 className="text-base font-bold">{titulo}</h2>
                        {descricao && <p className="text-[13px] text-slate-500 dark:text-slate-400">{descricao}</p>}
                    </div>
                </div>
                {accao}
            </div>
            <div className="p-5">{children}</div>
        </section>
    );
}

export default function ClienteCompliance() {
    const { id = '' } = useParams();
    const comp = useCompliance();
    const { actor, registar, decidir, sensiveis } = useActorCompliance();
    const linha = comp.linhas.find(l => l.cliente.id === id);
    const [registarAberto, setRegistarAberto] = useState(false);
    const [decidirV, setDecidirV] = useState<VerificacaoKyc | null>(null);
    const [rever, setRever] = useState<AvaliacaoRisco | null>(null);
    const [aAvaliar, setAAvaliar] = useState(false);

    if (!linha) {
        return (
            <MainLayout title="Compliance" subtitle="Ficha de Compliance do cliente">
                <NavegacaoCompliance />
                {comp.aCarregar ? <div className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>
                    : <Vazio>Cliente não encontrado (pode estar na lixeira ou fora do seu âmbito de dados). <Link to="/compliance" className="font-semibold underline">Voltar ao painel</Link></Vazio>}
            </MainLayout>
        );
    }

    const { cliente, perfil, kyc, avaliacao } = linha;
    const ck = cliente as unknown as ClienteKyc;
    const verificacoes = comp.dados.verificacoes.filter(v => v.client_id === id);
    const avaliacoes = comp.dados.avaliacoes.filter(a => a.client_id === id);
    const grupos = comp.gruposPorRever.filter(g => g.clientes.includes(id));
    const revisoes = comp.dados.revisoes.filter(r => lerJson<string[]>(r.clientes, []).includes(id));
    const modelo = ServicoCompliance.modeloActivo(comp.dados.modelos);
    const nomeCliente = (cid: string) => comp.clientes.find(c => c.id === cid)?.name || 'Cliente removido';

    const avaliar = async () => {
        if (!actor) return;
        setAAvaliar(true);
        await executar(() => ServicoCompliance.avaliarRisco({
            cliente: ck, perfil, creditos: comp.creditos,
            duplicadosPorRever: linha.duplicados, modelo, tipo: avaliacoes.length ? 'reavaliacao' : 'inicial',
            screening: { estado: linha.screening.estado, pepConfirmado: linha.screening.pepConfirmado },
            alertasFundamentados: linha.alertasFundamentados,
            suspeitaFundamentada: linha.suspeitaFundamentada,
            motivo: avaliacoes.length ? 'Reavaliação pedida na ficha de Compliance' : 'Avaliação inicial',
        }, actor), 'Avaliação de risco registada');
        setAAvaliar(false);
        void comp.recarregar();
    };

    return (
        <MainLayout title="Compliance" subtitle={`Ficha de Compliance · ${cliente.name}`}>
            <NavegacaoCompliance />
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <Link to="/compliance" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> Painel de Compliance</Link>
                    <h1 className="text-2xl font-extrabold">{cliente.name}</h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        {cliente.clientNumber ? `N.º ${cliente.clientNumber} · ` : ''}{ehEmpresa(ck) ? 'Empresa · NIF ' : `${cliente.documentType === 'PASSAPORTE' ? 'Passaporte' : 'BI'} `}
                        <span className="font-mono" title={sensiveis ? undefined : 'Número mascarado'}>{sensiveis ? cliente.nif : mascararDocumento(cliente.nif)}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2"><SeloKyc estado={kyc.estado} /><SeloBI situacao={kyc.documento} detalhe /><SeloRisco nivel={linha.nivel} pontuacao={perfil?.pontuacao_risco} /></div>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <dt className="text-slate-500">Diligência</dt><dd className="font-semibold">{ROTULO_DILIGENCIA[perfil?.diligencia || 'normal']}</dd>
                    <dt className="text-slate-500">Próxima revisão</dt><dd className={cn('font-semibold', kyc.revisaoVencida && 'text-red-600')}>{perfil?.proxima_revisao ? dataPt(perfil.proxima_revisao) : '—'}{kyc.revisaoVencida ? ' (vencida)' : ''}</dd>
                    <dt className="text-slate-500">Verificado por</dt><dd className="font-semibold">{perfil?.kyc_verificado_por_nome ? `${perfil.kyc_verificado_por_nome}, ${dataPt(perfil.kyc_verificado_em)}` : '—'}</dd>
                </dl>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
                <div className="space-y-5">
                    <Seccao titulo="Requisitos KYC" icone={ClipboardCheck} descricao={`Diligência ${ROTULO_DILIGENCIA[kyc.diligencia].toLowerCase()} · ${kyc.completude}% completo`}>
                        <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={cn('h-full', kyc.completude === 100 ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${kyc.completude}%` }} /></div>
                        {kyc.emFalta.length ? (
                            <>
                                <ul className="flex flex-wrap gap-1.5">
                                    {kyc.emFalta.map(r => <li key={r.campo} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">{r.rotulo}</li>)}
                                </ul>
                                <p className="mt-2 text-xs text-slate-500">Os dados de identificação (documento, validade, nascimento, morada, rendimento) corrigem-se no cadastro do cliente; os restantes no perfil KYC abaixo.</p>
                            </>
                        ) : <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400"><Check className="h-4 w-4" /> Todos os requisitos estão preenchidos.</p>}
                    </Seccao>

                    <FormPerfil key={perfil?.actualizado_em || 'novo'} cliente={ck} perfil={perfil} podeEditar={registar} aoGuardar={() => void comp.recarregar()} actor={actor} />

                    <Seccao titulo="Verificações de identidade" icone={UserCheck} descricao="Cada verificação é registada por uma pessoa e decidida por outra."
                        accao={registar && <Button size="sm" onClick={() => setRegistarAberto(true)} disabled={verificacoes.some(v => v.estado === 'pendente')}>Registar verificação</Button>}>
                        {!verificacoes.length ? <Vazio>Ainda não há verificações registadas.</Vazio> : (
                            <ol className="space-y-3">
                                {verificacoes.map(v => (
                                    <li key={v.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="text-sm font-semibold">{ROTULO_TIPO_VERIFICACAO[v.tipo]} · {v.documento_tipo} <span className="font-mono text-xs text-slate-500">{v.documento_ref}</span></div>
                                            <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold', v.estado === 'verificado' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                                                : v.estado === 'recusado' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200' : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200')}>
                                                {v.estado === 'pendente' ? 'Por decidir' : v.estado === 'verificado' ? 'Verificado' : 'Recusado'}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500">{ROTULO_FONTE[v.fonte]}{v.documento_validade ? ` · validade ${dataPt(v.documento_validade)}` : ''} · registada por {v.registado_por_nome || '—'} em {dataHoraPt(v.registado_em)}</p>
                                        <ul className="mt-1.5 flex flex-wrap gap-1">{lerJson<string[]>(v.controlos, []).map(c => <li key={c} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">✓ {CONTROLOS_VERIFICACAO[c as keyof typeof CONTROLOS_VERIFICACAO] || c}</li>)}</ul>
                                        {v.notas && <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{v.notas}</p>}
                                        {v.estado !== 'pendente' && <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400"><strong>{v.estado === 'verificado' ? 'Confirmada' : 'Recusada'}</strong> por {v.decidido_por_nome} em {dataHoraPt(v.decidido_em)}{v.motivo_decisao ? ` — ${v.motivo_decisao}` : ''}</p>}
                                        {v.estado === 'pendente' && decidir && (
                                            v.registado_por === actor?.id && actor?.role !== 'super_admin'
                                                ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Foi o utilizador que a registou: a decisão tem de ser de outro responsável.</p>
                                                : <Button size="sm" variant="outline" className="mt-2" onClick={() => setDecidirV(v)}>Decidir verificação</Button>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </Seccao>
                </div>

                <div className="space-y-5">
                    <SeccaoControloCredito cliente={{ id, nome: String(cliente.name) }} actor={actor} medidas={comp.dados.cas.decisoes.filter(d => d.client_id === id)} aoMudar={() => void comp.recarregar()} />

                    <ScreeningCliente linha={linha} scr={comp.dados.scr} actor={actor} registar={registar} decidir={decidir} aoMudar={() => void comp.recarregar()} />

                    <AlertasCliente alertas={comp.dados.alr.alertas.filter(a => a.client_id === id)} historico={comp.dados.alr.historico} nomeCliente={String(cliente.name)}
                        actor={actor} aoMudar={() => void comp.recarregar()}
                        casosDoAlerta={alertaId => comp.dados.cas.ligacoes.filter(l => l.tipo === 'alerta' && l.ref_id === alertaId).map(l => comp.dados.cas.casos.find(x => x.id === l.caso_id)).filter((x): x is NonNullable<typeof x> => !!x)} />

                    <InvestigacoesCliente cliente={{ id, nome: String(cliente.name) }} casos={comp.dados.cas.casos.filter(x => x.client_id === id)} actor={actor} podeAbrir={registar} />

                    <Seccao titulo="Avaliação de risco" icone={Gauge}
                        descricao={avaliacao ? `Modelo v${avaliacao.modelo_versao} · ${dataHoraPt(avaliacao.criado_em)} · ${avaliacao.criado_por_nome || '—'}` : modelo ? `Modelo activo: v${modelo.versao}` : 'Sem modelo activo'}
                        accao={registar && <Button size="sm" onClick={avaliar} disabled={aAvaliar || !modelo}>{aAvaliar ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}{avaliacao ? 'Reavaliar' : 'Avaliar risco'}</Button>}>
                        {!avaliacao ? <Vazio>Ainda sem avaliação de risco. A avaliação usa o cadastro, o perfil KYC, os créditos do cliente e os possíveis duplicados.</Vazio>
                            : <DetalheAvaliacao a={avaliacao} podeRever={decidir && (actor?.id !== avaliacao.criado_por || actor?.role === 'super_admin')} aoRever={() => setRever(avaliacao)} />}
                    </Seccao>

                    {avaliacoes.length > 1 && (
                        <Seccao titulo="Histórico de avaliações" descricao="As avaliações não se apagam: cada reavaliação é um registo novo.">
                            <ol className="space-y-1.5 text-sm">
                                {avaliacoes.slice(1).map(a => (
                                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-0 dark:border-slate-800">
                                        <span className="text-slate-600 dark:text-slate-400">{dataHoraPt(a.criado_em)} · v{a.modelo_versao} · {a.criado_por_nome}</span>
                                        <span className="flex items-center gap-1.5"><SeloRisco nivel={a.nivel} pontuacao={a.pontuacao} />{a.nivel_final && a.nivel_final !== a.nivel && <>→ <SeloRisco nivel={a.nivel_final} /></>}</span>
                                    </li>
                                ))}
                            </ol>
                        </Seccao>
                    )}

                    <Seccao titulo="Dados partilhados com outras fichas" icone={Users} accao={<Link to="/compliance/duplicados" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Ver todos</Link>}>
                        {!grupos.length && !revisoes.length ? <p className="text-sm text-slate-500">Nenhum dado partilhado com outros clientes.</p> : (
                            <ul className="space-y-2 text-sm">
                                {grupos.map(g => (
                                    <li key={g.chave} className="rounded-lg border border-red-200 bg-red-50/60 p-2.5 dark:border-red-900 dark:bg-red-950/30">
                                        <strong>{ROTULO_MOTIVO[g.motivo]}</strong> <span className="font-mono text-xs">{g.valor}</span> — por rever
                                        <div className="text-xs text-slate-600 dark:text-slate-400">Com: {g.clientes.filter(c => c !== id).map(c => <Link key={c} to={`/compliance/clientes/${c}`} className="mr-2 underline">{nomeCliente(c)}</Link>)}</div>
                                    </li>
                                ))}
                                {revisoes.map(r => (
                                    <li key={r.id} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                                        <strong>{ROTULO_MOTIVO[r.motivo as keyof typeof ROTULO_MOTIVO] || r.motivo}</strong> — {ROTULO_DECISAO_DUPLICADO[r.decisao]}
                                        <div className="text-xs text-slate-500">{r.decidido_por_nome}, {dataHoraPt(r.decidido_em)}: {r.justificacao}</div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Seccao>
                </div>
            </div>

            {registarAberto && actor && <DialogoRegistar cliente={ck} onClose={() => setRegistarAberto(false)}
                onSave={dados => ServicoCompliance.registarVerificacao(ck, comp.dados.verificacoes, dados, actor)} aoGuardar={() => void comp.recarregar()} />}
            {decidirV && actor && <DialogoDecidir v={decidirV} onClose={() => setDecidirV(null)}
                onSave={(d, m) => ServicoCompliance.decidirVerificacao(ck, decidirV, d, m, actor)} aoGuardar={() => void comp.recarregar()} />}
            {rever && actor && <DialogoRever a={rever} onClose={() => setRever(null)}
                onSave={(nivel, parecer) => ServicoCompliance.reverAvaliacao(ck, rever, modelo, { nivelFinal: nivel, parecer }, actor)} aoGuardar={() => void comp.recarregar()} />}
        </MainLayout>
    );
}

function DetalheAvaliacao({ a, podeRever, aoRever }: { a: AvaliacaoRisco; podeRever: boolean; aoRever: () => void }) {
    const factores = lerJson<ResultadoFactor[]>(a.factores, []);
    const regras = lerJson<RegraDisparada[]>(a.regras, []);
    const nivelFinal = a.nivel_final || a.nivel;
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-16 w-16 flex-col items-center justify-center rounded-2xl border-2 border-current text-center" style={{ color: nivelFinal === 'elevado' ? '#dc2626' : nivelFinal === 'medio' ? '#d97706' : '#059669' }}>
                    <span className="text-2xl font-black leading-none">{a.pontuacao}</span><span className="text-[10px] font-bold">/100</span>
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2"><SeloRisco nivel={nivelFinal} />{a.nivel_final && a.nivel_final !== a.nivel && <span className="text-xs text-slate-500">(calculado: {ROTULO_NIVEL[a.nivel]})</span>}</div>
                    <p className="mt-1 text-sm font-semibold">{ROTULO_DECISAO[a.decisao as DecisaoRisco] || a.decisao}</p>
                    {a.pontuacao !== a.pontuacao_ponderada && <p className="text-xs text-slate-500">Média ponderada {a.pontuacao_ponderada}; subida pelas regras próprias abaixo.</p>}
                </div>
            </div>

            <div className="space-y-2.5">
                {factores.map(f => (
                    <div key={f.id}>
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="font-semibold">{f.rotulo} <span className="font-normal text-slate-500">· peso {f.peso}%</span></span>
                            <span className="font-mono">{f.valor}/100 → {Math.round((f.valor * f.peso) / 100)} pts</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={cn('h-full', COR_BARRA_NIVEL[f.valor >= 60 ? 'elevado' : f.valor >= 30 ? 'medio' : 'baixo'])} style={{ width: `${f.valor}%` }} /></div>
                        {(f.contributos.length > 0 || f.notas.length > 0) && (
                            <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                                {f.contributos.map(c => <li key={c.motivo}>+{c.pontos} {c.motivo}</li>)}
                                {f.notas.map(n => <li key={n} className="italic">{n}</li>)}
                            </ul>
                        )}
                    </div>
                ))}
            </div>

            {regras.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200"><ShieldAlert className="h-3.5 w-3.5" /> Regras próprias (não se diluem na média)</p>
                    <ul className="space-y-0.5 text-xs text-amber-900 dark:text-amber-200">{regras.map(r => <li key={r.id}>• {r.descricao}{r.nivelMinimo ? ` — nível mínimo ${ROTULO_NIVEL[r.nivelMinimo].toLowerCase()}` : ''}</li>)}</ul>
                </div>
            )}

            {a.revisto_por ? (
                <div className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
                    <strong>Revista</strong> por {a.revisto_por_nome} em {dataHoraPt(a.revisto_em)} — {a.revisao_decisao === 'confirmada' ? 'nível confirmado' : `nível alterado para ${ROTULO_NIVEL[a.nivel_final!].toLowerCase()}`}.
                    <p className="mt-1 text-slate-600 dark:text-slate-400">{a.revisao_parecer}</p>
                </div>
            ) : a.requer_revisao === 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                    <span>Esta avaliação requer a revisão de um responsável autorizado (diferente de quem a pediu).</span>
                    {podeRever && <Button size="sm" variant="outline" onClick={aoRever}>Rever avaliação</Button>}
                </div>
            ) : null}
        </div>
    );
}

function FormPerfil({ cliente, perfil, podeEditar, aoGuardar, actor }: {
    cliente: ClienteKyc; perfil: PerfilCompliance | null; podeEditar: boolean; aoGuardar: () => void; actor: ReturnType<typeof useActorCompliance>['actor'];
}) {
    const empresa = ehEmpresa(cliente);
    const [f, setF] = useState({
        profissao: perfil?.profissao || cliente.workPosition || '', entidade_empregadora: perfil?.entidade_empregadora || cliente.workInstitution || '',
        origem_fundos: perfil?.origem_fundos || '', finalidade_credito: perfil?.finalidade_credito || '',
        pep: perfil?.pep === 1 ? 'sim' : perfil?.pep === 0 ? 'nao' : '', pep_funcao: perfil?.pep_funcao || '', pep_relacao: perfil?.pep_relacao || 'proprio',
        beneficiario_efectivo: perfil?.beneficiario_efectivo || '', observacoes: perfil?.observacoes || '',
    });
    const [docs, setDocs] = useState<DocumentoSuporte[]>(documentosEntregues(perfil));
    const [aGuardar, setAGuardar] = useState(false);
    const set = (k: keyof typeof f) => (v: string) => setF(x => ({ ...x, [k]: v }));
    const guardar = async () => {
        if (!actor) return;
        setAGuardar(true);
        const ok = await executar(() => ServicoCompliance.guardarPerfil(cliente, perfil, {
            ...f, pep: f.pep === 'sim' ? 1 : f.pep === 'nao' ? 0 : null, pep_relacao: f.pep_relacao as PerfilCompliance['pep_relacao'], documentos: docs,
        }, actor), 'Perfil KYC guardado');
        setAGuardar(false);
        if (ok) aoGuardar();
    };
    const desactivado = !podeEditar;
    return (
        <Seccao titulo="Perfil KYC" descricao="Dados declarados pelo cliente para a avaliação de Compliance (não alteram o cadastro)."
            accao={podeEditar && <Button size="sm" onClick={guardar} disabled={aGuardar}>{aGuardar ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Guardar</Button>}>
            <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo={empresa ? 'Actividade da empresa' : 'Profissão'}><Input value={f.profissao} onChange={e => set('profissao')(e.target.value)} disabled={desactivado} /></Campo>
                <Campo rotulo={empresa ? 'Grupo / casa-mãe (se existir)' : 'Entidade empregadora'}><Input value={f.entidade_empregadora} onChange={e => set('entidade_empregadora')(e.target.value)} disabled={desactivado} /></Campo>
                <Campo rotulo="Origem dos fundos"><Input value={f.origem_fundos} onChange={e => set('origem_fundos')(e.target.value)} placeholder="Ex.: salário, negócio próprio, pensão" disabled={desactivado} /></Campo>
                <Campo rotulo="Finalidade do crédito"><Input value={f.finalidade_credito} onChange={e => set('finalidade_credito')(e.target.value)} disabled={desactivado} /></Campo>
                {empresa && <Campo rotulo="Beneficiário efectivo" className="sm:col-span-2"><Input value={f.beneficiario_efectivo} onChange={e => set('beneficiario_efectivo')(e.target.value)} placeholder="Pessoa(s) singular(es) que controla(m) a empresa e % de participação" disabled={desactivado} /></Campo>}
                <Campo rotulo="Pessoa politicamente exposta (PEP)?">
                    <Select value={f.pep || undefined} onValueChange={set('pep')} disabled={desactivado}>
                        <SelectTrigger><SelectValue placeholder="Por responder" /></SelectTrigger>
                        <SelectContent><SelectItem value="nao">Não</SelectItem><SelectItem value="sim">Sim</SelectItem></SelectContent>
                    </Select>
                </Campo>
                {f.pep === 'sim' && (
                    <>
                        <Campo rotulo="Relação"><Select value={f.pep_relacao} onValueChange={set('pep_relacao')} disabled={desactivado}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="proprio">O próprio</SelectItem><SelectItem value="familiar">Familiar próximo</SelectItem><SelectItem value="associado">Associado próximo</SelectItem></SelectContent>
                        </Select></Campo>
                        <Campo rotulo="Função pública exercida" className="sm:col-span-2"><Input value={f.pep_funcao} onChange={e => set('pep_funcao')(e.target.value)} disabled={desactivado} /></Campo>
                    </>
                )}
            </div>
            <fieldset className="mt-4">
                <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Documentos de suporte entregues e conferidos</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                    {(Object.keys(DOCUMENTOS_SUPORTE) as DocumentoSuporte[]).filter(d => empresa || !['certidao_registo_comercial', 'documento_representante'].includes(d)).map(d => (
                        <label key={d} className="flex items-center gap-2 text-sm">
                            <Checkbox checked={docs.includes(d)} disabled={desactivado} onCheckedChange={v => setDocs(x => v ? [...x, d] : x.filter(y => y !== d))} />
                            {DOCUMENTOS_SUPORTE[d]}
                        </label>
                    ))}
                </div>
            </fieldset>
            <Campo rotulo="Observações" className="mt-3"><Textarea rows={2} value={f.observacoes} onChange={e => set('observacoes')(e.target.value)} disabled={desactivado} /></Campo>
            {perfil?.actualizado_por_nome && <p className="mt-2 text-[11px] text-slate-500">Última alteração: {perfil.actualizado_por_nome}, {dataHoraPt(perfil.actualizado_em)}</p>}
        </Seccao>
    );
}

function Campo({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
    return <div className={cn('space-y-1', className)}><Label className="text-xs">{rotulo}</Label>{children}</div>;
}

function DialogoRegistar({ cliente, onClose, onSave, aoGuardar }: {
    cliente: ClienteKyc; onClose: () => void; aoGuardar: () => void;
    onSave: (d: { tipo: TipoVerificacao; fonte: FonteVerificacao; emissor?: string; controlos: string[]; notas?: string }) => Promise<unknown>;
}) {
    const [tipo, setTipo] = useState<TipoVerificacao>('inicial');
    const [fonte, setFonte] = useState<FonteVerificacao>('presencial');
    const [emissor, setEmissor] = useState('');
    const [controlos, setControlos] = useState<string[]>([]);
    const [notas, setNotas] = useState('');
    const [aGuardar, setAGuardar] = useState(false);
    const guardar = async () => {
        setAGuardar(true);
        const ok = await executar(() => onSave({ tipo, fonte, emissor, controlos, notas }), 'Verificação registada: aguarda a decisão de outro responsável');
        setAGuardar(false);
        if (ok) { aoGuardar(); onClose(); }
    };
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Registar verificação de identidade</DialogTitle>
                    <DialogDescription>{cliente.name} · {mascararDocumento(cliente.nif)}. O número fica guardado mascarado; a decisão é tomada por outro responsável.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Campo rotulo="Tipo"><Select value={tipo} onValueChange={v => setTipo(v as TipoVerificacao)}><SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{(Object.keys(ROTULO_TIPO_VERIFICACAO) as TipoVerificacao[]).map(t => <SelectItem key={t} value={t}>{ROTULO_TIPO_VERIFICACAO[t]}</SelectItem>)}</SelectContent></Select></Campo>
                    <Campo rotulo="Fonte"><Select value={fonte} onValueChange={v => setFonte(v as FonteVerificacao)}><SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{(Object.keys(ROTULO_FONTE) as FonteVerificacao[]).map(t => <SelectItem key={t} value={t}>{ROTULO_FONTE[t]}</SelectItem>)}</SelectContent></Select></Campo>
                    <Campo rotulo="Entidade emissora (opcional)" className="sm:col-span-2"><Input value={emissor} onChange={e => setEmissor(e.target.value)} placeholder="Ex.: Arquivo de Identificação de Luanda" /></Campo>
                </div>
                <fieldset>
                    <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Controlos efectuados</legend>
                    <div className="space-y-2">
                        {(Object.keys(CONTROLOS_VERIFICACAO) as Array<keyof typeof CONTROLOS_VERIFICACAO>).map(c => (
                            <label key={c} className="flex items-center gap-2 text-sm"><Checkbox checked={controlos.includes(c)} onCheckedChange={v => setControlos(x => v ? [...x, c] : x.filter(y => y !== c))} />{CONTROLOS_VERIFICACAO[c]}</label>
                        ))}
                    </div>
                </fieldset>
                <Campo rotulo="Notas"><Textarea rows={2} value={notas} onChange={e => setNotas(e.target.value)} /></Campo>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={guardar} disabled={aGuardar || !controlos.length}>{aGuardar && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Registar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoDecidir({ v, onClose, onSave, aoGuardar }: { v: VerificacaoKyc; onClose: () => void; aoGuardar: () => void; onSave: (d: 'verificado' | 'recusado', motivo: string) => Promise<unknown> }) {
    const [motivo, setMotivo] = useState('');
    const [aGuardar, setAGuardar] = useState(false);
    const decidir = async (d: 'verificado' | 'recusado') => {
        setAGuardar(true);
        const ok = await executar(() => onSave(d, motivo), d === 'verificado' ? 'Identidade confirmada' : 'Verificação recusada');
        setAGuardar(false);
        if (ok) { aoGuardar(); onClose(); }
    };
    return (
        <Dialog open onOpenChange={x => !x && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Decidir verificação KYC</DialogTitle>
                    <DialogDescription>Registada por {v.registado_por_nome} ({ROTULO_FONTE[v.fonte]}). A decisão fica registada na auditoria e não se altera depois.</DialogDescription>
                </DialogHeader>
                <Campo rotulo="Fundamento (obrigatório para recusar)"><Textarea rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} /></Campo>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => decidir('recusado')} disabled={aGuardar || motivo.trim().length < 10} className="text-red-700"><X className="mr-1 h-4 w-4" />Recusar</Button>
                    <Button onClick={() => decidir('verificado')} disabled={aGuardar}><Check className="mr-1 h-4 w-4" />Confirmar identidade</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoRever({ a, onClose, onSave, aoGuardar }: { a: AvaliacaoRisco; onClose: () => void; aoGuardar: () => void; onSave: (n: NivelRisco, parecer: string) => Promise<unknown> }) {
    const [nivel, setNivel] = useState<NivelRisco>(a.nivel);
    const [parecer, setParecer] = useState('');
    const [aGuardar, setAGuardar] = useState(false);
    const regras = lerJson<RegraDisparada[]>(a.regras, []);
    useEffect(() => { setNivel(a.nivel); }, [a]);
    const guardar = async () => {
        setAGuardar(true);
        const ok = await executar(() => onSave(nivel, parecer), 'Revisão registada');
        setAGuardar(false);
        if (ok) { aoGuardar(); onClose(); }
    };
    return (
        <Dialog open onOpenChange={x => !x && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Rever avaliação de risco</DialogTitle>
                    <DialogDescription>Calculado: {ROTULO_NIVEL[a.nivel]} ({a.pontuacao}/100). Pode confirmar ou alterar o nível com parecer fundamentado; as regras próprias impõem um mínimo.</DialogDescription>
                </DialogHeader>
                {regras.length > 0 && <ul className="text-xs text-amber-800 dark:text-amber-300">{regras.map(r => <li key={r.id}>• {r.descricao}</li>)}</ul>}
                <Campo rotulo="Nível final"><Select value={nivel} onValueChange={v => setNivel(v as NivelRisco)}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{(['baixo', 'medio', 'elevado'] as NivelRisco[]).map(n => <SelectItem key={n} value={n}>{ROTULO_NIVEL[n]}</SelectItem>)}</SelectContent></Select></Campo>
                <Campo rotulo="Parecer"><Textarea rows={4} value={parecer} onChange={e => setParecer(e.target.value)} placeholder="Fundamento da decisão, informação analisada e medidas de diligência a aplicar" /></Campo>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={guardar} disabled={aGuardar || parecer.trim().length < 10}>{nivel === a.nivel ? 'Confirmar nível' : `Alterar para ${ROTULO_NIVEL[nivel].toLowerCase()}`}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
