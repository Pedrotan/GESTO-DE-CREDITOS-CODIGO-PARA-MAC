// Gráficos do Painel de RH (G1–G5): uma só escala por gráfico, linhas de 2 px, barras com cantos de 4 px, grelha
// discreta, tooltip, legenda quando há 2+ séries, «Ver tabela» e estado vazio explicativo. Cores fixas por
// departamento e cores de estado reservadas (presente, atraso, falta, férias/licença, sem registo).
import { useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COR_ESTADO, corDepartamento, ROTULO_ESTADO, type EstadoMapa, type TiposAusencia } from '@/bibliotecas/rh/painel-rh';
import { cn } from '@/bibliotecas/utils';
import { kz } from '@/componentes/rh/comum-rh';

const EIXO = { fontSize: 11, fill: '#5B6474' };
const GRELHA = '#EAECF0';
const SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const milhoes = (minor: number) => `${(minor / 100 / 1_000_000).toLocaleString('pt-PT', { maximumFractionDigits: 2 })} M`;

/** Moldura comum: título, subtítulo, «Ver tabela» e o estado vazio. */
export function CartaoGrafico({ titulo, subtitulo, children, tabela, vazio, rodape, accaoTitulo, semTabela = false, encher = true }: {
    titulo: string; subtitulo: string; children: ReactNode; tabela: { colunas: string[]; linhas: Array<Array<string | number>> }; vazio?: string | null; rodape?: ReactNode; accaoTitulo?: ReactNode; semTabela?: boolean; encher?: boolean;
}) {
    const [verTabela, setVerTabela] = useState(false);
    return (
        <section className="flex flex-col rounded-[14px] border border-[#E4E7EC] bg-white p-[18px] dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-2.5">
                <div><h2 className="text-base font-extrabold">{titulo}</h2><p className="mt-0.5 text-xs text-[#5B6474] dark:text-slate-400">{subtitulo}</p></div>
                {accaoTitulo}
            </div>
            <div className={cn("mt-3.5", encher && "min-h-[190px] flex-1")}>
                {vazio ? <div className="flex h-[190px] items-center justify-center rounded-xl border border-dashed border-[#D0D5DD] px-6 text-center text-sm text-[#5B6474] dark:border-slate-700">{vazio}</div>
                    : verTabela ? (
                        <div className="max-h-[230px] overflow-auto rounded-lg border border-[#EAECF0] dark:border-slate-800">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-[#F9FAFB] text-left text-xs text-[#475467] dark:bg-slate-950"><tr>{tabela.colunas.map(c => <th key={c} className="px-3 py-2 font-semibold">{c}</th>)}</tr></thead>
                                <tbody>{tabela.linhas.map((l, i) => <tr key={i} className="border-t border-[#F2F4F7] dark:border-slate-800">{l.map((v, j) => <td key={j} className={cn('px-3 py-1.5', j > 0 && 'text-right tabular-nums')}>{v}</td>)}</tr>)}</tbody>
                            </table>
                        </div>
                    ) : children}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-[18px] gap-y-1 text-[13px]">
                {rodape}
                {!vazio && !semTabela && <button type="button" className="ml-auto text-[13px] font-semibold text-[#1D4ED8] hover:underline dark:text-sky-400" onClick={() => setVerTabela(v => !v)}>{verTabela ? 'Ver gráfico' : 'Ver tabela'}</button>}
            </div>
        </section>
    );
}

function Dica({ active, payload, label, formatar }: { active?: boolean; payload?: Array<{ value: number; payload: Record<string, unknown> }>; label?: string; formatar: (v: number, p: Record<string, unknown>, l?: string) => string }) {
    if (!active || !payload?.length) return null;
    return <div className="rounded-lg border border-[#E4E7EC] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#344054] shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{formatar(payload[0].value, payload[0].payload, label)}</div>;
}

/** G1: assiduidade diária com a meta tracejada; clicar num ponto abre o dia no livro de ponto. */
export function GraficoAssiduidade({ dados, meta, onDia }: { dados: Array<{ data: string; taxa: number; presentes: number; esperados: number }>; meta: number; onDia: (data: string) => void }) {
    const media = dados.length ? Math.round((dados.reduce((s, d) => s + d.taxa, 0) / dados.length) * 10) / 10 : null;
    const pior = dados.length ? dados.reduce((a, b) => (b.taxa < a.taxa ? b : a)) : null;
    return (
        <CartaoGrafico titulo="Assiduidade diária" subtitulo={`% de funcionários presentes, últimos ${dados.length || 20} dias úteis`}
            vazio={dados.length < 2 ? 'Ainda não há dias úteis suficientes com o livro de ponto preenchido para mostrar a evolução.' : null}
            tabela={{ colunas: ['Dia', 'Presentes', 'Esperados', '%'], linhas: dados.map(d => [dataCurta(d.data), d.presentes, d.esperados, `${d.taxa}%`]) }}
            rodape={media !== null && <><span>Média: <strong>{media.toLocaleString('pt-PT')}%</strong></span>{pior && <span>Pior dia: <strong>{dataCurta(pior.data)} ({pior.taxa.toLocaleString('pt-PT')}%)</strong></span>}</>}>
            <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} onClick={e => { const p = (e as { activeLabel?: string } | null)?.activeLabel; if (p) onDia(p); }}>
                    <CartesianGrid vertical={false} stroke={GRELHA} />
                    <XAxis dataKey="data" tickFormatter={dataCurta} tick={EIXO} axisLine={{ stroke: '#D0D5DD' }} tickLine={false} minTickGap={24} />
                    <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={v => `${v}%`} tick={EIXO} axisLine={false} tickLine={false} />
                    <Tooltip content={<Dica formatar={(v, p) => `${dataCurta(String(p.data))}: ${v.toLocaleString('pt-PT')}% (${p.presentes} de ${p.esperados})`} />} />
                    <ReferenceLine y={meta} stroke="#475467" strokeDasharray="4 4" label={{ value: `meta ${meta}%`, position: 'insideTopRight', fontSize: 11, fill: '#475467' }} />
                    <Area type="monotone" dataKey="taxa" stroke="#2a78d6" strokeWidth={2} fill="#2a78d6" fillOpacity={0.08} dot={false} activeDot={{ r: 4, cursor: 'pointer' }} />
                </AreaChart>
            </ResponsiveContainer>
        </CartaoGrafico>
    );
}

