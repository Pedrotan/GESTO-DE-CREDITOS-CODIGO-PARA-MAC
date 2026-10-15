import "@/bibliotecas/suppress-warnings";
import "@/bibliotecas/crypto-polyfill";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { installStructuredConsole } from "@/bibliotecas/logger-estruturado";
import { iniciarCofre } from "@/bibliotecas/cofre-segredos";

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

// Na Internet a versão web só corre em HTTPS: sem cifra, o Código de Acesso e os dados viajariam em claro e o
// navegador não oferece WebCrypto. Em HTTP só a própria máquina (desenvolvimento) e a rede local da empresa.
const httpPermitido = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i.test(window.location.hostname)
    || /\.(local|localhost|test|lan)$/i.test(window.location.hostname);
const precisaHttps = window.location.protocol === "http:" && !(window as any).electronAPI && !httpPermitido;
if (precisaHttps) window.location.replace(`https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`);

// Os segredos de sincronização são decifrados antes de carregar a aplicação: vários módulos leem-nos logo
// ao serem importados, por isso a App só é importada depois de o cofre estar aberto.
const arrancar = async () => {
    await iniciarCofre().catch(error => console.error("[Cofre] Falha ao abrir os segredos:", error));
    const [{ default: App }, { DataProvider }, { AuthProvider }, { ErrorBoundary }] = await Promise.all([
        import("./App.tsx"),
        import("@/contextos/ContextoDados"),
        import("@/contextos/ContextoAutenticacao"),
        import("@/componentes/ErrorBoundary"),
    ]);
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
};

if (!precisaHttps) void arrancar();
