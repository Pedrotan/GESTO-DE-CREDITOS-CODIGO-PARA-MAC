import { useEffect, useMemo, useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Loader2, Save } from 'lucide-react';
import { Vazio, executar } from '@/componentes/rh/comum-rh';
import { NavegacaoCompliance, dataHoraPt, useActorCompliance, useCompliance } from '@/componentes/compliance/comum-compliance';
import { FACTORES, ROTULO_FACTOR, ROTULO_NIVEL, lerConfiguracao, validarConfiguracao, type ConfiguracaoRisco, type NivelRisco } from '@/bibliotecas/compliance/motor-risco';
import { ServicoCompliance } from '@/servicos/compliance/ServicoCompliance';
import { cn } from '@/bibliotecas/utils';
import { CONTROLOS, ROTULO_EFEITO, ROTULO_MODO, efeitoDe, type CodigoControlo, type Efeito, type ModoBloqueio } from '@/bibliotecas/compliance/politica-bloqueio';

const lista = (v: string) => v.split(/[,;\n]/u).map(x => x.trim()).filter(Boolean);

export default function ModeloRiscoCompliance() {
    const comp = useCompliance();
    const { actor, configurar } = useActorCompliance();
    const activo = ServicoCompliance.modeloActivo(comp.dados.modelos);
    const base = useMemo(() => lerConfiguracao(activo?.configuracao), [activo?.configuracao]);
    const [c, setC] = useState<ConfiguracaoRisco>(base);
    const [paises, setPaises] = useState(base.paisesRiscoElevado.join(', '));
    const [actividades, setActividades] = useState(base.actividadesRiscoElevado.join(', '));
    const [nome, setNome] = useState('');
    const [notas, setNotas] = useState('');
    const [aGuardar, setAGuardar] = useState(false);
    useEffect(() => { setC(base); setPaises(base.paisesRiscoElevado.join(', ')); setActividades(base.actividadesRiscoElevado.join(', ')); }, [base]);

    const proposta: ConfiguracaoRisco = { ...c, paisesRiscoElevado: lista(paises).map(p => p.toUpperCase()), actividadesRiscoElevado: lista(actividades) };
    const erros = validarConfiguracao(proposta);
    const alterado = JSON.stringify(proposta) !== JSON.stringify(base);
    const soma = FACTORES.reduce((s, f) => s + (Number(c.pesos[f]) || 0), 0);
    const num = (v: string) => (v === '' ? 0 : Number(v));
    const setM = (parte: Partial<ConfiguracaoRisco['monitorizacao']>) => setC(x => ({ ...x, monitorizacao: { ...x.monitorizacao, ...parte } }));
    const setB = (parte: Partial<ConfiguracaoRisco['bloqueios']>) => setC(x => ({ ...x, bloqueios: { ...x.bloqueios, ...parte } }));
    const setVj = (parte: Partial<NonNullable<ConfiguracaoRisco['bloqueios']['validacaoJuridica']>>) => setC(x => ({
        ...x, bloqueios: { ...x.bloqueios, validacaoJuridica: { referencia: '', data: '', responsavel: '', ...(x.bloqueios.validacaoJuridica || {}), ...parte } },
    }));

    const guardar = async () => {
        if (!actor) return;
        setAGuardar(true);
        const ok = await executar(() => ServicoCompliance.novaVersaoModelo(comp.dados.modelos, proposta, nome, notas, actor), 'Nova versão do modelo activada');
        setAGuardar(false);
        if (ok) { setNome(''); setNotas(''); void comp.recarregar(); }
    };

    return (
        <MainLayout title="Compliance" subtitle="Modelo de avaliação de risco (versionado)">
            <NavegacaoCompliance />
            <div className="mb-4">
                <h1 className="text-2xl font-extrabold">Modelo de risco</h1>
                <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
                    Pesos, escalões e prazos de revisão usados na avaliação de risco. Cada alteração cria uma versão nova (as anteriores ficam guardadas e cada
                    avaliação indica a versão que usou). Os valores iniciais são os da especificação e devem ser validados pela avaliação de risco da empresa.
                </p>
            </div>
            {!activo && !comp.aCarregar && <Vazio>Não há nenhuma versão activa do modelo de risco.</Vazio>}
            {activo && (
                <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                            <h2 className="text-base font-bold">Versão activa: v{activo.versao} · {activo.nome}</h2>
                            {!configurar && <span className="text-xs text-slate-500">Só leitura (sem permissão para alterar o modelo)</span>}
                        </div>

                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Pesos dos factores</h3>
                        <div className="space-y-2">
                            {FACTORES.map(f => (
                                <div key={f} className="flex items-center gap-3">
                                    <Label htmlFor={`peso-${f}`} className="flex-1 text-sm">{ROTULO_FACTOR[f]}</Label>
                                    <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-slate-100 sm:block dark:bg-slate-800"><div className="h-full bg-emerald-600" style={{ width: `${Math.min(100, c.pesos[f])}%` }} /></div>
                                    <Input id={`peso-${f}`} type="number" min={0} max={100} className="w-20 text-right" disabled={!configurar} value={c.pesos[f]}
                                        onChange={e => setC(x => ({ ...x, pesos: { ...x.pesos, [f]: num(e.target.value) } }))} />
                                    <span className="w-4 text-sm text-slate-500">%</span>
                                </div>
                            ))}
                            <p className={cn('text-right text-sm font-bold', soma === 100 ? 'text-emerald-700' : 'text-red-600')}>Total: {soma}%</p>
                        </div>

                        <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Escalões e revisão periódica</h3>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Num rotulo="Médio a partir de" valor={c.limiares.medio} disabled={!configurar} sufixo="pts" onChange={v => setC(x => ({ ...x, limiares: { ...x.limiares, medio: num(v) } }))} />
                            <Num rotulo="Elevado a partir de" valor={c.limiares.elevado} disabled={!configurar} sufixo="pts" onChange={v => setC(x => ({ ...x, limiares: { ...x.limiares, elevado: num(v) } }))} />
                            <div />
                            {(['baixo', 'medio', 'elevado'] as NivelRisco[]).map(n => (
                                <Num key={n} rotulo={`Rever risco ${ROTULO_NIVEL[n].toLowerCase()} a cada`} valor={c.revisaoMeses[n]} disabled={!configurar} sufixo="meses"
                                    onChange={v => setC(x => ({ ...x, revisaoMeses: { ...x.revisaoMeses, [n]: num(v) } }))} />
                            ))}
                            <Num rotulo="Dívida «atenção» a partir de" valor={c.exposicaoMesesRendimento.atencao} disabled={!configurar} sufixo="× rend."
                                onChange={v => setC(x => ({ ...x, exposicaoMesesRendimento: { ...x.exposicaoMesesRendimento, atencao: num(v) } }))} />
                            <Num rotulo="Dívida «elevada» a partir de" valor={c.exposicaoMesesRendimento.elevada} disabled={!configurar} sufixo="× rend."
                                onChange={v => setC(x => ({ ...x, exposicaoMesesRendimento: { ...x.exposicaoMesesRendimento, elevada: num(v) } }))} />
                        </div>

                        <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Monitorização de operações</h3>
                        <p className="mb-2 text-xs text-slate-500">Limites das regras de alerta (valores indicativos, a validar). Cada alteração cria uma versão nova; os alertas guardam a versão que os gerou.</p>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Num rotulo="Analisar operações dos últimos" valor={c.monitorizacao.diasRetroactivos} disabled={!configurar} sufixo="dias" onChange={v => setM({ diasRetroactivos: num(v) })} />
                            <Num rotulo="Numerário elevado a partir de" valor={c.monitorizacao.numerarioElevadoKz} disabled={!configurar} sufixo="Kz" onChange={v => setM({ numerarioElevadoKz: num(v) })} />
                            <Num rotulo="Crédito acima de" valor={c.monitorizacao.desembolsoMultiploRendimento} disabled={!configurar} sufixo="× rend." onChange={v => setM({ desembolsoMultiploRendimento: num(v) })} />
                            <Num rotulo="Sem rendimento: crédito a partir de" valor={c.monitorizacao.semRendimentoLimiteKz} disabled={!configurar} sufixo="Kz" onChange={v => setM({ semRendimentoLimiteKz: num(v) })} />
                            <Num rotulo="Fraccionamento: pagamentos" valor={c.monitorizacao.fraccionamento.minPagamentos} disabled={!configurar} sufixo="ou mais" onChange={v => setM({ fraccionamento: { ...c.monitorizacao.fraccionamento, minPagamentos: num(v) } })} />
                            <Num rotulo="… em" valor={c.monitorizacao.fraccionamento.dias} disabled={!configurar} sufixo="dias" onChange={v => setM({ fraccionamento: { ...c.monitorizacao.fraccionamento, dias: num(v) } })} />
                            <Num rotulo="… somando pelo menos" valor={c.monitorizacao.fraccionamento.totalKz} disabled={!configurar} sufixo="Kz" onChange={v => setM({ fraccionamento: { ...c.monitorizacao.fraccionamento, totalKz: num(v) } })} />
                            <Num rotulo="Pagamentos acima de" valor={c.monitorizacao.pagamentosRendimento.multiplo} disabled={!configurar} sufixo="× rend." onChange={v => setM({ pagamentosRendimento: { ...c.monitorizacao.pagamentosRendimento, multiplo: num(v) } })} />
                            <Num rotulo="… em" valor={c.monitorizacao.pagamentosRendimento.dias} disabled={!configurar} sufixo="dias" onChange={v => setM({ pagamentosRendimento: { ...c.monitorizacao.pagamentosRendimento, dias: num(v) } })} />
                            <Num rotulo="Liquidação rápida até" valor={c.monitorizacao.liquidacaoRapidaDias} disabled={!configurar} sufixo="dias" onChange={v => setM({ liquidacaoRapidaDias: num(v) })} />
                            <Num rotulo="Reforços: pelo menos" valor={c.monitorizacao.reforcos.minimo} disabled={!configurar} sufixo={`em ${c.monitorizacao.reforcos.dias} dias`} onChange={v => setM({ reforcos: { ...c.monitorizacao.reforcos, minimo: num(v) } })} />
                            <Num rotulo="Anulações por utilizador: pelo menos" valor={c.monitorizacao.anulacoes.minimo} disabled={!configurar} sufixo={`em ${c.monitorizacao.anulacoes.dias} dias`} onChange={v => setM({ anulacoes: { ...c.monitorizacao.anulacoes, minimo: num(v) } })} />
                            <Num rotulo="Transferência por confirmar há" valor={c.monitorizacao.pendenteDias} disabled={!configurar} sufixo="dias" onChange={v => setM({ pendenteDias: num(v) })} />
                            <Num rotulo="Redução manual da taxa a partir de" valor={c.monitorizacao.reducaoTaxaPct} disabled={!configurar} sufixo="%" onChange={v => setM({ reducaoTaxaPct: num(v) })} />
                            <Num rotulo="Crédito duplicado: até" valor={c.monitorizacao.duplicadoDias} disabled={!configurar} sufixo="dias" onChange={v => setM({ duplicadoDias: num(v) })} />
                        </div>

                        <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Controlo do crédito</h3>
                        <p className="mb-2 text-xs text-slate-500">Efeito da situação de Compliance do cliente ao conceder, aprovar ou reforçar créditos. Só impede no modo «Bloquear», que exige a validação jurídica registada.</p>
                        <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Modo do controlo do crédito">
                            {(Object.keys(ROTULO_MODO) as ModoBloqueio[]).map(m => (
                                <button key={m} type="button" role="radio" aria-checked={c.bloqueios.modo === m} disabled={!configurar} onClick={() => setB({ modo: m })}
                                    className={cn('rounded-lg border px-3 py-1.5 text-xs font-semibold', c.bloqueios.modo === m ? (m === 'bloqueio' ? 'border-red-600 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200' : 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200') : 'border-slate-200 dark:border-slate-700')}>
                                    {ROTULO_MODO[m]}
                                </button>
                            ))}
                        </div>
                        {c.bloqueios.modo === 'bloqueio' && (
                            <div className="mb-3 grid gap-2 rounded-xl border border-red-200 bg-red-50/50 p-3 sm:grid-cols-3 dark:border-red-900 dark:bg-red-950/20">
                                <p className="text-xs font-semibold text-red-800 sm:col-span-3 dark:text-red-200">Validação jurídica (obrigatória para bloquear)</p>
                                <div className="space-y-1"><Label className="text-xs">Referência do parecer</Label><Input value={c.bloqueios.validacaoJuridica?.referencia || ''} disabled={!configurar} onChange={e => setVj({ referencia: e.target.value })} /></div>
                                <div className="space-y-1"><Label className="text-xs">Data</Label><Input type="date" value={c.bloqueios.validacaoJuridica?.data || ''} disabled={!configurar} onChange={e => setVj({ data: e.target.value })} /></div>
                                <div className="space-y-1"><Label className="text-xs">Responsável</Label><Input value={c.bloqueios.validacaoJuridica?.responsavel || ''} disabled={!configurar} onChange={e => setVj({ responsavel: e.target.value })} /></div>
                            </div>
                        )}
                        <div className="grid gap-2 sm:grid-cols-2">
                            {(Object.keys(CONTROLOS) as CodigoControlo[]).map(k => {
                                const ctl = CONTROLOS[k];
                                return (
                                    <div key={k} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 dark:border-slate-800">
                                        <span className="text-xs">{ctl.titulo}</span>
                                        {ctl.fixo ? <span className="whitespace-nowrap text-[11px] font-bold text-red-700 dark:text-red-300">{ROTULO_EFEITO[ctl.fixo]} (fixo)</span> : (
                                            <select aria-label={ctl.titulo} disabled={!configurar} value={efeitoDe(c.bloqueios, k)} onChange={e => setB({ efeitos: { ...c.bloqueios.efeitos, [k]: e.target.value as Efeito } })}
                                                className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-900">
                                                {(ctl.opcoes || []).map(o => <option key={o} value={o}>{ROTULO_EFEITO[o]}</option>)}
                                            </select>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-2"><Num rotulo="Validade das autorizações de Compliance" valor={c.bloqueios.autorizacaoDias} disabled={!configurar} sufixo="dias" onChange={v => setB({ autorizacaoDias: num(v) })} /></div>

                        <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Listas</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1"><Label className="text-xs">Países de risco elevado (código ISO, separados por vírgulas)</Label>
                                <Input value={paises} onChange={e => setPaises(e.target.value)} disabled={!configurar} /></div>
                            <div className="space-y-1"><Label className="text-xs">Actividades de risco acrescido (palavras)</Label>
                                <Textarea rows={2} value={actividades} onChange={e => setActividades(e.target.value)} disabled={!configurar} /></div>
                        </div>

                        {configurar && alterado && (
                            <div className="mt-5 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
                                <p className="text-sm font-semibold">Guardar como versão {Math.max(0, ...comp.dados.modelos.map(m => m.versao)) + 1}</p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1"><Label className="text-xs">Nome da versão</Label><Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Calibração após piloto" /></div>
                                    <div className="space-y-1"><Label className="text-xs">Motivo da alteração</Label><Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Aprovado por… / com base em…" /></div>
                                </div>
                                {erros.length > 0 && <ul className="text-xs text-red-700 dark:text-red-300">{erros.map(e => <li key={e}>• {e}</li>)}</ul>}
                                <div className="flex justify-end gap-2">
                                    <Button variant="outline" onClick={() => { setC(base); setPaises(base.paisesRiscoElevado.join(', ')); setActividades(base.actividadesRiscoElevado.join(', ')); }}>Descartar</Button>
                                    <Button onClick={guardar} disabled={aGuardar || erros.length > 0 || !nome.trim() || notas.trim().length < 10}>
                                        {aGuardar ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Criar e activar versão
                                    </Button>
                                </div>
                                <p className="text-[11px] text-slate-500">As avaliações já feitas mantêm a versão com que foram calculadas; as próximas usam a nova.</p>
                            </div>
                        )}
                    </section>

                    <aside className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="mb-3 text-base font-bold">Versões</h2>
                        <ol className="space-y-3">
                            {comp.dados.modelos.map(m => (
                                <li key={m.id} className={cn('rounded-xl border p-3 text-sm', m.activo ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800')}>
                                    <div className="flex items-center justify-between gap-2"><strong>v{m.versao} · {m.nome}</strong>{m.activo === 1 && <span className="text-[11px] font-bold text-emerald-700">ACTIVA</span>}</div>
                                    <p className="text-xs text-slate-500">{dataHoraPt(m.criado_em)} · {m.criado_por_nome || '—'}</p>
                                    {m.notas && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{m.notas}</p>}
                                </li>
                            ))}
                        </ol>
                    </aside>
                </div>
            )}
        </MainLayout>
    );
}

function Num({ rotulo, valor, onChange, disabled, sufixo }: { rotulo: string; valor: number; onChange: (v: string) => void; disabled?: boolean; sufixo: string }) {
    return (
        <div className="space-y-1">
            <Label className="text-xs">{rotulo}</Label>
            <div className="flex items-center gap-2"><Input type="number" min={0} className="w-24 text-right" value={valor} disabled={disabled} onChange={e => onChange(e.target.value)} /><span className="text-xs text-slate-500">{sufixo}</span></div>
        </div>
    );
}
