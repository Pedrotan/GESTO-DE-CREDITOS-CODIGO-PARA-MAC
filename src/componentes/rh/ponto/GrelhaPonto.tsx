// Grelha do Livro de ponto (Fase 1): largura total, cabeçalho e coluna de nomes fixos, colunas de resumo fixas à
// direita, coluna de hoje realçada, dias futuros esbatidos, tooltip, modo «Mostrar horas», indicadores na célula,
// linha de totais por dia e selecção (clique, Shift, Ctrl/Cmd, arrastar, cabeçalho do dia e nome).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Lock, Pencil } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { formatarMinutos, horaDe, type ConfigPonto } from '@/bibliotecas/rh/ponto-calculo';
import type { Grelha, LinhaGrelha } from '@/bibliotecas/rh/ponto-grelha';
import { codigoCelula, COR_ESTADO, textoTooltip } from './ponto-ui';

export const chaveCelula = (funcionarioId: string, data: string) => `${funcionarioId}|${data}`;
export type CampoDestaque = 'presencas' | 'faltas' | 'faltas_just' | 'atraso' | 'extra' | 'pendentes';

const ALTURA_LINHA = 44;
const LARGURA_RESUMO = 58;
const RESUMO: Array<{ campo: CampoDestaque | 'horas'; titulo: string; dica: string }> = [
    { campo: 'presencas', titulo: 'Pres.', dica: 'Dias presente' },
    { campo: 'faltas', titulo: 'F', dica: 'Faltas injustificadas (meio dia = 0,5)' },
    { campo: 'faltas_just', titulo: 'FJ', dica: 'Faltas justificadas' },
    { campo: 'horas', titulo: 'Horas', dica: 'Horas trabalhadas (hh:mm)' },
    { campo: 'atraso', titulo: 'Atraso', dica: 'Minutos de atraso' },
    { campo: 'extra', titulo: 'Extra', dica: 'Horas extra (hh:mm)' },
    { campo: 'pendentes', titulo: 'Pend.', dica: 'Dias úteis sem registo' },
];

/** O dia corresponde ao destaque pedido ao clicar numa coluna de resumo? */
const corresponde = (campo: CampoDestaque, d: LinhaGrelha['dias'][number]) => ({
    presencas: d.estado === 'P', faltas: d.falta_tipo === 'F', faltas_just: d.falta_tipo === 'FJ', atraso: d.minutos_atraso > 0,
    extra: d.minutos_extra > 0, pendentes: d.estado === 'SEM_REGISTO' && d.util,
}[campo]);

