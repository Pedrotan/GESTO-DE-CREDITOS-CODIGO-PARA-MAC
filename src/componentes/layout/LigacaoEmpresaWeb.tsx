import { useState, useEffect } from 'react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { useData } from '@/contextos/ContextoDados';
import { scopedStorageKey } from '@/bibliotecas/contas';
import { CLOUD_SYNC_BOOTSTRAP_KEY, startCloudSync, stopCloudSync, syncCloudNow } from '@/servicos/ServicoSincronizacaoCloud';
import { checkCompanyStatus, markCompanyActive, isCompanyActiveLocally } from '@/servicos/ServicoIdentidadeEmpresa';
import { getKnownCloudServers } from '@/servicos/ServicoLigacaoNuvem';
import {
    Building2, KeyRound, Loader2, ShieldCheck, Eye, EyeOff, ArrowLeft, ArrowRight, ShieldAlert,
    Shield, LogIn, ClipboardList, CheckCircle2, Cloud, Send, Lock, Info, CheckCircle,
    PhoneCall, X, ExternalLink, Sparkles
} from 'lucide-react';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

type Step = 'welcome' | 'identify' | 'access' | 'activation' | 'request' | 'requestSent';
type NifType = 'COLECTIVO' | 'SINGULAR';
type InfoModal = 'sobre' | 'seguranca' | 'suporte' | null;

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

const postJson = async (path: string, body: Record<string, unknown>) => {
    const servers = getKnownCloudServers();
    let lastResult = { ok: false, status: 0, data: {} as any, serverUrl: '' };

    for (const base of servers) {
        try {
            const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : '/' + path}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(10_000)
            });
            const data = await res.json().catch(() => ({}));
            const isSuccess = res.ok && data.success !== false;
            lastResult = { ok: isSuccess, status: res.status, data, serverUrl: base };
            if (isSuccess) return lastResult;
            if (data.code === 'ALREADY_REGISTERED' || data.code === 'BLOCKED' || data.code === 'EXPIRED') {
                return lastResult;
            }
        } catch {
            // Continua para o próximo servidor na cascata
        }
    }
    return lastResult;
};

