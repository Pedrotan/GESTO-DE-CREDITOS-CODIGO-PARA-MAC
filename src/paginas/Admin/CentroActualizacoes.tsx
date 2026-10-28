import { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudUpload, Loader2, PauseCircle, PlayCircle, RefreshCw, Rocket, Users } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Input } from '@/componentes/ui/input';
import { Switch } from '@/componentes/ui/switch';
import { Textarea } from '@/componentes/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';
import { masterUpdatesApi } from '@/servicos/ServicoMasterCloud';

// Painel Master › Actualizações: versões do Tango ERP registadas na VPS. Cada versão tem o interruptor
// «Disponibilizar actualizações para todos»: desligado, só a equipa de desenvolvimento a recebe; ligado, chega a
// todas as empresas em tempo real. O servidor aplica a mesma regra ao aviso, ao feed e ao download.

type Release = {
    id: string; version: string; notes: string; mandatory: boolean; public: boolean; rolloutPercent: number;
    status: 'active' | 'paused'; files: Record<string, { files: Array<{ url: string; size: number }> }>; createdAt: string; publishedAt: string | null;
};
type Device = {
    device_id: string; kind: string; platform: string | null; app_version: string | null; tenant_id: string | null; tenant_name: string | null;
    team: boolean; tenant_team: boolean; label: string | null; state: string | null; state_reason: string | null; acked_version: string | null; last_seen: string;
};
type AuditRow = { id: string; at: string; action: string; version: string | null; details: string; ip: string | null };
type Company = { tenant_id: string; name: string; status: string; team: boolean; devices: number };
type Overview = { releases: Release[]; devices: Device[]; teamTenants: Array<{ tenant_id: string }>; companies?: Company[]; audit: AuditRow[]; eventClients: number };

const STATE_LABEL: Record<string, string> = {
    up_to_date: 'Actualizado', available: 'Disponível', downloading: 'A descarregar', downloaded: 'Pronta a instalar', installing: 'A instalar',
    verifying: 'A verificar', succeeded: 'Instalada', failed: 'Falhou', deferred: 'Adiada',
};

const when = (value: string | null) => value ? new Date(value).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const megabytes = (release: Release) => {
    const size = release.files?.win?.files?.[0]?.size ?? release.files?.mac?.files?.[0]?.size;
    return size ? `${(size / 1_048_576).toFixed(1)} MB` : '—';
};