export function GrelhaPonto({ semVirtualizacao = false, grelha, linhas, config, mostrarHoras, selecao, activa, destaque, bloqueado, podeEditar, onAbrir, onSelecao, onActiva, onTecla, onDestaque }: {
    semVirtualizacao?: boolean; grelha: Grelha; linhas: LinhaGrelha[]; config: ConfigPonto; mostrarHoras: boolean; selecao: Set<string>; activa: string | null;
    destaque: { funcionarioId: string; campo: CampoDestaque } | null; bloqueado: boolean; podeEditar: (l: LinhaGrelha) => boolean;
    onAbrir: (funcionarioId: string, data: string, alvo: HTMLElement) => void;
    onSelecao: (chaves: Set<string>) => void;
    onActiva: (chave: string | null) => void;
    onTecla: (tecla: string, chave: string) => void;
    onDestaque: (destaque: { funcionarioId: string; campo: CampoDestaque } | null) => void;
}) {
    const contentor = useRef<HTMLDivElement>(null);
    const [scroll, setScroll] = useState({ topo: 0, altura: 800 });
    const arrasto = useRef<{ inicio: string; moveu: boolean } | null>(null);
    const ancora = useRef<string | null>(null);
    // Mais de 50 funcionários: só as linhas visíveis são desenhadas (F1.17); na impressão, todas.
    const virtual = linhas.length > 50 && !semVirtualizacao;
    const datas = grelha.dias.map(d => d.data);
    const indiceData = useMemo(() => new Map(datas.map((d, i) => [d, i])), [datas]);
    const indiceLinha = useMemo(() => new Map(linhas.map((l, i) => [l.funcionario.id, i])), [linhas]);

    useEffect(() => {
        const el = contentor.current;
        if (!el) return;
        const medir = () => setScroll({ topo: el.scrollTop, altura: el.clientHeight });
        medir();
        window.addEventListener('resize', medir);
        return () => window.removeEventListener('resize', medir);
    }, []);
    useEffect(() => {
        const soltar = () => { arrasto.current = null; };
        window.addEventListener('mouseup', soltar);
        return () => window.removeEventListener('mouseup', soltar);
    }, []);

    // Rectângulo entre duas células (para Shift + clique e para arrastar).
    const rectangulo = (a: string, b: string) => {
        const [fa, da] = a.split('|');
        const [fb, db] = b.split('|');
        const [l1, l2] = [indiceLinha.get(fa) ?? 0, indiceLinha.get(fb) ?? 0].sort((x, y) => x - y);
        const [c1, c2] = [indiceData.get(da) ?? 0, indiceData.get(db) ?? 0].sort((x, y) => x - y);
        const chaves = new Set<string>();
        for (let l = l1; l <= l2; l += 1) for (let c = c1; c <= c2; c += 1) chaves.add(chaveCelula(linhas[l].funcionario.id, datas[c]));
        return chaves;
    };

    const primeira = virtual ? Math.max(0, Math.floor(scroll.topo / ALTURA_LINHA) - 10) : 0;
    const ultima = virtual ? Math.min(linhas.length, Math.ceil((scroll.topo + scroll.altura) / ALTURA_LINHA) + 10) : linhas.length;
    const visiveis = linhas.slice(primeira, ultima);

    const aoPressionar = (evento: MouseEvent, chave: string) => {
        if (evento.button !== 0) return;
        if (evento.shiftKey && ancora.current) { evento.preventDefault(); onSelecao(rectangulo(ancora.current, chave)); return; }
        if (evento.ctrlKey || evento.metaKey) {
            evento.preventDefault();
            const nova = new Set(selecao);
            if (nova.has(chave)) nova.delete(chave); else nova.add(chave);
            ancora.current = chave;
            onSelecao(nova);
            return;
        }
        arrasto.current = { inicio: chave, moveu: false };
    };
    const aoEntrar = (chave: string) => {
        if (!arrasto.current || arrasto.current.inicio === chave) return;
        arrasto.current.moveu = true;
        onSelecao(rectangulo(arrasto.current.inicio, chave));
    };
    const aoClicar = (evento: MouseEvent<HTMLButtonElement>, funcionarioId: string, data: string) => {
        const chave = chaveCelula(funcionarioId, data);
        if (evento.shiftKey || evento.ctrlKey || evento.metaKey || arrasto.current?.moveu) return;
        ancora.current = chave;
        onActiva(chave);
        if (selecao.size) onSelecao(new Set());
        onAbrir(funcionarioId, data, evento.currentTarget);
    };
    // Teclado: setas para navegar; P, F, J, E e Delete actuam na célula seleccionada.
    const aoTeclar = (evento: KeyboardEvent<HTMLButtonElement>, funcionarioId: string, data: string) => {
        const chave = chaveCelula(funcionarioId, data);
        const mover = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[evento.key];
        if (mover) {
            evento.preventDefault();
            const l = Math.min(linhas.length - 1, Math.max(0, (indiceLinha.get(funcionarioId) ?? 0) + mover[0]));
            const c = Math.min(datas.length - 1, Math.max(0, (indiceData.get(data) ?? 0) + mover[1]));
            const proxima = chaveCelula(linhas[l].funcionario.id, datas[c]);
            onActiva(proxima);
            contentor.current?.querySelector<HTMLButtonElement>(`[data-celula="${proxima}"]`)?.focus();
            return;
        }
        if (['p', 'f', 'j', 'e', 'Delete', 'Backspace'].includes(evento.key) || ['P', 'F', 'J', 'E'].includes(evento.key)) {
            evento.preventDefault();
            onTecla(evento.key.length === 1 ? evento.key.toLowerCase() : 'delete', chave);
        }
    };

    const colunaHoje = grelha.dias.findIndex(d => d.hoje);
    return (
        <div ref={contentor} onScroll={e => virtual && setScroll({ topo: e.currentTarget.scrollTop, altura: e.currentTarget.clientHeight })}
            className={cn('ponto-grelha relative w-full overflow-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900', virtual && 'max-h-[70vh]')}>
            <table className="w-full border-separate border-spacing-0 text-xs">
                <thead className="sticky top-0 z-20">
                    <tr className="bg-slate-50 dark:bg-slate-950">
                        <th className="sticky left-0 z-30 min-w-[200px] border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-bold dark:border-slate-800 dark:bg-slate-950">Funcionário</th>
                        {grelha.dias.map(d => (
                            <th key={d.data} scope="col" title={d.feriado ? `${d.data.slice(8)}/${d.data.slice(5, 7)}: ${d.feriado}` : undefined}
                                onClick={() => onSelecao(new Set(linhas.filter(podeEditar).map(l => chaveCelula(l.funcionario.id, d.data))))}
                                className={cn('min-w-[36px] cursor-pointer select-none border-b border-slate-200 px-0.5 py-1 text-center font-bold dark:border-slate-800',
                                    d.fimDeSemana ? 'bg-slate-100 text-slate-400 dark:bg-slate-900' : 'text-slate-600 dark:text-slate-300',
                                    d.feriado && 'text-slate-700 underline decoration-dotted',
                                    d.hoje && 'bg-blue-50 text-blue-700 ring-2 ring-inset ring-blue-400 dark:bg-blue-950/50 dark:text-blue-300')}>
                                <div className="text-[11px] tabular-nums">{d.data.slice(8)}</div>
                                <div className="text-[10px] font-semibold">{d.semana}</div>
                            </th>
                        ))}
                        {RESUMO.map((c, i) => (
                            <th key={c.campo} title={c.dica} style={{ right: (RESUMO.length - 1 - i) * LARGURA_RESUMO, minWidth: LARGURA_RESUMO, width: LARGURA_RESUMO }}
                                className={cn('sticky z-30 border-b border-slate-200 bg-slate-50 px-1 text-center font-bold dark:border-slate-800 dark:bg-slate-950', i === 0 && 'border-l')}>{c.titulo}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {virtual && primeira > 0 && <tr style={{ height: primeira * ALTURA_LINHA }} aria-hidden="true"><td colSpan={datas.length + 8} /></tr>}
                    {visiveis.map(l => {
                        const editavel = podeEditar(l) && !bloqueado;
                        return (
                            <tr key={l.funcionario.id} className="group">
                                <th scope="row" onClick={() => editavel && onSelecao(new Set(l.dias.filter(d => d.estado !== 'FORA').map(d => chaveCelula(l.funcionario.id, d.data))))}
                                    style={{ height: ALTURA_LINHA }}
                                    className="sticky left-0 z-10 cursor-pointer border-b border-r border-slate-100 bg-white px-3 py-1 text-left font-semibold group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:group-hover:bg-slate-800">
                                    <div className="max-w-[220px] truncate" title={l.funcionario.nome}>{l.funcionario.nome}</div>
                                    <div className="text-[10px] font-normal text-slate-400">{l.horario.entrada}–{l.horario.saida}{l.funcionario.numero_mecanografico ? ` · n.º ${l.funcionario.numero_mecanografico}` : ''}</div>
                                </th>
                                {l.dias.map((d, coluna) => {
                                    const chave = chaveCelula(l.funcionario.id, d.data);
                                    const futuro = d.estado === 'FUTURO';
                                    const fora = d.estado === 'FORA';
                                    const realce = destaque?.funcionarioId === l.funcionario.id && corresponde(destaque.campo, d);
                                    return (
                                        <td key={d.data} className={cn('border-b border-slate-100 p-0.5 text-center dark:border-slate-800', coluna === colunaHoje && 'bg-blue-50/70 dark:bg-blue-950/30')}>
                                            <button type="button" data-celula={chave} disabled={fora}
                                                title={fora ? undefined : textoTooltip(d, config.tolerancia_entrada_min, l.observacoes.get(d.data))}
                                                onMouseDown={e => aoPressionar(e, chave)} onMouseEnter={() => aoEntrar(chave)}
                                                onClick={e => aoClicar(e, l.funcionario.id, d.data)} onKeyDown={e => aoTeclar(e, l.funcionario.id, d.data)}
                                                onFocus={() => onActiva(chave)}
                                                aria-label={`${l.funcionario.nome}, ${d.data}`}
                                                className={cn('relative flex h-10 w-full min-w-[34px] select-none flex-col items-center justify-center rounded-md text-[10px] font-black leading-tight outline-none transition-shadow',
                                                    fora ? 'cursor-default bg-slate-50 dark:bg-slate-950' : COR_ESTADO[d.estado] || 'bg-white dark:bg-slate-900',
                                                    futuro && 'cursor-not-allowed opacity-40',
                                                    selecao.has(chave) && 'ring-2 ring-blue-600 ring-offset-1',
                                                    activa === chave && 'outline outline-2 outline-offset-1 outline-slate-900 dark:outline-white',
                                                    realce && 'ring-2 ring-fuchsia-500',
                                                    destaque?.funcionarioId === l.funcionario.id && !realce && 'opacity-30')}>
                                                {mostrarHoras && d.primeira_entrada ? (
                                                    <>
                                                        <span className="text-[9px] font-bold tabular-nums">{horaDe(d.primeira_entrada)}</span>
                                                        <span className="text-[9px] font-bold tabular-nums">{horaDe(d.ultima_saida) || '··:··'}</span>
                                                    </>
                                                ) : <span>{codigoCelula(d)}{d.falta_fraccao > 0 && d.falta_fraccao < 1 ? '½' : ''}</span>}
                                                {/* Indicadores secundários: atraso, saída antecipada, extra, editado, incompleto, pendente. */}
                                                <span className="pointer-events-none absolute right-0.5 top-0.5 flex gap-px">
                                                    {d.minutos_atraso > 0 && <i className="h-1.5 w-1.5 rounded-full bg-red-500" title="Atraso" />}
                                                    {d.minutos_saida_antecipada > 0 && <i className="h-1.5 w-1.5 rounded-full bg-orange-500" title="Saída antecipada" />}
                                                    {d.minutos_extra > 0 && <i className="h-1.5 w-1.5 rounded-full bg-blue-600" title="Horas extra" />}
                                                </span>
                                                {l.editados.has(d.data) && <Pencil className="pointer-events-none absolute bottom-0.5 left-0.5 h-2 w-2 opacity-70" aria-label="Editado manualmente" />}
                                                {d.incompleto && <span className="pointer-events-none absolute bottom-0 right-0.5 text-[9px] text-amber-600" aria-label="Incompleto">⚠</span>}
                                                {d.ausencia_pendente && <span className="pointer-events-none absolute bottom-0 right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Pendente" />}
                                            </button>
                                        </td>
                                    );
                                })}
                                {RESUMO.map((c, i) => {
                                    const t = l.totais;
                                    const valor = { presencas: t.presencas, faltas: t.faltas, faltas_just: t.faltas_just, horas: formatarMinutos(t.minutos_trabalhados), atraso: t.minutos_atraso, extra: t.minutos_extra ? formatarMinutos(t.minutos_extra) : 0, pendentes: t.pendentes }[c.campo];
                                    const vazio = !valor || valor === '0:00';
                                    const activo = destaque?.funcionarioId === l.funcionario.id && destaque.campo === c.campo;
                                    return (
                                        <td key={c.campo} style={{ right: (RESUMO.length - 1 - i) * LARGURA_RESUMO, minWidth: LARGURA_RESUMO, width: LARGURA_RESUMO }}
                                            className={cn('sticky z-10 border-b border-slate-100 bg-white px-1 text-center tabular-nums group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:group-hover:bg-slate-800', i === 0 && 'border-l')}>
                                            {c.campo === 'horas' || vazio ? <span className={cn('font-semibold', vazio && 'text-slate-300')}>{vazio ? '–' : valor}</span> : (
                                                <button type="button" onClick={() => onDestaque(activo ? null : { funcionarioId: l.funcionario.id, campo: c.campo as CampoDestaque })}
                                                    className={cn('rounded px-1.5 py-0.5 font-bold hover:bg-slate-100 dark:hover:bg-slate-800',
                                                        c.campo === 'pendentes' && 'bg-orange-500 text-white hover:bg-orange-600',
                                                        c.campo === 'faltas' && 'text-red-600', activo && 'ring-2 ring-fuchsia-500')}>
                                                    {valor}
                                                </button>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                    {virtual && ultima < linhas.length && <tr style={{ height: (linhas.length - ultima) * ALTURA_LINHA }} aria-hidden="true"><td colSpan={datas.length + 8} /></tr>}
                </tbody>
                <tfoot className="sticky bottom-0 z-20">
                    <tr className="bg-slate-50 dark:bg-slate-950">
                        <th className="sticky left-0 z-30 border-r border-t border-slate-200 bg-slate-50 px-3 py-2 text-left font-bold dark:border-slate-800 dark:bg-slate-950">
                            Total do dia {bloqueado && <Lock className="ml-1 inline h-3 w-3" />}
                        </th>
                        {grelha.dias.map(d => {
                            const t = grelha.totaisDia[d.data];
                            const taxa = t?.activos ? t.presentes / t.activos : 0;
                            const mostra = t?.activos && !d.futuro;
                            return (
                                <td key={d.data} className={cn('border-t border-slate-200 px-0.5 py-1 text-center text-[10px] font-bold tabular-nums dark:border-slate-800',
                                    !mostra ? 'text-slate-300' : taxa >= 0.9 ? 'text-emerald-700' : taxa >= 0.75 ? 'text-amber-600' : 'text-red-600')}>
                                    {mostra ? `${t.presentes}/${t.activos}` : '–'}
                                </td>
                            );
                        })}
                        {RESUMO.map((c, i) => (
                            <td key={c.campo} style={{ right: (RESUMO.length - 1 - i) * LARGURA_RESUMO }} className={cn('sticky z-30 border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950', i === 0 && 'border-l')} />
                        ))}
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}