/** G2: massa salarial mensal (12 meses, o actual destacado); clicar abre o processamento desse mês. */
const MESES_EXTENSO: Record<string, string> = { Jan: 'Janeiro', Fev: 'Fevereiro', Mar: 'Março', Abr: 'Abril', Mai: 'Maio', Jun: 'Junho', Jul: 'Julho', Ago: 'Agosto', Set: 'Setembro', Out: 'Outubro', Nov: 'Novembro', Dez: 'Dezembro' };
export function GraficoMassa({ dados, onMes }: { dados: Array<{ mes: string; rotulo: string; total: number; real: boolean; estimado: boolean }>; onMes: (mes: string) => void }) {
    const comValor = dados.filter(d => d.total > 0);
    const actual = dados[dados.length - 1];
    const anoAntes = dados[0];
    const variacaoAnual = actual && anoAntes && anoAntes.total > 0 && actual.total > 0 ? Math.round(((actual.total - anoAntes.total) / anoAntes.total) * 1000) / 10 : null;
    return (
        <CartaoGrafico semTabela titulo="Massa salarial mensal" subtitulo="Salário base + subsídios, últimos 12 meses"
            vazio={comValor.length < 2 ? 'São precisos pelo menos 2 meses de salários processados para mostrar a evolução. Até lá, veja a massa salarial base nos indicadores.' : null}
            tabela={{ colunas: ['Mês', 'Total'], linhas: dados.map(d => [`${d.rotulo} ${d.mes.slice(0, 4)}`, d.total ? `${kz(d.total)}${d.estimado ? ' (base, estimado)' : ''}` : '—']) }}
            rodape={actual && <><span>{MESES_EXTENSO[actual.rotulo] || actual.rotulo}: <strong>{actual.total ? kz(actual.total) : '—'}</strong>{actual.estimado ? ' (base real)' : ''}</span>
                {variacaoAnual !== null && <span>Variação anual: <strong className={variacaoAnual >= 0 ? 'text-[#067647]' : 'text-[#B42318]'}>{variacaoAnual >= 0 ? '▲' : '▼'} {Math.abs(variacaoAnual).toLocaleString('pt-PT')}%</strong></span>}</>}>
            <ResponsiveContainer width="100%" height={190}>
                <BarChart data={dados} margin={{ top: 8, right: 2, bottom: 0, left: 2 }} barCategoryGap={3}>
                    <XAxis dataKey="rotulo" tick={EIXO} axisLine={{ stroke: '#D0D5DD' }} tickLine={false} />
                    <YAxis hide domain={[0, 'dataMax']} />
                    <Tooltip cursor={{ fill: '#F2F4F7' }} content={<Dica formatar={(v, p) => `${p.rotulo} ${String(p.mes).slice(0, 4)}: ${v ? kz(v) : 'sem processamento'}${p.estimado ? ' (base, estimado)' : ''}`} />} />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d: { mes?: string }) => d.mes && onMes(d.mes)}>
                        {dados.map((d, i) => <Cell key={d.mes} fill={i === dados.length - 1 ? '#2a78d6' : '#9EC3EE'} fillOpacity={d.estimado ? 0.55 : 1} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </CartaoGrafico>
    );
}

