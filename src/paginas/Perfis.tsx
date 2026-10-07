import { useState, useMemo } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { AlertModal } from '@/componentes/ui/AlertModal';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/componentes/ui/dialog';
import {
    ShieldCheck, Copy, Plus, Users, ShieldAlert, CheckCircle2,
    Lock, Search, FileText, ChevronRight, Sliders, AlertTriangle
} from 'lucide-react';
import {
    PerfilAcesso, MODULOS_SISTEMA, ROTULOS_AREAS, DESCRICOES_ACOES,
    AcaoModulo, comporPermissao
} from '@/tipos/controlo-acesso';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/ganchos/usar-toast';
import { MatrizPermissoes, LegendaPermissoes } from '@/componentes/permissoes/MatrizPermissoes';
import { ALL_PERMISSIONS, criticalPermissions, describePermission, diffPermissions, segregationConflicts } from '@/bibliotecas/permissoes-analise';
import { validateJustification } from '@/bibliotecas/justificacao';
import { ServicoAuditoriaAvancada } from '@/servicos/ServicoAuditoriaAvancada';
import { cn } from '@/bibliotecas/utils';

export default function Perfis() {
    const { users, user: currentUser } = useAuth();
    const { addLog } = useData();
    const navigate = useNavigate();

    const [perfis, setPerfis] = useState<PerfilAcesso[]>(() => ServicoControloAcesso.obterPerfis());
    const [pesquisa, setPesquisa] = useState('');
    const [filtroArea, setFiltroArea] = useState<string>('todas');

    // Estado do Modal de Edição de Permissões do Perfil
    const [perfilEmEdicao, setPerfilEmEdicao] = useState<PerfilAcesso | null>(null);
    const [permissoesSelecionadas, setPermissoesSelecionadas] = useState<string[]>([]);
    const [motivoAlteracao, setMotivoAlteracao] = useState('');
    const [pesquisaModulo, setPesquisaModulo] = useState('');
    const [erroMotivo, setErroMotivo] = useState('');
    const [aGuardar, setAGuardar] = useState(false);

    // Estado de Duplicação de Perfil
    const [perfilADuplicar, setPerfilADuplicar] = useState<PerfilAcesso | null>(null);
    const [novoNomePerfil, setNovoNomePerfil] = useState('');
    const [novoCodigoPerfil, setNovoCodigoPerfil] = useState('');

    // Contagem de utilizadores por perfil
    const contagemPorPerfil = useMemo(() => {
        const mapa: Record<string, number> = {};
        users.forEach(u => {
            mapa[u.role] = (mapa[u.role] || 0) + 1;
        });
        return mapa;
    }, [users]);

    // Filtragem de perfis
    const perfisFiltrados = useMemo(() => {
        return perfis.filter(p => {
            const matchesText = p.nome.toLowerCase().includes(pesquisa.toLowerCase()) ||
                p.codigo.toLowerCase().includes(pesquisa.toLowerCase()) ||
                p.descricao.toLowerCase().includes(pesquisa.toLowerCase());
            const matchesArea = filtroArea === 'todas' || p.areaPrincipal === filtroArea;
            return matchesText && matchesArea;
        });
    }, [perfis, pesquisa, filtroArea]);

    const handleAbrirEdicao = (perfil: PerfilAcesso) => {
        setPerfilEmEdicao(perfil);
        setPermissoesSelecionadas([...perfil.permissoesBase]);
        setMotivoAlteracao('');
        setPesquisaModulo('');
        setErroMotivo('');
    };

    const handleSalvarEdicaoPerfil = async () => {
        if (!perfilEmEdicao) return;
        const diferencas = diffPermissions(perfilEmEdicao.permissoesBase, permissoesSelecionadas);
        if (!diferencas.added.length && !diferencas.removed.length) {
            toast({ title: 'Sem alterações', description: 'As permissões do perfil não mudaram.' });
            return;
        }
        const erro = await ServicoAuditoriaAvancada.checkJustification(motivoAlteracao, currentUser?.id);
        if (erro) { setErroMotivo(erro); return; }
        setAGuardar(true);

        const atualizado: PerfilAcesso = {
            ...perfilEmEdicao,
            permissoesBase: permissoesSelecionadas
        };

        ServicoControloAcesso.guardarPerfil(atualizado);
        setPerfis(ServicoControloAcesso.obterPerfis());

        // Registo de auditoria com as permissões antes e depois (e as diferenças).
        await addLog(
            'update',
            'user',
            `Atualizou as permissões base do perfil ${atualizado.nome} (+${diferencas.added.length} / -${diferencas.removed.length}). Motivo: ${motivoAlteracao.trim()}`,
            currentUser?.id,
            currentUser?.name,
            { permissoes: perfilEmEdicao.permissoesBase.length },
            { permissoes: permissoesSelecionadas.length },
            { profileId: atualizado.id, profileName: atualizado.nome, added: diferencas.added, removed: diferencas.removed, reason: motivoAlteracao.trim(),
              changes: [...diferencas.added.map(id => ({ field: id, label: describePermission(id).label, before: 'Inativa', after: 'Ativa' })),
                ...diferencas.removed.map(id => ({ field: id, label: describePermission(id).label, before: 'Ativa', after: 'Inativa' }))] }
        );
        setAGuardar(false);

        toast({
            title: 'Perfil guardado',
            description: `O perfil ${atualizado.nome} foi atualizado. Todos os utilizadores associados herdam imediatamente as novas permissões base.`,
        });

        setPerfilEmEdicao(null);
    };

    const handleDuplicarConfirmado = async () => {
        if (!perfilADuplicar || !novoNomePerfil.trim() || !novoCodigoPerfil.trim()) {
            toast({
                title: 'Campos obrigatórios',
                description: 'Preencha o nome e o código bancário para o novo perfil.',
                variant: 'destructive'
            });
            return;
        }

        try {
            const criado = ServicoControloAcesso.duplicarPerfil(
                perfilADuplicar.id,
                novoNomePerfil.trim(),
                novoCodigoPerfil.trim()
            );
            setPerfis(ServicoControloAcesso.obterPerfis());

            await addLog(
                'create',
                'user',
                `Criou novo perfil de acesso [${criado.nome}] com base em [${perfilADuplicar.nome}]`,
                currentUser?.id,
                currentUser?.name
            );

            toast({
                title: 'Perfil duplicado com sucesso',
                description: `O novo perfil ${criado.nome} está pronto para ser atribuído a utilizadores.`,
            });

            setPerfilADuplicar(null);
            setNovoNomePerfil('');
            setNovoCodigoPerfil('');
        } catch (e: any) {
            toast({ title: 'Erro ao duplicar perfil', description: e.message, variant: 'destructive' });
        }
    };

    const togglePermissao = (permId: string) => {
        setPermissoesSelecionadas(prev =>
            prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
        );
    };

    const marcarVarias = (ids: string[], marcar: boolean) => {
        setPermissoesSelecionadas(prev => marcar ? Array.from(new Set([...prev, ...ids])) : prev.filter(p => !ids.includes(p)));
    };
    const selecionadas = useMemo(() => new Set(permissoesSelecionadas), [permissoesSelecionadas]);
    const originais = useMemo(() => new Set(perfilEmEdicao?.permissoesBase || []), [perfilEmEdicao]);
    const diferencasEdicao = useMemo(() => diffPermissions(originais, selecionadas), [originais, selecionadas]);
    const conflitosEdicao = useMemo(() => segregationConflicts(selecionadas), [selecionadas]);
    const utilizadoresAfetados = useMemo(() => users.filter(u => u.role === perfilEmEdicao?.id), [users, perfilEmEdicao]);

    return (
        <MainLayout title="Perfis de Acesso" subtitle="Modelo de permissões bancário (RBAC) e governação de perfis">
            <div className="flex flex-col gap-6">

                {/* KPI Cards de Perfis */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="card-kpi-sky">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider">Perfis Registados</p>
                                <p className="text-2xl font-black text-slate-950 dark:text-white">{perfis.length}</p>
                            </div>
                        </div>
                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 mt-2">
                            11 predefinidos no modelo bancário
                        </p>
                    </div>

                    <div className="card-kpi-amber">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <Sliders className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider">Com Alçada Financeira</p>
                                <p className="text-2xl font-black text-slate-950 dark:text-white">
                                    {perfis.filter(p => p.alcadasPadrao.aprovacaoCreditoKz > 0).length}
                                </p>
                            </div>
                        </div>
                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 mt-2">
                            Limites de aprovação ativos
                        </p>
                    </div>

                    <div className="card-kpi-purple">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <Lock className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider">2FA Obrigatório</p>
                                <p className="text-2xl font-black text-slate-950 dark:text-white">
                                    {perfis.filter(p => p.exigeDoisFatores).length}
                                </p>
                            </div>
                        </div>
                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 mt-2">
                            Aprovação, contabilidade e gestão
                        </p>
                    </div>

                    <div className="card-kpi-mint">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <Users className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider">Utilizadores Vinculados</p>
                                <p className="text-2xl font-black text-slate-950 dark:text-white">{users.length}</p>
                            </div>
                        </div>
                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 mt-2">
                            Em todos os postos de trabalho
                        </p>
                    </div>
                </div>

                {/* Barra de Filtros e Ações */}
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Pesquisar perfil ou código..."
                                value={pesquisa}
                                onChange={(e) => setPesquisa(e.target.value)}
                                className="pl-9 h-10 rounded-xl"
                            />
                        </div>
                        <div className="flex items-center gap-1 overflow-x-auto py-1">
                            {['todas', 'comercial', 'credito', 'cobranca', 'financeiro', 'administracao'].map(area => (
                                <Button
                                    key={area}
                                    variant={filtroArea === area ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setFiltroArea(area)}
                                    className="h-9 rounded-xl text-xs font-bold capitalize"
                                >
                                    {area === 'todas' ? 'Todas as Áreas' : area}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => navigate('/utilizadores')}
                            className="h-10 rounded-xl font-bold text-xs gap-2"
                        >
                            <Users className="h-4 w-4" />
                            Ver Utilizadores
                        </Button>
                        <Button
                            onClick={() => {
                                const base = perfis.find(p => p.id === 'manager') || perfis[0];
                                setPerfilADuplicar(base);
                                setNovoNomePerfil('');
                                setNovoCodigoPerfil('');
                            }}
                            className="h-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs gap-2 shadow-md shadow-blue-500/20"
                        >
                            <Plus className="h-4 w-4" />
                            Novo Perfil
                        </Button>
                    </div>
                </div>

                {/* Grid de Cards de Perfis */}
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {perfisFiltrados.map((perfil) => {
                        const totalUsers = contagemPorPerfil[perfil.id] || 0;
                        const temAlcada = perfil.alcadasPadrao.aprovacaoCreditoKz > 0;

                        return (
                            <div
                                key={perfil.id}
                                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                            >
                                <div className="space-y-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2.5">
                                            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black">
                                                <ShieldCheck className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-slate-900 dark:text-white leading-tight">
                                                    {perfil.nome}
                                                </h3>
                                                <span className="font-mono text-[11px] text-muted-foreground font-semibold">
                                                    {perfil.codigo}
                                                </span>
                                            </div>
                                        </div>

                                        <Badge variant="outline" className={perfil.corBadge}>
                                            {totalUsers} {totalUsers === 1 ? 'utilizador' : 'utilizadores'}
                                        </Badge>
                                    </div>

                                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                                        {perfil.descricao}
                                    </p>

                                    {/* Detalhes de Segurança e Alçadas */}
                                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                                        <div className="flex justify-between items-center text-muted-foreground">
                                            <span>Alçada de Aprovação:</span>
                                            <span className="font-bold text-slate-900 dark:text-white">
                                                {temAlcada ? `${perfil.alcadasPadrao.aprovacaoCreditoKz.toLocaleString('pt-AO')} Kz` : 'Sem alçada'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-muted-foreground">
                                            <span>Autenticação 2FA:</span>
                                            <span className={perfil.exigeDoisFatores ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-muted-foreground"}>
                                                {perfil.exigeDoisFatores ? 'Obrigatória' : 'Opcional'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-muted-foreground">
                                            <span>Permissões Base:</span>
                                            <span className="font-bold text-slate-900 dark:text-white">
                                                {perfil.id === 'super_admin' ? 'Acesso Total' : `${perfil.permissoesBase.length} ações autorizadas`}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Ações do Perfil */}
                                <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setPerfilADuplicar(perfil);
                                            setNovoNomePerfil(`${perfil.nome} (Cópia)`);
                                            setNovoCodigoPerfil(`${perfil.codigo}_COP`);
                                        }}
                                        className="h-8 rounded-lg text-xs font-bold gap-1.5"
                                        title="Criar cópia deste perfil como base"
                                    >
                                        <Copy className="h-3.5 w-3.5" />
                                        Duplicar
                                    </Button>

                                    <Button
                                        variant="default"
                                        size="sm"
                                        onClick={() => handleAbrirEdicao(perfil)}
                                        className="h-8 rounded-lg text-xs font-bold gap-1.5"
                                    >
                                        <Sliders className="h-3.5 w-3.5" />
                                        Editar Permissões
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Modal de Duplicação de Perfil */}
            <Dialog open={!!perfilADuplicar} onOpenChange={(open) => !open && setPerfilADuplicar(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Copy className="h-5 w-5 text-primary" />
                            Duplicar Perfil de Acesso
                        </DialogTitle>
                        <DialogDescription>
                            Crie um novo perfil bancário com as permissões base copiadas de <span className="font-bold text-foreground">{perfilADuplicar?.nome}</span>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="nome">Nome do Novo Perfil</Label>
                            <Input
                                id="nome"
                                value={novoNomePerfil}
                                onChange={(e) => setNovoNomePerfil(e.target.value)}
                                placeholder="ex.: Gestor de Crédito Júnior"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="codigo">Código Bancário (Sigla)</Label>
                            <Input
                                id="codigo"
                                value={novoCodigoPerfil}
                                onChange={(e) => setNovoCodigoPerfil(e.target.value.toUpperCase())}
                                placeholder="ex.: GESTOR_JR"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPerfilADuplicar(null)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleDuplicarConfirmado} className="font-bold">
                            Criar Perfil Duplicado
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal largo de edição das permissões base do perfil */}
            <Dialog open={!!perfilEmEdicao} onOpenChange={(open) => !open && !aGuardar && setPerfilEmEdicao(null)}>
                <DialogContent className="flex h-[94vh] w-[97vw] max-w-[1500px] flex-col gap-0 overflow-hidden border-none p-0 shadow-2xl">
                    <DialogHeader className="mx-0 mb-0 mt-0 shrink-0 px-6 pb-5 pt-6 pr-16 sm:px-8">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white"><Lock className="h-6 w-6" /></div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <DialogTitle className="text-xl font-black text-white">Editar permissões base: {perfilEmEdicao?.nome}</DialogTitle>
                                    <span className="rounded-full border border-white/30 bg-white/10 px-2.5 py-0.5 font-mono text-[11px] font-bold text-white">{perfilEmEdicao?.codigo}</span>
                                </div>
                                <DialogDescription className="text-xs text-white/75">{perfilEmEdicao?.descricao}</DialogDescription>
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 text-white sm:grid-cols-5">
                            {[
                                ['Permissões ativas', `${permissoesSelecionadas.length} de ${ALL_PERMISSIONS.length}`],
                                ['Ações críticas', String(criticalPermissions(permissoesSelecionadas).length)],
                                ['Utilizadores afetados', String(utilizadoresAfetados.length)],
                                ['Alterações por guardar', `+${diferencasEdicao.added.length} / −${diferencasEdicao.removed.length}`],
                                ['Conflitos de segregação', String(conflitosEdicao.length)],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">{label}</p>
                                    <p className="text-lg font-black">{value}</p>
                                </div>
                            ))}
                        </div>
                    </DialogHeader>

                    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_340px]">
                        <div className="min-h-0 space-y-4 overflow-y-auto p-5 sm:p-6">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div className="relative md:w-96">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input placeholder="Pesquisar módulo ou ação..." value={pesquisaModulo} onChange={(e) => setPesquisaModulo(e.target.value)} className="h-10 rounded-xl pl-9" />
                                </div>
                                <LegendaPermissoes />
                            </div>
                            <MatrizPermissoes selected={selecionadas} baseline={originais} search={pesquisaModulo} onToggle={togglePermissao} onSetMany={marcarVarias} />
                        </div>

                        <aside className="min-h-0 space-y-4 overflow-y-auto border-t bg-muted/30 p-5 lg:border-l lg:border-t-0">
                            <div>
                                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase text-muted-foreground"><Sliders className="h-3.5 w-3.5" /> Resumo das alterações</p>
                                {!diferencasEdicao.added.length && !diferencasEdicao.removed.length ? <p className="text-sm text-muted-foreground">Ainda sem alterações.</p> : (
                                    <div className="max-h-64 space-y-1 overflow-y-auto">
                                        {diferencasEdicao.added.map(id => <p key={id} className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">+ {describePermission(id).label}</p>)}
                                        {diferencasEdicao.removed.map(id => <p key={id} className="rounded-md bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-800 dark:text-red-300">− {describePermission(id).label}</p>)}
                                    </div>
                                )}
                            </div>
                            {conflitosEdicao.length > 0 && (
                                <div className="rounded-xl border border-amber-300 bg-amber-500/10 p-3">
                                    <p className="mb-1 flex items-center gap-1.5 text-xs font-black text-amber-800 dark:text-amber-300"><AlertTriangle className="h-4 w-4" /> Segregação de funções</p>
                                    {conflitosEdicao.map(conflito => <p key={conflito.id} className="text-xs text-amber-800 dark:text-amber-300"><b>{conflito.nome}:</b> {conflito.descricao}</p>)}
                                </div>
                            )}
                            <div>
                                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase text-muted-foreground"><Users className="h-3.5 w-3.5" /> Utilizadores afetados ({utilizadoresAfetados.length})</p>
                                {utilizadoresAfetados.length ? (
                                    <div className="space-y-1">
                                        {utilizadoresAfetados.slice(0, 12).map(u => <p key={u.id} className="truncate rounded-md bg-background px-2 py-1 text-xs" title={u.email}><b>{u.name}</b> · {u.email}</p>)}
                                        {utilizadoresAfetados.length > 12 && <p className="text-xs text-muted-foreground">e mais {utilizadoresAfetados.length - 12}</p>}
                                    </div>
                                ) : <p className="text-xs text-muted-foreground">Nenhum utilizador tem este perfil.</p>}
                                <p className="mt-2 text-[11px] text-muted-foreground">Os utilizadores herdam as novas permissões base de imediato; as exceções individuais mantêm-se.</p>
                            </div>
                            <div className="rounded-xl border bg-background p-3 text-[11px] text-muted-foreground">
                                <p className="mb-1 flex items-center gap-1.5 font-bold text-foreground"><FileText className="h-3.5 w-3.5" /> Como funciona</p>
                                <p>Clique numa célula para ativar ou desativar a ação. O título da coluna marca a coluna inteira na área; «Todas/Nenhuma» atua na linha. A alteração fica na auditoria com os valores antes e depois.</p>
                            </div>
                        </aside>
                    </div>

                    <div className="shrink-0 space-y-3 border-t bg-muted/40 px-5 py-4 sm:px-6">
                        <div className="space-y-1.5">
                            <Label htmlFor="motivo" className="flex items-center gap-1.5 text-xs font-bold text-primary"><ShieldAlert className="h-4 w-4" /> Justificação obrigatória (fica na auditoria)</Label>
                            <Input id="motivo" value={motivoAlteracao} onChange={(e) => { setMotivoAlteracao(e.target.value); setErroMotivo(''); }}
                                placeholder="ex.: Atualização da matriz de competências aprovada em reunião da Direção de Crédito de 06/10" className={cn('bg-background', erroMotivo && 'border-destructive')} />
                            <p className={cn('text-[11px]', erroMotivo ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                                {erroMotivo || validateJustification(motivoAlteracao) && motivoAlteracao ? (erroMotivo || validateJustification(motivoAlteracao)) : 'Pelo menos 20 caracteres e 3 palavras, sem caracteres repetidos e diferente das suas justificações anteriores.'}
                            </p>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <Button variant="outline" onClick={() => setPerfilEmEdicao(null)} disabled={aGuardar}>Cancelar</Button>
                            <Button onClick={() => handleSalvarEdicaoPerfil().catch(error => { setAGuardar(false); toast({ title: 'Não foi possível guardar', description: String(error?.message || error), variant: 'destructive' }); })}
                                disabled={aGuardar || (!diferencasEdicao.added.length && !diferencasEdicao.removed.length)} className="font-bold shadow-md shadow-primary/20">
                                <CheckCircle2 className="mr-2 h-4 w-4" /> Guardar alterações do perfil
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}
