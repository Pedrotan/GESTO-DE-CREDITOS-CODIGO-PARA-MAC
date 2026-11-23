import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/bibliotecas/utils';
import { formatCurrency } from '@/bibliotecas/formatters';
import { ROTULO_ESTADO_BI, type SituacaoBI } from '@/bibliotecas/rh/bi-validade';
import { toast } from '@/ganchos/usar-toast';

/** Valor em cêntimos formatado em Kz. */
export const kz = (minor: number | null | undefined) => formatCurrency((Number(minor) || 0) / 100);
export const paraMinor = (valor: number) => Math.round((Number(valor) || 0) * 100);
export const dataPt = (valor: string | null | undefined) => (valor ? valor.slice(0, 10).split('-').reverse().join('/') : '—');

type Sub = { path: string; label: string };
/**
 * As 8 abas do módulo (iguais às entradas do menu lateral). As páginas antigas continuam nas mesmas rotas e
 * aparecem como sub-navegação dentro da aba que as agrupa.
 */
export const ABAS_RH: Array<{ path: string; label: string; subs?: Sub[] }> = [
    { path: '/rh/painel', label: 'Painel' },
    { path: '/rh/funcionarios', label: 'Funcionários' },
    { path: '/rh/contratos', label: 'Contratos' },
    { path: '/rh/ponto', label: 'Livro de ponto' },
    { path: '/rh/ferias', label: 'Férias e ausências', subs: [{ path: '/rh/ferias', label: 'Férias' }, { path: '/rh/ausencias', label: 'Dispensas, licenças e faltas' }] },
    { path: '/rh/processamento', label: 'Salários', subs: [{ path: '/rh/processamento', label: 'Processamento' }, { path: '/rh/recibos', label: 'Recibos e declarações' }] },
    { path: '/rh/declaracoes', label: 'Declarações' },
    { path: '/rh/documentos', label: 'Gestão documental' },
    { path: '/rh/relatorios', label: 'Relatórios' },
    { path: '/rh/configuracoes', label: 'Configurações', subs: [{ path: '/rh/configuracoes', label: 'Departamentos, cargos e parâmetros' }, { path: '/rh/calendario', label: 'Horários e calendário' }] },
];
const abaActiva = (pathname: string) => ABAS_RH.find(a => pathname === a.path || a.subs?.some(s => s.path === pathname)) || (pathname === '/rh' ? ABAS_RH[0] : undefined);

/**
 * Barra de navegação entre as abas do módulo, com a sub-navegação da aba agrupada. Em ecrãs estreitos passa a um
 * select. `extra` mantém-se por compatibilidade com as páginas antigas e já não acrescenta abas.
 */
