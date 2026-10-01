import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export function MasterProtectedRoute({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const [authenticated, setAuthenticated] = useState<boolean | null>(null);

    useEffect(() => {
        let active = true;
        const verify = async () => {
            try {
                const isAuth = sessionStorage.getItem('tango_master_authenticated') === 'true';
                if (isAuth) {
                    if (active) setAuthenticated(true);
                    return;
                }
                if (window.electronAPI?.masterAuthStatus) {
                    const result = await window.electronAPI.masterAuthStatus();
                    if (active) setAuthenticated(Boolean(result?.authenticated));
                } else {
                    if (active) setAuthenticated(false);
                }
            } catch {
                if (active) setAuthenticated(false);
            }
        };
        void verify();
        const timer = window.setInterval(verify, 60_000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, []);

    if (authenticated === null) return <div className="flex min-h-svh items-center justify-center bg-slate-950 text-slate-300">A validar sessão segura…</div>;
    if (!authenticated) {
        const loginPath = location.pathname.startsWith('/tango-master') ? '/tango-master' : '/login';
        return <Navigate to={loginPath} replace />;
    }
    return <>{children}</>;
}
