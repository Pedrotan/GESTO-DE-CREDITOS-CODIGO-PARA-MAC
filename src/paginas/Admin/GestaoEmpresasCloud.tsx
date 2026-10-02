import { useEffect, useState } from 'react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import {
    Cloud, Building2, KeyRound, Copy, RefreshCw, Loader2, ShieldCheck, ShieldOff,
    Trash2, Plus, CheckCircle, AlertTriangle, Link2, Eye, EyeOff, CalendarClock,
    Search, FileDown, MessageSquare, Check, Sparkles, Shield
} from 'lucide-react';
import { ServicoAngolaAPI } from '@/servicos/ServicoAngolaAPI';
import { exportCompanyCredentialsPDF } from '@/bibliotecas/pdf';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

// Gestão de Empresas e Emissão de Credenciais de Acesso Web (Tango Master Gen)
// Permite cadastrar a empresa via NIF, consultar a Razão Social na AGT/Base Nacional,
// atribuir um Código de Acesso automático e emitir as credenciais para o cliente aceder na Web.

export type CloudTenant = {
    tenantId: string;
    name: string;
    accessCode?: string | null;
    status: 'active' | 'blocked';
    expiresAt: string | null;
    createdAt: string;
    lastSyncAt: string | null;
    operations?: number;
};

const URL_KEY = 'tango_master_cloud_url';
const SECRET_KEY = 'tango_master_cloud_secret';
const LOCAL_TENANTS_KEY = 'tango_master_registered_tenants';

const generateFriendlyCode = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let p1 = '';
    let p2 = '';
    for (let i = 0; i < 4; i++) {
        p1 += chars.charAt(Math.floor(Math.random() * chars.length));
        p2 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `TG-${p1}-${p2}`;
};

