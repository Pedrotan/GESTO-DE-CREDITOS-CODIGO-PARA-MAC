import { useMemo, useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { AlertModal } from '@/componentes/ui/AlertModal';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/componentes/ui/table';
import { LogOut, Circle, ShieldCheck, Monitor, Loader2 } from 'lucide-react';
import { ROLES } from '@/tipos/autenticacao';
import { formatDateTime } from '@/bibliotecas/formatters';
import { useToast } from '@/ganchos/usar-toast';
import { cn } from '@/bibliotecas/utils';

/** Sem sinal há mais de 5 minutos, considera-se a sessão terminada. */
const JANELA_ONLINE_MS = 5 * 60 * 1000;

export default function Sessoes() {
    const { users, user, forceLogoutUser } = useAuth();
    const { toast } = useToast();
    const [aTerminar, setATerminar] = useState<string | null>(null);
    const [confirmar, setConfirmar] = useState<{ id: string; nome: string } | null>(null);

    const sessoes = useMemo(() => {
        const agora = Date.now();
        return users
            .map((u) => {
                const visto = u.lastSeen ? new Date(u.lastSeen).getTime() : 0;
                // O heartbeat corre de 2 em 2 minutos; a janela de 5 dá folga
                // para uma batida falhada sem marcar a sessão como caída.
                const online = u.status === 'active' && visto > 0 && agora - visto < JANELA_ONLINE_MS;
                return { ...u, online, visto };
            })
            .sort((a, b) => Number(b.online) - Number(a.online) || b.visto - a.visto);
    }, [users]);

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

    return (
        <MainLayout title="Sessões Activas" subtitle="Operadores ligados ao sistema">
            <div className="flex flex-col gap-6">
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="card-kpi-mint">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 text-slate-950 shrink-0 dark:bg-white/10 dark:text-white">
                                <Monitor className="h-5 w-5" />
                            </div>
                            <p className="text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">Ligados Agora</p>
                        </div>
                        <div className="my-2">
                            <p className="font-display text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                                {online}
                            </p>
                        </div>
                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400">
                            de {users.length} utilizadores
                        </p>
                    </div>
                </div>

                <div className="card-elevated overflow-hidden">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/40 hover:bg-muted/40">
                                    <TableHead className="w-28">Estado</TableHead>
                                    <TableHead>Utilizador</TableHead>
                                    <TableHead className="w-48">Perfil</TableHead>
                                    <TableHead className="w-40">Endereço IP</TableHead>
                                    <TableHead className="w-44">Última actividade</TableHead>
                                    <TableHead className="w-32 text-right">Acção</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sessoes.map((s) => {
                                    const proprio = s.id === user?.id;
                                    return (
                                        <TableRow key={s.id} className={cn(proprio && 'bg-primary/5')}>
                                            <TableCell>
                                                <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                                                    <Circle className={cn(
                                                        'h-2.5 w-2.5',
                                                        s.online ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-300 text-slate-300'
                                                    )} />
                                                    {s.online ? 'Ligado' : 'Desligado'}
                                                </span>
                                            </TableCell>
                                            <TableCell className="font-semibold">
                                                {s.name}
                                                {proprio && (
                                                    <Badge variant="outline" className="ml-2 text-[10px]">esta sessão</Badge>
                                                )}
                                                <p className="text-xs font-normal text-muted-foreground">{s.email}</p>
                                            </TableCell>
                                            <TableCell>
                                                <span className="inline-flex items-center gap-1.5 text-xs">
                                                    <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                                                    {ROLES[s.role]?.label || s.role}
                                                </span>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                                {s.ip || '—'}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {s.lastSeen ? formatDateTime(s.lastSeen) : 'Nunca'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={!s.online || proprio || aTerminar === s.id}
                                                    onClick={() => setConfirmar({ id: s.id, nome: s.name })}
                                                    title={proprio ? 'Não pode terminar a sua própria sessão aqui' : 'Forçar saída deste técnico'}
                                                    className="gap-1.5 text-destructive hover:text-destructive"
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

                <p className="text-xs text-muted-foreground">
                    O sistema não mantém sessões no servidor: a saída é aplicada quando a
                    aplicação do utilizador faz a sua próxima verificação, o que demora até 2 minutos.
                </p>
            </div>

            <AlertModal
                isOpen={!!confirmar}
                onClose={() => setConfirmar(null)}
                title="Terminar sessão?"
                description={`${confirmar?.nome} será desligado do sistema e terá de voltar a autenticar-se.`}
                type="warning"
                showCancel
                onConfirm={() => confirmar && terminar(confirmar.id, confirmar.nome)}
            />
        </MainLayout>
    );
}
