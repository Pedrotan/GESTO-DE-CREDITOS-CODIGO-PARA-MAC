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

// Com a ligação lenta ou cortada, um ficheiro da aplicação pode não chegar e a página ficava para sempre em «A preparar
// o sistema». Recarrega sozinha até 3 vezes (cada vez mais devagar); depois explica e deixa recarregar à mão.
const TENTATIVAS_ARRANQUE = 'tango_arranque_tentativas';
const avisoArranque = (texto: string, botao: boolean) => {
    const mensagem = document.querySelector('.tango-skeleton-message');
    if (!mensagem) return;
    mensagem.textContent = texto;
    if (botao && !document.getElementById('tango-arranque-recarregar')) {
        const recarregar = document.createElement('button');
        recarregar.id = 'tango-arranque-recarregar';
        recarregar.type = 'button';
        recarregar.textContent = 'Recarregar';
        recarregar.style.cssText = 'margin-top:12px;padding:8px 16px;border-radius:10px;border:0;background:#0f172a;color:#fff;font-weight:700;cursor:pointer';
        recarregar.addEventListener('click', () => { sessionStorage.removeItem(TENTATIVAS_ARRANQUE); window.location.reload(); });
        mensagem.after(recarregar);
    }
};

if (!precisaHttps) {
    arrancar().then(() => sessionStorage.removeItem(TENTATIVAS_ARRANQUE)).catch(error => {
        console.error('[Arranque] A aplicação não carregou:', error);
        const tentativas = Number(sessionStorage.getItem(TENTATIVAS_ARRANQUE) || 0);
        if (tentativas < 3) {
            sessionStorage.setItem(TENTATIVAS_ARRANQUE, String(tentativas + 1));
            avisoArranque('A ligação à Internet está lenta. A tentar de novo…', false);
            setTimeout(() => window.location.reload(), 3_000 * (tentativas + 1));
        } else {
            avisoArranque('Não foi possível carregar o sistema: a ligação à Internet está muito lenta ou foi interrompida. Verifique a ligação e carregue em «Recarregar».', true);
        }
    });
}
