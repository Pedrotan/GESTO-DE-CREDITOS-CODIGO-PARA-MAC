import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { cn } from '@/bibliotecas/utils';
import type { PerfilAcesso } from '@/tipos/controlo-acesso';
import type { User } from '@/tipos/autenticacao';

/**
 * «Atribuir novo nível» (só Super Administradores): escolhe o perfil de acesso do utilizador (por exemplo, de Super
 * Administrador para Administrador e vice-versa). O utilizador passa a ter as permissões base do novo perfil; a
 * alteração exige motivo e fica na auditoria. A conta principal e o próprio utilizador não mudam de nível aqui.
 */
export function AtribuirNivel({ open, onOpenChange, target, perfis, bloqueio, onConfirm }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    target: User | null;
    perfis: PerfilAcesso[];
    /** Motivo pelo qual este utilizador não pode mudar de nível (conta principal, o próprio). */
    bloqueio?: string | null;
    onConfirm: (role: string, motivo: string) => Promise<void>;
}) {
    const [role, setRole] = useState('');
    const [motivo, setMotivo] = useState('');
    const [erro, setErro] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => { if (open && target) { setRole(target.role); setMotivo(''); setErro(''); } }, [open, target]);
    if (!target) return null;
    const actual = perfis.find(perfil => perfil.id === target.role);
    const escolhido = perfis.find(perfil => perfil.id === role);
    const mudou = role && role !== target.role;

    const confirmar = async () => {
        setBusy(true);
        setErro('');
        try {
            await onConfirm(role, motivo.trim());
            onOpenChange(false);
        } catch (error) {
            setErro(String(error instanceof Error ? error.message : error).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
            <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Atribuir novo nível de acesso</DialogTitle>
                    <DialogDescription>
                        {target.name} · nível actual: <strong>{actual?.nome || target.role}</strong>. Escolha o novo perfil; as permissões passam a ser as do perfil escolhido.
                    </DialogDescription>
                </DialogHeader>

                {bloqueio ? (
                    <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {bloqueio}
                    </p>
                ) : (
                    <div className="space-y-4">
                        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Perfis de acesso">
                            {perfis.map(perfil => {
                                const seleccionado = perfil.id === role;
                                return (
                                    <button
                                        key={perfil.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={seleccionado}
                                        onClick={() => setRole(perfil.id)}
                                        className={cn('flex items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/60',
                                            seleccionado && 'border-primary bg-primary/5 ring-2 ring-primary/40')}
                                    >
                                        <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', seleccionado ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                                            {seleccionado && <CheckCircle2 className="h-3 w-3" />}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="flex flex-wrap items-center gap-1.5">
                                                <Badge variant="outline" className={perfil.corBadge}>{perfil.nome}</Badge>
                                                {perfil.id === target.role && <span className="text-[10px] font-bold uppercase text-muted-foreground">actual</span>}
                                            </span>
                                            <span className="mt-1 block text-xs text-muted-foreground">{perfil.descricao}</span>
                                            <span className="mt-1 block text-[11px] font-semibold text-foreground/70">
                                                {perfil.id === 'super_admin' ? 'Acesso total ao sistema' : `${perfil.permissoesBase.length} permissões base`}
                                                {perfil.exigeDoisFatores ? ' · exige 2FA' : ''}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        {mudou && (
                            <div className="space-y-1.5">
                                <Label htmlFor="motivo-nivel">Motivo da alteração (fica na auditoria)</Label>
                                <Textarea id="motivo-nivel" rows={2} value={motivo} onChange={event => setMotivo(event.target.value)}
                                    placeholder={`Ex.: Passa a ${escolhido?.nome || 'novo perfil'} por mudança de funções aprovada pela direcção.`} />
                            </div>
                        )}
                        {erro && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-700">{erro}</p>}
                    </div>
                )}

                <DialogFooter className="gap-2">
                    <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</Button>
                    {!bloqueio && (
                        <Button disabled={busy || !mudou || motivo.trim().length < 20} onClick={() => void confirmar()} title={mudou && motivo.trim().length < 20 ? 'Escreva o motivo (pelo menos 20 caracteres).' : undefined}>
                            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1.5 h-4 w-4" />}
                            {mudou ? `Atribuir ${escolhido?.nome || ''}` : 'Escolha outro nível'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
