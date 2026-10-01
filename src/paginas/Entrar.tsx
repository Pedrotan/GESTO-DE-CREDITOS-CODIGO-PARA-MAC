import { useState, useEffect } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/componentes/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/componentes/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/componentes/ui/dialog";
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Shield, Eye, EyeOff, AlertCircle, HelpCircle, ShieldAlert, Smartphone, ArrowLeft, Lock, MessageCircle, X, Code, Users, Monitor, Globe } from 'lucide-react';
import { Alert, AlertDescription } from '@/componentes/ui/alert';
import { useData } from '@/contextos/ContextoDados';
import { SafeStyle } from '@/componentes/ui/SafeStyle';
import { cn, getFileUrl } from '@/bibliotecas/utils';
import { AccountSwitcher } from '@/componentes/contas/AccountSwitcher';
import { scopedStorageKey } from '@/bibliotecas/contas';
import { isPublicWebBuild } from '@/bibliotecas/ambiente';
import QRCode from 'qrcode';

const systemSlides = [
    {
        title: "Gestão de Créditos Inteligente",
        description: "Plataforma completa para gestão de microcrédito com segurança, controlo total e relatórios em tempo real.",
        cardHeader: "Créditos",
        cardSub: "Sistema ERP",
        cardVersion: "Versão 3.0.2",
        cardGradient: "from-[#60a5fa] via-[#2563eb] to-[#1d4ed8]",
        statsTitle: "Contratos Ativos",
        statsValue: "100%",
        footerText: "Plataforma completa de microcrédito"
    },
    {
        title: "Notificações Automatizadas",
        description: "Envio automático de lembretes de pagamento e extratos de conta por WhatsApp para reduzir o atraso.",
        cardHeader: "Alertas",
        cardSub: "WhatsApp API",
        cardVersion: "Automático",
        cardGradient: "from-teal-400 via-cyan-500 to-blue-600",
        statsTitle: "Mensagens Enviadas",
        statsValue: "99.8%",
        footerText: "Sincronização instantânea com clientes"
    },
    {
        title: "Análise de Risco & Scoring",
        description: "Avaliação instantânea do perfil do cliente com pontuação de risco inteligente para tomadas de decisão seguras.",
        cardHeader: "Scoring",
        cardSub: "Análise Risco",
        cardVersion: "Inteligente",
        cardGradient: "from-fuchsia-500 via-pink-500 to-rose-500",
        statsTitle: "Decisões Seguras",
        statsValue: "99.2%",
        footerText: "Algoritmo de scoring customizado"
    }
];

