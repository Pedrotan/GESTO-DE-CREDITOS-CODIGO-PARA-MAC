import { useData } from "@/contextos/ContextoDados";
import { useAuth } from "@/contextos/ContextoAutenticacao";
import { ShieldAlert, Construction } from "lucide-react";
import { Button } from "@/componentes/ui/button";

export function MaintenanceGuard({ children }: { children: React.ReactNode }) {
    const { companySettings } = useData();
    const { user } = useAuth();
    const isMaintenanceMode = companySettings?.maintenanceMode;
    const isSuperAdmin = user?.role === 'super_admin';

    // Allow access if:
    // 1. Not in maintenance mode
    // 2. User is super admin
    // 3. Current route matches an allowed module during maintenance
    // 3. Current route matches an allowed module during maintenance
    let allowedModules: string[] = [];
    try {
        const parsed = companySettings?.allowedModulesDuringMaintenance ? JSON.parse(companySettings.allowedModulesDuringMaintenance as string) : [];
        if (Array.isArray(parsed)) {
            allowedModules = parsed;
        }
    } catch (e) {
        allowedModules = [];
    }
    const currentPath = window.location.hash.replace('#', '');

    const isAllowedModule = allowedModules.some((modId: string) => {
        if (modId === 'dashboard' && (currentPath === '/' || currentPath === '')) return true;
        return currentPath.startsWith('/' + modId) || currentPath === modId;
    });

    if (isMaintenanceMode && !isSuperAdmin && !isAllowedModule) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
                <div className="mb-6 p-6 bg-amber-500/10 rounded-full animate-pulse">
                    <Construction className="h-16 w-16 text-amber-500" />
                </div>
                <h1 className="text-3xl font-bold mb-2 text-foreground">Sistema em Manutenção</h1>
                <p className="text-muted-foreground max-w-md mb-8">
                    O sistema está temporariamente indisponível para atualizações programadas.
                    No entanto, alguns módulos podem permanecer ativos.
                </p>
                <div className="flex flex-col gap-2 border p-4 rounded-lg bg-card max-w-xs w-full">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <ShieldAlert className="h-4 w-4" />
                        Acesso Administrativo
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                        Se é um Super Administrador, pode fazer login para gerir o sistema.
                    </p>
                    <Button
                        variant="outline"
                        onClick={() => window.location.hash = '/login'}
                    >
                        Login de Administrador
                    </Button>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}

