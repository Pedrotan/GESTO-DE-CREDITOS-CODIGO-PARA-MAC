import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/bibliotecas/utils';
import { formatCurrency } from '@/bibliotecas/formatters';
import { ROTULO_ESTADO_BI, type SituacaoBI } from '@/bibliotecas/rh/bi-validade';
import { toast } from '@/ganchos/usar-toast';

/** Valor em cêntimos formatado em Kz. */
export const kz = (minor: number | null | undefined) => formatCurrency((Number(minor) || 0) / 100);
export const paraMinor = (valor: number) => Math.round((Number(valor) || 0) * 100);
export const dataPt = (valor: string | null | undefined) => (valor ? valor.slice(0, 10).split('-').reverse().join('/') : '—');

const LIGACOES = [
    { path: '/rh/painel', label: 'Painel' },
    { path: '/rh/funcionarios', label: 'Funcionários' },
    { path: '/rh/ponto', label: 'Livro de ponto' },
    { path: '/rh/ferias', label: 'Férias' },
    { path: '/rh/ausencias', label: 'Dispensas e licenças' },
    { path: '/rh/calendario', label: 'Horários e calendário' },
    { path: '/rh/processamento', label: 'Processamento salarial' },
    { path: '/rh/recibos', label: 'Recibos e declarações' },
    { path: '/rh/documentos', label: 'Documentos' },
    { path: '/rh/configuracoes', label: 'Configurações' },
];

/** Barra de navegação entre as páginas do módulo. */
export function NavegacaoRH({ extra }: { extra?: Array<{ path: string; label: string }> }) {
    const { pathname } = useLocation();
    const ligacoes = [...LIGACOES.slice(0, 2), ...(extra || []).filter(e => !LIGACOES.some(l => l.path === e.path)), ...LIGACOES.slice(2)];
    return (
        <nav className="mb-5 flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-slate-800 dark:bg-slate-900">
            {ligacoes.map(item => (
                <Link key={item.path} to={item.path}
                    className={cn('rounded-xl px-3.5 py-2 text-xs font-bold transition-colors',
                        pathname === item.path || (item.path === '/rh/painel' && pathname === '/rh')
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>
                    {item.label}
                </Link>
            ))}
        </nav>
    );
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
