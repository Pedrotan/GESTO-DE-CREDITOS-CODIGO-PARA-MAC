import React, { useState } from 'react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { Building2, ArrowRight, ShieldCheck, UserCog, Lock, Loader2, CheckCircle, ShieldAlert, Sparkles, CircleCheck, Eye, EyeOff, Laptop, Globe, Wifi, Database, Search, X } from 'lucide-react';
import { Checkbox } from '@/componentes/ui/checkbox';
import { AlertModal, AlertModalType } from '@/componentes/ui/AlertModal';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import { PasswordStrengthIndicator } from '@/componentes/ui/PasswordStrengthIndicator';
import { validatePasswordStrength } from '@/bibliotecas/password-validator';
import { db } from '@/bibliotecas/bd';
import { cn } from '@/bibliotecas/utils';
import { appAdapter } from '@/bibliotecas/adaptador-aplicacao';
import { ServicoAngolaAPI } from '@/servicos/ServicoAngolaAPI';
import { getActiveAccountIdFromStorage, removeScopedLocalStorageItem, scopedStorageKey, deleteAppAccount, listAppAccounts, switchAppAccount } from '@/bibliotecas/contas';
import { isPublicWebBuild } from '@/bibliotecas/ambiente';
import { CLOUD_SYNC_BOOTSTRAP_KEY, startCloudSync, stopCloudSync, syncCloudNow } from '@/servicos/ServicoSincronizacaoCloud';
import { isCompanyActiveLocally, submitOnboardingCentral } from '@/servicos/ServicoIdentidadeEmpresa';
export const OnboardingWizard = ({ forceShow = false }: { forceShow?: boolean } = {}) => {
    const activeAccountId = getActiveAccountIdFromStorage();
    const isSecondaryAccount = activeAccountId !== 'default';
    const { companySettings, updateCompanySettings } = useData();
    const { user, updateUser, users, hasUsers, addUser, syncUsersFromMaster } = useAuth();
    const [step, setStep] = useState(isSecondaryAccount ? 4 : (isPublicWebBuild ? 2 : 1));
    const [dismissed, setDismissed] = useState(false);
    // Enquanto a configuração termina, o assistente fica visível (mesmo depois de criado o administrador)
    // até a pessoa confirmar em "Entrar no Sistema".
    const [isFinishing, setIsFinishing] = useState(false);
    const [tenantAuthorized, setTenantAuthorized] = useState(() => {
        return !isPublicWebBuild || localStorage.getItem('tango_active_tenant_authorized') === 'true';
    });

    React.useEffect(() => {
        const handleAuthUpdate = () => {
            setTenantAuthorized(!isPublicWebBuild || localStorage.getItem('tango_active_tenant_authorized') === 'true');
        };
        window.addEventListener('tango_tenant_authorized', handleAuthUpdate);
        window.addEventListener('storage', handleAuthUpdate);
        return () => {
            window.removeEventListener('tango_tenant_authorized', handleAuthUpdate);
            window.removeEventListener('storage', handleAuthUpdate);
        };
    }, []);
    const [onboardingMode, setOnboardingMode] = useState<'standard' | 'connect'>('standard');
    const [serverIp, setServerIp] = useState('');
    const [syncPasskey, setSyncPasskey] = useState('');
    const [cloudTenant, setCloudTenant] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [localNetwork, setLocalNetwork] = useState<{ ip: string; isPrivate: boolean; hostname: string } | null>(null);
    const [isSearchingNIF, setIsSearchingNIF] = useState(false);

    // Form States
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [companyName, setCompanyName] = useState(() => localStorage.getItem('tango_active_tenant_name') || '');
    const [nifType, setNifType] = useState<'SINGULAR' | 'COLECTIVO'>('COLECTIVO');
    const [nif, setNif] = useState(() => localStorage.getItem('tango_active_tenant_id') || '');
    const [enableMultiTenant, setEnableMultiTenant] = useState(false);

    const formatNIF = (value: string, type: 'SINGULAR' | 'COLECTIVO') => {
        const cleanValue = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

        if (type === 'COLECTIVO') {
            // 10 digits
            return cleanValue.slice(0, 10).replace(/[^0-9]/g, '');
        } else {
            // SINGULAR (BI): 000000000AA000 (14 chars)
            // 9 digits + 2 letters + 3 digits
            let formatted = '';
            for (let i = 0; i < cleanValue.length && i < 14; i++) {
                const char = cleanValue[i];
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
        const formatted = formatNIF(e.target.value, nifType);
        setNif(formatted);
    };

    const handleNifTypeChange = (type: 'SINGULAR' | 'COLECTIVO') => {
        setNifType(type);
        setNif(''); // Clear NIF when type changes to avoid invalid formats
    };

    const handleSearchNIF = async () => {
        if (!nif || nif.length < 9) return;

        setIsSearchingNIF(true);
        try {
            console.log(`🚀 [Onboarding] Pesquisando ${nifType}: ${nif}`);
            const data = await ServicoAngolaAPI.fetchBIData(nif, nifType);

            if (data && data.success && data.name) {
                setCompanyName(data.name);
                setAlertConfig({
                    isOpen: true,
                    title: "Dados Encontrados!",
                    description: `Identidade: <strong>"${data.name}"</strong><br/><span style="color:#64748b;font-size:13px;display:block;margin-top:8px;">Recuperada com sucesso via ${data.source || 'Base de Dados Nacional'}.</span>`,
                    type: "success"
                });
            } else {
                setAlertConfig({
                    isOpen: true,
                    title: nifType === 'COLECTIVO' ? "NIF não encontrado" : "BI não encontrado",
                    description: data?.message || "Não foi possível encontrar os dados para este número. Verifique se está correto.",
                    type: "warning"
                });
            }
        } catch (error) {
            console.error("Erro na busca de NIF do Onboarding:", error);
            setAlertConfig({
                isOpen: true,
                title: "Erro na Pesquisa",
                description: "Ocorreu uma falha ao ligar aos serviços de validação.",
                type: "error"
            });
        } finally {
            setIsSearchingNIF(false);
        }
    };

    const [adminBI, setAdminBI] = useState('');
    const [adminName, setAdminName] = useState('');
    const [isAdminSearchingBI, setIsAdminSearchingBI] = useState(false);
    const [adminEmail, setAdminEmail] = useState('');
    const [adminUsername, setAdminUsername] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [stayVisible, setStayVisible] = useState(false);
    const [showAdminPassword, setShowAdminPassword] = useState(false);
    const [showAdminConfirmPassword, setShowAdminConfirmPassword] = useState(false);

    React.useEffect(() => {
        if (step === 1.5) {
            appAdapter.getNetworkInfo().then(setLocalNetwork);
        }
    }, [step]);

    const handleSearchAdminBI = async () => {
        if (!adminBI || adminBI.length < 9) return;

        setIsAdminSearchingBI(true);
        try {
            console.log(`🚀 [Onboarding] Pesquisando Admin BI: ${adminBI}`);
            const data = await ServicoAngolaAPI.fetchBIData(adminBI, 'SINGULAR');

            if (data && data.success && data.name) {
                setAdminName(data.name);
                setAlertConfig({
                    isOpen: true,
                    title: "Titular Encontrado!",
                    description: `Nome Oficial: <strong>"${data.name}"</strong><br/><span style="color:#64748b;font-size:13px;display:block;margin-top:8px;">Identificação validada nos registos oficiais angolanos.</span>`,
                    type: "success"
                });
            } else {
                setAlertConfig({
                    isOpen: true,
                    title: "BI não encontrado",
                    description: "Não foi possível encontrar os dados para este BI. Verifique se o número está correto.",
                    type: "warning"
                });
            }
        } catch (error) {
            console.error("Erro na busca de BI do Admin:", error);
            setAlertConfig({
                isOpen: true,
                title: "Erro na Pesquisa",
                description: "Falha ao validar o BI do administrador.",
                type: "error"
            });
        } finally {
            setIsAdminSearchingBI(false);
        }
    };

    // Ligação a um servidor CLOUD (Vercel): valida a chave da empresa na API
    // central e descarrega todos os dados do tenant antes do primeiro login.
    const handleConnectToCloud = async (url: string) => {
        try {
            setIsConnecting(true);
            const tenant = cloudTenant.trim();
            const key = syncPasskey.trim();
            if (!tenant) throw new Error('Indique o NIF da empresa para a ligação cloud.');
            if (key.length < 8) throw new Error('A chave de sincronização deve ter pelo menos 8 caracteres.');

            const baseUrl = url.replace(/\/+$/, '');
            // Este dispositivo é um recetor puro no arranque: não enviar a base local vazia para a cloud.
            localStorage.setItem(scopedStorageKey(CLOUD_SYNC_BOOTSTRAP_KEY), 'true');
            startCloudSync({ url: baseUrl, apiKey: key, tenantId: tenant });
            const result = await syncCloudNow();
            stopCloudSync();

            if (!result.success) throw new Error(result.message || 'Chave inválida ou servidor indisponível.');
            if (!result.pulled) throw new Error('Nenhum dado encontrado para esta empresa. Confirme o NIF e se o computador principal já sincronizou.');

            await updateCompanySettings({
                nif: tenant,
                syncEnabled: true,
                syncUrl: baseUrl,
                syncPasskey: key
            });

            setIsConnecting(false);

            await Swal.fire({
                title: 'Ligação Cloud Bem-sucedida!',
                html: `Foram descarregadas <strong>${result.pulled}</strong> alterações da empresa.<br/><br/><span style="color: #64748b; font-size: 13px;">Este computador está pronto para iniciar sessão.</span>`,
                icon: 'success',
                confirmButtonText: 'Entrar no Sistema',
                confirmButtonColor: '#2563eb',
                allowOutsideClick: false,
                allowEscapeKey: false,
                customClass: {
                    popup: 'tango-swal-popup rounded-3xl p-6 shadow-2xl font-sans',
                    title: 'text-2xl font-bold tracking-tight text-slate-900',
                    htmlContainer: 'text-sm sm:text-base text-slate-600 leading-relaxed font-normal',
                    confirmButton: 'px-6 py-3 rounded-xl font-bold text-white shadow-md text-sm sm:text-base transition-all hover:scale-105'
                }
            });

            localStorage.setItem(ONBOARDING_KEY, 'true');
            setDismissed(true);
            window.location.hash = '#/entrar';
            window.location.reload();
        } catch (error: any) {
            console.error('[ONBOARDING][Cloud] Falha na ligação:', error);
            setIsConnecting(false);
            await Swal.fire({
                title: 'Falha na Ligação Cloud',
                html: error?.message || 'Não foi possível ligar ao servidor cloud.',
                icon: 'error',
                confirmButtonText: 'OK',
                confirmButtonColor: '#e11d48',
                customClass: {
                    popup: 'tango-swal-popup rounded-3xl p-6 shadow-2xl font-sans',
                    title: 'text-2xl font-bold tracking-tight text-slate-900',
                    htmlContainer: 'text-sm sm:text-base text-slate-600 leading-relaxed font-normal',
                    confirmButton: 'px-6 py-3 rounded-xl font-bold text-white shadow-md text-sm sm:text-base'
                }
            });
        } finally {
            setIsConnecting(false);
        }
    };

    const handleConnectToServer = async () => {
        // URLs https são tratadas como servidor cloud (Vercel), não LAN
        if (/^https:\/\//i.test(serverIp.trim())) {
            await handleConnectToCloud(serverIp.trim());
            return;
        }
        try {
            setIsConnecting(true);
            let inputUrl = serverIp.trim();
            if (!inputUrl.startsWith('http')) inputUrl = `http://${inputUrl}`;

            // Extrair apenas o host e porta, ignorando qualquer caminho (/sync, /ping, etc)
            let baseUrl = "";
            try {
                const urlObj = new URL(inputUrl);
                const host = urlObj.hostname;
                const port = urlObj.port || "3000";
                baseUrl = `http://${host}:${port}`;
            } catch (e) {
                // Fallback simples se URL falhar no parse
                const parts = inputUrl.split('/');
                const base = parts[2] || parts[0];
                baseUrl = base.includes(':') ? `http://${base}` : `http://${base}:3000`;
            }

            const fetchUrl = `${baseUrl}/fetch-config`;
            const syncUrl = `${baseUrl}/sync`;

            // Use Adapter instead of direct IPC
            const res = await appAdapter.fetchServerConfig(fetchUrl, syncPasskey);

            if (!res.success) {
                throw new Error(res.message || "Servidor não detetado ou chave inválida.");
            }

            const { data } = res;
            if (data.success) {
                // 1. Atualizar Configurações da Empresa
                await updateCompanySettings({
                    ...data.settings,
                    syncEnabled: true,
                    syncUrl: syncUrl,
                    syncPasskey: syncPasskey
                });

                // 2. Importar Utilizadores (Full Sync)
                try {
                    await syncUsersFromMaster(syncUrl, syncPasskey);
                } catch (e) {
                    console.error("Aviso: Falha ao sincronizar utilizadores durante onboarding:", e);
                }

                setIsConnecting(false);

                await Swal.fire({
                    title: "Ligação Bem-sucedida!",
                    html: `Computador conectado a <strong>"${data.settings.name}"</strong>.<br/><br/><span style="color: #64748b; font-size: 13px;">Todos os dados de acesso e empresa foram descarregados.</span>`,
                    icon: "success",
                    confirmButtonText: "Entrar no Sistema",
                    confirmButtonColor: "#2563eb",
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    customClass: {
                        popup: 'tango-swal-popup rounded-3xl p-6 shadow-2xl font-sans',
                        title: 'text-2xl font-bold tracking-tight text-slate-900',
                        htmlContainer: 'text-sm sm:text-base text-slate-600 leading-relaxed font-normal',
                        confirmButton: 'px-6 py-3 rounded-xl font-bold text-white shadow-md text-sm sm:text-base transition-all hover:scale-105'
                    }
                });

                localStorage.setItem(ONBOARDING_KEY, 'true');
                setDismissed(true);
                window.location.hash = '#/entrar';
                window.location.reload();
            }
        } catch (error: any) {
            console.error("Erro de conetividade:", error);

            let technicalDetail = error.message || String(error);
            let diagnosticMsg = technicalDetail;

            if (technicalDetail.includes('fetch') || technicalDetail.includes('NetworkError')) {
                diagnosticMsg = "Erro de Rede (Fetch): O computador não conseguiu contactar o servidor. Verifique o IP e o Firewall.";
            } else if (technicalDetail.includes('refused')) {
                diagnosticMsg = "Ligação Recusada: O IP respondeu, mas o servidor da App não está a correr no Master.";
            } else if (technicalDetail.includes('Timeout') || technicalDetail.includes('timeout')) {
                diagnosticMsg = "Tempo de Ligação Esgotado: O servidor demorou muito a responder. Verifique se estão no mesmo Wi-Fi.";
            }

            setIsConnecting(false);

            await Swal.fire({
                title: "Falha na Ligação",
                html: diagnosticMsg,
                icon: "error",
                confirmButtonText: "OK",
                confirmButtonColor: "#e11d48",
                customClass: {
                    popup: 'tango-swal-popup rounded-3xl p-6 shadow-2xl font-sans',
                    title: 'text-2xl font-bold tracking-tight text-slate-900',
                    htmlContainer: 'text-sm sm:text-base text-slate-600 leading-relaxed font-normal',
                    confirmButton: 'px-6 py-3 rounded-xl font-bold text-white shadow-md text-sm sm:text-base'
                }
            });

            console.log(`[ONBOARDING] Falha ao ligar a ${serverIp}. Detalhe: ${technicalDetail}`);
        } finally {
            setIsConnecting(false);
        }
    };

    // Alert Modal State
    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        type: AlertModalType;
        actionLabel?: string;
        onConfirm?: () => void;
    }>({
        isOpen: false,
        title: '',
        description: '',
        type: 'success'
    });

    const isPackaged = (window as any).electronAPI?.isPackaged;
    const IS_DEV = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const ONBOARDING_KEY = scopedStorageKey(IS_DEV ? 'tango_erp_onboarding_dev_v3' : 'tango_erp_onboarding_v3');
    const CURRENT_APP_VERSION = '3.0.2'; // UPDATE THIS TO FORCE RE-ONBOARDING

    // Check version and record current version
    React.useEffect(() => {
        const storedVersion = localStorage.getItem('last_app_version');
        if (!storedVersion) {
            localStorage.setItem('last_app_version', CURRENT_APP_VERSION);
        }
    }, []);

    // Validação de conclusão real do Onboarding
    const hasConfiguredCompany = Boolean(
        companySettings?.name &&
        companySettings.name !== 'A Carregar...' &&
        companySettings.name !== 'Iniciando Sistema...' &&
        companySettings.name !== 'Empresa' &&
        companySettings.name !== 'Provisório' &&
        companySettings.name.trim() !== ''
    );

    // Se a empresa já se encontra registada e com status ACTIVE no servidor central, bloquear onboarding
    const isCompanyActive = isCompanyActiveLocally();
    if (isCompanyActive) {
        return null;
    }

    const isFullySetup = Boolean(localStorage.getItem(ONBOARDING_KEY) || (hasUsers && hasConfiguredCompany));

    const isTangoMaster = typeof window !== 'undefined' && window.location.hash.includes('tango-master');
    const isOnboardingRoute = typeof window !== 'undefined' && window.location.hash.includes('onboarding');
    const isWebTenantAuthorized = !isPublicWebBuild || localStorage.getItem('tango_active_tenant_authorized') === 'true';
    const showOnboarding = !dismissed && isWebTenantAuthorized && (isFinishing || forceShow || (!isFullySetup && !isTangoMaster) || (isOnboardingRoute && !localStorage.getItem(ONBOARDING_KEY)));
    const visibleSteps = isSecondaryAccount ? [4, 6, 7] : (isPublicWebBuild ? [2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7]);

    if (!showOnboarding) {
        return null;
    }

    const handleNext = async () => {
        if (step === 1) {
            setStep(2);
        } else if (step === 2) {
            setStep(3);
        } else if (step === 3) {
            if (!acceptedTerms) return;
            setStep(4);
        } else if (step === 4) {
            if (!companyName.trim()) return;
            if (isSecondaryAccount) {
                setStep(6);
            } else {
                setStep(5);
            }
        } else if (step === 5) {
            setStep(6);
        } else if (step === 6) {
            // Validations
            if (!adminEmail.trim() || !adminEmail.includes('@')) {
                setAlertConfig({
                    isOpen: true,
                    title: "Email Inválido",
                    description: "Por favor, insira um endereço de email válido para o administrador.",
                    type: "warning"
                });
                return;
            }

            // Validate password strength
            const passwordStrength = validatePasswordStrength(adminPassword);
            if (passwordStrength.score < 60) {
                setAlertConfig({
                    isOpen: true,
                    title: "Senha Fraca",
                    description: "A senha deve ter pelo menos 8 caracteres, incluindo maiúsculas, minúsculas, números e caracteres especiais.",
                    type: "warning"
                });
                return;
            }

            if (adminPassword !== adminConfirmPassword) {
                setAlertConfig({
                    isOpen: true,
                    title: "Senhas Diferentes",
                    description: "A confirmação da senha não coincide com a senha digitada.",
                    type: "warning"
                });
                return;
            }
            setStep(7);
        }
    };

    const handleComplete = async () => {
        try {
            setIsFinishing(true);
            setIsLoading(true);

            // Validação estrita no servidor central Tango Master Gen antes de persistir
            try {
                await submitOnboardingCentral({
                    nif: nif || companySettings.nif,
                    companyName,
                    contactName: adminName || adminUsername || 'Administrador',
                    phone: companySettings.phone || '',
                    email: adminEmail,
                    message: 'Submissão de onboarding ERP'
                });
            } catch (centralErr: any) {
                if (centralErr.code === 'EMPRESA_JA_ATIVA' || centralErr.status === 409) {
                    setIsLoading(false);
                    setIsFinishing(false);
                    await Swal.fire({
                        title: "Empresa Já Ativa",
                        html: `Esta empresa já se encontra registada e com estado ACTIVE no Tango Master Gen.<br/><br/><span style="color:#64748b;font-size:13px;">O registo inicial está bloqueado. Redirecionando para o Login...</span>`,
                        icon: "warning",
                        confirmButtonText: "Ir para o Login",
                        confirmButtonColor: "#2563eb",
                        allowOutsideClick: false
                    });
                    localStorage.setItem('tango_company_status', 'ACTIVE');
                    setDismissed(true);
                    window.location.hash = '#/entrar';
                    window.location.reload();
                    return;
                }
                console.warn('[OnboardingWizard] Submissão central:', centralErr);
            }

            // Licenças, incluindo demonstrações, são sempre emitidas e assinadas pelo Tango Master.
            const finalLicenseKey = companySettings.licenseKey;

            // Save Company Settings (Single Call with Timeout Protection)
            const saveSettingsPromise = updateCompanySettings({
                ...companySettings,
                name: companyName,
                nif: nif || companySettings.nif,
                enableMultiTenant: isSecondaryAccount ? true : enableMultiTenant,
                installDate: new Date().toISOString(),
                licenseKey: finalLicenseKey
            });

            // Timeout após 65 segundos (para coincidir e exceder o timeout de 60s do backend)
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Timeout ao salvar definições. A base de dados pode estar bloqueada ou lenta.")), 65000)
            );

            await Promise.race([saveSettingsPromise, timeoutPromise]);

            // Wait for database persistence stability
            await new Promise(resolve => setTimeout(resolve, 500));

            // Update Super Admin Credentials
            let targetAdminId = user?.id;

            console.log('🔍 Onboarding: Procurando admin existente...');
            console.log('   - user?.id:', user?.id);
            console.log('   - users array length:', users.length);

            if (!targetAdminId) {
                // Find existing super admin to takeover (including dev emergency admin)
                const existingAdmin = users.find(u => u.role === 'super_admin') ||
                    users.find(u => u.email === 'admin@dev.local') ||
                    users.find(u => u.id === 'dev-admin-emergency');
                if (existingAdmin) {
                    targetAdminId = existingAdmin.id;
                    console.log('   Admin existente encontrado:', existingAdmin.email, '(ID:', targetAdminId, ')');
                } else {
                    console.log('    Nenhum admin existente encontrado');
                }
            }

            if (targetAdminId) {
                console.log(' Atualizando admin existente (ID:', targetAdminId, ')');
                const usernameValue = adminUsername.trim();
                await updateUser(targetAdminId, {
                    email: adminEmail.trim().toLowerCase(),
                    username: usernameValue ? usernameValue.toLowerCase() : undefined,
                    password: adminPassword,
                    name: adminName || adminUsername || 'Administrador'
                }, true); // true = isInitialCreation (não criar notificação)
                console.log(' Admin atualizado com sucesso!');
            } else {
                // FALLBACK: Create user if not found
                console.log('Criando novo admin...');
                const usernameValue = adminUsername.trim();
                await addUser({
                    name: adminName || adminUsername || 'Administrador',
                    email: adminEmail.trim().toLowerCase(),
                    username: usernameValue ? usernameValue.toLowerCase() : undefined,
                    password: adminPassword,
                    role: 'super_admin',
                    avatar: (adminUsername || 'AD').substring(0, 2).toUpperCase()
                });
                console.log(' Novo admin criado com sucesso!');
            }

            setIsLoading(false);

            // Disparar SweetAlert2 e aguardar a confirmação do utilizador
            await Swal.fire({
                title: "Configuração Concluída!",
                html: `As definições da empresa <strong>"${companyName}"</strong> foram guardadas com sucesso.<br/><br/><span style="color: #64748b; font-size: 13px;">O sistema está pronto a ser utilizado. Clique no botão abaixo para iniciar sessão.</span>`,
                icon: "success",
                confirmButtonText: "Entrar no Sistema",
                confirmButtonColor: "#2563eb",
                allowOutsideClick: false,
                allowEscapeKey: false,
                customClass: {
                    popup: 'tango-swal-popup rounded-3xl p-6 shadow-2xl font-sans',
                    title: 'text-2xl font-bold tracking-tight text-slate-900',
                    htmlContainer: 'text-sm sm:text-base text-slate-600 leading-relaxed font-normal',
                    confirmButton: 'px-6 py-3 rounded-xl font-bold text-white shadow-md text-sm sm:text-base transition-all hover:scale-105'
                }
            });

            // Concluir e redirecionar para o ecrã de login
            if (isPublicWebBuild) {
                try {
                    await syncCloudNow();
                } catch (syncErr) {
                    console.warn('[Onboarding] Sincronização inicial cloud:', syncErr);
                }
            }
            localStorage.setItem(ONBOARDING_KEY, 'true');
            localStorage.setItem('last_app_version', CURRENT_APP_VERSION);
            setDismissed(true);
            window.location.hash = '#/entrar';
            window.location.reload();
        } catch (error) {
            console.error("Erro ao finalizar configuração:", error);
            setIsLoading(false);
            setIsFinishing(false);
            await Swal.fire({
                title: "Ocorreu um Erro",
                html: error instanceof Error ? error.message : String(error),
                icon: "error",
                confirmButtonText: "OK",
                confirmButtonColor: "#e11d48",
                customClass: {
                    popup: 'tango-swal-popup rounded-3xl p-6 shadow-2xl font-sans',
                    title: 'text-2xl font-bold tracking-tight text-slate-900',
                    htmlContainer: 'text-sm sm:text-base text-slate-600 leading-relaxed font-normal',
                    confirmButton: 'px-6 py-3 rounded-xl font-bold text-white shadow-md text-sm sm:text-base'
                }
            });
        }
    };

    const isStillLoading = companySettings.name === 'Iniciando Sistema...' || companySettings.name === 'A Carregar...';
    const isReallyMissing = isFullySetup && !companySettings.name;

    // Gatekeeper Web: Se não for previamente autorizado pelo Tango Master Gen, o Onboarding não pode renderizar nada!
    if (!tenantAuthorized) {
        return null;
    }

    // As consultas protegidas só podem carregar os dados após o início de sessão.
    if (isFullySetup && isStillLoading && user) {
        return (
            <div className="fixed inset-0 z-[100] bg-slate-50/90 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in transition-all">
                <div className="flex flex-col items-center gap-4 max-w-xs text-center">
                    <div className="relative w-16 h-16">
                        <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                        <div className="absolute inset-0 border-t-4 border-primary rounded-full animate-spin"></div>
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-lg font-bold text-slate-800">A carregar dados da empresa</h3>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed">
                            A sessão foi iniciada. Aguarde enquanto preparamos os dados da empresa.
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.location.reload()}
                        className="mt-4 text-xs text-primary underline underline-offset-4"
                    >
                        Recarregar aplicação
                    </Button>
                </div>
            </div>
        );
    }

    // Se já foi concluído e as definições REALMENTE faltam (não é apenas loading)
    if (isFullySetup && isReallyMissing && user) {
        return (
            <div className="fixed inset-0 z-[50] bg-background flex flex-col items-center justify-center p-4 text-center animate-in fade-in">
                <div className="max-w-md space-y-4">
                    <div className="p-4 bg-amber-50 rounded-full w-fit mx-auto mb-2">
                        <Database className="h-8 w-8 text-amber-600" />
                    </div>
                    <h2 className="text-2xl font-bold">Configuração Inconsistente</h2>
                    <p className="text-muted-foreground">
                        O sistema detetou que o onboarding já foi realizado, mas as configurações da empresa não foram carregadas corretamente da base de dados.
                    </p>
                    <div className="p-4 border rounded-xl bg-card text-left text-xs font-mono text-muted-foreground mb-4">
                        <p>Status: Onboarding=OK, Settings=MISSING</p>
                        <p>Possíveis causas:</p>
                        <ul className="list-disc pl-4 mt-1 space-y-1">
                            <li>Base de dados corrompida ou inacessível</li>
                            <li>Falha na leitura inicial (Timeout)</li>
                            <li>Ficheiro de configurações apagado</li>
                        </ul>
                    </div>
                    <div className="space-y-3">
                        <Button
                            onClick={() => window.location.reload()}
                            className="w-full h-12 font-bold shadow-lg"
                        >
                            Tentar Novamente (Recarregar)
                        </Button>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    localStorage.removeItem(ONBOARDING_KEY);
                                    removeScopedLocalStorageItem('sync_url');
                                    removeScopedLocalStorageItem('sync_passkey');
                                    setOnboardingMode('connect');
                                    setStep(1.5);
                                    setStayVisible(true);
                                }}
                                className="w-full text-xs font-semibold h-10 border-blue-200 hover:bg-blue-50 text-blue-700"
                            >
                                Reconfigurar IP
                            </Button>

                            <Button
                                variant="outline"
                                onClick={() => {
                                    if (confirm("Isto irá reiniciar o assistente de configuração, mas manterá os dados dos seus clientes. Deseja continuar?")) {
                                        localStorage.removeItem(ONBOARDING_KEY);
                                        localStorage.removeItem('tango_welcome_seen');
                                        window.location.reload();
                                    }
                                }}
                                className="w-full text-xs font-semibold h-10"
                            >
                                Reiniciar Tudo
                            </Button>
                        </div>

                        <Button
                            variant="destructive"
                            onClick={async () => {
                                if (confirm("Isto irá tentar reparar a base de dados criando as configurações em falta. Os seus dados (clientes, créditos) serão preservados. Continuar?")) {
                                    try {
                                        console.log('🔧 [OnboardingWizard] Tentando reparar base de dados...');

                                        // Force create company_settings with minimal data
                                        await db.run(`
                                            INSERT OR REPLACE INTO company_settings (
                                                id, name, nif, currency, sessionTimeout, installDate
                                            ) VALUES (1, ?, ?, ?, ?, ?)
                                        `, ['Empresa', '', 'AOA', 20, new Date().toISOString()]);

                                        console.log('✅ [OnboardingWizard] Base de dados reparada!');
                                        alert('Base de dados reparada com sucesso! A aplicação irá recarregar.');

                                        // Clear onboarding flag to force reconfiguration
                                        localStorage.removeItem(ONBOARDING_KEY);
                                        window.location.reload();
                                    } catch (error) {
                                        console.error('❌ [OnboardingWizard] Falha ao reparar:', error);
                                        alert(`Falha ao reparar a base de dados: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
                                    }
                                }
                            }}
                            className="w-full h-12 font-bold bg-orange-600 hover:bg-orange-700"
                        >
                            🔧 Forçar Reparação da Base de Dados
                        </Button>

                        <Button
                            variant="ghost"
                            onClick={async () => {
                                if (confirm("⚠️ AVISO CRÍTICO: Isto irá APAGAR PERMANENTEMENTE toda a base de dados (clientes, créditos, pagamentos). Esta ação não pode ser desfeita. Tem a certeza absoluta?")) {
                                    try {
                                        (window as any).electronAPI?.dbNuclearReset();
                                    } catch (e) {
                                        alert("Não foi possível apagar a base de dados via App.");
                                    }
                                }
                            }}
                            className="w-full text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                            Reset Total (PERIGO)
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (!showOnboarding) return null;

    return (
        <div className={cn(
            "fixed inset-0 flex items-center justify-center overflow-y-auto p-3 sm:p-5",
            isSecondaryAccount 
                ? "z-[9999] bg-slate-950/70 backdrop-blur-md" 
                : "z-[9999] bg-slate-950 bg-gradient-to-br from-slate-950 via-slate-900 to-[#0A1128]"
        )}>
            {/* Background Effects */}
            {!isSecondaryAccount && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[140px]" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/15 rounded-full blur-[140px]" />
                </div>
            )}

            <div className={cn(
                "relative w-full bg-background border border-border/80 shadow-2xl rounded-3xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300 my-auto",
                isSecondaryAccount ? "max-w-[960px] max-h-[92vh]" : "max-w-[740px] max-h-[92vh]"
            )}>
                {/* Header Container */}
                <div className={cn(
                    "bg-primary text-primary-foreground relative overflow-hidden shrink-0",
                    isSecondaryAccount ? "p-4 sm:p-5" : "p-5 sm:p-6"
                )}>
                    <div className="absolute right-0 top-0 opacity-10 p-4">
                        <Sparkles className="h-32 w-32" />
                    </div>

                    {/* Close button for secondary account modal */}
                    {isSecondaryAccount && (
                        <button
                            onClick={async () => {
                                try {
                                    setIsLoading(true);
                                    // Deletar a subconta atual e voltar para a default
                                    const registry = await listAppAccounts();
                                    const activeAccount = registry.accounts.find(account => account.id === activeAccountId);
                                    await deleteAppAccount(activeAccountId, activeAccount?.name || '', true);
                                } catch (error) {
                                    console.error("Erro ao cancelar criação de conta secundária:", error);
                                    // Em caso de erro, apenas forçar a volta à conta principal
                                    await switchAppAccount('default');
                                } finally {
                                    setIsLoading(false);
                                }
                            }}
                            className="absolute right-3 top-3 z-20 p-2 rounded-xl bg-white/10 hover:bg-white/25 backdrop-blur-sm text-white/80 hover:text-white transition-all duration-200 hover:scale-105 active:scale-95"
                            title="Fechar"
                            disabled={isLoading}
                        >
                            <X className="h-5 w-5" />
                        </button>
                    )}

                    <div className="relative z-10">
                        <div className={cn("flex items-center gap-4", isSecondaryAccount ? "mb-3" : "mb-4")}>
                            <div className={cn("bg-white/20 rounded-2xl backdrop-blur-sm", isSecondaryAccount ? "p-2.5" : "p-3")}>
                                <Building2 className={cn("text-white", isSecondaryAccount ? "h-7 w-7" : "h-8 w-8")} />
                            </div>
                            <div>
                                <h1 className={cn("font-bold tracking-tight", isSecondaryAccount ? "text-2xl" : "text-3xl")}>Tango Gestão de Créditos</h1>
                                <p className={cn("text-primary-foreground/70 font-medium", isSecondaryAccount ? "text-sm" : "")}>Gestão Inteligente de Crédito e Cobranças</p>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <h2 className="text-xl font-semibold">
                                {step === 1 && "Bem-vindo à nova era da sua gestão!"}
                                {step === 1.5 && "Ligação ao Servidor Local"}
                                {step === 2 && "Informações de Propriedade e Suporte"}
                                {step === 3 && "Políticas de Privacidade e Proteção de Dados"}
                                {step === 4 && "Identidade da Instituição"}
                                {step === 5 && "Módulo Multi-Empresas (Multi-Tenant)"}
                                {step === 6 && "Segurança do Administrador"}
                                {step === 7 && "Pronto para Começar!"}
                            </h2>
                            <p className="text-primary-foreground/80 leading-relaxed max-w-[90%] text-sm">
                                {step === 1 && "Prepare o seu negócio de crédito para o próximo nível com ferramentas avançadas e seguras."}
                                {step === 1.5 && "Siga as instruções abaixo para conetar este computador ao servidor Master na rede Wi-Fi."}
                                {step === 2 && "Conheça a equipa por trás da tecnologia e os nossos canais de suporte."}
                                {step === 3 && "Conformidade com a Lei n.º 22/11 (Lei da Protecção de Dados Pessoais de Angola)."}
                                {step === 4 && "Como deseja que a sua empresa seja identificada nos documentos e relatórios."}
                                {step === 5 && "Escolha se deseja habilitar a criação e gestão de múltiplas empresas isoladas no sistema."}
                                {step === 6 && "Defina as credenciais de acesso para a gestão total do sistema."}
                                {step === 7 && "A configuração inicial foi concluída com sucesso. Seja bem-vindo!"}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className={cn("bg-background flex-1 min-h-0 overflow-y-auto", isSecondaryAccount ? "p-4 sm:p-6" : "p-5 sm:p-6")}>
                    {step === 1 ? (
                        <div className="space-y-8 animate-fade-in flex flex-col items-center justify-center py-4 h-full">
                            <div className="text-center space-y-2 mb-4">
                                <h3 className="text-2xl font-bold text-foreground">Como deseja configurar este computador?</h3>
                                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                                    Escolha se este será o computador principal (Servidor) ou se irá conetar-se a um já existente.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl px-4">
                                {/* Option 1: Standard Server */}
                                <button
                                    onClick={() => { setOnboardingMode('standard'); handleNext(); }}
                                    className={cn(
                                        "group flex flex-col items-center p-6 rounded-2xl border-2 transition-all text-center space-y-4 hover:shadow-xl",
                                        onboardingMode === 'standard' ? "border-primary bg-primary/5 ring-4 ring-primary/10" : "border-border hover:border-primary/40 bg-card"
                                    )}
                                >
                                    <div className="bg-primary/10 p-4 rounded-xl group-hover:scale-110 transition-transform">
                                        <Database className="h-10 w-10 text-primary" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-lg">Instalação Principal</h4>
                                        <p className="text-xs text-muted-foreground mt-1">Computador Servidor (Master). Onde os dados serão guardados fisicamente.</p>
                                    </div>
                                </button>

                                {/* Option 2: Slave Client */}
                                <button
                                    onClick={() => { setOnboardingMode('connect'); setStep(1.5); }}
                                    className={cn(
                                        "group flex flex-col items-center p-6 rounded-2xl border-2 transition-all text-center space-y-4 hover:shadow-xl",
                                        onboardingMode === 'connect' ? "border-primary bg-primary/5 ring-4 ring-primary/10" : "border-border hover:border-primary/40 bg-card"
                                    )}
                                >
                                    <div className="bg-blue-600/10 p-4 rounded-xl group-hover:scale-110 transition-transform">
                                        <Laptop className="h-10 w-10 text-blue-600" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-lg">Conetar a Servidor</h4>
                                        <p className="text-xs text-muted-foreground mt-1">Computador Cliente (Escravo). Irá buscar as configurações via rede Wi-Fi.</p>
                                    </div>
                                </button>
                            </div>

                            <div className="mt-8">
                                <Button
                                    variant="link"
                                    className="text-[10px] text-red-500 hover:text-red-700 opacity-60 hover:opacity-100 transition-opacity"
                                    onClick={async () => {
                                        if (confirm("⚠️ ATENÇÃO: Isto irá apagar COMPLETAMENTE todos os dados e reiniciar a aplicação como nova.\n\nUse esta opção apenas se estiver a ter problemas técnicos graves ou loops.\n\nDeseja continuar?")) {
                                            try {
                                                if ((window as any).electronAPI?.dbNuclearReset) {
                                                    await (window as any).electronAPI.dbNuclearReset();
                                                } else {
                                                    alert("Esta funcionalidade não está disponível nesta versão.");
                                                }
                                            } catch (e) {
                                                alert("Erro ao tentar limpar dados.");
                                            }
                                        }
                                    }}
                                >
                                    Problemas Técnicos? Fazer Reset de Fábrica
                                </Button>
                            </div>
                        </div>
                    ) : step === 1.5 ? (
                        <div className="space-y-8 animate-fade-in flex flex-col items-center justify-center py-4 h-full">
                            <div className="text-center space-y-2 mb-4 w-full max-w-md">
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-full w-fit mx-auto mb-4">
                                    <Wifi className="h-8 w-8 text-blue-600" />
                                </div>
                                <h3 className="text-2xl font-bold text-foreground">Ligar ao Servidor</h3>
                                <p className="text-muted-foreground text-sm">
                                    Introduza o IP do computador principal (rede local) ou o endereço https do servidor cloud.
                                </p>
                            </div>

                            <div className="w-full max-w-md space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="serverIp">Endereço do Servidor (IP local ou URL Cloud)</Label>
                                    <Input
                                        id="serverIp"
                                        placeholder="ex: 192.168.1.10 ou https://tango-gestao-creditos.vercel.app"
                                        value={serverIp}
                                        onChange={(e) => setServerIp(e.target.value)}
                                        className="h-12 font-mono text-center tracking-wider"
                                    />
                                </div>

                                {/^https:\/\//i.test(serverIp.trim()) && (
                                    <div className="space-y-2 animate-fade-in">
                                        <Label htmlFor="cloudTenant">NIF da Empresa (Tenant)</Label>
                                        <Input
                                            id="cloudTenant"
                                            placeholder="Ex.: 5417000000"
                                            value={cloudTenant}
                                            onChange={(e) => setCloudTenant(e.target.value)}
                                            className="h-12 text-center font-mono"
                                        />
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="onboardingPasskey">Chave de Sincronização (Passkey)</Label>
                                    <Input
                                        id="onboardingPasskey"
                                        type="password"
                                        placeholder="Introduza a chave configurada no servidor"
                                        value={syncPasskey}
                                        onChange={(e) => setSyncPasskey(e.target.value)}
                                        className="h-12 text-center"
                                    />
                                </div>

                                {/* Network Diagnostics */}
                                {localNetwork && (
                                    <div className={cn(
                                        "p-3 rounded-lg border flex items-start gap-3 text-xs",
                                        localNetwork.isPrivate
                                            ? "bg-emerald-50 border-emerald-100 text-emerald-800"
                                            : "bg-amber-50 border-amber-100 text-amber-800"
                                    )}>
                                        <div className="mt-0.5">
                                            {localNetwork.isPrivate ? <CircleCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                                        </div>
                                        <div className="space-y-1">
                                            <p className="font-bold uppercase tracking-tight">O SEU COMPUTADOR:</p>
                                            <p>IP Local: <span className="font-mono font-bold">{localNetwork.ip}</span></p>
                                            <p>Hostname: <span className="font-mono font-bold">{localNetwork.hostname}</span></p>
                                            {!localNetwork.isPrivate && (
                                                <p className="font-semibold text-amber-900 mt-1">
                                                    ⚠️ A sua rede está como "Pública". O Windows pode bloquear a ligação. Mude para "Privada" nas definições de Wi-Fi.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <Button
                                    onClick={handleConnectToServer}
                                    disabled={!serverIp || isConnecting || (/^https:\/\//i.test(serverIp.trim()) && !cloudTenant.trim())}
                                    className="w-full h-12 text-lg font-bold gap-2"
                                >
                                    {isConnecting ? (
                                        <>
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            A Conetar...
                                        </>
                                    ) : (
                                        <>
                                            <Globe className="h-5 w-5" />
                                            Validar e Conetar
                                        </>
                                    )}
                                </Button>

                                <Button
                                    variant="ghost"
                                    onClick={() => setStep(1)}
                                    className="w-full text-xs text-muted-foreground"
                                >
                                    Voltar atrás
                                </Button>
                            </div>
                        </div>
                    ) : step === 2 ? (
                        <div className="space-y-6 animate-fade-in text-sm">
                            <div className="border border-primary/20 bg-primary/5 p-4 rounded-xl">
                                <h3 className="font-bold text-lg mb-2 text-primary">Tango Gestão de Créditos</h3>
                                <p className="mb-2"><strong>Sede:</strong> Cuanza Norte, N´dalatando, Angola</p>
                                <p className="mb-2"><strong>E-mail:</strong> suporte@tangogestao.ao</p>
                                <p><strong>Suporte Técnico:</strong> (+244) 941 537 486</p>
                            </div>

                            <div className="space-y-4 text-muted-foreground">
                                <section>
                                    <h4 className="font-bold text-foreground mb-1">Fornecedor de Tecnologia</h4>
                                    <p>Atuamos estritamente como Fornecedora de Tecnologia. O sistema opera de forma local, o que significa que:</p>
                                    <ul className="list-disc pl-5 mt-1 space-y-1">
                                        <li>Não temos acesso aos dados dos seus clientes ou movimentações.</li>
                                        <li>Não armazenamos cópias das suas bases de dados.</li>
                                        <li>Nossa responsabilidade limita-se à integridade técnica do software.</li>
                                    </ul>
                                </section>

                                <section>
                                    <h4 className="font-bold text-foreground mb-1">Soberania dos Dados (Lei 22/11)</h4>
                                    <p>O utilizador (você) é o único Responsável pelo Tratamento de Dados. Toda a informação permanece no seu dispositivo.</p>
                                </section>
                            </div>
                        </div>
                    ) : step === 3 ? (
                        <div className="space-y-6 animate-fade-in h-full flex flex-col">
                            <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 shrink-0">
                                <ShieldAlert className="h-6 w-6 text-blue-600" />
                                <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">Política de Privacidade e Termos de Proteção de Dados (Angola)</p>
                            </div>

                            <div className="flex-1 overflow-y-auto p-5 border rounded-xl text-sm leading-relaxed text-muted-foreground bg-muted/20 scrollbar-thin scrollbar-thumb-primary/20 space-y-4 text-justify">
                                <section>
                                    <h4 className="font-bold text-foreground mb-1 block underline">1. Enquadramento Legal</h4>
                                    <p>Esta política é redigida em conformidade com a Lei n.º 22/11 (Lei da Protecção de Dados Pessoais de Angola) e respeita os princípios de boas práticas internacionais de privacidade.</p>
                                </section>

                                <section>
                                    <h4 className="font-bold text-foreground mb-1 block underline">2. Natureza do Tratamento: Armazenamento Local</h4>
                                    <p><strong>Privacy by Design:</strong> O tratamento e armazenamento dos dados ocorrem exclusivamente no dispositivo local.</p>
                                    <p><strong>Inexistência de Nuvem:</strong> O sistema não transmite dados para servidores externos, garantindo total controlo local.</p>
                                </section>

                                <section>
                                    <h4 className="font-bold text-foreground mb-1 block underline">3. Dados Recolhidos e Finalidade</h4>
                                    <p>Exclusivamente para gestão de créditos (Artigo 12.º da Lei 22/11): Dados de Identificação (Nome, BI, NIF) e Dados Financeiros.</p>
                                </section>

                                <section>
                                    <h4 className="font-bold text-foreground mb-1 block underline">4. Segurança e Responsabilidade</h4>
                                    <p><strong>Responsabilidade do Desenvolvedor:</strong> Garantir software sem vulnerabilidades conhecidas.</p>
                                    <p><strong>Responsabilidade do Utilizador:</strong> Segurança física, lógica e Backups Periódicos. O desenvolvedor não tem acesso remoto para recuperação.</p>
                                </section>

                                <section>
                                    <h4 className="font-bold text-foreground mb-1 block underline">5. Direitos do Titular</h4>
                                    <p>O sistema permite responder aos direitos de Informação, Acesso, Rectificação e Oposição (Artigo 28.º).</p>
                                </section>

                                <section>
                                    <h4 className="font-bold text-foreground mb-1 block underline">6. Transferência Internacional</h4>
                                    <p>O aplicativo não efectua transferência internacional de dados.</p>
                                </section>

                                <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded border border-amber-200 dark:border-amber-800 mt-4">
                                    <p className="text-amber-800 dark:text-amber-400 font-bold mb-1">Nota Importante - Suporte Nacional</p>
                                    <p className="text-xs">Como a desenvolvedora está sediada em Cuanza Norte, N´dalatando, reforçamos que o suporte é nacional. Por ser um sistema local, é ideal para zonas com internet instável, pois <strong>não depende da rede para funcionar</strong>.</p>
                                </div>
                            </div>

                            <div className="flex items-center space-x-3 p-4 bg-muted/10 rounded-xl shrink-0">
                                <Checkbox
                                    id="terms"
                                    checked={acceptedTerms}
                                    onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                                    className="data-[state=checked]:bg-primary h-5 w-5"
                                />
                                <Label
                                    htmlFor="terms"
                                    className="text-sm font-medium leading-tight cursor-pointer py-1"
                                >
                                    Li e aceito os termos da Lei n.º 22/11 e a política de responsabilidade partilhada.
                                </Label>
                            </div>
                        </div>
                    ) : step === 4 ? (
                        <div className={cn("animate-fade-in", isSecondaryAccount ? "space-y-5" : "space-y-6")}>
                            <div className={cn(
                                "grid gap-5",
                                isSecondaryAccount ? "xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.92fr)] xl:items-start" : "grid-cols-1"
                            )}>
                                <div className={cn("space-y-4", isSecondaryAccount ? "rounded-2xl border bg-card/60 p-5 shadow-sm" : "")}>
                                {isPublicWebBuild && (
                                    <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-300 dark:border-emerald-800 flex items-center gap-3.5 text-xs text-emerald-800 dark:text-emerald-300 font-semibold mb-3 shadow-sm">
                                        <div className="p-2 rounded-xl bg-emerald-500 text-white shadow-sm shrink-0">
                                            <ShieldCheck className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-black text-sm uppercase tracking-tight text-emerald-900 dark:text-emerald-200">
                                                Empresa Homologada via Tango Master Gen
                                            </p>
                                            <p className="text-[11px] opacity-90 mt-0.5">
                                                O NIF e a Razão Social foram validados pelo Administrador e vinculados à licença de uso Web.
                                            </p>
                                        </div>
                                    </div>
                                )}
                                <div className="space-y-3">
                                    <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Tipo de Contribuinte (NIF)</Label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <Button
                                            type="button"
                                            variant={nifType === 'COLECTIVO' ? 'default' : 'outline'}
                                            onClick={() => handleNifTypeChange('COLECTIVO')}
                                            className={`min-h-12 whitespace-normal px-3 text-sm font-bold leading-tight ${nifType === 'COLECTIVO' ? 'shadow-lg' : ''}`}
                                        >
                                            Pessoa Colectiva (Empresa)
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={nifType === 'SINGULAR' ? 'default' : 'outline'}
                                            onClick={() => handleNifTypeChange('SINGULAR')}
                                            className={`min-h-12 whitespace-normal px-3 text-sm font-bold leading-tight ${nifType === 'SINGULAR' ? 'shadow-lg' : ''}`}
                                        >
                                            Pessoa Singular (Individual)
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="nif" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                                        {nifType === 'COLECTIVO' ? 'NIF da Empresa' : 'NIF / Bilhete de Identidade'}
                                    </Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="nif"
                                            placeholder={nifType === 'COLECTIVO' ? "5400000000" : "000000000LA000"}
                                            value={nif}
                                            onChange={handleNifChange}
                                            className="h-12 sm:h-14 text-base sm:text-lg border-2 uppercase font-mono flex-1"
                                            readOnly={isPublicWebBuild}
                                            maxLength={nifType === 'COLECTIVO' ? 15 : 20}
                                            autoFocus
                                        />
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="icon"
                                            className="h-12 w-12 sm:h-14 sm:w-14 shrink-0"
                                            disabled={isSearchingNIF || !nif}
                                            onClick={handleSearchNIF}
                                            title="Pesquisar Dados"
                                        >
                                            {isSearchingNIF ? (
                                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                            ) : (
                                                <Search className="h-6 w-6" />
                                            )}
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="name" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                                        {nifType === 'COLECTIVO' ? 'Nome Oficial da Instituição' : 'Nome Completo'}
                                    </Label>
                                    <Input
                                        id="name"
                                        placeholder={nifType === 'COLECTIVO' ? "Ex: Micro-Finanças Luanda, Lda" : "Ex: Pedro José Morais"}
                                        value={companyName}
                                        onChange={(e) => setCompanyName(e.target.value)}
                                        readOnly={isPublicWebBuild}
                                        className="h-12 sm:h-14 text-base sm:text-lg border-2 focus-visible:ring-primary font-semibold"
                                    />
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <span className="text-primary font-bold">*</span>
                                        {nifType === 'COLECTIVO' ? 'Importante para cabeçalhos de contratos e faturas.' : 'A conta institucional será criada em seu nome.'}
                                    </p>
                                </div>
                                </div>

                                <div className="p-4 lg:p-5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl space-y-3">
                                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
                                        <ShieldAlert className="h-5 w-5" />
                                        <h4 className="font-bold text-sm">Informações sobre o NIF em Angola (AGT)</h4>
                                    </div>
                                    <div className="text-[11px] text-amber-800/80 dark:text-amber-400/80 leading-relaxed space-y-2">
                                        <p>Em Angola, o sistema de Número de Identificação Fiscal (NIF) foi simplificado e modernizado pela Administração Geral Tributária (AGT).</p>

                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
                                            <section>
                                                <h5 className="font-bold underline mb-1 uppercase">1. NIF de Pessoa Singular</h5>
                                                <p>Cidadãos Nacionais: O NIF é o mesmo número do Bilhete de Identidade (BI). Cidadãos Estrangeiros: Corresponde ao Cartão de Residente.</p>
                                            </section>
                                            <section>
                                                <h5 className="font-bold underline mb-1 uppercase">2. NIF de Pessoa Colectiva</h5>
                                                <p>Numeração sequencial de 10 dígitos. Geralmente começa com 5 (Empresa comercial) ou 7 (Instituição Estatal).</p>
                                            </section>
                                        </div>

                                        <p className="italic pt-1 border-t border-amber-200/50"><strong>Diferença Atual:</strong> Singular = BI (9 números + 2 letras + 3 números) | Colectivo = 10 números sequenciais.</p>
                                        <p className="font-medium">O seu NIF deve estar activo no sistema da AGT para emissão legal de facturas.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : step === 5 ? (
                        <div className="space-y-6 animate-fade-in py-2">
                            <div className="text-center space-y-1.5 mb-6">
                                <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 text-primary mb-2">
                                    <Building2 className="h-8 w-8" />
                                </div>
                                <h3 className="text-2xl font-bold text-foreground">Deseja ativar o Módulo Multi-Empresas?</h3>
                                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                                    Escolha se este sistema será utilizado para uma <strong>única empresa</strong> ou se deseja a capacidade de criar e gerir <strong>múltiplas empresas/contas isoladas</strong>.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Option 1: Single Company (Multi-Tenant Disabled) */}
                                <button
                                    type="button"
                                    onClick={() => setEnableMultiTenant(false)}
                                    className={cn(
                                        "relative flex flex-col items-start p-5 rounded-2xl border-2 transition-all text-left space-y-3 cursor-pointer",
                                        !enableMultiTenant 
                                            ? "border-primary bg-primary/5 ring-4 ring-primary/10 shadow-md" 
                                            : "border-border hover:border-primary/40 bg-card hover:bg-muted/30"
                                    )}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <div className={cn(
                                            "p-3 rounded-xl transition-colors",
                                            !enableMultiTenant ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                        )}>
                                            <ShieldCheck className="h-6 w-6" />
                                        </div>
                                        {!enableMultiTenant && (
                                            <div className="bg-primary/20 text-primary px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                                                <CircleCheck className="h-3.5 w-3.5" />
                                                Selecionado
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-base text-foreground">Empresa Única (Padrão)</h4>
                                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                                            Oculta a opção de multicontas na tela de login e no menu. Foco 100% exclusivo em <strong>{companyName || 'uma única empresa'}</strong>.
                                        </p>
                                    </div>
                                    <div className="pt-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                        ✓ Interface mais simples e direta
                                    </div>
                                </button>

                                {/* Option 2: Multi-Tenant Enabled */}
                                <button
                                    type="button"
                                    onClick={() => setEnableMultiTenant(true)}
                                    className={cn(
                                        "relative flex flex-col items-start p-5 rounded-2xl border-2 transition-all text-left space-y-3 cursor-pointer",
                                        enableMultiTenant 
                                            ? "border-primary bg-primary/5 ring-4 ring-primary/10 shadow-md" 
                                            : "border-border hover:border-primary/40 bg-card hover:bg-muted/30"
                                    )}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <div className={cn(
                                            "p-3 rounded-xl transition-colors",
                                            enableMultiTenant ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                        )}>
                                            <Building2 className="h-6 w-6" />
                                        </div>
                                        {enableMultiTenant && (
                                            <div className="bg-primary/20 text-primary px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                                                <CircleCheck className="h-3.5 w-3.5" />
                                                Selecionado
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-base text-foreground">Multi-Empresas (Multi-Tenant)</h4>
                                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                                            Ativa a opção <strong>"Conta de Trabalho"</strong> e <strong>"+ Adicionar Conta"</strong>, permitindo gerir várias empresas com bases de dados separadas.
                                        </p>
                                    </div>
                                    <div className="pt-2 text-[11px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                        ✓ Ideal para grupos empresariais e filiais
                                    </div>
                                </button>
                            </div>

                            {/* Direct Checkbox confirmation */}
                            <div className="rounded-xl border border-border/80 bg-muted/20 p-4 mt-4">
                                <div className="flex items-start space-x-3">
                                    <Checkbox
                                        id="multiTenantToggle"
                                        checked={enableMultiTenant}
                                        onCheckedChange={(checked) => setEnableMultiTenant(checked === true)}
                                        className="mt-0.5"
                                    />
                                    <div className="grid gap-1 leading-none">
                                        <Label
                                            htmlFor="multiTenantToggle"
                                            className="text-sm font-semibold cursor-pointer"
                                        >
                                            Habilitar suporte a múltiplas empresas no sistema
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            {enableMultiTenant 
                                                ? "O seletor de contas e a opção de criar novas empresas estarão visíveis."
                                                : "O seletor e o botão de criar novas empresas serão ocultados."} (Pode alterar mais tarde em Definições &gt; Módulos).
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : step === 6 ? (
                        <div className="space-y-6 animate-fade-in">
                            <div className="flex items-center gap-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800">
                                <UserCog className="h-6 w-6 text-amber-600" />
                                <p className="text-sm text-amber-800 dark:text-amber-300">Crie o acesso principal do <strong>Super Administrador</strong>.</p>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="adminBI" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Bilhete de Identidade (BI)</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="adminBI"
                                            placeholder="000000000LA000"
                                            value={adminBI}
                                            onChange={(e) => setAdminBI(formatNIF(e.target.value, 'SINGULAR'))}
                                            className="h-12 text-lg font-mono uppercase flex-1"
                                            maxLength={14}
                                            autoFocus
                                        />
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="icon"
                                            className="h-12 w-12 shrink-0"
                                            disabled={isAdminSearchingBI || !adminBI}
                                            onClick={handleSearchAdminBI}
                                        >
                                            {isAdminSearchingBI ? (
                                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                            ) : (
                                                <Search className="h-5 w-5" />
                                            )}
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="adminName" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Nome Completo</Label>
                                    <Input
                                        id="adminName"
                                        placeholder="Pesquise pelo BI ou digite o nome"
                                        value={adminName}
                                        onChange={(e) => setAdminName(e.target.value)}
                                        className="h-12 text-lg"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="adminEmail" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Endereço de Email</Label>
                                    <Input
                                        id="adminEmail"
                                        type="email"
                                        placeholder="gerencia@suaempresa.ao"
                                        value={adminEmail}
                                        onChange={(e) => setAdminEmail(e.target.value)}
                                        className="h-12 text-lg"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="adminUsername" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Nome de Utilizador (Opcional)</Label>
                                    <Input
                                        id="adminUsername"
                                        type="text"
                                        placeholder="admin ou superadmin"
                                        value={adminUsername}
                                        onChange={(e) => setAdminUsername(e.target.value)}
                                        className="h-12 text-lg"
                                    />
                                    <p className="text-xs text-muted-foreground">Pode usar este nome para fazer login em vez do email</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="pass" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Nova Senha</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                            <Input
                                                id="pass"
                                                type={showAdminPassword ? "text" : "password"}
                                                placeholder="••••••••"
                                                value={adminPassword}
                                                onChange={(e) => setAdminPassword(e.target.value)}
                                                className="pl-10 pr-10 h-12"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                                onClick={() => setShowAdminPassword(!showAdminPassword)}
                                            >
                                                {showAdminPassword ? (
                                                    <EyeOff className="h-5 w-5 text-muted-foreground" />
                                                ) : (
                                                    <Eye className="h-5 w-5 text-muted-foreground" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="confirmPass" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Confirmação</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                            <Input
                                                id="confirmPass"
                                                type={showAdminConfirmPassword ? "text" : "password"}
                                                placeholder="••••••••"
                                                value={adminConfirmPassword}
                                                onChange={(e) => setAdminConfirmPassword(e.target.value)}
                                                className="pl-10 pr-10 h-12"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                                onClick={() => setShowAdminConfirmPassword(!showAdminConfirmPassword)}
                                            >
                                                {showAdminConfirmPassword ? (
                                                    <EyeOff className="h-5 w-5 text-muted-foreground" />
                                                ) : (
                                                    <Eye className="h-5 w-5 text-muted-foreground" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Password Strength Indicator */}
                                <PasswordStrengthIndicator password={adminPassword} showRequirements={true} />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-fade-in flex flex-col items-center justify-center text-center py-4 h-full">
                            <div className="bg-green-100 dark:bg-green-900/20 p-6 rounded-full ring-8 ring-green-50 dark:ring-green-900/10">
                                <ShieldCheck className="h-20 w-20 text-green-600" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-3xl font-bold text-foreground">Sistema Configurado!</h3>
                                <p className="text-muted-foreground text-lg leading-relaxed">
                                    O <strong>Tango Gestão de Créditos</strong> está agora registado para <br />
                                    <span className="text-primary font-bold text-xl">{companyName}</span>.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className={cn("border-t bg-muted/10 flex flex-col shrink-0", isSecondaryAccount ? "gap-2.5 p-3.5 sm:p-4" : "gap-3 p-4 sm:p-5")}>
                    <div className="flex justify-between items-center gap-4">
                        <div className="flex gap-1.5">
                            {visibleSteps.map((s) => (
                                <div
                                    key={s}
                                    className={`h-2 rounded-full transition-all duration-300 ${step === s ? 'w-8 sm:w-10 bg-primary' : 'w-2 bg-muted'}`}
                                />
                            ))}
                        </div>

                        <div className={cn("flex-1", isSecondaryAccount ? "max-w-[300px]" : "max-w-[240px]")}>
                            {step < 7 ? (
                                <Button
                                    className={cn(
                                        "w-full gap-2.5 font-bold shadow-gold hover:scale-[1.02] active:scale-[0.98] transition-all",
                                        isSecondaryAccount ? "h-11 text-sm sm:text-base" : "h-12 text-base"
                                    )}
                                    disabled={
                                        step === 3 ? !acceptedTerms :
                                            step === 4 ? !companyName.trim() :
                                                step === 6 ? (!adminEmail || !adminPassword) : false
                                    }
                                    onClick={handleNext}
                                >
                                    {step === 1 ? 'Começar Agora' :
                                        step === 3 ? 'Aceitar e Continuar' :
                                            'Próximo Passo'}
                                    <ArrowRight className={cn(isSecondaryAccount ? "h-5 w-5" : "h-5 w-5")} />
                                </Button>
                            ) : (
                                <Button
                                    className={cn(
                                        "w-full font-bold bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all",
                                        isSecondaryAccount ? "h-11 text-sm sm:text-base" : "h-12 text-base"
                                    )}
                                    onClick={handleComplete}
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                            A Guardar...
                                        </>
                                    ) : (
                                        'Finalizar e Entrar'
                                    )}
                                </Button>
                            )}
                        </div>
                    </div>

                    <p className={cn(
                        "text-center text-muted-foreground uppercase font-medium",
                        isSecondaryAccount ? "text-[10px] tracking-[0.18em]" : "text-[10px] sm:text-xs tracking-[0.2em] pt-1"
                    )}>
                        Desenvolvido por DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, (SU), LDA | Cuanza Norte, N´dalatando
                    </p>
                </div>
            </div >

            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => {
                    setAlertConfig({ ...alertConfig, isOpen: false });
                }}
                onConfirm={alertConfig.onConfirm}
                actionLabel={alertConfig.actionLabel}
                title={alertConfig.title}
                description={alertConfig.description}
                type={alertConfig.type}
            />
        </div >
    );
};



