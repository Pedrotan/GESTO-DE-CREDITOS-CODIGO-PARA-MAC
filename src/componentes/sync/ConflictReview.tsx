import { useCallback, useEffect, useState } from 'react';
import { sqlite } from '@/bibliotecas/adaptador-sqlite';
import { Button } from '@/componentes/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';

type SyncConflict = {
    id: string;
    entityType: string;
    entityId: string | null;
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

    const refresh = useCallback(async () => {
        try {
            const rows = await sqlite.all<SyncConflict>(`SELECT id, entityType, entityId, createdAt
                FROM sync_conflicts WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 100`);
            setConflicts(rows);
            setError('');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Não foi possível ler os conflitos.');
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

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
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Não foi possível registar a decisão.');
        } finally {
            setBusy(false);
        }
    };

    return <Card>
        <CardHeader>
            <CardTitle>Conflitos de sincronização</CardTitle>
            <CardDescription>As operações dos outros dispositivos são aplicadas automaticamente. Aparecem aqui apenas as que não puderam ser aplicadas, por exemplo quando o mesmo crédito foi alterado nos dois lados ao mesmo tempo. Reveja a operação na origem e registe-a pelos fluxos normais antes de a marcar como reconciliada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <Button type="button" variant="outline" onClick={() => void refresh()}>Atualizar lista</Button>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {conflicts.length === 0 && !error && <p className="text-sm text-muted-foreground">Não há conflitos pendentes.</p>}
            {conflicts.map(item => <div key={item.id} className="rounded-md border p-3 space-y-2">
                <div className="text-sm"><strong>{item.entityType}</strong> · {item.entityId || 'Entidade sem identificador'} · {new Date(item.createdAt).toLocaleString('pt-AO')}</div>
                {canManage && <Button type="button" size="sm" variant="outline"
                    onClick={() => { setSelected(item.id); setNote(''); setError(''); }}>Analisar</Button>}
            </div>)}
            {selected && canManage && <div className="rounded-md border p-4 space-y-3">
                <Label htmlFor="sync-conflict-note">Decisão e referência da operação manual</Label>
                <Textarea id="sync-conflict-note" value={note} maxLength={1000}
                    onChange={event => setNote(event.target.value)} />
                <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled={busy} onClick={() => void decide('accepted')}>Marcar reconciliado</Button>
                    <Button type="button" variant="destructive" disabled={busy} onClick={() => void decide('rejected')}>Rejeitar alteração remota</Button>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => setSelected(null)}>Cancelar</Button>
                </div>
            </div>}
        </CardContent>
    </Card>;
}
