import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useData } from '@/contextos/ContextoDados';
import { validateLicense } from '@/bibliotecas/licenciamento';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { SplashScreen } from '@/componentes/layout/SplashScreen';
import { differenceInDays, parseISO, isValid, isBefore, addMonths, addYears, format } from 'date-fns';

interface LicenseGuardProps {
    children: React.ReactNode;
}

export const LicenseGuard = ({ children }: LicenseGuardProps) => {
    const { companySettings, updateCompanySettings } = useData();
    const navigate = useNavigate();
    const location = useLocation();
    const [isChecking, setIsChecking] = useState(true);

    const { login, user } = useAuth();

    useEffect(() => {
        const checkLicense = async () => {
            try {
                // 1. Allow access to activation page and master module
                if (location.pathname === '/ativacao' || location.pathname.startsWith('/tango-master')) {
                    setIsChecking(false);
                    return;
                }

                // 2. IMPORTANT: In development environment (localhost/127.0.0.1 or unpackaged), immediately allow access
                const isPackaged = (window as any).electronAPI?.isPackaged;
                const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !isPackaged;
                if (IS_DEV) {
                    setIsChecking(false);
                    return;
                }

                // 3. If user is not authenticated, let ProtectedRoute handle redirection to /entrar
                if (!user) {
                    setIsChecking(false);
                    return;
                }

                // 4. Check if Onboarding is complete. If not, allow access
                const ONBOARDING_KEY = 'tango_erp_onboarding_v3';
                const hasOnboarding = localStorage.getItem(ONBOARDING_KEY);

                if (!hasOnboarding) {
                    setIsChecking(false);
                    return;
                }

                // 5. If settings not yet loaded, wait but keep checking
                if (!companySettings || (!companySettings.name && !companySettings.licenseKey)) {
                    return;
                }

                // Condition B: In production, check for valid key OR 3-day trial
                const key = companySettings.licenseKey;
                const validation = await validateLicense(key || '');

                if (validation.isValid) {
                    setIsChecking(false);
                    return;
                }

                // If license is invalid, check if we are still within the 3-day trial period
                if (companySettings.installDate) {
                    try {
                        const installDate = parseISO(companySettings.installDate);
                        const now = new Date();

                        // Proteção contra datas inválidas
                        if (!isValid(installDate)) {
                            console.warn("[LicenseGuard] Data de instalação inválida detectada. Resetando para hoje.");
                            updateCompanySettings({ installDate: new Date().toISOString() });
                            setIsChecking(false);
                            return;
                        }

                        // Proteção básica contra manipulação de relógio
                        if (installDate > now) {
                            console.warn("[LicenseGuard] Detetada potencial manipulação de relógio do sistema!");
                            // Se a data de instalação está no futuro, forçar ativação ou reset
                            setIsChecking(false);
                            navigate('/ativacao', { replace: true });
                            return;
                        }

                        const daysSinceInstall = differenceInDays(now, installDate);

                        if (daysSinceInstall < 3) {
                            console.log(`[LicenseGuard] Período de teste ativo (${3 - daysSinceInstall} dias restantes). Acesso concedido.`);
                            setIsChecking(false);
                            return;
                        }
                    } catch (e) {
                        console.error("Erro ao validar data de instalação:", e);
                    }
                } else {
                    // Fallback para instalações existentes sem data: Definir hoje e permitir 3 dias
                    console.log("[LicenseGuard] Data de instalação não encontrada. Iniciando período de teste hoje.");
                    updateCompanySettings({ installDate: new Date().toISOString() });
                    setIsChecking(false);
                    return;
                }

                // If we reach here, license is invalid AND trial period expired (or no install date)
                console.warn("Licença inválida ou expirada e período de teste concluído. Redirecionando para ativação.");
                navigate('/ativacao', { replace: true });
            } catch (error) {
                console.error("Erro crítico no LicenseGuard:", error);
            } finally {
                setIsChecking(false);
            }
        };

        checkLicense();
    }, [companySettings, navigate, location.pathname, updateCompanySettings, user]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (isChecking) {
                console.warn("LicenseGuard taking too long, forcing render.");
                setIsChecking(false);
            }
        }, 5000);
        return () => clearTimeout(timer);
    }, [isChecking]);

    if (isChecking && location.pathname !== '/ativacao') {
        return <SplashScreen />;
    }

    return <>{children}</>;
};
