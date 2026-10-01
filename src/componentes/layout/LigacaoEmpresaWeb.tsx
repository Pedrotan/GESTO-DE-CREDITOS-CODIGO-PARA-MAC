import { useState, useEffect } from 'react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { isPublicWebBuild } from '@/bibliotecas/ambiente';
import { scopedStorageKey } from '@/bibliotecas/contas';
import { startCloudSync, stopCloudSync, syncCloudNow } from '@/servicos/ServicoSincronizacaoCloud';
import { Building2, KeyRound, Loader2, Lock, ShieldCheck, Eye, EyeOff, Sparkles, ArrowRight, ShieldAlert, CheckCircle2, Shield } from 'lucide-react';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

// Gatekeeper Obrigatório para a Versão Web (Vercel):
// O cliente DEVE introduzir o NIF da empresa e o Código de Acesso atribuído
// pelo Tango Master Gen. Sem estar previamente cadastrado no Tango Master,
// o cliente não consegue aceder nem configurar o sistema no Onboarding.

export const LigacaoEmpresaWeb = () => {
    const { hasUsers } = useAuth();
    const { companySettings, updateCompanySettings } = useData();

    // Estado da autorização da empresa no navegador
    const [isAuthorized, setIsAuthorized] = useState(() => {
        return localStorage.getItem('tango_active_tenant_authorized') === 'true';
    });

    useEffect(() => {
        const checkAuth = () => {
            setIsAuthorized(localStorage.getItem('tango_active_tenant_authorized') === 'true');
        };
        window.addEventListener('tango_tenant_authorized', checkAuth);
        window.addEventListener('storage', checkAuth);
        return () => {
            window.removeEventListener('tango_tenant_authorized', checkAuth);
            window.removeEventListener('storage', checkAuth);
        };
    }, []);

    const [nifType, setNifType] = useState<'COLECTIVO' | 'SINGULAR'>('COLECTIVO');
    const [nif, setNif] = useState(() => localStorage.getItem('tango_active_tenant_id') || '');
    const [accessCode, setAccessCode] = useState(() => localStorage.getItem('tango_active_tenant_code') || '');
    const [showCode, setShowCode] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [errorCode, setErrorCode] = useState<string | null>(null);

    // Formatação de NIF
    const formatNIF = (value: string, type: 'SINGULAR' | 'COLECTIVO') => {
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
        const val = formatNIF(e.target.value, nifType);
        setNif(val);
        setErrorMessage('');
    };

    // Submissão e Validação das Credenciais no Servidor Central
    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const cleanNif = nif.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const cleanCode = accessCode.trim().toUpperCase();

        if (!cleanNif || cleanNif.length < 5) {
            setErrorMessage('Por favor, introduza um NIF de empresa válido.');
            return;
        }
        if (!cleanCode || cleanCode.length < 4) {
            setErrorMessage('Por favor, introduza o Código de Acesso atribuído pelo Administrador no Tango Master.');
            return;
        }

        setIsConnecting(true);
        setErrorMessage('');
        setErrorCode(null);

        try {
            // Chamar endpoint de verificação do Tango Master
            const res = await fetch('/api/verify-company', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nif: cleanNif, accessCode: cleanCode }),
                signal: AbortSignal.timeout(15_000)
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data.success) {
                setErrorCode(data.code || 'UNAUTHORIZED');
                setErrorMessage(
                    data.message ||
                    'Credenciais inválidas. Confirme que a sua empresa já foi cadastrada no Tango Master Gen e verifique o código digitado.'
                );
                return;
            }

            // Acesso Aprovado!
            const verifiedTenantId = data.tenantId || cleanNif;
            const verifiedName = data.companyName || 'Empresa Licenciada';
            const verifiedPasskey = data.syncPasskey || cleanCode;

            // Gravar credenciais autorizadas no navegador
            localStorage.setItem('tango_active_tenant_authorized', 'true');
            localStorage.setItem('tango_active_tenant_id', verifiedTenantId);
            localStorage.setItem('tango_active_tenant_name', verifiedName);
            localStorage.setItem('tango_active_tenant_code', cleanCode);
            localStorage.setItem(scopedStorageKey('cloud_sync_bootstrap_v1'), 'true');

            // Atualizar definições da empresa localmente
            await updateCompanySettings({
                nif: verifiedTenantId,
                name: verifiedName,
                syncEnabled: true,
                syncUrl: window.location.origin,
                syncPasskey: verifiedPasskey
            });

            // Tentar sincronizar dados existentes da cloud
            try {
                startCloudSync({
                    url: window.location.origin,
                    apiKey: verifiedPasskey,
                    tenantId: verifiedTenantId
                });
                const syncResult = await syncCloudNow();
                stopCloudSync();

                setIsAuthorized(true);
                window.dispatchEvent(new Event('tango_tenant_authorized'));

                await Swal.fire({
                    title: 'Empresa Ativada com Sucesso!',
                    html: `Instância vinculada a <strong>${verifiedName}</strong>.<br/><br/><span style="color:#64748b;font-size:13px;">${
                        syncResult.pulled && syncResult.pulled > 0
                            ? `Foram recuperadas ${syncResult.pulled} alterações sincronizadas do sistema.`
                            : 'O acesso foi homologado. Pode agora concluir o assistente de configuração.'
                    }</span>`,
                    icon: 'success',
                    confirmButtonText: 'Configurar Sistema',
                    confirmButtonColor: '#F37021',
                    allowOutsideClick: false
                });

                if (syncResult.pulled && syncResult.pulled > 0 && hasUsers) {
                    window.location.hash = '#/entrar';
                    window.location.reload();
                } else {
                    window.location.hash = '#/onboarding';
                    window.location.reload();
                }

            } catch (syncErr) {
                console.warn('[LigacaoEmpresaWeb] Sincronização inicial pós-verificação:', syncErr);
                setIsAuthorized(true);
                window.dispatchEvent(new Event('tango_tenant_authorized'));
                window.location.hash = hasUsers ? '#/entrar' : '#/onboarding';
                window.location.reload();
            }

        } catch (err: any) {
            console.error('[LigacaoEmpresaWeb] Erro na validação com o Master:', err);
            setErrorMessage(
                err?.name === 'TimeoutError'
                    ? 'O servidor demorou muito a responder. Verifique a sua ligação à internet.'
                    : (err?.message || 'Falha de comunicação com o servidor central do Tango Master.')
            );
        } finally {
            setIsConnecting(false);
        }
    };

    // Se estiver em ambiente Electron, este gatekeeper web não se aplica
    if (!isPublicWebBuild) {
        return null;
    }

    // Se a empresa já está autorizada no navegador, o gatekeeper fecha e liberta o Onboarding / Login
    if (isAuthorized) {
        return null;
    }

    // Se for a rota do Tango Master, não bloquear
    if (typeof window !== 'undefined' && window.location.hash.includes('tango-master')) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950 bg-gradient-to-br from-slate-950 via-slate-900 to-[#0A1128] p-4 font-sans select-none">
            {/* Background Decorativo Exclusivo da Tela de Ativação */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#F37021]/15 rounded-full blur-[140px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/15 rounded-full blur-[140px]" />
            </div>

            <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-700/80 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-200">
                {/* Cabeçalho Visual Corporativo */}
                <div className="bg-[#2B2D2F] p-6 text-white text-center relative border-b-4 border-[#F37021]">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F37021] text-white shadow-lg shadow-orange-500/30">
                        <Building2 className="h-7 w-7" />
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-[11px] font-bold text-orange-300 uppercase tracking-wider mb-2">
                        <Shield className="h-3.5 w-3.5 text-[#F37021]" /> Ativação Obrigatória • Tango Master
                    </div>
                    <h2 className="text-xl font-black tracking-tight text-white">
                        Acesso Empresarial Tango ERP
                    </h2>
                    <p className="mt-1 text-xs text-slate-300 max-w-sm mx-auto">
                        Introduza as credenciais da sua empresa atribuídas pelo Administrador no <strong>Tango Master Gen</strong> para desbloquear o sistema.
                    </p>
                </div>

                {/* Formulário de Validação de Credenciais */}
                <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
                    {/* Alerta de Erro */}
                    {errorMessage && (
                        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                            <div>
                                <p className="font-bold text-sm">Acesso Não Autorizado</p>
                                <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
                                {errorCode === 'NOT_REGISTERED' && (
                                    <p className="mt-2 text-[11px] text-red-700 dark:text-red-400 font-bold bg-white/60 dark:bg-red-900/40 p-2 rounded-lg">
                                        💡 A sua empresa ainda não foi registada no aplicativo Tango Master. Contacte o administrador do sistema para realizar o cadastro prévio.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Alternador Coletivo / Singular */}
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                            Tipo de Contribuinte
                        </Label>
                        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                            <button
                                type="button"
                                onClick={() => { setNifType('COLECTIVO'); setNif(''); }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                    nifType === 'COLECTIVO' ? 'bg-white dark:bg-slate-700 text-[#F37021] shadow-sm' : 'text-slate-500'
                                }`}
                            >
                                Empresa (NIF)
                            </button>
                            <button
                                type="button"
                                onClick={() => { setNifType('SINGULAR'); setNif(''); }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                    nifType === 'SINGULAR' ? 'bg-white dark:bg-slate-700 text-[#F37021] shadow-sm' : 'text-slate-500'
                                }`}
                            >
                                Particular (BI)
                            </button>
                        </div>
                    </div>

                    {/* Campo 1: NIF da Empresa */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-[#F37021]" /> NIF da Empresa Cadastrada *
                        </Label>
                        <Input
                            value={nif}
                            onChange={handleNifChange}
                            placeholder={nifType === 'COLECTIVO' ? 'Ex.: 5417000000' : 'Ex.: 000000000LA000'}
                            className="h-12 rounded-xl font-mono text-base font-bold uppercase tracking-wider"
                            disabled={isConnecting}
                            required
                        />
                        <p className="text-[11px] text-slate-400">
                            Deve coincidir com o NIF cadastrado no Tango Master.
                        </p>
                    </div>

                    {/* Campo 2: Código de Acesso */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                            <KeyRound className="h-3.5 w-3.5 text-[#F37021]" /> Código de Acesso / Ativação *
                        </Label>
                        <div className="relative">
                            <Input
                                type={showCode ? 'text' : 'password'}
                                value={accessCode}
                                onChange={(e) => { setAccessCode(e.target.value.toUpperCase()); setErrorMessage(''); }}
                                placeholder="Ex.: TG-8492-3105"
                                className="h-12 rounded-xl pr-11 font-mono text-base font-bold tracking-wider text-[#F37021]"
                                disabled={isConnecting}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowCode(!showCode)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                tabIndex={-1}
                            >
                                {showCode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                        </div>
                        <p className="text-[11px] text-slate-400">
                            Código fornecido na credencial de homologação da sua empresa.
                        </p>
                    </div>

                    {/* Botão de Validação */}
                    <Button
                        type="submit"
                        disabled={isConnecting || !nif.trim() || !accessCode.trim()}
                        className="w-full h-12 bg-[#F37021] hover:bg-orange-600 text-white font-black text-sm rounded-xl gap-2 shadow-lg shadow-orange-500/25 transition-all hover:scale-[1.01]"
                    >
                        {isConnecting ? (
                            <>
                                <Loader2 className="h-5 w-5 animate-spin" />
                                A Validar com o Tango Master...
                            </>
                        ) : (
                            <>
                                <ShieldCheck className="h-5 w-5" />
                                Validar e Aceder ao Sistema
                            </>
                        )}
                    </Button>

                    <div className="pt-2 text-center text-xs text-slate-500 dark:text-slate-400">
                        <p>
                            Não possui credenciais de acesso?{' '}
                            <span className="font-bold text-slate-700 dark:text-slate-200">
                                Solicite o cadastro da sua empresa ao Administrador do Tango Master.
                            </span>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
};