export function NavegacaoRH(_props: { extra?: Sub[] } = {}) {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const actual = abaActiva(pathname);
    return (
        <div className="mb-5 space-y-2">
            <label className="block sm:hidden">
                <span className="sr-only">Secção de Recursos Humanos</span>
                <select value={actual?.path || ''} onChange={e => navigate(e.target.value)}
                    className="h-10 w-full rounded-lg border border-rh-input-border bg-white px-3 text-sm font-semibold text-rh-text dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    {!actual && <option value="">Recursos Humanos</option>}
                    {ABAS_RH.map(a => <option key={a.path} value={a.path}>{a.label}</option>)}
                </select>
            </label>
            <nav aria-label="Módulo de Recursos Humanos" className="hidden flex-wrap gap-1 rounded-xl border border-rh-border bg-white p-1.5 sm:flex dark:border-slate-800 dark:bg-slate-900">
                {ABAS_RH.map(item => {
                    const activo = actual?.path === item.path;
                    return (
                        <Link key={item.path} to={item.path} aria-current={activo ? 'page' : undefined}
                            className={cn('whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-link',
                                activo ? 'bg-rh-navy text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>
                            {item.label}
                        </Link>
                    );
                })}
            </nav>
            {actual?.subs && (
                <nav aria-label={actual.label} className="flex flex-wrap gap-1">
                    {actual.subs.map(s => (
                        <Link key={s.path} to={s.path} aria-current={pathname === s.path ? 'page' : undefined}
                            className={cn('rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                                pathname === s.path ? 'border-rh-navy bg-indigo-50 text-indigo-900 dark:border-white dark:bg-slate-800 dark:text-white' : 'border-rh-border bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300')}>
                            {s.label}
                        </Link>
                    ))}
                </nav>
            )}
        </div>
    );
}

/** Cartão de secção (título, acção à direita e conteúdo), usado na ficha, no cadastro e nas configurações. */
export function SeccaoRH({ id, numero, titulo, descricao, accao, children, className }: {
    id?: string; numero?: number; titulo: string; descricao?: string; accao?: ReactNode; children: ReactNode; className?: string;
}) {
    return (
        <section id={id} className={cn('scroll-mt-4 rounded-xl border border-rh-border bg-white dark:border-slate-800 dark:bg-slate-900', className)}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="flex min-w-0 items-center gap-3">
                    {numero !== undefined && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rh-navy text-xs font-bold text-white">{numero}</span>}
                    <div className="min-w-0">
                        <h2 className="text-base font-bold text-rh-text dark:text-white">{titulo}</h2>
                        {descricao && <p className="text-[13px] text-rh-muted dark:text-slate-400">{descricao}</p>}
                    </div>
                </div>
                {accao}
            </div>
            {children}
        </section>
    );
}

/** Par rótulo/valor da ficha. Campos obrigatórios ao processamento sem valor aparecem «Em falta» a laranja. */
export function ValorRH({ rotulo, valor, obrigatorio, className, mono }: { rotulo: string; valor: ReactNode; obrigatorio?: boolean; className?: string; mono?: boolean }) {
    const vazio = valor === null || valor === undefined || valor === '' || valor === '—';
    return (
        <div className={cn('min-w-0', className)}>
            <div className="mb-1 text-xs text-rh-muted dark:text-slate-400">{rotulo}</div>
            {vazio
                ? <div className={cn('text-sm', obrigatorio ? 'font-medium text-rh-warn dark:text-amber-300' : 'font-semibold text-slate-400')}>{obrigatorio ? 'Em falta' : '—'}</div>
                : <div className={cn('break-words text-sm font-semibold text-rh-text dark:text-white', mono && 'font-mono')}>{valor}</div>}
        </div>
    );
}

const ESTILO_ESTADO: Record<string, { rotulo: string; classe: string }> = {
    activo: { rotulo: 'Activo', classe: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900' },
    suspenso: { rotulo: 'Suspenso', classe: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900' },
    cessado: { rotulo: 'Terminado', classe: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
};
/** Selo do estado do funcionário (o estado «cessado» mostra-se como «Terminado»). */
export function SeloEstadoFuncionario({ estado, className }: { estado: string; className?: string }) {
    const e = ESTILO_ESTADO[estado] || ESTILO_ESTADO.activo;
    return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', e.classe, className)}>{e.rotulo}</span>;
}

/** Antiguidade em anos e meses desde a admissão («4 anos e 2 meses»). */
export function antiguidade(admissao: string | null | undefined, ate: string) {
    if (!admissao) return '—';
    const [a1, m1, d1] = admissao.slice(0, 10).split('-').map(Number);
    const [a2, m2, d2] = ate.slice(0, 10).split('-').map(Number);
    let meses = (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
    if (meses < 0) return 'Ainda não admitido';
    const anos = Math.floor(meses / 12);
    meses %= 12;
    const partes = [anos ? `${anos} ano${anos === 1 ? '' : 's'}` : '', meses ? `${meses} ${meses === 1 ? 'mês' : 'meses'}` : ''].filter(Boolean);
    return partes.length ? partes.join(' e ') : 'Menos de 1 mês';
}

/** Idade em anos completos. */
export function idade(nascimento: string | null | undefined, ate: string) {
    if (!nascimento) return null;
    const [a1, m1, d1] = nascimento.slice(0, 10).split('-').map(Number);
    const [a2, m2, d2] = ate.slice(0, 10).split('-').map(Number);
    return a2 - a1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}

/** Desloca só o contentor até ao elemento (sem mexer nos antepassados, como faria scrollIntoView). */
export function deslocarDentro(contentor: HTMLElement | null, alvo: Element | null, suave = true) {
    if (!contentor || !alvo) return;
    // Em ecrãs pequenos quem desloca pode ser um antepassado (ex.: a ficha inteira): usa o primeiro que tenha deslocamento.
    while (contentor.scrollHeight <= contentor.clientHeight + 1 && contentor.parentElement && contentor.parentElement !== document.body) contentor = contentor.parentElement;
    const topo = (alvo as HTMLElement).getBoundingClientRect().top - contentor.getBoundingClientRect().top + contentor.scrollTop - 12;
    contentor.scrollTo({ top: Math.max(0, topo), behavior: suave ? 'smooth' : 'auto' });
}

/** Secção activa de um contentor com secções (a última cujo topo já passou o topo visível), para os índices. */
export function seccaoVisivel(contentor: HTMLElement | null, seletor: string) {
    if (!contentor) return null;
    const topo = contentor.getBoundingClientRect().top + 90;
    const seccoes = [...contentor.querySelectorAll<HTMLElement>(seletor)];
    if (contentor.scrollTop + contentor.clientHeight >= contentor.scrollHeight - 4) return seccoes[seccoes.length - 1]?.id ?? null;
    let actual = seccoes[0]?.id ?? null;
    for (const s of seccoes) if (s.getBoundingClientRect().top <= topo) actual = s.id;
    return actual;
}

/** Iniciais para o avatar (primeiro e último nome). */
export function iniciais(nome: string) {
    const partes = nome.trim().split(/\s+/u).filter(Boolean);
    return ((partes[0]?.[0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?';
}

const CORES_BI: Record<SituacaoBI['estado'], string> = {
    valido: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    a_expirar: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900',
    expirado: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
    sem_data: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700',
};

/** Selo de cor com o estado do BI (verde, laranja, vermelho). Com `detalhe`, mostra também o tempo em falta. */
export function SeloBI({ situacao, detalhe = false, className }: { situacao: SituacaoBI; detalhe?: boolean; className?: string }) {
    return (
        <span title={situacao.texto} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold', CORES_BI[situacao.estado], className)}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {detalhe ? situacao.texto : ROTULO_ESTADO_BI[situacao.estado]}
        </span>
    );
}

export function Indicador({ titulo, valor, nota, tom = 'slate' }: { titulo: string; valor: ReactNode; nota?: string; tom?: 'slate' | 'emerald' | 'orange' | 'red' | 'sky' }) {
    const tons = {
        slate: 'text-slate-900 dark:text-white', emerald: 'text-emerald-600', orange: 'text-orange-600', red: 'text-red-600', sky: 'text-sky-600',
    };
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{titulo}</p>
            <p className={cn('mt-1 text-2xl font-black', tons[tom])}>{valor}</p>
            {nota && <p className="mt-0.5 text-xs text-slate-500">{nota}</p>}
        </div>
    );
}

/** Carrega dados assíncronos e devolve-os com uma função para recarregar (mostra o erro numa notificação). */
export function useCarregar<T>(carregar: () => Promise<T>, inicial: T, deps: unknown[] = []) {
    const [dados, setDados] = useState<T>(inicial);
    const [aCarregar, setACarregar] = useState(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const recarregar = useCallback(async () => {
        setACarregar(true);
        try { setDados(await carregar()); }
        catch (error) { toast({ variant: 'destructive', title: 'Erro ao carregar', description: error instanceof Error ? error.message : String(error) }); }
        finally { setACarregar(false); }
    }, deps);
    useEffect(() => { void recarregar(); }, [recarregar]);
    return { dados, aCarregar, recarregar, setDados };
}

/** Executa uma acção com notificação de sucesso ou de erro. Devolve true se correu bem. */
export async function executar(accao: () => Promise<unknown>, sucesso: string): Promise<boolean> {
    try {
        await accao();
        toast({ title: sucesso });
        return true;
    } catch (error) {
        toast({ variant: 'destructive', title: 'Não foi possível concluir', description: error instanceof Error ? error.message : String(error) });
        return false;
    }
}

export const lerFicheiro = (ficheiro: File) => new Promise<string>((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
    leitor.readAsDataURL(ficheiro);
});

/** Abre um ficheiro guardado (data URL) num separador novo; os DOCX são descarregados. */
export function abrirDataUrl(dataUrl: string, nome: string) {
    const [cabecalho, base64] = dataUrl.split(',');
    const mime = cabecalho.slice(5, cabecalho.indexOf(';'));
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    if (mime.startsWith('image/') || mime === 'application/pdf') window.open(url, '_blank');
    else {
        const a = document.createElement('a');
        a.href = url; a.download = nome; a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function Vazio({ children }: { children: ReactNode }) {
    return <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">{children}</div>;
}
