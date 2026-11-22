import { useEffect, useMemo, useState } from 'react';
import { Download, Search, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/componentes/ui/dialog';
import { cn } from '@/bibliotecas/utils';
import {
    erroPeriodoPersonalizado, ROTULO_CAMPO, ROTULO_ORDENAR, ROTULO_PERIODO, ROTULO_TIPO, descreverFiltros,
    type AmbitoExportacao, type CampoExportacao, type FiltroDados, type FiltrosContactos, type FormatoExportacao, type LinhaContacto, type Ordenacao,
    type PedidoExportacao, type PeriodoCadastro, type TipoCliente,
} from '@/bibliotecas/contactos/agenda-contactos';
import type { PreferenciasExportacao } from './preferencias-contactos';
import { btn, btnPrimario, campo } from './estilos-contactos';


export type EstadoInicialExportacao = { ambito: AmbitoExportacao; periodo?: PeriodoCadastro; cliente?: { id: string; nome: string } | null };

const PERIODOS_MODAL: PeriodoCadastro[] = ['qualquer', 'hoje', 'esta_semana', 'este_mes', 'mes_passado', 'ultimos_3_meses', 'este_ano', 'personalizado'];
const FORMATOS: Array<{ id: FormatoExportacao; nome: string; ajuda: string }> = [
    { id: 'pdf', nome: 'PDF', ajuda: 'Imprimir / partilhar' }, { id: 'xlsx', nome: 'Excel', ajuda: '.xlsx' },
    { id: 'csv', nome: 'CSV', ajuda: 'Importar noutro sistema' }, { id: 'vcf', nome: 'vCard', ajuda: 'Telemóvel / Outlook' },
];

export function ModalExportar({
    aberto, inicial, filtrosPagina, seleccionados, totalTodos, provincias, preferencias, podeListas, podeNif,
    contar, procurar, onFechar, onExportar, onCopiar, onPreVisualizar, onGuardarPreferencias,
}: {
    aberto: boolean; inicial: EstadoInicialExportacao; filtrosPagina: FiltrosContactos; seleccionados: string[]; totalTodos: number; provincias: string[];
    preferencias: PreferenciasExportacao; podeListas: boolean; podeNif: boolean;
    contar: (p: PedidoExportacao) => Promise<number>; procurar: (q: string) => Promise<LinhaContacto[]>;
    onFechar: () => void; onExportar: (p: PedidoExportacao, extra: { orientacao: 'vertical' | 'horizontal'; cabecalhoEmpresa: boolean }, total: number) => void;
    onCopiar: (p: PedidoExportacao) => void; onPreVisualizar: (p: PedidoExportacao, extra: { orientacao: 'vertical' | 'horizontal'; cabecalhoEmpresa: boolean }) => void;
    onGuardarPreferencias: (p: PreferenciasExportacao, predefinicao: boolean) => void;
}) {
    const [ambito, setAmbito] = useState<AmbitoExportacao>('filtro');
    const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(null);
    const [procura, setProcura] = useState('');
    const [sugestoes, setSugestoes] = useState<LinhaContacto[]>([]);
    const [periodo, setPeriodo] = useState<PeriodoCadastro>('qualquer');
    const [de, setDe] = useState(''); const [ate, setAte] = useState('');
    const [tipo, setTipo] = useState<TipoCliente | ''>(''); const [provincia, setProvincia] = useState(''); const [dados, setDados] = useState<FiltroDados>('');
    const [campos, setCampos] = useState<CampoExportacao[]>(preferencias.campos);
    const [formato, setFormato] = useState<FormatoExportacao>(preferencias.formato);
    const [ordenar, setOrdenar] = useState<Ordenacao>(preferencias.ordenar);
    const [orientacao, setOrientacao] = useState(preferencias.orientacao);
    const [cabecalhoEmpresa, setCabecalhoEmpresa] = useState(preferencias.cabecalhoEmpresa);
    const [predefinicao, setPredefinicao] = useState(false);
    const [total, setTotal] = useState<number | null>(null);

    // Estado inicial de cada abertura (âmbito pré-escolhido, período e filtros da página).
    useEffect(() => {
        if (!aberto) return;
        const amb = !podeListas ? 'um' : inicial.ambito;
        setAmbito(amb); setCliente(inicial.cliente || null); setProcura(''); setSugestoes([]);
        const vemDaPagina = amb === 'filtro';
        setPeriodo(inicial.periodo || (vemDaPagina ? filtrosPagina.periodo || 'qualquer' : 'qualquer'));
        setDe(vemDaPagina ? filtrosPagina.de || '' : ''); setAte(vemDaPagina ? filtrosPagina.ate || '' : '');
        setTipo(vemDaPagina ? filtrosPagina.tipo || '' : ''); setProvincia(vemDaPagina ? filtrosPagina.provincia || '' : ''); setDados(vemDaPagina ? filtrosPagina.dados || '' : '');
        setCampos(preferencias.campos.filter(c => c !== 'nif' || podeNif)); setFormato(preferencias.formato); setOrdenar(preferencias.ordenar);
        setOrientacao(preferencias.orientacao); setCabecalhoEmpresa(preferencias.cabecalhoEmpresa); setPredefinicao(false);
    }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

    const erroPeriodo = periodo === 'personalizado' ? erroPeriodoPersonalizado(de, ate) : null;
    const pedido = useMemo<PedidoExportacao>(() => ({
        ambito, filtrosPagina, ids: seleccionados, clienteId: cliente?.id,
        ...(ambito === 'um' ? {} : { periodo, de: periodo === 'personalizado' ? de : undefined, ate: periodo === 'personalizado' ? ate : undefined, tipo, provincia, dados }),
        campos: campos.filter(c => c !== 'qr_whatsapp' || formato === 'pdf'), formato, ordenar,
    }), [ambito, filtrosPagina, seleccionados, cliente, periodo, de, ate, tipo, provincia, dados, campos, formato, ordenar]);

    // Contagem ao vivo (pedido ao processo principal, debounce de 300 ms).
    useEffect(() => {
        if (!aberto) return;
        if (erroPeriodo || (ambito === 'um' && !cliente)) { setTotal(ambito === 'um' && !cliente ? 0 : null); return; }
        let vivo = true;
        const t = setTimeout(() => { void contar(pedido).then(n => { if (vivo) setTotal(n); }).catch(() => { if (vivo) setTotal(null); }); }, 300);
        return () => { vivo = false; clearTimeout(t); };
    }, [aberto, pedido, contar, erroPeriodo, ambito, cliente]);

    useEffect(() => {
        if (ambito !== 'um' || !procura.trim() || cliente?.nome === procura) { setSugestoes([]); return; }
        let vivo = true;
        const t = setTimeout(() => { void procurar(procura).then(l => { if (vivo) setSugestoes(l.slice(0, 8)); }); }, 300);
        return () => { vivo = false; clearTimeout(t); };
    }, [procura, ambito, procurar, cliente]);

    const alternarCampo = (c: CampoExportacao, v: boolean) => setCampos(lista => v ? [...lista, c] : lista.filter(x => x !== c));
    const n = total ?? 0;
    const bloqueado = total === null || n === 0 || Boolean(erroPeriodo) || !campos.includes('nome');
    const extra = { orientacao, cabecalhoEmpresa };
    const rotuloAmbito: Record<AmbitoExportacao, string> = { todos: 'Todos os clientes', filtro: 'Resultado do filtro actual', seleccionados: 'Clientes seleccionados', um: 'Um cliente' };
    const st = 'mb-2.5 text-[13px] font-bold text-[#344054] dark:text-slate-300';
    const opcao = (a: AmbitoExportacao, titulo: string, detalhe: string, desactivada?: boolean) => (
        <label className={cn('flex cursor-pointer items-start gap-2.5 rounded-[10px] border bg-white px-3.5 py-3 dark:bg-slate-900',
            ambito === a ? 'border-2 border-[#0B4A2F] bg-[#F6FEF9] px-[13px] py-[11px] dark:border-emerald-500 dark:bg-emerald-950/30' : 'border-[#D0D5DD] dark:border-slate-700',
            desactivada && 'cursor-not-allowed opacity-50')}>
            <input type="radio" name="ambito-exportacao" className="mt-1" checked={ambito === a} disabled={desactivada} onChange={() => setAmbito(a)} />
            <span><strong className="block text-sm">{titulo}</strong><span className="text-xs text-[#5B6474]">{detalhe}</span></span>
        </label>
    );

    return (
        <Dialog open={aberto} onOpenChange={v => { if (!v) onFechar(); }}>
            <DialogContent className="max-h-[92vh] max-w-[1080px] gap-0 overflow-hidden overflow-y-auto rounded-2xl p-0 [&>button]:hidden">
                <div className="flex items-center gap-4 bg-[#0B4A2F] px-6 py-5 text-white">
                    <div className="flex-1">
                        <DialogTitle className="text-[21px] font-extrabold">Exportar contactos</DialogTitle>
                        <DialogDescription className="mt-1 text-sm text-[#D1FADF]">Escolha quem entra na lista, o período, os campos e o formato.</DialogDescription>
                    </div>
                    <button type="button" aria-label="Fechar" onClick={onFechar} className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/30 hover:bg-white/10"><X className="h-4 w-4" /></button>
                </div>

                <div className="flex flex-wrap">
                    <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-[22px] px-6 py-5">
                        <section>
                            <p className={st}>1. Quem exportar</p>
                            <div className="grid gap-2.5 sm:grid-cols-2">
                                {opcao('todos', 'Todos os clientes', podeListas ? `${totalTodos} clientes` : 'Exige a permissão de exportar listas', !podeListas)}
                                {opcao('filtro', 'Resultado do filtro actual', podeListas ? descreverFiltros(filtrosPagina).slice(0, 3).join(' · ') : 'Exige a permissão de exportar listas', !podeListas)}
                                {opcao('seleccionados', 'Clientes seleccionados', seleccionados.length ? `${seleccionados.length} seleccionado(s) na lista` : 'Nenhum seleccionado na lista', !podeListas || !seleccionados.length)}
                                {opcao('um', 'Um cliente apenas', 'Ficha de contacto individual')}
                            </div>
                            {ambito === 'um' && (
                                <div className="relative mt-2.5">
                                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#667085]" aria-hidden="true" />
                                    <input className={cn(campo, 'w-full pl-9')} aria-label="Escolher cliente" placeholder="Pesquisar o cliente por nome, telefone ou NIF/BI"
                                        value={cliente && procura === '' ? cliente.nome : procura} onChange={e => { setProcura(e.target.value); setCliente(null); }} />
                                    {sugestoes.length > 0 && (
                                        <ul role="listbox" className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[#E4E7EC] bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                            {sugestoes.map(s => (
                                                <li key={s.id}><button type="button" role="option" aria-selected={false} className="w-full px-3 py-2 text-left text-sm hover:bg-[#F6FEF9] dark:hover:bg-slate-800"
                                                    onClick={() => { setCliente({ id: s.id, nome: s.nome }); setProcura(''); setSugestoes([]); }}>
                                                    <span className="font-semibold">{s.nome}</span> <span className="text-xs text-[#5B6474]">{ROTULO_TIPO[s.tipo]}{s.telefone ? ` · ${s.telefone}` : ''}</span>
                                                </button></li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </section>

                        <section className={cn(ambito === 'um' && 'pointer-events-none opacity-50')} aria-disabled={ambito === 'um'}>
                            <p className={st}>2. Período de cadastro</p>
                            <div className="flex flex-wrap gap-2">
                                {PERIODOS_MODAL.map(p => (
                                    <button key={p} type="button" aria-pressed={periodo === p} disabled={ambito === 'um'} onClick={() => setPeriodo(p)}
                                        className={cn('rounded-full border px-3 py-[7px] text-[13px] font-semibold', periodo === p ? 'border-[#0B4A2F] bg-[#0B4A2F] text-white' : 'border-[#D0D5DD] bg-white text-[#344054] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300')}>
                                        {ROTULO_PERIODO[p]}
                                    </button>
                                ))}
                            </div>
                            {periodo === 'personalizado' && (
                                <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                                    <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#344054] dark:text-slate-300">De<input type="date" className={campo} value={de} onChange={e => setDe(e.target.value)} /></label>
                                    <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#344054] dark:text-slate-300">Até<input type="date" className={campo} value={ate} onChange={e => setAte(e.target.value)} /></label>
                                    {erroPeriodo && <p role="alert" className="text-xs font-semibold text-red-600 sm:col-span-2">{erroPeriodo}</p>}
                                </div>
                            )}
                        </section>

                        <section className={cn(ambito === 'um' && 'pointer-events-none opacity-50')}>
                            <p className={st}>3. Filtros adicionais</p>
                            <div className="grid gap-2.5 sm:grid-cols-3">
                                <select className={campo} aria-label="Tipo de cliente" value={tipo} disabled={ambito === 'um'} onChange={e => setTipo(e.target.value as TipoCliente | '')}>
                                    <option value="">Todos os tipos</option>{(Object.keys(ROTULO_TIPO) as TipoCliente[]).map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
                                </select>
                                <select className={campo} aria-label="Província" value={provincia} disabled={ambito === 'um'} onChange={e => setProvincia(e.target.value)}>
                                    <option value="">Todas as províncias</option>{provincias.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                                <select className={campo} aria-label="Dados" value={dados} disabled={ambito === 'um'} onChange={e => setDados(e.target.value as FiltroDados)}>
                                    <option value="">Todos</option><option value="com_telefone">Só com telefone</option><option value="com_email">Só com email</option>
                                </select>
                            </div>
                        </section>

                        <section>
                            <p className={st}>4. Campos a incluir</p>
                            <div className="grid gap-2.5 sm:grid-cols-3">
                                {(Object.keys(ROTULO_CAMPO) as CampoExportacao[]).map(c => {
                                    const desactivado = (c === 'nif' && !podeNif) || (c === 'qr_whatsapp' && formato !== 'pdf') || c === 'nome';
                                    return (
                                        <label key={c} className={cn('flex items-center gap-2 text-sm text-[#344054] dark:text-slate-300', desactivado && c !== 'nome' && 'opacity-50')}
                                            title={c === 'nif' && !podeNif ? 'Só administradores podem incluir o NIF/BI' : c === 'qr_whatsapp' ? 'Só no PDF' : undefined}>
                                            <input type="checkbox" checked={campos.includes(c) && !(c === 'qr_whatsapp' && formato !== 'pdf')} disabled={desactivado} onChange={e => alternarCampo(c, e.target.checked)} />
                                            {ROTULO_CAMPO[c]}{c === 'qr_whatsapp' ? ' (só PDF)' : ''}
                                        </label>
                                    );
                                })}
                            </div>
                        </section>

                        <section>
                            <p className={st}>5. Formato</p>
                            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                                {FORMATOS.map(f => (
                                    <button key={f.id} type="button" aria-pressed={formato === f.id} onClick={() => setFormato(f.id)}
                                        className={cn('flex flex-col items-center gap-1.5 rounded-[10px] border px-2 py-3.5 text-[13px] font-bold', formato === f.id ? 'border-2 border-[#0B4A2F] bg-[#F6FEF9] text-[#085D3A] dark:border-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-[#D0D5DD] bg-white text-[#344054] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300')}>
                                        {f.nome}<span className="text-[11px] font-medium text-[#5B6474]">{f.ajuda}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                                <select className={campo} aria-label="Ordenar" value={ordenar} onChange={e => setOrdenar(e.target.value as Ordenacao)}>
                                    {(Object.keys(ROTULO_ORDENAR) as Ordenacao[]).map(o => <option key={o} value={o}>Ordenar: {ROTULO_ORDENAR[o].toLowerCase()}</option>)}
                                </select>
                                <select className={campo} aria-label="Orientação do PDF" value={orientacao} disabled={formato !== 'pdf'} onChange={e => setOrientacao(e.target.value as 'vertical' | 'horizontal')}>
                                    <option value="vertical">PDF: A4 vertical</option><option value="horizontal">PDF: A4 horizontal</option>
                                </select>
                            </div>
                        </section>
                    </div>

                    <aside className="flex flex-[1_1_300px] flex-col gap-4 border-l border-[#E4E7EC] bg-[#F9FAFB] p-5 sm:max-w-[360px] dark:border-slate-800 dark:bg-slate-900/60">
                        <div>
                            <p className={st}>Resumo</p>
                            {[
                                ['Âmbito', rotuloAmbito[ambito]],
                                ...(ambito === 'um' ? [['Cliente', cliente?.nome || '—']] : []),
                                ['Período', ambito === 'um' ? '—' : periodo === 'personalizado' ? `${de || '…'} a ${ate || '…'}` : ROTULO_PERIODO[periodo]],
                                ['Campos', String(pedido.campos.length)],
                                ['Formato', formato === 'pdf' ? `PDF · A4 ${orientacao}` : FORMATOS.find(f => f.id === formato)!.nome],
                            ].map(([k, v], i, arr) => (
                                <div key={k} className={cn('flex justify-between gap-2.5 py-2 text-sm', i < arr.length - 1 && 'border-b border-[#F2F4F7] dark:border-slate-800')}>
                                    <span className="text-[#5B6474]">{k}</span><strong className="text-right">{v}</strong>
                                </div>
                            ))}
                        </div>
                        <div className="rounded-xl border border-[#ABEFC6] bg-[#ECFDF3] p-4 dark:border-emerald-800 dark:bg-emerald-950/40" aria-live="polite">
                            <div className="text-[13px] text-[#085D3A] dark:text-emerald-300">Contactos a exportar</div>
                            <div className="text-[32px] font-extrabold text-[#054F31] dark:text-emerald-200">{total === null ? '…' : n}</div>
                            {total === 0 && <div className="text-xs text-[#085D3A]">Nenhum cliente corresponde a estas opções</div>}
                        </div>
                        <label className="flex items-center gap-2 text-sm text-[#344054] dark:text-slate-300"><input type="checkbox" checked={cabecalhoEmpresa} onChange={e => setCabecalhoEmpresa(e.target.checked)} />Incluir cabeçalho com logótipo e NIF da empresa</label>
                        <label className="flex items-center gap-2 text-sm text-[#344054] dark:text-slate-300"><input type="checkbox" checked={predefinicao} onChange={e => setPredefinicao(e.target.checked)} />Guardar estas opções como predefinição</label>
                        <button type="button" className="self-start text-sm font-semibold text-[#0B6B43] hover:underline disabled:opacity-50 dark:text-emerald-400" disabled={bloqueado} onClick={() => onPreVisualizar({ ...pedido, formato: 'pdf' }, extra)}>Pré-visualizar PDF →</button>
                    </aside>
                </div>

                <div className="flex flex-wrap justify-end gap-2.5 border-t border-[#E4E7EC] px-6 py-3.5 dark:border-slate-800">
                    <button type="button" className={btn} onClick={onFechar}>Cancelar</button>
                    <button type="button" className={btn} disabled={bloqueado} onClick={() => onCopiar(pedido)}>Copiar para a área de transferência</button>
                    <button type="button" className={btnPrimario} disabled={bloqueado} title={total === 0 ? 'Nenhum cliente corresponde a estas opções' : undefined}
                        onClick={() => { onGuardarPreferencias({ campos, formato, ordenar, orientacao, cabecalhoEmpresa }, predefinicao); onExportar(pedido, extra, n); }}>
                        <Download className="h-4 w-4" /> Exportar {n} contacto{n === 1 ? '' : 's'}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
