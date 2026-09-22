import "@/bibliotecas/suppress-warnings";
import "@/bibliotecas/crypto-polyfill";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import { DataProvider } from "@/contextos/ContextoDados";
import { AuthProvider } from "@/contextos/ContextoAutenticacao";
import { ErrorBoundary } from "@/componentes/ErrorBoundary";
import "./index.css";
import { installStructuredConsole } from "@/bibliotecas/logger-estruturado";

installStructuredConsole('tango-renderer');

if (import.meta.env.PROD && 'serviceWorker' in navigator && !(window as any).electronAPI) {
    window.addEventListener('beforeinstallprompt', (event: Event) => {
        event.preventDefault();
        (window as any).__tangoInstallPrompt = event;
        window.dispatchEvent(new CustomEvent('tango-pwa-install-ready'));
    });
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(error => {
            console.warn('[PWA] Não foi possível registar o service worker:', error);
        });
    });
}

(window as any).resetToOnboarding = async () => {
    try {
        localStorage.clear();
        sessionStorage.clear();
        if (window.indexedDB && indexedDB.databases) {
            const dbs = await indexedDB.databases();
            for (const dbInfo of dbs) {
                if (dbInfo.name) indexedDB.deleteDatabase(dbInfo.name);
            }
        }
    } catch (e) {
        console.error("Erro ao limpar dados do navegador:", e);
    }
    window.location.href = "/";
    window.location.reload();
};

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
        <AuthProvider>
            <DataProvider>
                <QueryClientProvider client={queryClient}>
                    <App />
                </QueryClientProvider>
            </DataProvider>
        </AuthProvider>
    </ErrorBoundary>
);
