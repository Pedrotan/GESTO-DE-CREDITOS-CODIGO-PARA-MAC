import { useState, useEffect } from 'react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { useData } from '@/contextos/ContextoDados';
import { isPublicWebBuild } from '@/bibliotecas/ambiente';
import { scopedStorageKey } from '@/bibliotecas/contas';
import { CLOUD_SYNC_BOOTSTRAP_KEY, startCloudSync, stopCloudSync, syncCloudNow } from '@/servicos/ServicoSincronizacaoCloud';
import {
    Building2, KeyRound, Loader2, ShieldCheck, Eye, EyeOff, ArrowLeft, ArrowRight, ShieldAlert,
    Shield, LogIn, ClipboardList, CheckCircle2, Cloud, BarChart3, Wallet, Users, Send
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
    { icon: Wallet, title: 'Créditos e cobranças', text: 'Simulação, contratos, prestações e pagamentos num só lugar.' },
    { icon: BarChart3, title: 'Relatórios e contabilidade', text: 'Indicadores da carteira, mora e lançamentos de dupla entrada.' },
    { icon: Users, title: 'Clientes e equipa', text: 'Ficha de clientes, utilizadores e permissões por função.' },
    { icon: Cloud, title: 'Acesso em qualquer lugar', text: 'Dados cifrados e sincronizados entre os seus dispositivos.' }
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

    // Passo 1 do login: verificar se o NIF pertence a uma empresa registada no Tango Master.
    const handleIdentify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (cleanNif.length < 9) { setErrorMessage('Introduza o NIF completo da empresa.'); return; }
        setIsBusy(true);
        setErrorMessage('');
        try {
            const { ok, data } = await postJson('/api/company-status', { nif: cleanNif });
            if (!ok) { setErrorMessage(data.message || 'Não foi possível verificar a empresa.'); return; }
            if (data.status === 'active') {
                setCompanyName(data.companyName || '');
                goTo('access');
            } else if (data.status === 'not_registered') {
                goTo('activation');
            } else if (data.status === 'blocked') {
                setErrorMessage('O acesso desta empresa está suspenso no Tango Master. Contacte o suporte.');
            } else if (data.status === 'expired') {
                setErrorMessage('A validade do acesso desta empresa expirou. Solicite a renovação ao administrador.');
            }
        } catch (err) {
            setErrorMessage(networkMessage(err));
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
            // O login mostra o assistente de configuração apenas se ainda não existir nenhum utilizador.
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

    if (!isPublicWebBuild || isAuthorized) return null;
    if (typeof window !== 'undefined' && window.location.hash.includes('tango-master')) return null;

    const errorBox = errorMessage && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <p className="leading-relaxed">{errorMessage}</p>
        </div>
    );

    const backButton = (target: Step) => (
        <button type="button" onClick={() => goTo(target)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>
    );

    const nifField = (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <Label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">Tipo de contribuinte</Label>
                <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                    {(['COLECTIVO', 'SINGULAR'] as const).map(type => (
                        <button key={type} type="button" onClick={() => { setNifType(type); setNif(''); }}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${nifType === type ? 'bg-white text-[#F37021] shadow-sm dark:bg-slate-700' : 'text-slate-500'}`}>
                            {type === 'COLECTIVO' ? 'Empresa (NIF)' : 'Particular (BI)'}
                        </button>
                    ))}
                </div>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="gateway-nif" className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400">
                    <Building2 className="h-3.5 w-3.5 text-[#F37021]" /> {nifType === 'COLECTIVO' ? 'NIF da empresa' : 'Número do BI'}
                </Label>
                <Input id="gateway-nif" value={nif} onChange={e => { setNif(formatNIF(e.target.value, nifType)); setErrorMessage(''); }}
                    placeholder={nifType === 'COLECTIVO' ? 'Ex.: 5417000000' : 'Ex.: 000000000LA000'} inputMode={nifType === 'COLECTIVO' ? 'numeric' : 'text'}
                    className="h-12 rounded-xl font-mono text-base font-bold uppercase tracking-wider" disabled={isBusy} autoFocus required />
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950 bg-gradient-to-br from-slate-950 via-slate-900 to-[#0A1128] font-sans">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute left-[-10%] top-[-10%] h-[50%] w-[50%] rounded-full bg-[#F37021]/15 blur-[140px]" />
                <div className="absolute bottom-[-10%] right-[-10%] h-[50%] w-[50%] rounded-full bg-blue-600/15 blur-[140px]" />
            </div>

            <div className="relative mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center gap-8 px-4 py-10">
                {step === 'welcome' ? (
                    <div className="grid w-full items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
                        <div className="text-white">
                            <div className="mb-6 flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F37021] shadow-lg shadow-orange-500/30">
                                    <Building2 className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-lg font-black leading-tight">Tango Gestão de Créditos</p>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-orange-300">ERP para instituições de crédito</p>
                                </div>
                            </div>
                            <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
                                A gestão da sua carteira de crédito, segura e acessível em qualquer computador.
                            </h1>
                            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300">
                                O acesso é reservado a empresas cadastradas pelo administrador no Tango Master.
                                Se a sua empresa já tem acesso, inicie sessão. Se ainda não tem, faça o pedido de cadastro.
                            </p>
                            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                                {FEATURES.map(({ icon: Icon, title, text }) => (
                                    <li key={title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#F37021]" />
                                        <div>
                                            <p className="text-sm font-bold">{title}</p>
                                            <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{text}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="order-first rounded-3xl border border-slate-700/80 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-8 lg:order-none">
                            <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Bem-vindo</h2>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Como pretende continuar?</p>
                            <div className="mt-6 space-y-3">
                                <Button onClick={() => goTo('identify')}
                                    className="h-14 w-full justify-between rounded-xl bg-[#F37021] px-5 text-sm font-black text-white shadow-lg shadow-orange-500/25 hover:bg-orange-600">
                                    <span className="flex items-center gap-2"><LogIn className="h-5 w-5" /> Iniciar sessão</span>
                                    <ArrowRight className="h-5 w-5" />
                                </Button>
                                <Button variant="outline" onClick={() => goTo('request')}
                                    className="h-14 w-full justify-between rounded-xl px-5 text-sm font-black">
                                    <span className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-[#F37021]" /> Pedir cadastro da empresa</span>
                                    <ArrowRight className="h-5 w-5" />
                                </Button>
                            </div>
                            <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-slate-400">
                                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                Neste navegador ainda não há nenhuma empresa ligada. Depois de ligar a empresa, o próximo acesso abre diretamente o login.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-700/80 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                        <div className="relative border-b-4 border-[#F37021] bg-[#2B2D2F] p-6 text-center text-white">
                            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F37021] shadow-lg shadow-orange-500/30">
                                {step === 'request' || step === 'requestSent' || step === 'activation'
                                    ? <ClipboardList className="h-6 w-6" /> : <LogIn className="h-6 w-6" />}
                            </div>
                            <h2 className="text-xl font-black tracking-tight">
                                {step === 'identify' && 'Iniciar sessão'}
                                {step === 'access' && (companyName || 'Iniciar sessão')}
                                {step === 'activation' && 'Ativação do sistema'}
                                {step === 'request' && 'Pedido de cadastro'}
                                {step === 'requestSent' && 'Pedido enviado'}
                            </h2>
                            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-300">
                                {step === 'identify' && 'Indique o NIF da sua empresa para verificarmos o registo.'}
                                {step === 'access' && 'Empresa encontrada. Introduza o Código de Acesso para ligar este navegador.'}
                                {step === 'activation' && 'Esta empresa ainda não está cadastrada no Tango Master.'}
                                {step === 'request' && 'Envie os dados da empresa. O administrador entrará em contacto.'}
                                {step === 'requestSent' && 'Recebemos o seu pedido de cadastro.'}
                            </p>
                        </div>

                        <div className="space-y-5 p-6 sm:p-8">
                            {step === 'identify' && (
                                <form onSubmit={handleIdentify} className="space-y-5">
                                    {errorBox}
                                    {nifField}
                                    <Button type="submit" disabled={isBusy || cleanNif.length < 9}
                                        className="h-12 w-full gap-2 rounded-xl bg-[#F37021] text-sm font-black text-white hover:bg-orange-600">
                                        {isBusy ? <><Loader2 className="h-5 w-5 animate-spin" /> A verificar…</> : <>Continuar <ArrowRight className="h-5 w-5" /></>}
                                    </Button>
                                    {backButton('welcome')}
                                </form>
                            )}

                            {step === 'access' && (
                                <form onSubmit={handleAccess} className="space-y-5">
                                    {errorBox}
                                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                                        <CheckCircle2 className="h-5 w-5 shrink-0" />
                                        <span>Empresa registada · NIF <strong className="font-mono">{cleanNif}</strong></span>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="gateway-code" className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400">
                                            <KeyRound className="h-3.5 w-3.5 text-[#F37021]" /> Código de Acesso da empresa
                                        </Label>
                                        <div className="relative">
                                            <Input id="gateway-code" type={showCode ? 'text' : 'password'} value={accessCode}
                                                onChange={e => { setAccessCode(e.target.value.toUpperCase()); setErrorMessage(''); }}
                                                placeholder="Ex.: TG-8492-3105" autoComplete="off" autoFocus
                                                className="h-12 rounded-xl pr-11 font-mono text-base font-bold tracking-wider text-[#F37021]" disabled={isBusy} required />
                                            <button type="button" onClick={() => setShowCode(v => !v)} tabIndex={-1}
                                                aria-label={showCode ? 'Ocultar código' : 'Mostrar código'}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                                {showCode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                            </button>
                                        </div>
                                        <p className="text-[11px] text-slate-400">Pedido apenas na primeira vez em cada navegador. Depois segue para o login com o seu utilizador.</p>
                                    </div>
                                    <Button type="submit" disabled={isBusy || accessCode.trim().length < 4}
                                        className="h-12 w-full gap-2 rounded-xl bg-[#F37021] text-sm font-black text-white hover:bg-orange-600">
                                        {isBusy ? <><Loader2 className="h-5 w-5 animate-spin" /> A validar…</> : <><ShieldCheck className="h-5 w-5" /> Validar e continuar</>}
                                    </Button>
                                    {backButton('identify')}
                                </form>
                            )}

                            {step === 'activation' && (
                                <div className="space-y-5">
                                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                                        Não encontrámos nenhuma empresa com o NIF <strong className="font-mono">{cleanNif}</strong>.
                                        Para ativar o sistema, envie o pedido de cadastro. Depois de aprovado, receberá o Código de Acesso da empresa.
                                    </div>
                                    <Button onClick={() => goTo('request')}
                                        className="h-12 w-full gap-2 rounded-xl bg-[#F37021] text-sm font-black text-white hover:bg-orange-600">
                                        <ClipboardList className="h-5 w-5" /> Pedir cadastro da empresa
                                    </Button>
                                    <Button variant="outline" onClick={() => goTo('access')} className="h-11 w-full rounded-xl text-xs font-bold">
                                        Já recebi o Código de Acesso
                                    </Button>
                                    {backButton('identify')}
                                </div>
                            )}

                            {step === 'request' && (
                                <form onSubmit={handleRequest} className="space-y-4">
                                    {errorBox}
                                    {nifField}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="req-company" className="text-xs font-bold text-slate-600 dark:text-slate-400">Nome da empresa</Label>
                                        <Input id="req-company" value={request.companyName} maxLength={200} required disabled={isBusy}
                                            onChange={e => setRequest(prev => ({ ...prev, companyName: e.target.value }))} className="h-11 rounded-xl" />
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="req-contact" className="text-xs font-bold text-slate-600 dark:text-slate-400">Pessoa de contacto</Label>
                                            <Input id="req-contact" value={request.contactName} maxLength={120} required disabled={isBusy} autoComplete="name"
                                                onChange={e => setRequest(prev => ({ ...prev, contactName: e.target.value }))} className="h-11 rounded-xl" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="req-phone" className="text-xs font-bold text-slate-600 dark:text-slate-400">Telefone</Label>
                                            <Input id="req-phone" type="tel" value={request.phone} maxLength={30} required disabled={isBusy} autoComplete="tel"
                                                placeholder="+244 9XX XXX XXX"
                                                onChange={e => setRequest(prev => ({ ...prev, phone: e.target.value }))} className="h-11 rounded-xl" />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="req-email" className="text-xs font-bold text-slate-600 dark:text-slate-400">Email (opcional)</Label>
                                        <Input id="req-email" type="email" value={request.email} maxLength={160} disabled={isBusy} autoComplete="email"
                                            onChange={e => setRequest(prev => ({ ...prev, email: e.target.value }))} className="h-11 rounded-xl" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="req-message" className="text-xs font-bold text-slate-600 dark:text-slate-400">Mensagem (opcional)</Label>
                                        <Textarea id="req-message" value={request.message} maxLength={1000} rows={3} disabled={isBusy}
                                            onChange={e => setRequest(prev => ({ ...prev, message: e.target.value }))} className="rounded-xl" />
                                    </div>
                                    <Button type="submit" disabled={isBusy || cleanNif.length < 9}
                                        className="h-12 w-full gap-2 rounded-xl bg-[#F37021] text-sm font-black text-white hover:bg-orange-600">
                                        {isBusy ? <><Loader2 className="h-5 w-5 animate-spin" /> A enviar…</> : <><Send className="h-5 w-5" /> Enviar pedido</>}
                                    </Button>
                                    {backButton('welcome')}
                                </form>
                            )}

                            {step === 'requestSent' && (
                                <div className="space-y-5 text-center">
                                    <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
                                    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                                        O administrador vai analisar o pedido da empresa com NIF <strong className="font-mono">{cleanNif}</strong> e
                                        contactá-lo com o Código de Acesso. Quando o receber, volte aqui e escolha <strong>Iniciar sessão</strong>.
                                    </p>
                                    <Button onClick={() => goTo('welcome')} className="h-11 w-full rounded-xl font-bold">Voltar ao início</Button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
