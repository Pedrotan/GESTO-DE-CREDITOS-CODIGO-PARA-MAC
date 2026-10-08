import { useState, useEffect } from 'react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { useData } from '@/contextos/ContextoDados';
import { isPublicWebBuild } from '@/bibliotecas/ambiente';
import { scopedStorageKey } from '@/bibliotecas/contas';
import { CLOUD_SYNC_BOOTSTRAP_KEY, startCloudSync, stopCloudSync, syncCloudNow } from '@/servicos/ServicoSincronizacaoCloud';
import { checkCompanyStatus, markCompanyActive, isCompanyActiveLocally } from '@/servicos/ServicoIdentidadeEmpresa';
import {
    Building2, KeyRound, Loader2, ShieldCheck, Eye, EyeOff, ArrowLeft, ArrowRight, ShieldAlert,
    Shield, LogIn, ClipboardList, CheckCircle2, Cloud, BarChart3, Wallet, Users, Send,
    Sparkles, Lock, Info, CheckCircle
} from 'lucide-react';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

// Entrada obrigatória da versão Web (Vercel). Num navegador ainda não ligado, a pessoa vê uma
// página inicial e escolhe entre iniciar sessão ou pedir o cadastro da empresa. Ao iniciar sessão
// o NIF é verificado no Tango Master: empresa registada segue para o Código de Acesso e depois
// para o login; empresa não registada segue para a ativação (pedido de cadastro).

type Step = 'welcome' | 'identify' | 'access' | 'activation' | 'request' | 'requestSent';
type NifType = 'COLECTIVO' | 'SINGULAR';

const formatNIF = (value: string, type: NifType) => {
    const clean = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (type === 'COLECTIVO') return clean.slice(0, 10).replace(/[^0-9]/g, '');
    let formatted = '';
    for (let i = 0; i < clean.length && i < 14; i++) {
        const char = clean[i];
        if (i < 9) { if (/[0-9]/.test(char)) formatted += char; }
        else if (i < 11) { if (/[A-Z]/.test(char)) formatted += char; }
        else if (/[0-9]/.test(char)) formatted += char;
    }
    return formatted;
};

const postJson = async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000)
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.success !== false, status: res.status, data };
};

const networkMessage = (err: any) => err?.name === 'TimeoutError'
    ? 'O servidor demorou muito a responder. Verifique a sua ligação à internet.'
    : 'Não foi possível comunicar com o servidor central. Verifique a sua ligação à internet.';

const FEATURES = [
    {
        icon: Wallet,
        title: 'Créditos e Cobranças',
        text: 'Simulação ágil, emissão de contratos, plano de prestações e amortizações automatizadas.'
    },
    {
        icon: BarChart3,
        title: 'Relatórios e Contabilidade',
        text: 'Extratos, balancetes em tempo real, fluxo de caixa e lançamentos automáticos de dupla entrada.'
    },
    {
        icon: Users,
        title: 'Clientes e Equipas',
        text: 'Ficha central de clientes com histórico de crédito, controlo de utilizadores e perfis de acesso.'
    },
    {
        icon: Cloud,
        title: 'Acesso em Qualquer Lugar',
        text: 'Sincronização contínua na nuvem com criptografia de ponta a ponta e redundância garantida.'
    }
];