export default function Login() {
    const { login, logout, verify2FA, hasUsers, generate2FASecret, enable2FA } = useAuth();
    const { companySettings } = useData();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [activeSlide, setActiveSlide] = useState(0);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
    const [logoError, setLogoError] = useState(false);

    // Auto-slide carousel effect
    useEffect(() => {
        const interval = setInterval(() => {
            setActiveSlide((prev) => (prev + 1) % systemSlides.length);
        }, 5000);
        return () => clearInterval(interval);
    }, []);
    const [rememberMe, setRememberMe] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Session recovery states
    const [isSessionRecovery, setIsSessionRecovery] = useState(false);
    const [recoveryEmail, setRecoveryEmail] = useState('');
    const [recoveryPassword, setRecoveryPassword] = useState('');
    const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
    const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);

    // 2FA login states
    const [requires2FA, setRequires2FA] = useState(false);
    const [twoFactorUserId, setTwoFactorUserId] = useState('');
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [requiredMfaSetup, setRequiredMfaSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
    const [requiredMfaToken, setRequiredMfaToken] = useState('');
    const [mfaSetupError, setMfaSetupError] = useState('');
    const [requiredRecoveryCodes, setRequiredRecoveryCodes] = useState<string[]>([]);

    const refreshRequiredMfaSetup = async () => {
        const enrollment = await generate2FASecret();
        setRequiredMfaSetup({ secret: enrollment.secret, qrDataUrl: await QRCode.toDataURL(enrollment.qrCode) });
        setRequiredMfaToken('');
        setMfaSetupError('');
    };

    // Support modal state
    const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMessage("");

        try {
            const cleanEmail = email.trim();
            const cleanPassword = password.trim();

            const success = await login(cleanEmail, cleanPassword);

            if (success) {
                handleLoginSuccess();
            } else {
                setErrorMessage('Email ou password incorretos. Por favor, tente novamente.');
                setIsErrorModalOpen(true);
            }
        } catch (error: any) {
            if (error.message && error.message.startsWith('MFA_SETUP_REQUIRED:')) {
                await refreshRequiredMfaSetup();
                return;
            }
            if (error.message && error.message.startsWith('2FA_REQUIRED:')) {
                const userId = error.message.split(':')[1];
                setTwoFactorUserId(userId);
                setRequires2FA(true);
                return;
            }
            console.error("Login component error:", error);
            setErrorMessage(error.message || 'Ocorreu um erro ao tentar entrar no sistema.');
            setIsErrorModalOpen(true);
        } finally {
            setLoading(false);
        }
    };

    const handleLoginSuccess = () => {
        const params = new URLSearchParams(window.location.search || window.location.hash.split('?')[1]);
        const returnUrl = params.get('returnUrl');

        const decoded = returnUrl ? decodeURIComponent(returnUrl) : '';
        const isSafeInternalPath = decoded.startsWith('/') && !decoded.startsWith('//') && !decoded.includes('\\');
        if (isSafeInternalPath && decoded !== '/login' && decoded !== '/entrar') {
            navigate(decoded);
        } else {
            navigate('/');
        }
    };

    const handle2FASubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const result = await verify2FA(twoFactorUserId, twoFactorCode);
            if (result.authenticated) {
                handleLoginSuccess();
            } else {
                if (result.reason === 'challenge_expired') {
                    setRequires2FA(false);
                    setTwoFactorUserId('');
                    setErrorMessage('A verificação expirou. Introduza novamente a palavra-passe para receber uma nova tentativa de 2FA.');
                } else if (result.reason === 'replayed_code') {
                    setErrorMessage('Este código já foi utilizado. Aguarde o próximo código de 6 dígitos no autenticador e tente novamente.');
                } else {
                    setErrorMessage('O código não corresponde à conta configurada. Confirme que escolheu a entrada TangoGestaoCreditosERP no autenticador e que a hora do computador e do telemóvel está automática. Se trocou de QR, use a entrada mais recente ou um código de recuperação.');
                }
                setTwoFactorCode('');
                setIsErrorModalOpen(true);
            }
        } catch (error: any) {
            if (error.message && error.message.startsWith('MFA_SETUP_REQUIRED:')) {
                await refreshRequiredMfaSetup();
                setIsRecoveryModalOpen(false);
                return;
            }
            setErrorMessage(error.message || 'Erro na verificação 2FA');
            setIsErrorModalOpen(true);
        } finally {
            setLoading(false);
        }
    };

    const handleRequiredMfaSetup = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!requiredMfaSetup) return;
        setLoading(true);
        try {
            const result = await enable2FA(requiredMfaSetup.secret, requiredMfaToken);
            if (!result.success) {
                setMfaSetupError(result.reason === 'qr_expired'
                    ? 'Este QR expirou. Gere um novo QR, substitua a entrada antiga no telemóvel e use o novo código.'
                    : result.reason === 'session_expired'
                        ? 'A sessão expirou. Volte ao início de sessão e introduza a sua palavra-passe novamente.'
                        : 'Os 6 dígitos não correspondem ao QR atual. Abra a entrada TangoGestaoCreditosERP no telemóvel, confirme a hora automática e tente o código mais recente.');
                return;
            }
            setMfaSetupError('');
            setRequiredRecoveryCodes(result.recoveryCodes || []);
        } catch (error: any) {
            setMfaSetupError(error?.message || 'Não foi possível ativar o MFA. Volte ao início de sessão e tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    // Check for session expiration on mount
    useEffect(() => {
        const sessionExpired = sessionStorage.getItem('sessionExpired');
        const expiredEmail = sessionStorage.getItem('expiredUserEmail');

        if (sessionExpired === 'true' && expiredEmail) {
            setIsSessionRecovery(true);
            setRecoveryEmail(expiredEmail);
            setIsRecoveryModalOpen(true);
        }
    }, []);

    const handleQuickReauth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMessage("");

        try {
            const success = await login(recoveryEmail, recoveryPassword);

            if (success) {
                const requestedReturnUrl = sessionStorage.getItem('returnUrl') || '/';
                const returnUrl = requestedReturnUrl.startsWith('/') && !requestedReturnUrl.startsWith('//') && !requestedReturnUrl.includes('\\') ? requestedReturnUrl : '/';
                sessionStorage.removeItem('sessionExpired');
                sessionStorage.removeItem('expiredUserEmail');
                sessionStorage.removeItem('returnUrl');
                navigate(returnUrl);
            } else {
                setErrorMessage('Senha incorreta. Por favor, tente novamente.');
                setIsErrorModalOpen(true);
            }
        } catch (error: any) {
            if (error.message && error.message.startsWith('2FA_REQUIRED:')) {
                setTwoFactorUserId(error.message.split(':')[1]);
                setRequires2FA(true);
                setIsRecoveryModalOpen(false);
                return;
            }
            console.error("Quick reauth error:", error);
            setErrorMessage(error.message || 'Erro ao re-autenticar.');
            setIsErrorModalOpen(true);
        } finally {
            setLoading(false);
        }
    };

    const handleStartOnboarding = async () => {
        try {
            // 1. Limpar LocalStorage e SessionStorage completamente
            localStorage.clear();
            sessionStorage.clear();

            // 2. Limpar todas as bases IndexedDB do navegador (especialmente a base SQLite local)
            if (typeof window !== 'undefined' && window.indexedDB) {
                try {
                    indexedDB.deleteDatabase('TangoGestaoCreditosERP_DevDB');
                    indexedDB.deleteDatabase('TangoGestaoCreditosERPDB');
                    if (indexedDB.databases) {
                        const dbs = await indexedDB.databases();
                        for (const dbInfo of dbs) {
                            if (dbInfo.name) indexedDB.deleteDatabase(dbInfo.name);
                        }
                    }
                } catch (e) {
                    console.warn("Erro ao limpar IndexedDB:", e);
                }
            }

            // 3. Chamar API Electron se estiver em modo desktop
            if ((window as any).electronAPI?.dbNuclearReset) {
                try {
                    await (window as any).electronAPI.dbNuclearReset();
                } catch (e) {}
            }
        } catch (error) {
            console.error("Erro ao reiniciar dados:", error);
        }

        window.location.hash = '/onboarding';
        window.location.reload();
    };

    return (
        <div className="min-h-screen bg-[#f1f5f9] text-[#142033] lg:grid lg:grid-cols-[47%_53%] relative overflow-hidden">
            <section className="relative flex min-h-screen items-center justify-center px-4 py-8 sm:px-10 lg:px-12 xl:px-16 bg-gradient-to-tr from-blue-50/70 via-slate-50 to-indigo-50/70 z-10">
                {/* Background decorative glow elements */}
                <div className="absolute top-[-10%] left-[-10%] w-[350px] h-[350px] bg-blue-500/10 rounded-full blur-3xl pointer-events-none z-0" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[350px] h-[350px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none z-0" />

                <div className="w-full max-w-[640px] flex flex-col gap-6 z-10 relative animate-in fade-in slide-in-from-bottom-6 duration-700">
                    <div className="text-center mb-3">
                        <h1 className="mx-auto inline-block bg-gradient-to-r from-slate-950 via-blue-700 to-slate-900 bg-clip-text text-3xl sm:text-4xl font-black tracking-tight leading-tight text-transparent uppercase">
                            OLA SEJA BEM VINDO(A)
                        </h1>
                        <div className="mx-auto mt-3 h-1 w-20 rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 shadow-sm shadow-blue-500/20" />
                    </div>

                    <div className="w-full sm:min-h-[700px] flex flex-col justify-center bg-white/95 backdrop-blur-md rounded-3xl sm:rounded-[2.5rem] p-6 sm:p-10 md:p-16 shadow-[0_30px_70px_-15px_rgba(30,41,59,0.15)] border border-slate-200/60 relative">
                        <div className="mb-10 flex items-center gap-3 text-[#2563eb]">
                            <div className="grid h-14 w-14 place-items-center rounded-xl border-2 border-[#2563eb] overflow-hidden bg-white shadow-md shadow-blue-500/5 shrink-0">
                                {!logoError ? (
                                    <img
                                        src={companySettings?.logo ? (companySettings.logo.startsWith('data:') ? companySettings.logo : `${getFileUrl(companySettings.logo)}?t=${Date.now()}`) : 'logo-app.png'}
                                        alt="Logo"
                                        className="h-full w-full object-contain p-1"
                                        onError={() => setLogoError(true)}
                                    />
                                ) : (
                                    <Shield className="h-6 w-6 text-[#2563eb]" />
                                )}
                            </div>
                            <span className="min-w-0 break-words text-xl sm:text-2xl font-black tracking-[-0.04em] text-slate-800">
                                {companySettings?.name && companySettings.name !== 'A Carregar...' && companySettings.name !== 'Provisório' && companySettings.name !== 'Empresa' ? companySettings.name : 'Tango Gestão de Créditos'}
                            </span>
                        </div>

                        {!requires2FA ? (
                            <>
                                <div className="mb-8">
                                    <h1 className="text-3xl font-black tracking-[-0.04em] text-slate-900">Iniciar Sessão</h1>
                                    <p className="mt-3 text-xs font-semibold text-slate-400">
                                        Digite as suas credenciais para aceder ao sistema
                                    </p>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-5">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="email" className="text-xs font-bold text-slate-400">Email ou Nome de Utilizador</Label>
                                        <Input
                                            id="email"
                                            type="text"
                                            placeholder="seu.email@exemplo.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            disabled={loading}
                                            className="h-11 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-slate-800 placeholder:text-slate-400 focus-visible:ring-[#2563eb]"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="password" className="text-xs font-bold text-slate-400">Palavra-passe</Label>
                                        <div className="relative">
                                            <Input
                                                id="password"
                                                type={showPassword ? 'text' : 'password'}
                                                placeholder="@#*%"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                                disabled={loading}
                                                className="h-11 rounded-xl border-slate-200 bg-slate-50/50 px-4 pr-14 text-slate-800 placeholder:text-slate-400 focus-visible:ring-[#2563eb]"
                                            />
                                            <button
                                                type="button"
                                                className="absolute right-4 top-1/2 -translate-y-1/2 border-l border-slate-200 pl-4 text-slate-400 hover:text-slate-600 transition-colors"
                                                onClick={() => setShowPassword(!showPassword)}
                                                disabled={loading}
                                            >
                                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end pt-0.5">
                                        <Link to="/esqueci-senha" className="text-xs font-bold text-[#2563eb] hover:text-blue-700 hover:underline transition-colors">
                                            Esqueceu a senha?
                                        </Link>
                                    </div>

                                    {!hasUsers && (
                                        <div className="p-3.5 bg-amber-50/90 border border-amber-200/80 rounded-2xl text-center space-y-2">
                                            <p className="text-xs text-amber-900 font-semibold">
                                                Nenhum utilizador encontrado na base de dados.
                                            </p>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={handleStartOnboarding}
                                                className="w-full h-9 text-xs font-bold border-amber-300 text-amber-900 bg-white hover:bg-amber-100/70"
                                            >
                                                Iniciar Assistente de Configuração (Onboarding)
                                            </Button>
                                        </div>
                                    )}

                                    <Button
                                        type="submit"
                                        className="mt-2 h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 via-[#2563eb] to-indigo-600 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                                        disabled={loading}
                                    >
                                        {loading ? 'A autenticar...' : 'Entrar no Sistema'}
                                    </Button>

                                    <div className="pt-5 border-t border-slate-100 text-center space-y-1">
                                        <p className="text-[9px] text-slate-400 uppercase tracking-[0.2em] font-bold">
                                            Desenvolvido por
                                        </p>
                                        <p className="text-xs font-bold text-slate-700">
                                            DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, (SU), LDA
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-medium">
                                            Cuanza Norte, N´dalatando • Contacto: +244 941 537 486
                                        </p>
                                    </div>
                                </form>
                            </>
                        ) : (
                            <div className="space-y-6">
                                <div>
                                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#2563eb]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#2563eb]">
                                        <Smartphone className="h-3.5 w-3.5" />
                                        Segurança Ativa
                                    </div>
                                    <h1 className="text-3xl font-black tracking-[-0.04em] text-slate-900">Verificação 2FA</h1>
                                    <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-400">
                                        Introduza o código de 6 dígitos do autenticador ou um código de recuperação.
                                    </p>
                                </div>
                                <form onSubmit={handle2FASubmit} className="space-y-5">
                                    <Input
                                        id="2fa-code"
                                        type="text"
                                        placeholder="000000 ou XXXXX-XXXXX"
                                        className="h-16 rounded-xl border-slate-200 bg-slate-50/50 text-center text-xl font-black tracking-[0.15em] focus-visible:ring-[#2563eb]"
                                        value={twoFactorCode}
                                        onChange={(e) => setTwoFactorCode(e.target.value.replace(/[^A-Za-z0-9-]/g, '').toUpperCase().slice(0, 11))}
                                        autoFocus
                                        required
                                        disabled={loading}
                                    />
                                    <Button
                                        type="submit"
                                        className="h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 via-[#2563eb] to-indigo-600 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700 transition-all"
                                        disabled={loading || !(/^\d{6}$/.test(twoFactorCode) || /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(twoFactorCode))}
                                    >
                                        {loading ? 'A verificar...' : 'Confirmar e Entrar'}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="w-full text-slate-400 hover:text-[#2563eb] text-xs"
                                        onClick={() => setRequires2FA(false)}
                                        disabled={loading}
                                    >
                                        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Voltar para o Login
                                    </Button>
                                </form>
                            </div>
                        )}
                    </div>

                    {/* Switcher below the modal */}
                    {companySettings?.enableMultiTenant !== false && (
                        <div className="w-full bg-white/90 backdrop-blur-md rounded-[1.5rem] p-5 shadow-lg border border-slate-200/60 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#2563eb]">Conta de trabalho</p>
                            <AccountSwitcher showDelete={false} />
                        </div>
                    )}
                </div>
            </section>

            <section className="relative hidden min-h-screen overflow-hidden bg-gradient-to-br from-[#0c1b40] via-[#162a5c] to-[#0a1128] px-12 py-12 text-white lg:flex lg:flex-col lg:items-center lg:justify-center z-0">
                {/* Decorative glows for the right panel */}
                <div className="absolute -right-28 -top-40 h-[520px] w-[520px] rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
                <div className="absolute -left-20 -bottom-20 h-[400px] w-[400px] rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#0a1128] to-transparent pointer-events-none" />
                <button
                    onClick={() => setIsSupportModalOpen(true)}
                    className="absolute right-28 top-12 flex items-center gap-3 text-sm font-bold text-white/70 hover:text-white transition-colors cursor-pointer"
                >
                    <HelpCircle className="h-5 w-5" />
                    Suporte
                </button>

                <div className="relative mt-8 w-full max-w-[540px]">
                    <h2 className="mb-10 text-5xl font-black tracking-[-0.04em] leading-none whitespace-nowrap">
                        TANGO GESTÃO DE CREDITOS ERP
                    </h2>

                    <div key={activeSlide} className="relative rounded-lg bg-white p-9 text-[#1e293b] shadow-2xl animate-in fade-in duration-500">
                        <h3 className="max-w-[280px] text-3xl font-black leading-[1.05] tracking-[-0.04em] text-slate-900">
                            {systemSlides[activeSlide].title}
                        </h3>
                        <p className="mt-5 max-w-[280px] text-sm font-semibold leading-relaxed text-slate-400">
                            {systemSlides[activeSlide].description}
                        </p>


                        <div className={`absolute right-[-22px] top-12 h-36 w-48 rotate-[31deg] rounded-2xl bg-gradient-to-br ${systemSlides[activeSlide].cardGradient} p-5 text-white shadow-2xl transition-all duration-500`}>
                            <div className="text-right text-sm font-bold opacity-80">{systemSlides[activeSlide].cardHeader}</div>
                            <div className="mt-8 text-sm font-semibold tracking-wider opacity-90">{systemSlides[activeSlide].cardSub}</div>
                            <div className="mt-3 flex justify-between text-[10px] opacity-80">
                                <span>Versão</span>
                                <span>{systemSlides[activeSlide].cardVersion}</span>
                            </div>
                        </div>

                        <div className="absolute bottom-[-45px] right-0 flex h-20 w-64 items-center gap-5 rounded-b-lg rounded-tl-lg bg-white px-8 text-[#142033] shadow-xl border border-slate-100 transition-all duration-500">
                            <div className="flex h-10 w-10 items-end justify-center gap-1 rounded-full bg-blue-50 pb-2">
                                <span className="h-3 w-1.5 rounded-full bg-[#2563eb]" />
                                <span className="h-5 w-1.5 rounded-full bg-[#2563eb]" />
                            </div>
                            <div>
                                <div className="text-xs font-black text-slate-400">{systemSlides[activeSlide].statsTitle}</div>
                                <div className="text-2xl font-black text-slate-800">{systemSlides[activeSlide].statsValue}</div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-24 text-center">
                        <p className="text-lg font-medium leading-relaxed text-white/40 min-h-[28px] transition-all duration-500">
                            {systemSlides[activeSlide].footerText}
                        </p>
                        <div className="mt-6 flex items-center justify-center gap-3">
                            {systemSlides.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => setActiveSlide(index)}
                                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                                        activeSlide === index ? 'w-10 bg-white' : 'w-6 bg-white/20 hover:bg-white/40'
                                    }`}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Error Modal */}
            <Dialog open={Boolean(requiredMfaSetup)} onOpenChange={() => undefined}>
                <DialogContent className="sm:max-w-[480px] max-h-[90vh] border-none bg-white p-0 overflow-y-auto shadow-2xl [&>button]:hidden">
                    <DialogHeader className="bg-gradient-to-br from-blue-700 to-indigo-700 p-7 text-white">
                        <DialogTitle className="text-center text-2xl font-black text-white">MFA obrigatório</DialogTitle>
                        <DialogDescription className="text-center text-white/80">
                            Para proteger a conta de super administrador, o acesso exige um código do seu telemóvel além da palavra-passe.
                        </DialogDescription>
                    </DialogHeader>
                    {requiredRecoveryCodes.length > 0 ? (
                        <div className="space-y-5 p-7">
                            <p className="text-sm font-semibold text-slate-700">Guarde estes códigos de recuperação. Cada um funciona uma única vez e não voltará a ser mostrado.</p>
                            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-4">
                                {requiredRecoveryCodes.map(code => <code key={code} className="rounded-lg bg-white p-2 text-center font-mono font-bold select-all">{code}</code>)}
                            </div>
                            <Button className="w-full" onClick={() => {
                                setRequiredMfaSetup(null);
                                setRequiredRecoveryCodes([]);
                                handleLoginSuccess();
                            }}>Já guardei os códigos</Button>
                        </div>
                    ) : (
                        <form className="space-y-5 p-7" onSubmit={handleRequiredMfaSetup}>
                            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                                <li>Abra o Portador de Chaves no iPhone ou uma aplicação de códigos, como Google ou Microsoft Authenticator.</li>
                                <li>Adicione uma conta lendo este QR. Procure a entrada TangoGestaoCreditosERP e o código de 6 dígitos que muda a cada 30 segundos.</li>
                                <li>Introduza abaixo o código atual para concluir a ativação.</li>
                            </ol>
                            <div className="flex justify-center">
                                {requiredMfaSetup?.qrDataUrl && <img src={requiredMfaSetup.qrDataUrl} alt="Código QR para configurar MFA" className="h-48 w-48" />}
                            </div>
                            <p className="text-center text-xs text-slate-500">Se não conseguir ler o QR, introduza esta chave manualmente na aplicação:</p>
                            <code className="block break-all rounded-xl bg-slate-50 p-3 text-center text-xs font-bold select-all">{requiredMfaSetup?.secret}</code>
                            <p className="text-center text-sm text-slate-600">
                                Este QR expira após 15 minutos. Um QR novo substitui o anterior.
                            </p>
                            {mfaSetupError && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{mfaSetupError}</p>}
                            <Input value={requiredMfaToken} onChange={event => setRequiredMfaToken(event.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="Código de 6 dígitos" className="h-14 text-center text-2xl tracking-[0.35em]" autoFocus />
                            <Button type="submit" className="w-full" disabled={loading || requiredMfaToken.length !== 6}>
                                {loading ? 'A ativar...' : 'Ativar MFA e continuar'}
                            </Button>
                            <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={async () => {
                                setLoading(true);
                                try {
                                    await refreshRequiredMfaSetup();
                                } catch (error: any) {
                                    setErrorMessage(error?.message || 'Não foi possível gerar um novo QR. Inicie sessão novamente.');
                                    setIsErrorModalOpen(true);
                                } finally {
                                    setLoading(false);
                                }
                            }}>Gerar novo QR</Button>
                            <Button type="button" variant="ghost" className="w-full" disabled={loading} onClick={async () => {
                                await logout();
                                setRequiredMfaSetup(null);
                                setRequiredMfaToken('');
                                setMfaSetupError('');
                            }}>Voltar ao início de sessão</Button>
                        </form>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={isErrorModalOpen} onOpenChange={setIsErrorModalOpen}>
                <DialogContent className="sm:max-w-[420px] border-none bg-white/95 backdrop-blur-xl p-0 overflow-hidden text-center shadow-2xl">
                    {(() => {
                        const isBlocked = errorMessage.toLowerCase().includes('bloqueada');

                        return (
                            <>
                                <div className={`flex flex-col items-center px-8 pt-10 pb-8 w-full ${isBlocked ? 'bg-red-50/80' : 'bg-amber-50/80'}`}>
                                    <div className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full ${isBlocked ? 'bg-red-100/50' : 'bg-amber-100/50'} mb-2`}>
                                        <div className={`relative flex items-center justify-center rounded-full h-16 w-16 ${isBlocked ? 'bg-red-200/50' : 'bg-amber-200/50'} animate-in zoom-in duration-500`}>
                                            {isBlocked ? (
                                                <div className="relative">
                                                    <div className="absolute inset-0 bg-red-400/30 rounded-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                                                    <Lock className="h-8 w-8 text-red-600 relative z-10" />
                                                </div>
                                            ) : (
                                                <ShieldAlert className="h-8 w-8 text-amber-600" />
                                            )}
                                        </div>
                                    </div>

                                    <DialogTitle className={`text-center text-2xl font-black tracking-tight mt-4 ${isBlocked ? 'text-red-900' : 'text-amber-900'}`}>
                                        {isBlocked ? "Acesso Suspenso" : "Falha na Autenticação"}
                                    </DialogTitle>

                                    <div className={`text-center text-sm leading-relaxed mt-3 px-2 ${isBlocked ? 'text-red-800/80' : 'text-amber-800/80'}`}>
                                        {isBlocked ? (
                                            <div className="space-y-2">
                                                <p className="font-medium">Sua conta foi temporariamente bloqueada por segurança.</p>
                                                <p className="text-xs opacity-90">
                                                    Detetámos múltiplas tentativas de acesso incorretas. Para proteger os seus dados, o acesso foi suspenso.
                                                </p>
                                                <div className="bg-white/50 rounded-lg p-3 mt-3 text-xs border border-red-100 shadow-sm">
                                                    <p className="font-bold text-red-700 mb-1">💡 O que fazer?</p>
                                                    <p>Aguarde <strong>5 a 10 minutos</strong> antes de tentar novamente ou contacte o administrador do sistema para desbloqueio imediato.</p>
                                                </div>
                                            </div>
                                        ) : (
                                            errorMessage
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 p-6 bg-white">
                                    <Button
                                        className={`w-full h-14 text-base font-bold text-white rounded-xl shadow-lg transition-all active:scale-[0.98] ${isBlocked
                                            ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                                            : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                                            }`}
                                        onClick={() => setIsErrorModalOpen(false)}
                                    >
                                        {isBlocked ? 'Entendido, Vou Aguardar' : 'Tentar Novamente'}
                                    </Button>

                                    <p className="text-center text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold mt-2">
                                        Segurança Tango ERP
                                    </p>
                                </div>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            {/* Session Recovery Modal */}
            <Dialog open={isRecoveryModalOpen} onOpenChange={(open) => {
                if (!open) {
                    sessionStorage.removeItem('sessionExpired');
                    sessionStorage.removeItem('expiredUserEmail');
                    sessionStorage.removeItem('returnUrl');
                    setIsRecoveryModalOpen(false);
                    setIsSessionRecovery(false);
                }
            }}>
                <DialogContent className="sm:max-w-md border-none bg-white shadow-2xl overflow-hidden p-0 [&>button]:text-white">
                    <DialogHeader className="space-y-3 bg-gradient-to-br from-red-600 to-red-500 p-8 text-white shadow-none border-none">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm animate-pulse">
                            <Shield className="h-10 w-10 text-white" />
                        </div>
                        <DialogTitle className="text-center text-2xl font-bold text-white drop-shadow-sm">
                            Sessão Expirada
                        </DialogTitle>
                        <DialogDescription className="text-center text-base leading-relaxed text-white/90">
                            Por favor, reintroduza a sua senha para continuar.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleQuickReauth} className="space-y-4 px-8 pt-6 pb-8">
                        <div className="space-y-2">
                            <Label htmlFor="recovery-password">Palavra-passe</Label>
                            <div className="relative">
                                <Input
                                    id="recovery-password"
                                    type={showRecoveryPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={recoveryPassword}
                                    onChange={(e) => setRecoveryPassword(e.target.value)}
                                    required
                                    disabled={loading}
                                    autoFocus
                                    className="h-11 rounded-xl border-slate-200 bg-slate-50/50 px-4 pr-14 text-slate-800 placeholder:text-slate-400 focus-visible:ring-red-500"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                    onClick={() => setShowRecoveryPassword(!showRecoveryPassword)}
                                    disabled={loading}
                                >
                                    {showRecoveryPassword ? (
                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                    )}
                                </Button>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-11 text-base font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-lg shadow-red-500/20"
                            disabled={loading}
                        >
                            {loading ? 'A autenticar...' : 'Retomar Sessão'}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Support / Developer Info Modal */}
            <Dialog open={isSupportModalOpen} onOpenChange={setIsSupportModalOpen}>
                <DialogContent className="sm:max-w-[520px] border-none bg-white/95 backdrop-blur-xl p-0 overflow-hidden shadow-2xl">
                    <div className="bg-gradient-to-br from-[#2563eb] to-[#0c1b40] p-8 text-white">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/20 backdrop-blur-sm">
                                <Code className="h-5 w-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-black text-white">Suporte Técnico</DialogTitle>
                                <DialogDescription className="text-sm text-white/70 mt-0.5">Informações do sistema e da equipa</DialogDescription>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 space-y-5">
                        {/* System Info */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-black text-[#2563eb] uppercase tracking-wider">
                                <Monitor className="h-4 w-4" />
                                Informações do Sistema
                            </div>
                            <div className="rounded-xl bg-[#f4f9fd] p-4 space-y-2.5">
                                <div className="flex justify-between text-sm">
                                    <span className="text-[#8c9aaa] font-semibold">Sistema</span>
                                    <span className="font-bold text-[#142033]">Tango Gestão de Créditos</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[#8c9aaa] font-semibold">Versão</span>
                                    <span className="font-bold text-[#142033]">3.0.0</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[#8c9aaa] font-semibold">Tipo</span>
                                    <span className="font-bold text-[#142033]">ERP - Microcrédito</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[#8c9aaa] font-semibold">Tecnologia</span>
                                    <span className="font-bold text-[#142033]">React + TypeScript + Electron</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[#8c9aaa] font-semibold">Base de Dados</span>
                                    <span className="font-bold text-[#142033]">Firebase / Local</span>
                                </div>
                            </div>
                        </div>

                        {/* Developer Info */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-black text-[#2563eb] uppercase tracking-wider">
                                <Users className="h-4 w-4" />
                                Equipa de Desenvolvimento
                            </div>
                            <div className="rounded-xl bg-[#f4f9fd] p-4 space-y-2.5">
                                <div className="flex justify-between text-sm">
                                    <span className="text-[#8c9aaa] font-semibold">Empresa</span>
                                    <span className="font-bold text-[#142033]">DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, (SU), LDA</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[#8c9aaa] font-semibold">Localização</span>
                                    <span className="font-bold text-[#142033]">Cuanza Norte, N´dalatando</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[#8c9aaa] font-semibold">Contacto</span>
                                    <span className="font-bold text-[#142033]">+244 941 537 486</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[#8c9aaa] font-semibold">Email</span>
                                    <span className="font-bold text-[#142033]">tango.invest.tech@gmail.com</span>
                                </div>
                            </div>
                        </div>

                        {/* WhatsApp CTA */}
                        <a
                            href="https://wa.me/244941537486?text=Olá%2C%20preciso%20de%20suporte%20técnico%20para%20o%20sistema%20Tango%20Gestão%20de%20Créditos."
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#25d366] text-base font-black text-white shadow-lg shadow-[#25d366]/20 hover:bg-[#1fb855] transition-colors"
                        >
                            <MessageCircle className="h-5 w-5" />
                            Contactar pelo WhatsApp
                        </a>

                        <p className="text-center text-[10px] text-[#9aa7b7] uppercase tracking-[0.2em] font-bold">
                            © {new Date().getFullYear()} DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, (SU), LDA
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
