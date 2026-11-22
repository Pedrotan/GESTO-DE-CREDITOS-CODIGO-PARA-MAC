import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarPlus, Copy, Download, Mail, MoreHorizontal, Phone, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { useToast } from '@/ganchos/usar-toast';
import { ToastAction } from '@/componentes/ui/toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/componentes/ui/popover';
import { Switch } from '@/componentes/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { cn } from '@/bibliotecas/utils';
import { luandaParts } from '@/bibliotecas/fuso-angola';
import {
    CAMPOS_OMISSAO, LIMITE_SEGUNDO_PLANO, MESES_LONGOS, ROTULO_DADOS, ROTULO_ORDENAR, ROTULO_PERIODO, ROTULO_TIPO, ROTULO_TIPO_PLURAL, erroPeriodoPersonalizado,
    linhaTexto, normalizarFiltros, podeAgenda,
    type FiltroDados, type FiltrosContactos, type LinhaContacto, type Ordenacao, type PedidoExportacao, type PeriodoCadastro, type ResumoContactos, type TipoCliente,
} from '@/bibliotecas/contactos/agenda-contactos';
import { gerarTexto } from '@/bibliotecas/contactos/formatos-contactos';
import { descarregar, gerarFicheiro } from '@/bibliotecas/contactos/exportar-contactos';
import { ServicoAgendaContactos } from '@/servicos/ServicoAgendaContactos';
import { TabelaContactos, type AccoesLinha } from '@/componentes/contactos/TabelaContactos';
import { FichaContacto } from '@/componentes/contactos/FichaContacto';
import { ModalExportar, type EstadoInicialExportacao } from '@/componentes/contactos/ModalExportar';
import { guardarPreferencias, lerPreferencias } from '@/componentes/contactos/preferencias-contactos';
import { btn, btnPrimario, campo, cartao, linkAccao } from '@/componentes/contactos/estilos-contactos';

// Agenda de contactos dos clientes: filtros na URL, lista paginada, indicadores, ficha lateral e exportação.
// Os dados vêm do processo principal (Electron) ou da base do navegador (web), sempre pela mesma função de filtros.

const PARAM: Record<keyof Omit<FiltrosContactos, 'ids'>, string> = {
    q: 'q', tipo: 'tipo', provincia: 'prov', municipio: 'mun', cadastradoPor: 'por', periodo: 'periodo', de: 'de', ate: 'ate', dados: 'dados', ordenar: 'ord',
};
const PERIODOS_PAGINA = Object.keys(ROTULO_PERIODO) as PeriodoCadastro[];

function filtrosDaUrl(url: URLSearchParams): FiltrosContactos {
    const bruto: Record<string, string> = {};
    for (const [k, p] of Object.entries(PARAM)) bruto[k] = url.get(p) || '';
    const tipo = bruto.tipo.toUpperCase();
    return normalizarFiltros({ ...bruto, tipo: tipo as TipoCliente } as FiltrosContactos);
}