export default function GestaoEmpresasCloud() {
    const [serverUrl, setServerUrl] = useState(() => localStorage.getItem(URL_KEY) || 'https://tango-gestao-creditos.vercel.app');
    const [masterSecret, setMasterSecret] = useState(() => localStorage.getItem(SECRET_KEY) || '');
    const [showSecret, setShowSecret] = useState(false);

    const [tenants, setTenants] = useState<CloudTenant[]>(() => {
        try {
            const saved = localStorage.getItem(LOCAL_TENANTS_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const [isLoading, setIsLoading] = useState(false);
    const [busyTenant, setBusyTenant] = useState('');
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Formulário de Cadastro da Empresa
    const [nifType, setNifType] = useState<'COLECTIVO' | 'SINGULAR'>('COLECTIVO');
    const [newNif, setNewNif] = useState('');
    const [newName, setNewName] = useState('');
    const [accessCode, setAccessCode] = useState(() => generateFriendlyCode());
    const [expiryOption, setExpiryOption] = useState<'1m' | '3m' | '6m' | '1y' | 'lifetime' | 'custom'>('1y');
    const [customExpiry, setCustomExpiry] = useState('');
    const [isSearchingNIF, setIsSearchingNIF] = useState(false);
    const [nifFoundSource, setNifFoundSource] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Modal de Credenciais Emitidas
    const [issuedCredentials, setIssuedCredentials] = useState<{
        name: string;
        nif: string;
        accessCode: string;
        webUrl: string;
        expiresAt?: string | null;
    } | null>(null);
    const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

    useEffect(() => { localStorage.setItem(URL_KEY, serverUrl); }, [serverUrl]);
    useEffect(() => { localStorage.setItem(SECRET_KEY, masterSecret); }, [masterSecret]);
    useEffect(() => {
        if (tenants.length > 0) {
            localStorage.setItem(LOCAL_TENANTS_KEY, JSON.stringify(tenants));
        }
    }, [tenants]);

    const notify = (type: 'success' | 'error', message: string) => {
        setFeedback({ type, message });
        setTimeout(() => setFeedback(null), 6000);
    };

    // Formatação de NIF
    const formatNIFInput = (value: string, type: 'SINGULAR' | 'COLECTIVO') => {
        const clean = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (type === 'COLECTIVO') {
            return clean.slice(0, 10).replace(/[^0-9]/g, '');
        } else {
            let formatted = '';
            for (let i = 0; i < clean.length && i < 14; i++) {
                const char = clean[i];
                if (i < 9) {
                    if (/[0-9]/.test(char)) formatted += char;
                } else if (i < 11) {
                    if (/[A-Z]/.test(char)) formatted += char;
                } else {
                    if (/[0-9]/.test(char)) formatted += char;
                }
            }
            return formatted;
        }
    };

    const handleNifChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = formatNIFInput(e.target.value, nifType);
        setNewNif(formatted);
        setNifFoundSource(null);
    };

    // Busca de NIF na Base Central / AGT
    const handleSearchNIF = async () => {
        if (!newNif || newNif.length < 9) {
            notify('error', 'Introduza um NIF ou BI completo para realizar a busca.');
            return;
        }

        setIsSearchingNIF(true);
        setNifFoundSource(null);
        try {
            const result = await ServicoAngolaAPI.fetchBIData(newNif, nifType,
                serverUrl.trim().startsWith('http') ? { url: serverUrl, secret: masterSecret } : undefined);
            if (result && result.success && result.name) {
                setNewName(result.name);
                setNifFoundSource(result.source || 'Base de Dados Nacional');
                notify('success', `Identidade validada com sucesso: "${result.name}"`);
            } else {
                notify('error', result?.message || 'NIF não encontrado na busca automática. Pode introduzir o Nome da Empresa manualmente.');
            }
        } catch (e: any) {
            console.error('Erro na pesquisa de NIF no Master:', e);
            notify('error', 'Falha ao ligar aos serviços de consulta. Pode introduzir o nome manualmente.');
        } finally {
            setIsSearchingNIF(false);
        }
    };

    const api = async (action: string, payload: Record<string, any> = {}) => {
        const base = serverUrl.trim().replace(/\/+$/, '');
        if (!base.startsWith('http')) throw new Error('Indique o URL do servidor (ex.: https://tango-gestao-creditos.vercel.app).');
        
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
            const fetched: CloudTenant[] = data.tenants || [];
            
            // Unir com chaves/códigos armazenados localmente caso o servidor não os tenha
            const merged = fetched.map(t => {
                const local = tenants.find(l => l.tenantId.toUpperCase() === t.tenantId.toUpperCase());
                return {
                    ...t,
                    accessCode: t.accessCode || local?.accessCode || null
                };
            });

            setTenants(merged);
            localStorage.setItem(LOCAL_TENANTS_KEY, JSON.stringify(merged));
            notify('success', 'Lista de empresas sincronizada com sucesso.');
        } catch (e: any) {
            notify('error', e.message || 'Falha ao carregar lista de empresas.');
        } finally {
            setIsLoading(false);
        }
    };

    // Calcular data de expiração selecionada
    const calculateExpiryDate = () => {
        if (expiryOption === 'lifetime') return null;
        if (expiryOption === 'custom' && customExpiry) {
            return new Date(`${customExpiry}T23:59:59`).toISOString();
        }
        const now = new Date();
        if (expiryOption === '1m') now.setMonth(now.getMonth() + 1);
        else if (expiryOption === '3m') now.setMonth(now.getMonth() + 3);
        else if (expiryOption === '6m') now.setMonth(now.getMonth() + 6);
        else if (expiryOption === '1y') now.setFullYear(now.getFullYear() + 1);
        return now.toISOString();
    };

    // Cadastrar Empresa e Gerar Credenciais
    const handleCreate = async () => {
        const cleanNif = newNif.trim().toUpperCase();
        const cleanName = newName.trim();
        const cleanCode = accessCode.trim().toUpperCase();

        if (!cleanNif || cleanNif.length < 5) {
            notify('error', 'Por favor, indique um NIF válido.');
            return;
        }
        if (!cleanName) {
            notify('error', 'Por favor, indique o Nome da Empresa.');
            return;
        }
        if (!cleanCode || cleanCode.length < 4) {
            notify('error', 'O Código de Acesso deve ter pelo menos 4 caracteres.');
            return;
        }

        setIsCreating(true);
        try {
            const expiresAt = calculateExpiryDate();

            const data = await api('create', {
                tenantId: cleanNif,
                name: cleanName,
                accessCode: cleanCode,
                expiresAt: expiresAt || undefined
            });

            const issued = {
                name: cleanName,
                nif: cleanNif,
                accessCode: cleanCode,
                webUrl: serverUrl.trim().replace(/\/+$/, ''),
                expiresAt
            };

            setIssuedCredentials(issued);
            setCopiedWhatsApp(false);

            // Atualizar lista local
            const newRecord: CloudTenant = {
                tenantId: cleanNif,
                name: cleanName,
                accessCode: cleanCode,
                status: 'active',
                expiresAt,
                createdAt: new Date().toISOString(),
                lastSyncAt: null,
                operations: 0
            };

            const updatedTenants = [newRecord, ...tenants.filter(t => t.tenantId !== cleanNif)];
            setTenants(updatedTenants);
            localStorage.setItem(LOCAL_TENANTS_KEY, JSON.stringify(updatedTenants));

            // Reset do formulário
            setNewNif('');
            setNewName('');
            setNifFoundSource(null);
            setAccessCode(generateFriendlyCode());

            notify('success', `Empresa "${cleanName}" cadastrada com sucesso!`);
        } catch (e: any) {
            notify('error', e.message || 'Falha ao cadastrar empresa.');
        } finally {
            setIsCreating(false);
        }
    };

    const handleToggleStatus = async (tenant: CloudTenant) => {
        setBusyTenant(tenant.tenantId);
        try {
            const nextStatus = tenant.status === 'active' ? 'blocked' : 'active';
            await api('update', { tenantId: tenant.tenantId, status: nextStatus });
            
            const updated = tenants.map(t => t.tenantId === tenant.tenantId ? { ...t, status: nextStatus as any } : t);
            setTenants(updated);
            notify('success', nextStatus === 'blocked' ? `Acesso de "${tenant.name}" bloqueado.` : `Acesso de "${tenant.name}" reativado.`);
        } catch (e: any) {
            notify('error', e.message);
        } finally {
            setBusyTenant('');
        }
    };

    const handleRotate = async (tenant: CloudTenant) => {
        const confirm = await Swal.fire({
            title: 'Gerar Novo Código de Acesso?',
            html: `Será gerado um novo código para <strong>${tenant.name}</strong>.<br/><br/><span style="color:#ef4444;font-size:13px;">O código antigo deixará de funcionar de imediato.</span>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sim, Gerar Novo Código',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#f37021'
        });

        if (!confirm.isConfirmed) return;

        setBusyTenant(tenant.tenantId);
        try {
            const data = await api('rotate', { tenantId: tenant.tenantId });
            const newCode = data.accessCode || data.key;

            const updated = tenants.map(t => t.tenantId === tenant.tenantId ? { ...t, accessCode: newCode } : t);
            setTenants(updated);
            localStorage.setItem(LOCAL_TENANTS_KEY, JSON.stringify(updated));

            setIssuedCredentials({
                name: tenant.name,
                nif: tenant.tenantId,
                accessCode: newCode,
                webUrl: serverUrl.trim().replace(/\/+$/, ''),
                expiresAt: tenant.expiresAt
            });
            notify('success', 'Novo código de acesso emitido com sucesso!');
        } catch (e: any) {
            notify('error', e.message);
        } finally {
            setBusyTenant('');
        }
    };

    const handleDelete = async (tenant: CloudTenant) => {
        const confirm = await Swal.fire({
            title: 'Eliminar Empresa?',
            html: `Deseja eliminar o registo de <strong>${tenant.name}</strong> (${tenant.tenantId}) do servidor central?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sim, Eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#ef4444'
        });

        if (!confirm.isConfirmed) return;

        setBusyTenant(tenant.tenantId);
        try {
            await api('delete', { tenantId: tenant.tenantId });
            const updated = tenants.filter(t => t.tenantId !== tenant.tenantId);
            setTenants(updated);
            localStorage.setItem(LOCAL_TENANTS_KEY, JSON.stringify(updated));
            notify('success', `Registo da empresa "${tenant.name}" eliminado.`);
        } catch (e: any) {
            notify('error', e.message);
        } finally {
            setBusyTenant('');
        }
    };

    // Montar texto profissional para WhatsApp / E-mail
    const buildWhatsAppMessage = (data: { name: string; nif: string; accessCode: string; webUrl: string; expiresAt?: string | null }) => {
        const exp = data.expiresAt ? new Date(data.expiresAt).toLocaleDateString('pt-AO') : 'Vitalício / Sem Expiração';
        return `*TANGO GESTÃO DE CRÉDITOS ERP - CREDENCIAIS DE ACESSO WEB*\n\n` +
            `Prezado(a) Cliente,\n` +
            `A sua empresa foi cadastrada com sucesso no sistema Tango ERP.\n\n` +
            `📌 *DADOS DE ACESSO OFICIAL:*\n` +
            `• *Empresa:* ${data.name.toUpperCase()}\n` +
            `• *NIF da Empresa:* ${data.nif}\n` +
            `• *Código de Acesso:* *${data.accessCode}*\n` +
            `• *Validade do Acesso:* ${exp}\n\n` +
            `🌐 *LINK DE ACESSO:* ${data.webUrl}\n\n` +
            `*Como aceder:*\n` +
            `1. Abra o link acima no seu navegador (computador ou telemóvel).\n` +
            `2. Introduza o NIF e o Código de Acesso indicados acima.\n` +
            `3. Conclua o assistente inicial (Onboarding) para configurar a sua senha de Administrador e a sua equipa.\n\n` +
            `_Guarde estas credenciais em segurança. Emitido pelo TangoMaster Gen._`;
    };

    const handleCopyWhatsApp = async (data: { name: string; nif: string; accessCode: string; webUrl: string; expiresAt?: string | null }) => {
        const text = buildWhatsAppMessage(data);
        try {
            await navigator.clipboard.writeText(text);
            setCopiedWhatsApp(true);
            setTimeout(() => setCopiedWhatsApp(false), 3000);
            notify('success', 'Mensagem copiada para a área de transferência! Pronta a enviar no WhatsApp.');
        } catch {
            notify('error', 'Não foi possível copiar automaticamente.');
        }
    };

    const handleDownloadPDF = (data: { name: string; nif: string; accessCode: string; webUrl: string; expiresAt?: string | null }) => {
        exportCompanyCredentialsPDF(data);
    };

    const formatDate = (value: string | null) =>
        value ? new Date(value).toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    return (
        <div className="space-y-6">
            {/* Cabeçalho */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-2xl font-black flex items-center gap-2 text-slate-900 dark:text-white">
                        <Cloud className="h-7 w-7 text-[#F37021]" /> Gestão de Empresas & Clientes Web
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Cadastre empresas através do NIF com busca automática, atribua códigos de ativação e emita credenciais para ligação na versão Web.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={loadTenants} disabled={isLoading} variant="outline" className="gap-2 font-bold shadow-sm">
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-[#F37021]" /> : <RefreshCw className="h-4 w-4" />}
                        Sincronizar Lista
                    </Button>
                </div>
            </div>

            {feedback && (
                <div className={`flex items-start gap-2.5 rounded-2xl border p-4 text-sm font-semibold shadow-sm transition-all ${
                    feedback.type === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
                }`}>
                    {feedback.type === 'success' ? <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}
                    <span>{feedback.message}</span>
                </div>
            )}

            {/* Painel de Credenciais Emitidas (Destaque após criação ou regeneração) */}
            {issuedCredentials && (
                <div className="rounded-3xl border-2 border-[#F37021] bg-orange-50/70 p-6 shadow-xl dark:border-orange-600 dark:bg-orange-950/30">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-orange-200 dark:border-orange-800 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-[#F37021] text-white p-3 rounded-2xl shadow-md">
                                <Sparkles className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                    Credenciais Oficiais Emitidas com Sucesso
                                </h3>
                                <p className="text-xs text-slate-600 dark:text-slate-300">
                                    Entregue estas credenciais ao cliente para que ele possa validar e configurar a empresa na versão Web.
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                onClick={() => handleCopyWhatsApp(issuedCredentials)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shadow-sm"
                            >
                                {copiedWhatsApp ? <Check className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                                {copiedWhatsApp ? 'Mensagem Copiada!' : 'Copiar para WhatsApp'}
                            </Button>
                            <Button
                                onClick={() => handleDownloadPDF(issuedCredentials)}
                                className="bg-[#2B2D2F] hover:bg-slate-800 text-white font-bold gap-2 shadow-sm"
                            >
                                <FileDown className="h-4 w-4 text-[#F37021]" />
                                Baixar Ficha PDF
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => setIssuedCredentials(null)}
                                className="text-slate-600"
                            >
                                Fechar
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-orange-100 dark:border-orange-900 shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Empresa / Razão Social</p>
                            <p className="text-base font-black text-slate-900 dark:text-white mt-1 truncate" title={issuedCredentials.name}>
                                {issuedCredentials.name}
                            </p>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-orange-100 dark:border-orange-900 shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">NIF da Empresa</p>
                            <p className="text-base font-mono font-black text-slate-900 dark:text-white mt-1">
                                {issuedCredentials.nif}
                            </p>
                        </div>

                        <div className="bg-amber-100/60 dark:bg-amber-950/60 p-4 rounded-2xl border-2 border-amber-300 dark:border-amber-700 shadow-sm">
                            <p className="text-xs font-black text-amber-800 dark:text-amber-300 uppercase tracking-wider">Código de Acesso Web</p>
                            <p className="text-xl font-mono font-black text-[#F37021] mt-1 tracking-wider">
                                {issuedCredentials.accessCode}
                            </p>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-orange-100 dark:border-orange-900 shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Link de Acesso Web</p>
                            <a
                                href={issuedCredentials.webUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-bold text-blue-600 hover:underline mt-1 truncate block"
                            >
                                {issuedCredentials.webUrl}
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* Configuração da Ligação Central */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 text-sm">
                        <Link2 className="h-4 w-4 text-[#F37021]" /> Conexão Central Tango Master Gen ⇄ Servidor Web (Vercel)
                    </h3>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-500">URL do Servidor Web (Vercel)</Label>
                        <Input
                            value={serverUrl}
                            onChange={(e) => setServerUrl(e.target.value)}
                            placeholder="https://tango-gestao-creditos.vercel.app"
                            className="h-11 rounded-xl"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-500">Chave Mestra do Tango Master</Label>
                        <div className="relative">
                            <Input
                                type={showSecret ? 'text' : 'password'}
                                value={masterSecret}
                                onChange={(e) => setMasterSecret(e.target.value)}
                                placeholder="Chave mestra configurada na Vercel (TANGO_MASTER_SECRET)"
                                className="h-11 pr-11 rounded-xl"
                            />
                            <button
                                type="button"
                                onClick={() => setShowSecret(v => !v)}
                                tabIndex={-1}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Formulário de Cadastro da Empresa com Busca de NIF */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                            <Plus className="h-5 w-5 text-[#F37021]" /> Registar Empresa & Emitir Credencial de Acesso
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Introduza o NIF da empresa, consulte a identificação oficial e atribua o código de forma automática.
                        </p>
                    </div>
                    {/* Seletor Singular / Coletivo */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                        <button
                            type="button"
                            onClick={() => { setNifType('COLECTIVO'); setNewNif(''); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                nifType === 'COLECTIVO' ? 'bg-white dark:bg-slate-700 text-[#F37021] shadow-sm' : 'text-slate-500'
                            }`}
                        >
                            Pessoa Coletiva (Empresa)
                        </button>
                        <button
                            type="button"
                            onClick={() => { setNifType('SINGULAR'); setNewNif(''); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                nifType === 'SINGULAR' ? 'bg-white dark:bg-slate-700 text-[#F37021] shadow-sm' : 'text-slate-500'
                            }`}
                        >
                            Pessoa Singular (BI/NIF)
                        </button>
                    </div>
                </div>

                <div className="grid gap-5 md:grid-cols-12">
                    {/* Campo 1: NIF da Empresa com Botão de Busca */}
                    <div className="md:col-span-5 space-y-1.5">
                        <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                            NIF da Empresa {nifType === 'COLECTIVO' ? '(10 Dígitos)' : '(14 Caracteres)'} *
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                value={newNif}
                                onChange={handleNifChange}
                                placeholder={nifType === 'COLECTIVO' ? 'Ex.: 5417000000' : 'Ex.: 000000000LA000'}
                                className="h-11 rounded-xl font-mono text-base font-bold uppercase tracking-wider"
                            />
                            <Button
                                type="button"
                                onClick={handleSearchNIF}
                                disabled={isSearchingNIF || newNif.length < 9}
                                className="h-11 px-4 bg-[#2B2D2F] hover:bg-slate-800 text-white font-bold rounded-xl gap-2 shadow-sm"
                            >
                                {isSearchingNIF ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-[#F37021]" />
                                ) : (
                                    <Search className="h-4 w-4 text-[#F37021]" />
                                )}
                                Consultar
                            </Button>
                        </div>
                        {nifFoundSource && (
                            <p className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 mt-1">
                                <CheckCircle className="h-3.5 w-3.5" /> Validado oficialmente via {nifFoundSource}
                            </p>
                        )}
                    </div>

                    {/* Campo 2: Nome da Empresa / Razão Social */}
                    <div className="md:col-span-7 space-y-1.5">
                        <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                            Nome da Empresa / Razão Social Oficial *
                        </Label>
                        <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Preenchido automaticamente após consulta ou digite o nome"
                            className="h-11 rounded-xl font-semibold"
                        />
                    </div>

                    {/* Campo 3: Código de Acesso Automático */}
                    <div className="md:col-span-5 space-y-1.5">
                        <div className="flex justify-between items-center">
                            <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                Código de Acesso Web (Automático) *
                            </Label>
                            <button
                                type="button"
                                onClick={() => setAccessCode(generateFriendlyCode())}
                                className="text-[11px] font-bold text-[#F37021] hover:underline flex items-center gap-1"
                            >
                                <RefreshCw className="h-3 w-3" /> Gerar Outro
                            </button>
                        </div>
                        <Input
                            value={accessCode}
                            onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                            className="h-11 rounded-xl font-mono text-base font-black text-[#F37021] tracking-wider uppercase bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900"
                        />
                        <p className="text-[11px] text-slate-400">
                            Este é o código que o cliente deverá digitar ao abrir o link da Web.
                        </p>
                    </div>

                    {/* Campo 4: Validade da Licença */}
                    <div className="md:col-span-7 space-y-1.5">
                        <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                            Validade do Acesso
                        </Label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { key: '1m', label: '1 Mês' },
                                { key: '3m', label: '3 Meses' },
                                { key: '6m', label: '6 Meses' },
                                { key: '1y', label: '1 Ano (Padrão)' },
                                { key: 'lifetime', label: 'Sem Expiração' }
                            ].map((opt) => (
                                <button
                                    key={opt.key}
                                    type="button"
                                    onClick={() => setExpiryOption(opt.key as any)}
                                    className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                                        expiryOption === opt.key
                                            ? 'bg-[#F37021] text-white border-[#F37021] shadow-sm'
                                            : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-orange-300'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <Button
                        onClick={handleCreate}
                        disabled={isCreating || !newName.trim() || !newNif.trim()}
                        className="w-full sm:w-auto h-12 px-8 bg-[#F37021] hover:bg-orange-600 text-white font-black text-sm rounded-xl gap-2 shadow-lg shadow-orange-500/20"
                    >
                        {isCreating ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                        Cadastrar Empresa e Emitir Credenciais
                    </Button>
                    <p className="text-xs text-slate-500">
                        O registo é homologado na cloud e guardado na base de dados do Tango Master.
                    </p>
                </div>
            </div>

            {/* Lista de Empresas Cadastradas */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                    <div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-[#F37021]" /> Empresas Cadastradas no Tango Master ({tenants.length})
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Clientes autorizados a conectar-se através do link web.
                        </p>
                    </div>
                </div>

                {tenants.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                        <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            Nenhuma empresa cadastrada no momento.
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                            Cadastre a primeira empresa no formulário acima para emitir as credenciais de acesso.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {tenants.map((tenant) => (
                            <div
                                key={tenant.tenantId}
                                className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 transition-all hover:border-orange-200 dark:border-slate-800 dark:hover:border-slate-700 lg:flex-row lg:items-center lg:justify-between"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        <p className="font-black text-slate-900 dark:text-white text-base">
                                            {tenant.name}
                                        </p>
                                        <span
                                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                                                tenant.status === 'active'
                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                                    : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                            }`}
                                        >
                                            {tenant.status === 'active' ? 'Ativa' : 'Bloqueada'}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                                        <span>
                                            NIF: <strong className="font-mono text-slate-800 dark:text-slate-200">{tenant.tenantId}</strong>
                                        </span>
                                        <span>
                                            Código: <strong className="font-mono text-[#F37021] bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded border border-orange-200 dark:border-orange-900">{tenant.accessCode || 'TG-SINC-PADRAO'}</strong>
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <CalendarClock className="h-3.5 w-3.5 text-slate-400" /> Expira: {formatDate(tenant.expiresAt)}
                                        </span>
                                        <span>
                                            Última Sincronização: {formatDate(tenant.lastSyncAt)}
                                        </span>
                                        {tenant.operations !== undefined && (
                                            <span>{tenant.operations} operações registradas</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleCopyWhatsApp({
                                            name: tenant.name,
                                            nif: tenant.tenantId,
                                            accessCode: tenant.accessCode || 'TG-SINC-PADRAO',
                                            webUrl: serverUrl,
                                            expiresAt: tenant.expiresAt
                                        })}
                                        className="h-9 gap-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
                                        title="Copiar mensagem para WhatsApp"
                                    >
                                        <MessageSquare className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp
                                    </Button>

                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleDownloadPDF({
                                            name: tenant.name,
                                            nif: tenant.tenantId,
                                            accessCode: tenant.accessCode || 'TG-SINC-PADRAO',
                                            webUrl: serverUrl,
                                            expiresAt: tenant.expiresAt
                                        })}
                                        className="h-9 gap-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:text-slate-200"
                                        title="Baixar Ficha de Credenciais em PDF"
                                    >
                                        <FileDown className="h-3.5 w-3.5 text-[#F37021]" /> Ficha PDF
                                    </Button>

                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busyTenant === tenant.tenantId}
                                        onClick={() => handleRotate(tenant)}
                                        className="h-9 gap-1.5 text-xs font-bold text-slate-700"
                                        title="Gerar Novo Código de Acesso"
                                    >
                                        <RefreshCw className="h-3.5 w-3.5 text-blue-600" /> Novo Código
                                    </Button>

                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busyTenant === tenant.tenantId}
                                        onClick={() => handleToggleStatus(tenant)}
                                        className="h-9 gap-1.5 text-xs font-bold"
                                    >
                                        {tenant.status === 'active' ? (
                                            <>
                                                <ShieldOff className="h-3.5 w-3.5 text-amber-600" /> Bloquear
                                            </>
                                        ) : (
                                            <>
                                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Ativar
                                            </>
                                        )}
                                    </Button>

                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busyTenant === tenant.tenantId}
                                        onClick={() => handleDelete(tenant)}
                                        className="h-9 gap-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Guia Explicativo do Ecossistema */}
            <div className="rounded-3xl border border-orange-200 bg-orange-50/60 p-5 text-xs font-semibold leading-relaxed text-slate-700 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-slate-300">
                <p className="font-black uppercase tracking-wider text-[#F37021] flex items-center gap-1.5">
                    <Shield className="h-4 w-4" /> Fluxo de Acesso: Tango Master Gen ⇄ Versão Web
                </p>
                <ol className="mt-2.5 list-decimal space-y-1 pl-4">
                    <li><strong>Registo no Master:</strong> O administrador cadastra a empresa aqui informando o NIF, consulta o nome oficial e atribui o Código de Acesso automático.</li>
                    <li><strong>Entrega de Credenciais:</strong> O administrador envia ao cliente o link da web, o NIF e o Código de Acesso gerado (via WhatsApp ou Ficha PDF).</li>
                    <li><strong>Validação Obrigatória na Web:</strong> Ao abrir o link, a aplicação web solicita o NIF e o Código de Acesso. Se a empresa não estiver cadastrada no Tango Master, o acesso ao Onboarding e ao sistema é bloqueado.</li>
                    <li><strong>Comunicação em Tempo Real:</strong> Uma vez validada, a aplicação web comunica com o ecossistema Tango Master, sincronizando movimentações financeiras, relatórios e auditoria.</li>
                </ol>
            </div>
        </div>
    );
}