const networkMessage = (err: any) => err?.name === 'TimeoutError'
    ? 'O servidor demorou muito a responder. Verifique a sua ligação à internet.'
    : 'Não foi possível comunicar com o servidor central. Verifique a sua ligação à internet.';

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
    const [infoModal, setInfoModal] = useState<InfoModal>(null);
    const [request, setRequest] = useState({ companyName: '', contactName: '', phone: '', email: '', message: '' });

    const cleanNif = nif.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    const goTo = (next: Step) => {
        setErrorMessage('');
        setStep(next);
    };

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

                await markCompanyActive(companyData);
                await updateCompanySettings({
                    nif: companyData.tenantId,
                    name: companyData.name,
                    logo: companyData.logo || null,
                    syncEnabled: true,
                    syncUrl: res.serverUrl || window.location.origin
                });

                setIsAuthorized(true);

                await Swal.fire({
                    title: 'Empresa Ativa Verificada!',
                    html: `A empresa <strong>${companyData.name.replace(/[<>&"]/g, '')}</strong> está ativa no Tango Master Gen.<br/><br/><span style="color:#64748b;font-size:13px;">Acesso autorizado. Redirecionando para o Login...</span>`,
                    icon: 'success',
                    confirmButtonText: 'Continuar para o Login',
                    confirmButtonColor: '#5b1ee2',
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
                    confirmButtonColor: '#5b1ee2'
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
                    confirmButtonColor: '#5b1ee2'
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
        if (cleanCode.length < 4) {
            setErrorMessage('Introduza o Código de Acesso da empresa.');
            return;
        }
        setIsBusy(true);
        setErrorMessage('');
        try {
            const { ok, data, serverUrl } = await postJson('/api/verify-company', { nif: cleanNif, accessCode: cleanCode });
            if (!ok) {
                if (data.code === 'NOT_REGISTERED') {
                    goTo('activation');
                    return;
                }
                setErrorMessage(data.message || 'Código de Acesso inválido para esta empresa.');
                return;
            }

            const verifiedTenantId = data.tenantId || cleanNif;
            const verifiedName = data.companyName || companyName || 'Empresa Licenciada';
            const verifiedPasskey = data.syncPasskey || cleanCode;
            const effectiveSyncUrl = serverUrl || window.location.origin;

            localStorage.setItem('tango_active_tenant_authorized', 'true');
            localStorage.setItem('tango_active_tenant_id', verifiedTenantId);
            localStorage.setItem('tango_active_tenant_name', verifiedName);
            localStorage.setItem('tango_active_tenant_code', cleanCode);
            localStorage.setItem(scopedStorageKey(CLOUD_SYNC_BOOTSTRAP_KEY), 'true');

            await updateCompanySettings({
                nif: verifiedTenantId,
                name: verifiedName,
                syncEnabled: true,
                syncUrl: effectiveSyncUrl,
                syncPasskey: verifiedPasskey
            });

            let pulled = 0;
            try {
                startCloudSync({ url: effectiveSyncUrl, apiKey: verifiedPasskey, tenantId: verifiedTenantId });
                pulled = (await syncCloudNow()).pulled || 0;
            } catch (syncErr) {
                console.warn('[LigacaoEmpresaWeb] Sincronização inicial:', syncErr);
            } finally {
                stopCloudSync();
            }

            setIsAuthorized(true);
            window.dispatchEvent(new Event('tango_tenant_authorized'));
            await Swal.fire({
                title: 'Empresa Ligada!',
                html: `Este computador está agora ligado a <strong>${verifiedName.replace(/[<>&"]/g, '')}</strong>.<br/><br/>` +
                    `<span style="color:#64748b;font-size:13px;">${pulled > 0
                        ? `Foram recuperadas ${pulled} atualizações da cloud.`
                        : 'Pode agora iniciar sessão com as suas credenciais.'}</span>`,
                icon: 'success',
                confirmButtonText: 'Continuar para o Login',
                confirmButtonColor: '#5b1ee2',
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
                if (data.code === 'ALREADY_REGISTERED') {
                    goTo('access');
                    return;
                }
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
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 animate-in fade-in duration-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="leading-relaxed">{errorMessage}</p>
        </div>
    );

    const backButton = (target: Step, label = 'Voltar') => (
        <button
            type="button"
            onClick={() => goTo(target)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#5514d8] transition-colors"
        >
            <ArrowLeft className="h-3.5 w-3.5" /> {label}
        </button>
    );

    const nifField = (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Tipo de contribuinte
                </Label>
                <div className="flex gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200">
                    {(['COLECTIVO', 'SINGULAR'] as const).map(type => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => { setNifType(type); setNif(''); }}
                            className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                                nifType === type
                                    ? 'bg-[#5514d8] text-white shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            {type === 'COLECTIVO' ? 'Empresa (NIF)' : 'Particular (BI)'}
                        </button>
                    ))}
                </div>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="gateway-nif" className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <Building2 className="h-3.5 w-3.5 text-[#5514d8]" />
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
                        placeholder="Ex.: 5417000000 ou empresa@tango.ao"
                        className="h-11 rounded-xl bg-slate-50 border-slate-200 px-3.5 font-mono text-sm font-bold text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#5514d8] focus-visible:border-[#5514d8]"
                        disabled={isBusy}
                        autoFocus
                        required
                    />
                </div>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[9999] flex flex-col justify-between overflow-y-auto bg-white text-slate-900 font-sans selection:bg-[#5514d8]/20 selection:text-[#5514d8]">
            {/* HERO SECTION: Rich Royal Violet Gradient (Matching Image 1) */}
            <div className="relative w-full bg-gradient-to-br from-[#5314d4] via-[#631af0] to-[#450cc7] text-white overflow-hidden pb-12 sm:pb-16 lg:pb-24">
                
                {/* Visual Decorative Accent 1: Dot Matrix Grid (Upper Left - Image 1 Style) */}
                <div className="pointer-events-none absolute top-6 left-6 grid grid-cols-6 gap-2.5 opacity-30 select-none">
                    {Array.from({ length: 30 }).map((_, i) => (
                        <span key={i} className="h-1.5 w-1.5 rounded-full bg-white block" />
                    ))}
                </div>

                {/* Visual Decorative Accent 2: Concentric Circular Rings (Top Right - Image 1 Style) */}
                <div className="pointer-events-none absolute -top-24 right-10 sm:right-28 opacity-15 select-none">
                    <div className="flex h-72 w-72 items-center justify-center rounded-full border border-white">
                        <div className="flex h-52 w-52 items-center justify-center rounded-full border border-white">
                            <div className="h-32 w-32 rounded-full border border-white" />
                        </div>
                    </div>
                </div>

                {/* Visual Decorative Accent 3: Watermark Geometric Accent (Bottom Center) */}
                <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 opacity-10 select-none">
                    <div className="h-44 w-44 rounded-full border border-white/60 flex items-center justify-center">
                        <div className="h-28 w-28 rotate-45 border border-white/60" />
                    </div>
                </div>

                {/* Clean Top Navigation Bar */}
                <header className="relative z-20 w-full px-4 sm:px-8 py-5">
                    <div className="mx-auto flex max-w-7xl items-center justify-between">
                        {/* Brand Logo & Name */}
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-md border border-white/25 shadow-md overflow-hidden">
                                {!logoError ? (
                                    <img
                                        src="logo-app.png"
                                        alt="Tango Logo"
                                        className="h-full w-full object-contain p-1"
                                        onError={() => setLogoError(true)}
                                    />
                                ) : (
                                    <Building2 className="h-5 w-5 text-white" />
                                )}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-lg font-black tracking-tight text-white leading-tight">
                                    Tango ERP
                                </span>
                                <span className="text-[11px] font-medium text-purple-200">
                                    Gestão de Créditos
                                </span>
                            </div>
                        </div>

                        {/* Top Nav Links (Image 1 Style) */}
                        <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-white/90">
                            <button
                                type="button"
                                onClick={() => setInfoModal('sobre')}
                                className="hover:text-white hover:underline underline-offset-4 transition-colors"
                            >
                                Sobre o Sistema
                            </button>
                            <button
                                type="button"
                                onClick={() => setInfoModal('seguranca')}
                                className="hover:text-white hover:underline underline-offset-4 transition-colors"
                            >
                                Segurança & Cifra
                            </button>
                            <button
                                type="button"
                                onClick={() => setInfoModal('suporte')}
                                className="hover:text-white hover:underline underline-offset-4 transition-colors"
                            >
                                Apoio & Contacto
                            </button>
                            <div className="flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 border border-white/20 text-[11px]">
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                                <span>Ambiente Seguro</span>
                            </div>
                        </nav>
                    </div>
                </header>

                {/* Main Hero Container */}
                <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-8 pt-6 sm:pt-10 lg:pt-14">
                    <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
                        
                        {/* Left Column: Human, Elegant Typography & Pill Action Buttons */}
                        <div className="flex flex-col space-y-6 lg:col-span-7">
                            
                            {/* Eyebrow Tag */}
                            <div className="inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-purple-100 border border-white/20 backdrop-blur-md">
                                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                                <span>Instituições Financeiras & Gestão de Crédito</span>
                            </div>

                            {/* Headline (Direct, human, non-generic) */}
                            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-[1.15] tracking-tight">
                                A melhor ferramenta para impulsionar a gestão de crédito do seu negócio.
                            </h1>

                            {/* Subtitle */}
                            <p className="max-w-xl text-sm sm:text-base text-purple-100/90 leading-relaxed font-normal">
                                Plataforma corporativa para simulação ágil de empréstimos, emissão de contratos, cobranças e contabilidade em tempo real. Aceda à sua organização ou solicite o registo oficial da sua empresa.
                            </p>

                            {/* Two Pill Buttons (Exactly as in Image 1!) */}
                            <div className="flex flex-wrap items-center gap-4 pt-2">
                                <button
                                    type="button"
                                    onClick={() => goTo('identify')}
                                    className="rounded-full bg-white text-[#5314d4] font-bold px-7 py-3.5 text-sm shadow-xl shadow-purple-950/20 hover:bg-purple-50 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
                                >
                                    <LogIn className="h-4 w-4 text-[#5314d4]" />
                                    <span>Iniciar Sessão</span>
                                </button>
                                
                                <button
                                    type="button"
                                    onClick={() => goTo('request')}
                                    className="rounded-full border-2 border-white/80 text-white font-semibold px-7 py-3.5 text-sm hover:bg-white/15 hover:border-white hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
                                >
                                    <ClipboardList className="h-4 w-4 text-white" />
                                    <span>Pedir Registo</span>
                                </button>
                            </div>

                            {/* Human Trust Notes (Replacing all generic 4-stat AI cards) */}
                            <div className="pt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-purple-200">
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle className="h-4 w-4 text-emerald-300" />
                                    <span>Cifra Bancária de Ponta a Ponta</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle className="h-4 w-4 text-emerald-300" />
                                    <span>Sincronização Cloud Contínua</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle className="h-4 w-4 text-emerald-300" />
                                    <span>Auditoria e Conformidade</span>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Clean White Interactive Portal Card */}
                        <div className="lg:col-span-5">
                            <div className="relative overflow-hidden rounded-3xl bg-white p-6 sm:p-8 text-slate-800 shadow-2xl shadow-purple-950/40 border border-white/80 transition-all duration-300">
                                
                                {/* Inner Subtle Purple Accent Top Line */}
                                <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#5314d4] via-[#7c3aed] to-[#631af0]" />

                                {/* STEP 1: WELCOME VIEW */}
                                {step === 'welcome' && (
                                    <div className="space-y-6 animate-in fade-in duration-300 pt-1">
                                        <div className="space-y-1.5">
                                            <div className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-[#5314d4] border border-purple-200">
                                                <Building2 className="h-3.5 w-3.5" />
                                                <span>Portal de Acesso</span>
                                            </div>
                                            <h2 className="text-2xl font-black tracking-tight text-slate-900">
                                                Bem-vindo
                                            </h2>
                                            <p className="text-xs text-slate-500 leading-relaxed">
                                                Como pretende continuar com o acesso à sua organização?
                                            </p>
                                        </div>

                                        <div className="space-y-3.5">
                                            {/* Primary Option: Iniciar Sessão */}
                                            <button
                                                type="button"
                                                onClick={() => goTo('identify')}
                                                className="group flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-[#5314d4] to-[#631af0] p-4 text-left font-bold text-white shadow-lg shadow-purple-600/25 transition-all duration-300 hover:scale-[1.01] hover:shadow-purple-600/35 active:scale-[0.99]"
                                            >
                                                <div className="flex items-center gap-3.5">
                                                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md">
                                                        <LogIn className="h-5 w-5 text-white" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold leading-tight">Iniciar Sessão</p>
                                                        <p className="text-xs font-normal text-purple-100">Aceder com NIF e Código de Acesso</p>
                                                    </div>
                                                </div>
                                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform group-hover:translate-x-1">
                                                    <ArrowRight className="h-4 w-4 text-white" />
                                                </div>
                                            </button>

                                            {/* Secondary Option: Pedir Registo */}
                                            <button
                                                type="button"
                                                onClick={() => goTo('request')}
                                                className="group flex w-full items-center justify-between rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-left font-bold text-slate-800 transition-all duration-300 hover:border-[#5314d4] hover:bg-purple-50/50 hover:scale-[1.01] active:scale-[0.99]"
                                            >
                                                <div className="flex items-center gap-3.5">
                                                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100 text-[#5314d4]">
                                                        <ClipboardList className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold leading-tight text-slate-900 group-hover:text-[#5314d4] transition-colors">
                                                            Pedir Registo de Empresa
                                                        </p>
                                                        <p className="text-xs font-normal text-slate-500">
                                                            Nova licença ou adesão corporativa
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 transition-transform group-hover:translate-x-1">
                                                    <ArrowRight className="h-4 w-4 text-slate-600 group-hover:text-[#5314d4]" />
                                                </div>
                                            </button>
                                        </div>

                                        <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-3.5 text-xs text-slate-600 leading-relaxed">
                                            <div className="flex items-start gap-2.5">
                                                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[#5314d4]" />
                                                <p>
                                                    Neste computador ainda não existe uma empresa ligada. A validação é realizada uma única vez; os próximos acessos abrirão diretamente a página de login.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 2: IDENTIFY (NIF) */}
                                {step === 'identify' && (
                                    <form onSubmit={handleIdentify} className="space-y-5 animate-in fade-in duration-300 pt-1">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                            {backButton('welcome')}
                                            <span className="rounded-full bg-purple-50 px-3 py-1 text-[11px] font-bold text-[#5314d4] border border-purple-200">
                                                Passo 1 de 2 · Identificação
                                            </span>
                                        </div>

                                        <div className="space-y-1">
                                            <h2 className="text-2xl font-black tracking-tight text-slate-900">
                                                Identificar Empresa
                                            </h2>
                                            <p className="text-xs text-slate-500 leading-relaxed">
                                                Indique o NIF da organização para consultarmos o registo no servidor central.
                                            </p>
                                        </div>

                                        {errorBox}
                                        {nifField}

                                        <Button
                                            type="submit"
                                            disabled={isBusy || cleanNif.length < 9}
                                            className="h-12 w-full gap-2 rounded-xl bg-gradient-to-r from-[#5314d4] to-[#631af0] text-sm font-bold text-white shadow-lg shadow-purple-600/25 hover:from-[#480ebb] hover:to-[#5514d4] hover:shadow-purple-600/40 transition-all disabled:opacity-50"
                                        >
                                            {isBusy ? (
                                                <><Loader2 className="h-4 w-4 animate-spin" /> A verificar no servidor…</>
                                            ) : (
                                                <>Continuar <ArrowRight className="h-4 w-4" /></>
                                            )}
                                        </Button>
                                    </form>
                                )}

                                {/* STEP 3: ACCESS CODE */}
                                {step === 'access' && (
                                    <form onSubmit={handleAccess} className="space-y-5 animate-in fade-in duration-300 pt-1">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                            {backButton('identify', 'Alterar NIF')}
                                            <span className="rounded-full bg-purple-50 px-3 py-1 text-[11px] font-bold text-[#5314d4] border border-purple-200">
                                                Passo 2 de 2 · Autorização
                                            </span>
                                        </div>

                                        <div className="space-y-1">
                                            <h2 className="text-2xl font-black tracking-tight text-slate-900">
                                                {companyName || 'Código de Acesso'}
                                            </h2>
                                            <p className="text-xs text-slate-500 leading-relaxed">
                                                Empresa identificada. Introduza o Código de Acesso para autorizar este computador.
                                            </p>
                                        </div>

                                        {errorBox}

                                        {/* Company verified pill */}
                                        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                                            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                                            <div>
                                                <p className="font-bold text-emerald-900">Empresa Registada</p>
                                                <p className="text-slate-600">
                                                    NIF <span className="font-mono font-bold text-slate-900">{cleanNif}</span>
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="gateway-code" className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                                <KeyRound className="h-3.5 w-3.5 text-[#5314d4]" />
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
                                                    className="h-11 rounded-xl pr-11 font-mono text-base font-bold tracking-wider text-[#5314d4] bg-slate-50 border-slate-200 placeholder:text-slate-400 focus-visible:ring-[#5314d4] focus-visible:border-[#5314d4]"
                                                    disabled={isBusy}
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowCode(v => !v)}
                                                    tabIndex={-1}
                                                    aria-label={showCode ? 'Ocultar código' : 'Mostrar código'}
                                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                                                >
                                                    {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                            </div>
                                            <p className="text-[11px] text-slate-500 leading-relaxed">
                                                Necessário apenas no primeiro acesso neste computador.
                                            </p>
                                        </div>

                                        <Button
                                            type="submit"
                                            disabled={isBusy || accessCode.trim().length < 4}
                                            className="h-12 w-full gap-2 rounded-xl bg-gradient-to-r from-[#5314d4] to-[#631af0] text-sm font-bold text-white shadow-lg shadow-purple-600/25 hover:from-[#480ebb] hover:to-[#5514d4] hover:shadow-purple-600/40 transition-all disabled:opacity-50"
                                        >
                                            {isBusy ? (
                                                <><Loader2 className="h-4 w-4 animate-spin" /> A validar credenciais…</>
                                            ) : (
                                                <><ShieldCheck className="h-4 w-4" /> Validar e Ligar Empresa</>
                                            )}
                                        </Button>
                                    </form>
                                )}

                                {/* STEP 4: ACTIVATION PENDING */}
                                {step === 'activation' && (
                                    <div className="space-y-5 animate-in fade-in duration-300 pt-1">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                            {backButton('identify')}
                                            <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 border border-amber-200">
                                                Ativação Pendente
                                            </span>
                                        </div>

                                        <div className="space-y-1">
                                            <h2 className="text-2xl font-black tracking-tight text-slate-900">
                                                Empresa Não Encontrada
                                            </h2>
                                            <p className="text-xs text-slate-500 leading-relaxed">
                                                O NIF <strong className="font-mono text-slate-900">{cleanNif}</strong> ainda não está registado no servidor central.
                                            </p>
                                        </div>

                                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800 leading-relaxed">
                                            Para ativar o sistema nesta empresa, envie o pedido de cadastro. Após aprovação, receberá a licença e o Código de Acesso.
                                        </div>

                                        <div className="space-y-2.5">
                                            <Button
                                                onClick={() => goTo('request')}
                                                className="h-12 w-full gap-2 rounded-xl bg-gradient-to-r from-[#5314d4] to-[#631af0] text-sm font-bold text-white shadow-lg shadow-purple-600/25 hover:from-[#480ebb] hover:to-[#5514d4]"
                                            >
                                                <ClipboardList className="h-4 w-4" /> Pedir Registo da Empresa
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => goTo('access')}
                                                className="h-11 w-full rounded-xl border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100"
                                            >
                                                Já tenho o Código de Acesso
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 5: REGISTRATION REQUEST */}
                                {step === 'request' && (
                                    <form onSubmit={handleRequest} className="space-y-4 animate-in fade-in duration-300 pt-1">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                            {backButton('welcome')}
                                            <span className="rounded-full bg-purple-50 px-3 py-1 text-[11px] font-bold text-[#5314d4] border border-purple-200">
                                                Novo Registo
                                            </span>
                                        </div>

                                        <div className="space-y-1">
                                            <h2 className="text-xl font-black tracking-tight text-slate-900">
                                                Pedido de Cadastro
                                            </h2>
                                            <p className="text-xs text-slate-500 leading-relaxed">
                                                Submeta os dados da sua instituição para emissão da licença empresarial.
                                            </p>
                                        </div>

                                        {errorBox}
                                        {nifField}

                                        <div className="space-y-1">
                                            <Label htmlFor="req-company" className="text-xs font-bold text-slate-700">
                                                Nome da Instituição / Empresa
                                            </Label>
                                            <Input
                                                id="req-company"
                                                value={request.companyName}
                                                maxLength={200}
                                                required
                                                disabled={isBusy}
                                                placeholder="Ex.: Microcrédito Esperança, Lda"
                                                onChange={e => setRequest(prev => ({ ...prev, companyName: e.target.value }))}
                                                className="h-10 rounded-xl bg-slate-50 border-slate-200 text-slate-900 text-sm focus-visible:ring-[#5314d4]"
                                            />
                                        </div>

                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div className="space-y-1">
                                                <Label htmlFor="req-contact" className="text-xs font-bold text-slate-700">
                                                    Pessoa de Contacto
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
                                                    className="h-10 rounded-xl bg-slate-50 border-slate-200 text-slate-900 text-sm focus-visible:ring-[#5314d4]"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label htmlFor="req-phone" className="text-xs font-bold text-slate-700">
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
                                                    className="h-10 rounded-xl bg-slate-50 border-slate-200 text-slate-900 text-sm focus-visible:ring-[#5314d4]"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <Label htmlFor="req-email" className="text-xs font-bold text-slate-700">
                                                Email Corporativo (opcional)
                                            </Label>
                                            <Input
                                                id="req-email"
                                                type="email"
                                                value={request.email}
                                                maxLength={160}
                                                disabled={isBusy}
                                                autoComplete="email"
                                                placeholder="contacto@instituicao.ao"
                                                onChange={e => setRequest(prev => ({ ...prev, email: e.target.value }))}
                                                className="h-10 rounded-xl bg-slate-50 border-slate-200 text-slate-900 text-sm focus-visible:ring-[#5314d4]"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <Label htmlFor="req-message" className="text-xs font-bold text-slate-700">
                                                Notas Adicionais (opcional)
                                            </Label>
                                            <Textarea
                                                id="req-message"
                                                value={request.message}
                                                maxLength={1000}
                                                rows={2}
                                                disabled={isBusy}
                                                placeholder="Número de postos ou detalhes pretendidos..."
                                                onChange={e => setRequest(prev => ({ ...prev, message: e.target.value }))}
                                                className="rounded-xl bg-slate-50 border-slate-200 text-slate-900 text-sm focus-visible:ring-[#5314d4]"
                                            />
                                        </div>

                                        <Button
                                            type="submit"
                                            disabled={isBusy || cleanNif.length < 9}
                                            className="h-12 w-full gap-2 rounded-xl bg-gradient-to-r from-[#5314d4] to-[#631af0] text-sm font-bold text-white shadow-lg shadow-purple-600/25 hover:from-[#480ebb] hover:to-[#5514d4] transition-all disabled:opacity-50"
                                        >
                                            {isBusy ? (
                                                <><Loader2 className="h-4 w-4 animate-spin" /> A enviar pedido…</>
                                            ) : (
                                                <><Send className="h-4 w-4" /> Enviar Pedido de Cadastro</>
                                            )}
                                        </Button>
                                    </form>
                                )}

                                {/* STEP 6: REQUEST SENT (SUCCESS) */}
                                {step === 'requestSent' && (
                                    <div className="space-y-5 text-center animate-in fade-in duration-300 py-3">
                                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                                            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                                        </div>

                                        <div className="space-y-1">
                                            <h2 className="text-2xl font-black tracking-tight text-slate-900">
                                                Pedido Submetido!
                                            </h2>
                                            <p className="text-xs leading-relaxed text-slate-600 max-w-sm mx-auto">
                                                A solicitação para o NIF <strong className="font-mono text-slate-900">{cleanNif}</strong> foi recebida. Entraremos em contacto brevemente com os dados de acesso.
                                            </p>
                                        </div>

                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 text-left space-y-1.5">
                                            <p className="font-bold text-slate-800 flex items-center gap-1.5">
                                                <Info className="h-4 w-4 text-[#5314d4]" /> O que fazer a seguir?
                                            </p>
                                            <p>
                                                Assim que receber o seu Código de Acesso por email ou WhatsApp, clique em <strong>Iniciar Sessão</strong> nesta página e insira a chave para autorizar este posto.
                                            </p>
                                        </div>

                                        <Button
                                            onClick={() => goTo('welcome')}
                                            className="h-11 w-full rounded-xl bg-gradient-to-r from-[#5314d4] to-[#631af0] font-bold text-white shadow-lg shadow-purple-600/25 hover:from-[#480ebb] hover:to-[#5514d4]"
                                        >
                                            Voltar ao Início
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* ORGANIC SMOOTH WAVE SVG (Image 1 Signature Style) */}
            <div className="relative w-full -mt-1 overflow-hidden leading-none z-10 select-none pointer-events-none">
                <svg
                    viewBox="0 0 1440 240"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-full h-20 sm:h-32 lg:h-44 block"
                    preserveAspectRatio="none"
                >
                    <path
                        d="M0,120 C320,240 420,60 760,140 C1080,220 1260,80 1440,150 L1440,240 L0,240 Z"
                        fill="#ffffff"
                    />
                </svg>
            </div>

            {/* CRISP WHITE FOOTER (Matching Image 1's airy white lower section) */}
            <footer className="relative z-10 w-full bg-white py-6 px-4 sm:px-8 border-t border-slate-100">
                <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
                    <div className="text-center sm:text-left">
                        <p className="font-semibold text-slate-700">
                            © {new Date().getFullYear()} Tango Gestão de Créditos ERP · Todos os direitos reservados.
                        </p>
                        <p className="text-[11px] text-slate-400">
                            Desenvolvido por DIGITAL NORTE (SU), LDA · Linha de Apoio Institucional
                        </p>
                    </div>

                    {/* Bottom Right Pill Action (Echoing Image 1's bottom right button) */}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setInfoModal('suporte')}
                            className="inline-flex items-center gap-2 rounded-full bg-[#5314d4] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-purple-600/20 hover:bg-[#450cc7] transition-all"
                        >
                            <PhoneCall className="h-3.5 w-3.5" />
                            <span>Apoio ao Cliente & Suporte</span>
                        </button>
                    </div>
                </div>
            </footer>

            {/* Interactive Info Modals */}
            {infoModal && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                {infoModal === 'sobre' && <Building2 className="h-5 w-5 text-[#5314d4]" />}
                                {infoModal === 'seguranca' && <Lock className="h-5 w-5 text-[#5314d4]" />}
                                {infoModal === 'suporte' && <PhoneCall className="h-5 w-5 text-[#5314d4]" />}
                                <span>
                                    {infoModal === 'sobre' && 'Sobre o Tango ERP'}
                                    {infoModal === 'seguranca' && 'Segurança & Proteção de Dados'}
                                    {infoModal === 'suporte' && 'Contacto & Apoio ao Cliente'}
                                </span>
                            </h3>
                            <button
                                type="button"
                                onClick={() => setInfoModal(null)}
                                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="text-xs text-slate-600 leading-relaxed space-y-3">
                            {infoModal === 'sobre' && (
                                <>
                                    <p>
                                        O <strong>Tango Gestão de Créditos ERP</strong> é um software especializado para instituições de microcrédito, cooperativas financeiras e empresas com concessão de crédito em Angola.
                                    </p>
                                    <p>
                                        Inclui gestão integral de mutuários, cálculo automatizado de prestações e amortizações, cálculo do Imposto do Selo, controlo de cobranças e contabilidade com planos de contas e balancetes em tempo real.
                                    </p>
                                </>
                            )}
                            {infoModal === 'seguranca' && (
                                <>
                                    <p>
                                        Todas as comunicações com o servidor central e a sincronização em nuvem utilizam <strong>cifragem bancária AES-256 e TLS 1.3</strong>.
                                    </p>
                                    <p>
                                        Cada instituição opera em ambiente estritamente isolado (Multi-Tenant). Os dados são auditados e protegidos contra acessos não autorizados.
                                    </p>
                                </>
                            )}
                            {infoModal === 'suporte' && (
                                <>
                                    <p>
                                        A nossa equipa técnica está disponível para suporte operacional, licenciamento e esclarecimento de dúvidas:
                                    </p>
                                    <div className="rounded-2xl bg-purple-50 p-3 space-y-1.5 font-medium text-slate-800">
                                        <p>📞 <strong>WhatsApp / Telefone:</strong> +244 941 537 486</p>
                                        <p>🏢 <strong>Empresa:</strong> DIGITAL NORTE (SU), LDA</p>
                                        <p>🕒 <strong>Horário:</strong> Segunda a Sexta, 08h00 – 18h00</p>
                                    </div>
                                </>
                            )}
                        </div>

                        <Button
                            type="button"
                            onClick={() => setInfoModal(null)}
                            className="w-full rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 text-xs h-10"
                        >
                            Fechar
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