type Departamento = { id: string; nome: string; funcionarios: number; massa: number | null; presentesHoje: number };
/** G3: funcionários por departamento (alterna para massa salarial e presença hoje); clicar filtra o painel. */
export function GraficoDepartamentos({ dados, ordem, salarios, onDepartamento }: { dados: Departamento[]; ordem: string[]; salarios: boolean; onDepartamento: (id: string) => void }) {
    const [vista, setVista] = useState<'funcionarios' | 'massa' | 'presenca'>('funcionarios');
    const valor = (d: Departamento) => (vista === 'massa' ? d.massa || 0 : vista === 'presenca' ? d.presentesHoje : d.funcionarios);
    const lista = [...dados].sort((a, b) => valor(b) - valor(a));
    const maximo = Math.max(1, ...lista.map(valor));
    const total = lista.reduce((s, d) => s + valor(d), 0);
    const totalFuncionarios = dados.reduce((s, d) => s + d.funcionarios, 0);
    const formatar = (d: Departamento) => (vista === 'massa' ? kz(valor(d)) : vista === 'presenca' ? `${d.presentesHoje} de ${d.funcionarios}` : String(d.funcionarios));
    return (
        <CartaoGrafico titulo={vista === 'massa' ? 'Massa salarial por departamento' : vista === 'presenca' ? 'Presença hoje por departamento' : 'Funcionários por departamento'} subtitulo={`${totalFuncionarios} funcionários activos`} semTabela encher={false}
            vazio={dados.length === 0 ? 'Ainda não há funcionários activos atribuídos a departamentos.' : null}
            tabela={{ colunas: ['Departamento', 'Funcionários', ...(salarios ? ['Massa salarial'] : []), 'Presentes hoje'], linhas: lista.map(d => [d.nome, d.funcionarios, ...(salarios ? [d.massa !== null ? kz(d.massa) : '—'] : []), d.presentesHoje]) }}
            rodape={<div className="mt-1.5 grid w-full grid-cols-2 gap-2.5 border-t border-[#F2F4F7] pt-3.5 text-[13px] dark:border-slate-800">
                {(vista === 'massa' || !salarios ? [['funcionarios', 'Funcionários por departamento']] : [['massa', 'Massa salarial por departamento']]).map(([id, r]) => (
                    <div key={id}>{r} <button type="button" className="font-semibold text-[#1D4ED8] hover:underline dark:text-sky-400" onClick={() => setVista(id as typeof vista)}>ver</button></div>
                ))}
                {[vista === 'presenca' ? ['funcionarios', 'Funcionários por departamento'] : ['presenca', 'Presença hoje por departamento']].map(([id, r]) => (
                    <div key={id} className="text-right">{r} <button type="button" className="font-semibold text-[#1D4ED8] hover:underline dark:text-sky-400" onClick={() => setVista(id as typeof vista)}>ver</button></div>
                ))}
            </div>}>
            <div className="mt-1 flex flex-col gap-3.5 pt-1">
                {lista.map(d => {
                    const v = valor(d);
                    const pct = total ? Math.round((v / total) * 100) : 0;
                    return (
                        <button key={d.id || 'sem'} type="button" title={`${d.nome}: ${formatar(d)}`} disabled={!d.id} onClick={() => d.id && onDepartamento(d.id)}
                            className="grid grid-cols-[130px_1fr_auto] items-center gap-3 rounded-md text-left enabled:hover:bg-[#F9FAFB] dark:enabled:hover:bg-slate-800">
                            <span className="truncate text-[13px] font-semibold">{d.nome}</span>
                            <span className="h-3.5 rounded bg-[#F2F4F7] dark:bg-slate-800"><span className="block h-3.5 rounded" style={{ width: `${(v / maximo) * 100}%`, background: corDepartamento(ordem, d.id || null) }} /></span>
                            <span className="min-w-[70px] text-right text-[13px] tabular-nums text-[#344054] dark:text-slate-300"><strong>{vista === 'massa' ? milhoes(v) : v}</strong> · {pct}%</span>
                        </button>
                    );
                })}
            </div>
        </CartaoGrafico>
    );
}

