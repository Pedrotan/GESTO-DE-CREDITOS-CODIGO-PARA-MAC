import { useCallback, useEffect, useState } from 'react';
import { sqlite } from '@/bibliotecas/adaptador-sqlite';
import { Button } from '@/componentes/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { reprocessRetainedOperations, syncCloudNow } from '@/servicos/ServicoSincronizacaoCloud';
import { RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

type SyncConflict = {
    id: string;
    entityType: string;
    entityId: string | null;
    operation: string;
    createdAt: string;
};

export function ConflictReview({ actorId, actorName, canManage }: {
    actorId?: string; actorName?: string; canManage: boolean;
}) {
    const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const refresh = useCallback(async () => {
        try {
            const rows = await sqlite.all<SyncConflict>(`SELECT id, entityType, entityId, operation, createdAt
                FROM sync_conflicts WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 100`);
            setConflicts(rows);
            setError('');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Não foi possível ler os conflitos.');
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const handleReprocess = async () => {
        setBusy(true);
        setError('');
        setSuccessMessage('');
        try {
            const count = await reprocessRetainedOperations();
            await syncCloudNow();
            await refresh();
            if (count > 0) {
                setSuccessMessage(`${count} registo(s) seguro(s) foram reprocessados e aplicados com sucesso.`);
            } else {
                setSuccessMessage('Verificação concluída. Não foram encontrados novos registos pendentes para reprocessar.');
            }
        } catch (cause: any) {
            setError(cause?.message || 'Erro ao reprocessar conflitos.');
        } finally {
            setBusy(false);
        }
    };

    const decide = async (status: 'accepted' | 'rejected') => {
        if (!selected || !actorId || !actorName || !canManage) return;
        const explanation = note.trim();
        if (explanation.length < 10 || explanation.length > 1000) {
            setError('Descreva a decisão e a referência da operação manual em 10 a 1000 caracteres.');
            return;
        }
        setBusy(true);
        try {
            const conflict = conflicts.find(item => item.id === selected);
            const now = new Date().toISOString();
            await sqlite.transaction([
                {
                    sql: `UPDATE sync_conflicts SET status = ?, resolutionNote = ?, resolvedBy = ?, resolvedAt = ?
                          WHERE id = ? AND status = 'pending'`,
                    params: [status, explanation, actorId, now, selected], expectChanges: 1
                },
                {
                    sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                          VALUES (?, ?, ?, ?, 'update', 'credit', ?, ?)`,
                    params: [crypto.randomUUID(), now, actorId, actorName,
                        `Conflito de sincronização ${status === 'accepted' ? 'reconciliado' : 'rejeitado'}`,
                        JSON.stringify({ conflictId: selected, entityType: conflict?.entityType,
                            entityId: conflict?.entityId, status, explanation })]
                }
            ]);
            setSelected(null);
            setNote('');
            await refresh();
            setSuccessMessage(`Conflito marcado como ${status === 'accepted' ? 'reconciliado' : 'rejeitado'}.`);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Não foi possível registar a decisão.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card className="card-elevated border-none shadow-lg">
            <CardHeader>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Conflitos de Sincronização
                        </CardTitle>
                        <CardDescription className="mt-1">
                            Operações que não puderam ser aplicadas de imediato (ex.: esquemas temporariamente divergentes ou concorrência de edições).
                            As inserções seguras de clientes e créditos são reprocessadas automaticamente após a atualização do esquema.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
                            <RefreshCw className={`h-4 w-4 mr-1.5 ${busy ? 'animate-spin' : ''}`} />
                            Atualizar
                        </Button>
                        {canManage && (
                            <Button type="button" size="sm" disabled={busy} onClick={handleReprocess}>
                                <ShieldCheck className="h-4 w-4 mr-1.5" />
                                {busy ? 'A Processar...' : 'Reprocessar Registos Seguros'}
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {error && <p role="alert" className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</p>}
                {successMessage && <p className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-md flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {successMessage}</p>}
                
                {conflicts.length === 0 && !error && (
                    <div className="flex flex-col items-center justify-center p-8 text-center border rounded-lg bg-muted/20">
                        <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
                        <p className="font-medium text-foreground">Sem Conflitos Pendentes</p>
                        <p className="text-sm text-muted-foreground mt-1">Todos os registos e operações da sincronização encontram-se alinhados.</p>
                    </div>
                )}

                {conflicts.map(item => {
                    let reason = '';
                    try {
                        const parsed = JSON.parse(item.operation);
                        reason = parsed.reason || '';
                    } catch {}

                    return (
                        <div key={item.id} className="rounded-md border p-4 space-y-2 bg-card hover:bg-muted/10 transition-colors">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="text-sm font-semibold capitalize flex items-center gap-2">
                                    <span className="inline-block px-2 py-0.5 rounded text-xs bg-primary/10 text-primary">{item.entityType}</span>
                                    <span>{item.entityId ? `ID: ${item.entityId}` : 'Registo sem ID'}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(item.createdAt).toLocaleString('pt-AO')}
                                </span>
                            </div>
                            {reason && (
                                <p className="text-xs text-muted-foreground bg-muted/40 p-2 rounded border font-mono break-all">
                                    {reason}
                                </p>
                            )}
                            {canManage && (
                                <div className="pt-1">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => { setSelected(item.id); setNote(''); setError(''); setSuccessMessage(''); }}
                                    >
                                        Analisar / Decidir Manualmente
                                    </Button>
                                </div>
                            )}
                        </div>
                    );
                })}

                {selected && canManage && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/10 p-4 space-y-3 mt-4">
                        <Label htmlFor="sync-conflict-note" className="font-semibold text-foreground">
                            Decisão e referência da operação manual (10 a 1000 caracteres)
                        </Label>
                        <Textarea
                            id="sync-conflict-note"
                            value={note}
                            maxLength={1000}
                            placeholder="Descreva a razão da aceitação ou rejeição da alteração..."
                            onChange={event => setNote(event.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                            <Button type="button" disabled={busy} onClick={() => void decide('accepted')}>
                                Marcar Reconciliado
                            </Button>
                            <Button type="button" variant="destructive" disabled={busy} onClick={() => void decide('rejected')}>
                                Rejeitar Alteração Remota
                            </Button>
                            <Button type="button" variant="outline" disabled={busy} onClick={() => setSelected(null)}>
                                Cancelar
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
