import { useEffect, useMemo, useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { AlertModal } from '@/componentes/ui/AlertModal';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/componentes/ui/table';
import {
    LogOut, Circle, ShieldCheck, Monitor, Loader2, Laptop, Smartphone,
    Tablet, AlertTriangle, ShieldAlert, KeyRound, CheckCircle2
} from 'lucide-react';
import { ROLES } from '@/tipos/autenticacao';
import { formatDateTime } from '@/bibliotecas/formatters';
import { useToast } from '@/ganchos/usar-toast';
import { cn } from '@/bibliotecas/utils';
import { useData } from '@/contextos/ContextoDados';
import { evaluateAccess, formatAccessMoment } from '@/bibliotecas/horario-acesso';
import { HorarioAcessoPanel } from '@/componentes/sessoes/HorarioAcessoPanel';
import { ServicoControloAcesso, SessaoDispositivo } from '@/servicos/ServicoControloAcesso';

/** Sem sinal há mais de 5 minutos, considera-se a sessão terminada. */
const JANELA_ONLINE_MS = 5 * 60 * 1000;

export default function Sessoes() {
    const { users, user, forceLogoutUser, reloadUsers } = useAuth();
    const { accessSchedule, connectedClients, logs } = useData();
    const { toast } = useToast();
    const [aTerminar, setATerminar] = useState<string | null>(null);
    const [confirmar, setConfirmar] = useState<{ id: string; nome: string } | null>(null);

    // Sincronização periódica em tempo real dos utilizadores e sessões ativas
    useEffect(() => {
        if (reloadUsers) {
            void reloadUsers();
            const interval = setInterval(() => {
                void reloadUsers();
            }, 25000);
            return () => clearInterval(interval);
        }
    }, [reloadUsers]);

    // Painel de Segurança - Rastreio de Dispositivos e Navegadores Reais
    const [sessoesDispositivos, setSessoesDispositivos] = useState<SessaoDispositivo[]>(() =>
        ServicoControloAcesso.obterSessoesDispositivos(user?.id, { user, users, connectedClients, logs })
    );

    useEffect(() => {
        const sessoes = ServicoControloAcesso.obterSessoesDispositivos(user?.id, {
            user,
            users,
            connectedClients,
            logs
        });
        setSessoesDispositivos(sessoes);
    }, [user, users, connectedClients, logs]);

    const [confirmarRevogarTodos, setConfirmarRevogarTodos] = useState(false);

    const sessoes = useMemo(() => {
        const agora = Date.now();
        return users
            .map((u) => {
                const proprio = u.id === user?.id;
                // O operador desta sessão conectada está ativamente online agora
                const visto = proprio ? agora : (u.lastSeen ? new Date(u.lastSeen).getTime() : 0);
                const online = proprio || (u.status === 'active' && visto > 0 && agora - visto < JANELA_ONLINE_MS);
                const ipFinal = proprio ? (u.ip || user?.ip || 'Local (Esta Estação)') : (u.ip || '—');

                return {
                    ...u,
                    online,
                    visto,
                    ipFinal,
                    proprio
                };
            })
            .sort((a, b) => Number(b.online) - Number(a.online) || b.visto - a.visto);
    }, [users, user?.id, user?.ip]);

    const online = sessoes.filter((s) => s.online).length;

    const terminar = async (id: string, nome: string) => {
        setATerminar(id);
        try {
            await forceLogoutUser(id);
            toast({
                title: 'Sessão terminada',
                description: `${nome} será desligado do sistema em até 2 minutos.`,
            });
        } catch {
            toast({ title: 'Erro', description: 'Não foi possível terminar a sessão.' });
        } finally {
            setATerminar(null);
            setConfirmar(null);
        }
    };

    const handleRevogarSessaoDispositivo = (id: string, nome: string) => {
        ServicoControloAcesso.terminarSessaoDispositivo(id);
        setSessoesDispositivos(prev => prev.filter(s => s.id !== id));
        toast({
            title: 'Sessão revogada',
            description: `A sessão em ${nome} foi terminada com sucesso e o token revogado.`,
        });
    };

    const handleRevogarTodasOutras = () => {
        ServicoControloAcesso.terminarOutrasSessoes();
        setSessoesDispositivos(prev => prev.filter(s => s.isCurrent));
        setConfirmarRevogarTodos(false);
        toast({
            title: 'Sessões revogadas em todo o lado',
            description: 'Todos os outros dispositivos foram desconectados. Apenas esta sessão atual permanece ativa.',
        });
    };

    const getDeviceIcon = (type: SessaoDispositivo['deviceType']) => {
        switch (type) {
            case 'laptop':
                return <Laptop className="h-5 w-5" />;
            case 'mobile':
                return <Smartphone className="h-5 w-5" />;
            case 'tablet':
                return <Tablet className="h-5 w-5" />;
            case 'desktop':
            default:
                return <Monitor className="h-5 w-5" />;
        }
    };

    return (
        <MainLayout title="Sessões Ativas" subtitle="Monitorização de segurança, dispositivos e navegadores">
            <div className="flex flex-col gap-8">
                
                {/* ============================================================== */}
                {/* PAINEL DE DEFINIÇÕES DE SEGURANÇA E RASTREIO DE DISPOSITIVOS  */}
                {/* ============================================================== */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                    {/* Header do Painel */}
                    <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                                    Dispositivos com Sessão Iniciada
                                </h2>
                                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold">
                                    Segurança Ativa
                                </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {sessoesDispositivos.length === 1
                                    ? '1 dispositivo com sessão iniciada e autorização ativa nesta conta'
                                    : `${sessoesDispositivos.length} dispositivos com sessão iniciada e autorização ativa nesta conta`}
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            disabled={sessoesDispositivos.filter(s => !s.isCurrent).length === 0}
                            onClick={() => setConfirmarRevogarTodos(true)}
                            title={sessoesDispositivos.filter(s => !s.isCurrent).length === 0 ? "Não existem outros dispositivos ligados" : "Terminar sessão em todos os outros postos"}
                            className="border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 font-bold text-xs h-9 gap-2 shadow-xs shrink-0 self-start sm:self-auto disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <LogOut className="h-3.5 w-3.5" />
                            Terminar sessão em todos os outros dispositivos
                        </Button>
                    </div>

                    {/* Lista das 5 Sessões em Cartão com Borda */}
                    <div className="p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-900/30">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60 shadow-xs">
                            {sessoesDispositivos.map((sessao) => (
                                <div
                                    key={sessao.id}
                                    className={cn(
                                        "flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 transition-colors",
                                        sessao.isUnusualLocation
                                            ? "border-l-4 border-amber-500 bg-amber-500/[0.04]"
                                            : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                                    )}
                                >
                                    <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                                        {/* Device Glyph Tile */}
                                        <div className={cn(
                                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
                                            sessao.isCurrent
                                                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60"
                                                : sessao.isUnusualLocation
                                                    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60"
                                                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60"
                                        )}>
                                            {getDeviceIcon(sessao.deviceType)}
                                        </div>

                                        {/* Informações do Dispositivo e Localização */}
                                        <div className="min-w-0 space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                                    {sessao.deviceName}
                                                </span>
                                                <span className="text-xs text-muted-foreground">·</span>
                                                <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                                                    {sessao.browser} ({sessao.os})
                                                </span>
                                                {sessao.isCurrent && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                                                        Este dispositivo
                                                    </span>
                                                )}
                                            </div>

                                            {/* Segunda linha: IP, Cidade e Última Atividade */}
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                <span className="font-mono text-[11px]">{sessao.ip}</span>
                                                <span>·</span>
                                                <span>{sessao.city}</span>
                                                <span>·</span>
                                                <span>{sessao.lastActive}</span>
                                            </div>

                                            {/* Alerta de Localização Invulgar se aplicável */}
                                            {sessao.isUnusualLocation && (
                                                <div className="flex items-center gap-1.5 pt-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                                    <span>{sessao.unusualReason || 'Localização invulgar detetada · Verifique se reconhece este acesso.'}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Ação à direita */}
                                    <div className="flex items-center self-end sm:self-center shrink-0">
                                        {sessao.isCurrent ? (
                                            <span className="text-xs font-bold text-muted-foreground px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                                                Atual
                                            </span>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRevogarSessaoDispositivo(sessao.id, sessao.deviceName)}
                                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-xs font-bold gap-1.5"
                                            >
                                                <LogOut className="h-3.5 w-3.5" />
                                                Terminar sessão
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {sessoesDispositivos.filter(s => !s.isCurrent).length === 0 && (
                                <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/60">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                    <span>Apenas esta estação de trabalho tem sessão iniciada nesta conta. Nenhuma outra máquina ou dispositivo remoto ativo.</span>
                                </div>
                            )}
                        </div>

                        {/* Nota Bordered Neutral-50 */}
                        <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-4 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-3 shadow-2xs">
                            <ShieldAlert className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                            <div className="leading-relaxed">
                                Terminar a sessão revoga imediatamente o token de atualização (refresh token) e desliga o acesso no dispositivo selecionado. As chaves de API e integrações programáticas não são afetadas. Para gerir permissões de serviço e chaves de integração, consulte a{' '}
                                <a
                                    href="#/definicoes?tab=security"
                                    className="font-bold text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                                >
                                    página de Chaves de API e Definições de Segurança
                                </a>.
                            </div>
                        </div>
                    </div>
                </div>

                {/* ============================================================== */}
                {/* GESTÃO GERAL DE OPERADORES LIGADOS AO SISTEMA (ADMINISTRATIVO) */}
                {/* ============================================================== */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                Operadores Ligados ao Sistema
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                Estado em tempo real de todos os colaboradores autorizados
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                {online} online de {users.length} utilizadores
                            </span>
                        </div>
                    </div>

                    <div className="card-elevated overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                                        <TableHead className="w-28 font-bold">Estado</TableHead>
                                        <TableHead className="font-bold">Utilizador</TableHead>
                                        <TableHead className="w-48 font-bold">Perfil</TableHead>
                                        <TableHead className="w-40 font-bold">Endereço IP</TableHead>
                                        <TableHead className="w-44 font-bold">Última actividade</TableHead>
                                        <TableHead className="w-52 font-bold">Horário de acesso</TableHead>
                                        <TableHead className="w-32 text-right font-bold">Acção</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sessoes.map((s) => {
                                        const proprio = s.proprio;
                                        return (
                                            <TableRow key={s.id} className={cn(proprio && 'bg-primary/5')}>
                                                <TableCell>
                                                    <span className="inline-flex items-center gap-2 text-xs font-bold">
                                                        {s.online ? (
                                                            <>
                                                                <span className="relative flex h-2.5 w-2.5 shrink-0">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                                                </span>
                                                                <span className="text-emerald-700 dark:text-emerald-400 font-bold">Ligado</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
                                                                <span className="text-muted-foreground font-medium">Desligado</span>
                                                            </>
                                                        )}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="font-semibold">
                                                    <div className="flex items-center gap-2">
                                                        <span>{s.name}</span>
                                                        {proprio && (
                                                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">esta sessão</Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-normal text-muted-foreground">{s.email}</p>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                                                        <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                                                        {ROLES[s.role]?.label || s.role}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-muted-foreground">
                                                    {s.ipFinal}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {proprio ? (
                                                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                            Activo agora
                                                        </span>
                                                    ) : s.lastSeen ? (
                                                        (Date.now() - s.visto < 60000) ? (
                                                            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                                Activo agora
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground">{formatDateTime(s.lastSeen)}</span>
                                                        )
                                                    ) : (
                                                        <span className="text-muted-foreground">Nunca</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {(() => {
                                                        const access = evaluateAccess(accessSchedule, s);
                                                        if (access.allowed && access.exempt) return <span className="font-semibold text-emerald-700 dark:text-emerald-400">Sem restrição</span>;
                                                        if (access.allowed) return <span className="font-semibold text-emerald-700 dark:text-emerald-400">Permitido até {access.endsAt?.toTimeString().slice(0, 5)}</span>;
                                                        if (!access.nextAccessAt) return <span className="font-semibold text-destructive">Bloqueado</span>;
                                                        return <span className="font-semibold text-amber-700 dark:text-amber-400">Fora do horário · volta {formatAccessMoment(access.nextAccessAt)}</span>;
                                                    })()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={!s.online || proprio || aTerminar === s.id}
                                                        onClick={() => setConfirmar({ id: s.id, nome: s.name })}
                                                        title={proprio ? 'Não pode terminar a sua própria sessão aqui' : 'Forçar saída deste operador'}
                                                        className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        {aTerminar === s.id
                                                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            : <LogOut className="h-3.5 w-3.5" />}
                                                        Terminar
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>

                <HorarioAcessoPanel />

                <p className="text-xs text-muted-foreground">
                    O sistema bancário aplica invalidação periódica a cada 2 minutos através do heartbeat dos postos de trabalho.
                </p>
            </div>

            {/* Modal de Confirmação Individual */}
            <AlertModal
                isOpen={!!confirmar}
                onClose={() => setConfirmar(null)}
                title="Terminar sessão do operador?"
                description={`${confirmar?.nome} será desligado do sistema e terá de voltar a autenticar-se.`}
                type="warning"
                showCancel
                actionLabel="Terminar Sessão"
                cancelLabel="Cancelar"
                onConfirm={() => confirmar && terminar(confirmar.id, confirmar.nome)}
            />

            {/* Modal de Confirmação Global (Sign out everywhere else) */}
            <AlertModal
                isOpen={confirmarRevogarTodos}
                onClose={() => setConfirmarRevogarTodos(false)}
                title="Terminar sessão em todos os outros dispositivos?"
                description="Esta ação irá revogar imediatamente todos os tokens de acesso e desligar os outros computadores e telemóveis ligados a esta conta. Apenas esta sessão atual permanecerá ativa."
                type="warning"
                showCancel
                actionLabel="Sim, Desligar Todos os Outros"
                cancelLabel="Cancelar"
                onConfirm={handleRevogarTodasOutras}
            />
        </MainLayout>
    );
}
