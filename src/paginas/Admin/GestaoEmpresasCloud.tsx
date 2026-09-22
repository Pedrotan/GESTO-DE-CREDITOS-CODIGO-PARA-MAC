import { useEffect, useState } from 'react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import {
    Cloud, Building2, KeyRound, Copy, RefreshCw, Loader2, ShieldCheck, ShieldOff,
    Trash2, Plus, CheckCircle, AlertTriangle, Link2, Eye, EyeOff, CalendarClock
} from 'lucide-react';

// Gestão central de Empresas (Tenants) e Chaves de Sincronização Cloud.
// Fala com a API /api/tenants do deployment Vercel, autenticada com a
// chave mestra (TANGO_MASTER_SECRET). Uso exclusivo do Painel Master.

type CloudTenant = {
    tenantId: string;
    name: string;
    status: 'active' | 'blocked';
    expiresAt: string | null;
    createdAt: string;
    lastSyncAt: string | null;
    operations?: number;
};

const URL_KEY = 'tango_master_cloud_url';
const SECRET_KEY = 'tango_master_cloud_secret';

export default function GestaoEmpresasCloud() {
    const [serverUrl, setServerUrl] = useState(() => localStorage.getItem(URL_KEY) || 'https://tango-gestao-creditos.vercel.app');
    const [masterSecret, setMasterSecret] = useState(() => localStorage.getItem(SECRET_KEY) || '');
    const [showSecret, setShowSecret] = useState(false);

    const [tenants, setTenants] = useState<CloudTenant[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [busyTenant, setBusyTenant] = useState('');
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Registo de nova empresa
    const [newName, setNewName] = useState('');
    const [newNif, setNewNif] = useState('');
    const [newExpiry, setNewExpiry] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Chave gerada (mostrada uma única vez)
    const [generatedKey, setGeneratedKey] = useState<{ tenant: string; key: string } | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => { localStorage.setItem(URL_KEY, serverUrl); }, [serverUrl]);
    useEffect(() => { localStorage.setItem(SECRET_KEY, masterSecret); }, [masterSecret]);

    const notify = (type: 'success' | 'error', message: string) => {
        setFeedback({ type, message });
        setTimeout(() => setFeedback(null), 6000);
    };

    const api = async (action: string, payload: Record<string, any> = {}) => {
        const base = serverUrl.trim().replace(/\/+$/, '');
        if (!base.startsWith('http')) throw new Error('Indique o URL do servidor (ex.: https://tango-gestao-creditos.vercel.app).');
        if (!masterSecret.trim()) throw new Error('Indique a chave mestra (TANGO_MASTER_SECRET) configurada na Vercel.');
        const response = await fetch(`${base}/api/tenants`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${masterSecret.trim()}`
            },
            body: JSON.stringify({ action, ...payload }),
            signal: AbortSignal.timeout(20_000)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || `Erro do servidor (${response.status}).`);
        return data;
    };

    const loadTenants = async () => {
        setIsLoading(true);
        try {
            const data = await api('list');
            setTenants(data.tenants || []);
        } catch (e: any) {
            notify('error', e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newName.trim() || !newNif.trim()) return;
        setIsCreating(true);
        try {
            const data = await api('create', {
                tenantId: newNif.trim(),
                name: newName.trim(),
                expiresAt: newExpiry ? new Date(`${newExpiry}T23:59:59`).toISOString() : undefined
            });
            setGeneratedKey({ tenant: newName.trim(), key: data.key });
            setCopied(false);
            setNewName(''); setNewNif(''); setNewExpiry('');
            notify('success', 'Empresa registada com sucesso.');
            await loadTenants();
        } catch (e: any) {
            notify('error', e.message);
        } finally {
            setIsCreating(false);
        }
    };

    const handleToggleStatus = async (tenant: CloudTenant) => {
        setBusyTenant(tenant.tenantId);
        try {
            await api('update', { tenantId: tenant.tenantId, status: tenant.status === 'active' ? 'blocked' : 'active' });
            notify('success', tenant.status === 'active' ? `"${tenant.name}" bloqueada.` : `"${tenant.name}" reativada.`);
            await loadTenants();
        } catch (e: any) {
            notify('error', e.message);
        } finally {
            setBusyTenant('');
        }
    };

    const handleRotate = async (tenant: CloudTenant) => {
        if (!confirm(`Gerar uma NOVA chave para "${tenant.name}"?\n\nA chave antiga deixa de funcionar imediatamente e todos os dispositivos desta empresa terão de introduzir a nova chave.`)) return;
        setBusyTenant(tenant.tenantId);
        try {
            const data = await api('rotate', { tenantId: tenant.tenantId });
            setGeneratedKey({ tenant: tenant.name, key: data.key });
            setCopied(false);
        } catch (e: any) {
            notify('error', e.message);
        } finally {
            setBusyTenant('');
        }
    };

    const handleDelete = async (tenant: CloudTenant) => {
        if (!confirm(`Eliminar o registo de "${tenant.name}" (${tenant.tenantId})?\n\nOs dados sincronizados NÃO são apagados; a empresa volta a poder usar a chave global.`)) return;
        setBusyTenant(tenant.tenantId);
        try {
            await api('delete', { tenantId: tenant.tenantId });
            notify('success', 'Registo eliminado.');
            await loadTenants();
        } catch (e: any) {
            notify('error', e.message);
        } finally {
            setBusyTenant('');
        }
    };

    const copyKey = async () => {
        if (!generatedKey) return;
        try {
            await navigator.clipboard.writeText(generatedKey.key);
            setCopied(true);
        } catch {
            notify('error', 'Não foi possível copiar. Selecione e copie manualmente.');
        }
    };

    const formatDate = (value: string | null) =>
        value ? new Date(value).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                        <Cloud className="h-6 w-6 text-blue-600" /> Empresas Cloud
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Registe empresas, gere chaves de sincronização individuais e controle o acesso à versão web.
                    </p>
                </div>
                <Button onClick={loadTenants} disabled={isLoading} variant="outline" className="gap-2 self-start sm:self-auto">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Atualizar Lista
                </Button>
            </div>

            {feedback && (
                <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm font-semibold ${feedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400'
                    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400'}`}>
                    {feedback.type === 'success' ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                    <span>{feedback.message}</span>
                </div>
            )}

            {/* Configuração da ligação ao servidor */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                    <Link2 className="h-4 w-4 text-blue-600" /> Ligação ao Servidor Central
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-500">URL do Servidor (Vercel)</Label>
                        <Input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://tango-gestao-creditos.vercel.app" className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-500">Chave Mestra (TANGO_MASTER_SECRET)</Label>
                        <div className="relative">
                            <Input
                                type={showSecret ? 'text' : 'password'}
                                value={masterSecret}
                                onChange={(e) => setMasterSecret(e.target.value)}
                                placeholder="Chave configurada nas variáveis da Vercel"
                                className="h-11 pr-11"
                            />
                            <button type="button" onClick={() => setShowSecret(v => !v)} tabIndex={-1}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Registo de nova empresa */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                    <Plus className="h-4 w-4 text-blue-600" /> Registar Nova Empresa
                </h3>
                <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-500">Nome da Empresa</Label>
                        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Empresa X, Lda" className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-500">NIF (Tenant ID)</Label>
                        <Input value={newNif} onChange={(e) => setNewNif(e.target.value)} placeholder="Ex.: 5417000000" className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-500">Validade da Chave (opcional)</Label>
                        <Input type="date" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} className="h-11" />
                    </div>
                </div>
                <Button onClick={handleCreate} disabled={isCreating || !newName.trim() || !newNif.trim()} className="mt-4 h-11 w-full gap-2 bg-blue-600 font-bold text-white hover:bg-blue-500 md:w-auto md:px-8">
                    {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    Registar e Gerar Chave
                </Button>
            </div>

            {/* Chave gerada — mostrada uma única vez */}
            {generatedKey && (
                <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 sm:p-6 dark:border-amber-700 dark:bg-amber-950/30">
                    <h3 className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                        <KeyRound className="h-4 w-4" /> Chave de Sincronização — {generatedKey.tenant}
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        Guarde esta chave agora. Por segurança, ela não volta a ser mostrada (apenas o hash fica no servidor).
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <code className="flex-1 overflow-x-auto rounded-xl bg-white px-4 py-3 font-mono text-sm font-bold text-slate-800 dark:bg-slate-900 dark:text-slate-200">
                            {generatedKey.key}
                        </code>
                        <Button onClick={copyKey} className="h-auto gap-2 bg-amber-600 font-bold text-white hover:bg-amber-500">
                            {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copied ? 'Copiada!' : 'Copiar'}
                        </Button>
                        <Button variant="outline" onClick={() => setGeneratedKey(null)}>Fechar</Button>
                    </div>
                </div>
            )}

            {/* Lista de empresas */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                    <Building2 className="h-4 w-4 text-blue-600" /> Empresas Registadas ({tenants.length})
                </h3>

                {tenants.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 p-6 text-center text-sm font-semibold text-slate-400 dark:bg-slate-950/50">
                        {isLoading ? 'A carregar…' : 'Nenhuma empresa carregada. Clique em "Atualizar Lista" ou registe a primeira empresa.'}
                    </p>
                ) : (
                    <div className="space-y-3">
                        {tenants.map((tenant) => (
                            <div key={tenant.tenantId} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between dark:border-slate-800">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-bold text-slate-800 dark:text-slate-100">{tenant.name}</p>
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${tenant.status === 'active'
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                                            : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'}`}>
                                            {tenant.status === 'active' ? 'Ativa' : 'Bloqueada'}
                                        </span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-400">
                                        <span>NIF: <span className="font-mono">{tenant.tenantId}</span></span>
                                        <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Expira: {formatDate(tenant.expiresAt)}</span>
                                        <span>Último sync: {formatDate(tenant.lastSyncAt)}</span>
                                        {tenant.operations !== undefined && <span>{tenant.operations} operações</span>}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" variant="outline" disabled={busyTenant === tenant.tenantId} onClick={() => handleToggleStatus(tenant)} className="gap-1.5 text-xs font-bold">
                                        {tenant.status === 'active' ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                                        {tenant.status === 'active' ? 'Bloquear' : 'Ativar'}
                                    </Button>
                                    <Button size="sm" variant="outline" disabled={busyTenant === tenant.tenantId} onClick={() => handleRotate(tenant)} className="gap-1.5 text-xs font-bold">
                                        <KeyRound className="h-3.5 w-3.5" /> Nova Chave
                                    </Button>
                                    <Button size="sm" variant="outline" disabled={busyTenant === tenant.tenantId} onClick={() => handleDelete(tenant)} className="gap-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                                        <Trash2 className="h-3.5 w-3.5" /> Eliminar
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs font-semibold leading-relaxed text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                <p className="font-black uppercase tracking-wider">Como funciona</p>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                    <li>Registe a empresa aqui — o sistema gera uma chave única (tango_live_…).</li>
                    <li>Entregue ao cliente: o link da versão web (ou o instalador desktop), o NIF e a chave.</li>
                    <li>No primeiro acesso, o dispositivo do cliente valida a chave no servidor e descarrega apenas os dados da empresa dele.</li>
                    <li>Pode bloquear, definir validade ou trocar a chave a qualquer momento — o efeito é imediato em todos os dispositivos.</li>
                </ol>
            </div>
        </div>
    );
}