const TIPOS: Array<{ chave: keyof TiposAusencia; nome: string; cor: string }> = [
    { chave: 'ferias', nome: 'Férias', cor: '#2a78d6' }, { chave: 'faltas_justificadas', nome: 'Faltas justificadas', cor: '#1baf7a' },
    { chave: 'faltas_injustificadas', nome: 'Faltas injustificadas', cor: '#e34948' }, { chave: 'licencas', nome: 'Licenças', cor: '#6250d6' }, { chave: 'dispensas', nome: 'Dispensas', cor: '#eda100' },
];
/** G4: ausências do período por tipo (barra 100% segmentada) e por dia da semana. */
export function GraficoAusencias({ tipos, semana, periodo, onTipo }: { tipos: TiposAusencia; semana: number[]; periodo: string; onTipo: (chave: keyof TiposAusencia) => void }) {
    const total = TIPOS.reduce((s, t) => s + tipos[t.chave], 0);
    const maxSemana = Math.max(1, ...semana);
    return (
        <CartaoGrafico titulo="Ausências do mês por tipo" subtitulo={`Dias de ausência em ${periodo}`} semTabela
            vazio={total === 0 ? 'Sem férias, faltas, licenças ou dispensas no período escolhido.' : null}
            tabela={{ colunas: ['Tipo', 'Dias'], linhas: [...TIPOS.map(t => [t.nome, tipos[t.chave]]), ...SEMANA.map((d, i) => [`${d} (sem férias)`, semana[i]])] }}>
            <div className="mt-1 flex h-[26px] gap-0.5 overflow-hidden rounded-md">
                {TIPOS.filter(t => tipos[t.chave] > 0).map(t => (
                    <button key={t.chave} type="button" title={`${t.nome}: ${tipos[t.chave]} dia(s)`} aria-label={`${t.nome}: ${tipos[t.chave]} dia(s)`} onClick={() => onTipo(t.chave)}
                        style={{ flex: tipos[t.chave], background: t.cor }} />
                ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5">
                {TIPOS.filter(t => tipos[t.chave] > 0).map(t => <li key={t.chave} className="inline-flex items-center gap-1.5 text-xs text-[#344054] dark:text-slate-300"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: t.cor }} aria-hidden="true" />{t.nome} · <strong>{tipos[t.chave]}</strong></li>)}
            </ul>
            <p className="mb-2 mt-[18px] text-xs font-semibold text-[#475467] dark:text-slate-400">Ausências por dia da semana</p>
            <div className="grid h-[90px] grid-cols-5 items-end gap-2">
                {semana.map((v, i) => (
                    <div key={SEMANA[i]} className="flex h-full flex-col justify-end" title={`${SEMANA[i]}: ${v} ausência(s)`}>
                        <div className="min-h-1 rounded-t bg-[#eb6834]" style={{ height: `${(v / maxSemana) * 100}%` }} />
                    </div>
                ))}
            </div>
            <div className="mt-1.5 grid grid-cols-5 gap-2">{SEMANA.map(d => <span key={d} className="text-center text-[11px] tabular-nums text-[#5B6474]">{d}</span>)}</div>
        </CartaoGrafico>
    );
}

/** G5: mapa de presença do mês (funcionário × dia útil); clicar abre o dia no livro de ponto. */
export function MapaPresenca({ mapa, dias, titulo, onDia }: {
    mapa: Array<{ funcionarioId: string; nome: string; dias: Array<{ data: string; estado: EstadoMapa }>; taxa: number | null }>; dias: string[]; titulo: string; onDia: (funcionarioId: string, data: string) => void;
}) {
    const [verTabela, setVerTabela] = useState(false);
    const legenda = (['P', 'A', 'F', 'L', 'S'] as const);
    return (
        <section className="rounded-[14px] border border-[#E4E7EC] bg-white p-[18px] dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-2.5">
                <div><h2 className="text-base font-extrabold">Mapa de presença · {titulo}</h2><p className="mt-0.5 text-xs text-[#5B6474] dark:text-slate-400">Cada quadrado é um dia útil. Clique para abrir o dia no livro de ponto.</p></div>
                <div className="flex flex-wrap items-center gap-3">
                    {legenda.map(e => <span key={e} className="inline-flex items-center gap-1.5 text-xs text-[#344054] dark:text-slate-300"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COR_ESTADO[e] }} aria-hidden="true" />{ROTULO_ESTADO[e]}</span>)}
                </div>
            </div>
            {mapa.length === 0 || dias.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-[#D0D5DD] p-6 text-center text-sm text-[#5B6474]">Sem funcionários ou dias úteis neste mês.</p> : verTabela ? (
                <div className="mt-3.5 max-h-[320px] overflow-auto rounded-lg border border-[#EAECF0] dark:border-slate-800">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-[#F9FAFB] text-left text-xs text-[#475467] dark:bg-slate-950"><tr><th className="px-3 py-2">Funcionário</th>{legenda.map(e => <th key={e} className="px-2 py-2 text-right">{ROTULO_ESTADO[e]}</th>)}<th className="px-3 py-2 text-right">Taxa</th></tr></thead>
                        <tbody>{mapa.map(r => <tr key={r.funcionarioId} className="border-t border-[#F2F4F7] dark:border-slate-800"><td className="px-3 py-1.5">{r.nome}</td>
                            {legenda.map(e => <td key={e} className="px-2 py-1.5 text-right tabular-nums">{r.dias.filter(d => d.estado === e).length}</td>)}<td className="px-3 py-1.5 text-right tabular-nums">{r.taxa ?? '—'}{r.taxa !== null ? '%' : ''}</td></tr>)}</tbody>
                    </table>
                </div>
            ) : (
                <div className="mt-3.5 overflow-x-auto">
                    <div className="flex min-w-[900px] flex-col gap-1.5">
                        {mapa.map(r => (
                            <div key={r.funcionarioId} className="grid items-center gap-3" style={{ gridTemplateColumns: '260px 1fr 70px' }}>
                                <span className="truncate text-[13px] font-semibold">{r.nome}</span>
                                <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
                                    {r.dias.map(d => {
                                        const rotulo = `${dataCurta(d.data)}: ${d.estado ? ROTULO_ESTADO[d.estado] : 'dia sem trabalho'}`;
                                        return d.estado === 'futuro' || d.estado === null
                                            ? <span key={d.data} title={rotulo} className={cn('h-[22px] rounded', d.estado === 'futuro' ? 'bg-white ring-1 ring-inset ring-[#E4E7EC] dark:bg-slate-900 dark:ring-slate-700' : 'bg-[#F9FAFB] dark:bg-slate-800/40')} />
                                            : <button key={d.data} type="button" title={rotulo} aria-label={`${r.nome}, ${rotulo}`} onClick={() => onDia(r.funcionarioId, d.data)}
                                                className="h-[22px] rounded hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" style={{ background: COR_ESTADO[d.estado] }} />;
                                    })}
                                </div>
                                <span className="text-right text-[13px] tabular-nums">{r.taxa ?? '—'}{r.taxa !== null ? '%' : ''}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
