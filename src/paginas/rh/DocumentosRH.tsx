// Gestão documental do RH: árvore com as pastas da empresa e a pasta pessoal de cada funcionário (7 subpastas padrão
// e as criadas pelo RH), lista de ficheiros com pré-visualização, mover, renomear, anular/restaurar e apagar
// definitivo (Super Administrador), pesquisa global, validades, relatórios pessoais e descarga da pasta em ZIP.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Switch } from '@/componentes/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { PdfCanvasViewer } from '@/componentes/ui/PdfCanvasViewer';
import {
    Archive, ChevronDown, ChevronRight, Download, Eye, FileText, Folder, FolderPlus, History, LayoutGrid, List, Lock, MoreHorizontal, MoveRight, Pencil, RotateCcw, Search, Trash2, Upload,
} from 'lucide-react';
import { CATEGORIAS_CONFIDENCIAIS, CATEGORIAS_DOCUMENTO, ServicoRH, type CategoriaDocumento, type DocumentoRH, type Funcionario } from '@/servicos/rh/ServicoRH';
import { EMPRESA, PASTAS_EMPRESA, PASTAS_PESSOAIS, ServicoDocumentosRH, pastaDoDocumento, type AcessoDocumento, type PastaRH, type PastaSistema } from '@/servicos/rh/ServicoDocumentosRH';
import { ServicoSalariosRH, ROTULO_TIPO } from '@/servicos/rh/ServicoSalariosRH';
import { ServicoPontoRH } from '@/servicos/rh/ServicoPontoRH';
import { gerarReciboPdf, periodoPt } from '@/bibliotecas/rh/pdf-rh';
import { bytesDeDataUrl, criarZip } from '@/bibliotecas/rh/zip-simples';
import { estadoBI } from '@/bibliotecas/rh/bi-validade';
import { valorNumerico } from '@/bibliotecas/rh/parametros-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { cn } from '@/bibliotecas/utils';
import { toast } from '@/ganchos/usar-toast';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { useData } from '@/contextos/ContextoDados';
import { NavegacaoRH, SeloBI, dataPt, executar, lerFicheiro, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { emitirDeclaracaoServico, imprimirFicha } from '@/componentes/rh/accoes-funcionario';
import { AvatarFuncionario, useBaseRH } from './FuncionariosRH';

type Item = {
    chave: string; nome: string; tipo: string; validade: string | null; tamanho: number | null; por: string | null; data: string; estado: string;
    confidencial?: boolean; versao?: number; documento?: DocumentoRH; abrir: () => Promise<{ dataUrl: string; nome: string } | null>; origem: string;
};
const nomeCategoria = (id: string) => CATEGORIAS_DOCUMENTO.find(c => c.id === id)?.nome || id;
const tamanhoTexto = (b: number | null) => (b === null ? '—' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const ACCOES: Record<string, string> = { carregar: 'Carregou', ver: 'Viu', descarregar: 'Descarregou', mover: 'Moveu', renomear: 'Renomeou', anular: 'Anulou', restaurar: 'Restaurou', apagar: 'Apagou' };

function descarregar(dataUrl: string, nome: string) {
    const url = URL.createObjectURL(new Blob([bytesDeDataUrl(dataUrl)], { type: dataUrl.slice(5, dataUrl.indexOf(';')) }));
    const a = document.createElement('a');
    a.href = url; a.download = nome; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function DocumentosRH() {
    const { actor, gerir, confidencial, salarios } = useActorRH();
    const { companySettings } = useData();
    const navigate = useNavigate();
    const base = useBaseRH();
    const { funcionarios, cargos, departamentos, contratos, parametros } = base.dados;
    const documentos = useCarregar(() => ServicoRH.documentos(), [] as DocumentoRH[]);
    const pastas = useCarregar(() => ServicoDocumentosRH.pastas(), [] as PastaRH[]);
    const [url, setUrl] = useSearchParams();
    const dono = url.get('funcionario') || EMPRESA;
    const pasta = url.get('pasta');
    const ir = (funcionario: string | null, novaPasta: string | null = null) => setUrl(p => {
        const n = new URLSearchParams(p);
        if (funcionario) n.set('funcionario', funcionario); else n.delete('funcionario');
        if (novaPasta) n.set('pasta', novaPasta); else n.delete('pasta');
        return n;
    }, { replace: false });
    const [filtroArvore, setFiltroArvore] = useState('');
    const [pesquisa, setPesquisa] = useState('');
    const [de, setDe] = useState('');
    const [ate, setAte] = useState('');
    const [vista, setVista] = useState<'lista' | 'grelha'>('lista');
    const [verAnulados, setVerAnulados] = useState(false);
    const [verArquivo, setVerArquivo] = useState(false);
    const [carregar, setCarregar] = useState<File[] | null>(null);
    const [novaPasta, setNovaPasta] = useState(false);
    const [previa, setPrevia] = useState<{ dataUrl: string; nome: string } | null>(null);
    const [mover, setMover] = useState<DocumentoRH | null>(null);
    const [renomear, setRenomear] = useState<{ tipo: 'documento'; documento: DocumentoRH } | { tipo: 'pasta'; pasta: PastaRH } | null>(null);
    const [historico, setHistorico] = useState<DocumentoRH | null>(null);
    const ficheiros = useRef<HTMLInputElement>(null);
    const hoje = luandaTodayKey();
    const maxMb = valorNumerico(parametros, 'documento_max_mb', hoje, 10);
    const superAdmin = actor?.role === 'super_admin';
    const empresa = dono === EMPRESA;
    const f = empresa ? null : funcionarios.find(x => x.id === dono) || null;
    const pastasSistema: PastaSistema[] = empresa ? PASTAS_EMPRESA : PASTAS_PESSOAIS;
    const pastasProprias = pastas.dados.filter(p => p.funcionario_id === dono);
    const recarregar = () => { void documentos.recarregar(); void pastas.recarregar(); };

    // Itens que não são ficheiros carregados: recibos dos meses aprovados e anexos das justificações de faltas.
    const virtuais = useCarregar(async () => {
        if (!f) return { recibos: [] as Item[], justificacoes: [] as Item[] };
        const [recibos, justificacoes] = await Promise.all([salarios ? ServicoSalariosRH.recibosFuncionario(f.id) : Promise.resolve([]), ServicoPontoRH.justificacoes(f.id)]);
        return {
            recibos: recibos.filter(r => ['aprovado', 'pago', 'fechado'].includes(r.estado)).map<Item>(r => ({
                chave: `recibo:${r.id}`, nome: `Recibo ${r.numero_recibo} — ${ROTULO_TIPO[r.tipo]} ${periodoPt(r.ano, r.mes)}`, tipo: 'Recibo de salário', validade: null, tamanho: null,
                por: 'Processamento salarial', data: r.criado_em, estado: 'activo', origem: 'recibo',
                abrir: async () => {
                    const linhas = await ServicoSalariosRH.linhas(r.id);
                    const pdf = gerarReciboPdf(r, linhas, { ano: r.ano, mes: r.mes, tipoRotulo: ROTULO_TIPO[r.tipo], estado: r.estado }, companySettings, actor?.name || '', 'datauri');
                    return { dataUrl: pdf.dataUrl, nome: pdf.fileName };
                },
            })),
            justificacoes: justificacoes.filter(j => j.anexo_nome).map<Item>(j => ({
                chave: `justificacao:${j.id}`, nome: j.anexo_nome || 'Anexo', tipo: `Justificação ${dataPt(j.data_inicio)}${j.data_fim !== j.data_inicio ? ` a ${dataPt(j.data_fim)}` : ''} (${j.estado})`,
                validade: null, tamanho: null, por: j.criado_por_nome || null, data: j.criado_em, estado: 'activo', origem: 'justificacao',
                abrir: async () => { const a = await ServicoPontoRH.anexoJustificacao(j.id); return a?.anexo_data_url ? { dataUrl: a.anexo_data_url, nome: a.anexo_nome } : null; },
            })),
        };
    }, { recibos: [] as Item[], justificacoes: [] as Item[] }, [f?.id, salarios]);

    const visivel = (d: DocumentoRH) => confidencial || !d.confidencial;
    const itemDe = (d: DocumentoRH): Item => ({
        chave: d.id, nome: d.nome, tipo: nomeCategoria(d.categoria), validade: d.data_validade, tamanho: d.tamanho, por: d.carregado_por_nome, data: d.criado_em,
        estado: d.estado, confidencial: Boolean(d.confidencial), versao: d.versao, documento: d, origem: d.origem || 'upload',
        abrir: async () => {
            const dataUrl = await ServicoRH.ficheiroDocumento(d.id);
            if (!dataUrl) { toast({ variant: 'destructive', title: 'Ficheiro indisponível', description: 'O ficheiro ainda não chegou a este computador (sincronização em curso).' }); return null; }
            return { dataUrl, nome: d.ficheiro_nome };
        },
    });
    const docsDoDono = useMemo(() => documentos.dados.filter(d => d.funcionario_id === dono && visivel(d)), [documentos.dados, dono, confidencial]); // eslint-disable-line react-hooks/exhaustive-deps
    const contar = (p: string) => docsDoDono.filter(d => d.estado === 'activo' && pastaDoDocumento(d) === p).length
        + (p === 'sys:recibos' ? virtuais.dados.recibos.length : p === 'sys:ausencias' ? virtuais.dados.justificacoes.length : 0);
    const itens = useMemo(() => {
        if (!pasta) return [];
        const docs = docsDoDono.filter(d => pastaDoDocumento(d) === pasta && (verAnulados ? d.estado === 'arquivado' : d.estado === 'activo')).map(itemDe);
        if (verAnulados) return docs;
        return [...docs, ...(pasta === 'sys:recibos' ? virtuais.dados.recibos : pasta === 'sys:ausencias' ? virtuais.dados.justificacoes : [])];
    }, [pasta, docsDoDono, verAnulados, virtuais.dados]); // eslint-disable-line react-hooks/exhaustive-deps
    const nomePasta = (p: string | null) => !p ? '' : p === 'raiz' ? 'Outros documentos' : p.startsWith('sys:') ? pastasSistema.find(x => `sys:${x.chave}` === p)?.nome || p : pastasProprias.find(x => x.id === p)?.nome || 'Pasta';
    const pastaSistemaActual = pasta?.startsWith('sys:') ? pastasSistema.find(x => `sys:${x.chave}` === pasta) : undefined;

    // Pesquisa global: nome do ficheiro, tipo e funcionário, com intervalo de datas.
    const resultados = useMemo(() => {
        const termo = pesquisa.trim().toLowerCase();
        if (!termo && !de && !ate) return null;
        return documentos.dados.filter(d => visivel(d) && d.estado === 'activo' && (!de || d.criado_em.slice(0, 10) >= de) && (!ate || d.criado_em.slice(0, 10) <= ate)
            && (!termo || [d.nome, d.ficheiro_nome, nomeCategoria(d.categoria), d.funcionario_id === EMPRESA ? 'empresa' : funcionarios.find(x => x.id === d.funcionario_id)?.nome].some(v => v?.toLowerCase().includes(termo))));
    }, [pesquisa, de, ate, documentos.dados, funcionarios, confidencial]); // eslint-disable-line react-hooks/exhaustive-deps

    const abrirItem = async (i: Item) => {
        const r = await i.abrir();
        if (!r) return;
        if (i.documento && actor) void ServicoDocumentosRH.registarAcesso(i.documento.id, 'ver', actor);
        if (/^data:(application\/pdf|image\/)/u.test(r.dataUrl)) setPrevia(r); else descarregar(r.dataUrl, r.nome);
    };
    const descarregarItem = async (i: Item) => {
        const r = await i.abrir();
        if (!r) return;
        if (i.documento && actor) void ServicoDocumentosRH.registarAcesso(i.documento.id, 'descarregar', actor);
        descarregar(r.dataUrl, r.nome);
    };
    const descarregarZip = async () => {
        if (!f || !actor) return;
        await executar(async () => {
            const entradas: Array<{ nome: string; dados: Uint8Array; data?: Date }> = [];
            for (const d of docsDoDono.filter(x => x.estado === 'activo')) {
                const url = await ServicoRH.ficheiroDocumento(d.id);
                if (!url) continue;
                entradas.push({ nome: `${nomePasta(pastaDoDocumento(d))}/${d.ficheiro_nome}`, dados: bytesDeDataUrl(url), data: new Date(d.criado_em) });
                void ServicoDocumentosRH.registarAcesso(d.id, 'descarregar', actor);
            }
            for (const i of [...virtuais.dados.recibos, ...virtuais.dados.justificacoes]) {
                const r = await i.abrir();
                if (r) entradas.push({ nome: `${i.origem === 'recibo' ? 'Recibos de salário' : 'Férias e ausências'}/${r.nome}`, dados: bytesDeDataUrl(r.dataUrl), data: new Date(i.data) });
            }
            if (!entradas.length) throw new Error('A pasta não tem ficheiros.');
            const zip = criarZip(entradas);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(zip);
            a.download = `Pasta-${f.numero_mecanografico}-${f.nome.normalize('NFD').replace(/[̀-ͯ]/gu, '').replace(/[^\w]+/gu, '_')}.zip`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
        }, 'Pasta descarregada em ZIP');
    };

    const activos = funcionarios.filter(x => x.estado !== 'cessado');
    const arquivo = funcionarios.filter(x => x.estado === 'cessado');
    const filtra = (x: Funcionario) => !filtroArvore.trim() || `${x.numero_mecanografico} ${x.nome}`.toLowerCase().includes(filtroArvore.trim().toLowerCase());
    const validades = f ? [
        ...(f.bi_validade ? [{ nome: 'Bilhete de identidade', validade: f.bi_validade }] : []),
        ...docsDoDono.filter(d => d.estado === 'activo' && d.data_validade).map(d => ({ nome: d.nome, validade: d.data_validade! })),
    ].sort((a, b) => a.validade.localeCompare(b.validade)) : [];
    const ctx = { cargos, departamentos, contratos };
    const arvoreItem = (activo: boolean) => cn('flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-link', activo ? 'bg-indigo-50 font-bold text-indigo-900 dark:bg-slate-800 dark:text-white' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800');
    const pastaArvore = (p: string, nome: string) => <button key={p} type="button" className={arvoreItem(pasta === p)} onClick={() => ir(empresa ? null : dono, p)}><Folder className="h-3.5 w-3.5 shrink-0 text-indigo-400" aria-hidden="true" /><span className="truncate">{nome}</span></button>;
    const funcionarioArvore = (x: Funcionario) => (
        <div key={x.id}>
            <button type="button" className={arvoreItem(dono === x.id && !pasta)} aria-expanded={dono === x.id} onClick={() => ir(x.id)}>
                {dono === x.id ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{x.numero_mecanografico} · {x.nome}</span>
            </button>
            {dono === x.id && <div className="ml-5 flex flex-col">{PASTAS_PESSOAIS.map(p => pastaArvore(`sys:${p.chave}`, p.nome))}{pastasProprias.map(p => pastaArvore(p.id, p.nome))}</div>}
        </div>
    );

    return (
        <MainLayout title="Gestão documental" subtitle="Documentos da empresa e pasta pessoal de cada funcionário">
            <NavegacaoRH />
            <div className="space-y-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-extrabold text-rh-text dark:text-white">Gestão documental</h1>
                        <p className="mt-1 text-sm text-rh-muted dark:text-slate-400">Documentos da empresa e pasta pessoal de cada funcionário, com validades e relatórios.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="relative">
                            <span className="sr-only">Pesquisar em todos os documentos</span>
                            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
                            <Input className="h-10 w-[280px] pl-9" placeholder="Pesquisar em todos os documentos" value={pesquisa} onChange={e => setPesquisa(e.target.value)} />
                        </label>
                        <Input type="date" aria-label="Desde" className="h-10 w-[150px]" value={de} onChange={e => setDe(e.target.value)} />
                        <Input type="date" aria-label="Até" className="h-10 w-[150px]" value={ate} onChange={e => setAte(e.target.value)} />
                        {gerir && <Button variant="outline" className="h-10" onClick={() => setNovaPasta(true)}><FolderPlus className="mr-2 h-4 w-4" /> Nova pasta</Button>}
                        {gerir && <Button className="h-10 bg-rh-navy hover:bg-rh-navy-2" onClick={() => ficheiros.current?.click()}><Upload className="mr-2 h-4 w-4" /> Carregar</Button>}
                        <input ref={ficheiros} type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" onChange={e => { if (e.target.files?.length) setCarregar([...e.target.files]); e.target.value = ''; }} />
                    </div>
                </div>

                <div className="flex flex-wrap items-start gap-5">
                    <aside aria-label="Pastas" className="w-full rounded-xl border border-rh-border bg-white p-3 sm:w-[270px] dark:border-slate-800 dark:bg-slate-900">
                        <div className="px-2.5 pb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Empresa</div>
                        <button type="button" className={arvoreItem(empresa && !pasta)} onClick={() => ir(null)}><Folder className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" /> Documentos da empresa</button>
                        {empresa && <div className="ml-5 flex flex-col">{PASTAS_EMPRESA.map(p => pastaArvore(`sys:${p.chave}`, p.nome))}{pastasProprias.map(p => pastaArvore(p.id, p.nome))}</div>}
                        <div className="px-2.5 pb-2 pt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Funcionários</div>
                        <Input className="mb-2 h-9 text-sm" placeholder="Filtrar funcionários" aria-label="Filtrar funcionários" value={filtroArvore} onChange={e => setFiltroArvore(e.target.value)} />
                        <div className="max-h-[52vh] space-y-0.5 overflow-y-auto">{activos.filter(filtra).map(funcionarioArvore)}</div>
                        {arquivo.length > 0 && <>
                            <button type="button" className="mt-3 flex w-full items-center gap-1.5 px-2.5 text-xs font-bold uppercase tracking-wider text-slate-500" aria-expanded={verArquivo} onClick={() => setVerArquivo(v => !v)}>
                                {verArquivo ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Arquivo ({arquivo.length})
                            </button>
                            {verArquivo && <div className="mt-1 space-y-0.5">{arquivo.filter(filtra).map(funcionarioArvore)}</div>}
                        </>}
                    </aside>

                    <section className="min-w-0 flex-[999_1_520px] space-y-4">
                        {resultados ? (
                            <div className="rounded-xl border border-rh-border bg-white dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex items-center justify-between border-b border-rh-border px-4 py-3 dark:border-slate-800">
                                    <h2 className="font-bold">{resultados.length} resultado(s)</h2>
                                    <Button size="sm" variant="ghost" onClick={() => { setPesquisa(''); setDe(''); setAte(''); }}>Limpar pesquisa</Button>
                                </div>
                                <TabelaItens itens={resultados.map(itemDe)} mostrarDono={d => d.funcionario_id === EMPRESA ? 'Empresa' : funcionarios.find(x => x.id === d.funcionario_id)?.nome || '—'}
                                    hoje={hoje} gerir={gerir} superAdmin={superAdmin} onAbrir={abrirItem} onDescarregar={descarregarItem} onMover={setMover}
                                    onRenomear={d => setRenomear({ tipo: 'documento', documento: d })} onHistorico={setHistorico}
                                    onAnular={d => actor && void executar(() => ServicoRH.arquivarDocumento(d.id, actor), 'Documento anulado (pode restaurá-lo em «Anulados»)').then(ok => ok && recarregar())}
                                    onRestaurar={d => actor && void executar(() => ServicoDocumentosRH.restaurar(d, actor), 'Documento restaurado').then(ok => ok && recarregar())}
                                    onApagar={d => actor && window.confirm(`Apagar definitivamente «${d.nome}»? Esta acção não se pode desfazer.`) && void executar(() => ServicoDocumentosRH.apagarDefinitivo(d, actor), 'Documento apagado definitivamente').then(ok => ok && recarregar())} />
                            </div>
                        ) : <>
                            {f ? (
                                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-rh-border bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
                                    <AvatarFuncionario f={f} tamanho="h-[52px] w-[52px] text-base" className="rounded-xl" />
                                    <div className="min-w-[200px] flex-1">
                                        <div className="text-[13px] text-rh-muted">Funcionários › {f.numero_mecanografico}{pasta ? ` › ${nomePasta(pasta)}` : ''}</div>
                                        <div className="text-lg font-extrabold">{f.nome}</div>
                                        <div className="text-[13px] text-rh-muted">{[cargos.find(c => c.id === f.cargo_id)?.nome, departamentos.find(d => d.id === f.departamento_id)?.nome].filter(Boolean).join(' · ')}</div>
                                    </div>
                                    <Button variant="outline" onClick={() => navigate(`/rh/funcionarios?ficha=${f.id}`)}>Ver ficha</Button>
                                    <Button variant="outline" onClick={() => void descarregarZip()}><Download className="mr-2 h-4 w-4" /> Pasta em ZIP</Button>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-rh-border bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
                                    <div className="text-[13px] text-rh-muted">Empresa{pasta ? ` › ${nomePasta(pasta)}` : ''}</div>
                                    <div className="text-lg font-extrabold">{companySettings?.name || 'Documentos da empresa'}</div>
                                </div>
                            )}

                            {!pasta ? (
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                    {pastasSistema.map(p => (
                                        <button key={p.chave} type="button" onClick={() => ir(empresa ? null : dono, `sys:${p.chave}`)}
                                            className="flex flex-col gap-2 rounded-xl border border-rh-border bg-white p-4 text-left hover:border-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-link dark:border-slate-800 dark:bg-slate-900">
                                            <Folder className="h-7 w-7 fill-indigo-200 text-indigo-600" aria-hidden="true" />
                                            <strong className="text-sm">{p.nome}</strong><span className="text-xs text-rh-muted">{p.descricao} · {contar(`sys:${p.chave}`)} ficheiro(s)</span>
                                        </button>
                                    ))}
                                    {pastasProprias.map(p => (
                                        <div key={p.id} className="relative flex flex-col gap-2 rounded-xl border border-rh-border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                            <button type="button" className="flex flex-col gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-link" onClick={() => ir(empresa ? null : dono, p.id)}>
                                                <Folder className="h-7 w-7 fill-amber-100 text-amber-600" aria-hidden="true" /><strong className="text-sm">{p.nome}</strong><span className="text-xs text-rh-muted">Pasta pessoal · {contar(p.id)} ficheiro(s)</span>
                                            </button>
                                            {gerir && <DropdownMenu>
                                                <DropdownMenuTrigger asChild><button type="button" className="absolute right-2 top-2 rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={`Acções da pasta ${p.nome}`}><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => setRenomear({ tipo: 'pasta', pasta: p })}><Pencil className="mr-2 h-4 w-4" /> Renomear</DropdownMenuItem>
                                                    <DropdownMenuItem className="text-rh-danger" onSelect={() => actor && window.confirm(`Anular a pasta «${p.nome}»? Os documentos voltam a «Outros documentos».`) && void executar(() => ServicoDocumentosRH.anularPasta(p.id, actor), 'Pasta anulada').then(ok => ok && recarregar())}><Archive className="mr-2 h-4 w-4" /> Anular pasta</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>}
                                        </div>
                                    ))}
                                    {contar('raiz') > 0 && (
                                        <button type="button" onClick={() => ir(empresa ? null : dono, 'raiz')} className="flex flex-col gap-2 rounded-xl border border-rh-border bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-900">
                                            <Folder className="h-7 w-7 fill-slate-200 text-slate-500" aria-hidden="true" /><strong className="text-sm">Outros documentos</strong><span className="text-xs text-rh-muted">{contar('raiz')} ficheiro(s)</span>
                                        </button>
                                    )}
                                    {gerir && (
                                        <button type="button" onClick={() => setNovaPasta(true)} className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-rh-input-border bg-white p-4 text-slate-600 dark:border-slate-700 dark:bg-slate-900">
                                            <strong className="text-sm">+ {empresa ? 'Pasta' : 'Pasta pessoal'}</strong><span className="text-xs text-rh-muted">Criar subpasta</span>
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-rh-border bg-white dark:border-slate-800 dark:bg-slate-900">
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rh-border px-4 py-3 dark:border-slate-800">
                                        <div className="flex items-center gap-2">
                                            <button type="button" className="text-sm font-semibold text-rh-link hover:underline" onClick={() => ir(empresa ? null : dono)}>← Pastas</button>
                                            <h2 className="font-bold">{verAnulados ? `Anulados em ${nomePasta(pasta)}` : nomePasta(pasta)}</h2>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Switch checked={verAnulados} onCheckedChange={setVerAnulados} /> Anulados</label>
                                            <div className="flex rounded-lg border border-rh-border p-0.5 dark:border-slate-700" role="group" aria-label="Vista">
                                                <button type="button" aria-pressed={vista === 'lista'} aria-label="Ver em lista" className={cn('rounded-md p-1.5', vista === 'lista' && 'bg-slate-100 dark:bg-slate-800')} onClick={() => setVista('lista')}><List className="h-4 w-4" /></button>
                                                <button type="button" aria-pressed={vista === 'grelha'} aria-label="Ver em grelha" className={cn('rounded-md p-1.5', vista === 'grelha' && 'bg-slate-100 dark:bg-slate-800')} onClick={() => setVista('grelha')}><LayoutGrid className="h-4 w-4" /></button>
                                            </div>
                                        </div>
                                    </div>
                                    {itens.length === 0 ? <div className="p-5"><Vazio>{verAnulados ? 'Não há documentos anulados nesta pasta.' : 'Pasta vazia.'}</Vazio></div> : vista === 'lista' ? (
                                        <TabelaItens itens={itens} hoje={hoje} gerir={gerir} superAdmin={superAdmin} onAbrir={abrirItem} onDescarregar={descarregarItem} onMover={setMover}
                                            onRenomear={d => setRenomear({ tipo: 'documento', documento: d })} onHistorico={setHistorico}
                                            onAnular={d => actor && void executar(() => ServicoRH.arquivarDocumento(d.id, actor), 'Documento anulado (pode restaurá-lo em «Anulados»)').then(ok => ok && recarregar())}
                                            onRestaurar={d => actor && void executar(() => ServicoDocumentosRH.restaurar(d, actor), 'Documento restaurado').then(ok => ok && recarregar())}
                                            onApagar={d => actor && window.confirm(`Apagar definitivamente «${d.nome}»? Esta acção não se pode desfazer.`) && void executar(() => ServicoDocumentosRH.apagarDefinitivo(d, actor), 'Documento apagado definitivamente').then(ok => ok && recarregar())} />
                                    ) : (
                                        <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
                                            {itens.map(i => (
                                                <button key={i.chave} type="button" onClick={() => void abrirItem(i)} className="flex flex-col gap-2 rounded-xl border border-rh-border p-3 text-left hover:border-indigo-300 dark:border-slate-700">
                                                    <FileText className="h-8 w-8 text-indigo-500" aria-hidden="true" />
                                                    <span className="line-clamp-2 text-sm font-semibold">{i.nome}</span>
                                                    <span className="text-xs text-rh-muted">{i.tipo} · {dataPt(i.data)}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {gerir && !verAnulados && !['sys:recibos'].includes(pasta) && (
                                        <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files?.length) setCarregar([...e.dataTransfer.files]); }}
                                            className="m-4 rounded-xl border-2 border-dashed border-rh-input-border p-6 text-center text-sm text-rh-muted dark:border-slate-700">
                                            Arraste ficheiros para esta pasta (PDF, imagens, Word, Excel · até {maxMb} MB cada) ou <button type="button" className="font-semibold text-rh-link hover:underline" onClick={() => ficheiros.current?.click()}>escolha do computador</button>.
                                            <div className="mt-1 text-xs">Ao carregar, escolha o tipo de documento e, se tiver, a data de validade.</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>}
                    </section>

                    {f && !resultados && (
                        <aside className="w-full space-y-4 sm:w-[320px]">
                            <div className="rounded-xl border border-rh-border bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
                                <h2 className="text-base font-bold">Relatórios pessoais</h2>
                                <p className="mb-1.5 text-[13px] text-rh-muted">Gerar em PDF e guardar na pasta do funcionário.</p>
                                {[
                                    ['Ficha individual completa', () => actor && executar(() => imprimirFicha(f, ctx, companySettings, actor, salarios), 'Ficha gerada e guardada em Relatórios pessoais')],
                                    ...(gerir ? [['Declaração de serviço', () => actor && executar(() => emitirDeclaracaoServico(f, ctx, companySettings, actor), 'Declaração gerada e guardada em Declarações')] as const] : []),
                                ].map(([nome, accao]) => (
                                    <div key={nome as string} className="flex items-center justify-between border-b border-slate-100 py-3 text-sm last:border-0 dark:border-slate-800">
                                        <span>{nome as string}</span>
                                        <button type="button" className="text-[13px] font-semibold text-rh-link hover:underline" onClick={() => void Promise.resolve((accao as () => unknown)()).then(() => recarregar())}>Gerar</button>
                                    </div>
                                ))}
                            </div>
                            <div className="rounded-xl border border-rh-border bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
                                <h2 className="mb-2.5 text-base font-bold">Validades</h2>
                                {validades.length === 0 ? <p className="text-sm text-rh-muted">Sem documentos com validade.</p> : validades.map(v => (
                                    <div key={`${v.nome}${v.validade}`} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                                        <span className="truncate">{v.nome}</span>
                                        <SeloBI situacao={{ ...estadoBI(v.validade, hoje, 90), texto: `Válido até ${dataPt(v.validade)}` }} detalhe={false} />
                                    </div>
                                ))}
                                <p className="mt-3 text-[13px] text-rh-muted">Alerta automático 90, 30 e 7 dias antes de um documento expirar (configurável em Configurações › parâmetro «documento_alertas_dias»).</p>
                            </div>
                        </aside>
                    )}
                </div>
            </div>

            {actor && carregar && <DialogoCarregar ficheiros={carregar} dono={dono} donoNome={f?.nome || 'Empresa'} pasta={pasta && !['sys:recibos'].includes(pasta) ? pasta : null}
                pastaSistema={pastaSistemaActual} podeConfidencial={confidencial} maxMb={maxMb} actor={actor} onClose={() => setCarregar(null)} onSaved={recarregar} />}
            {actor && novaPasta && <DialogoTexto titulo={empresa ? 'Nova pasta da empresa' : `Nova pasta pessoal — ${f?.nome}`} rotulo="Nome da pasta" inicial="" onClose={() => setNovaPasta(false)}
                onConfirm={nome => executar(() => ServicoDocumentosRH.criarPasta(dono, nome, actor), 'Pasta criada').then(ok => { if (ok) recarregar(); return ok; })} />}
            {actor && renomear && <DialogoTexto titulo="Renomear" rotulo="Nome" inicial={renomear.tipo === 'documento' ? renomear.documento.nome : renomear.pasta.nome} onClose={() => setRenomear(null)}
                onConfirm={nome => executar(() => renomear.tipo === 'documento' ? ServicoDocumentosRH.renomear(renomear.documento, nome, actor) : ServicoDocumentosRH.renomearPasta(renomear.pasta.id, nome, actor), 'Nome alterado').then(ok => { if (ok) recarregar(); return ok; })} />}
            {actor && mover && <DialogoMover documento={mover} opcoes={[...(mover.funcionario_id === EMPRESA ? PASTAS_EMPRESA : PASTAS_PESSOAIS).filter(p => p.chave !== 'recibos').map(p => ({ id: `sys:${p.chave}`, nome: p.nome })),
                ...pastas.dados.filter(p => p.funcionario_id === mover.funcionario_id).map(p => ({ id: p.id, nome: p.nome })), { id: 'raiz', nome: 'Outros documentos' }]}
                onClose={() => setMover(null)} onConfirm={destino => executar(() => ServicoDocumentosRH.mover(mover, destino, actor), 'Documento movido').then(ok => { if (ok) recarregar(); return ok; })} />}
            {historico && <DialogoHistorico documento={historico} onClose={() => setHistorico(null)} />}
            {previa && (
                <Dialog open onOpenChange={v => !v && setPrevia(null)}>
                    <DialogContent className="flex h-[90vh] max-w-5xl flex-col">
                        <DialogHeader><DialogTitle>{previa.nome}</DialogTitle><DialogDescription>Pré-visualização. Use «Descarregar» para guardar uma cópia.</DialogDescription></DialogHeader>
                        <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-100 p-2 dark:bg-slate-900">
                            {previa.dataUrl.startsWith('data:application/pdf') ? <PdfCanvasViewer source={previa.dataUrl} /> : <img src={previa.dataUrl} alt={previa.nome} className="mx-auto max-h-full object-contain" />}
                        </div>
                        <DialogFooter><Button variant="outline" onClick={() => descarregar(previa.dataUrl, previa.nome)}><Download className="mr-2 h-4 w-4" /> Descarregar</Button></DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </MainLayout>
    );
}

function TabelaItens({ itens, hoje, gerir, superAdmin, mostrarDono, onAbrir, onDescarregar, onMover, onRenomear, onAnular, onRestaurar, onApagar, onHistorico }: {
    itens: Item[]; hoje: string; gerir: boolean; superAdmin: boolean; mostrarDono?: (d: DocumentoRH) => string;
    onAbrir: (i: Item) => void; onDescarregar: (i: Item) => void; onMover: (d: DocumentoRH) => void; onRenomear: (d: DocumentoRH) => void;
    onAnular: (d: DocumentoRH) => void; onRestaurar: (d: DocumentoRH) => void; onApagar: (d: DocumentoRH) => void; onHistorico: (d: DocumentoRH) => void;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead>
                    <tr className="border-b border-rh-border bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                        <th className="px-4 py-2.5">Nome</th>{mostrarDono && <th className="px-4 py-2.5">Funcionário</th>}<th className="px-4 py-2.5">Tipo de documento</th><th className="px-4 py-2.5">Validade</th>
                        <th className="px-4 py-2.5 text-right">Tamanho</th><th className="px-4 py-2.5">Carregado por</th><th className="px-4 py-2.5">Data</th><th className="px-4 py-2.5"><span className="sr-only">Acções</span></th>
                    </tr>
                </thead>
                <tbody>
                    {itens.map(i => {
                        const d = i.documento;
                        return (
                            <tr key={i.chave} className="border-b border-slate-100 dark:border-slate-800">
                                <td className="px-4 py-3">
                                    <button type="button" className="text-left font-semibold text-rh-text hover:underline dark:text-white" onClick={() => onAbrir(i)}>{i.nome}</button>
                                    {i.confidencial && <Lock className="ml-1 inline h-3 w-3 text-slate-400" aria-label="Confidencial" />}
                                    {(i.versao || 1) > 1 && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800">v{i.versao}</span>}
                                    {i.origem !== 'upload' && <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">{i.origem === 'recibo' ? 'recibo' : i.origem === 'justificacao' ? 'justificação' : i.origem === 'declaracao' ? 'declaração' : i.origem === 'relatorio' ? 'relatório' : i.origem}</span>}
                                    {d?.estado === 'arquivado' && <div className="text-[11px] text-rh-muted">Anulado por {d.anulado_por_nome || '—'} a {dataPt(d.anulado_em)}</div>}
                                </td>
                                {mostrarDono && <td className="px-4 py-3">{d ? mostrarDono(d) : '—'}</td>}
                                <td className="px-4 py-3">{i.tipo}</td>
                                <td className="px-4 py-3">{i.validade ? <SeloBI situacao={{ ...estadoBI(i.validade, hoje, 90), texto: `Válido até ${dataPt(i.validade)}` }} /> : '—'}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{tamanhoTexto(i.tamanho)}</td>
                                <td className="px-4 py-3 text-xs">{i.por || '—'}</td>
                                <td className="px-4 py-3 text-xs">{dataPt(i.data)}</td>
                                <td className="whitespace-nowrap px-4 py-3 text-right">
                                    <button type="button" className="rounded p-1.5 text-slate-600 hover:bg-slate-100" title="Pré-visualizar" aria-label={`Pré-visualizar ${i.nome}`} onClick={() => onAbrir(i)}><Eye className="h-4 w-4" /></button>
                                    <button type="button" className="rounded p-1.5 text-slate-600 hover:bg-slate-100" title="Descarregar" aria-label={`Descarregar ${i.nome}`} onClick={() => onDescarregar(i)}><Download className="h-4 w-4" /></button>
                                    {d && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild><button type="button" className="rounded p-1.5 text-slate-600 hover:bg-slate-100" aria-label={`Mais acções para ${i.nome}`}><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {gerir && d.estado === 'activo' && <DropdownMenuItem onSelect={() => onMover(d)}><MoveRight className="mr-2 h-4 w-4" /> Mover</DropdownMenuItem>}
                                                {gerir && d.estado === 'activo' && <DropdownMenuItem onSelect={() => onRenomear(d)}><Pencil className="mr-2 h-4 w-4" /> Renomear</DropdownMenuItem>}
                                                <DropdownMenuItem onSelect={() => onHistorico(d)}><History className="mr-2 h-4 w-4" /> Histórico de acessos</DropdownMenuItem>
                                                {gerir && d.estado === 'activo' && <><DropdownMenuSeparator /><DropdownMenuItem className="text-rh-danger" onSelect={() => onAnular(d)}><Archive className="mr-2 h-4 w-4" /> Anular</DropdownMenuItem></>}
                                                {gerir && d.estado === 'arquivado' && <DropdownMenuItem onSelect={() => onRestaurar(d)}><RotateCcw className="mr-2 h-4 w-4" /> Restaurar</DropdownMenuItem>}
                                                {superAdmin && d.estado === 'arquivado' && <DropdownMenuItem className="text-rh-danger" onSelect={() => onApagar(d)}><Trash2 className="mr-2 h-4 w-4" /> Apagar definitivamente</DropdownMenuItem>}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function DialogoCarregar({ ficheiros, dono, donoNome, pasta, pastaSistema, podeConfidencial, maxMb, actor, onClose, onSaved }: {
    ficheiros: File[]; dono: string; donoNome: string; pasta: string | null; pastaSistema?: PastaSistema; podeConfidencial: boolean; maxMb: number;
    actor: NonNullable<ReturnType<typeof useActorRH>['actor']>; onClose: () => void; onSaved: () => void;
}) {
    const categorias = CATEGORIAS_DOCUMENTO.filter(c => podeConfidencial || !CATEGORIAS_CONFIDENCIAIS.has(c.id));
    const [linhas, setLinhas] = useState(ficheiros.map(f => ({ ficheiro: f, nome: f.name.replace(/\.[^.]+$/u, ''), categoria: (pastaSistema?.categoria || 'outros') as CategoriaDocumento, validade: '' })));
    const [aGuardar, setAGuardar] = useState(false);
    const guardar = async () => {
        setAGuardar(true);
        const ok = await executar(async () => {
            for (const l of linhas) {
                if (l.ficheiro.size > maxMb * 1024 * 1024) throw new Error(`«${l.ficheiro.name}» tem mais de ${maxMb} MB.`);
                await ServicoRH.carregarDocumento({ funcionario_id: dono, categoria: l.categoria, nome: l.nome, ficheiro_nome: l.ficheiro.name, data_url: await lerFicheiro(l.ficheiro),
                    data_validade: l.validade || null, pasta_id: pasta === 'raiz' ? null : pasta, origem: 'upload' }, maxMb, actor);
            }
        }, linhas.length > 1 ? `${linhas.length} documentos carregados` : 'Documento carregado');
        setAGuardar(false);
        if (ok) { onSaved(); onClose(); }
    };
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-3xl">
                <DialogHeader><DialogTitle>Carregar para {donoNome}{pasta ? '' : ''}</DialogTitle><DialogDescription>Escolha o tipo de documento e, se tiver, a validade. Um ficheiro com o mesmo nome na mesma pasta fica como nova versão.</DialogDescription></DialogHeader>
                <div className="max-h-[55vh] space-y-2 overflow-y-auto">
                    {linhas.map((l, i) => (
                        <div key={i} className="grid items-center gap-2 rounded-xl border border-rh-border p-3 sm:grid-cols-[1fr_190px_160px] dark:border-slate-700">
                            <div className="min-w-0"><Input aria-label="Nome do documento" value={l.nome} onChange={e => setLinhas(ls => ls.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} /><div className="mt-1 truncate text-xs text-rh-muted">{l.ficheiro.name} · {tamanhoTexto(l.ficheiro.size)}</div></div>
                            <Select value={l.categoria} onValueChange={v => setLinhas(ls => ls.map((x, j) => j === i ? { ...x, categoria: v as CategoriaDocumento } : x))}>
                                <SelectTrigger aria-label="Tipo de documento"><SelectValue /></SelectTrigger>
                                <SelectContent>{categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                            </Select>
                            <Input type="date" aria-label="Validade" value={l.validade} onChange={e => setLinhas(ls => ls.map((x, j) => j === i ? { ...x, validade: e.target.value } : x))} />
                        </div>
                    ))}
                </div>
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={aGuardar} onClick={() => void guardar()}>{aGuardar ? 'A carregar…' : 'Carregar'}</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoTexto({ titulo, rotulo, inicial, onClose, onConfirm }: { titulo: string; rotulo: string; inicial: string; onClose: () => void; onConfirm: (v: string) => Promise<boolean> }) {
    const [v, setV] = useState(inicial);
    return (
        <Dialog open onOpenChange={x => !x && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{titulo}</DialogTitle><DialogDescription className="sr-only">{rotulo}</DialogDescription></DialogHeader>
                <Input aria-label={rotulo} autoFocus value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void onConfirm(v).then(ok => ok && onClose()); }} />
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => void onConfirm(v).then(ok => ok && onClose())}>Guardar</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoMover({ documento, opcoes, onClose, onConfirm }: { documento: DocumentoRH; opcoes: Array<{ id: string; nome: string }>; onClose: () => void; onConfirm: (destino: string) => Promise<boolean> }) {
    const actual = pastaDoDocumento(documento);
    const [destino, setDestino] = useState(opcoes.find(o => o.id !== actual)?.id || 'raiz');
    return (
        <Dialog open onOpenChange={x => !x && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Mover «{documento.nome}»</DialogTitle><DialogDescription>Escolha a pasta de destino.</DialogDescription></DialogHeader>
                <Select value={destino} onValueChange={setDestino}>
                    <SelectTrigger aria-label="Pasta de destino"><SelectValue /></SelectTrigger>
                    <SelectContent>{opcoes.map(o => <SelectItem key={o.id} value={o.id} disabled={o.id === actual}>{o.nome}{o.id === actual ? ' (actual)' : ''}</SelectItem>)}</SelectContent>
                </Select>
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => void onConfirm(destino).then(ok => ok && onClose())}>Mover</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoHistorico({ documento, onClose }: { documento: DocumentoRH; onClose: () => void }) {
    const acessos = useCarregar(() => ServicoDocumentosRH.acessos(documento.id), [] as AcessoDocumento[], [documento.id]);
    const linha = (a: AcessoDocumento): ReactNode => <li key={a.id} className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm dark:border-slate-800"><span><b>{a.utilizador_nome || '—'}</b> {(ACCOES[a.accao] || a.accao).toLowerCase()}{a.detalhe ? ` (${a.detalhe})` : ''}</span><span className="shrink-0 text-xs text-rh-muted">{new Date(a.criado_em).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}</span></li>;
    return (
        <Dialog open onOpenChange={x => !x && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Histórico de «{documento.nome}»</DialogTitle><DialogDescription>Quem carregou, viu, descarregou, moveu, renomeou, anulou ou restaurou.</DialogDescription></DialogHeader>
                {acessos.dados.length === 0 ? <p className="text-sm text-rh-muted">Sem registos (documento anterior ao registo de acessos).</p> : <ul className="max-h-[50vh] overflow-y-auto">{acessos.dados.map(linha)}</ul>}
            </DialogContent>
        </Dialog>
    );
}
