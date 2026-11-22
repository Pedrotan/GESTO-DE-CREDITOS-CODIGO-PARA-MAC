import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';

export type ColunaTabela<T> = {
    id: string;
    titulo: string;
    /** Conteúdo da célula. */
    celula: (linha: T) => ReactNode;
    /** Valor para ordenar (sem ele, a coluna não é ordenável). */
    ordenar?: (linha: T) => string | number;
    className?: string;
};

const semAcentos = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase();

/**
 * Tabela de dados (DataTable): pesquisa, ordenação por coluna e paginação, com teclado e leitores de ecrã.
 * O texto pesquisado vem de `pesquisaDe`; a linha inteira é clicável quando há `onLinha`.
 */
export function TabelaDados<T>({
    linhas, colunas, chave, pesquisaDe, onLinha, vazio = 'Sem registos.', porPaginaInicial = 10, ordemInicial, rotulo = 'Tabela', destaque,
}: {
    linhas: T[];
    colunas: ColunaTabela<T>[];
    chave: (linha: T) => string;
    pesquisaDe?: (linha: T) => string;
    onLinha?: (linha: T) => void;
    vazio?: string;
    porPaginaInicial?: 10 | 25 | 50;
    ordemInicial?: { coluna: string; direccao: 'asc' | 'desc' };
    rotulo?: string;
    destaque?: (linha: T) => string | undefined;
}) {
    const [pesquisa, setPesquisa] = useState('');
    const [ordem, setOrdem] = useState(ordemInicial || null);
    const [porPagina, setPorPagina] = useState<number>(porPaginaInicial);
    const [pagina, setPagina] = useState(1);

    const filtradas = useMemo(() => {
        const termo = semAcentos(pesquisa.trim());
        const base = termo && pesquisaDe ? linhas.filter(l => semAcentos(pesquisaDe(l)).includes(termo)) : linhas;
        const coluna = ordem && colunas.find(c => c.id === ordem.coluna);
        if (!coluna?.ordenar) return base;
        const sinal = ordem!.direccao === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            const va = coluna.ordenar!(a); const vb = coluna.ordenar!(b);
            return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt')) * sinal;
        });
    }, [linhas, pesquisa, ordem, colunas, pesquisaDe]);

    const paginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
    useEffect(() => { setPagina(1); }, [pesquisa, porPagina, linhas.length]);
    const actual = Math.min(pagina, paginas);
    const visiveis = filtradas.slice((actual - 1) * porPagina, actual * porPagina);
    const inicio = filtradas.length ? (actual - 1) * porPagina + 1 : 0;

    const alternar = (c: ColunaTabela<T>) => {
        if (!c.ordenar) return;
        setOrdem(o => (o?.coluna === c.id ? { coluna: c.id, direccao: o.direccao === 'asc' ? 'desc' : 'asc' } : { coluna: c.id, direccao: 'asc' }));
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                {pesquisaDe ? (
                    <label className="relative flex min-w-0 flex-[1_1_260px] sm:max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <input value={pesquisa} onChange={e => setPesquisa(e.target.value)} placeholder="Pesquisar…" aria-label={`Pesquisar em ${rotulo}`}
                            className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm" />
                    </label>
                ) : <span />}
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Mostrar
                    <select value={porPagina} onChange={e => setPorPagina(Number(e.target.value))} className="h-8 rounded-md border bg-background px-2 text-xs" aria-label="Linhas por página">
                        {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    por página
                </label>
            </div>
            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[760px] text-sm" aria-label={rotulo}>
                    <thead className="bg-muted/50 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        <tr>
                            {colunas.map(c => {
                                const activa = ordem?.coluna === c.id;
                                const Icone = activa ? (ordem!.direccao === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                                return (
                                    <th key={c.id} scope="col" className={cn('whitespace-nowrap px-3 py-2.5', c.className)}
                                        aria-sort={activa ? (ordem!.direccao === 'asc' ? 'ascending' : 'descending') : c.ordenar ? 'none' : undefined}>
                                        {c.ordenar ? (
                                            <button type="button" onClick={() => alternar(c)} className="inline-flex items-center gap-1 uppercase hover:text-foreground">
                                                {c.titulo} <Icone className={cn('h-3 w-3', !activa && 'opacity-40')} aria-hidden="true" />
                                            </button>
                                        ) : c.titulo}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {visiveis.length === 0 ? (
                            <tr><td colSpan={colunas.length} className="px-3 py-10 text-center text-sm text-muted-foreground">{pesquisa ? 'Nenhum registo corresponde à pesquisa.' : vazio}</td></tr>
                        ) : visiveis.map(l => (
                            <tr key={chave(l)} onClick={onLinha ? () => onLinha(l) : undefined}
                                onKeyDown={onLinha ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLinha(l); } } : undefined}
                                tabIndex={onLinha ? 0 : undefined}
                                className={cn('border-t align-top transition-colors', onLinha && 'cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none', destaque?.(l))}>
                                {colunas.map(c => <td key={c.id} className={cn('px-3 py-2.5', c.className)}>{c.celula(l)}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span aria-live="polite">A mostrar {inicio}–{Math.min(filtradas.length, actual * porPagina)} de {filtradas.length}</span>
                <div className="flex items-center gap-1">
                    <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background disabled:opacity-40" disabled={actual <= 1} onClick={() => setPagina(actual - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button>
                    <span className="px-2">Página {actual} de {paginas}</span>
                    <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background disabled:opacity-40" disabled={actual >= paginas} onClick={() => setPagina(actual + 1)} aria-label="Página seguinte"><ChevronRight className="h-4 w-4" /></button>
                </div>
            </div>
        </div>
    );
}