export default function Contactos() {
    const { user } = useAuth();
    const { companySettings } = useData();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [url, setUrl] = useSearchParams();
    const filtros = useMemo(() => filtrosDaUrl(url), [url]);
    const pagina = Math.max(1, Number(url.get('pag')) || 1);
    const porPagina = [25, 50, 100].includes(Number(url.get('n'))) ? Number(url.get('n')) : 25;

    const [pesquisa, setPesquisa] = useState(filtros.q || '');
    const [dados, setDados] = useState<{ linhas: LinhaContacto[]; total: number }>({ linhas: [], total: 0 });
    const [resumo, setResumo] = useState<ResumoContactos | null>(null);
    const [aCarregar, setACarregar] = useState(true);
    const [versao, setVersao] = useState(0);
    const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
    const [ocultarNif, setOcultarNif] = useState(true);
    const [nifs, setNifs] = useState<Record<string, string>>({});
    const [fichaId, setFichaId] = useState<string | null>(null);
    const [exportacao, setExportacao] = useState<EstadoInicialExportacao | null>(null);
    const [preferencias, setPreferencias] = useState(() => lerPreferencias(user?.id || 'anonimo'));

    const podeEditar = podeAgenda(user, 'editar');
    const podeRevelar = podeAgenda(user, 'revelar_nif');
    const podeListas = podeAgenda(user, 'exportar_lista');
    const podeNif = podeAgenda(user, 'exportar_nif');

    // ── Estado na URL ──
    const mudarUrl = useCallback((alteracoes: Partial<Record<keyof typeof PARAM | 'pag' | 'n', string>>, manterPagina = false) => {
        setUrl(anterior => {
            const n = new URLSearchParams(anterior);
            for (const [k, v] of Object.entries(alteracoes)) {
                const nome = (PARAM as Record<string, string>)[k] || k;
                if (v) n.set(nome, v); else n.delete(nome);
            }
            if (!manterPagina && !('pag' in alteracoes)) n.delete('pag');
            return n;
        }, { replace: true });
    }, [setUrl]);
    const limparFiltros = () => { setPesquisa(''); setUrl(new URLSearchParams(), { replace: true }); };

    // Pesquisa com debounce de 300 ms.
    useEffect(() => { setPesquisa(filtros.q || ''); }, [filtros.q]);
    useEffect(() => {
        if ((pesquisa.trim()) === (filtros.q || '')) return;
        const t = setTimeout(() => mudarUrl({ q: pesquisa.trim() }), 300);
        return () => clearTimeout(t);
    }, [pesquisa]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Dados ──
    const erroPeriodo = filtros.periodo === 'personalizado' ? erroPeriodoPersonalizado(filtros.de || '', filtros.ate || '') : null;
    useEffect(() => {
        let vivo = true;
        setACarregar(true);
        Promise.all([
            ServicoAgendaContactos.listar(filtros, pagina, porPagina, user),
            ServicoAgendaContactos.resumo(filtros, user),
        ]).then(([lista, r]) => {
            if (!vivo) return;
            setDados({ linhas: lista.linhas, total: lista.total }); setResumo(r);
            if (lista.pagina !== pagina) mudarUrl({ pag: lista.pagina > 1 ? String(lista.pagina) : '' }, true);
        }).catch(e => {
            if (vivo) toast({ title: 'Não foi possível carregar a agenda', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
        }).finally(() => { if (vivo) setACarregar(false); });
        return () => { vivo = false; };
    }, [filtros, pagina, porPagina, versao]); // eslint-disable-line react-hooks/exhaustive-deps

    // «Ocultar NIF/BI» desligado: revela o NIF das linhas visíveis (com permissão; cada um fica na auditoria).
    useEffect(() => {
        if (ocultarNif || !podeRevelar) return;
        const faltam = dados.linhas.filter(l => l.nifMascarado && !nifs[l.id]);
        if (!faltam.length) return;
        let vivo = true;
        void (async () => {
            const novos: Record<string, string> = {};
            for (const l of faltam) novos[l.id] = await ServicoAgendaContactos.revelarNif(l.id, user).catch(() => l.nifMascarado);
            if (vivo) setNifs(n => ({ ...n, ...novos }));
        })();
        return () => { vivo = false; };
    }, [ocultarNif, dados.linhas]); // eslint-disable-line react-hooks/exhaustive-deps
    const nifsVisiveis = ocultarNif ? {} : nifs;

    // ── Acções ──
    const copiarTexto = async (texto: string, rotulo: string) => {
        try { await navigator.clipboard.writeText(texto); toast({ title: rotulo === 'contacto' ? 'Contacto copiado' : `${rotulo[0].toUpperCase()}${rotulo.slice(1)} copiado` }); }
        catch { toast({ title: 'Não foi possível copiar', description: 'A área de transferência está bloqueada.', variant: 'destructive' }); }
    };

    const opcoesFicheiro = (extra?: { orientacao?: 'vertical' | 'horizontal'; cabecalhoEmpresa?: boolean }) => ({
        utilizador: user?.name || 'Sistema', empresa: companySettings, orientacao: extra?.orientacao || preferencias.orientacao, cabecalhoEmpresa: extra?.cabecalhoEmpresa ?? preferencias.cabecalhoEmpresa,
    });

    const exportar = async (pedido: PedidoExportacao, extra?: { orientacao: 'vertical' | 'horizontal'; cabecalhoEmpresa: boolean }, total = 0) => {
        const segundoPlano = total > LIMITE_SEGUNDO_PLANO;
        if (segundoPlano) toast({ title: 'Exportação em segundo plano', description: `${total} contactos: avisamos quando o ficheiro estiver pronto.` });
        try {
            const linhas = await ServicoAgendaContactos.exportar(pedido, user);
            if (!linhas.length) { toast({ title: 'Nenhum cliente corresponde a estas opções' }); return; }
            const gerar = async () => {
                const { blob, nome } = await gerarFicheiro(linhas, pedido, opcoesFicheiro(extra), filtros);
                if (!segundoPlano) { descarregar(blob, nome); toast({ title: 'Exportação concluída', description: `${linhas.length} contacto(s) em ${nome}.` }); return; }
                // Ficheiro pronto: link de download válido durante 24 horas.
                const ligacao = URL.createObjectURL(blob);
                setTimeout(() => URL.revokeObjectURL(ligacao), 24 * 60 * 60 * 1000);
                toast({
                    title: 'Exportação pronta', description: `${linhas.length} contactos em ${nome}. O link expira em 24 horas.`, duration: 60_000,
                    action: <ToastAction altText="Descarregar o ficheiro" onClick={() => { const a = document.createElement('a'); a.href = ligacao; a.download = nome; a.click(); }}>Descarregar</ToastAction>,
                });
                try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Exportação pronta', { body: nome }); } catch { /* sem notificações */ }
            };
            if (segundoPlano) setTimeout(() => { void gerar().catch(e => toast({ title: 'A exportação falhou', description: String(e?.message || e), variant: 'destructive' })); }, 0);
            else await gerar();
        } catch (e) {
            toast({ title: 'Não foi possível exportar', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
        }
    };

    const copiarPedido = async (pedido: PedidoExportacao) => {
        try {
            const linhas = await ServicoAgendaContactos.exportar({ ...pedido, formato: 'texto' }, user);
            await navigator.clipboard.writeText(gerarTexto(linhas));
            toast({ title: `${linhas.length} contacto${linhas.length === 1 ? '' : 's'} copiado${linhas.length === 1 ? '' : 's'}` });
        } catch (e) {
            toast({ title: 'Não foi possível copiar', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
        }
    };

    const exportarUm = (l: LinhaContacto, formato: 'pdf' | 'vcf') => void exportar({
        ambito: 'um', clienteId: l.id, campos: preferencias.campos.filter(c => c !== 'nif' || podeNif), formato, ordenar: 'nome_asc',
    }, undefined, 1);

    const editar = async (l: LinhaContacto, campoAlterado: 'email' | 'address' | 'alternativePhone', valor: string) => {
        try {
            await ServicoAgendaContactos.editarContacto(l.id, campoAlterado, valor, user);
            toast({ title: 'Contacto actualizado', description: `${l.nome}: ${campoAlterado === 'email' ? 'email guardado' : campoAlterado === 'address' ? 'morada guardada' : 'telefone alternativo guardado'}.` });
            setVersao(v => v + 1);
            return true;
        } catch (e) {
            toast({ title: 'Não foi possível guardar', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
            return false;
        }
    };

    const accoes: AccoesLinha = {
        abrirFicha: l => setFichaId(l.id),
        copiar: l => void copiarTexto(linhaTexto(l), 'contacto'),
        exportar: exportarUm,
        editar: (l, c, v) => editar(l, c, v),
        fichaCompleta: l => navigate(`/clientes?search=${encodeURIComponent(l.nome)}`),
    };

    const indiceFicha = dados.linhas.findIndex(l => l.id === fichaId);
    const carregarFicha = useCallback((id: string) => ServicoAgendaContactos.ficha(id, user), [user]);
    const revelar = async (id: string) => {
        try { const nif = await ServicoAgendaContactos.revelarNif(id, user); setNifs(n => ({ ...n, [id]: nif })); }
        catch (e) { toast({ title: 'Não foi possível mostrar o NIF/BI', description: e instanceof Error ? e.message : String(e), variant: 'destructive' }); }
    };

    // ── Selecção ──
    const seleccionar = (id: string, v: boolean) => setSeleccionados(s => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });
    const seleccionarPagina = (v: boolean) => setSeleccionados(s => { const n = new Set(s); dados.linhas.forEach(l => (v ? n.add(l.id) : n.delete(l.id))); return n; });
    const seleccionarTodos = async () => setSeleccionados(new Set(await ServicoAgendaContactos.ids(filtros, user)));
    const paginaToda = dados.linhas.length > 0 && dados.linhas.every(l => seleccionados.has(l.id));

    // ── Indicadores ──
    const hoje = luandaParts(new Date())!;
    const tipoAplicado = filtros.tipo ? ROTULO_TIPO_PLURAL[filtros.tipo].toLowerCase() : '';
    const pct = (n: number) => (resumo?.total ? Math.round((n / resumo.total) * 100) : 0);
    const chips: Array<{ chave: string; rotulo: string; limpar: Partial<Record<keyof typeof PARAM, string>> }> = [
        ...(filtros.q ? [{ chave: 'q', rotulo: `Pesquisa: «${filtros.q}»`, limpar: { q: '' } }] : []),
        ...(filtros.provincia ? [{ chave: 'prov', rotulo: `Província: ${filtros.provincia}`, limpar: { provincia: '', municipio: '' } }] : []),
        ...(filtros.municipio ? [{ chave: 'mun', rotulo: `Município: ${filtros.municipio}`, limpar: { municipio: '' } }] : []),
        ...(filtros.periodo && filtros.periodo !== 'qualquer' ? [{ chave: 'periodo', rotulo: `Cadastrados: ${filtros.periodo === 'personalizado' ? `${filtros.de || '…'} a ${filtros.ate || '…'}` : ROTULO_PERIODO[filtros.periodo].toLowerCase()}`, limpar: { periodo: '', de: '', ate: '' } }] : []),
        ...(filtros.dados ? [{ chave: 'dados', rotulo: ROTULO_DADOS[filtros.dados], limpar: { dados: '' } }] : []),
        ...(filtros.cadastradoPor ? [{ chave: 'por', rotulo: `Cadastrado por: ${resumo?.utilizadores.find(u => u.id === filtros.cadastradoPor)?.nome || '…'}`, limpar: { cadastradoPor: '' } }] : []),
    ];
    const inicio = dados.total ? (pagina - 1) * porPagina + 1 : 0;
    const fim = Math.min(dados.total, pagina * porPagina);
    const paginas = Math.max(1, Math.ceil(dados.total / porPagina));
    const pesquisaRef = useRef<HTMLInputElement>(null);

    const kpi = 'flex items-center gap-3.5 px-[18px] py-4 text-left';
    const kic = 'flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px]';

    return (
        <MainLayout title="Clientes" subtitle="Agenda de contactos">
            <div className="flex w-full flex-col gap-[18px] pb-12 text-[#101828] dark:text-slate-100">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <nav aria-label="Caminho" className="text-[13px] text-[#5B6474] dark:text-slate-400">Clientes › Agenda de contactos</nav>
                        <h1 className="mt-1 text-[26px] font-extrabold text-[#0B2E1E] dark:text-white">Agenda de contactos</h1>
                        <p className="mt-1 text-sm text-[#5B6474] dark:text-slate-400">Telefones, emails e moradas de todos os clientes, com exportação por cliente, por período ou por filtro.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={btn} disabled={!podeListas} title={podeListas ? 'Copia a lista filtrada, um cliente por linha' : 'Exige a permissão «Clientes: Exportar listas de contactos»'}
                            onClick={() => void copiarPedido({ ambito: 'filtro', filtrosPagina: filtros, campos: CAMPOS_OMISSAO, formato: 'texto', ordenar: filtros.ordenar })}>
                            <Copy className="h-4 w-4" /> Copiar lista
                        </button>
                        <button type="button" className={btnPrimario} onClick={() => setExportacao({ ambito: podeListas ? 'filtro' : 'um' })}><Download className="h-4 w-4" /> Exportar contactos</button>
                    </div>
                </div>

                {/* Indicadores: respeitam o tipo e a província (não a pesquisa) e são calculados na base. */}
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                    <button type="button" className={cn(cartao, kpi, 'hover:border-[#ABEFC6]')} onClick={limparFiltros} title="Limpar filtros">
                        <span className={cn(kic, 'bg-[#ECFDF3] text-[#067647]')}><Users className="h-5 w-5" /></span>
                        <span><span className="block text-[13px] text-[#5B6474]">Total de clientes{tipoAplicado ? ` (${tipoAplicado})` : ''}</span><span className="block text-2xl font-extrabold leading-tight">{resumo?.total ?? '…'}</span>
                            <span className="block text-xs text-[#5B6474]">{resumo ? `${resumo.porTipo.COMUM} comuns · ${resumo.porTipo.APOSENTADO} aposentados · ${resumo.porTipo.ESTRANGEIRO} estrangeiros` : ' '}</span></span>
                    </button>
                    <button type="button" className={cn(cartao, kpi, 'hover:border-[#B2DDFF]')} onClick={() => mudarUrl({ dados: 'com_telefone' })}>
                        <span className={cn(kic, 'bg-[#EFF8FF] text-[#175CD3]')}><Phone className="h-5 w-5" /></span>
                        <span><span className="block text-[13px] text-[#5B6474]">Com telefone</span><span className="block text-2xl font-extrabold leading-tight">{resumo?.comTelefone ?? '…'}</span>
                            <span className="block text-xs text-[#5B6474]">{resumo ? `${pct(resumo.comTelefone)}% dos clientes` : ' '}</span></span>
                    </button>
                    <div className={cn(cartao, kpi)}>
                        <span className={cn(kic, 'bg-[#FEF6EE] text-[#B93815]')}><Mail className="h-5 w-5" /></span>
                        <span><span className="block text-[13px] text-[#5B6474]">Com email</span><span className="block text-2xl font-extrabold leading-tight">{resumo?.comEmail ?? '…'}</span>
                            <span className="block text-xs text-[#5B6474]">{resumo ? <>{pct(resumo.comEmail)}% · <button type="button" className={linkAccao} onClick={() => mudarUrl({ dados: 'sem_email' })}>{resumo.semEmail} sem email</button></> : ' '}</span></span>
                    </div>
                    <div className={cn(cartao, kpi, 'relative')}>
                        <button type="button" className="flex flex-1 items-center gap-3.5 text-left" onClick={() => mudarUrl({ periodo: 'este_mes', de: '', ate: '' })}>
                            <span className={cn(kic, 'bg-[#F4F3FF] text-[#5925DC]')}><CalendarPlus className="h-5 w-5" /></span>
                            <span><span className="block text-[13px] text-[#5B6474]">Novos este mês</span><span className="block text-2xl font-extrabold leading-tight">{resumo?.novosMes ?? '…'}</span>
                                <span className="block text-xs text-[#5B6474]">cadastrados em {MESES_LONGOS[hoje.month]} de {hoje.year}</span></span>
                        </button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><button type="button" className="absolute right-2 top-2 rounded-md p-1 text-[#5B6474] hover:bg-[#F2F4F7] dark:hover:bg-slate-800" aria-label="Mais acções dos novos clientes"><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end"><DropdownMenuItem disabled={!podeListas} onSelect={() => setExportacao({ ambito: 'todos', periodo: 'este_mes' })}><Download className="mr-2 h-4 w-4" /> Exportar</DropdownMenuItem></DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                <section className={cartao} aria-label="Lista de contactos">
                    {/* Pesquisa e filtros */}
                    <div className="flex flex-wrap items-center gap-2.5 border-b border-[#E4E7EC] px-4 py-3.5 dark:border-slate-800">
                        <label className="relative flex min-w-0 flex-[1_1_320px]">
                            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#667085]" aria-hidden="true" />
                            <input ref={pesquisaRef} className={cn(campo, 'w-full pl-9')} value={pesquisa} onChange={e => setPesquisa(e.target.value)}
                                placeholder="Pesquisar por nome, NIF/BI, telefone, email ou morada" aria-label="Pesquisar clientes" />
                        </label>
                        <select className={campo} aria-label="Província" value={filtros.provincia} onChange={e => mudarUrl({ provincia: e.target.value, municipio: '' })}>
                            <option value="">Todas as províncias</option>{resumo?.provincias.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <select className={campo} aria-label="Período de cadastro" value={filtros.periodo} onChange={e => mudarUrl({ periodo: e.target.value === 'qualquer' ? '' : e.target.value, ...(e.target.value !== 'personalizado' ? { de: '', ate: '' } : {}) })}>
                            {PERIODOS_PAGINA.map(p => <option key={p} value={p}>{p === 'qualquer' ? 'Cadastrados: qualquer data' : `Cadastrados: ${ROTULO_PERIODO[p].toLowerCase()}`}</option>)}
                        </select>
                        {filtros.periodo === 'personalizado' && (
                            <span className="flex items-center gap-1.5 text-sm">
                                <input type="date" className={campo} aria-label="Cadastrados de" value={filtros.de} onChange={e => mudarUrl({ de: e.target.value })} />
                                <span className="text-[#5B6474]">até</span>
                                <input type="date" className={campo} aria-label="Cadastrados até" value={filtros.ate} onChange={e => mudarUrl({ ate: e.target.value })} />
                            </span>
                        )}
                        <select className={campo} aria-label="Dados em falta" value={filtros.dados} onChange={e => mudarUrl({ dados: e.target.value })}>
                            <option value="">Dados: todos</option>{(['com_email', 'sem_email', 'sem_morada', 'sem_telefone', 'incompletos'] as FiltroDados[]).map(d => <option key={d} value={d}>{ROTULO_DADOS[d as Exclude<FiltroDados, ''>]}</option>)}
                        </select>
                        <Popover>
                            <PopoverTrigger asChild><button type="button" className={btn}><SlidersHorizontal className="h-4 w-4" /> Mais filtros</button></PopoverTrigger>
                            <PopoverContent align="end" className="w-72 space-y-3">
                                <label className="block text-xs font-semibold">Ordenar por
                                    <select className={cn(campo, 'mt-1 w-full')} value={filtros.ordenar} onChange={e => mudarUrl({ ordenar: e.target.value === 'cadastro_desc' ? '' : e.target.value })}>
                                        {(Object.keys(ROTULO_ORDENAR) as Ordenacao[]).map(o => <option key={o} value={o}>{ROTULO_ORDENAR[o]}</option>)}
                                    </select></label>
                                <label className="block text-xs font-semibold">Cadastrado por
                                    <select className={cn(campo, 'mt-1 w-full')} value={filtros.cadastradoPor} onChange={e => mudarUrl({ cadastradoPor: e.target.value })}>
                                        <option value="">Qualquer utilizador</option>{resumo?.utilizadores.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                                    </select></label>
                                <label className="block text-xs font-semibold">Município
                                    <select className={cn(campo, 'mt-1 w-full')} value={filtros.municipio} onChange={e => mudarUrl({ municipio: e.target.value })}>
                                        <option value="">Todos os municípios</option>{resumo?.municipios.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select></label>
                            </PopoverContent>
                        </Popover>
                    </div>
                    {erroPeriodo && <p role="alert" className="border-b border-[#E4E7EC] bg-[#FEF3F2] px-4 py-2 text-sm text-[#B42318] dark:border-slate-800">{erroPeriodo}</p>}

                    {/* Segmentos, chips e NIF */}
                    <div className="flex flex-wrap items-center gap-2 border-b border-[#E4E7EC] px-4 py-3 dark:border-slate-800">
                        {(['TODOS', 'COMUM', 'APOSENTADO', 'ESTRANGEIRO'] as const).map(seg => {
                            const activo = (filtros.tipo || 'TODOS') === seg;
                            return (
                                <button key={seg} type="button" aria-pressed={activo} onClick={() => mudarUrl({ tipo: seg === 'TODOS' ? '' : seg.toLowerCase() })}
                                    className={cn('rounded-full border px-3 py-[7px] text-[13px] font-semibold', activo ? 'border-[#0B4A2F] bg-[#0B4A2F] text-white' : 'border-[#D0D5DD] bg-white text-[#344054] hover:bg-[#F9FAFB] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300')}>
                                    {seg === 'TODOS' ? 'Todos' : ROTULO_TIPO_PLURAL[seg]} <b className={cn('ml-1 font-semibold', activo ? 'text-[#ABEFC6]' : 'text-[#5B6474]')}>{resumo?.segmentos[seg] ?? '…'}</b>
                                </button>
                            );
                        })}
                        {chips.length > 0 && <span className="mx-1.5 h-6 w-px bg-[#E4E7EC] dark:bg-slate-700" aria-hidden="true" />}
                        {chips.map(c => (
                            <span key={c.chave} className="inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF3] py-1 pl-2.5 pr-1.5 text-[13px] font-semibold text-[#085D3A] dark:bg-emerald-950/50 dark:text-emerald-300">
                                {c.rotulo}
                                <button type="button" aria-label={`Remover filtro ${c.rotulo}`} className="rounded-full p-0.5 hover:bg-[#D1FADF] dark:hover:bg-emerald-900" onClick={() => { if (c.chave === 'q') setPesquisa(''); mudarUrl(c.limpar); }}><X className="h-3.5 w-3.5" /></button>
                            </span>
                        ))}
                        {(chips.length > 0 || filtros.tipo) && <button type="button" className={cn(linkAccao, 'ml-1')} onClick={limparFiltros}>Limpar filtros</button>}
                        <span className="flex-1" />
                        <label className="flex items-center gap-2 text-[13px] text-[#344054] dark:text-slate-300" title={podeRevelar ? 'Desligar mostra o NIF/BI completo (fica registado na auditoria)' : 'Mostrar o NIF/BI exige a permissão «Clientes: Revelar NIF/BI»'}>
                            <Switch checked={ocultarNif} disabled={!podeRevelar} onCheckedChange={setOcultarNif} aria-label="Ocultar NIF/BI" /> Ocultar NIF/BI
                        </label>
                    </div>

                    {/* Barra da selecção */}
                    {seleccionados.size > 0 && (
                        <div className="flex flex-wrap items-center gap-3 border-b border-[#ABEFC6] bg-[#F0FDF6] px-4 py-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/30" role="region" aria-label="Acções da selecção">
                            <strong className="text-[#085D3A] dark:text-emerald-300">{seleccionados.size} cliente{seleccionados.size === 1 ? '' : 's'} seleccionado{seleccionados.size === 1 ? '' : 's'}</strong>
                            {paginaToda && seleccionados.size < dados.total && <button type="button" className={linkAccao} onClick={() => void seleccionarTodos()}>Seleccionar os {dados.total} resultados</button>}
                            <button type="button" className={cn(btn, 'h-[34px]')} disabled={!podeListas} onClick={() => setExportacao({ ambito: 'seleccionados' })}>Exportar selecção</button>
                            <button type="button" className={cn(btn, 'h-[34px]')} disabled={!podeListas} onClick={() => void copiarPedido({ ambito: 'seleccionados', ids: [...seleccionados], campos: CAMPOS_OMISSAO, formato: 'texto', ordenar: 'nome_asc' })}>Copiar contactos</button>
                            <button type="button" className={cn(btn, 'h-[34px]')} disabled={!podeListas} onClick={() => void exportar({ ambito: 'seleccionados', ids: [...seleccionados], campos: preferencias.campos.filter(c => c !== 'nif' || podeNif), formato: 'vcf', ordenar: 'nome_asc' }, undefined, seleccionados.size)}>Descarregar vCard</button>
                            <button type="button" className={linkAccao} onClick={() => setSeleccionados(new Set())}>Cancelar</button>
                        </div>
                    )}

                    <TabelaContactos linhas={dados.linhas} aCarregar={aCarregar} porPagina={porPagina} seleccionados={seleccionados} onSeleccionar={seleccionar} onSeleccionarPagina={seleccionarPagina}
                        ordenar={filtros.ordenar || 'cadastro_desc'} onOrdenar={o => mudarUrl({ ordenar: o === 'cadastro_desc' ? '' : o })} nifs={nifsVisiveis} podeEditar={podeEditar} accoes={accoes} onLimpar={limparFiltros} />

                    <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 text-[13px] text-[#5B6474] dark:text-slate-400">
                        <span aria-live="polite">{aCarregar && !dados.linhas.length ? 'A carregar…' : `A mostrar ${inicio}–${fim} de ${dados.total} cliente${dados.total === 1 ? '' : 's'}`}</span>
                        <div className="flex items-center gap-2">
                            <select className={cn(campo, 'h-[34px]')} aria-label="Linhas por página" value={porPagina} onChange={e => mudarUrl({ n: e.target.value === '25' ? '' : e.target.value })}>
                                {[25, 50, 100].map(n => <option key={n} value={n}>{n} por página</option>)}
                            </select>
                            <button type="button" className={cn(btn, 'h-[34px]')} disabled={pagina <= 1} onClick={() => mudarUrl({ pag: pagina - 1 > 1 ? String(pagina - 1) : '' }, true)}>Anterior</button>
                            <span>{pagina} / {paginas}</span>
                            <button type="button" className={cn(btn, 'h-[34px]')} disabled={pagina >= paginas} onClick={() => mudarUrl({ pag: String(pagina + 1) }, true)}>Seguinte</button>
                        </div>
                    </div>
                </section>
            </div>

            <FichaContacto id={fichaId} carregar={carregarFicha} versao={versao}
                temAnterior={indiceFicha > 0} temSeguinte={indiceFicha >= 0 && indiceFicha < dados.linhas.length - 1}
                onAnterior={() => indiceFicha > 0 && setFichaId(dados.linhas[indiceFicha - 1].id)}
                onSeguinte={() => indiceFicha < dados.linhas.length - 1 && setFichaId(dados.linhas[indiceFicha + 1].id)}
                onClose={() => setFichaId(null)} podeEditar={podeEditar} podeRevelar={podeRevelar} nifRevelado={fichaId ? nifs[fichaId] : undefined}
                onRevelar={id => void revelar(id)} onEditar={editar} onExportar={exportarUm} onCopiar={copiarTexto} onFichaCompleta={accoes.fichaCompleta} />

            <ModalExportar aberto={Boolean(exportacao)} inicial={exportacao || { ambito: 'filtro' }} filtrosPagina={filtros} seleccionados={[...seleccionados]}
                totalTodos={resumo?.totalGeral ?? 0} provincias={resumo?.provincias || []}
                preferencias={preferencias} podeListas={podeListas} podeNif={podeNif}
                contar={p => ServicoAgendaContactos.contagem(p, user)}
                procurar={async q => (await ServicoAgendaContactos.listar({ q, ordenar: 'nome_asc' }, 1, 25, user)).linhas}
                onFechar={() => setExportacao(null)}
                onExportar={(p, extra, total) => { setExportacao(null); void exportar(p, extra, total); }}
                onCopiar={p => { setExportacao(null); void copiarPedido(p); }}
                onPreVisualizar={async (p, extra) => {
                    try {
                        const linhas = await ServicoAgendaContactos.exportar(p, user);
                        const { blob } = await gerarFicheiro(linhas, p, opcoesFicheiro(extra), filtros);
                        const ligacao = URL.createObjectURL(blob);
                        window.open(ligacao, '_blank', 'noopener');
                        setTimeout(() => URL.revokeObjectURL(ligacao), 120_000);
                    } catch (e) { toast({ title: 'Não foi possível pré-visualizar', description: e instanceof Error ? e.message : String(e), variant: 'destructive' }); }
                }}
                onGuardarPreferencias={(p, predef) => setPreferencias(guardarPreferencias(user?.id || 'anonimo', p, predef))} />
        </MainLayout>
    );
}