export const LigacaoEmpresaWeb = () => {
    const { updateCompanySettings } = useData();

    const [isAuthorized, setIsAuthorized] = useState(() => localStorage.getItem('tango_active_tenant_authorized') === 'true');

    useEffect(() => {
        const checkAuth = () => setIsAuthorized(localStorage.getItem('tango_active_tenant_authorized') === 'true');
        window.addEventListener('tango_tenant_authorized', checkAuth);
        window.addEventListener('storage', checkAuth);
        return () => {
            window.removeEventListener('tango_tenant_authorized', checkAuth);
            window.removeEventListener('storage', checkAuth);
        };
    }, []);

    const [step, setStep] = useState<Step>('welcome');
    const [logoError, setLogoError] = useState(false);
    const [nifType, setNifType] = useState<NifType>('COLECTIVO');
    const [nif, setNif] = useState(() => localStorage.getItem('tango_active_tenant_id') || '');
    const [companyName, setCompanyName] = useState('');
    const [accessCode, setAccessCode] = useState('');
    const [showCode, setShowCode] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [request, setRequest] = useState({ companyName: '', contactName: '', phone: '', email: '', message: '' });

    const cleanNif = nif.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    const goTo = (next: Step) => { setErrorMessage(''); setStep(next); };

    // Passo 1 do login: verificar se a empresa está registada no Tango Master Gen.
    const handleIdentify = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanInput = nif.trim();
        if (cleanInput.length < 3) {
            setErrorMessage('Introduza o identificador da empresa (NIF, E-mail ou Código Único).');
            return;
        }
        setIsBusy(true);
        setErrorMessage('');
        try {
            const res = await checkCompanyStatus(cleanInput);
            if (res.status === 'ACTIVE') {
                const companyData = res.company || {
                    id: cleanInput,
                    tenantId: cleanInput,
                    name: res.companyName || 'Empresa Registada',
                    logo: null
                };

                // Gravar dados básicos não-sensíveis no SQLite e inicializar ambiente multi-tenant
                await markCompanyActive(companyData);
                await updateCompanySettings({
                    nif: companyData.tenantId,
                    name: companyData.name,
                    logo: companyData.logo || null,
                    syncEnabled: true,
                    syncUrl: window.location.origin
                });

                setIsAuthorized(true);

                await Swal.fire({
                    title: 'Empresa Ativa Verificada!',
                    html: `A empresa <strong>${companyData.name.replace(/[<>&"]/g, '')}</strong> está ativa no Tango Master Gen.<br/><br/><span style="color:#64748b;font-size:13px;">O Onboarding foi bloqueado. Redirecionando para o Login...</span>`,
                    icon: 'success',
                    confirmButtonText: 'Continuar para o Login',
                    confirmButtonColor: '#2563eb',
                    timer: 2500,
                    allowOutsideClick: false
                });

                window.location.hash = '#/entrar';
                window.location.reload();
            } else if (res.status === 'PENDING') {
                localStorage.setItem('tango_company_status', 'PENDING');
                setIsAuthorized(true);
                await Swal.fire({
                    title: 'Registo Pendente',
                    text: 'O registo da empresa está pendente de aprovação central. Acesso ao assistente de configuração libertado.',
                    icon: 'info',
                    confirmButtonText: 'Aceder ao Onboarding',
                    confirmButtonColor: '#2563eb'
                });
                window.location.hash = '#/onboarding';
            } else if (res.status === 'NOT_FOUND') {
                localStorage.setItem('tango_company_status', 'NOT_FOUND');
                setIsAuthorized(true);
                await Swal.fire({
                    title: 'Empresa Não Encontrada',
                    text: 'Empresa não encontrada no registo central. O acesso ao fluxo de onboarding foi libertado para concluir o registo.',
                    icon: 'question',
                    confirmButtonText: 'Iniciar Registo',
                    confirmButtonColor: '#2563eb'
                });
                window.location.hash = '#/onboarding';
            } else if (res.status === 'BLOCKED') {
                setErrorMessage('O acesso desta empresa está suspenso no Tango Master Gen. Contacte o suporte (+244 941 537 486).');
            } else if (res.status === 'EXPIRED') {
                setErrorMessage('A subscrição desta empresa expirou. Solicite a renovação no Tango Master Gen.');
            } else {
                setErrorMessage(res.message || 'Não foi possível verificar a empresa no servidor central.');
            }
        } catch (err: any) {
            setErrorMessage(err?.message || networkMessage(err));
        } finally {
            setIsBusy(false);
        }
    };

    // Passo 2 do login: ligar este navegador à empresa com o Código de Acesso e seguir para o login.
    const handleAccess = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanCode = accessCode.trim().toUpperCase();
        if (cleanCode.length < 4) { setErrorMessage('Introduza o Código de Acesso da empresa.'); return; }
        setIsBusy(true);
        setErrorMessage('');
        try {
            const { ok, data } = await postJson('/api/verify-company', { nif: cleanNif, accessCode: cleanCode });
            if (!ok) {
                if (data.code === 'NOT_REGISTERED') { goTo('activation'); return; }
                setErrorMessage(data.message || 'Código de Acesso inválido para esta empresa.');
                return;
            }

            const verifiedTenantId = data.tenantId || cleanNif;
            const verifiedName = data.companyName || companyName || 'Empresa Licenciada';
            const verifiedPasskey = data.syncPasskey || cleanCode;

            localStorage.setItem('tango_active_tenant_authorized', 'true');
            localStorage.setItem('tango_active_tenant_id', verifiedTenantId);
            localStorage.setItem('tango_active_tenant_name', verifiedName);
            localStorage.setItem('tango_active_tenant_code', cleanCode);
            localStorage.setItem(scopedStorageKey(CLOUD_SYNC_BOOTSTRAP_KEY), 'true');

            await updateCompanySettings({
                nif: verifiedTenantId,
                name: verifiedName,
                syncEnabled: true,
                syncUrl: window.location.origin,
                syncPasskey: verifiedPasskey
            });

            let pulled = 0;
            try {
                startCloudSync({ url: window.location.origin, apiKey: verifiedPasskey, tenantId: verifiedTenantId });
                pulled = (await syncCloudNow()).pulled || 0;
            } catch (syncErr) {
                console.warn('[LigacaoEmpresaWeb] Sincronização inicial:', syncErr);
            } finally {
                stopCloudSync();
            }

            setIsAuthorized(true);
            window.dispatchEvent(new Event('tango_tenant_authorized'));
            await Swal.fire({
                title: 'Empresa ligada',
                html: `Este navegador está ligado a <strong>${verifiedName.replace(/[<>&"]/g, '')}</strong>.<br/><br/>` +
                    `<span style="color:#64748b;font-size:13px;">${pulled > 0
                        ? `Foram recuperadas ${pulled} alterações da cloud.`
                        : 'Continue para iniciar sessão.'}</span>`,
                icon: 'success',
                confirmButtonText: 'Continuar',
                confirmButtonColor: '#F37021',
                allowOutsideClick: false
            });
            window.location.hash = '#/entrar';
            window.location.reload();
        } catch (err) {
            setErrorMessage(networkMessage(err));
        } finally {
            setIsBusy(false);
        }
    };

    const handleRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsBusy(true);
        setErrorMessage('');
        try {
            const { ok, data } = await postJson('/api/registration-request', { nif: cleanNif, ...request });
            if (!ok) {
                if (data.code === 'ALREADY_REGISTERED') { goTo('access'); return; }
                setErrorMessage(data.message || 'Não foi possível enviar o pedido.');
                return;
            }
            goTo('requestSent');
        } catch (err) {
            setErrorMessage(networkMessage(err));
        } finally {
            setIsBusy(false);
        }
    };

    const isCompanyActive = isCompanyActiveLocally();
    if (isCompanyActive || isAuthorized) return null;
    if (typeof window !== 'undefined' && (
        window.location.hash.includes('tango-master') ||
        window.location.hash.includes('reset-password') ||
        (window.location.hash.includes('onboarding') && (localStorage.getItem('tango_company_status') === 'NOT_FOUND' || localStorage.getItem('tango_company_status') === 'PENDING'))
    )) return null;

    const errorBox = errorMessage && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-semibold text-red-300 backdrop-blur-md animate-in fade-in duration-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <p className="leading-relaxed">{errorMessage}</p>
        </div>
    );

    const backButton = (target: Step, label = 'Voltar') => (
        <button
            type="button"
            onClick={() => goTo(target)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
            <ArrowLeft className="h-3.5 w-3.5" /> {label}
        </button>
    );

    const nifField = (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Tipo de contribuinte
                </Label>
                <div className="flex gap-1 rounded-xl bg-slate-950/70 p-1 border border-white/10">
                    {(['COLECTIVO', 'SINGULAR'] as const).map(type => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => { setNifType(type); setNif(''); }}
                            className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                                nifType === type
                                    ? 'bg-[#F37021] text-white shadow-md shadow-orange-500/30'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            {type === 'COLECTIVO' ? 'Empresa (NIF)' : 'Particular (BI)'}
                        </button>
                    ))}
                </div>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="gateway-nif" className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                    <Building2 className="h-3.5 w-3.5 text-[#F37021]" />
                    Identificador da Empresa (NIF, E-mail ou Código Único)
                </Label>
                <div className="relative">
                    <Input
                        id="gateway-nif"
                        value={nif}
                        onChange={e => {
                            const val = e.target.value;
                            if (val.includes('@') || val.toUpperCase().startsWith('TG-')) {
                                setNif(val);
                            } else {
                                setNif(formatNIF(val, nifType));
                            }
                            setErrorMessage('');
                        }}
                        placeholder="Ex.: 5417000000, empresa@tango.ao ou TG-XXXX-YYYY"
                        className="h-12 rounded-xl bg-slate-950/70 border-white/15 px-4 font-mono text-base font-bold text-white placeholder:text-slate-600 focus-visible:ring-[#F37021] focus-visible:border-[#F37021]"
                        disabled={isBusy}
                        autoFocus
                        required
                    />
                </div>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[9999] flex flex-col justify-between overflow-y-auto bg-[#060813] text-slate-100 font-sans selection:bg-[#F37021]/30 selection:text-white">
            {/* Ambient Lighting & Backdrop Elements */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                {/* Tech Dot Grid Pattern */}
                <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:28px_28px] opacity-60" />
                {/* Luminous Orange Orb */}
                <div className="absolute -left-32 -top-32 h-[550px] w-[550px] rounded-full bg-gradient-to-br from-[#F37021]/20 via-[#F37021]/5 to-transparent blur-[140px]" />
                {/* Luminous Deep Blue Orb */}
                <div className="absolute -bottom-32 -right-32 h-[650px] w-[650px] rounded-full bg-gradient-to-tl from-blue-600/20 via-indigo-600/5 to-transparent blur-[150px]" />
                {/* Subtle Amber Horizon */}
                <div className="absolute left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2 h-[350px] w-[600px] rounded-full bg-amber-500/[0.04] blur-[130px]" />
            </div>

            {/* Top Navigation Header */}
            <header className="relative z-10 w-full border-b border-white/[0.08] bg-slate-950/40 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
                    {/* Brand */}
                    <div className="flex items-center gap-3">
                        <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-[#F37021] shadow-lg shadow-orange-500/25 ring-1 ring-white/20 overflow-hidden">
                            {!logoError ? (
                                <img
                                    src="logo-app.png"
                                    alt="Logo Tango"
                                    className="h-full w-full object-contain p-1"
                                    onError={() => setLogoError(true)}
                                />
                            ) : (
                                <Building2 className="h-5 w-5 text-white" />
                            )}
                            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 border border-slate-950"></span>
                            </span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-base font-black tracking-tight text-white">Tango</span>
                                <span className="text-base font-normal text-slate-300">Gestão de Créditos</span>
                                <span className="hidden sm:inline-flex items-center rounded-md bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-400 border border-orange-500/30">
                                    Enterprise Cloud
                                </span>
                            </div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                ERP para Instituições de Crédito & Finanças
                            </p>
                        </div>
                    </div>

                    {/* Operational Badges */}
                    <div className="flex items-center gap-3 sm:gap-4">
                        <div className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span>Central Tango Master Conectada</span>
                        </div>
                        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 backdrop-blur-md">
                            <ShieldCheck className="h-3.5 w-3.5 text-orange-400" />
                            <span>Cifragem 256-bit</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Center Content */}
            <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 items-center px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
                <div className="grid w-full items-center gap-10 lg:grid-cols-12 xl:gap-14">
                    
                    {/* Left Column: Brand Showcase & Value Proposition (7 cols) */}
                    <div className="flex flex-col space-y-6 lg:col-span-7 lg:space-y-8">
                        {/* Eyebrow Pill */}
                        <div className="inline-flex items-center gap-2 self-start rounded-full border border-orange-500/30 bg-gradient-to-r from-orange-500/15 via-orange-500/5 to-transparent px-3.5 py-1 text-xs font-bold text-orange-400 backdrop-blur-md shadow-sm">
                            <Sparkles className="h-3.5 w-3.5 text-orange-400" />
                            <span>SISTEMA INSTITUIÇÃO DE CRÉDITO & COBRANÇAS</span>
                        </div>

                        {/* High Impact Headline */}
                        <div className="space-y-4">
                            <h1 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                                A gestão da sua carteira de crédito,{' '}
                                <span className="bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500 bg-clip-text text-transparent">
                                    segura e acessível
                                </span>{' '}
                                em qualquer computador.
                            </h1>
                            <p className="max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
                                O acesso é reservado a empresas cadastradas pelo administrador no Tango Master.
                                Se a sua empresa já tem acesso, inicie sessão. Se ainda não tem, faça o pedido de cadastro.
                            </p>
                        </div>

                        {/* Live Fintech Metrics Strip */}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 backdrop-blur-md transition-all hover:bg-white/[0.06] hover:border-white/20">
                                <div className="text-xl font-black text-white sm:text-2xl">99.98%</div>
                                <div className="text-[11px] font-medium text-slate-400">Disponibilidade Cloud</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 backdrop-blur-md transition-all hover:bg-white/[0.06] hover:border-white/20">
                                <div className="text-xl font-black text-white sm:text-2xl">AES-256</div>
                                <div className="text-[11px] font-medium text-slate-400">Cifra Bancária</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 backdrop-blur-md transition-all hover:bg-white/[0.06] hover:border-white/20">
                                <div className="text-xl font-black text-white sm:text-2xl">Tempo Real</div>
                                <div className="text-[11px] font-medium text-slate-400">Sincronização Contínua</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 backdrop-blur-md transition-all hover:bg-white/[0.06] hover:border-white/20">
                                <div className="text-xl font-black text-white sm:text-2xl">Multi-Posto</div>
                                <div className="text-[11px] font-medium text-slate-400">Acesso Centralizado</div>
                            </div>
                        </div>

                        {/* Feature Cards Grid (2x2) */}
                        <div className="grid gap-3.5 sm:grid-cols-2">
                            {FEATURES.map(({ icon: Icon, title, text }) => (
                                <div
                                    key={title}
                                    className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md transition-all duration-300 hover:border-orange-500/40 hover:bg-white/[0.06] hover:-translate-y-0.5"
                                >
                                    <div className="flex items-start gap-3.5">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 border border-orange-500/20 text-[#F37021] transition-transform duration-300 group-hover:scale-110 group-hover:bg-[#F37021] group-hover:text-white">
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="text-sm font-bold text-white transition-colors group-hover:text-orange-300">
                                                {title}
                                            </h3>
                                            <p className="mt-1 text-xs leading-relaxed text-slate-400">
                                                {text}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Security Banner */}
                        <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-gradient-to-r from-white/[0.04] to-transparent p-3.5 text-xs text-slate-400 backdrop-blur-sm">
                            <Lock className="h-4 w-4 shrink-0 text-orange-400" />
                            <span>
                                Ambiente corporativo com auditoria contínua. As operações respeitam os padrões de integridade e segurança de dados financeiros.
                            </span>
                        </div>
                    </div>

                    {/* Right Column: Interactive Gateway Panel (5 cols) */}
                    <div className="lg:col-span-5">
                        <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-slate-900/85 p-6 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl ring-1 ring-white/10 sm:p-8">
                            {/* Glowing orange top accent line */}
                            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#F37021] to-transparent" />
                            
                            {/* Inner subtle glow */}
                            <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-[#F37021]/10 blur-3xl" />

                            {/* WELCOME VIEW */}
                            {step === 'welcome' && (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    <div className="space-y-2">
                                        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-[11px] font-bold text-orange-400 border border-orange-500/20">
                                            <Building2 className="h-3 w-3" />
                                            <span>Portal de Acesso</span>
                                        </div>
                                        <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                                            Bem-vindo
                                        </h2>
                                        <p className="text-sm text-slate-400 leading-relaxed">
                                            Como pretende continuar com o acesso à sua organização?
                                        </p>
                                    </div>

                                    {/* Action Options */}
                                    <div className="space-y-3.5">
                                        <button
                                            type="button"
                                            onClick={() => goTo('identify')}
                                            className="group relative flex w-full items-center justify-between overflow-hidden rounded-2xl bg-gradient-to-r from-orange-500 via-[#F37021] to-amber-500 p-4 text-left font-black text-white shadow-lg shadow-orange-500/25 transition-all duration-300 hover:scale-[1.01] hover:shadow-orange-500/40 active:scale-[0.99]"
                                        >
                                            <div className="flex items-center gap-3.5">
                                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md transition-transform group-hover:scale-110">
                                                    <LogIn className="h-5 w-5 text-white" />
                                                </div>
                                                <div>
                                                    <p className="text-base font-bold leading-tight">Iniciar sessão</p>
                                                    <p className="text-xs font-normal text-white/80">Aceder com NIF e Código de Acesso</p>
                                                </div>
                                            </div>
                                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition-transform group-hover:translate-x-1">
                                                <ArrowRight className="h-4 w-4 text-white" />
                                            </div>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => goTo('request')}
                                            className="group relative flex w-full items-center justify-between overflow-hidden rounded-2xl border border-white/15 bg-white/[0.04] p-4 text-left font-black text-white backdrop-blur-md transition-all duration-300 hover:border-orange-500/40 hover:bg-white/[0.08] hover:scale-[1.01] active:scale-[0.99]"
                                        >
                                            <div className="flex items-center gap-3.5">
                                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/10 border border-orange-500/20 text-[#F37021] transition-transform group-hover:scale-110">
                                                    <ClipboardList className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <p className="text-base font-bold leading-tight text-white group-hover:text-orange-300 transition-colors">
                                                        Pedir cadastro da empresa
                                                    </p>
                                                    <p className="text-xs font-normal text-slate-400">
                                                        Novo registo ou solicitação de licença
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 transition-transform group-hover:translate-x-1">
                                                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-white" />
                                            </div>
                                        </button>
                                    </div>

                                    {/* Clarifying Reassurance Notice */}
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs leading-relaxed text-slate-400 backdrop-blur-sm">
                                        <div className="flex items-start gap-2.5">
                                            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                                            <p>
                                                Neste navegador ainda não há nenhuma empresa ligada. Depois de validar a empresa uma única vez, os próximos acessos abrirão diretamente a página de utilizador.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* IDENTIFY VIEW (Step 1) */}
                            {step === 'identify' && (
                                <form onSubmit={handleIdentify} className="space-y-6 animate-in fade-in duration-300">
                                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                                        {backButton('welcome')}
                                        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] font-bold text-orange-400 border border-orange-500/20">
                                            Passo 1 de 2 · Identificação
                                        </span>
                                    </div>

                                    <div className="space-y-1">
                                        <h2 className="text-2xl font-black tracking-tight text-white">
                                            Iniciar Sessão
                                        </h2>
                                        <p className="text-xs text-slate-400 leading-relaxed">
                                            Indique o NIF da sua empresa para consultarmos a ativação no Tango Master.
                                        </p>
                                    </div>

                                    {errorBox}
                                    {nifField}

                                    <Button
                                        type="submit"
                                        disabled={isBusy || cleanNif.length < 9}
                                        className="h-12 w-full gap-2 rounded-xl bg-gradient-to-r from-orange-500 via-[#F37021] to-amber-500 text-sm font-black text-white shadow-lg shadow-orange-500/25 hover:from-orange-600 hover:to-amber-600 hover:shadow-orange-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none"
                                    >
                                        {isBusy ? (
                                            <><Loader2 className="h-5 w-5 animate-spin" /> A verificar no Tango Master…</>
                                        ) : (
                                            <>Continuar <ArrowRight className="h-5 w-5" /></>
                                        )}
                                    </Button>
                                </form>
                            )}

                            {/* ACCESS CODE VIEW (Step 2) */}
                            {step === 'access' && (
                                <form onSubmit={handleAccess} className="space-y-6 animate-in fade-in duration-300">
                                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                                        {backButton('identify', 'Alterar NIF')}
                                        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] font-bold text-orange-400 border border-orange-500/20">
                                            Passo 2 de 2 · Código de Acesso
                                        </span>
                                    </div>

                                    <div className="space-y-1">
                                        <h2 className="text-2xl font-black tracking-tight text-white">
                                            {companyName || 'Código de Acesso'}
                                        </h2>
                                        <p className="text-xs text-slate-400 leading-relaxed">
                                            Empresa identificada no Tango Master. Introduza a chave para autorizar este navegador.
                                        </p>
                                    </div>

                                    {errorBox}

                                    {/* Company Identified Pill */}
                                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300 backdrop-blur-md">
                                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                                        <div>
                                            <p className="font-bold text-emerald-200">Empresa Registada</p>
                                            <p className="text-slate-300">
                                                NIF <span className="font-mono font-bold text-white">{cleanNif}</span>
                                            </p>
                                        </div>
                                    </div>

                                    {/* Access Code Input */}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="gateway-code" className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                                            <KeyRound className="h-3.5 w-3.5 text-[#F37021]" />
                                            Código de Acesso da empresa
                                        </Label>
                                        <div className="relative">
                                            <Input
                                                id="gateway-code"
                                                type={showCode ? 'text' : 'password'}
                                                value={accessCode}
                                                onChange={e => { setAccessCode(e.target.value.toUpperCase()); setErrorMessage(''); }}
                                                placeholder="Ex.: TG-8492-3105"
                                                autoComplete="off"
                                                autoFocus
                                                className="h-12 rounded-xl pr-12 font-mono text-base font-bold tracking-wider text-orange-400 bg-slate-950/70 border-white/15 placeholder:text-slate-600 focus-visible:ring-[#F37021] focus-visible:border-[#F37021]"
                                                disabled={isBusy}
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowCode(v => !v)}
                                                tabIndex={-1}
                                                aria-label={showCode ? 'Ocultar código' : 'Mostrar código'}
                                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                                            >
                                                {showCode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                            </button>
                                        </div>
                                        <p className="text-[11px] text-slate-400 leading-relaxed">
                                            Requerido apenas na primeira ligação neste navegador. Nos próximos acessos, entrará diretamente com o utilizador e palavra-passe.
                                        </p>
                                    </div>

                                    <Button
                                        type="submit"
                                        disabled={isBusy || accessCode.trim().length < 4}
                                        className="h-12 w-full gap-2 rounded-xl bg-gradient-to-r from-orange-500 via-[#F37021] to-amber-500 text-sm font-black text-white shadow-lg shadow-orange-500/25 hover:from-orange-600 hover:to-amber-600 hover:shadow-orange-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none"
                                    >
                                        {isBusy ? (
                                            <><Loader2 className="h-5 w-5 animate-spin" /> A validar credenciais…</>
                                        ) : (
                                            <><ShieldCheck className="h-5 w-5" /> Validar e Ligar Empresa</>
                                        )}
                                    </Button>
                                </form>
                            )}

                            {/* ACTIVATION VIEW (Step: Not registered yet) */}
                            {step === 'activation' && (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                                        {backButton('identify')}
                                        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] font-bold text-amber-400 border border-amber-500/20">
                                            Ativação Pendente
                                        </span>
                                    </div>

                                    <div className="space-y-1">
                                        <h2 className="text-2xl font-black tracking-tight text-white">
                                            Empresa Não Encontrada
                                        </h2>
                                        <p className="text-xs text-slate-400 leading-relaxed">
                                            O NIF <strong className="font-mono text-white">{cleanNif}</strong> ainda não está ativo no Tango Master.
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200 backdrop-blur-md">
                                        Para ativar o sistema nesta empresa, envie o pedido de cadastro. Após aprovação pelo administrador, receberá a licença e o Código de Acesso.
                                    </div>

                                    <div className="space-y-3">
                                        <Button
                                            onClick={() => goTo('request')}
                                            className="h-12 w-full gap-2 rounded-xl bg-gradient-to-r from-orange-500 via-[#F37021] to-amber-500 text-sm font-black text-white shadow-lg shadow-orange-500/25 hover:from-orange-600 hover:to-amber-600 hover:shadow-orange-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all"
                                        >
                                            <ClipboardList className="h-5 w-5" /> Pedir cadastro da empresa
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => goTo('access')}
                                            className="h-11 w-full rounded-xl border-white/15 bg-white/5 text-xs font-bold text-slate-200 hover:bg-white/10 hover:text-white"
                                        >
                                            Já recebi o Código de Acesso
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* REQUEST VIEW (Step: Request registration) */}
                            {step === 'request' && (
                                <form onSubmit={handleRequest} className="space-y-5 animate-in fade-in duration-300">
                                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                                        {backButton('welcome')}
                                        <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] font-bold text-orange-400 border border-orange-500/20">
                                            Novo Registo
                                        </span>
                                    </div>

                                    <div className="space-y-1">
                                        <h2 className="text-2xl font-black tracking-tight text-white">
                                            Pedido de Cadastro
                                        </h2>
                                        <p className="text-xs text-slate-400 leading-relaxed">
                                            Submeta os dados da sua instituição para emissão da licença corporativa.
                                        </p>
                                    </div>

                                    {errorBox}
                                    {nifField}

                                    <div className="space-y-1.5">
                                        <Label htmlFor="req-company" className="text-xs font-bold text-slate-300">
                                            Nome da instituição / empresa
                                        </Label>
                                        <Input
                                            id="req-company"
                                            value={request.companyName}
                                            maxLength={200}
                                            required
                                            disabled={isBusy}
                                            placeholder="Ex.: Microcrédito Esperança, Lda"
                                            onChange={e => setRequest(prev => ({ ...prev, companyName: e.target.value }))}
                                            className="h-11 rounded-xl bg-slate-950/70 border-white/15 text-white placeholder:text-slate-600 focus-visible:ring-[#F37021] focus-visible:border-[#F37021]"
                                        />
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="req-contact" className="text-xs font-bold text-slate-300">
                                                Pessoa de contacto
                                            </Label>
                                            <Input
                                                id="req-contact"
                                                value={request.contactName}
                                                maxLength={120}
                                                required
                                                disabled={isBusy}
                                                autoComplete="name"
                                                placeholder="Nome do responsável"
                                                onChange={e => setRequest(prev => ({ ...prev, contactName: e.target.value }))}
                                                className="h-11 rounded-xl bg-slate-950/70 border-white/15 text-white placeholder:text-slate-600 focus-visible:ring-[#F37021] focus-visible:border-[#F37021]"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="req-phone" className="text-xs font-bold text-slate-300">
                                                Telefone / WhatsApp
                                            </Label>
                                            <Input
                                                id="req-phone"
                                                type="tel"
                                                value={request.phone}
                                                maxLength={30}
                                                required
                                                disabled={isBusy}
                                                autoComplete="tel"
                                                placeholder="+244 9XX XXX XXX"
                                                onChange={e => setRequest(prev => ({ ...prev, phone: e.target.value }))}
                                                className="h-11 rounded-xl bg-slate-950/70 border-white/15 text-white placeholder:text-slate-600 focus-visible:ring-[#F37021] focus-visible:border-[#F37021]"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="req-email" className="text-xs font-bold text-slate-300">
                                            Email corporativo (opcional)
                                        </Label>
                                        <Input
                                            id="req-email"
                                            type="email"
                                            value={request.email}
                                            maxLength={160}
                                            disabled={isBusy}
                                            autoComplete="email"
                                            placeholder="contacto@instituicao.co.ao"
                                            onChange={e => setRequest(prev => ({ ...prev, email: e.target.value }))}
                                            className="h-11 rounded-xl bg-slate-950/70 border-white/15 text-white placeholder:text-slate-600 focus-visible:ring-[#F37021] focus-visible:border-[#F37021]"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="req-message" className="text-xs font-bold text-slate-300">
                                            Mensagem ou notas (opcional)
                                        </Label>
                                        <Textarea
                                            id="req-message"
                                            value={request.message}
                                            maxLength={1000}
                                            rows={2}
                                            disabled={isBusy}
                                            placeholder="Indique o número de postos ou detalhes adicionais..."
                                            onChange={e => setRequest(prev => ({ ...prev, message: e.target.value }))}
                                            className="rounded-xl bg-slate-950/70 border-white/15 text-white placeholder:text-slate-600 focus-visible:ring-[#F37021] focus-visible:border-[#F37021]"
                                        />
                                    </div>

                                    <Button
                                        type="submit"
                                        disabled={isBusy || cleanNif.length < 9}
                                        className="h-12 w-full gap-2 rounded-xl bg-gradient-to-r from-orange-500 via-[#F37021] to-amber-500 text-sm font-black text-white shadow-lg shadow-orange-500/25 hover:from-orange-600 hover:to-amber-600 hover:shadow-orange-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none"
                                    >
                                        {isBusy ? (
                                            <><Loader2 className="h-5 w-5 animate-spin" /> A enviar pedido…</>
                                        ) : (
                                            <><Send className="h-5 w-5" /> Enviar Pedido de Cadastro</>
                                        )}
                                    </Button>
                                </form>
                            )}

                            {/* REQUEST SENT VIEW (Success) */}
                            {step === 'requestSent' && (
                                <div className="space-y-6 text-center animate-in fade-in duration-300 py-4">
                                    <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                                        <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                                        <span className="absolute -inset-1 animate-ping rounded-2xl bg-emerald-400/20" />
                                    </div>

                                    <div className="space-y-2">
                                        <h2 className="text-2xl font-black tracking-tight text-white">
                                            Pedido Enviado com Sucesso
                                        </h2>
                                        <p className="text-xs leading-relaxed text-slate-300 max-w-sm mx-auto">
                                            O administrador do Tango Master vai analisar a solicitação da empresa com NIF <strong className="font-mono text-white">{cleanNif}</strong> e entrar em contacto com o Código de Acesso.
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs text-slate-400 text-left space-y-2">
                                        <p className="font-bold text-white flex items-center gap-1.5">
                                            <Info className="h-4 w-4 text-orange-400" /> O que acontece a seguir?
                                        </p>
                                        <p>
                                            Quando receber o seu Código de Acesso por email ou telefone, volte a esta página, clique em <strong>Iniciar sessão</strong> e introduza a chave recebida para ativar o acesso.
                                        </p>
                                    </div>

                                    <Button
                                        onClick={() => goTo('welcome')}
                                        className="h-12 w-full rounded-xl bg-gradient-to-r from-orange-500 via-[#F37021] to-amber-500 font-bold text-white shadow-lg shadow-orange-500/25 hover:from-orange-600 hover:to-amber-600"
                                    >
                                        Voltar ao Início
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Bottom Footer */}
            <footer className="relative z-10 w-full border-t border-white/[0.08] bg-slate-950/60 py-5 text-xs text-slate-400 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
                    <div className="flex flex-col items-center gap-0.5 sm:items-start text-center sm:text-left">
                        <p className="font-semibold text-slate-300">
                            © {new Date().getFullYear()} Tango Gestão de Créditos ERP · Todos os direitos reservados.
                        </p>
                        <p className="text-[11px] text-slate-400">
                            Desenvolvido por <span className="font-semibold text-slate-200">DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, (SU), LDA</span>
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5 text-orange-400" /> Cifragem AES-256
                        </span>
                        <span className="hidden sm:inline">•</span>
                        <span className="flex items-center gap-1.5">
                            <Cloud className="h-3.5 w-3.5 text-blue-400" /> Sincronização Cloud
                        </span>
                        <span className="hidden sm:inline">•</span>
                        <span className="flex items-center gap-1.5">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Auditoria Centralizada
                        </span>
                    </div>
                </div>
            </footer>
        </div>
    );
};