export default function CentroActualizacoes() {
    const [data, setData] = useState<Overview | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [form, setForm] = useState({ version: '', notes: '', mandatory: false });
    const [teamTenant, setTeamTenant] = useState('');

    const load = useCallback(async () => {
        setLoading(true); setError('');
        try { setData(await masterUpdatesApi('overview')); }
        catch (failure: any) { setError(failure?.message || 'Não foi possível obter as actualizações do servidor.'); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const run = async (key: string, action: string, payload: Record<string, unknown>) => {
        setBusy(key); setError('');
        try { await masterUpdatesApi(action, payload, action === 'release-register' ? 300_000 : 60_000); await load(); return true; }
        catch (failure: any) { setError(failure?.message || 'A operação falhou.'); return false; }
        finally { setBusy(''); }
    };

    const latest = data?.releases?.[0] ?? null;
    const companies = useMemo(() => {
        const term = teamTenant.trim().toLowerCase();
        return (data?.companies || []).filter(company => !term || company.name.toLowerCase().includes(term) || company.tenant_id.toLowerCase().includes(term));
    }, [data, teamTenant]);
    const orphanTeam = useMemo(() => {
        const known = new Set((data?.companies || []).map(company => company.tenant_id));
        return (data?.teamTenants || []).filter(row => !known.has(row.tenant_id));
    }, [data]);
    const counts = useMemo(() => {
        const map = new Map<string, number>();
        for (const device of data?.devices || []) if (device.app_version) map.set(device.app_version, (map.get(device.app_version) || 0) + 1);
        return map;
    }, [data]);

    const togglePublic = async (release: Release, enabled: boolean) => {
        const question = enabled
            ? `Disponibilizar a versão ${release.version} para TODAS as empresas agora?\n\nOs computadores ligados recebem o aviso de imediato.`
            : `Voltar a reservar a versão ${release.version} só para a equipa de desenvolvimento?\n\nQuem ainda não a descarregou deixa de a receber.`;
        if (!window.confirm(question)) return;
        await run(`public-${release.version}`, 'release-set-public', { version: release.version, public: enabled });
    };

    const register = async () => {
        if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(form.version.trim())) { setError('Indique a versão no formato 3.0.4.'); return; }
        if (await run('register', 'release-register', { version: form.version.trim(), notes: form.notes, mandatory: form.mandatory })) {
            setForm({ version: '', notes: '', mandatory: false });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-2xl font-black"><Rocket className="h-6 w-6 text-blue-600" /> Actualizações</h2>
                    <p className="text-sm text-slate-500">Versões do Tango ERP na VPS. Uma versão nova chega primeiro só à equipa; depois de testada, ligue «para todos».</p>
                </div>
                <Button variant="outline" className="gap-2" disabled={loading} onClick={() => void load()}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Actualizar
                </Button>
            </div>
            {error && <div className="whitespace-pre-line rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>}

            {latest && (
                <Card className={latest.public ? 'border-emerald-300' : 'border-blue-300'}>
                    <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-sm text-slate-500">Versão mais recente registada</p>
                            <p className="text-3xl font-black">{latest.version} {latest.status === 'paused' && <Badge variant="outline" className="ml-2 border-red-300 text-red-600">Suspensa</Badge>}</p>
                            <p className="text-xs text-slate-500">
                                {latest.public ? `Disponível para todas as empresas${latest.rolloutPercent < 100 ? ` (${latest.rolloutPercent}% dos computadores)` : ''} desde ${when(latest.publishedAt)}.` : 'Só a equipa de desenvolvimento recebe esta versão.'}
                                {' '}{data?.eventClients ?? 0} cliente(s) ligados ao aviso em tempo real.
                            </p>
                        </div>
                        <label className="flex items-center gap-3 rounded-xl border bg-white p-4 dark:bg-slate-900">
                            <Switch
                                checked={latest.public}
                                disabled={!!busy || latest.status === 'paused'}
                                onCheckedChange={checked => void togglePublic(latest, checked)}
                                aria-label="Disponibilizar actualizações para todos"
                            />
                            <span>
                                <span className="block font-bold">Disponibilizar actualizações para todos</span>
                                <span className="block text-xs text-slate-500">{latest.public ? 'Ligado: todas as empresas recebem a versão.' : 'Desligado: só a equipa de desenvolvimento.'}</span>
                            </span>
                            {busy === `public-${latest.version}` && <Loader2 className="h-4 w-4 animate-spin" />}
                        </label>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><CloudUpload className="h-5 w-5" /> Registar versão nova</CardTitle>
                    <CardDescription>
                        Copie primeiro para a VPS, em <code>/var/www/tango-erp/dados-actualizacoes/&lt;versão&gt;/</code>, o instalador e o <code>latest.yml</code> gerados
                        pelo <code>npm run build:erp</code> (pasta <code>release/</code>). O servidor confere o tamanho e o SHA-512 antes de aceitar.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-[160px_1fr_auto]">
                    <Input placeholder="3.0.4" value={form.version} onChange={event => setForm({ ...form, version: event.target.value })} />
                    <Textarea placeholder="Notas da versão (o que muda para o utilizador)" rows={3} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} />
                    <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2 text-sm"><Switch checked={form.mandatory} onCheckedChange={checked => setForm({ ...form, mandatory: checked })} /> Obrigatória</label>
                        <Button className="gap-2" disabled={busy === 'register'} onClick={() => void register()}>
                            {busy === 'register' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />} Registar (só equipa)
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Versões</CardTitle><CardDescription>Cada versão tem o seu interruptor. Suspender corta o aviso e o download de imediato.</CardDescription></CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table>
                        <TableHeader><TableRow>
                            <TableHead>Versão</TableHead><TableHead>Para todos</TableHead><TableHead>Rollout</TableHead><TableHead>Tipo</TableHead>
                            <TableHead>Tamanho</TableHead><TableHead>Computadores</TableHead><TableHead>Registada</TableHead><TableHead className="text-right">Acções</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                            {(data?.releases || []).length === 0 ? (
                                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-slate-500">Nenhuma versão registada.</TableCell></TableRow>
                            ) : data!.releases.map(release => (
                                <TableRow key={release.id}>
                                    <TableCell className="font-mono font-bold">{release.version}<p className="max-w-xs whitespace-pre-line font-sans text-xs font-normal text-slate-500">{release.notes}</p></TableCell>
                                    <TableCell><Switch checked={release.public} disabled={!!busy || release.status === 'paused'} onCheckedChange={checked => void togglePublic(release, checked)} aria-label={`Disponibilizar ${release.version} para todos`} /></TableCell>
                                    <TableCell>
                                        <select className="rounded border bg-transparent px-2 py-1 text-sm" value={release.rolloutPercent} disabled={!!busy}
                                            onChange={event => void run(`rollout-${release.version}`, 'release-update', { version: release.version, rolloutPercent: Number(event.target.value) })}>
                                            {[5, 25, 50, 100].concat([5, 25, 50, 100].includes(release.rolloutPercent) ? [] : [release.rolloutPercent]).map(value => <option key={value} value={value}>{value}%</option>)}
                                        </select>
                                    </TableCell>
                                    <TableCell>
                                        <button type="button" disabled={!!busy} onClick={() => void run(`mandatory-${release.version}`, 'release-update', { version: release.version, mandatory: !release.mandatory })}>
                                            {release.mandatory ? <Badge className="bg-red-600 text-white hover:bg-red-600">Obrigatória</Badge> : <Badge variant="outline">Opcional</Badge>}
                                        </button>
                                    </TableCell>
                                    <TableCell className="text-xs">{megabytes(release)} · {Object.keys(release.files || {}).join(', ')}</TableCell>
                                    <TableCell className="text-center font-mono text-xs">{counts.get(release.version) || 0}</TableCell>
                                    <TableCell className="whitespace-nowrap text-xs">{when(release.createdAt)}</TableCell>
                                    <TableCell className="text-right">
                                        {release.status === 'paused' ? (
                                            <Button size="sm" variant="outline" className="gap-1" disabled={!!busy} onClick={() => void run(`pause-${release.version}`, 'release-resume', { version: release.version })}><PlayCircle className="h-4 w-4" /> Retomar</Button>
                                        ) : (
                                            <Button size="sm" variant="outline" className="gap-1 text-red-600" disabled={!!busy}
                                                onClick={() => { if (window.confirm(`Suspender a versão ${release.version}? Deixa de ser oferecida e descarregada.`)) void run(`pause-${release.version}`, 'release-pause', { version: release.version }); }}>
                                                <PauseCircle className="h-4 w-4" /> Suspender
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Equipa de desenvolvimento e computadores</CardTitle>
                    <CardDescription>
                        Os computadores marcados como equipa (ou de uma empresa marcada como equipa) recebem as versões antes de todos. O identificador de cada
                        computador aparece no Tango ERP em Definições › Sobre › Actualizações.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-bold">Empresas cadastradas ({data?.companies?.length ?? 0})</h3>
                        <Input className="w-64" placeholder="Pesquisar por nome ou NIF" value={teamTenant} onChange={event => setTeamTenant(event.target.value)} />
                    </div>
                    <div className="max-h-96 overflow-auto rounded-xl border">
                        <Table>
                            <TableHeader><TableRow>
                                <TableHead>Equipa</TableHead><TableHead>Empresa</TableHead><TableHead>NIF / ID</TableHead><TableHead>Estado</TableHead><TableHead className="text-center">Computadores</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {companies.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">{teamTenant ? 'Nenhuma empresa corresponde à pesquisa.' : 'Nenhuma empresa cadastrada no servidor.'}</TableCell></TableRow>
                                ) : companies.map(company => (
                                    <TableRow key={company.tenant_id}>
                                        <TableCell>
                                            <Switch checked={company.team} disabled={!!busy} aria-label={`${company.name}: equipa de desenvolvimento`}
                                                onCheckedChange={checked => void run(`tenant-${company.tenant_id}`, 'tenant-set-team', { tenantId: company.tenant_id, team: checked })} />
                                        </TableCell>
                                        <TableCell className="font-semibold">{company.name}</TableCell>
                                        <TableCell className="font-mono text-xs">{company.tenant_id}</TableCell>
                                        <TableCell className="text-xs">{company.status === 'active' ? 'Activa' : company.status === 'blocked' ? 'Bloqueada' : company.status}</TableCell>
                                        <TableCell className="text-center font-mono text-xs">{company.devices}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <p className="text-xs text-slate-500">
                        Os computadores de uma empresa marcada como equipa recebem as versões novas antes de todos, logo que abram o Tango ERP 3.0.4 ou mais recente
                        com a licença da empresa. Para marcar só um computador, use a tabela abaixo.
                    </p>
                    {orphanTeam.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-slate-500">Marcadas como equipa mas sem cadastro:</span>
                            {orphanTeam.map(row => (
                                <Badge key={row.tenant_id} variant="outline" className="gap-1">
                                    {row.tenant_id}
                                    <button type="button" aria-label={`Retirar ${row.tenant_id} da equipa`} onClick={() => void run('tenant', 'tenant-set-team', { tenantId: row.tenant_id, team: false })}>×</button>
                                </Badge>
                            ))}
                        </div>
                    )}
                    <h3 className="pt-2 font-bold">Computadores com o Tango ERP 3.0.4 ou mais recente</h3>
                    <div className="overflow-x-auto rounded-xl border">
                        <Table>
                            <TableHeader><TableRow>
                                <TableHead>Equipa</TableHead><TableHead>Computador</TableHead><TableHead>Empresa</TableHead><TableHead>Versão</TableHead>
                                <TableHead>Estado</TableHead><TableHead>Última ligação</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {(data?.devices || []).length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-slate-500">Nenhum computador registado ainda.</TableCell></TableRow>
                                ) : data!.devices.map(device => (
                                    <TableRow key={device.device_id}>
                                        <TableCell>
                                            <Switch checked={device.team} disabled={!!busy} aria-label="Equipa de desenvolvimento"
                                                onCheckedChange={checked => void run(`device-${device.device_id}`, 'device-set-team', { deviceId: device.device_id, team: checked, ...(checked && !device.label ? { label: window.prompt('Nome para este computador (opcional):') || '' } : {}) })} />
                                            {device.tenant_team && !device.team && <p className="text-[10px] text-blue-600">pela empresa</p>}
                                        </TableCell>
                                        <TableCell><p className="font-semibold">{device.label || (device.kind === 'web' ? 'Navegador' : 'Computador')}</p><p className="font-mono text-[10px] text-slate-500">{device.device_id}</p></TableCell>
                                        <TableCell className="text-xs">{device.tenant_name || device.tenant_id || '—'}</TableCell>
                                        <TableCell className="font-mono text-xs">{device.app_version || '—'} {device.platform ? `(${device.platform})` : ''}</TableCell>
                                        <TableCell className="text-xs">{device.state ? STATE_LABEL[device.state] || device.state : '—'}{device.state === 'failed' && device.state_reason ? <p className="text-red-600">{device.state_reason}</p> : null}</TableCell>
                                        <TableCell className="whitespace-nowrap text-xs">{when(device.last_seen)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Auditoria</CardTitle><CardDescription>Cada mudança feita neste painel fica registada no servidor.</CardDescription></CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table>
                        <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Versão</TableHead><TableHead>O que mudou</TableHead><TableHead>IP</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {(data?.audit || []).length === 0 ? (
                                <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-slate-500">Sem registos.</TableCell></TableRow>
                            ) : data!.audit.map(row => (
                                <TableRow key={row.id}>
                                    <TableCell className="whitespace-nowrap text-xs">{when(row.at)}</TableCell>
                                    <TableCell className="font-mono text-xs">{row.version || '—'}</TableCell>
                                    <TableCell className="text-sm">{row.details}</TableCell>
                                    <TableCell className="text-xs text-slate-500">{row.ip || '—'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
